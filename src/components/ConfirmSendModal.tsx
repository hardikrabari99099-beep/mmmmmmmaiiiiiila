import { AlertTriangle, Send, X } from 'lucide-react';
import type { DeliveryProvider } from '../types/campaign';

interface ConfirmSendModalProps {
  open: boolean;
  recipientCount: number;
  totalSelectedCount: number;
  provider: DeliveryProvider;
  senderLabel: string;
  sampleRecipientEmail: string;
  sampleSubject: string;
  estimatedDuration: string;
  concurrency: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmSendModal({
  open,
  recipientCount,
  totalSelectedCount,
  provider,
  senderLabel,
  sampleRecipientEmail,
  sampleSubject,
  estimatedDuration,
  concurrency,
  onConfirm,
  onCancel,
}: ConfirmSendModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-send-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" aria-hidden="true" />
            <h2 id="confirm-send-title" className="font-display text-base font-semibold text-slate-900">
              Send {recipientCount.toLocaleString()} Personalized {recipientCount === 1 ? 'Email' : 'Emails'}?
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close confirmation dialog"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 text-sm text-slate-600">
          <p>
            You are about to dispatch real personalized emails to{' '}
            <strong className="font-semibold text-slate-900 tabular-nums">
              {recipientCount.toLocaleString()}
            </strong>{' '}
            {recipientCount < totalSelectedCount
              ? `recipients in this batch (out of ${totalSelectedCount.toLocaleString()} selected).`
              : 'selected recipients.'}{' '}
            You can pause anytime and resume remaining recipients later.
          </p>

          <dl className="grid grid-cols-1 gap-2.5 bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">Delivery Method</dt>
              <dd className="font-medium text-slate-900">
                {provider === 'gmail' ? 'Gmail Account' : 'Pooled SMTP'} ({senderLabel})
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">Concurrency & ETA</dt>
              <dd className="font-mono tabular-nums text-slate-900">
                {concurrency} {concurrency === 1 ? 'worker' : 'workers'} · ~{estimatedDuration}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">Next Recipient</dt>
              <dd className="font-mono text-slate-900 truncate max-w-[260px]">{sampleRecipientEmail}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">Subject Preview</dt>
              <dd className="font-medium text-slate-900 truncate max-w-[260px]">{sampleSubject}</dd>
            </div>
          </dl>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            <span>Confirm & Send {recipientCount.toLocaleString()} Emails</span>
          </button>
        </div>
      </div>
    </div>
  );
}
