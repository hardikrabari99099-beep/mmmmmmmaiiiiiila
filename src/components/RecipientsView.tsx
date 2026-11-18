import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CopyCheck,
  Download,
  FileSpreadsheet,
  Layers,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { RecipientRecord, WorkbookState } from '../types/campaign';

interface RecipientsViewProps {
  workbook: WorkbookState | null;
  emailColumn: string;
  recipients: RecipientRecord[];
  isParsing: boolean;
  parseError: string | null;
  onUploadFile: (file: File) => void;
  onSelectSheet: (sheetName: string) => void;
  onChangeEmailColumn: (column: string) => void;
  onLoadSample: () => void;
  onLoadLargeSample: () => void;
  onDownloadSampleTemplate: () => void;
  onToggleRecipient: (id: string) => void;
  onToggleAllValid: (include: boolean) => void;
  onProceedToCompose: () => void;
}

type StatusFilter = 'all' | 'ready' | 'invalid' | 'duplicate' | 'excluded';

export function RecipientsView({
  workbook,
  emailColumn,
  recipients,
  isParsing,
  parseError,
  onUploadFile,
  onSelectSheet,
  onChangeEmailColumn,
  onLoadSample,
  onLoadLargeSample,
  onDownloadSampleTemplate,
  onToggleRecipient,
  onToggleAllValid,
  onProceedToCompose,
}: RecipientsViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const stats = useMemo(() => {
    let valid = 0;
    let invalid = 0;
    let duplicate = 0;
    let selected = 0;
    for (const r of recipients) {
      if (r.validity === 'valid') valid += 1;
      if (r.validity === 'invalid') invalid += 1;
      if (r.validity === 'duplicate') duplicate += 1;
      if (r.included) selected += 1;
    }
    return { total: recipients.length, valid, invalid, duplicate, selected };
  }, [recipients]);

  const filteredRecipients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return recipients.filter((rec) => {
      if (filter === 'ready' && !(rec.validity === 'valid' && rec.included)) return false;
      if (filter === 'invalid' && rec.validity !== 'invalid') return false;
      if (filter === 'duplicate' && rec.validity !== 'duplicate') return false;
      if (filter === 'excluded' && rec.included) return false;

      if (!q) return true;
      if (rec.email.toLowerCase().includes(q)) return true;
      return Object.values(rec.data).some((val) => val.toLowerCase().includes(q));
    });
  }, [recipients, filter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRecipients.length / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filter, workbook?.fileName, workbook?.activeSheet, pageSize]);

  const visibleRecipients = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRecipients.slice(start, start + pageSize);
  }, [filteredRecipients, safePage, pageSize]);

  const allValidSelected =
    stats.valid > 0 && recipients.filter((r) => r.validity === 'valid').every((r) => r.included);

  const handleFileChange = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onUploadFile(files[0]);
  };

  return (
    <div className="space-y-6">
      {/* Upload & Sheet Actions Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Import Excel or CSV Contact Sheet
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Upload an <span className="font-mono text-slate-700">.xlsx</span>,{' '}
              <span className="font-mono text-slate-700">.xls</span>, or{' '}
              <span className="font-mono text-slate-700">.csv</span> file (supports 3,000+ rows). Every column becomes a variable like{' '}
              <span className="font-mono text-slate-700">{'{{FirstName}}'}</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onDownloadSampleTemplate}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <Download className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <span>Download .xlsx Template</span>
            </button>
            <button
              type="button"
              onClick={onLoadSample}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <Sparkles className="h-4 w-4 text-blue-600" aria-hidden="true" />
              <span>Load Sample (5)</span>
            </button>
            <button
              type="button"
              onClick={onLoadLargeSample}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <Layers className="h-4 w-4 text-slate-700" aria-hidden="true" />
              <span>Load 3,000 Sample</span>
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          id="excel-file-input"
          type="file"
          accept=".xlsx,.xls,.csv"
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(e) => {
            handleFileChange(e.target.files);
            e.target.value = '';
          }}
        />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFileChange(e.dataTransfer.files);
          }}
          className={`flex flex-col sm:flex-row items-center justify-between gap-4 rounded-lg border border-dashed px-5 py-5 transition-colors ${
            isDragging
              ? 'border-blue-600 bg-blue-50/50'
              : 'border-slate-300 bg-slate-50/60 hover:border-slate-400'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 shrink-0">
              <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-900">
                {isParsing
                  ? 'Reading spreadsheet...'
                  : workbook
                    ? `Loaded: ${workbook.fileName}`
                    : 'Drop your Excel file here, or browse from your device'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {workbook ? (
                  <span className="font-mono tabular-nums">
                    {workbook.headers.length} columns · {stats.total.toLocaleString()} rows · Sheet “{workbook.activeSheet}”
                  </span>
                ) : (
                  'Supports multi-sheet .xlsx workbooks and UTF-8 .csv files up to 10,000+ rows'
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isParsing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            <span>{workbook ? 'Replace File' : 'Upload Excel / CSV'}</span>
          </button>
        </div>

        {parseError && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{parseError}</span>
          </div>
        )}
      </section>

      {/* Empty State vs Paginated Data Grid */}
      {!workbook || recipients.length === 0 ? (
        <section className="bg-white border border-slate-200 rounded-xl px-6 py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600 mb-4">
            <FileSpreadsheet className="h-6 w-6" aria-hidden="true" />
          </div>
          <h3 className="font-display text-base font-semibold text-slate-900">
            No recipients loaded yet
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-1.5">
            Upload your Excel sheet to inspect rows, map your email address column, and preview personalized messages—or start immediately with a sample sheet.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onLoadSample}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>Load Sample (5)</span>
            </button>
            <button
              type="button"
              onClick={onLoadLargeSample}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <Layers className="h-4 w-4" aria-hidden="true" />
              <span>Load 3,000 Sample</span>
            </button>
          </div>
        </section>
      ) : (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Mapping, Filters & Metrics Strip */}
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {workbook.sheetNames.length > 1 && (
                <div className="flex items-center gap-2">
                  <label htmlFor="sheet-select" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                    Worksheet
                  </label>
                  <select
                    id="sheet-select"
                    value={workbook.activeSheet}
                    onChange={(e) => onSelectSheet(e.target.value)}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
                  >
                    {workbook.sheetNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-2">
                <label htmlFor="email-col-select" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                  Email Column
                </label>
                <select
                  id="email-col-select"
                  value={emailColumn}
                  onChange={(e) => onChangeEmailColumn(e.target.value)}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  {workbook.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 font-mono tabular-nums">
                <span className="text-slate-900 font-semibold whitespace-nowrap">
                  {stats.selected.toLocaleString()} selected
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-700 whitespace-nowrap">
                  {stats.valid.toLocaleString()} valid
                </span>
                <span aria-hidden="true">·</span>
                <span className={`whitespace-nowrap ${stats.invalid > 0 ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                  {stats.invalid.toLocaleString()} invalid
                </span>
                <span aria-hidden="true">·</span>
                <span className={`whitespace-nowrap ${stats.duplicate > 0 ? 'text-amber-700 font-medium' : 'text-slate-500'}`}>
                  {stats.duplicate.toLocaleString()} duplicate
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search
                  className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search recipients..."
                  aria-label="Search recipients"
                  className="h-9 w-48 rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-blue-600"
                />
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg" role="group" aria-label="Filter recipients by status">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'ready', label: 'Ready' },
                    { id: 'invalid', label: 'Invalid' },
                    { id: 'duplicate', label: 'Duplicates' },
                    { id: 'excluded', label: 'Excluded' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilter(tab.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      filter === tab.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* High-Density Paginated Spreadsheet Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-[13px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                  <th className="py-2.5 pl-5 pr-2 w-9">
                    <input
                      type="checkbox"
                      aria-label="Select all valid recipients"
                      checked={allValidSelected}
                      onChange={(e) => onToggleAllValid(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                  </th>
                  <th className="py-2.5 px-2 w-12 font-mono tabular-nums text-slate-500">#</th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap">Validation</th>
                  {workbook.headers.map((header, idx) => (
                    <th
                      key={header}
                      className={`py-2.5 px-2.5 whitespace-nowrap ${
                        idx === workbook.headers.length - 1 ? 'pr-5' : ''
                      }`}
                    >
                      <span>{header}</span>
                      {header === emailColumn && (
                        <span className="ml-1 font-mono text-[11px] text-blue-600">(To)</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRecipients.length === 0 ? (
                  <tr>
                    <td
                      colSpan={workbook.headers.length + 3}
                      className="py-10 text-center text-sm text-slate-500"
                    >
                      No rows match your current search or filter.
                    </td>
                  </tr>
                ) : (
                  visibleRecipients.map((rec) => {
                    const isDisabled = rec.validity === 'invalid';
                    return (
                      <tr
                        key={rec.id}
                        className={`h-10 transition-colors ${
                          rec.included ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 text-slate-500 hover:bg-slate-100/60'
                        }`}
                      >
                        <td className="py-2 pl-5 pr-2">
                          <input
                            type="checkbox"
                            aria-label={`Include ${rec.email || `row ${rec.rowIndex}`}`}
                            checked={rec.included}
                            disabled={isDisabled}
                            onChange={() => onToggleRecipient(rec.id)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 disabled:opacity-40 focus:ring-blue-600"
                          />
                        </td>
                        <td className="py-2 px-2 font-mono text-xs tabular-nums text-slate-400">
                          {rec.rowIndex}
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap">
                          {rec.validity === 'valid' && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>Valid</span>
                            </span>
                          )}
                          {rec.validity === 'invalid' && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>Invalid email</span>
                            </span>
                          )}
                          {rec.validity === 'duplicate' && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                              <CopyCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>Duplicate</span>
                            </span>
                          )}
                        </td>
                        {workbook.headers.map((header, idx) => (
                          <td
                            key={header}
                            className={`py-2 px-2.5 max-w-[190px] truncate ${
                              idx === workbook.headers.length - 1 ? 'pr-5' : ''
                            } ${
                              header === emailColumn ? 'font-mono text-xs text-slate-900' : 'text-slate-700'
                            }`}
                            title={rec.data[header] ?? ''}
                          >
                            {rec.data[header] || <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-3 font-mono tabular-nums">
              <span>
                {filteredRecipients.length === 0
                  ? '0 rows'
                  : `Rows ${((safePage - 1) * pageSize + 1).toLocaleString()}–${Math.min(
                      safePage * pageSize,
                      filteredRecipients.length
                    ).toLocaleString()} of ${filteredRecipients.length.toLocaleString()}`}
              </span>
              <label htmlFor="recipients-page-size" className="sr-only">
                Rows per page
              </label>
              <select
                id="recipients-page-size"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-7 rounded border border-slate-300 bg-white px-1.5 text-xs text-slate-700"
              >
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    aria-label="Previous page"
                    className="p-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="font-mono tabular-nums px-1.5">
                    Page {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    aria-label="Next page"
                    className="p-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={onProceedToCompose}
                disabled={stats.selected === 0}
                className="font-medium text-blue-600 hover:text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Continue with {stats.selected.toLocaleString()} selected →
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
