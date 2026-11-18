import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Loader2,
  LogOut,
  Mail,
  Pause,
  Play,
  RotateCcw,
  Send,
  Server,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type {
  DeliveryProvider,
  DeliveryResult,
  EmailTemplate,
  RecipientRecord,
  SmtpConfig,
} from '../types/campaign';
import { estimateRemainingDuration, selectDispatchTargets } from '../utils/batchPlanner';
import { compileVisualEmailToHtml } from '../utils/emailBuilder';

interface DispatchViewProps {
  provider: DeliveryProvider;
  onChangeProvider: (provider: DeliveryProvider) => void;
  gmailUser: User | null;
  gmailToken: string | null;
  isAuthenticating: boolean;
  authError: string | null;
  onSignInGmail: () => void;
  onSignOutGmail: () => void;
  gmailFromName: string;
  onChangeGmailFromName: (name: string) => void;
  smtpConfig: SmtpConfig;
  onChangeSmtpConfig: (next: SmtpConfig) => void;
  delayMs: number;
  onChangeDelayMs: (ms: number) => void;
  concurrency: number;
  onChangeConcurrency: (workers: number) => void;
  maxEmailsPerRun: number | null;
  onChangeMaxEmailsPerRun: (limit: number | null) => void;
  recipients: RecipientRecord[];
  template: EmailTemplate;
  results: Record<string, DeliveryResult>;
  isSending: boolean;
  dispatchNotice: string | null;
  onRequestSend: () => void;
  onStopSending: () => void;
  onRetryFailed: () => void;
  onResetQueue: () => void;
  onExportReport: () => void;
  onSendTestEmail: (testTo: string) => Promise<{ ok: boolean; message: string }>;
}

type QueueStatusFilter = 'all' | 'queued' | 'sent' | 'failed';

const SMTP_PRESETS: Array<{ label: string; host: string; port: number; secure: boolean }> = [
  { label: 'Amazon SES', host: 'email-smtp.us-east-1.amazonaws.com', port: 587, secure: false },
  { label: 'SendGrid', host: 'smtp.sendgrid.net', port: 587, secure: false },
  { label: 'Mailgun', host: 'smtp.mailgun.org', port: 587, secure: false },
  { label: 'Brevo', host: 'smtp-relay.brevo.com', port: 587, secure: false },
  { label: 'Gmail SMTP', host: 'smtp.gmail.com', port: 465, secure: true },
  { label: 'Outlook / 365', host: 'smtp.office365.com', port: 587, secure: false },
];

export function DispatchView({
  provider,
  onChangeProvider,
  gmailUser,
  gmailToken,
  isAuthenticating,
  authError,
  onSignInGmail,
  onSignOutGmail,
  gmailFromName,
  onChangeGmailFromName,
  smtpConfig,
  onChangeSmtpConfig,
  delayMs,
  onChangeDelayMs,
  concurrency,
  onChangeConcurrency,
  maxEmailsPerRun,
  onChangeMaxEmailsPerRun,
  recipients,
  template,
  results,
  isSending,
  dispatchNotice,
  onRequestSend,
  onStopSending,
  onRetryFailed,
  onResetQueue,
  onExportReport,
  onSendTestEmail,
}: DispatchViewProps) {
  const [smtpVerifyState, setSmtpVerifyState] = useState<{
    status: 'idle' | 'verifying' | 'ok' | 'error';
    message?: string;
  }>({ status: 'idle' });
  const [testToEmail, setTestToEmail] = useState('');
  const [testConfirmOpen, setTestConfirmOpen] = useState(false);
  const [testSendState, setTestSendState] = useState<{
    status: 'idle' | 'sending' | 'ok' | 'error';
    message?: string;
  }>({ status: 'idle' });
  const [queueFilter, setQueueFilter] = useState<QueueStatusFilter>('all');
  const [queuePage, setQueuePage] = useState(1);
  const queuePageSize = 50;

  const selectedRecipients = useMemo(
    () => recipients.filter((r) => r.included),
    [recipients]
  );

  const metrics = useMemo(() => {
    let sent = 0;
    let failed = 0;
    let sending = 0;
    let queued = 0;
    for (const r of selectedRecipients) {
      const status = results[r.id]?.status;
      if (status === 'sent') sent += 1;
      else if (status === 'failed') failed += 1;
      else if (status === 'sending') sending += 1;
      else queued += 1;
    }
    const remaining = selectedRecipients.length - sent;
    const pct =
      selectedRecipients.length > 0
        ? Math.round(((sent + failed) / selectedRecipients.length) * 100)
        : 0;
    return { sent, failed, sending, queued, remaining, pct };
  }, [selectedRecipients, results]);

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

  const eta = useMemo(
    () =>
      estimateRemainingDuration(
        nextBatchTargets.length,
        delayMs,
        concurrency,
        provider === 'smtp' ? 120 : 220
      ),
    [nextBatchTargets.length, delayMs, concurrency, provider]
  );

  const filteredQueue = useMemo(() => {
    if (queueFilter === 'all') return selectedRecipients;
    return selectedRecipients.filter((rec) => {
      const st = results[rec.id]?.status ?? 'pending';
      if (queueFilter === 'queued') return st === 'pending' || st === 'sending';
      return st === queueFilter;
    });
  }, [selectedRecipients, results, queueFilter]);

  const totalQueuePages = Math.max(1, Math.ceil(filteredQueue.length / queuePageSize));
  const safeQueuePage = Math.min(queuePage, totalQueuePages);

  useEffect(() => {
    setQueuePage(1);
  }, [queueFilter, selectedRecipients.length]);

  const visibleQueueRows = useMemo(() => {
    const start = (safeQueuePage - 1) * queuePageSize;
    return filteredQueue.slice(start, start + queuePageSize);
  }, [filteredQueue, safeQueuePage]);

  const isGmailReady = Boolean(gmailUser && gmailToken);
  const effectiveSmtpFrom = smtpConfig.fromEmail.trim() || smtpConfig.user.trim();
  const isSmtpReady = Boolean(
    smtpConfig.host.trim() &&
      smtpConfig.port > 0 &&
      smtpConfig.user.trim() &&
      effectiveSmtpFrom.includes('@') &&
      smtpConfig.pass
  );
  const isProviderReady = provider === 'gmail' ? isGmailReady : isSmtpReady;
  const effectiveBody =
    template.composeMode === 'visual'
      ? compileVisualEmailToHtml(template.visualDesign)
      : template.body;
  const isTemplateReady = Boolean(template.subject.trim() && effectiveBody.trim());
  const canLaunch = nextBatchTargets.length > 0 && isTemplateReady && isProviderReady;
  const isResuming = metrics.sent > 0 && nextBatchTargets.length > 0;

  useEffect(() => {
    if (!testToEmail) {
      if (provider === 'gmail' && gmailUser?.email) {
        setTestToEmail(gmailUser.email);
      } else if (provider === 'smtp' && effectiveSmtpFrom.includes('@')) {
        setTestToEmail(effectiveSmtpFrom);
      }
    }
  }, [provider, gmailUser?.email, effectiveSmtpFrom, testToEmail]);

  const handleRunTestSend = async () => {
    setTestConfirmOpen(false);
    setTestSendState({ status: 'sending' });
    const res = await onSendTestEmail(testToEmail);
    setTestSendState({
      status: res.ok ? 'ok' : 'error',
      message: res.message,
    });
  };

  const handleVerifySmtp = async () => {
    setSmtpVerifyState({ status: 'verifying' });
    try {
      const response = await fetch('/api/smtp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(smtpConfig),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setSmtpVerifyState({
          status: 'error',
          message: data.error || 'Could not connect to SMTP server.',
        });
        return;
      }
      setSmtpVerifyState({
        status: 'ok',
        message: `Connected to ${smtpConfig.host}:${smtpConfig.port}`,
      });
    } catch (err) {
      setSmtpVerifyState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Network error testing SMTP connection.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* Left: Sender Configuration */}
        <section className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Delivery Provider
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Use Gmail OAuth for small/medium runs or a pooled SMTP relay (SES, SendGrid, Mailgun, Brevo) for 3,000+ sends.
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0" role="group" aria-label="Select email delivery provider">
              <button
                type="button"
                onClick={() => onChangeProvider('gmail')}
                disabled={isSending}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  provider === 'gmail'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Gmail Account</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeProvider('smtp')}
                disabled={isSending}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  provider === 'smtp'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Server className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Custom SMTP</span>
              </button>
            </div>
          </div>

          {provider === 'gmail' ? (
            <div className="space-y-4">
              {selectedRecipients.length > 500 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <strong className="font-semibold">Gmail Daily Sending Quota Notice:</strong>{' '}
                      Standard <span className="font-mono">@gmail.com</span> accounts cap at ~500 emails/day (Google Workspace caps at ~2,000/day). For 3,000 emails in a single run, cap your batch below or switch to a pooled SMTP relay (Amazon SES, SendGrid, Brevo).
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-6">
                    <button
                      type="button"
                      onClick={() => onChangeMaxEmailsPerRun(500)}
                      className="px-2.5 py-1 rounded border border-amber-300 bg-white text-amber-900 font-medium hover:bg-amber-100"
                    >
                      Cap batch at 500
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeProvider('smtp')}
                      className="px-2.5 py-1 rounded bg-amber-900 text-white font-medium hover:bg-amber-800"
                    >
                      Switch to High-Volume SMTP
                    </button>
                  </div>
                </div>
              )}

              {isGmailReady && gmailUser ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {gmailUser.displayName || 'Google Account Connected'}
                      </div>
                      <div className="text-xs font-mono text-slate-600 truncate">
                        {gmailUser.email}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onSignOutGmail}
                    disabled={isSending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 space-y-3">
                  <p className="text-sm text-slate-700">
                    Connect your Gmail account to authorize sending personalized messages directly from your mailbox.
                  </p>
                  <button
                    type="button"
                    onClick={onSignInGmail}
                    disabled={isAuthenticating}
                    className="gsi-material-button"
                  >
                    <div className="gsi-material-button-state" />
                    <div className="gsi-material-button-content-wrapper">
                      <div className="gsi-material-button-icon">
                        <svg
                          version="1.1"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 48 48"
                          style={{ display: 'block' }}
                          aria-hidden="true"
                        >
                          <path
                            fill="#EA4335"
                            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                          />
                          <path
                            fill="#4285F4"
                            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                          />
                          <path
                            fill="#34A853"
                            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                          />
                          <path fill="none" d="M0 0h48v48H0z" />
                        </svg>
                      </div>
                      <span className="gsi-material-button-contents">
                        {isAuthenticating ? 'Connecting to Google...' : 'Sign in with Google'}
                      </span>
                    </div>
                  </button>
                  {authError && (
                    <div role="alert" className="text-xs text-red-600 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{authError}</span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="gmail-from-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Sender Display Name (Optional)
                </label>
                <input
                  id="gmail-from-name"
                  type="text"
                  value={gmailFromName}
                  onChange={(e) => onChangeGmailFromName(e.target.value)}
                  placeholder="e.g., Hardik Rabari"
                  className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-blue-600"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-slate-600 mr-1">Relay Presets:</span>
                {SMTP_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      onChangeSmtpConfig({
                        ...smtpConfig,
                        host: preset.host,
                        port: preset.port,
                        secure: preset.secure,
                      })
                    }
                    className="px-2.5 py-1 text-xs rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="sm:col-span-2">
                  <label htmlFor="smtp-host" className="block text-xs font-medium text-slate-700 mb-1">
                    SMTP Host
                  </label>
                  <input
                    id="smtp-host"
                    type="text"
                    value={smtpConfig.host}
                    onChange={(e) => onChangeSmtpConfig({ ...smtpConfig, host: e.target.value })}
                    placeholder="email-smtp.us-east-1.amazonaws.com"
                    className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 font-mono focus-visible:outline-2 focus-visible:outline-blue-600"
                  />
                </div>

                <div>
                  <label htmlFor="smtp-port" className="block text-xs font-medium text-slate-700 mb-1">
                    Port
                  </label>
                  <input
                    id="smtp-port"
                    type="number"
                    value={smtpConfig.port}
                    onChange={(e) => {
                      const nextPort = Number(e.target.value) || 587;
                      onChangeSmtpConfig({
                        ...smtpConfig,
                        port: nextPort,
                        secure: nextPort === 465,
                      });
                    }}
                    className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 font-mono tabular-nums focus-visible:outline-2 focus-visible:outline-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="smtp-user" className="block text-xs font-medium text-slate-700 mb-1">
                    SMTP Username / Sender Email
                  </label>
                  <input
                    id="smtp-user"
                    type="text"
                    value={smtpConfig.user}
                    onChange={(e) => onChangeSmtpConfig({ ...smtpConfig, user: e.target.value })}
                    placeholder="you@domain.com or SMTP key"
                    className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
                  />
                </div>

                <div>
                  <label htmlFor="smtp-pass" className="block text-xs font-medium text-slate-700 mb-1">
                    Password / API Secret
                  </label>
                  <input
                    id="smtp-pass"
                    type="password"
                    value={smtpConfig.pass}
                    onChange={(e) => onChangeSmtpConfig({ ...smtpConfig, pass: e.target.value })}
                    placeholder="SMTP password or secret key"
                    className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-end">
                <div>
                  <label htmlFor="smtp-from-email" className="block text-xs font-medium text-slate-700 mb-1">
                    Sender From Email {smtpConfig.user.trim() && !smtpConfig.user.includes('@') ? '(Required)' : '(Optional)'}
                  </label>
                  <input
                    id="smtp-from-email"
                    type="email"
                    value={smtpConfig.fromEmail}
                    onChange={(e) => onChangeSmtpConfig({ ...smtpConfig, fromEmail: e.target.value })}
                    placeholder={smtpConfig.user.includes('@') ? smtpConfig.user : 'updates@yourdomain.com'}
                    className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
                  />
                </div>

                <div>
                  <label htmlFor="smtp-from-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Sender Name (Optional)
                  </label>
                  <input
                    id="smtp-from-name"
                    type="text"
                    value={smtpConfig.fromName}
                    onChange={(e) => onChangeSmtpConfig({ ...smtpConfig, fromName: e.target.value })}
                    placeholder="Acme Growth Team"
                    className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
                  />
                </div>
              </div>

              {smtpConfig.host.toLowerCase().includes('gmail') && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs text-blue-900">
                  Gmail SMTP requires a 16-character <span className="font-semibold">Google App Password</span> (under Google Account → Security → App passwords), not your normal login password.
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smtpConfig.secure}
                      onChange={(e) =>
                        onChangeSmtpConfig({ ...smtpConfig, secure: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    <span>Use SSL/TLS (465)</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleVerifySmtp}
                    disabled={!isSmtpReady || smtpVerifyState.status === 'verifying'}
                    className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-45 whitespace-nowrap"
                  >
                    {smtpVerifyState.status === 'verifying' ? 'Testing...' : 'Test Connection'}
                  </button>
              </div>

              {smtpVerifyState.status === 'ok' && (
                <div className="flex items-center gap-2 text-xs text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{smtpVerifyState.message}</span>
                </div>
              )}
              {smtpVerifyState.status === 'error' && (
                <div role="alert" className="flex items-center gap-2 text-xs text-red-600">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{smtpVerifyState.message}</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right: High-Volume Batch Controls, Throughput & Launch */}
        <section className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-900 pb-4 border-b border-slate-200">
              High-Volume Batch Controls
            </h2>

            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-slate-700">
                  {selectedRecipients.length > 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />
                  )}
                  <span>Selected recipients</span>
                </span>
                <span className="font-mono text-xs tabular-nums text-slate-900">
                  {selectedRecipients.length.toLocaleString()} ready
                </span>
              </li>

              <li className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-slate-700">
                  {isTemplateReady ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />
                  )}
                  <span>Subject & message body</span>
                </span>
                <span className="font-mono text-xs text-slate-900">
                  {isTemplateReady ? 'Complete' : 'Incomplete'}
                </span>
              </li>

              <li className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-slate-700">
                  {isProviderReady ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />
                  )}
                  <span>Sender authenticated</span>
                </span>
                <span className="font-mono text-xs text-slate-900 truncate max-w-[160px]">
                  {isProviderReady
                    ? provider === 'gmail'
                      ? gmailUser?.email
                      : effectiveSmtpFrom
                    : 'Not connected'}
                </span>
              </li>
            </ul>

            {/* 1-Email Test Send Box */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="test-email-to" className="text-xs font-medium text-slate-700">
                  Send 1 Test Email First
                </label>
                {testConfirmOpen ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleRunTestSend()}
                      className="px-2.5 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 whitespace-nowrap"
                    >
                      Confirm Test Send
                    </button>
                    <button
                      type="button"
                      onClick={() => setTestConfirmOpen(false)}
                      className="px-2 py-1 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setTestSendState({ status: 'idle' });
                      setTestConfirmOpen(true);
                    }}
                    disabled={!isProviderReady || !isTemplateReady || !testToEmail.trim() || testSendState.status === 'sending' || isSending}
                    className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 disabled:opacity-45 whitespace-nowrap"
                  >
                    {testSendState.status === 'sending' ? 'Sending Test...' : 'Send Test'}
                  </button>
                )}
              </div>
              <input
                id="test-email-to"
                type="email"
                value={testToEmail}
                onChange={(e) => {
                  setTestConfirmOpen(false);
                  setTestToEmail(e.target.value);
                }}
                placeholder="your-email@example.com"
                className="w-full h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-blue-600"
              />
              {testSendState.status === 'ok' && (
                <div className="text-xs text-emerald-700 flex items-start gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{testSendState.message}</span>
                </div>
              )}
              {testSendState.status === 'error' && (
                <div role="alert" className="text-xs text-red-600 flex items-start gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{testSendState.message}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div>
                <label htmlFor="batch-cap-select" className="block text-xs font-medium text-slate-700 mb-1">
                  Batch Limit
                </label>
                <select
                  id="batch-cap-select"
                  value={maxEmailsPerRun === null ? 'all' : String(maxEmailsPerRun)}
                  onChange={(e) =>
                    onChangeMaxEmailsPerRun(e.target.value === 'all' ? null : Number(e.target.value))
                  }
                  disabled={isSending}
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  <option value="all">All ({metrics.remaining.toLocaleString()})</option>
                  <option value="500">500 / run</option>
                  <option value="1500">1,500 / run</option>
                  <option value="2000">2,000 / run</option>
                  <option value="3000">3,000 / run</option>
                </select>
              </div>

              <div>
                <label htmlFor="concurrency-select" className="block text-xs font-medium text-slate-700 mb-1">
                  Workers
                </label>
                <select
                  id="concurrency-select"
                  value={concurrency}
                  onChange={(e) => onChangeConcurrency(Number(e.target.value))}
                  disabled={isSending}
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  <option value={1}>1 (Sequential)</option>
                  <option value={3}>3 parallel</option>
                  <option value={5}>5 parallel</option>
                </select>
              </div>

              <div>
                <label htmlFor="throttle-select" className="block text-xs font-medium text-slate-700 mb-1">
                  Pacing Delay
                </label>
                <select
                  id="throttle-select"
                  value={delayMs}
                  onChange={(e) => onChangeDelayMs(Number(e.target.value))}
                  disabled={isSending}
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  <option value={50}>50 ms (Fast relay)</option>
                  <option value={150}>150 ms (Balanced)</option>
                  <option value={400}>400 ms (Steady)</option>
                  <option value={800}>800 ms (Safe Gmail)</option>
                  <option value={1500}>1,500 ms (Strict)</option>
                </select>
              </div>
            </div>

            {nextBatchTargets.length > 0 && (
              <div className="flex items-center justify-between text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-slate-600">
                <span>This batch: {nextBatchTargets.length.toLocaleString()} emails</span>
                <span>
                  ~{eta.emailsPerMinute}/min · Est. {eta.formatted}
                </span>
              </div>
            )}

            {dispatchNotice && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{dispatchNotice}</span>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-2.5">
            {isSending ? (
              <button
                type="button"
                onClick={onStopSending}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                <Pause className="h-4 w-4" aria-hidden="true" />
                <span>Pause Campaign ({metrics.sent.toLocaleString()} sent)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onRequestSend}
                disabled={!canLaunch}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
              >
                {isResuming ? (
                  <>
                    <Play className="h-4 w-4" aria-hidden="true" />
                    <span>Resume Remaining ({nextBatchTargets.length.toLocaleString()} Emails)</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span>Review & Send {nextBatchTargets.length.toLocaleString()} Emails</span>
                  </>
                )}
              </button>
            )}

            <div className="flex items-center gap-2">
              {metrics.failed > 0 && !isSending && (
                <button
                  type="button"
                  onClick={onRetryFailed}
                  disabled={!isProviderReady}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Retry {metrics.failed.toLocaleString()} Failed</span>
                </button>
              )}

              {(metrics.sent > 0 || metrics.failed > 0) && !isSending && (
                <button
                  type="button"
                  onClick={onResetQueue}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Reset Progress
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Paginated Live Delivery Progress & Per-Row Queue */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="space-y-1">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Recipient Delivery Queue
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-slate-500">
              <span className="text-slate-900 font-medium">{metrics.pct}% complete</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-700">{metrics.sent.toLocaleString()} sent</span>
              <span aria-hidden="true">·</span>
              <span className={metrics.failed > 0 ? 'text-red-600' : 'text-slate-500'}>
                {metrics.failed.toLocaleString()} failed
              </span>
              <span aria-hidden="true">·</span>
              <span>{metrics.queued.toLocaleString()} queued</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg" role="group" aria-label="Filter delivery queue by status">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'queued', label: 'Queued' },
                  { id: 'sent', label: 'Sent' },
                  { id: 'failed', label: 'Failed' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setQueueFilter(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    queueFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onExportReport}
              disabled={selectedRecipients.length === 0}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Export Report (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 w-full bg-slate-100">
          <div
            className="h-full bg-blue-600 transition-all duration-200"
            style={{ width: `${metrics.pct}%` }}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                <th className="py-2.5 pl-6 pr-3 w-14 font-mono tabular-nums">#</th>
                <th className="py-2.5 px-3">Recipient Email</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 pl-3 pr-6">Delivery Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleQueueRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-slate-500">
                    {selectedRecipients.length === 0
                      ? 'No recipients selected for dispatch.'
                      : 'No rows match the selected delivery status filter.'}
                  </td>
                </tr>
              ) : (
                visibleQueueRows.map((rec) => {
                  const res = results[rec.id];
                  const status = res?.status ?? 'pending';
                  return (
                    <tr key={rec.id} className="h-10 hover:bg-slate-50">
                      <td className="py-2 pl-6 pr-3 font-mono text-xs tabular-nums text-slate-400">
                        {rec.rowIndex}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs text-slate-900">
                        {rec.email}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {status === 'pending' && (
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Queued</span>
                          </span>
                        )}
                        {status === 'sending' && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            <span>Sending</span>
                          </span>
                        )}
                        {status === 'sent' && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Sent</span>
                          </span>
                        )}
                        {status === 'failed' && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
                            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Failed</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs tabular-nums text-slate-500">
                        {res?.sentAt ? new Date(res.sentAt).toLocaleTimeString() : '—'}
                      </td>
                      <td className="py-2 pl-3 pr-6 text-xs text-slate-600 max-w-[420px]">
                        {res?.error ? (
                          <span className="text-red-600 whitespace-normal break-words">{res.error}</span>
                        ) : res?.messageId ? (
                          <span className="font-mono text-slate-500 break-all">ID: {res.messageId}</span>
                        ) : (
                          'Ready for dispatch'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalQueuePages > 1 && (
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 text-xs text-slate-500 font-mono tabular-nums">
            <span>
              Rows {((safeQueuePage - 1) * queuePageSize + 1).toLocaleString()}–
              {Math.min(safeQueuePage * queuePageSize, filteredQueue.length).toLocaleString()} of{' '}
              {filteredQueue.length.toLocaleString()}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setQueuePage((p) => Math.max(1, p - 1))}
                disabled={safeQueuePage <= 1}
                aria-label="Previous queue page"
                className="p-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="px-1.5">
                Page {safeQueuePage} / {totalQueuePages}
              </span>
              <button
                type="button"
                onClick={() => setQueuePage((p) => Math.min(totalQueuePages, p + 1))}
                disabled={safeQueuePage >= totalQueuePages}
                aria-label="Next queue page"
                className="p-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
