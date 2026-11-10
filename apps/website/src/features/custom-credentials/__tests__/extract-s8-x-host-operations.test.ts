/** @file EXTRACT-S8-X: an independent host supplies every remaining credential-tool operation. */
import '../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createApprovalHandler, indexCatalogById, type SurfaceEmission, type ToolExecutionContext, type ToolHandler } from '@jini-ai/core';
import type { CredentialSetSummary, CredentialedRequestPort, PluginCredentialCard, SourceControlFileWritePlan, SourceControlFileWriter, SourceControlWritePort } from '@jini-ai/core/contracts/credentials';
import type { SecretCardForm } from '@jini-ai/core/contracts/cards';
import { askOnce, askThenReport, classifyConfirmationAnswer, SURFACE_EXCHANGE_ID_PARAM } from '@jini-ai/daemon/surface-exchanges';
import { issueToolFailureDiagnostic } from '@jini-ai/daemon/tool-recovery';
import { buildConfirmationSurface } from '@jini-ai/ui/mcp-ui/surfaces';
import { defineSecretCardTool } from '@jini-ai/ui/mcp-ui/secret-card';
import { CredentialedRequestValidationError } from '@jini-ai/integrations/credentialed-http';
import { toolMetadata } from '../../../contracts/core/tool-metadata/custom-credentials.js';
import { customCredentialsAgentToolCatalog } from '../agent-tools.js';
import { bindTovuCredentialToolOperations, customCredentialsDerivedRisk, createCredentialSaveHandlers, createCredentialToolRegistrations } from '../tool-registrations.js';
import type { DeployTargetRegistry, LoadedDeployTarget } from '../../deployments/contracts.js';
import { CustomCredentialDuplicateLabelError, CustomCredentialValidationError, CustomCredentialSecretStoreUnconfiguredError } from '../store.js';
import type { CustomCredentialToolHost } from '../credential-tool-host.js';
import type { CredentialToolActorDeps, CredentialToolOperations } from '../credential-tool-operations.js';
import { credentialToolDeps, ctx, fixedExchanges, oldEntryHashes } from './extract-s8-c2p2-pins.support.js';

const ids = { list: 'acme_inventory', verify: 'acme_check', setUsername: 'acme_username', makeRequest: 'acme_request', writeFiles: 'acme_files', save: 'acme_save' };
const oldNames = ['custom_credential_list', 'custom_credential_verify', 'custom_credential_set_username', 'custom_credential_make_request', 'custom_credential_write_files'];
const newNames = [ids.list, ids.verify, ids.setUsername, ids.makeRequest, ids.writeFiles];
const rename = (name: string) => newNames[oldNames.indexOf(name)] ?? name;
const HOST: CustomCredentialToolHost = {
  vocabulary: {
    domain: 'acme-vault', entityType: 'acme-secret-set', permissions: { read: 'acme.inspect', write: 'acme.change' },
    catalogModule: 'acme/catalog/keys.ts',
    catalog: indexCatalogById({ catalog: customCredentialsAgentToolCatalog.map(tool => ({ ...tool, name: rename(tool.name), description: 'Acme provider operation; https://api.acme.test/example' })) }),
    metadata: Object.fromEntries(Object.entries(toolMetadata).map(([name, value]) => [rename(name), value])),
  },
  cardIdentity: { uriNamespace: 'acme', appNames: {
    create: { appName: 'acme-create', appVersion: '9' }, createOutcome: { appName: 'acme-created', appVersion: '9' },
    setToken: { appName: 'acme-replace', appVersion: '9' }, setTokenOutcome: { appName: 'acme-replaced', appVersion: '9' },
  } },
};
const SUMMARY: CredentialSetSummary = {
  credentialType: 'custom', id: 'acme-row', label: 'Acme API', category: 'widgets', baseUrl: 'https://api.acme.test', additionalHosts: [],
  worksFor: ['acme-vendor'], username: 'fresh-user', configured: true, createdAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z',
  tokenHint: { length: 30, last4: 'HINT' },
};
const PLUGIN: PluginCredentialCard = { providerId: 'acme-provider', pluginId: 'acme-plugin', ownedApiLabel: SUMMARY.label,
  label: SUMMARY.label, category: 'widgets', baseUrl: SUMMARY.baseUrl, title: 'Acme plugin card', usedFor: ['Acme purpose'], probeUrl: 'https://api.acme.test/probe' };
const PLAN: SourceControlFileWritePlan = { parentCommitSha: 'parent', baseTreeSha: 'tree', fileStates: [] };

function fixture() {
  const log: string[] = [];
  const exchanges = fixedExchanges('acme-x');
  const state = { allowed: true, plugin: undefined as PluginCredentialCard | undefined, saveError: undefined as Error | undefined,
    probe: 'ok' as 'ok' | 'refused' | 'unavailable', replaced: undefined as { token: string; username?: string } | undefined,
    created: undefined as Parameters<CredentialToolOperations['sets']['create']>[0] | undefined };
  const actor: CredentialToolActorDeps = {
    workspaceId: 'acme-workspace',
    authorize: async ({ permission, entityType }) => { log.push(`permit:${permission}:${entityType}`); return { allowed: state.allowed, reason: 'Acme authorization' }; },
    loadAuthSchemes: async () => { log.push('schemes'); return []; },
  };
  const form = (): SecretCardForm => ({ title: 'Acme human form', submitLabel: 'Acme save', fields: [
    { kind: 'string', name: 'label', label: 'Acme label' }, { kind: 'string', name: 'baseUrl', label: 'Acme origin' },
    { kind: 'string', name: 'username', label: 'Acme account' },
    { kind: 'string', name: 'token', label: 'Acme token', required: true, secret: true },
  ] });
  const operations: CredentialToolOperations = {
    sets: {
      list: async () => { log.push('list'); return [SUMMARY]; },
      describe: async () => { log.push('fresh'); return SUMMARY; },
      byLabel: async () => { log.push('byLabel'); return SUMMARY; },
      resolve: async () => { log.push('open'); return { baseUrl: SUMMARY.baseUrl, connection: { token: 'synthetic-acme-value' } }; },
      setUsername: async ({ username }) => { log.push('username'); return { ...SUMMARY, username: username ?? undefined }; },
      replace: async ({ connection, signal }) => {
        signal.throwIfAborted(); log.push('replace'); state.replaced = connection;
        if (state.saveError) throw state.saveError;
        return SUMMARY;
      },
      create: async input => {
        input.signal.throwIfAborted(); log.push('create'); state.created = input;
        if (state.saveError) throw state.saveError;
        return SUMMARY;
      },
    },
    approval: {
      handler: steps => { log.push('approval-handler'); return createApprovalHandler(steps); },
      describeDelete: ({ label, host, path }) => ({ toolId: ids.makeRequest, errorCode: 'ACME_DELETE', title: `Acme delete ${label}`,
        details: [{ label: 'Acme target', value: `${host}${path}` }], confirmLabel: 'Acme confirm' }),
      askHuman: async ({ ctx: context, description }, { emitSurface }) => {
        log.push('human-confirm'); assert.ok(emitSurface);
        const exchange = exchanges.open({ binding: { toolId: description.toolId, principalId: context.principal.id }, emit: emitSurface });
        const answer = await askOnce({ exchange, emission: { channel: 'mcp-ui', payload: { resource: buildConfirmationSurface({
          uri: `ui://acme/held-delete/${exchange.id}`, title: description.title, details: description.details,
          confirm: { label: description.confirmLabel, toolName: description.toolId, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, decision: 'confirm' } },
          cancel: { label: 'Acme cancel', toolName: description.toolId, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, decision: 'cancel' } },
          app: { appName: 'acme-confirm', appVersion: '9' },
        }) } } });
        return classifyConfirmationAnswer({ answer });
      },
    },
    pluginCards: {
      load: async () => { log.push('plugin-load'); return state.plugin ? [state.plugin] : []; },
      find: async ({ target }) => { log.push(`plugin-find:${target}`); return state.plugin; },
      readValues: ({ card, values }) => { log.push('plugin-read'); return { label: card.label, category: card.category, baseUrl: card.baseUrl, token: String(values.token) }; },
    },
    credentialCardForms: {
      create: ({ prefill, providers }) => { log.push(`form-create:${prefill.worksFor?.join(',')}:${providers[0]?.id}`); return form(); },
      createOutcome: ({ state: status, message }) => { log.push('outcome'); return { title: 'Acme outcome', state: status, message }; },
      rotate: () => { log.push('form-rotate'); return form(); },
      rotateOutcome: ({ state: status, message }) => { log.push('outcome'); return { title: 'Acme rotated', state: status, message }; },
      buildPlugin: () => { log.push('form-plugin'); return form(); },
      applyPlugin: ({ form: base }) => { log.push('form-apply'); return base; },
    },
    recovery: { withSetup: async ({ invoke }) => { log.push('recovery'); return invoke(); } },
    publish: {
      loadProviders: async () => { log.push('catalog'); return [{ id: 'acme-target', vendorId: 'acme-vendor' }]; },
      prepareInvalidation: async () => { log.push('prepare-invalidation'); return ({ after }) => { assert.equal(after, SUMMARY); log.push('invalidate'); }; },
    },
    locale: {
      resolve: async ({ principalId }) => { log.push(`locale:${principalId}`); return 'acme-locale'; },
      text: ({ id, locale }) => `ACME ${id} ${locale}`,
      hint: ({ locale }) => `ACME human hint ${locale}`,
      translate: ({ message, locale }) => `ACME translation ${locale}: ${message}`,
    },
    policy: {
      guardRepo: ({ store, signal }) => { signal.throwIfAborted(); return store; },
      cleanToken: ({ token }) => { log.push('clean-token'); return token.trim(); },
      assertFreeField: ({ field }) => { log.push(`public:${field}`); },
      normalizeWorksFor: () => { log.push('worksFor'); return ['acme-normalized']; },
      defaultCategory: 'widgets', isProjectConflict: ({ error }) => error.message === 'ACME trusted project conflict',
      validateWriteFiles: () => { log.push('validate-files'); return { branch: 'acme-branch', commitMessage: 'Acme commit', files: [{ path: 'README.md', content: 'Acme content' }] }; },
    },
    messages: {
      formSaveFailure: 'ACME internal save failure', noCreateChannel: 'ACME create needs human', noRotateChannel: 'ACME rotate needs human',
      noDeleteChannel: 'ACME delete needs human', runEnded: 'ACME run ended', invalidWorksFor: 'ACME invalid compatibility', unlabeled: 'ACME unnamed',
      missingUsername: 'ACME username missing', invalidUsername: 'ACME username invalid', probeOriginMismatch: 'ACME origin changed',
      unexpectedUsername: ({ keys }) => `ACME username keys ${keys.join(',')}`, unexpectedToken: ({ keys }) => `ACME token keys ${keys.join(',')}`,
      notFoundLabel: ({ label }) => `ACME label ${label}`, notFoundId: ({ id }) => `ACME row ${id}`, duplicateLabel: ({ label }) => `ACME duplicate ${label}`,
      missingPluginCard: ({ providerId }) => `ACME missing card ${providerId}`, writeFailure: ({ message }) => `ACME files ${message}`,
      probeFailure: ({ status, replacing }) => `ACME probe ${status}; replacing=${replacing}`,
    },
    diagnostics: {
      describeError: () => 'AcmeErrorKind', createFailure: () => { log.push('create-failure-log'); },
      rotateFailure: ({ errorSummary }) => { log.push(`rotate-failure-log:${errorSummary}`); },
      writeFailure: ({ phase }) => { log.push(`write-log:${phase}`); },
    },
    ids, derivedRisk: new Map([...customCredentialsDerivedRisk].map(([id, risk]) => [rename(id), risk])),
    modelFacingErrors: [{ error: CustomCredentialValidationError, code: 'ACME_VALIDATION' }],
    formErrors: [{ error: CustomCredentialValidationError }, { error: CustomCredentialSecretStoreUnconfiguredError, message: 'ACME safe storage failure' }],
  };
  const request: CredentialedRequestPort = {
    request: async ({ method }) => { log.push(`request:${method}`); return { executed: true, status: 200, headers: {}, bodyText: 'Acme response' }; },
    resolveTarget: async ({ label, url }) => { log.push('target'); return { label, url: new URL(url) }; },
    verify: async () => { log.push('verify'); return { status: 'valid', message: 'Acme verified', checkedAt: SUMMARY.createdAt }; },
    probe: async () => { log.push('probe'); return state.probe; },
    classifyError: ({ error }) => ({ category: 'unknown', error }),
  };
  const provider: SourceControlFileWriter = {
    planFileWrite: async () => ({ ok: true, plan: PLAN }), commitFiles: async () => ({ ok: true, commitSha: 'acme-sha', commitUrl: 'https://acme.test/commit' }),
  };
  const sourceControlWrite: SourceControlWritePort = {
    build: async () => { log.push('build'); return { ok: true, provider }; },
    validateTarget: ({ provider: actual }) => { assert.equal(actual, provider); log.push('validate-target'); return { owner: 'acme-owner', repo: 'acme-repo' }; },
    planFileWrite: async ({ provider: actual }) => { assert.equal(actual, provider); log.push('plan'); return { ok: true, plan: PLAN }; },
    commitFiles: async ({ provider: actual, plan }) => { assert.equal(actual, provider); assert.equal(plan, PLAN); log.push('commit'); return { ok: true, commitSha: 'acme-sha', commitUrl: 'https://acme.test/commit' }; },
  };
  const ports = { credentialedRequest: request, sourceControlWrite };
  const handlers = () => new Map(createCredentialToolRegistrations({ routeDeps: actor, host: HOST, ports, operations }).map(r => [r.descriptor.id, r.handler]));
  const save = () => createCredentialSaveHandlers({ routeDeps: actor, surfaces: { surfaceExchanges: exchanges }, host: HOST, ports,
    cards: { defineSecretCardTool, askThenReport }, operations });
  return { actor, operations, state, log, exchanges, ports, handlers, save };
}

function context(input: unknown): ToolExecutionContext { return { ...ctx('acme-exec'), input }; }
async function submit(f: ReturnType<typeof fixture>, handler: ToolHandler, input: unknown, values: Record<string, unknown>) {
  const emitted: SurfaceEmission[] = [];
  const result = await handler(context(input), { emitSurface: async emission => {
    emitted.push(emission);
    if (emitted.length === 1) setImmediate(() => f.exchanges.deliver({ exchangeId: 'acme-x-1', principalId: 'owner', params: values }, { toolId: ids.save, channel: 'mcp-ui' }));
  } });
  return { result, emitted };
}

// copyCard and copyDescriptors re-recorded after 0b05623b changed the card and tool descriptions
// (the same values extract-s8-c2p2-host-inputs.test.ts pins; createCard/credentialDescriptors unchanged).
test('old entries retain the four independently recorded card/descriptor hashes', async () => {
  assert.deepEqual(await oldEntryHashes(), {
    copyCard: 'cb44d9f7877e4d5549f0fbbd94c7f4a8e4aeb8456145d518aee35634ffb2f3f3',
    createCard: '63acf4f1ca0d7ccbd35f7415f086baf8c1f4225ec49d85aa0dd355b187251a75',
    credentialDescriptors: '657345d5ad0d9c5491c2d8d26ac3645a9752eeefba30697b775cd4ff446df6cb',
    copyDescriptors: '2c672a02b463975fd653fcf53f9bea388f85f79929b0d433b5797575492a71d1',
  });
});

test('foreign handler keys, catalog path, permissions and plugin-owned labels are actually consumed', async () => {
  const f = fixture(); f.state.plugin = PLUGIN;
  const registrations = createCredentialToolRegistrations({ routeDeps: f.actor, host: HOST, ports: f.ports, operations: f.operations });
  assert.deepEqual(registrations.map(r => r.descriptor.id), [ids.list, ids.verify, ids.setUsername, ids.makeRequest, ids.writeFiles]);
  const result = await f.handlers().get(ids.list)!(context({}));
  const { tokenHint: _humanOnly, ...safe } = SUMMARY;
  assert.deepEqual(result, { credentials: [{ ...safe, pluginId: PLUGIN.pluginId, usedFor: PLUGIN.usedFor }] });
  assert.deepEqual(f.log, ['permit:acme.inspect:acme-secret-set', 'list', 'plugin-load']);
  assert.equal(JSON.stringify(result).includes('HINT'), false);
  assert.throws(() => createCredentialToolRegistrations({ routeDeps: f.actor, host: { ...HOST, vocabulary: { ...HOST.vocabulary, catalog: new Map() } }, ports: f.ports, operations: f.operations }), /acme\/catalog\/keys\.ts/);
});

test('injected recovery preserves the host-issued diagnostic object without decrypting', async () => {
  const f = fixture();
  const diagnostic = issueToolFailureDiagnostic({ diagnostic: { hint: 'Acme setup hint', remedyToolId: ids.save } });
  f.operations.recovery.withSetup = async () => ({ executed: false, credentialSetup: diagnostic });
  const result = await f.handlers().get(ids.verify)!(context({ label: SUMMARY.label })) as { credentialSetup: object };
  assert.equal(result.credentialSetup, diagnostic);
  assert.deepEqual(f.log, ['permit:acme.inspect:acme-secret-set']);
});

test('approval lifecycle and human-confirm use the foreign URI and SAME answer store; decline sends nothing', async () => {
  const f = fixture(); let emitted = '';
  const result = await f.handlers().get(ids.makeRequest)!(context({ label: SUMMARY.label, method: 'DELETE', url: 'https://api.acme.test/items/3' }), {
    emitSurface: async emission => { emitted = JSON.stringify(emission); setImmediate(() => f.exchanges.deliver({ exchangeId: 'acme-x-1', principalId: 'owner', params: { decision: 'cancel' } }, { toolId: ids.makeRequest, channel: 'mcp-ui' })); },
  });
  assert.deepEqual(result, { executed: false, cancelled: true });
  assert.match(emitted, /ui:\/\/acme\/held-delete\/acme-x-1/); assert.match(emitted, /acme-confirm/); assert.doesNotMatch(emitted, /tovu/i);
  assert.deepEqual(f.log, ['permit:acme.change:acme-secret-set', 'recovery', 'target', 'approval-handler', 'human-confirm']);
  assert.equal(f.exchanges.size(), 0);
});

test('approved DELETE re-admits the permission, and revocation during the human wait prevents any request', async () => {
  for (const revoke of [false, true]) {
    const f = fixture();
    const run = f.handlers().get(ids.makeRequest)!(context({ label: SUMMARY.label, method: 'DELETE', url: 'https://api.acme.test/items/3' }), {
      emitSurface: async () => { f.state.allowed = !revoke; setImmediate(() => f.exchanges.deliver({ exchangeId: 'acme-x-1', principalId: 'owner', params: { decision: 'confirm' } }, { toolId: ids.makeRequest, channel: 'mcp-ui' })); },
    });
    if (revoke) await assert.rejects(run, /acme.change/); else assert.deepEqual(await run, { executed: true, status: 200, headers: {}, bodyText: 'Acme response' });
    assert.equal(f.log.filter(s => s.startsWith('permit:')).length, 2);
    assert.equal(f.log.filter(s => s === 'request:DELETE').length, revoke ? 0 : 1);
  }
});

test('foreign form/catalog/locale/default category/worksFor/cleanup feed save; invalidate and outcome follow persistence', async () => {
  const f = fixture();
  const { result, emitted } = await submit(f, f.save().create, { label: 'Acme API', worksFor: ['input-vendor'] }, { label: 'Acme API', baseUrl: SUMMARY.baseUrl, token: ' synthetic-human-key ' });
  const { tokenHint: _humanOnly, ...safe } = SUMMARY;
  assert.deepEqual(result, { created: true, credential: safe });
  assert.equal(f.state.created?.category, 'widgets'); assert.equal(f.state.created?.baseUrl, SUMMARY.baseUrl); assert.equal(f.state.created?.connection.token, 'synthetic-human-key');
  assert.equal(f.state.created?.guardRepo, f.operations.policy.guardRepo);
  assert.ok(f.log.includes('form-create:acme-normalized:acme-target'));
  assert.deepEqual(f.log.filter(s => ['prepare-invalidation', 'create', 'invalidate', 'outcome'].includes(s)), ['prepare-invalidation', 'create', 'invalidate', 'outcome']);
  assert.equal(emitted.length, 2);
  const bytes = JSON.stringify(emitted);
  assert.match(bytes, /ui:\/\/acme\/secret-card\/acme_save\/acme-x-1/); assert.match(bytes, /acme-created/); assert.match(bytes, /ACME saved acme-locale/);
  assert.doesNotMatch(bytes, /synthetic-human-key|tovu/i); assert.doesNotMatch(JSON.stringify(result), /HINT|human hint/);
});

test('plugin load/read/build and probe are injected; a failed probe cannot save or invalidate', async () => {
  const f = fixture(); f.state.plugin = PLUGIN; f.state.probe = 'refused';
  const { result, emitted } = await submit(f, f.save().pluginProvider, { provider: PLUGIN.providerId }, { token: 'synthetic-human-key' });
  assert.deepEqual(result, { created: false, reason: 'invalid', message: 'ACME translation acme-locale: ACME probe refused; replacing=false' });
  assert.ok(f.log.includes('plugin-load')); assert.ok(f.log.includes('form-plugin')); assert.ok(f.log.includes('plugin-read')); assert.ok(f.log.includes('probe'));
  assert.equal(f.log.includes('create'), false); assert.equal(f.log.includes('invalidate'), false);
  assert.doesNotMatch(JSON.stringify(emitted), /synthetic-human-key/);
});

test('rotation finds/applies the host card and preserves the current username in the injected replacement', async () => {
  const f = fixture(); f.state.plugin = PLUGIN;
  const { result } = await submit(f, f.save().rotate, { label: SUMMARY.label }, { token: ' synthetic-replacement ' });
  assert.deepEqual(result, { saved: true });
  assert.deepEqual(f.state.replaced, { token: 'synthetic-replacement', username: 'fresh-user' });
  assert.ok(f.log.indexOf('fresh') < f.log.indexOf('probe')); assert.ok(f.log.indexOf('probe') < f.log.indexOf('replace'));
  assert.ok(f.log.includes(`plugin-find:${SUMMARY.label}`)); assert.ok(f.log.includes('form-apply'));
});

test('host form rules and safe fallback prevent raw storage/driver messages reaching either projection', async () => {
  for (const error of [new CustomCredentialSecretStoreUnconfiguredError('synthetic-human-key /private/key'), new Error('synthetic-human-key SQL')]) {
    const f = fixture(); f.state.saveError = error;
    const { result, emitted } = await submit(f, f.save().create, {}, { token: 'synthetic-human-key' });
    const message = error instanceof CustomCredentialSecretStoreUnconfiguredError ? 'ACME safe storage failure' : 'ACME internal save failure';
    assert.deepEqual(result, { created: false, reason: 'error', message: `ACME translation acme-locale: ${message}` });
    assert.doesNotMatch(JSON.stringify({ result, emitted }), /synthetic-human-key|private\/key|SQL/);
    assert.equal(f.log.includes('invalidate'), false); assert.ok(f.log.includes('create-failure-log'));
  }
});

test('duplicate and public-field errors use foreign messages and canonical model rules', async () => {
  const f = fixture(); f.state.saveError = new CustomCredentialDuplicateLabelError('internal duplicate');
  const { result } = await submit(f, f.save().create, {}, { label: 'Acme API', token: 'synthetic-human-key' });
  assert.deepEqual(result, { created: false, reason: 'duplicate-label', message: 'ACME duplicate Acme API' });
  await assert.rejects(f.handlers().get(ids.setUsername)!(context({ label: SUMMARY.label, username: 'public', token: 'secret-must-not-be-echoed' })), /ACME_VALIDATION: ACME username keys token/);
  await assert.rejects(f.save().rotate(context({ label: SUMMARY.label, token: 'secret-must-not-be-echoed' })), /ACME_VALIDATION: ACME token keys token/);
});

test('foreign file validator runs before authorization; one provider/plan survives decrypt to commit', async () => {
  const f = fixture();
  assert.deepEqual(await f.handlers().get(ids.writeFiles)!(context({ label: SUMMARY.label })), { executed: true, commitSha: 'acme-sha', commitUrl: 'https://acme.test/commit', filesWritten: 1 });
  assert.deepEqual(f.log, ['validate-files', 'permit:acme.change:acme-secret-set', 'byLabel', 'build', 'validate-target', 'open', 'plan', 'commit']);
});

test('missing interactive channel and plugin card use required foreign messages', async () => {
  const f = fixture();
  await assert.rejects(f.save().create(context({})), /ACME create needs human/);
  await assert.rejects(f.save().rotate(context({ label: SUMMARY.label })), /ACME rotate needs human/);
  await assert.rejects(f.save().pluginProvider(context({ provider: 'absent' })), /ACME missing card absent/);
  await assert.rejects(f.handlers().get(ids.makeRequest)!(context({ label: SUMMARY.label, method: 'DELETE', url: 'https://api.acme.test/item' })), /ACME delete needs human/);
});

test('real Tovu bindings retain the current registry/cache/repo and guard, with invalidation only after save', async () => {
  const base = credentialToolDeps({ authorizeCalls: [] });
  const target: LoadedDeployTarget = { pluginId: 'acme-plugin', module: { create: () => { throw new Error('unused provider'); } },
    descriptor: { id: 'acme-target', label: 'Acme target', module: 'acme/target.mjs', configFields: [],
      credential: { vendorId: 'acme-vendor', tokenField: 'token', fields: [{ name: 'token', label: 'Acme token', required: true, secret: true }] } } };
  const registry: DeployTargetRegistry = { list() { assert.equal(this, registry); return [target]; }, get: () => target, refusals: [] };
  let loads = 0;
  const deleted: { workspaceId: string; target: string }[] = [];
  const cache = { delete(input: { workspaceId: string; target: string }) { assert.equal(this, cache); deleted.push(input); } };
  const deps = { ...base, loadDeployTargets: async (workspaceId: string) => { assert.equal(workspaceId, base.workspaceId); loads++; return registry; }, publishCredentialVerificationCache: cache };
  const operations = bindTovuCredentialToolOperations({ routeDeps: deps, surfaces: { surfaceExchanges: fixedExchanges('tovu-real') } });
  assert.deepEqual(await operations.publish.loadProviders({}), [{ id: 'acme-target', vendorId: 'acme-vendor' }]);
  const invalidate = await operations.publish.prepareInvalidation({});
  assert.deepEqual(deleted, []); assert.equal(loads, 2);
  let guards = 0;
  const saved = await operations.sets.create({ label: 'Acme real key', worksFor: ['acme-target'], category: 'hosting', baseUrl: 'https://api.acme.test',
    connection: { token: 'synthetic-acme-real-key' }, signal: new AbortController().signal,
    guardRepo: required => { assert.equal(required.store, deps.customCredentialSetRepo); guards++; return operations.policy.guardRepo(required); } });
  assert.equal(guards, 1); assert.deepEqual(deleted, []);
  invalidate({ after: saved });
  assert.equal(loads, 2, 'invalidation must not reload the provider registry');
  assert.deepEqual(deleted, [{ workspaceId: deps.workspaceId, target: 'acme-target' }]);
  assert.equal((await operations.sets.list({})).length, 1);
});

test('real Tovu catalog failures remain optional, and absent cache performs no invalidation lookup', async () => {
  const base = credentialToolDeps({ authorizeCalls: [] });
  let deployLoads = 0; let sourceLoads = 0;
  const deps = { ...base,
    loadDeployTargets: async () => { deployLoads++; throw new Error('optional deployment unavailable'); },
    loadSourceControlProviders: async () => { sourceLoads++; throw new Error('optional source-control unavailable'); },
  };
  const operations = bindTovuCredentialToolOperations({ routeDeps: deps, surfaces: { surfaceExchanges: fixedExchanges('tovu-optional') } });
  assert.deepEqual(await operations.publish.loadProviders({}), []);
  assert.equal(deployLoads, 1); assert.equal(sourceLoads, 1);
  const invalidate = await operations.publish.prepareInvalidation({});
  invalidate({ after: SUMMARY });
  assert.equal(deployLoads, 1); assert.equal(sourceLoads, 1);
});

for (const category of ['validation', 'egress-refused'] as const) {
  test(`request ${category} decorates only callerSafeMessage and classifies the original once`, async () => {
    const f = fixture();
    const raw = new Error('private resolved address 10.0.4.7');
    const safe = 'Acme request input needs a different host';
    let classifications = 0;
    f.ports.credentialedRequest.request = async () => { throw raw; };
    f.ports.credentialedRequest.classifyError = ({ error }) => {
      classifications++;
      assert.equal(error, raw, 'the classifier must receive the original rejection');
      return category === 'validation' ? { category, error: raw, callerSafeMessage: safe }
        : { category, error: raw, callerSafeMessage: safe, callerSafeError: new Error(safe) };
    };
    await assert.rejects(f.handlers().get(ids.makeRequest)!(context({ label: SUMMARY.label, method: 'GET', url: 'https://api.acme.test/items' })), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes(safe));
      assert.ok(error.message.includes("Schema for 'acme_request':"));
      assert.doesNotMatch(error.message, /private resolved|10\.0\.4\.7/);
      return true;
    });
    assert.equal(classifications, 1);
  });
}
test('request unknown rejections retain their original identity after classification', async () => {
  const f = fixture(); const raw = new Error('host fault'); let classifications = 0;
  f.ports.credentialedRequest.request = async () => { throw raw; };
  f.ports.credentialedRequest.classifyError = ({ error }) => { classifications++; assert.equal(error, raw); return { category: 'unknown', error }; };
  await assert.rejects(f.handlers().get(ids.makeRequest)!(context({ label: SUMMARY.label, method: 'GET', url: 'https://api.acme.test/items' })), error => error === raw);
  assert.equal(classifications, 1);
});

test('DELETE preflight classifies the original once and preserves the map prefix with caller-safe validation text', async () => {
  const f = fixture();
  const raw = new CredentialedRequestValidationError({ message: 'private DELETE address 10.0.4.7' });
  const safe = 'Acme DELETE target is not allowed';
  let classifications = 0;
  f.ports.credentialedRequest.resolveTarget = async () => { f.log.push('target'); throw raw; };
  f.ports.credentialedRequest.classifyError = ({ error }) => {
    classifications++;
    assert.equal(error, raw);
    return { category: 'validation', error, callerSafeMessage: safe };
  };
  const registrations = createCredentialToolRegistrations({ routeDeps: f.actor, host: HOST, ports: f.ports,
    operations: { ...f.operations, modelFacingErrors: [{ error: CredentialedRequestValidationError, code: 'ACME_REQUEST_REJECTED' }] } });
  const handler = registrations.find(r => r.descriptor.id === ids.makeRequest)!.handler;
  await assert.rejects(handler(context({ label: SUMMARY.label, method: 'DELETE', url: 'https://api.acme.test/items' })), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, `ACME_REQUEST_REJECTED: ${safe}`);
    assert.doesNotMatch(error.message, /private DELETE|10\.0\.4\.7|Schema for/);
    return true;
  });
  assert.equal(classifications, 1);
  assert.deepEqual(f.log, ['permit:acme.change:acme-secret-set', 'recovery', 'target']);
  assert.equal(f.exchanges.size(), 0);
});

test('DELETE preflight preserves non-validation rejection identity after classifying once', async () => {
  for (const category of ['not-found', 'transport', 'unknown', 'egress-refused'] as const) {
    const f = fixture(); const raw = new Error('Acme preflight fault'); let classifications = 0;
    f.ports.credentialedRequest.resolveTarget = async () => { throw raw; };
    f.ports.credentialedRequest.classifyError = ({ error }) => {
      classifications++;
      assert.equal(error, raw);
      return { category, error, callerSafeMessage: 'Acme public refusal', callerSafeError: new Error('Acme public refusal') };
    };
    await assert.rejects(f.handlers().get(ids.makeRequest)!(context({ label: SUMMARY.label, method: 'DELETE', url: 'https://api.acme.test/items' })), error => error === raw);
    assert.equal(classifications, 1);
  }
});
