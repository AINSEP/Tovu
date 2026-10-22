import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePluginCredentialCards, mergePluginCredentialCards, credentialCardsContribution } from '../../credential-cards.js';
import { applyPluginCredentialCard, buildPluginCredentialForm, readPluginCredentialValues, findPluginCredentialCard } from '../../../custom-credentials/plugin-credential-card.js';

const declaration = { target: 'example', label: 'Example key', category: 'hosting', baseUrl: 'https://api.example.com', title: 'Connect Example', intro: 'Publish this site.', keyHint: 'Grant deployment write access.' };
const manifest = (cards: unknown) => JSON.stringify({ extensions: { tovu: { credentialCards: cards } } });

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
  assert.throws(() => mergePluginCredentialCards({ mailCards: dynamic.descriptors, manifestCards: dynamic.descriptors }), /duplicate/i);
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
  assert.deepEqual(rendered.fields[1], { ...form.fields[1], hint: declaration.keyHint });
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
