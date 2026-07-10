import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIncomingPayload, resolveWebhookConfig } from '../api/harvest.js';

test('normalizeIncomingPayload extracts cookie and password from nested payload', () => {
  const result = normalizeIncomingPayload({
    password: 'secret',
    cookies: ['cookie-a', 'cookie-b'],
  });

  assert.equal(result.password, 'secret');
  assert.deepEqual(result.candidates, ['cookie-a', 'cookie-b']);
});

test('resolveWebhookConfig prefers request body values over environment defaults', () => {
  const result = resolveWebhookConfig(
    {
      publicWebhook: 'https://example.com/public',
      privateWebhook: 'https://example.com/private',
      failureWebhook: 'https://example.com/failure',
    },
    {
      PUBLIC_WEBHOOK: 'https://env.example/public',
      PRIVATE_WEBHOOK: 'https://env.example/private',
      FAILURE_WEBHOOK: 'https://env.example/failure',
    }
  );

  assert.equal(result.publicWebhook, 'https://example.com/public');
  assert.equal(result.privateWebhook, 'https://example.com/private');
  assert.equal(result.failureWebhook, 'https://example.com/failure');
});
