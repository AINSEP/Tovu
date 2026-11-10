/**
 * @file EXTRACT-S8 C2 part 2: the credential tools take their vocabulary, card identity, words and
 * surface helpers from host inputs, and Tovu's old entries keep their exact bytes.
 *
 * A second host ("acme") with a different permission, entity type, domain, catalog path, tool id,
 * namespace, card path, apps, answer value and sentences proves each input is actually used; the
 * old-entry hashes were recorded from the same functions before the seams (see the support file).
 */
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from 'node:assert/strict';
import test from 'node:test';
import { indexCatalogById, type AgentToolDefinition } from '@jini-ai/core';
import { askThenReport, SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM } from '@jini-ai/daemon/surface-exchanges';
import { buildFormSurface } from '@jini-ai/ui/mcp-ui/surfaces';
import { toolMetadata } from '../../../contracts/core/tool-metadata/custom-credentials.js';
import { customCredentialsAgentToolCatalog } from '../agent-tools.js';
import { catalog as tovuCopyCatalog, createCredentialCopyRegistrations, CREDENTIAL_COPY_TOOL_ID } from '../credential-copy-tool.js';
import type { CredentialCardIdentity, CredentialCopyToolHost, CustomCredentialToolHost } from '../credential-tool-host.js';
import { createApiCredentialSaveHandlers, createCustomCredentialsRegistrations } from '../tool-registrations.js';
import { tovuCredentialCardIdentity } from '../tovu-credential-card-identity.js';
import { captureCard, credentialToolDeps, ctx, fakeProjectKeys, fixedExchanges, oldEntryHashes } from './extract-s8-c2p2-pins.support.js';

/** Recorded on the unmodified code (Tovu 3aa67be7, before the C2 part 2 seam commit).
 * copyCard and copyDescriptors re-recorded after 0b05623b changed the card and tool descriptions. */
const OLD_ENTRY_HASHES = {
  copyCard: 'cb44d9f7877e4d5549f0fbbd94c7f4a8e4aeb8456145d518aee35634ffb2f3f3',
  createCard: '63acf4f1ca0d7ccbd35f7415f086baf8c1f4225ec49d85aa0dd355b187251a75',
  credentialDescriptors: '657345d5ad0d9c5491c2d8d26ac3645a9752eeefba30697b775cd4ff446df6cb',
  copyDescriptors: '2c672a02b463975fd653fcf53f9bea388f85f79929b0d433b5797575492a71d1',
};

const ACME_IDENTITY: CredentialCardIdentity = {
  uriNamespace: 'acme',
  appNames: {
    create: { appName: 'acme-key-create', appVersion: '7' },
    createOutcome: { appName: 'acme-key-create-done', appVersion: '7' },
    setToken: { appName: 'acme-key-rotate', appVersion: '7' },
    setTokenOutcome: { appName: 'acme-key-rotate-done', appVersion: '7' },
  },
};

const ACME_COPY_TOOL = 'acme_pick_key';
function acmeCopyHost({ catalog }: { catalog?: readonly AgentToolDefinition[] } = {}): CredentialCopyToolHost {
  return {
    vocabulary: { toolId: ACME_COPY_TOOL, domain: 'acme-keys', catalogModule: 'acme/keys/tools.ts',
      ownerPermission: 'acme.owner', newKeyValue: '~fresh', cardPath: 'pick-key' },
    cardIdentity: ACME_IDENTITY,
    catalog: catalog ?? [{ ...tovuCopyCatalog[0]!, name: ACME_COPY_TOOL, description: 'Pick an Acme key for this shop.' }],
    metadata: { [ACME_COPY_TOOL]: toolMetadata[CREDENTIAL_COPY_TOOL_ID]! },
    derivedRisk: new Map([[ACME_COPY_TOOL, 'mutates-durable-state']]),
    messages: { ownerOnly: 'ACME owner only', instanceRefused: 'ACME instance refused', unexpectedField: 'ACME unexpected field',
      notOffered: 'ACME not offered', inputNotEmpty: 'ACME input not empty', keysUnavailable: 'ACME keys unavailable',
      needsInteractive: 'ACME needs a card', cardTitle: 'ACME pick a key', siteLabel: 'Shop', siteFallback: 'This shop',
      cardDescription: 'ACME nothing is copied', emptyCardDescription: 'ACME no keys yet', lockedLabel: ({ names }) => `ACME locked: ${names.join('; ')}`,
      outcomes: { dismissed: 'ACME closed', interrupted: 'ACME run ended', nothingToPick: 'ACME nothing to pick' }, fieldLabel: 'ACME keys', fieldPlaceholder: 'ACME choose', newKeyLabel: 'ACME new key',
      submitLabel: 'ACME use it', cancelLabel: 'ACME stop' },
    protocol: { askThenReport, buildFormSurface },
  };
}

function acmeCredentialHost(): CustomCredentialToolHost {
  return {
    vocabulary: { domain: 'acme-creds', entityType: 'acme-entity', permissions: { read: 'acme.creds.see', write: 'acme.creds.change' },
      catalogModule: 'acme/creds/tools.ts', metadata: toolMetadata, catalog: indexCatalogById({ catalog: customCredentialsAgentToolCatalog }) },
    cardIdentity: ACME_IDENTITY,
  };
}

function acmeCopy({ log, authorizeCalls, permission, refuseUse, deny }: {
  log: string[]; authorizeCalls: Record<string, unknown>[]; permission?: string; refuseUse?: boolean; deny?: () => boolean;
}) {
  const exchanges = fixedExchanges('pick');
  const [tool] = createCredentialCopyRegistrations({ deps: { workspaceId: 'shop-1', ownerPrincipalId: Promise.resolve('owner'),
    projectKeys: fakeProjectKeys({ log, permission: permission ?? 'acme.keys.write', refuseUse: refuseUse ?? false }),
    authorize: async (params) => { authorizeCalls.push({ ...params }); return deny?.() ? { allowed: false, reason: 'denied' } : { allowed: true, reason: 'fixture' }; },
    gatedMutations: { gatewayDeps: {} } }, surfaces: { surfaceExchanges: exchanges }, host: acmeCopyHost() });
  return { tool: tool!, exchanges };
}

test('old entries keep the exact bytes recorded before the seams: copy card, create card, descriptors', async () => {
  assert.deepEqual(await oldEntryHashes(), OLD_ENTRY_HASHES);
});

test('Tovu binds namespace tovu and the exact app names its cards always reported', () => {
  assert.equal(tovuCredentialCardIdentity.uriNamespace, 'tovu');
  assert.deepEqual(Object.values(tovuCredentialCardIdentity.appNames).map(app => `${app.appName}@${app.appVersion}`), [
    'tovu-custom-credential-create@1', 'tovu-custom-credential-create-outcome@1',
    'tovu-custom-credential-set-token@1', 'tovu-custom-credential-set-token-outcome@1']);
});

test('copy: a second host\'s tool id, namespace, card path, answer value and words are the ones used', async () => {
  const log: string[] = [];
  const authorizeCalls: Record<string, unknown>[] = [];
  const { tool, exchanges } = acmeCopy({ log, authorizeCalls });
  assert.equal(tool.descriptor.id, ACME_COPY_TOOL);
  let html = '';
  const result = await tool.handler(ctx('pick'), { emitSurface: async emission => {
    html = JSON.stringify(emission);
    setImmediate(() => exchanges.deliver({ exchangeId: 'pick-1', principalId: 'owner', params: { [SURFACE_EXCHANGE_ID_PARAM]: 'pick-1', credentialId: 'key-a' } },
      { toolId: ACME_COPY_TOOL, channel: 'mcp-ui' }));
  } });
  assert.match(html, /ui:\/\/acme\/pick-key\/pick-1/);
  assert.doesNotMatch(html, /ui:\/\/tovu|use-saved-key|Shared Keys|:new-key/);
  for (const words of ['ACME pick a key', 'Shop', 'Site A', 'ACME nothing is copied', 'ACME keys', 'ACME choose', 'ACME new key', '~fresh', 'ACME use it', 'ACME stop']) {
    assert.ok(html.includes(words), `card shows the host's ${words}`);
  }
  assert.deepEqual(result, { granted: true, credentialId: 'key-a' });
  assert.deepEqual(log, ['listChoices', 'permissionFor:key-a', 'use:key-a:true']);
  // Owner permission before the inventory, then owner + the key's own permission after the answer.
  assert.deepEqual(authorizeCalls.map(call => call.permission), ['acme.owner', 'acme.owner', 'acme.keys.write']);
  assert.ok(authorizeCalls.every(call => call.workspaceId === 'shop-1'));
});

test('copy: the host\'s new-key value routes to saveNew; Tovu\'s value is just an unoffered id', async () => {
  const run = async (credentialId: string) => {
    const exchanges = fixedExchanges('pick');
    let saved = 0;
    const [tool] = createCredentialCopyRegistrations({ deps: { workspaceId: 'shop-1', ownerPrincipalId: Promise.resolve('owner'),
      projectKeys: fakeProjectKeys({ log: [] }), authorize: async () => ({ allowed: true, reason: 'fixture' }), gatedMutations: { gatewayDeps: {} } },
    surfaces: { surfaceExchanges: exchanges }, host: acmeCopyHost() }, { saveNew: async () => { saved++; return { normalCard: true }; } });
    const result = await tool!.handler(ctx('pick'), { emitSurface: async () => {
      setImmediate(() => exchanges.deliver({ exchangeId: 'pick-1', principalId: 'owner', params: { credentialId } }, { toolId: ACME_COPY_TOOL, channel: 'mcp-ui' }));
    } }).then(value => ({ value }), (error: unknown) => ({ error }));
    return { result, saved };
  };
  const fresh = await run('~fresh');
  assert.deepEqual(fresh, { result: { value: { normalCard: true } }, saved: 1 });
  const tovuValue = await run(':new-key');
  assert.equal(tovuValue.saved, 0);
  assert.equal((tovuValue.result as { error: Error }).error.message, 'ACME not offered');
});

test('copy: the host\'s owner, input and channel messages are the refusals the model sees', async () => {
  const { tool } = acmeCopy({ log: [], authorizeCalls: [] });
  await assert.rejects(tool.handler({ ...ctx('pick'), principal: { id: 'someone-else' } }, {}), { message: 'ACME owner only' });
  await assert.rejects(tool.handler({ ...ctx('pick'), input: { siteId: 'x' } }, {}), { message: 'ACME input not empty' });
  await assert.rejects(tool.handler(ctx('pick'), {}), { message: 'ACME needs a card' });
});

test('copy: permission is re-checked after the answer and a revoked key is refused by use; nothing is granted', async () => {
  let denied = false;
  const log: string[] = [];
  const { tool, exchanges } = acmeCopy({ log, authorizeCalls: [], deny: () => denied });
  const answer = (params: Record<string, unknown>) => tool.handler(ctx('pick'), { emitSurface: async () => {
    denied = true;
    setImmediate(() => exchanges.deliver({ exchangeId: 'pick-1', principalId: 'owner', params }, { toolId: ACME_COPY_TOOL, channel: 'mcp-ui' }));
  } });
  await assert.rejects(answer({ credentialId: 'key-a' }));
  assert.deepEqual(log, ['listChoices', 'permissionFor:key-a'], 'a session that lost the permission while the card was open never reaches use');
  const revoked = acmeCopy({ log: [], authorizeCalls: [], refuseUse: true });
  await assert.rejects(revoked.tool.handler(ctx('pick'), { emitSurface: async () => {
    setImmediate(() => revoked.exchanges.deliver({ exchangeId: 'pick-1', principalId: 'owner', params: { credentialId: 'key-a' } }, { toolId: ACME_COPY_TOOL, channel: 'mcp-ui' }));
  } }), { message: 'key no longer exists' });
  const dismissed = acmeCopy({ log: [], authorizeCalls: [] });
  assert.deepEqual(await dismissed.tool.handler(ctx('pick'), { emitSurface: async () => {
    setImmediate(() => dismissed.exchanges.deliver({ exchangeId: 'pick-1', principalId: 'owner', params: { [SURFACE_DISMISSED_PARAM]: true } }, { toolId: ACME_COPY_TOOL, channel: 'mcp-ui' }));
  } }), { granted: false, reason: 'dismissed', message: 'ACME closed' });
});

test('copy: the host\'s domain and catalog path name a catalog that drifted from its handlers', () => {
  assert.throws(() => createCredentialCopyRegistrations({ deps: { workspaceId: 'shop-1', ownerPrincipalId: Promise.resolve('owner'),
    authorize: async () => ({ allowed: true, reason: 'fixture' }), gatedMutations: { gatewayDeps: {} } },
  surfaces: { surfaceExchanges: fixedExchanges('pick') }, host: acmeCopyHost({ catalog: [] }) }),
  /acme-keys catalog has no entry named 'acme_pick_key' — acme\/keys\/tools\.ts drifted/);
});

test('custom credentials: a second host\'s read/write permissions and entity type gate the tools', async () => {
  const authorizeCalls: Record<string, unknown>[] = [];
  const deps = credentialToolDeps({ authorizeCalls });
  const registrations = new Map(createCustomCredentialsRegistrations({ routeDeps: deps, surfaces: { surfaceExchanges: fixedExchanges('acme') }, host: acmeCredentialHost() })
    .map(registration => [registration.descriptor.id, registration]));
  await registrations.get('custom_credential_list')!.handler({ ...ctx('list'), input: {} }, {});
  // The unknown label is refused after the permission check, whichever way the refusal is reported.
  await registrations.get('custom_credential_make_request')!.handler({ ...ctx('req'), input: { label: 'Missing', method: 'GET', url: 'https://api.acme.test/v1' } }, {})
    .catch(() => undefined);
  assert.deepEqual(authorizeCalls.map(call => [call.permission, call.entityType]), [['acme.creds.see', 'acme-entity'], ['acme.creds.change', 'acme-entity']]);
});

test('custom credentials: the host\'s domain and catalog path name a catalog that drifted from its handlers', () => {
  const host = acmeCredentialHost();
  assert.throws(() => createCustomCredentialsRegistrations({ routeDeps: credentialToolDeps({ authorizeCalls: [] }), surfaces: { surfaceExchanges: fixedExchanges('acme') },
    host: { ...host, vocabulary: { ...host.vocabulary, catalog: new Map() } } }), /acme-creds catalog has no entry named '[a-z_]+' — acme\/creds\/tools\.ts drifted/);
});

test('create card: the second host\'s namespace, app and write permission are used; Tovu\'s are absent', async () => {
  const authorizeCalls: Record<string, unknown>[] = [];
  const exchanges = fixedExchanges('acme');
  const { create } = createApiCredentialSaveHandlers({ routeDeps: credentialToolDeps({ authorizeCalls }), surfaces: { surfaceExchanges: exchanges }, host: acmeCredentialHost() });
  const { emission, result } = await captureCard({ exchanges, exchangeId: 'acme-1', toolId: 'credential_save', invoke: emitSurface => create(ctx('create'), { emitSurface }) });
  const text = JSON.stringify(emission);
  assert.match(text, /ui:\/\/acme\/secret-card\/credential_save\/acme-1/);
  assert.ok(text.includes('acme-key-create') && text.includes('\\"7\\"'), 'the card reports the host app and version');
  assert.doesNotMatch(text, /ui:\/\/tovu|tovu-custom-credential/);
  assert.deepEqual(authorizeCalls.map(call => [call.permission, call.entityType]), [['acme.creds.change', 'acme-entity']]);
  assert.deepEqual(result, { created: false, reason: 'cancelled' });
});
