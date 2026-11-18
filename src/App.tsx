import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { ConfirmSendModal } from './components/ConfirmSendModal';
import { ComposeView } from './components/ComposeView';
import { DispatchView } from './components/DispatchView';
import { HistoryView } from './components/HistoryView';
import { RecipientsView } from './components/RecipientsView';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import {
  getGmailAccessToken,
  initGmailAuth,
  sendViaGmailApi,
  signInWithGmail,
  signOutGmail,
} from './lib/gmailAuth';
import type {
  CampaignRun,
  DeliveryProvider,
  DeliveryResult,
  EmailTemplate,
  NavSection,
  RecipientRecord,
  SmtpConfig,
  WorkbookState,
} from './types/campaign';
import {
  chunkArray,
  computeBackoffMs,
  estimateRemainingDuration,
  isAuthExpiredError,
  isRetryableDeliveryError,
  selectDispatchTargets,
} from './utils/batchPlanner';
import {
  downloadSampleExcelTemplate,
  exportDeliveryReportXlsx,
  generateLargeSampleRows,
  parseWorkbookArrayBuffer,
  SAMPLE_HEADERS,
  SAMPLE_ROWS,
} from './utils/excelParser';
import {
  compileVisualEmailToHtml,
  createCustomerUpdatePreset,
} from './utils/emailBuilder';
import {
  buildRecipients,
  detectEmailColumn,
  encodeGmailMimeMessage,
  plainTextToHtml,
  renderTemplate,
} from './utils/mailMerge';

const HISTORY_STORAGE_KEY = 'sheetmail_campaign_history_v1';

const DEFAULT_VISUAL_DESIGN = createCustomerUpdatePreset();

const DEFAULT_TEMPLATE: EmailTemplate = {
  subject: '{{FirstName}}, your {{Company}} account update ({{OfferCode}})',
  body: compileVisualEmailToHtml(DEFAULT_VISUAL_DESIGN),
  isHtml: true,
  composeMode: 'visual',
  visualDesign: DEFAULT_VISUAL_DESIGN,
  attachments: [],
  replyTo: '',
};

const DEFAULT_SMTP_CONFIG: SmtpConfig = {
  host: 'email-smtp.us-east-1.amazonaws.com',
  port: 587,
  secure: false,
  user: '',
  pass: '',
  fromName: '',
  fromEmail: '',
};

function loadSavedHistory(): CampaignRun[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CampaignRun[]) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('recipients');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [workbook, setWorkbook] = useState<WorkbookState | null>(null);
  const [uploadedFileBuffer, setUploadedFileBuffer] = useState<ArrayBuffer | null>(null);
  const [emailColumn, setEmailColumn] = useState<string>('');
  const [recipients, setRecipients] = useState<RecipientRecord[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [template, setTemplate] = useState<EmailTemplate>(DEFAULT_TEMPLATE);

  const [provider, setProvider] = useState<DeliveryProvider>('gmail');
  const [gmailUser, setGmailUser] = useState<User | null>(null);
  const [gmailToken, setGmailToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [gmailFromName, setGmailFromName] = useState('');

  const [smtpConfig, setSmtpConfig] = useState<SmtpConfig>(DEFAULT_SMTP_CONFIG);
  const [delayMs, setDelayMs] = useState<number>(150);
  const [concurrency, setConcurrency] = useState<number>(3);
  const [maxEmailsPerRun, setMaxEmailsPerRun] = useState<number | null>(null);

  const [results, setResults] = useState<Record<string, DeliveryResult>>({});
  const [isSending, setIsSending] = useState(false);
  const [dispatchNotice, setDispatchNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const stopRequestedRef = useRef(false);

  const [history, setHistory] = useState<CampaignRun[]>(() => loadSavedHistory());

  useEffect(() => {
    const unsubscribe = initGmailAuth(
      (user, token) => {
        setGmailUser(user);
        setGmailToken(token);
      },
      (user) => {
        setGmailUser(user);
        setGmailToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    try {
      // Strip heavy row arrays for runs >200 rows before writing to localStorage so 3000+ campaigns never overflow quota
      const compact = history.slice(0, 20).map((run) =>
        (run.rows?.length ?? 0) > 200
          ? {
              ...run,
              headers: undefined,
              rows: undefined,
              results: undefined,
            }
          : run
      );
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(compact));
    } catch {
      // Ignore storage quota issues
    }
  }, [history]);

  const applyWorkbookState = (nextWorkbook: WorkbookState) => {
    const detectedCol =
      detectEmailColumn(nextWorkbook.headers, nextWorkbook.rawRows) ??
      nextWorkbook.headers[0] ??
      '';
    const nextRecipients = detectedCol
      ? buildRecipients(nextWorkbook.rawRows, detectedCol)
      : [];

    setWorkbook(nextWorkbook);
    setEmailColumn(detectedCol);
    setRecipients(nextRecipients);
    setResults({});
    setDispatchNotice(null);
  };

  const handleUploadFile = async (file: File) => {
    setIsParsing(true);
    setParseError(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseWorkbookArrayBuffer(buffer, file.name);
      if (parsed.headers.length === 0 || parsed.rawRows.length === 0) {
        throw new Error('The selected sheet has no header columns or data rows.');
      }
      setUploadedFileBuffer(buffer);
      applyWorkbookState(parsed);
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Unable to parse spreadsheet file.'
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleSelectSheet = (sheetName: string) => {
    if (!uploadedFileBuffer || !workbook) return;
    setParseError(null);
    try {
      const parsed = parseWorkbookArrayBuffer(
        uploadedFileBuffer,
        workbook.fileName,
        sheetName
      );
      if (parsed.headers.length === 0 || parsed.rawRows.length === 0) {
        throw new Error(`Sheet "${sheetName}" is empty.`);
      }
      applyWorkbookState(parsed);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Unable to switch sheet.');
    }
  };

  const handleChangeEmailColumn = (col: string) => {
    if (!workbook) return;
    setEmailColumn(col);
    setRecipients(buildRecipients(workbook.rawRows, col));
    setResults({});
  };

  const handleLoadSample = () => {
    setParseError(null);
    setUploadedFileBuffer(null);
    applyWorkbookState({
      fileName: 'sample-outreach-list.xlsx',
      sheetNames: ['Recipients'],
      activeSheet: 'Recipients',
      headers: SAMPLE_HEADERS,
      rawRows: SAMPLE_ROWS,
    });
    setTemplate(DEFAULT_TEMPLATE);
  };

  const handleLoadLargeSample = () => {
    setParseError(null);
    setUploadedFileBuffer(null);
    applyWorkbookState({
      fileName: 'bulk-3000-recipients.xlsx',
      sheetNames: ['Recipients'],
      activeSheet: 'Recipients',
      headers: SAMPLE_HEADERS,
      rawRows: generateLargeSampleRows(3000),
    });
    setTemplate(DEFAULT_TEMPLATE);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      handleLoadSample();
    } else if (params.get('autostart') === '3000') {
      handleLoadLargeSample();
    }
  }, []);

  const handleToggleRecipient = (id: string) => {
    setRecipients((prev) =>
      prev.map((rec) =>
        rec.id === id && rec.validity !== 'invalid'
          ? { ...rec, included: !rec.included }
          : rec
      )
    );
  };

  const handleToggleAllValid = (include: boolean) => {
    setRecipients((prev) =>
      prev.map((rec) =>
        rec.validity === 'valid' ? { ...rec, included: include } : rec
      )
    );
  };

  const selectedRecipients = useMemo(
    () => recipients.filter((r) => r.included),
    [recipients]
  );

  const nextBatchTargets = useMemo(
    () =>
      selectDispatchTargets({
        recipients: selectedRecipients,
        results,
        mode: 'pending_only',
        maxEmailsPerRun,
      }),
    [selectedRecipients, results, maxEmailsPerRun]
  );

  const handleSignInGmail = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const res = await signInWithGmail();
      setGmailUser(res.user);
      setGmailToken(res.accessToken);
      setDispatchNotice(null);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Google sign-in was cancelled or failed.'
      );
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOutGmail = async () => {
    await signOutGmail();
    setGmailUser(null);
    setGmailToken(null);
  };

  const isGmailReady = Boolean(gmailUser && (gmailToken || getGmailAccessToken()));
  const effectiveSmtpFrom = smtpConfig.fromEmail.trim() || smtpConfig.user.trim();
  const isSmtpReady = Boolean(
    smtpConfig.host.trim() &&
      smtpConfig.port > 0 &&
      smtpConfig.user.trim() &&
      effectiveSmtpFrom.includes('@') &&
      smtpConfig.pass
  );
  const effectiveBodyTemplate =
    template.composeMode === 'visual'
      ? compileVisualEmailToHtml(template.visualDesign)
      : template.body;
  const effectiveIsHtml = template.composeMode === 'visual' ? true : template.isHtml;

  const canSend =
    nextBatchTargets.length > 0 &&
    Boolean(template.subject.trim()) &&
    Boolean(effectiveBodyTemplate.trim()) &&
    (provider === 'gmail' ? isGmailReady : isSmtpReady);

  const senderLabel =
    provider === 'gmail'
      ? gmailUser?.email || 'Not signed in'
      : smtpConfig.user || smtpConfig.host || 'Not configured';

  const firstSampleRecipient = nextBatchTargets[0] ?? selectedRecipients[0] ?? null;
  const sampleRenderedSubject = firstSampleRecipient
    ? renderTemplate(template.subject, firstSampleRecipient.data).output
    : template.subject;

  const modalEta = useMemo(
    () =>
      estimateRemainingDuration(
        nextBatchTargets.length,
        delayMs,
        concurrency,
        provider === 'smtp' ? 120 : 220
      ),
    [nextBatchTargets.length, delayMs, concurrency, provider]
  );

  const runDispatch = async (targets: RecipientRecord[]) => {
    if (!workbook || targets.length === 0) return;

    const activeToken = getGmailAccessToken() ?? gmailToken;
    if (provider === 'gmail' && !activeToken) {
      setAuthError('Please sign in with Google before sending via Gmail.');
      return;
    }

    stopRequestedRef.current = false;
    setDispatchNotice(null);
    setIsSending(true);
    let authExpiredFlag = false;
    let fatalNoticeMessage: string | null = null;

    const dispatchAttachments = template.attachments.map((att) => ({
      filename: att.filename,
      contentType: att.contentType,
      base64Content: att.base64Content,
    }));

    const workingResults: Record<string, DeliveryResult> = { ...results };
    for (const target of targets) {
      workingResults[target.id] = {
        recipientId: target.id,
        email: target.email,
        status: 'pending',
      };
    }
    setResults({ ...workingResults });

    if (provider === 'smtp') {
      // High-throughput pooled SMTP batch chunks (25 per chunk)
      const chunks = chunkArray(targets, 25);
      for (const chunk of chunks) {
        if (stopRequestedRef.current || fatalNoticeMessage) break;

        for (const t of chunk) {
          workingResults[t.id] = {
            recipientId: t.id,
            email: t.email,
            status: 'sending',
          };
        }
        setResults({ ...workingResults });

        const payloadMessages = chunk.map((target) => {
          const renderedSubject =
            renderTemplate(template.subject, target.data).output.trim() || '(No Subject)';
          const renderedBody = renderTemplate(effectiveBodyTemplate, target.data).output;
          return {
            recipientId: target.id,
            to: target.email,
            replyTo: template.replyTo,
            subject: renderedSubject,
            text: effectiveIsHtml ? undefined : renderedBody,
            html: effectiveIsHtml ? renderedBody : plainTextToHtml(renderedBody),
          };
        });

        try {
          const resp = await fetch('/api/smtp/send-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              config: smtpConfig,
              concurrency,
              delayMs,
              attachments: dispatchAttachments.length > 0 ? dispatchAttachments : undefined,
              messages: payloadMessages,
            }),
          });

          const data = (await resp.json()) as {
            ok: boolean;
            error?: string;
            fatalError?: string;
            results?: Array<{
              recipientId: string;
              ok: boolean;
              messageId?: string;
              error?: string;
              sentAt: string;
            }>;
          };

          if (data.fatalError) {
            fatalNoticeMessage = data.fatalError;
          }

          if (!resp.ok || !data.results) {
            const chunkError = data.fatalError || data.error || `SMTP batch error (${resp.status})`;
            fatalNoticeMessage = fatalNoticeMessage ?? chunkError;
            for (const t of chunk) {
              workingResults[t.id] = {
                recipientId: t.id,
                email: t.email,
                status: 'failed',
                error: chunkError,
                sentAt: new Date().toISOString(),
              };
            }
          } else {
            const returnedIds = new Set<string>();
            for (const item of data.results) {
              returnedIds.add(item.recipientId);
              const target = chunk.find((c) => c.id === item.recipientId);
              workingResults[item.recipientId] = {
                recipientId: item.recipientId,
                email: target?.email ?? '',
                status: item.ok ? 'sent' : 'failed',
                messageId: item.messageId,
                error: item.error,
                sentAt: item.sentAt,
              };
            }
            // Any remaining targets in the chunk skipped due to fatalError stay pending for resume
            for (const t of chunk) {
              if (!returnedIds.has(t.id)) {
                workingResults[t.id] = {
                  recipientId: t.id,
                  email: t.email,
                  status: 'pending',
                };
              }
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Network error sending SMTP batch.';
          fatalNoticeMessage = msg;
          for (const t of chunk) {
            workingResults[t.id] = {
              recipientId: t.id,
              email: t.email,
              status: 'failed',
              error: msg,
              sentAt: new Date().toISOString(),
            };
          }
        }

        setResults({ ...workingResults });
      }
    } else {
      // Gmail API parallel worker pool with automatic exponential backoff and 401 pause-resume
      let cursor = 0;
      let uiSyncCounter = 0;
      let authExpired = false;

      const sendSingleGmailWithRetry = async (target: RecipientRecord) => {
        const renderedSubject =
          renderTemplate(template.subject, target.data).output.trim() || '(No Subject)';
        const renderedBody = renderTemplate(effectiveBodyTemplate, target.data).output;
        const rawMime = encodeGmailMimeMessage({
          from: gmailUser?.email ?? undefined,
          fromName: gmailFromName,
          to: target.email,
          replyTo: template.replyTo,
          subject: renderedSubject,
          body: renderedBody,
          isHtml: effectiveIsHtml,
          attachments: dispatchAttachments,
        });

        const maxAttempts = 3;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          if (stopRequestedRef.current) return;
          try {
            const res = await sendViaGmailApi(activeToken!, rawMime);
            workingResults[target.id] = {
              recipientId: target.id,
              email: target.email,
              status: 'sent',
              messageId: res.id,
              sentAt: new Date().toISOString(),
              attempts: attempt + 1,
            };
            return;
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Delivery failed';
            if (isAuthExpiredError(message)) {
              authExpired = true;
              stopRequestedRef.current = true;
              workingResults[target.id] = {
                recipientId: target.id,
                email: target.email,
                status: 'pending',
              };
              return;
            }
            if (attempt < maxAttempts - 1 && isRetryableDeliveryError(message)) {
              await new Promise((resolve) => setTimeout(resolve, computeBackoffMs(attempt)));
              continue;
            }
            workingResults[target.id] = {
              recipientId: target.id,
              email: target.email,
              status: 'failed',
              error: message,
              sentAt: new Date().toISOString(),
              attempts: attempt + 1,
            };
            return;
          }
        }
      };

      const gmailWorker = async () => {
        while (cursor < targets.length && !stopRequestedRef.current) {
          const idx = cursor;
          cursor += 1;
          const target = targets[idx];

          workingResults[target.id] = {
            recipientId: target.id,
            email: target.email,
            status: 'sending',
          };
          uiSyncCounter += 1;
          if (uiSyncCounter % Math.max(1, concurrency) === 0 || targets.length <= 50) {
            setResults({ ...workingResults });
          }

          await sendSingleGmailWithRetry(target);

          uiSyncCounter += 1;
          if (uiSyncCounter % Math.max(1, concurrency) === 0 || targets.length <= 50) {
            setResults({ ...workingResults });
          }

          if (delayMs > 0 && cursor < targets.length && !stopRequestedRef.current) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(concurrency, targets.length) }, () => gmailWorker())
      );
      setResults({ ...workingResults });

      if (authExpired) {
        authExpiredFlag = true;
        setGmailToken(null);
        setDispatchNotice(
          'Google authorization expired mid-campaign. Click "Sign in with Google" and then "Resume Remaining" to continue without duplicates.'
        );
      }
    }

    setIsSending(false);

    let sentCount = 0;
    let failedCount = 0;
    let firstFailureError: string | undefined;
    for (const r of selectedRecipients) {
      const outcome = workingResults[r.id];
      if (outcome?.status === 'sent') sentCount += 1;
      else if (outcome?.status === 'failed') {
        failedCount += 1;
        if (!firstFailureError && outcome.error) {
          firstFailureError = outcome.error;
        }
      }
    }

    if (fatalNoticeMessage) {
      setDispatchNotice(fatalNoticeMessage);
    } else if (stopRequestedRef.current && !authExpiredFlag) {
      setDispatchNotice(
        'Campaign paused. Click "Resume Remaining" anytime to continue from where you stopped.'
      );
    } else if (!authExpiredFlag && failedCount > 0) {
      setDispatchNotice(
        firstFailureError
          ? `${failedCount.toLocaleString()} ${failedCount === 1 ? 'email' : 'emails'} failed: ${firstFailureError}`
          : `${failedCount.toLocaleString()} emails failed. Inspect Delivery Details below.`
      );
    }

    const newRun: CampaignRun = {
      id: `run-${Date.now()}`,
      createdAt: new Date().toISOString(),
      fileName: workbook.fileName,
      sheetName: workbook.activeSheet,
      provider,
      senderLabel,
      subject: template.subject,
      body: effectiveBodyTemplate,
      isHtml: effectiveIsHtml,
      totalTargeted: selectedRecipients.length,
      sentCount,
      failedCount,
      headers: workbook.headers,
      rows: workbook.rawRows,
      results: workingResults,
    };

    setHistory((prev) => [newRun, ...prev]);
  };

  const handleConfirmSend = () => {
    setConfirmOpen(false);
    void runDispatch(nextBatchTargets);
  };

  const handleRetryFailed = () => {
    const failedTargets = selectDispatchTargets({
      recipients: selectedRecipients,
      results,
      mode: 'failed_only',
      maxEmailsPerRun: null,
    });
    void runDispatch(failedTargets);
  };

  const handleSendTestEmail = async (
    testTo: string
  ): Promise<{ ok: boolean; message: string }> => {
    const cleanTo = testTo.trim();
    if (!cleanTo || !cleanTo.includes('@')) {
      return { ok: false, message: 'Enter a valid recipient email address for the test email.' };
    }
    const sampleData = firstSampleRecipient?.data ?? {};
    const renderedSubject =
      renderTemplate(template.subject, sampleData).output.trim() || '(No Subject)';
    const renderedBody = renderTemplate(effectiveBodyTemplate, sampleData).output;
    const dispatchAttachments = template.attachments.map((att) => ({
      filename: att.filename,
      contentType: att.contentType,
      base64Content: att.base64Content,
    }));

    if (provider === 'gmail') {
      const activeToken = getGmailAccessToken() ?? gmailToken;
      if (!activeToken) {
        return { ok: false, message: 'Please sign in with Google first.' };
      }
      try {
        const rawMime = encodeGmailMimeMessage({
          from: gmailUser?.email ?? undefined,
          fromName: gmailFromName,
          to: cleanTo,
          replyTo: template.replyTo,
          subject: `[TEST] ${renderedSubject}`,
          body: renderedBody,
          isHtml: effectiveIsHtml,
          attachments: dispatchAttachments,
        });
        const res = await sendViaGmailApi(activeToken, rawMime);
        return {
          ok: true,
          message: `Test email sent to ${cleanTo} via Gmail (ID: ${res.id}).`,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Failed to send test email via Gmail.',
        };
      }
    }

    try {
      const resp = await fetch('/api/smtp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: smtpConfig,
          message: {
            to: cleanTo,
            replyTo: template.replyTo,
            subject: `[TEST] ${renderedSubject}`,
            text: effectiveIsHtml ? undefined : renderedBody,
            html: effectiveIsHtml ? renderedBody : plainTextToHtml(renderedBody),
            attachments: dispatchAttachments.length > 0 ? dispatchAttachments : undefined,
          },
        }),
      });
      const data = (await resp.json()) as { ok: boolean; messageId?: string; error?: string };
      if (!resp.ok || !data.ok) {
        return { ok: false, message: data.error || `SMTP error (${resp.status})` };
      }
      return {
        ok: true,
        message: `Test email sent to ${cleanTo} via SMTP (ID: ${data.messageId ?? 'ok'}).`,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Network error sending test email.',
      };
    }
  };

  const handleExportCurrentReport = () => {
    if (!workbook) return;
    exportDeliveryReportXlsx(
      workbook.headers,
      workbook.rawRows,
      results,
      template.subject || workbook.fileName
    );
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        totalRows={recipients.length}
        selectedCount={selectedRecipients.length}
        fileName={workbook?.fileName ?? null}
        historyCount={history.length}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activeSection={activeSection}
          fileName={workbook?.fileName ?? null}
          selectedCount={nextBatchTargets.length > 0 ? nextBatchTargets.length : selectedRecipients.length}
          isSending={isSending}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onNavigate={setActiveSection}
          onOpenConfirmSend={() => setConfirmOpen(true)}
          canSend={canSend}
        />

        <main className="flex-1 p-4 sm:p-8 max-w-[1440px] w-full mx-auto">
          {activeSection === 'recipients' && (
            <RecipientsView
              workbook={workbook}
              emailColumn={emailColumn}
              recipients={recipients}
              isParsing={isParsing}
              parseError={parseError}
              onUploadFile={handleUploadFile}
              onSelectSheet={handleSelectSheet}
              onChangeEmailColumn={handleChangeEmailColumn}
              onLoadSample={handleLoadSample}
              onLoadLargeSample={handleLoadLargeSample}
              onDownloadSampleTemplate={downloadSampleExcelTemplate}
              onToggleRecipient={handleToggleRecipient}
              onToggleAllValid={handleToggleAllValid}
              onProceedToCompose={() => setActiveSection('compose')}
            />
          )}

          {activeSection === 'compose' && (
            <ComposeView
              headers={workbook?.headers ?? []}
              recipients={recipients}
              template={template}
              onChangeTemplate={setTemplate}
              onProceedToDispatch={() => setActiveSection('dispatch')}
              onBackToRecipients={() => setActiveSection('recipients')}
            />
          )}

          {activeSection === 'dispatch' && (
            <DispatchView
              provider={provider}
              onChangeProvider={setProvider}
              gmailUser={gmailUser}
              gmailToken={gmailToken}
              isAuthenticating={isAuthenticating}
              authError={authError}
              onSignInGmail={handleSignInGmail}
              onSignOutGmail={handleSignOutGmail}
              gmailFromName={gmailFromName}
              onChangeGmailFromName={setGmailFromName}
              smtpConfig={smtpConfig}
              onChangeSmtpConfig={setSmtpConfig}
              delayMs={delayMs}
              onChangeDelayMs={setDelayMs}
              concurrency={concurrency}
              onChangeConcurrency={setConcurrency}
              maxEmailsPerRun={maxEmailsPerRun}
              onChangeMaxEmailsPerRun={setMaxEmailsPerRun}
              recipients={recipients}
              template={template}
              results={results}
              isSending={isSending}
              dispatchNotice={dispatchNotice}
              onRequestSend={() => setConfirmOpen(true)}
              onStopSending={() => {
                stopRequestedRef.current = true;
              }}
              onRetryFailed={handleRetryFailed}
              onResetQueue={() => {
                setResults({});
                setDispatchNotice(null);
              }}
              onExportReport={handleExportCurrentReport}
              onSendTestEmail={handleSendTestEmail}
            />
          )}

          {activeSection === 'history' && (
            <HistoryView
              runs={history}
              onExportRunReport={(run) => {
                if (run.headers && run.rows && run.results) {
                  exportDeliveryReportXlsx(run.headers, run.rows, run.results, run.subject);
                }
              }}
              onReuseTemplate={(run) => {
                const matchesVisual =
                  run.isHtml && run.body === compileVisualEmailToHtml(template.visualDesign);
                setTemplate({
                  subject: run.subject,
                  body: run.body,
                  isHtml: run.isHtml,
                  composeMode: matchesVisual ? 'visual' : run.isHtml ? 'html' : 'text',
                  visualDesign: template.visualDesign,
                  attachments: template.attachments,
                  replyTo: template.replyTo,
                });
                setActiveSection('compose');
              }}
              onClearHistory={() => setHistory([])}
            />
          )}
        </main>
      </div>

      <ConfirmSendModal
        open={confirmOpen}
        recipientCount={nextBatchTargets.length}
        totalSelectedCount={selectedRecipients.length}
        provider={provider}
        senderLabel={senderLabel}
        sampleRecipientEmail={firstSampleRecipient?.email ?? ''}
        sampleSubject={sampleRenderedSubject}
        estimatedDuration={modalEta.formatted}
        concurrency={concurrency}
        onConfirm={handleConfirmSend}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
