import assert from 'node:assert/strict';
import test from 'node:test';
import { ToolInputError, type SurfaceEmission, type ToolExecutionContext } from '@jini-ai/core';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { InMemoryExternalMcpServerRepo } from '../../../external-mcp/external-mcp-store.memory.js';
import { InMemoryKeyring } from '../../../webhooks/keyring.memory.js';
import { AesGcmSecretSealer } from '../../../webhooks/secret-sealer.aesgcm.js';
import { composeAgentPluginMcp } from '../../../../server/runtime/composition/agent-plugin-service-ports.js';
import { runAgentPluginConnect } from '../../connect-tool.js';
import { validatedAgentPluginToolGrant } from '../../enable-access.js';
import { agentPluginMcpProjections } from '../../mcp-host-bindings.js';
import { resolveAgentPluginLayout } from '../../layout.js';

// S4-0b A7 F2: a matching classifier does not make provider text safe for the model.
const TOKEN = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';
const BEARER = 'Bearer abcdefghijklmnopqrstuvwxyz0123456789';
const SUFFIX = ". Sign-in could not start; no sign-in card was opened. Use the plugin's secure key card with credential_save if it offers one. Do not ask the person to restart Tovu.";

function harness(fault: unknown, refusal: boolean) {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const clock = createSystemClock();
  const mcp = composeAgentPluginMcp({ repo, keyring, sealer: new AesGcmSecretSealer(keyring), clock });
  const seen: unknown[] = [];
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock, idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' }) };
  const emissions: SurfaceEmission[] = [];
  const ctx: ToolExecutionContext = { executionId: 'e', principal: { id: 'owner' }, run: { id: 'run' }, input: {}, signal: new AbortController().signal };
  const run = () => runAgentPluginConnect({ routeDeps: {
    workspaceId: 'workspace', agentPluginLayout: resolveAgentPluginLayout({ siteDir: '/tmp/extract-s4-safe-refusal-no-io' }),
    authorize: async () => ({ allowed: true, reason: 'test' }), mcp: { ...mcp, notifyRosterChanged: async () => {} },
    credentials: { loadSafe: async () => [] },
    isPluginEnabled: async () => true,
    resolveInstalledPlugin: async () => ({ servers: { example: { type: 'streamable-http', url: 'https://example.test/mcp', authMode: 'oauth' } } }),
    externalMcpOAuth: { beginConnect: async () => { throw fault; }, isSignInRefusal: ({ error }) => { seen.push(error); return refusal; } },
  }, surfaces, ctx, pluginId: 'example-plugin' }, { emitSurface: async emission => { emissions.push(emission); } });
  return { run, seen, emissions };
}

test('a host-classified refusal carrying provider secrets reaches the model redacted, with no card', async () => {
  const fault = new Error(`discovery refused for ${BEARER} using ${TOKEN}`);
  const { run, seen, emissions } = harness(fault, true);
  await assert.rejects(run(), (error: unknown) => {
    assert.ok(error instanceof ToolInputError);
    assert.doesNotMatch(error.message, /abcdefghijklmnopqrstuvwxyz0123456789|A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8/);
    assert.ok(error.message.startsWith('discovery refused for Bearer '), error.message);
    assert.ok(error.message.endsWith(SUFFIX), error.message);
    return true;
  });
  assert.deepEqual(seen, [fault]);
  assert.deepEqual(emissions, []);
});

test('ordinary refusal wording, punctuation and fallback suffix are unchanged', async () => {
  const fault = new Error('redirect URI is not allowed');
  const { run, emissions } = harness(fault, true);
  await assert.rejects(run(), (error: unknown) => error instanceof ToolInputError && error.message === `${fault.message}${SUFFIX}`);
  assert.deepEqual(emissions, []);
});

test('an unclassified non-Error object propagates with identity and is never rewritten', async () => {
  const fault = { code: 'host-fault', detail: TOKEN };
  const { run, seen, emissions } = harness(fault, false);
  await assert.rejects(run(), (error: unknown) => error === fault);
  assert.deepEqual(seen, [fault]);
  assert.deepEqual(emissions, []);
});

test('the grant repair reason is redacted too; wording and repair action are unchanged', () => {
  const failure = new Error(`tool list rejected near ${TOKEN}`);
  const ports = { projections: { ...agentPluginMcpProjections, validateToolNames: () => { throw failure; } }, classifyError: () => 'validation' as const };
  assert.throws(() => validatedAgentPluginToolGrant({ current: { enabled: false, allow: [], write: [] }, declared: { allow: ['read'], write: [] } }, { ports }), (error: unknown) => {
    assert.ok(error instanceof ToolInputError);
    assert.doesNotMatch(error.message, /A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8/);
    assert.ok(error.message.startsWith("The plugin's combined tool grant cannot be saved: tool list rejected near "), error.message);
    assert.ok(error.message.endsWith('. Review its tool selection with external_mcp_save before enabling it.'), error.message);
    return true;
  });
});
