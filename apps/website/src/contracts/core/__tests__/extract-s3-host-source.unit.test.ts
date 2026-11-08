import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (file: string) => readFileSync(new URL('../../../' + file, import.meta.url), 'utf8');

test('F4 positional mail parser retains its exact parser-location and host-label rationale', () => {
  const expected = '/**\n * Parses a plugin\'s {@link MAIL_ADAPTERS_FILENAME}. Pure. Unknown keys are ignored.\n * The parser lives in `@jini-ai/agent-plugins/lifecycle/mail`; this keeps the host\'s positional\n * signature and supplies this host\'s {@link defaultCredentialLabel}.\n *\n * @complexity O(a) in the declared adapter count.\n */\nexport function parseMailAdaptersFile';
  assert.ok(read('features/agent-plugins/mail-adapter-registry.ts').includes(expected));
});

test('F5 boot mail catalog drops the named unused imports', () => {
  const source = read('server/runtime/boot/mail-provider-catalog.ts');
  for (const name of ['credentialSecrets', 'safeMailProviderText', 'JiniHttpClientPort', 'PluginCredentialCard']) assert.doesNotMatch(source, new RegExp('\\b' + name + '\\b'));
  assert.doesNotMatch(source, /type MailProviderRegistry,/);
  assert.doesNotMatch(read('platform/mail/purpose-scoped-mailer.ts'), /JiniMailerPort/);
});

test('F5 active credential-card shim binds direct find/load exports and keeps only its required reader factory', () => {
  const source = read('features/custom-credentials/plugin-credential-card.ts');
  assert.match(source, /export \{ findPluginCredentialCard, loadPluginCredentialCardsSafely \}/);
  assert.match(source, /export const \{ readPluginCredentialValues \} = createPluginCredentialCardOperations/);
});
