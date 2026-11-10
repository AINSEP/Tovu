/**
 * @file EXTRACT-S8-C, C2 part 2 row 1: the custom-credential handlers call the credential ports a
 * host injects. A second host ("acme") supplies recording ports with its own permissions, entity,
 * namespace, URLs and messages; the tests prove each port is the one used, with the ordering the
 * ports' agent-notes require (target before decrypt or dialog, DELETE held and a decline sends
 * nothing, one plan-bound commit on the same provider, abort → no commit) and the egress refusal's
 * caller-safe error is what the model sees. Tovu's old entries keep their recorded bytes.
 */
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from 'node:assert/strict';
import test from 'node:test';
import { indexCatalogById, type ToolRegistration } from '@jini-ai/core';
import type {
  CredentialedRequestErrorClass,
  CredentialedRequestPort,
  SourceControlFileWritePlan,
  SourceControlFileWriter,
  SourceControlWritePort,
} from '@jini-ai/core/contracts/credentials';
import type { SurfaceAskThenReport, SurfaceEmission } from '@jini-ai/core';
import type { SurfaceCardsPort } from '@jini-ai/core/contracts/cards';
import { askThenReport } from '@jini-ai/daemon/surface-exchanges';
import { defineSecretCardTool } from '@jini-ai/ui/mcp-ui/secret-card';
import { toolMetadata } from '../../../contracts/core/tool-metadata/custom-credentials.js';
import { customCredentialsAgentToolCatalog } from '../agent-tools.js';
import type { CustomCredentialSecretCards, CustomCredentialToolHost, CustomCredentialToolPorts } from '../credential-tool-host.js';
import { createCustomCredential, resolveCustomCredentialByLabel } from '../store.js';
import { createApiCredentialSaveToolHandlers, createCustomCredentialsToolRegistrations, type CustomCredentialsToolDeps } from '../tool-registrations.js';
import { credentialToolDeps, ctx, fixedExchanges, oldEntryHashes } from './extract-s8-c2p2-pins.support.js';

/** Recorded on the unmodified code (Tovu 3aa67be7) by the C2 part 2 builder; still required.
 * copyCard and copyDescriptors re-recorded after 0b05623b changed the card and tool descriptions. */
const OLD_ENTRY_HASHES = {
  copyCard: 'cb44d9f7877e4d5549f0fbbd94c7f4a8e4aeb8456145d518aee35634ffb2f3f3',
  createCard: '63acf4f1ca0d7ccbd35f7415f086baf8c1f4225ec49d85aa0dd355b187251a75',
  credentialDescriptors: '657345d5ad0d9c5491c2d8d26ac3645a9752eeefba30697b775cd4ff446df6cb',
  copyDescriptors: '2c672a02b463975fd653fcf53f9bea388f85f79929b0d433b5797575492a71d1',
};

const ACME_HOST: CustomCredentialToolHost = {
  vocabulary: { domain: 'acme-creds', entityType: 'acme-entity', permissions: { read: 'acme.creds.see', write: 'acme.creds.change' },
    catalogModule: 'acme/creds/tools.ts', metadata: toolMetadata, catalog: indexCatalogById({ catalog: customCredentialsAgentToolCatalog }) },
  cardIdentity: {
    uriNamespace: 'acme',
    appNames: {
      create: { appName: 'acme-key-create', appVersion: '7' },
      createOutcome: { appName: 'acme-key-create-done', appVersion: '7' },
      setToken: { appName: 'acme-key-rotate', appVersion: '7' },
      setTokenOutcome: { appName: 'acme-key-rotate-done', appVersion: '7' },
    },
  },
};

const ACME_URL = 'https://api.acme-shop.test/v2/orders/9';
const RAW_REFUSAL = new Error('acme egress refused api.acme-shop.test -> 10.0.4.7');
const SAFE_REFUSAL = new Error('ACME egress refused api.acme-shop.test');

/** A request port that records every call into `log` and never decrypts or sends anything. */
function acmeRequestPort({ log, refuseEgress = false, refuseTarget = false }: { log: string[]; refuseEgress?: boolean; refuseTarget?: boolean }): CredentialedRequestPort & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    request: async (required, optional) => {
      log.push(`request:${required.method}`);
      calls.push({ required, optional });
      if (refuseEgress) throw RAW_REFUSAL;
      return { status: 200, headers: {}, body: { ok: 'acme' }, truncated: false } as unknown as Awaited<ReturnType<CredentialedRequestPort['request']>>;
    },
    resolveTarget: async ({ label, url }) => {
      log.push('resolveTarget');
      if (refuseTarget) throw new Error('ACME label unknown');
      return { label, url: new URL(url) };
    },
    verify: async (required) => {
      log.push('verify');
      calls.push(required);
      return { label: required.label, status: 'valid', checkedAt: '2026-11-09T00:00:00.000Z' } as unknown as Awaited<ReturnType<CredentialedRequestPort['verify']>>;
    },
    probe: async () => { log.push('probe'); return 'ok'; },
    classifyError: ({ error }): CredentialedRequestErrorClass => {
      log.push('classifyError');
      if (error === RAW_REFUSAL || error === SAFE_REFUSAL) {
        return { category: 'egress-refused', error: error as Error, callerSafeMessage: SAFE_REFUSAL.message, callerSafeError: SAFE_REFUSAL };
      }
      return { category: 'unknown', error };
    },
  };
}

const ACME_PLAN: SourceControlFileWritePlan = { parentCommitSha: 'p-acme', baseTreeSha: 't-acme', fileStates: [{ path: 'README.md', exists: true }] };

/** A source-control port that records provider/plan identity; `onPlan` runs during the read-only plan. */
function acmeWritePort({ log, provider, seen, onPlan, refuseTarget = false }: {
  log: string[]; provider: SourceControlFileWriter; seen: Record<string, unknown>; onPlan?: () => void; refuseTarget?: boolean;
}): SourceControlWritePort {
  return {
    build: async ({ baseUrl }) => { log.push(`build:${baseUrl}`); return { ok: true, provider }; },
    validateTarget: ({ provider: used, target }) => {
      log.push('validateTarget');
      seen.validateProvider = used;
      if (refuseTarget) throw new Error('ACME repo name refused');
      return { owner: String(target.owner), repo: String(target.repo) };
    },
    planFileWrite: async ({ provider: used, input }) => {
      log.push('plan');
      seen.planProvider = used;
      seen.planAuthorization = input.authorization;
      onPlan?.();
      return { ok: true, plan: ACME_PLAN };
    },
    commitFiles: async ({ provider: used, plan, input }) => {
      log.push('commit');
      seen.commitProvider = used;
      seen.commitPlan = plan;
      seen.commitMessage = input.commitMessage;
      return { ok: true, commitSha: 'c-acme', commitUrl: 'https://git.acme-shop.test/commit/c-acme' };
    },
  };
}

/** Deps whose sealer logs every decrypt into `log`, plus one saved source-control credential. */
async function acmeDeps({ log, authorizeCalls }: { log: string[]; authorizeCalls: Record<string, unknown>[] }): Promise<CustomCredentialsToolDeps> {
  const base = credentialToolDeps({ authorizeCalls });
  const inner = base.siteAssistantSecretSealer;
  const sealer: typeof inner = {
    seal: (input: Parameters<typeof inner.seal>[0]) => inner.seal(input),
    open: (input: Parameters<typeof inner.open>[0], optional: Parameters<typeof inner.open>[1] = {}) => { log.push('open'); return inner.open(input, optional); },
  };
  const deps = { ...base, siteAssistantSecretSealer: sealer };
  await createCustomCredential({ repo: deps.customCredentialSetRepo, sealer: inner, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen },
    { workspaceId: deps.workspaceId, label: 'acme-git', category: 'source-control', baseUrl: 'https://api.acme-git.test', connection: { token: 'acme-secret-token' } });
  return deps;
}

function registrations(deps: CustomCredentialsToolDeps, ports: CustomCredentialToolPorts, exchangesPrefix = 'acme'): Map<string, ToolRegistration> {
  const exchanges = fixedExchanges(exchangesPrefix);
  return new Map(createCustomCredentialsToolRegistrations({ routeDeps: deps, surfaces: { surfaceExchanges: exchanges }, host: ACME_HOST, ports })
    .map(registration => [registration.descriptor.id, registration]));
}

const UNUSED_WRITE_PORT = (log: string[]): SourceControlWritePort => acmeWritePort({ log, provider: { planFileWrite: async () => ({ ok: true, plan: ACME_PLAN }), commitFiles: async () => ({ ok: true, commitSha: '', commitUrl: '' }) }, seen: {} });

test('old entries keep the exact bytes recorded before the C2 part 2 seams (port wiring changed nothing Tovu emits)', async () => {
  assert.deepEqual(await oldEntryHashes(), OLD_ENTRY_HASHES);
});

test('verify and GET go through the injected request port: one call each, no target resolve, nothing decrypted here', async () => {
  const log: string[] = [];
  const authorizeCalls: Record<string, unknown>[] = [];
  const deps = await acmeDeps({ log, authorizeCalls });
  const port = acmeRequestPort({ log });
  const tools = registrations(deps, { credentialedRequest: port, sourceControlWrite: UNUSED_WRITE_PORT(log) });
  const verified = await tools.get('custom_credential_verify')!.handler({ ...ctx('verify'), input: { label: 'acme-shop' } }, {});
  assert.equal((verified as { status: string }).status, 'valid');
  const got = await tools.get('custom_credential_make_request')!.handler({ ...ctx('get'), input: { label: 'acme-shop', method: 'GET', url: ACME_URL, headers: { 'X-Acme': '1' } } }, {});
  assert.deepEqual((got as { body: unknown }).body, { ok: 'acme' });
  assert.deepEqual(log, ['verify', 'request:GET']);
  assert.deepEqual(port.calls, [
    { workspaceId: 'ws-c2p2', label: 'acme-shop' },
    { required: { workspaceId: 'ws-c2p2', label: 'acme-shop', method: 'GET', url: ACME_URL }, optional: { headers: { 'X-Acme': '1' }, body: undefined } },
  ]);
  assert.deepEqual(authorizeCalls.map(call => [call.permission, call.entityType]), [['acme.creds.see', 'acme-entity'], ['acme.creds.change', 'acme-entity']]);
});

test('egress refusal: the model sees the port\'s caller-safe error, never the resolved address', async () => {
  const log: string[] = [];
  const deps = await acmeDeps({ log, authorizeCalls: [] });
  const tools = registrations(deps, { credentialedRequest: acmeRequestPort({ log, refuseEgress: true }), sourceControlWrite: UNUSED_WRITE_PORT(log) });
  await assert.rejects(tools.get('custom_credential_make_request')!.handler({ ...ctx('egress'), input: { label: 'acme-shop', method: 'POST', url: ACME_URL } }, {}),
    (error: Error) => error.message.includes(SAFE_REFUSAL.message) && !error.message.includes('10.0.4.7'));
  assert.equal(log[0], 'request:POST');
  assert.ok(log.slice(1).every(entry => entry === 'classifyError'), 'only classification follows the one request');
});

/** Opens the DELETE card and answers it with `params` once it is out; returns the log at emission. */
async function answerDelete({ tools, exchangesPrefix, log, params }: { tools: Map<string, ToolRegistration>; exchangesPrefix: string; log: string[]; params: (emission: SurfaceEmission) => Record<string, unknown> }) {
  const emissions: SurfaceEmission[] = [];
  let logAtEmission: string[] = [];
  const result = await tools.get('custom_credential_make_request')!.handler({ ...ctx('delete'), input: { label: 'acme-shop', method: 'DELETE', url: ACME_URL } }, {
    emitSurface: async (emission) => {
      emissions.push(emission);
      logAtEmission = [...log];
      const deliver = registrationsExchanges.get(exchangesPrefix)!;
      setImmediate(() => deliver.deliver({ exchangeId: `${exchangesPrefix}-1`, principalId: 'owner', params: params(emission) }, { toolId: 'custom_credential_make_request' }));
    },
  });
  return { result, emissions, logAtEmission };
}

const registrationsExchanges = new Map<string, ReturnType<typeof fixedExchanges>>();
function deleteTools(deps: CustomCredentialsToolDeps, ports: CustomCredentialToolPorts, prefix: string): Map<string, ToolRegistration> {
  const exchanges = fixedExchanges(prefix);
  registrationsExchanges.set(prefix, exchanges);
  return new Map(createCustomCredentialsToolRegistrations({ routeDeps: deps, surfaces: { surfaceExchanges: exchanges }, host: ACME_HOST, ports })
    .map(registration => [registration.descriptor.id, registration]));
}

/** The confirm action's params, read out of the rendered dialog the way the browser would. */
function confirmParams(emission: SurfaceEmission): Record<string, unknown> {
  const html = (emission as unknown as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const match = html.match(/var PLAN = (.+);/);
  assert.ok(match, 'the dialog carries its button actions');
  const plan = JSON.parse(match[1]!) as { confirm: { params: Record<string, unknown> } };
  return plan.confirm.params;
}

test('DELETE: the target resolves before the dialog, a decline sends nothing, and the same exchange store carries the answer', async () => {
  const log: string[] = [];
  const deps = await acmeDeps({ log, authorizeCalls: [] });
  const port = acmeRequestPort({ log });
  const tools = deleteTools(deps, { credentialedRequest: port, sourceControlWrite: UNUSED_WRITE_PORT(log) }, 'acme-del');
  const { result, emissions, logAtEmission } = await answerDelete({ tools, exchangesPrefix: 'acme-del', log, params: () => ({ decision: 'cancel' }) });
  assert.deepEqual(result, { executed: false, cancelled: true });
  assert.equal(emissions.length, 1);
  assert.deepEqual(logAtEmission, ['resolveTarget'], 'target resolved before the dialog, nothing else');
  assert.deepEqual(log, ['resolveTarget'], 'a declined DELETE never reaches request (decrypt and send)');
});

test('DELETE: approved → exactly one request, after the dialog; a refused target opens no dialog', async () => {
  const log: string[] = [];
  const authorizeCalls: Record<string, unknown>[] = [];
  const deps = await acmeDeps({ log, authorizeCalls });
  const tools = deleteTools(deps, { credentialedRequest: acmeRequestPort({ log }), sourceControlWrite: UNUSED_WRITE_PORT(log) }, 'acme-ok');
  const { result, logAtEmission } = await answerDelete({ tools, exchangesPrefix: 'acme-ok', log, params: confirmParams });
  assert.deepEqual((result as { body: unknown }).body, { ok: 'acme' });
  assert.deepEqual(logAtEmission, ['resolveTarget']);
  assert.deepEqual(log, ['resolveTarget', 'request:DELETE']);
  assert.deepEqual(authorizeCalls.map(call => call.permission), ['acme.creds.change', 'acme.creds.change'], 'write permission re-checked after approval');

  const refusedLog: string[] = [];
  const refusedTools = deleteTools(await acmeDeps({ log: refusedLog, authorizeCalls: [] }), { credentialedRequest: acmeRequestPort({ log: refusedLog, refuseTarget: true }), sourceControlWrite: UNUSED_WRITE_PORT(refusedLog) }, 'acme-no');
  let emitted = 0;
  await refusedTools.get('custom_credential_make_request')!.handler({ ...ctx('delete'), input: { label: 'nope', method: 'DELETE', url: ACME_URL } }, { emitSurface: async () => { emitted += 1; } })
    .catch(() => undefined);
  assert.equal(emitted, 0, 'a refused target opens no dialog');
  assert.deepEqual(refusedLog, ['resolveTarget', 'classifyError']);
});

const WRITE_INPUT = { label: 'acme-git', owner: 'acme', repo: 'shop', branch: 'main', commitMessage: 'ACME update readme', files: [{ path: 'README.md', content: 'acme' }] };

test('write files: build, target check, then one decrypt, one plan and one commit on the SAME provider with the EXACT plan', async () => {
  const log: string[] = [];
  const seen: Record<string, unknown> = {};
  const provider: SourceControlFileWriter = { planFileWrite: async () => { throw new Error('the port is the only caller'); }, commitFiles: async () => { throw new Error('the port is the only caller'); } };
  const deps = await acmeDeps({ log, authorizeCalls: [] });
  const tools = registrations(deps, { credentialedRequest: acmeRequestPort({ log }), sourceControlWrite: acmeWritePort({ log, provider, seen }) });
  const result = await tools.get('custom_credential_write_files')!.handler({ ...ctx('write'), input: WRITE_INPUT }, {});
  assert.deepEqual(result, { executed: true, commitSha: 'c-acme', commitUrl: 'https://git.acme-shop.test/commit/c-acme', filesWritten: 1 });
  assert.deepEqual(log, ['build:https://api.acme-git.test', 'validateTarget', 'open', 'plan', 'commit']);
  assert.equal(seen.validateProvider, provider);
  assert.equal(seen.planProvider, provider);
  assert.equal(seen.commitProvider, provider);
  assert.equal(seen.commitPlan, ACME_PLAN);
  assert.equal(seen.commitMessage, 'ACME update readme');
  assert.ok(String(seen.planAuthorization).includes('acme-secret-token'), 'the decrypted key reaches only the in-process provider call');
});

test('write files: abort during the plan → no commit; a refused target → no decrypt and no plan', async () => {
  const log: string[] = [];
  const controller = new AbortController();
  const provider: SourceControlFileWriter = { planFileWrite: async () => ({ ok: true, plan: ACME_PLAN }), commitFiles: async () => ({ ok: true, commitSha: '', commitUrl: '' }) };
  const deps = await acmeDeps({ log, authorizeCalls: [] });
  const tools = registrations(deps, { credentialedRequest: acmeRequestPort({ log }), sourceControlWrite: acmeWritePort({ log, provider, seen: {}, onPlan: () => controller.abort() }) });
  const result = await tools.get('custom_credential_write_files')!.handler({ ...ctx('write'), input: WRITE_INPUT, signal: controller.signal }, {});
  assert.deepEqual(result, { executed: false, cancelled: false, reason: 'abandoned' });
  assert.deepEqual(log, ['build:https://api.acme-git.test', 'validateTarget', 'open', 'plan']);

  const refusedLog: string[] = [];
  const refusedTools = registrations(await acmeDeps({ log: refusedLog, authorizeCalls: [] }), { credentialedRequest: acmeRequestPort({ log: refusedLog }), sourceControlWrite: acmeWritePort({ log: refusedLog, provider, seen: {}, refuseTarget: true }) });
  await assert.rejects(refusedTools.get('custom_credential_write_files')!.handler({ ...ctx('write'), input: WRITE_INPUT }, {}), /ACME repo name refused/);
  assert.deepEqual(refusedLog, ['build:https://api.acme-git.test', 'validateTarget']);
});

const ACME_CARD = { providerId: 'acme-shop', pluginId: 'acme-shop', label: 'Acme API', ownedApiLabel: 'Acme API', category: 'ops',
  baseUrl: 'https://api.acme-git.test/v1', probeUrl: 'https://api.acme-git.test/me', title: 'Connect Acme', saveKind: 'api' as const, keyHint: 'An Acme read key.' };

/** Rotates the saved Acme key through the human's card; the injected port's probe answers `status`. */
/** Secret-card functions that record which store and reporter each card handler is given. */
function recordingCards(seen: { stores: unknown[]; reporters: unknown[]; reports: number }): CustomCredentialSecretCards {
  const report: SurfaceAskThenReport = (args, optional) => { seen.reports += 1; return askThenReport(args, optional); };
  const define: SurfaceCardsPort['defineSecretCardTool'] = (spec, options) => {
    const tool = (defineSecretCardTool as SurfaceCardsPort['defineSecretCardTool'])(spec, options);
    return { ...tool, handler: (deps) => { seen.stores.push(deps.surfaceExchanges); seen.reporters.push(deps.askThenReport); return tool.handler(deps); } };
  };
  return { defineSecretCardTool: define, askThenReport: report };
}

async function rotateWithProbe({ status, seen = { stores: [], reporters: [], reports: 0 } }: { status: 'ok' | 'refused'; seen?: { stores: unknown[]; reporters: unknown[]; reports: number } }) {
  const log: string[] = [];
  const probes: unknown[] = [];
  const base = await acmeDeps({ log, authorizeCalls: [] });
  const deps: CustomCredentialsToolDeps = { ...base, loadPluginCredentialCards: async () => [ACME_CARD] };
  await createCustomCredential({ repo: deps.customCredentialSetRepo, sealer: base.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen },
    { workspaceId: deps.workspaceId, label: ACME_CARD.label, category: 'ops', baseUrl: ACME_CARD.baseUrl, connection: { token: 'acme-old-key' } });
  const port = acmeRequestPort({ log });
  const exchanges = fixedExchanges('acme-rot');
  const { rotate } = createApiCredentialSaveToolHandlers({ routeDeps: deps, surfaces: { surfaceExchanges: exchanges }, host: ACME_HOST,
    ports: { credentialedRequest: { ...port, probe: async (input) => { probes.push(input); return status; } } }, cards: recordingCards(seen) });
  let emitted = '';
  const tokensAtEmission: (string | undefined)[] = [];
  const read = async () => (await resolveCustomCredentialByLabel({ repo: deps.customCredentialSetRepo, sealer: base.siteAssistantSecretSealer }, { workspaceId: deps.workspaceId, label: ACME_CARD.label }))?.connection.token;
  const result = await rotate({ ...ctx('rotate'), input: { label: ACME_CARD.label } }, { emitSurface: async (emission) => {
    emitted += JSON.stringify(emission);
    tokensAtEmission.push(await read());
    if (tokensAtEmission.length > 1) return;
    setImmediate(() => exchanges.deliver({ exchangeId: 'acme-rot-1', principalId: 'owner', params: { token: 'acme-new-key' } }, { toolId: 'credential_save' }));
  } }) as Record<string, unknown>;
  const stored = await resolveCustomCredentialByLabel({ repo: deps.customCredentialSetRepo, sealer: base.siteAssistantSecretSealer }, { workspaceId: deps.workspaceId, label: ACME_CARD.label });
  return { result, probes, emitted, storedToken: stored?.connection.token, tokensAtEmission, exchanges, seen };
}

test('plugin-card key probe goes through the injected port before sealing; a refusal keeps the old key', async () => {
  const refused = await rotateWithProbe({ status: 'refused' });
  assert.equal(refused.probes.length, 1);
  assert.deepEqual(refused.probes[0], { connection: { token: 'acme-new-key' }, url: ACME_CARD.probeUrl, schemes: [] });
  assert.equal(refused.result.saved, false);
  assert.match(String(refused.result.message), /This key was refused for this purpose\. This card needs: An Acme read key\./);
  assert.equal(refused.storedToken, 'acme-old-key');
  assert.match(refused.emitted, /acme-key-rotate/);
  assert.ok(!refused.emitted.includes('acme-new-key') && !JSON.stringify(refused.result).includes('acme-new-key'), 'the key stays out of cards and results');

  const ok = await rotateWithProbe({ status: 'ok' });
  assert.equal(ok.probes.length, 1);
  assert.equal(ok.result.saved, true);
  assert.equal(ok.storedToken, 'acme-new-key');
});

test('key cards open through the host\'s card functions over the SAME exchange store; the outcome follows the save', async () => {
  const seen = { stores: [] as unknown[], reporters: [] as unknown[], reports: 0 };
  const rotated = await rotateWithProbe({ status: 'ok', seen });
  assert.equal(rotated.result.saved, true);
  assert.equal(seen.stores.length, 1);
  assert.equal(seen.stores[0], rotated.exchanges, 'the card uses the exchange store the answer was delivered to');
  assert.equal(seen.reports, 1, 'the host reporter replaced the card once');
  assert.deepEqual(rotated.tokensAtEmission, ['acme-old-key', 'acme-new-key'], 'card first, outcome only after the new key was saved');
  assert.match(rotated.emitted, /ui:\/\/acme\/secret-card\/credential_save\/acme-rot-1/);
});
