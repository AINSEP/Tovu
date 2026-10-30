import assert from 'node:assert/strict';
import test from 'node:test';
import { redactAdminRunContextRef } from '../credential-chat-intake.js';
import { parseRunStartContextRef } from '../run-start-context.js';
import { CREDENTIAL_GUIDANCE, CREDENTIAL_PASTE_MODEL_NOTE } from '../credential-guidance.js';
import { resolveMessages } from '../../server/runtime/composition/modules/assistant-byok.js';

const secret = 'sk-' + 'A1b2C3d4E5f6G7h8I9j0';

test('assembled history is sanitized without reporting a new paste on the current request', () => {
  const prompt = `## user\nUse ${secret}\n\n## assistant\nSaved.\n\n## user\ndeploy to vercel please`;
  const envelope = redactAdminRunContextRef({ contextRef: JSON.stringify({ prompt, coldStartContext: prompt,
    userPrompt: 'deploy to vercel please', principalId: 'owner' }) }, {});
  assert.equal(envelope.includes(secret), false);
  assert.equal(JSON.parse(envelope).secretRedacted, undefined);
  const result = parseRunStartContextRef(envelope);
  assert.equal(result.prompt.includes(CREDENTIAL_PASTE_MODEL_NOTE), false);
  assert.equal(result.coldStartContext?.includes(CREDENTIAL_PASTE_MODEL_NOTE), false);
  assert.equal(result.userPrompt, 'deploy to vercel please');
});

test('direct daemon parsing does not turn a newly sanitized historical key into a current notice', () => {
  const result = parseRunStartContextRef(JSON.stringify({ prompt: `Earlier: ${secret}\nCurrent: deploy to vercel please`,
    coldStartContext: `Earlier: ${secret}`, userPrompt: 'deploy to vercel please', principalId: 'owner' }));
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(result).includes(CREDENTIAL_PASTE_MODEL_NOTE), false);
});

test('public DKIM history cannot flag a current public deployment URL as a paste', () => {
  // The earlier regression fixture records this public DNS value; entropy alone cannot tell it
  // from a secret. Keep history sanitization without claiming the current user sent a credential.
  const dkim = 'p=' + 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDl4ZwX9vR2kT7yQp8sN3uB6hJ';
  const current = 'https://zoran-new.vercel.app';
  const history = `## assistant\nAdd this TXT record ${dkim}\n\n## user\n${current}`;
  const envelope = redactAdminRunContextRef({ contextRef: JSON.stringify({ prompt: history, coldStartContext: history,
    userPrompt: current, principalId: 'owner' }) }, {});
  assert.equal(JSON.parse(envelope).secretRedacted, undefined);
  assert.equal(envelope.includes(dkim), false);
  const result = parseRunStartContextRef(envelope);
  assert.equal(result.userPrompt, current);
  assert.equal(JSON.stringify(result).includes(CREDENTIAL_PASTE_MODEL_NOTE), false);
});

test('a real current secret is sanitized before acceptance and warns on both CLI prompt choices', () => {
  const envelope = redactAdminRunContextRef({ contextRef: JSON.stringify({ prompt: `Save ${secret}`, userPrompt: `Save ${secret}`,
    coldStartContext: `## user\nSave ${secret}`, principalId: 'owner' }) }, {});
  assert.equal(envelope.includes(secret), false);
  const parsed = parseRunStartContextRef(envelope);
  for (const text of [parsed.prompt, parsed.coldStartContext, parsed.userPrompt]) {
    assert.equal(text?.split(CREDENTIAL_PASTE_MODEL_NOTE).length, 2);
  }
});

test('BYOK sanitizes old secrets but warns only for the current user turn', () => {
  const messages = resolveMessages([{ role: 'user', content: `Save ${secret}`, secretRedacted: true },
    { role: 'assistant', content: 'Use the configured connection.' }, { role: 'user', content: 'deploy to vercel please' }]);
  assert.deepEqual(messages.map(message => message.content), ['Save [token removed]', 'Use the configured connection.', 'deploy to vercel please']);
  const current = resolveMessages([{ role: 'user', content: 'hello' }, { role: 'user', content: `Save ${secret}` }]);
  assert.equal(current[1]?.content, `Save [token removed]\n\n${CREDENTIAL_PASTE_MODEL_NOTE}`);
});

test('BYOK current-message selection tolerates invalid entries and repeated message references', () => {
  const message = { role: 'user', content: `Save ${secret}`, secretRedacted: true };
  const result = resolveMessages([message, message, { role: 'user', content: '' }, null]);
  assert.deepEqual(result.map(entry => entry.content), ['Save [token removed]', `Save [token removed]\n\n${CREDENTIAL_PASTE_MODEL_NOTE}`]);
});

test('credential guidance requires current-message evidence and preserves a configured provider', () => {
  assert.ok(CREDENTIAL_GUIDANCE.includes('Only notify about a secret removed from the current user message'));
  assert.equal(CREDENTIAL_GUIDANCE.includes('or the message contains [token removed]'), false);
  assert.ok(CREDENTIAL_GUIDANCE.includes('credentialConfigured:true'));
  assert.ok(CREDENTIAL_GUIDANCE.includes('actually failed authentication'));
  assert.ok(CREDENTIAL_PASTE_MODEL_NOTE.includes('does not mean the configured connection failed'));
  assert.equal(CREDENTIAL_PASTE_MODEL_NOTE.includes('; open the matching card'), false);
});
