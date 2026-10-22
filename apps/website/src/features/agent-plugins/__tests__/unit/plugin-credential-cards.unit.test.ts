import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePluginCredentialCards, mergePluginCredentialCards, credentialCardsContribution } from '../../credential-cards.js';
import { applyPluginCredentialCard, buildPluginCredentialForm, readPluginCredentialValues, findPluginCredentialCard } from '../../../custom-credentials/plugin-credential-card.js';

const declaration = { target: 'example', label: 'Example key', category: 'hosting', baseUrl: 'https://api.example.com', title: 'Connect Example', intro: 'Publish this site.', keyHint: 'Grant deployment write access.' };
const manifest = (cards: unknown) => JSON.stringify({ extensions: { tovu: { credentialCards: cards } } });

test('an owned API label is explicit, preserved and limited to that card destination', () => {
  for (const saveKind of [undefined, 'api']) {
    const parsed = parsePluginCredentialCards({ raw: manifest([{ ...declaration, saveKind, ownedApiLabel: 'Example key' }]) });
    assert.ok(parsed.ok);
    assert.equal(parsed.descriptors[0]!.ownedApiLabel, 'Example key');
    assert.equal(readPluginCredentialValues({ card: parsed.descriptors[0]!, values: { token: 'key', label: 'injected' } }).label, 'Example key');
  }
  for (const ownedApiLabel of ['', 42, 'Another key', 'x'.repeat(2001)]) {
    assert.equal(parsePluginCredentialCards({ raw: manifest([{ ...declaration, ownedApiLabel }]) }).ok, false);
  }
  for (const saveKind of ['publish-host', 'source-control', 'agent-plugin-token', 'oauth']) {
    assert.equal(parsePluginCredentialCards({ raw: manifest([{ ...declaration, saveKind, ownedApiLabel: 'Example key' }]) }).ok, false);
  }
});

test('manifest cards normalize target identity and preserve declared fields without changing mail cards', () => {
  const parsed = parsePluginCredentialCards({ raw: manifest([{ ...declaration, fields: [{ name: 'username', label: 'Account name', required: true }] }]) });
  assert.ok(parsed.ok);
  assert.equal(parsed.descriptors[0]!.providerId, 'example');
  const form = buildPluginCredentialForm({ card: parsed.descriptors[0]! });
  assert.deepEqual(form.fields.map(f => [f.name, f.secret === true]), [['username', false], ['token', true]]);
  const mail = { providerId: 'mail', label: 'Mail key', category: 'general', baseUrl: 'https://mail.example.com', title: 'Mail' };
  assert.equal(mergePluginCredentialCards({ mailCards: [mail], manifestCards: parsed.descriptors })[0], mail);
  assert.deepEqual(buildPluginCredentialForm({ card: mail }).fields, [{ kind: 'string', name: 'token', label: 'API key', hint: 'Paste the key here. It is never shown to the assistant.', required: true, secret: true }]);
});

test('missing extension is supported; malformed declarations and repeated targets fail closed', () => {
  assert.deepEqual(parsePluginCredentialCards({ raw: '{}' }), { ok: true, descriptors: [] });
  for (const raw of ['{', manifest({}), manifest([declaration, declaration]), manifest([{ ...declaration, baseUrl: 'http://plain.example' }]), manifest([{ ...declaration, helpUrl: 'javascript:alert(1)' }]), manifest([{ ...declaration, fields: [{ name: 'token', label: 'Visible token' }] }]), manifest([{ ...declaration, fields: [{ name: 'username', label: 'User', secret: true }] }]), manifest([{ ...declaration, category: 'invalid' }]), manifest([{ ...declaration, saveKind: 'unknown' }])]) {
    assert.equal(parsePluginCredentialCards({ raw }).ok, false, raw);
  }
});

test('dynamic host and OAuth cards have explicit contracts; duplicate merged ids are refused', () => {
  const dynamic = parsePluginCredentialCards({ raw: manifest([{ ...declaration, baseUrl: undefined, fields: [{ name: 'baseUrl', label: 'Server URL', required: true }] }]) });
  assert.ok(dynamic.ok);
  assert.equal(dynamic.descriptors[0]!.baseUrl, '');
  const oauth = parsePluginCredentialCards({ raw: manifest([{ ...declaration, saveKind: 'oauth', permissions: 'Discover models; generation needs a separate write grant.' }]) });
  assert.ok(oauth.ok);
  assert.equal(oauth.descriptors[0]!.permissions, 'Discover models; generation needs a separate write grant.');
  const refusals: string[] = [];
  assert.deepEqual(mergePluginCredentialCards({ mailCards: dynamic.descriptors, manifestCards: dynamic.descriptors }, { onRefusal: message => refusals.push(message) }), dynamic.descriptors);
  assert.match(refusals[0]!, /duplicate/i);
  assert.equal(credentialCardsContribution.kind, 'data');
  assert.equal(credentialCardsContribution.filename, 'plugin.json');
});


test('domain forms keep required fields and update rules while plugin copy replaces the generic card', () => {
  const form = { title: 'Generic', submitLabel: 'Save', description: 'Repository rules', fields: [
    { kind: 'string' as const, name: 'accountId', label: 'Account', required: true },
    { kind: 'string' as const, name: 'secretAccessKey', label: 'Key', secret: true as const, required: false, allowBlank: true },
  ] };
  const card = { ...declaration, providerId: declaration.target, saveKind: 'publish-host' as const };
  const rendered = applyPluginCredentialCard({ card, form });
  assert.equal(rendered.title, declaration.title);
  assert.ok(!rendered.details?.some(detail => detail.label === 'Saved as'));
  assert.match(rendered.description!, /Publish this site/);
  assert.match(rendered.description!, /Repository rules/);
  assert.deepEqual(rendered.fields[0], form.fields[0]);
  assert.deepEqual(rendered.fields[1], form.fields[1], 'unrelated secret fields keep their own hint');
  assert.equal(applyPluginCredentialCard({ form }), form);
});


test('API submissions preserve server metadata and accept only declared public fields', () => {
  const card = { ...declaration, providerId: declaration.target, fields: [{ name: 'username', label: 'User', required: true }], additionalHosts: ['https://other.example.com'] };
  const values = readPluginCredentialValues({ card, values: { token: 'human-key', username: 'account', label: 'injected', category: 'media', baseUrl: 'https://wrong.example.com', additionalHosts: ['https://wrong.example.com'] } });
  assert.deepEqual(values, { label: declaration.label, category: declaration.category, baseUrl: declaration.baseUrl, username: 'account', token: 'human-key', additionalHosts: ['https://other.example.com'] });
  assert.throws(() => readPluginCredentialValues({ card, values: { token: 'human-key', username: '' } }), /required/);
  const dynamic = { ...card, baseUrl: '', fields: [{ name: 'baseUrl', label: 'Server', required: true }] };
  assert.equal(readPluginCredentialValues({ card: dynamic, values: { token: 'key', baseUrl: 'https://instance.example.com' } }).baseUrl, 'https://instance.example.com');
  assert.throws(() => readPluginCredentialValues({ card: dynamic, values: { token: 'key', baseUrl: 'http://instance.example.com' } }), /HTTPS/);
});

test('declaration limits, supported API fields and server-owned extra origins are enforced', () => {
  const invalid = [
    { ...declaration, additionalHosts: ['https://user:password@example.com'] },
    { ...declaration, additionalHosts: ['https://example.com/path'] },
    { ...declaration, additionalHosts: ['http://example.com'] },
    { ...declaration, additionalHosts: Array(9).fill('https://example.com') },
    { ...declaration, fields: [{ name: 'accountId', label: 'Account' }] },
    { ...declaration, fields: [{ name: 'username', label: 'User' }, { name: 'username', label: 'User' }] },
    { ...declaration, fields: Array(17).fill({ name: 'username', label: 'User' }) },
    { ...declaration, saveTarget: '../other' },
  ];
  for (const value of invalid) assert.equal(parsePluginCredentialCards({ raw: manifest([value]) }).ok, false);
  assert.equal(parsePluginCredentialCards({ raw: manifest(Array(33).fill(declaration)) }).ok, false);
  const parsed = parsePluginCredentialCards({ raw: manifest([{ ...declaration, additionalHosts: ['https://secondary.example.com'] }]) });
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.descriptors[0]!.additionalHosts, ['https://secondary.example.com']);
});


test('domain card lookup matches both the save owner and its provider id', async () => {
  const card = { ...declaration, providerId: 'own-card', saveKind: 'publish-host' as const, saveTarget: 'host' };
  const loadCards = async (workspaceId: string) => { assert.equal(workspaceId, 'workspace'); return [card]; };
  assert.equal(await findPluginCredentialCard({ loadCards, workspaceId: 'workspace', saveKind: 'publish-host', target: 'host' }), card);
  assert.equal(await findPluginCredentialCard({ loadCards, workspaceId: 'workspace', saveKind: 'source-control', target: 'host' }), undefined);
  assert.equal(await findPluginCredentialCard({ workspaceId: 'workspace', saveKind: 'publish-host', target: 'host' }), undefined);
});

test('optional card failures preserve the default form for every domain', async () => {
  for (const saveKind of ['publish-host', 'source-control', 'agent-plugin-token', 'api'] as const) {
    const card = await findPluginCredentialCard({ workspaceId: 'workspace', saveKind, target: 'host', loadCards: async () => { throw new Error('broken layout'); } });
    const form = { title: 'Domain default', submitLabel: 'Save', fields: [] };
    assert.equal(applyPluginCredentialCard({ card, form }), form);
  }
});

test('all colliding manifest cards are dropped regardless of order, and mail wins', () => {
  const card = { ...declaration, providerId: 'same' };
  const other = { ...card, title: 'Other' };
  for (const manifestCards of [[card, other], [other, card]]) {
    const refusals: string[] = [];
    assert.deepEqual(mergePluginCredentialCards({ mailCards: [], manifestCards }, { onRefusal: message => refusals.push(message) }), []);
    assert.equal(refusals.length, 2);
    assert.deepEqual(mergePluginCredentialCards({ mailCards: [card], manifestCards }, { onRefusal: () => undefined }), [card]);
  }
});

test('domain copy keeps credential details, one sealing description and unrelated secret hints', () => {
  const card = { ...declaration, providerId: 'example', helpUrl: 'https://example.com/keys' };
  const form = { title: 'Rotate', submitLabel: 'Rotate', description: 'Sealed by the domain.', details: [{ label: 'Credential', value: 'existing' }], fields: [
    { kind: 'string' as const, name: 'token', label: 'Token', secret: true, hint: 'Old token hint' },
    { kind: 'string' as const, name: 'password', label: 'Password', secret: true, hint: 'Password hint' },
  ] };
  const rendered = applyPluginCredentialCard({ card, form });
  assert.deepEqual(rendered.details?.[0], form.details[0]);
  assert.ok(rendered.details?.some(detail => detail.value === card.helpUrl));
  assert.equal(rendered.fields[0]!.hint, card.keyHint);
  assert.equal(rendered.fields[1]!.hint, 'Password hint');
  assert.equal(rendered.description, 'Publish this site. Sealed by the domain.');
});

test('only API forms may declare public input fields', () => {
  for (const saveKind of ['publish-host', 'source-control', 'agent-plugin-token', 'oauth']) {
    assert.equal(parsePluginCredentialCards({ raw: manifest([{ ...declaration, saveKind, fields: [{ name: 'username', label: 'Account' }] }]) }).ok, false);
  }
});

test('every bundled plugin credential declaration passes the real parser', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const root = new URL('../../../../../../../content/agent-plugins/', import.meta.url);
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let raw: string;
    try { raw = await readFile(new URL(`${entry.name}/plugin.json`, root), 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    const parsed = parsePluginCredentialCards({ raw });
    assert.ok(parsed.ok, `${entry.name}: ${parsed.ok ? '' : parsed.reason}`);
  }
});
