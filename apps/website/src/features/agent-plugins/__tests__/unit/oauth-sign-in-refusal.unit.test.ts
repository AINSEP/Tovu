import assert from 'node:assert/strict';
import test from 'node:test';
import { ToolInputError, type SurfaceEmission, type ToolExecutionContext } from '@jini-ai/core';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { OAuthError } from '@jini-ai/oauth';
import { ExternalMcpValidationError } from '../../../external-mcp/external-mcp-store.js';
import { InMemoryExternalMcpServerRepo } from '../../../external-mcp/external-mcp-store.memory.js';
import { InMemoryKeyring } from '../../../webhooks/keyring.memory.js';
import { AesGcmSecretSealer } from '../../../webhooks/secret-sealer.aesgcm.js';
import { composeAgentPluginMcp, composeAgentPluginConnectServices } from '../../../../server/runtime/composition/agent-plugin-service-ports.js';
import { externalMcpAccessSnapshot, externalMcpAdmissionRevision, readExternalMcpToolGrants, validateExternalMcpToolNames } from '../../../../contracts/core/external-mcp-access.js';
import { resolveExternalMcpOAuthStatus, externalMcpRecordHasStaticAccessToken } from '../../../../contracts/core/external-mcp-auth.js';
import { runAgentPluginConnect } from '../../connect-tool.js';
import { resolveAgentPluginLayout } from '../../layout.js';

function harness(fault: Error) {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const clock = createSystemClock();
  const mcp = composeAgentPluginMcp({ repo, keyring, sealer: new AesGcmSecretSealer(keyring), clock });
  const services = composeAgentPluginConnectServices({ httpClient: { send: async () => { throw new Error('No HTTP expected'); } },
    loadCards: async () => [], externalMcpOAuth: { beginConnect: async () => { throw fault; } },
  });
  const seen: unknown[] = [];
  const oauth = services.externalMcpOAuth!;
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock, idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' }) };
  const emissions: SurfaceEmission[] = [];
  const ctx: ToolExecutionContext = { executionId: 'e', principal: { id: 'owner' }, run: { id: 'run' }, input: {}, signal: new AbortController().signal };
  const run = () => runAgentPluginConnect({ routeDeps: {
    workspaceId: 'workspace', agentPluginLayout: resolveAgentPluginLayout({ siteDir: '/tmp/extract-s3-refusal-no-io' }),
    authorize: async () => ({ allowed: true, reason: 'test' }), mcp: { ...mcp, notifyRosterChanged: async () => {} },
    credentials: services.credentials, isPluginEnabled: async () => true,
    resolveInstalledPlugin: async () => ({ servers: { example: { type: 'streamable-http', url: 'https://example.test/mcp', authMode: 'oauth' } } }),
    externalMcpOAuth: { ...oauth, isSignInRefusal: input => { seen.push(input.error); return oauth.isSignInRefusal(input); } },
  }, surfaces, ctx, pluginId: 'example-plugin' }, { emitSurface: async emission => { emissions.push(emission); } });
  return { repo, mcp, run, seen, emissions };
}

test('composition passes the original repository and six canonical projections without copying rules', () => {
  const { repo, mcp } = harness(new Error('unused'));
  assert.equal(mcp.repo, repo);
  assert.equal(mcp.projections.accessSnapshot, externalMcpAccessSnapshot);
  assert.equal(mcp.projections.admissionRevision, externalMcpAdmissionRevision);
  assert.equal(mcp.projections.readToolGrants, readExternalMcpToolGrants);
  assert.equal(mcp.projections.validateToolNames, validateExternalMcpToolNames);
  assert.equal(mcp.projections.oauthStatus, resolveExternalMcpOAuthStatus);
  assert.equal(mcp.projections.hasStaticAccessToken, externalMcpRecordHasStaticAccessToken);
});

for (const fault of [new ExternalMcpValidationError('host validation', 'serverId'), new OAuthError({ code: 'OAUTH_MALFORMED_RESPONSE', message: 'host discovery', operatorAction: 'Review metadata' })]) {
  test(`canonical ${fault.constructor.name} is recognized by the passed refusal classifier before any card opens`, async () => {
    const { run, seen, emissions } = harness(fault);
    await assert.rejects(run(), error => error instanceof ToolInputError && error.message === `${fault.message}. Sign-in could not start; no sign-in card was opened. Use the plugin's secure key card with credential_save if it offers one. Do not ask the person to restart Tovu.`);
    assert.deepEqual(seen, [fault]);
    assert.deepEqual(emissions, []);
  });
}

test('unknown sign-in errors propagate with identity through the same passed classifier', async () => {
  const fault = new Error('unknown host fault');
  const { run, seen, emissions } = harness(fault);
  await assert.rejects(run(), error => error === fault);
  assert.deepEqual(seen, [fault]);
  assert.deepEqual(emissions, []);
});
