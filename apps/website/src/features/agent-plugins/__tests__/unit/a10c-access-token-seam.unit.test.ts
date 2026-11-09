/**
 * A10c seam: the portable `agent_plugin_set_access_token` body driven by a second host's ports only
 * (own card lifecycle id/namespace, permission, copy, token rule R1, saved-token switch). Proves the
 * token save / cancel / invalid paths through the ports, that the host validator (not Tovu's) is used
 * and that Tovu's error identity and bytes are unchanged behind the T shim.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolExecutionContext } from '@jini-ai/core';
import type { SurfaceCardSecretSpec, SurfaceCardSecretOptions, SurfaceCardSecretDeps, SurfaceCardsPort } from '@jini-ai/core/contracts/cards';
import {
  saveAgentPluginToken, type AgentPluginAccessTokenToolDeps, type SetAccessTokenResult, type TokenAuthTarget,
} from '@jini-ai/agent-plugins/connect';
import { probeToken, tovuAgentPluginAccessTokenHost, tovuTokenValidator } from '../../access-token-tool.js';
import { CredentialInputError } from '../../../../contracts/core/credential-token.js';
import { listTokenSignInPlugins, checkAgentPluginAccessToken } from '@jini-ai/agent-plugins/connect';

class AcmeTokenError extends Error { constructor(readonly acmeRule: string) { super('acme bad token'); } }
type Prep = { target: TokenAuthTarget; principalId: string; locale: string };

const TARGET: TokenAuthTarget = {
  pluginId: 'acme-crm', displayName: 'Acme Crm', connectionId: 'plugin-acme-crm',
  config: { type: 'streamable-http', url: 'https://mcp.acme.test/mcp', tokenAuth: { helpUrl: 'https://acme.test/tokens', probeUrl: 'https://acme.test/me' } },
};
const ROW = { serverId: 'plugin-acme-crm', label: null, enabled: true, url: 'https://mcp.acme.test/mcp', allowedToolNames: '["a"]', writeAllowedToolNames: null };

function acmeFixture({ probe = 'ok' as 'ok' | 'refused' | 'unavailable' } = {}) {
  const log: string[] = [];
  const saved: Record<string, unknown>[] = [];
  let captured: { spec: SurfaceCardSecretSpec<Prep, SetAccessTokenResult, SetAccessTokenResult>; options?: SurfaceCardSecretOptions; deps?: SurfaceCardSecretDeps } | undefined;
  const askThenReport = (async () => undefined) as unknown as SurfaceCardSecretDeps['askThenReport'];
  const cards: Pick<SurfaceCardsPort, 'defineSecretCardTool'> = {
    defineSecretCardTool: ((spec: SurfaceCardSecretSpec<Prep, SetAccessTokenResult, SetAccessTokenResult>, options?: SurfaceCardSecretOptions) => {
      captured = { spec, options };
      return { toolId: spec.toolId, secretFieldNames: () => ['token'], handler: (deps: SurfaceCardSecretDeps) => { captured!.deps = deps; return async () => ({ saved: false, reason: 'cancelled' }); } };
    }) as unknown as SurfaceCardsPort['defineSecretCardTool'],
  };
  const deps = {
    workspaceId: 'w-acme',
    authorize: async ({ permission }: { permission: string }) => { log.push(`perm:${permission}`); return { allowed: false, reason: 'test' }; },
    mcp: {
      repo: { findByServerId: async () => ROW },
      saveServer: async (input: Record<string, unknown>) => { saved.push(input); },
      classifyError: () => 'other',
    },
    resolveInstalledPlugin: async () => null,
    federation: { classifyTrust: () => 'trusted', messages: {} },
    credentials: { apply: ({ form }: { form: unknown }) => form, find: async () => undefined, probe: async () => { log.push('probe'); return probe; } },
    preferences: { locale: async () => 'en' },
    tokenValidator: {
      assertToken: ({ value, field }: { value: unknown; field: string }) => { log.push(`assert:${field}`); if (typeof value !== 'string' || !value.trim().startsWith('acme_')) throw new AcmeTokenError(typeof value === 'string' ? 'acme-shape' : 'acme-type'); },
      inputErrorRule: ({ error }: { error: unknown }) => (error instanceof AcmeTokenError && error.acmeRule !== 'acme-type' ? error.acmeRule : null),
    },
    switchOnSavedToken: async ({ target }: { target: TokenAuthTarget }) => { log.push(`switch:${target.pluginId}`); return { state: 'on' as const }; },
    messages: {
      connectionNotSetUp: () => 'acme not set up', connectionRepointed: () => 'acme repointed', notInstalled: () => 'acme not installed',
      noTokenSignIn: () => 'acme none', multipleTokenSignIns: () => 'acme many', serverNotSetUp: () => 'acme server',
      onlyPluginId: () => 'acme only pluginId', pluginIdRequired: () => 'acme pluginId required',
      credentialText: ({ id }: { id: string }) => `acme text ${id}`, translateCredentialMessage: ({ message }: { message: string }) => `acme tr ${message}`,
      savedTokenSwitch: ({ outcome, target }: { outcome: { state: string }; target: TokenAuthTarget }) => `acme ${target.displayName} ${outcome.state}`,
    },
    host: {
      toolId: 'acme_secret_save', permission: 'acme.tokens', entityType: 'acme-plugin',
      cardIdentity: { uriNamespace: 'acme', appNames: { connect: 'acme-connect', tokenForm: 'acme-token', tokenOutcome: 'acme-token-outcome' } },
      cards, askThenReport, formMessages: { description: ({ helpUrl }: { helpUrl: string }) => `Acme checks it. ${helpUrl}` },
    },
  } as unknown as AgentPluginAccessTokenToolDeps;
  const ctx = { principal: { id: 'p-acme' }, run: {}, input: { pluginId: 'acme-crm' }, signal: new AbortController().signal } as unknown as ToolExecutionContext;
  return { deps, ctx, log, saved, askThenReport, captured: () => captured! };
}

const prep: Prep = { target: TARGET, principalId: 'p-acme', locale: 'en' };

test('other host: card lifecycle id, namespace, apps, form copy and askThenReport are host input; save goes through its ports', async () => {
  const f = acmeFixture();
  await saveAgentPluginToken({ routeDeps: f.deps, surfaces: { surfaceExchanges: { open: (() => undefined) as never } }, ctx: f.ctx });
  const { spec, options, deps } = f.captured();
  assert.equal(spec.toolId, 'acme_secret_save');
  assert.equal(options?.uriHost, 'acme');
  assert.equal(deps?.askThenReport, f.askThenReport);
  const form = spec.form({ prep }) as unknown as { app: unknown; description: string };
  assert.deepEqual(form.app, { appName: 'acme-token', appVersion: '1' });
  assert.equal(form.description, 'Acme checks it. https://acme.test/tokens');
  const result = await spec.save({ values: { token: ' acme_123 ' }, prep, signal: new AbortController().signal });
  assert.deepEqual(result, { saved: true, next: 'acme Acme Crm on' });
  assert.deepEqual(f.log, ['assert:token', 'assert:token', 'probe', 'switch:acme-crm']);
  assert.equal(f.saved.length, 1);
  assert.equal(f.saved[0]!.accessToken, 'acme_123');
  assert.equal(f.saved[0]!.authMode, 'static_env');
  const outcome = spec.outcome({ prep, run: { status: 'saved', saved: result } }) as unknown as { app: unknown; message: string };
  assert.deepEqual(outcome.app, { appName: 'acme-token-outcome', appVersion: '1' });
  assert.equal(outcome.message, 'acme Acme Crm on');
});

test('other host: invalid token uses the host rule and copy; an unclassified validator error is rethrown as the same object; nothing saved', async () => {
  const f = acmeFixture();
  await saveAgentPluginToken({ routeDeps: f.deps, surfaces: { surfaceExchanges: { open: (() => undefined) as never } }, ctx: f.ctx });
  const { spec } = f.captured();
  const signal = new AbortController().signal;
  assert.deepEqual(await spec.save({ values: { token: 'nope' }, prep, signal }), { saved: false, reason: 'invalid', message: 'acme text acme-shape' });
  await assert.rejects(spec.save({ values: { token: 42 }, prep, signal }), (err: unknown) => err instanceof AcmeTokenError && err.acmeRule === 'acme-type');
  assert.equal(f.saved.length, 0);
  assert.equal(f.log.includes('probe'), false);
});

test('other host: cancel / blank results, refusal copy, prepare refusals use host permission and copy', async () => {
  const f = acmeFixture({ probe: 'refused' });
  await saveAgentPluginToken({ routeDeps: f.deps, surfaces: { surfaceExchanges: { open: (() => undefined) as never } }, ctx: f.ctx });
  const { spec } = f.captured();
  assert.deepEqual(spec.result({ prep, run: { status: 'cancelled' } }), { saved: false, reason: 'cancelled' });
  assert.deepEqual(spec.result({ prep, run: { status: 'blank' } }), { saved: false, reason: 'invalid', message: 'acme text blank' });
  assert.equal(spec.outcome({ prep, run: { status: 'cancelled' } }), undefined);
  const refused = await spec.save({ values: { token: 'acme_1' }, prep, signal: new AbortController().signal });
  assert.equal(refused.saved, false);
  assert.equal(f.saved.length, 0);
  await assert.rejects(spec.prepare({ ctx: f.ctx }), /not authorized for 'acme.tokens'/);
  const g = acmeFixture();
  await saveAgentPluginToken({ routeDeps: g.deps, surfaces: { surfaceExchanges: { open: (() => undefined) as never } }, ctx: { ...g.ctx, input: { pluginId: 'acme-crm', token: 'acme_x' } } as ToolExecutionContext });
  await assert.rejects(g.captured().spec.prepare({ ctx: g.ctx }), /acme only pluginId/);
  assert.deepEqual(f.log.filter((l) => l.startsWith('perm:')), ['perm:acme.tokens']);
});

test('Tovu shim: same validator error identity/rule, probe classification and host bytes', async () => {
  let thrown: unknown;
  try { tovuTokenValidator.assertToken({ value: '', field: 'token' }); } catch (err) { thrown = err; }
  assert.ok(thrown instanceof CredentialInputError);
  assert.equal(tovuTokenValidator.inputErrorRule({ error: thrown }), (thrown as CredentialInputError).rule);
  assert.equal(tovuTokenValidator.inputErrorRule({ error: new Error('x') }), null);
  assert.equal(await probeToken({ probeUrl: 'https://x.test', token: '', credentials: { probe: async () => 'ok' } }), 'invalid');
  assert.equal(tovuAgentPluginAccessTokenHost.toolId, 'credential_save');
  assert.equal(tovuAgentPluginAccessTokenHost.cardIdentity.uriNamespace, 'tovu');
  assert.equal(tovuAgentPluginAccessTokenHost.permission, 'admin.integrations.manage');
  assert.equal(tovuAgentPluginAccessTokenHost.entityType, 'agent-plugin');
});

test('token sign-in: object API uses the host token rule and installed reads', async () => {
  const seen: string[] = [];
  const servers = { a: { type: 'streamable-http' as const, url: 'https://mcp.acme.test/mcp', tokenAuth: { helpUrl: 'https://acme.test/t', probeUrl: 'https://acme.test/me' } } };
  const listed = await listTokenSignInPlugins({ workspaceId: 'w', listPlugins: async (id) => { seen.push(`list:${id}`); return [{ pluginId: 'acme-crm', servers }, { pluginId: 'none', servers: {} }]; } });
  assert.deepEqual(listed, [{ pluginId: 'acme-crm', displayName: 'Acme Crm', helpUrl: 'https://acme.test/t' }]);
  const deps = {
    workspaceId: 'w', credentials: { probe: async () => { seen.push('probe'); return 'ok' as const; } }, resolveInstalledPlugin: async () => ({ servers }),
    tokenValidator: { assertToken: ({ value }: { value: unknown }) => { seen.push(`assert:${String(value)}`); if (value !== 'acme_ok') throw new AcmeTokenError('x'); } },
  };
  assert.equal(await checkAgentPluginAccessToken({ deps, input: { pluginId: 'acme-crm', token: 'longenoughbutnotacme' } }), 'invalid');
  assert.equal(await checkAgentPluginAccessToken({ deps, input: { pluginId: 'acme-crm', token: 'acme_ok' } }), 'ok');
  assert.deepEqual(seen, ['list:w', 'assert:longenoughbutnotacme', 'assert:acme_ok', 'probe']);
});
