import type { DeliveryResult, RecipientRecord } from '../types/campaign';

export interface BatchSelectionOptions {
  recipients: RecipientRecord[];
  results: Record<string, DeliveryResult>;
  mode: 'pending_only' | 'failed_only' | 'all_selected';
  maxEmailsPerRun: number | null;
}

export function selectDispatchTargets({
  recipients,
  results,
  mode,
  maxEmailsPerRun,
}: BatchSelectionOptions): RecipientRecord[] {
  const eligible = recipients.filter((rec) => {
    if (!rec.included) return false;
    const status = results[rec.id]?.status;
    if (mode === 'failed_only') {
      return status === 'failed';
    }
    if (mode === 'pending_only') {
      return status !== 'sent';
    }
    return true;
  });

  if (maxEmailsPerRun !== null && maxEmailsPerRun > 0) {
    return eligible.slice(0, maxEmailsPerRun);
  }
  return eligible;
}

export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (items.length === 0) return [];
  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function isRetryableDeliveryError(message: string, statusCode?: number): boolean {
  if (statusCode === 429 || (statusCode !== undefined && statusCode >= 500 && statusCode < 600)) {
    return true;
  }
  const lower = message.toLowerCase();
  return (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('too many') ||
    lower.includes('temporarily') ||
    lower.includes('timeout') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('try again')
  );
}

export function isAuthExpiredError(message: string, statusCode?: number): boolean {
  if (statusCode === 401) return true;
  const lower = message.toLowerCase();
  return (
    lower.includes('401') ||
    lower.includes('invalid authentication credentials') ||
    lower.includes('unauthorized') ||
    lower.includes('token expired')
  );
}

export function computeBackoffMs(attemptIndex: number, baseMs = 1200): number {
  const safeAttempt = Math.max(0, attemptIndex);
  return Math.min(15000, baseMs * Math.pow(2, safeAttempt));
}

export function estimateRemainingDuration(
  remainingCount: number,
  delayMs: number,
  concurrency: number,
  avgNetworkMs = 180
): { totalSeconds: number; formatted: string; emailsPerMinute: number } {
  if (remainingCount <= 0) {
    return { totalSeconds: 0, formatted: '0s', emailsPerMinute: 0 };
  }
  const workers = Math.max(1, concurrency);
  const perEmailCycleMs = Math.max(delayMs, 20) + avgNetworkMs;
  const effectiveMsPerEmail = perEmailCycleMs / workers;
  const totalSeconds = Math.ceil((remainingCount * effectiveMsPerEmail) / 1000);
  const emailsPerMinute = Math.max(1, Math.round(60000 / effectiveMsPerEmail));

  if (totalSeconds < 60) {
    return { totalSeconds, formatted: `${totalSeconds}s`, emailsPerMinute };
  }
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins < 60) {
    return {
      totalSeconds,
      formatted: secs > 0 ? `${mins}m ${secs}s` : `${mins}m`,
      emailsPerMinute,
    };
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return {
    totalSeconds,
    formatted: remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`,
    emailsPerMinute,
  };
}
