import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Code2,
  Eye,
  FileText,
  LayoutTemplate,
  Paperclip,
  Plus,
  X,
} from 'lucide-react';
import type { ComposeMode, EmailAttachment, EmailTemplate, RecipientRecord } from '../types/campaign';
import {
  compileVisualEmailToHtml,
  createCustomerUpdatePreset,
  createProductReleasePreset,
} from '../utils/emailBuilder';
import {
  extractTemplateVariables,
  htmlToPlainText,
  plainTextToHtml,
  renderTemplate,
} from '../utils/mailMerge';
import { VisualEmailBuilder } from './VisualEmailBuilder';

interface ComposeViewProps {
  headers: string[];
  recipients: RecipientRecord[];
  template: EmailTemplate;
  onChangeTemplate: (next: EmailTemplate) => void;
  onProceedToDispatch: () => void;
  onBackToRecipients: () => void;
}

const MAX_ATTACHMENT_TOTAL_BYTES = 5 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function ComposeView({
  headers,
  recipients,
  template,
  onChangeTemplate,
  onProceedToDispatch,
  onBackToRecipients,
}: ComposeViewProps) {
  const selectedRecipients = useMemo(
    () => recipients.filter((r) => r.included),
    [recipients]
  );

  const [previewIdx, setPreviewIdx] = useState(0);
  const [activeField, setActiveField] = useState<'subject' | 'body'>('body');
  const [attachError, setAttachError] = useState<string | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const safeIdx =
    selectedRecipients.length > 0 ? Math.min(previewIdx, selectedRecipients.length - 1) : 0;
  const currentRecipient = selectedRecipients[safeIdx] ?? null;

  const insertToken = (header: string) => {
    const token = `{{${header}}}`;
    if (activeField === 'subject' && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? template.subject.length;
      const end = el.selectionEnd ?? template.subject.length;
      const nextSubject = template.subject.slice(0, start) + token + template.subject.slice(end);
      onChangeTemplate({ ...template, subject: nextSubject });
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
      return;
    }

    if (template.composeMode !== 'visual' && bodyRef.current) {
      const el = bodyRef.current;
      const start = el.selectionStart ?? template.body.length;
      const end = el.selectionEnd ?? template.body.length;
      const nextBody = template.body.slice(0, start) + token + template.body.slice(end);
      onChangeTemplate({ ...template, body: nextBody });
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
    }
  };

  const switchMode = (nextMode: ComposeMode) => {
    if (nextMode === template.composeMode) return;
    if (nextMode === 'visual') {
      const compiled = compileVisualEmailToHtml(template.visualDesign);
      onChangeTemplate({
        ...template,
        composeMode: 'visual',
        isHtml: true,
        body: compiled,
      });
      return;
    }

    if (nextMode === 'html') {
      const htmlBody =
        template.composeMode === 'visual'
          ? compileVisualEmailToHtml(template.visualDesign)
          : template.isHtml
            ? template.body
            : plainTextToHtml(template.body);
      onChangeTemplate({
        ...template,
        composeMode: 'html',
        isHtml: true,
        body: htmlBody,
      });
      return;
    }

    const plain = template.isHtml ? htmlToPlainText(template.body) : template.body;
    onChangeTemplate({
      ...template,
      composeMode: 'text',
      isHtml: false,
      body: plain,
    });
  };

  const applyPreset = (presetId: string) => {
    if (presetId === 'customer_update') {
      const design = createCustomerUpdatePreset();
      onChangeTemplate({
        ...template,
        composeMode: 'visual',
        isHtml: true,
        subject: '{{FirstName}}, your {{Company}} account update ({{OfferCode}})',
        visualDesign: design,
        body: compileVisualEmailToHtml(design),
      });
    } else if (presetId === 'product_release') {
      const design = createProductReleasePreset();
      onChangeTemplate({
        ...template,
        composeMode: 'visual',
        isHtml: true,
        subject: 'New release for {{Company}} on the {{Plan}} plan',
        visualDesign: design,
        body: compileVisualEmailToHtml(design),
      });
    } else if (presetId === 'plain_outreach') {
      onChangeTemplate({
        ...template,
        composeMode: 'text',
        isHtml: false,
        subject: 'Quick update for {{FirstName}} at {{Company}}',
        body: `Hi {{FirstName}},\n\nSharing a quick update for your {{Plan}} workspace at {{Company}} in {{City}}.\n\nReference code: {{OfferCode}}\n\nReply anytime if you have questions.\n\nBest regards,\nTeam`,
      });
    }
  };

  const handleVisualDesignChange = (nextDesign: EmailTemplate['visualDesign']) => {
    onChangeTemplate({
      ...template,
      composeMode: 'visual',
      isHtml: true,
      visualDesign: nextDesign,
      body: compileVisualEmailToHtml(nextDesign),
    });
  };

  const handleAddAttachments = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAttachError(null);

    let totalBytes = template.attachments.reduce((acc, a) => acc + a.size, 0);
    const added: EmailAttachment[] = [];

    for (const file of Array.from(files)) {
      if (totalBytes + file.size > MAX_ATTACHMENT_TOTAL_BYTES) {
        setAttachError('Total attachments per email cannot exceed 5 MB for reliable bulk delivery.');
        break;
      }
      const base64Content = await fileToBase64(file);
      totalBytes += file.size;
      added.push({
        id: `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        base64Content,
      });
    }

    if (added.length > 0) {
      onChangeTemplate({
        ...template,
        attachments: [...template.attachments, ...added],
      });
    }
  };

  const effectiveBodyTemplate =
    template.composeMode === 'visual'
      ? compileVisualEmailToHtml(template.visualDesign)
      : template.body;

  const allTemplateVars = useMemo(() => {
    const subjectVars = extractTemplateVariables(template.subject);
    const bodyVars = extractTemplateVariables(effectiveBodyTemplate);
    return Array.from(new Set([...subjectVars, ...bodyVars]));
  }, [template.subject, effectiveBodyTemplate]);

  const unmappedVars = useMemo(() => {
    const headerSet = new Set(headers.map((h) => h.trim().toLowerCase().replace(/[\s_-]+/g, '')));
    return allTemplateVars.filter(
      (v) => !headerSet.has(v.trim().toLowerCase().replace(/[\s_-]+/g, ''))
    );
  }, [allTemplateVars, headers]);

  const renderedPreview = useMemo(() => {
    if (!currentRecipient) {
      return {
        subject: template.subject,
        body: effectiveBodyTemplate,
        missingVars: [] as string[],
      };
    }
    const subj = renderTemplate(template.subject, currentRecipient.data);
    const body = renderTemplate(effectiveBodyTemplate, currentRecipient.data);
    const missing = Array.from(new Set([...subj.missingVars, ...body.missingVars]));
    return {
      subject: subj.output,
      body: body.output,
      missingVars: missing,
    };
  }, [currentRecipient, template.subject, effectiveBodyTemplate]);

  if (selectedRecipients.length === 0) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl px-6 py-14 text-center">
        <h2 className="font-display text-base font-semibold text-slate-900">
          Select recipients before composing
        </h2>
        <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
          Upload an Excel sheet or load the sample contacts first so you can insert spreadsheet variables and preview real personalized emails.
        </p>
        <button
          type="button"
          onClick={onBackToRecipients}
          className="mt-6 inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
        >
          Go to Recipients Sheet
        </button>
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: Email Builder & Editor */}
      <section className="xl:col-span-6 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-5">
        <div className="space-y-5">
          <div className="space-y-3 pb-4 border-b border-slate-200">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Email UI & Template Builder
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Design branded customer updates with blocks, attach PDFs, and personalize with{' '}
                <span className="font-mono text-slate-700">{'{{Columns}}'}</span>.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <label htmlFor="preset-select" className="sr-only">
                Load template preset
              </label>
              <select
                id="preset-select"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) applyPreset(e.target.value);
                  e.target.value = '';
                }}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                <option value="" disabled>
                  Load Preset...
                </option>
                <option value="customer_update">Account & Billing Update (UI)</option>
                <option value="product_release">Product Feature Update (UI)</option>
                <option value="plain_outreach">Simple Plain Text</option>
              </select>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg" role="group" aria-label="Editor mode">
                <button
                  type="button"
                  onClick={() => switchMode('visual')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    template.composeMode === 'visual'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutTemplate className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Visual UI</span>
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('html')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    template.composeMode === 'html'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>HTML</span>
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('text')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    template.composeMode === 'text'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Text</span>
                </button>
              </div>
            </div>
          </div>

          {/* Subject Line + Variable Chips when in Subject/HTML/Text */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label htmlFor="email-subject" className="text-xs font-medium text-slate-700">
                Subject Line
              </label>
              <div className="flex flex-wrap gap-1">
                {headers.slice(0, 4).map((header) => (
                  <button
                    key={header}
                    type="button"
                    onClick={() => {
                      setActiveField('subject');
                      insertToken(header);
                    }}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 text-[11px] font-mono text-slate-600"
                  >
                    <Plus className="h-2.5 w-2.5" aria-hidden="true" />
                    <span>{header}</span>
                  </button>
                ))}
              </div>
            </div>
            <input
              ref={subjectRef}
              id="email-subject"
              type="text"
              value={template.subject}
              onFocus={() => setActiveField('subject')}
              onChange={(e) => onChangeTemplate({ ...template, subject: e.target.value })}
              placeholder="e.g., {{FirstName}}, your {{Company}} account update"
              className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-blue-600"
            />
          </div>

          {/* Mode-Specific Body Editor */}
          {template.composeMode === 'visual' ? (
            <VisualEmailBuilder
              design={template.visualDesign}
              headers={headers}
              onChangeDesign={handleVisualDesignChange}
            />
          ) : (
            <div className="space-y-3">
              <div>
                <div className="text-xs font-medium text-slate-600 mb-1.5">
                  Insert Variable ({activeField === 'subject' ? 'Subject' : 'Body'})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {headers.map((header) => (
                    <button
                      key={header}
                      type="button"
                      onClick={() => insertToken(header)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 text-xs font-mono text-slate-700 transition-colors whitespace-nowrap"
                    >
                      <Plus className="h-3 w-3" aria-hidden="true" />
                      <span>{`{{${header}}}`}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="email-body" className="text-xs font-medium text-slate-700">
                    {template.composeMode === 'html' ? 'HTML Source Code' : 'Plain Text Body'}
                  </label>
                  <span className="font-mono text-xs tabular-nums text-slate-400">
                    {template.body.length.toLocaleString()} chars
                  </span>
                </div>
                <textarea
                  ref={bodyRef}
                  id="email-body"
                  rows={13}
                  value={template.body}
                  onFocus={() => setActiveField('body')}
                  onChange={(e) => onChangeTemplate({ ...template, body: e.target.value })}
                  placeholder="Write your personalized message using {{ColumnName}} placeholders..."
                  className={`w-full rounded-lg border border-slate-300 bg-white p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-blue-600 leading-relaxed ${
                    template.composeMode === 'html' ? 'font-mono text-[12px]' : ''
                  }`}
                />
              </div>
            </div>
          )}

          {/* Attachments & Reply-To */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-medium text-slate-700">
                  Attachments (PDF, Docs)
                </span>
                <button
                  type="button"
                  onClick={() => attachmentInputRef.current?.click()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap shrink-0"
                >
                  <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Attach File</span>
                </button>
              </div>
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
                onChange={(e) => {
                  void handleAddAttachments(e.target.files);
                  e.target.value = '';
                }}
              />
              {template.attachments.length === 0 ? (
                <div className="text-xs text-slate-400">No files attached (max 5 MB total)</div>
              ) : (
                <ul className="space-y-1.5">
                  {template.attachments.map((att) => (
                    <li
                      key={att.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs"
                    >
                      <span className="truncate font-mono text-slate-800">{att.filename}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-slate-500 tabular-nums">{formatBytes(att.size)}</span>
                        <button
                          type="button"
                          onClick={() =>
                            onChangeTemplate({
                              ...template,
                              attachments: template.attachments.filter((a) => a.id !== att.id),
                            })
                          }
                          aria-label={`Remove ${att.filename}`}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {attachError && <div className="text-xs text-red-600 mt-1">{attachError}</div>}
            </div>

            <div>
              <label htmlFor="email-reply-to" className="block text-xs font-medium text-slate-700 mb-1.5">
                Reply-To Address (Optional)
              </label>
              <input
                id="email-reply-to"
                type="email"
                value={template.replyTo}
                onChange={(e) => onChangeTemplate({ ...template, replyTo: e.target.value })}
                placeholder="updates@yourcompany.com"
                className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-blue-600"
              />
            </div>
          </div>

          {unmappedVars.length > 0 && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Unknown variables not found in sheet columns:{' '}
                <strong className="font-mono">{unmappedVars.map((v) => `{{${v}}}`).join(', ')}</strong>.
              </span>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackToRecipients}
            className="px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            Back to Sheet
          </button>
          <button
            type="button"
            onClick={onProceedToDispatch}
            disabled={!template.subject.trim() || !effectiveBodyTemplate.trim()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            Continue to Sender & Dispatch →
          </button>
        </div>
      </section>

      {/* Right: Live Inbox-Style Merge Preview */}
      <section className="xl:col-span-6 xl:sticky xl:top-6 xl:h-[calc(100vh-7.5rem)] min-h-[620px] bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Eye className="h-4 w-4 text-slate-500 shrink-0" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold text-slate-900 truncate">
              Live Inbox Preview
            </h3>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setPreviewIdx((i) => Math.max(0, i - 1))}
              disabled={safeIdx === 0}
              aria-label="Previous recipient preview"
              className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-mono text-xs tabular-nums text-slate-600 px-1.5">
              {safeIdx + 1} / {selectedRecipients.length}
            </span>
            <button
              type="button"
              onClick={() => setPreviewIdx((i) => Math.min(selectedRecipients.length - 1, i + 1))}
              disabled={safeIdx >= selectedRecipients.length - 1}
              aria-label="Next recipient preview"
              className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Recipient Jump & Envelope */}
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="preview-recipient-select" className="text-slate-500 shrink-0">
              Recipient
            </label>
            <div className="flex items-center gap-2 min-w-0">
              {selectedRecipients.length > 50 && (
                <input
                  type="number"
                  min={1}
                  max={selectedRecipients.length}
                  value={safeIdx + 1}
                  aria-label="Jump to selected recipient number"
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 1) {
                      setPreviewIdx(Math.min(selectedRecipients.length - 1, Math.floor(n) - 1));
                    }
                  }}
                  className="w-16 h-7 rounded-md border border-slate-300 bg-white px-2 font-mono text-xs tabular-nums text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
                />
              )}
              <select
                id="preview-recipient-select"
                value={safeIdx}
                onChange={(e) => setPreviewIdx(Number(e.target.value))}
                className="max-w-[260px] h-7 rounded-md border border-slate-300 bg-white px-2 font-mono text-xs text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                {selectedRecipients
                  .slice(Math.max(0, safeIdx - 25), Math.min(selectedRecipients.length, safeIdx + 75))
                  .map((r) => {
                    const actualIdx = selectedRecipients.indexOf(r);
                    return (
                      <option key={r.id} value={actualIdx}>
                        #{r.rowIndex} · {r.email}
                      </option>
                    );
                  })}
              </select>
            </div>
          </div>

          <div className="flex items-start gap-2 pt-1">
            <span className="text-slate-500 shrink-0 w-14">Subject</span>
            <span className="font-medium text-slate-900 break-words">
              {renderedPreview.subject || <span className="text-slate-400 italic">Empty subject</span>}
            </span>
          </div>
        </div>

        {/* Rendered Email UI / Text */}
        <div className="flex-1 flex flex-col bg-slate-100/60 overflow-hidden">
          {renderedPreview.missingVars.length > 0 && (
            <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Empty cell for this row:{' '}
                <span className="font-mono">{renderedPreview.missingVars.join(', ')}</span>
              </span>
            </div>
          )}

          {template.isHtml || template.composeMode === 'visual' ? (
            <iframe
              title="Personalized HTML email preview"
              data-testid="live-preview-iframe"
              sandbox="allow-same-origin"
              srcDoc={renderedPreview.body}
              className="w-full flex-1 min-h-[540px] border-0 bg-transparent"
            />
          ) : (
            <div
              data-testid="live-preview-body"
              className="m-5 p-5 rounded-lg bg-white border border-slate-200 whitespace-pre-wrap text-sm text-slate-800 leading-relaxed flex-1"
            >
              {renderedPreview.body || (
                <span className="text-slate-400 italic">Your message preview will appear here...</span>
              )}
            </div>
          )}

          {template.attachments.length > 0 && (
            <div className="px-5 py-3 bg-white border-t border-slate-200 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">
                Attachments ({template.attachments.length}):
              </span>
              {template.attachments.map((att) => (
                <span
                  key={att.id}
                  className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-mono text-slate-700"
                >
                  <Paperclip className="h-3 w-3 text-slate-500" aria-hidden="true" />
                  <span>{att.filename}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
