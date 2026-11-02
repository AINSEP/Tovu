import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { mailWebhookSecretLabels } from '../../../../apps/website/src/features/mail/feedback-sources.ts';
import { MAIL_FEEDBACK_PATH } from '../../../../apps/website/src/server/inbound/public-http/routes/mail-feedback.ts';

/**
 * @file Tovu's overlay for the portable `resend` plugin (now `@jini-ai/plugin-resend`). The plugin
 * says only that bounces arrive by a signed webhook; this overlay carries Tovu's route, events,
 * vault labels and rotation steps (plan v2 §5.1). They are prose, so these pins catch a renamed
 * route or label that would otherwise leave every agent giving the operator a dead endpoint.
 */

const overlayRoot = path.resolve(import.meta.dirname, '..');
const guidance = () => readFile(path.join(overlayRoot, 'GUIDANCE.md'), 'utf8');

test('the webhook endpoint the overlay gives the operator is the route Tovu mounts', async () => {
  const route = MAIL_FEEDBACK_PATH.replace(':providerId', 'resend');
  assert.equal(route, '/hooks/mail/resend');
  assert.ok((await guidance()).includes(`https://<the site's public address>${route}\``));
});

test('the signing-secret labels, current and previous, are the ones the feedback route reads', async () => {
  const [current, previous] = mailWebhookSecretLabels({ providerLabel: 'Resend' });
  // The guidance wraps the current label across a line inside its call example.
  const text = (await guidance()).replace(/\s+/g, ' ');
  assert.ok(text.includes(`label: "${current}"`), current);
  assert.ok(text.includes(`\`${previous}\``), previous);
});

test('suppression rules and the secret-free setup stay stated', async () => {
  const text = (await guidance()).replace(/\s+/g, ' ');
  assert.match(text, /a complaint stops newsletters only; sign-in links still go out/);
  assert.match(text, /`email\.bounced`, `email\.complained` and `email\.delivered`/);
  assert.match(text, /Never ask for it in chat/);
  assert.match(text, /answers 503 and Resend retries later/);
});

test('the overlay is vendor-neutral about models: no model or vendor names', async () => {
  assert.doesNotMatch(await guidance(), /\b(Claude|Anthropic|Codex|OpenAI|GPT|Gemini|Copilot)\b/);
});
