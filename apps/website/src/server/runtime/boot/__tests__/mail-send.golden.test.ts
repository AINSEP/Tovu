/** A2 recording on unmoved composition: real bundled resend and real SMTP adapter, fake transports only. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { InMemoryPrincipalRepo } from '@jini-ai/user-management/server';
import { InMemorySettingsRepo } from '@jini-ai/core/settings';
import type { MailCapturePort, MailSendLedgerPort } from '@jini-ai/core/contracts/mail';
import { createSettingsPrincipalLookup, set } from '#src/features/settings/index';
import { ensureMailProviderSettings, readMailProviderSetting } from '#src/features/settings/mail-provider';
import { createCustomCredential, updateCustomCredential, InMemoryCustomCredentialSetRepo } from '#src/features/custom-credentials/index';
import { parseMailAdaptersFile, type MailAdapterRegistry } from '#src/features/agent-plugins/mail-adapter-registry';
import { AesGcmSecretSealer } from '#src/features/webhooks/secret-sealer.aesgcm';
import { InMemoryKeyring } from '#src/features/webhooks/keyring.memory';
import { createSiteMailer, type SiteMailerRequired } from '../../composition/site-mailer.js';
import { loadMailCredentialCards, MAIL_SMTP_CREDENTIAL_LABEL } from '../mail-provider-catalog.js';
import { buildPluginCredentialForm } from '#src/contracts/core/plugin-credential-card';
import { buildFormSurface } from '@jini-ai/ui/mcp-ui/surfaces';
import type { HttpRequest } from '#src/platform/http/index';
import type { MailerSendOptions, OutboundEmail } from '#src/platform/mail/index';

const GOLDEN = new URL('./fixtures/mail-send.golden.json', import.meta.url);
const WS = 'mail-golden';
const AT = '2026-11-07T00:00:00.000Z';
const KEY = 'golden-resend-key-1234';
const raw = readFileSync(new URL(import.meta.resolve('@jini-ai/agent-plugins/resend/tovu-mail-adapters.json')), 'utf8');
const parsed = parseMailAdaptersFile(raw);
assert.ok(parsed.ok);
const descriptor = parsed.descriptors[0]!;
const realModule = (await import(import.meta.resolve('@jini-ai/agent-plugins/resend/adapters/resend.mjs'))).default;
const options = (key: string): MailerSendOptions => ({ workspaceId: WS, idempotencyKey: key, sourceContext: { module: 'golden' }, purpose: 'transactional', lane: 'interactive', timeoutMs: 2345 });
const message = (from: OutboundEmail['from'] = { email: 'news@example.test', name: 'Configured Sender' }): OutboundEmail => ({ workspaceId: WS,
  from, to: { email: 'reader@example.test', name: 'Reader' }, replyTo: { email: 'reply@example.test', name: 'Reply' },
  subject: 'Golden delivery', text: 'Plain body', html: '<p>HTML body</p>', headers: { 'X-Golden': 'unchanged' },
  attachments: [{ filename: 'note.txt', contentType: 'text/plain', contentBase64: 'SGVsbG8=' }],
});

async function rig(input: { provider?: string; key?: boolean; sender?: { email?: string; name?: string } | null; unavailable?: boolean } = {}) {
  let next = 0, active = true;
  const clock = { nowIso: () => AT, nowMs: () => Date.now() }, ids = { newId: () => `id-${++next}` };
  const settingsRepo = new InMemorySettingsRepo();
  const principals = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) });
  const settingsDeps = { clock, ids, principals };
  await ensureMailProviderSettings({ deps: { settingsRepo, ...settingsDeps }, systemPrincipalId: 'system' });
  const keyring = new InMemoryKeyring(), sealer = new AesGcmSecretSealer(keyring), repo = new InMemoryCustomCredentialSetRepo();
  const writeDeps = { repo, sealer, keyring, clock, idGen: ids };
  const http: HttpRequest[] = [], smtp: unknown[] = [], ledgerCalls: { kind: string; input: unknown }[] = [], captured: unknown[] = [];
  const ledger: MailSendLedgerPort = { reserve: async value => { ledgerCalls.push({ kind: 'reserve', input: value }); return { status: 'reserved' }; }, mark: async value => { ledgerCalls.push({ kind: 'mark', input: value }); } };
  const capture: MailCapturePort = { capture: async value => { captured.push(value); return { id: 'capture-1' }; } };
  const adapters: MailAdapterRegistry = { refusals: [], list: () => active && !input.unavailable ? [{ pluginId: 'resend', descriptor, module: realModule }] : [] };
  const required: SiteMailerRequired = {
    resolve: { workspaceId: WS, mode: 'production', customCredentialRepo: repo, sealer,
      httpClient: { send: async request => { http.push(request); return { status: 200, headers: {}, bodyText: JSON.stringify({ id: `mail-${http.length}` }) }; } },
      loadMailAdapters: async () => adapters, log: () => {}, warn: () => {}, clock,
      createSmtpTransport: config => ({ sendMail: async mail => { smtp.push({ config, mail }); return { messageId: 'smtp-1' }; } }),
    },
    settings: { repo: settingsRepo, deps: settingsDeps, systemPrincipalId: 'system', authorize: async () => ({ allowed: true, reason: 'golden' }) },
    settingsReady: Promise.resolve(), delivery: { ledger, suppression: { isSuppressed: async ({ normalizedAddress }) => normalizedAddress === 'blocked@example.test', suppress: async () => {} }, capture },
    readSenderEmail: async () => input.sender === null ? undefined : input.sender?.email ?? 'news@example.test',
    readConfiguredSender: async () => input.sender === null ? null : input.sender ?? { email: 'news@example.test', name: 'Configured Sender' },
  };
  const credential = input.key === false ? undefined : await createCustomCredential(writeDeps, { workspaceId: WS,
    label: input.provider === 'smtp' ? MAIL_SMTP_CREDENTIAL_LABEL : descriptor.credentialLabel, category: 'ops',
    baseUrl: input.provider === 'smtp' ? 'https://smtp.example.test:465' : 'https://api.resend.com', connection: { token: KEY, ...(input.provider === 'smtp' ? { username: 'smtp-user' } : {}) },
  });
  const site = createSiteMailer(required, { durableOutboxReady: () => true, setAgentPluginEnabled: async value => { active = value.enabled; return { pluginId: value.pluginId, enabled: value.enabled, warnings: [] }; } });
  await site.ready;
  if (input.provider) await site.selectProvider({ id: input.provider, principalId: 'owner' });
  const mode = async (value: { mode: 'off' } | { mode: 'capture' } | { mode: 'redirect'; to: string }) => set({ deps: { ...settingsDeps, repo: settingsRepo, authorize: async () => ({ allowed: true, reason: 'golden' }) }, input: {
    namespace: 'core.mail', key: 'testMode', scope: 'workspace', workspaceId: WS, callerPrincipalId: 'owner', value,
  } });
  const counters = () => ({ reserves: ledgerCalls.filter(c => c.kind === 'reserve').length, marks: ledgerCalls.filter(c => c.kind === 'mark').length,
    perRecipient: Object.fromEntries([...new Set(ledgerCalls.map(c => (c.input as { recipient: string }).recipient))].map(recipient => [recipient, {
      reserves: ledgerCalls.filter(c => c.kind === 'reserve' && (c.input as { recipient: string }).recipient === recipient).length,
      marks: ledgerCalls.filter(c => c.kind === 'mark' && (c.input as { recipient: string }).recipient === recipient).length,
    }])) });
  return { site, required, http, smtp, ledgerCalls, captured, credential, writeDeps, mode, counters, settingsRepo };
}

async function transportAndStatus() {
  const f = await rig({ provider: 'resend' });
  const sender = await f.site.operations.mailSenderIdentity!.resolve({ workspaceId: WS, fallback: { email: 'no-reply@site.local', name: 'Fallback Sender' } });
  const result = await f.site.mailer.send(message(sender), options('configured'));
  assert.equal(result.ok, true);
  assert.deepEqual(f.counters(), { reserves: 1, marks: 1, perRecipient: { 'reader@example.test': { reserves: 1, marks: 1 } } });
  const status = await f.site.status(); assert.equal(status.state, 'ready');
  return { sender, result, requests: f.http, ledger: f.ledgerCalls, counters: f.counters(), status, providers: await f.site.describeProviders(), checkProvider: await f.site.checkProvider({ id: 'resend' }) };
}

async function smtpAndFallbackName() {
  const f = await rig({ provider: 'smtp', sender: { email: 'smtp@example.test' } });
  const sender = await f.site.operations.mailSenderIdentity!.resolve({ workspaceId: WS, fallback: { email: 'no-reply@site.local', name: 'Fallback Sender' } });
  const result = await f.site.mailer.send(message(sender), options('smtp'));
  assert.equal(result.ok, true); assert.equal(sender.name, 'Fallback Sender');
  return { sender, result, smtp: f.smtp, ledger: f.ledgerCalls, counters: f.counters() };
}

async function policies() {
  const suppressed = await rig({ provider: 'resend' });
  const refused = await suppressed.site.mailer.send({ ...message(), to: { email: 'blocked@example.test' } }, options('suppressed'));
  assert.equal(refused.ok, false); assert.equal(suppressed.http.length, 0);
  const redirect = await rig({ provider: 'resend' }); await redirect.mode({ mode: 'redirect', to: 'audit@example.test' });
  const redirected = await redirect.site.mailer.send(message(), options('redirect'));
  const capture = await rig({ provider: 'resend' }); await capture.mode({ mode: 'capture' });
  const captured = await capture.site.mailer.send(message(), options('capture'));
  assert.equal(capture.http.length, 0);
  const limited = await rig({ provider: 'resend' });
  const rate = [];
  for (const id of ['rate-1', 'rate-2', 'rate-3']) rate.push(await limited.site.mailer.send(message(), options(id)));
  assert.equal(rate[2]!.ok, false);
  return { suppressed: { result: refused, ledger: suppressed.ledgerCalls, counters: suppressed.counters() },
    redirect: { result: redirected, requests: redirect.http, ledger: redirect.ledgerCalls, counters: redirect.counters() },
    capture: { result: captured, captured: capture.captured, ledger: capture.ledgerCalls, counters: capture.counters() },
    rate: { results: rate, requests: limited.http, ledger: limited.ledgerCalls, counters: limited.counters() } };
}

async function refusals() {
  const results: Record<string, unknown> = {};
  for (const [name, setup] of [['unconfigured', { key: false }], ['unavailable', { provider: 'absent' }], ['missingKey', { provider: 'resend', key: false }]] as const) {
    const f = await rig(setup); const result = await f.site.mailer.send(message(), options(name)); assert.equal(result.ok, false);
    results[name] = { result, requests: f.http, counters: f.counters() };
  }
  const f = await rig({ provider: 'resend', sender: null });
  results.missingSender = await f.site.operations.mailSenderIdentity!.resolve({ workspaceId: WS, fallback: { email: 'no-reply@site.local', name: 'Fallback Sender' } }).then(() => assert.fail('sender must be refused'), error => ({ name: error.name, message: error.message }));
  return results;
}

async function rotationOffAndCards() {
  const f = await rig({ provider: 'resend' });
  const first = await f.site.mailer.send(message(), options('before-rotation'));
  await updateCustomCredential(f.writeDeps, { workspaceId: WS, id: f.credential!.id, connection: { token: 'golden-rotated-key-5678' } });
  const second = await f.site.mailer.send(message(), options('after-rotation'));
  assert.equal(first.ok && second.ok, true);
  assert.equal(f.http[1]!.headers.Authorization, 'Bearer golden-rotated-key-5678');
  const cards = await loadMailCredentialCards(f.required.resolve);
  const form = buildPluginCredentialForm({ card: cards[0]! });
  const resource = buildFormSurface({ ...form, uri: 'ui://mail-golden/key', toolName: 'credential_save' });
  const card = { spec: cards[0], frame: resource.resource._meta, sha256: createHash('sha256').update(resource.resource.text).digest('hex'),
    markup: resource.resource.text.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').replace(/<style[^>]*>[\s\S]*?<\/style>/g, '').trim() };
  await f.site.setAgentPluginEnabled({ workspaceId: WS, pluginId: 'resend', enabled: false, actor: 'owner', agentPluginLayout: { root: 'unused', workspacesDir: 'unused', forWorkspace: () => { throw new Error('disabled adapter ownership is already loaded'); } } });
  const selection = await readMailProviderSetting({ settingsRepo: f.settingsRepo, workspaceId: WS });
  assert.deepEqual(selection, { transactional: null, bulk: null });
  const afterOff = await f.site.mailer.send(message(), options('off'));
  return { first, second, requests: f.http, ledger: f.ledgerCalls, counters: f.counters(), card, selection, afterOff };
}

test('real bundled resend and SMTP composition retain requests, ordered ledger, policy, identity, status, rotation, cards and counters', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(AT) });
  const snapshot = { transport: await transportAndStatus(), smtp: await smtpAndFallbackName(), policies: await policies(), refusals: await refusals(), lifecycle: await rotationOffAndCards() };
  const json = JSON.stringify(snapshot, null, 2) + '\n';
  if (process.env.MAIL_SEND_GOLDEN_WRITE === '1') writeFileSync(GOLDEN, json);
  assert.deepEqual(JSON.parse(json), JSON.parse(readFileSync(GOLDEN, 'utf8')));
});
