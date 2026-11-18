import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkArray,
  computeBackoffMs,
  estimateRemainingDuration,
  isAuthExpiredError,
  isRetryableDeliveryError,
  selectDispatchTargets,
} from './batchPlanner';
import type { DeliveryResult, RecipientRecord } from '../types/campaign';

function makeRecipients(count: number): RecipientRecord[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `row-${idx + 1}`,
    rowIndex: idx + 1,
    email: `user${idx + 1}@example.com`,
    validity: 'valid',
    included: true,
    data: { Email: `user${idx + 1}@example.com`, FirstName: `User${idx + 1}` },
  }));
}

test('selectDispatchTargets skips already sent rows on resume and honors maxEmailsPerRun', () => {
  const recipients = makeRecipients(3000);
  const results: Record<string, DeliveryResult> = {
    'row-1': { recipientId: 'row-1', email: 'user1@example.com', status: 'sent' },
    'row-2': { recipientId: 'row-2', email: 'user2@example.com', status: 'failed', error: 'timeout' },
  };

  const pendingBatch = selectDispatchTargets({
    recipients,
    results,
    mode: 'pending_only',
    maxEmailsPerRun: 500,
  });

  assert.equal(pendingBatch.length, 500);
  assert.equal(pendingBatch[0].id, 'row-2');
  assert.equal(pendingBatch[499].id, 'row-501');

  const failedOnly = selectDispatchTargets({
    recipients,
    results,
    mode: 'failed_only',
    maxEmailsPerRun: null,
  });
  assert.equal(failedOnly.length, 1);
  assert.equal(failedOnly[0].id, 'row-2');
});

test('chunkArray splits 3000 items into deterministic batches', () => {
  const items = Array.from({ length: 3000 }, (_, i) => i + 1);
  const chunks = chunkArray(items, 50);
  assert.equal(chunks.length, 60);
  assert.equal(chunks[0].length, 50);
  assert.equal(chunks[59][49], 3000);
});

test('retry and auth classifiers handle 429/5xx vs 401 accurately', () => {
  assert.equal(isRetryableDeliveryError('Rate limit exceeded', 429), true);
  assert.equal(isRetryableDeliveryError('Connection timeout ETIMEDOUT'), true);
  assert.equal(isRetryableDeliveryError('Invalid recipient address', 400), false);
  assert.equal(isAuthExpiredError('Invalid authentication credentials', 401), true);
  assert.equal(isAuthExpiredError('Rate limit exceeded', 429), false);
  assert.equal(computeBackoffMs(0, 1000), 1000);
  assert.equal(computeBackoffMs(2, 1000), 4000);
});

test('estimateRemainingDuration calculates human-readable ETA and throughput', () => {
  const est = estimateRemainingDuration(3000, 100, 4, 180);
  assert.ok(est.totalSeconds > 0);
  assert.ok(est.emailsPerMinute > 100);
  assert.ok(est.formatted.includes('m') || est.formatted.includes('s'));
});
