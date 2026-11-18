import { Copy, Download, History, Trash2 } from 'lucide-react';
import type { CampaignRun } from '../types/campaign';

interface HistoryViewProps {
  runs: CampaignRun[];
  onExportRunReport: (run: CampaignRun) => void;
  onReuseTemplate: (run: CampaignRun) => void;
  onClearHistory: () => void;
}

export function HistoryView({
  runs,
  onExportRunReport,
  onReuseTemplate,
  onClearHistory,
}: HistoryViewProps) {
  if (runs.length === 0) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl px-6 py-14 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600 mb-4">
          <History className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="font-display text-base font-semibold text-slate-900">
          No sent campaigns yet
        </h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto mt-1.5">
          Completed bulk email campaigns will appear here with per-recipient delivery outcomes and downloadable Excel reports.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            Campaign Delivery Log
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
            {runs.length} recorded {runs.length === 1 ? 'campaign' : 'campaigns'}
          </p>
        </div>

        <button
          type="button"
          onClick={onClearHistory}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-red-600 transition-colors whitespace-nowrap"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Clear History</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
              <th className="py-2.5 pl-6 pr-3">Date</th>
              <th className="py-2.5 px-3">Subject & Source Sheet</th>
              <th className="py-2.5 px-3">Sender</th>
              <th className="py-2.5 px-3 text-right">Delivered</th>
              <th className="py-2.5 pl-3 pr-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {runs.map((run) => (
              <tr key={run.id} className="hover:bg-slate-50">
                <td className="py-3 pl-6 pr-3 font-mono text-xs tabular-nums text-slate-500 whitespace-nowrap">
                  {new Date(run.createdAt).toLocaleString()}
                </td>
                <td className="py-3 px-3 max-w-[320px]">
                  <div className="font-medium text-slate-900 truncate">{run.subject}</div>
                  <div className="text-xs text-slate-500 font-mono truncate">
                    {run.fileName} · {run.sheetName}
                  </div>
                </td>
                <td className="py-3 px-3 text-xs text-slate-700 whitespace-nowrap">
                  <span>{run.provider === 'gmail' ? 'Gmail' : 'SMTP'}</span>
                  <span className="text-slate-300 mx-1.5" aria-hidden="true">·</span>
                  <span className="font-mono text-slate-600">{run.senderLabel}</span>
                </td>
                <td className="py-3 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                  <span className="text-emerald-700 font-medium">{run.sentCount.toLocaleString()} sent</span>
                  <span className="text-slate-300 mx-1.5" aria-hidden="true">·</span>
                  <span className={run.failedCount > 0 ? 'text-red-600 font-medium' : 'text-slate-500'}>
                    {run.failedCount.toLocaleString()} failed
                  </span>
                  <span className="text-slate-300 mx-1.5" aria-hidden="true">/</span>
                  <span className="text-slate-600">{run.totalTargeted.toLocaleString()}</span>
                </td>
                <td className="py-3 pl-3 pr-6 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onReuseTemplate(run)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Reuse Template</span>
                    </button>
                    {run.headers && run.rows && run.results && (
                      <button
                        type="button"
                        onClick={() => onExportRunReport(run)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Report .xlsx</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
