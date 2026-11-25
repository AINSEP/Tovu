import assert from 'node:assert/strict';
import test from 'node:test';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createSystemClock } from '@jini-ai/platform/system';
import type { SurfaceEmission, ToolExecutionContext } from '@jini-ai/core';
import { externalMcpAccessSnapshot } from '@jini-ai/mcp/federation/hosted';
import type { ExternalMcpServerRecord } from '@jini-ai/core/contracts/hosted-mcp';
import { buildExternalMcpRegistrations } from '../tool-registrations.js';
import { InMemoryExternalMcpServerRepo } from '../external-mcp-store.memory.js';
import type { ExternalMcpToolDeps } from '@jini-ai/core/contracts/site/external-mcp-tool-ports';

/**
 * @file B199, verification only: how the `external_mcp_save` card and the injected live probe are
 * bound to ONE server, witnessed at the `tool-registrations.ts` boundary with an injected probe, an
 * in-memory repo and the real card exchange. No product policy is decided here.
 *
 * Witness 1 (probe count): `external_mcp_test_connection` is documented as a readiness check that
 * "does NOT ... make a network call to the remote server" (Jini `agent-tools.ts` description;
 * `assistant/__tests__/tool-registrations.external-mcp.test.ts` section 7 is titled "readiness
 * only, never connects"). It is therefore a PRODUCT EXPECTATION, not an incidental design choice. But the
 * handler runs the injected live probe whenever one is wired, and production wires one
 * (`tool-catalog-manifest.ts` passes `probe: probeExternalMcpServer`). That witness is a todo until the
 * owner decides which side moves; the handler's own header ("never opens a socket") is stale too.
 *
 * Witness 2 (identity): a submitted id other than the one the card was opened for must not save or
 * probe a different server. The shipped exchange strips `id` before the handler, so the handler's id
 * mismatch guard is defence in depth that this boundary cannot reach; the binding that matters is
 * `id: save.id` from the prepared card state, which the mutation targets.
 */

const now = '2026-11-25T04:00:00.000Z';
const workspaceId = 'probe-binding-site';
const turn = () => new Promise<void>(resolve => setImmediate(resolve));

function record(serverId: string): ExternalMcpServerRecord {
  return { workspaceId, serverId, label: serverId, provisionedByPluginId: null, transport: 'streamable_http', authMode: 'none', enabled: true,
    command: null, url: `https://${serverId}.example.test/mcp`, args: '[]', allowedToolNames: '["read"]', writeAllowedToolNames: '[]',
    writeGrantsUpdatedByPrincipalId: null, writeGrantsUpdatedAt: null, envNames: null, sealedEnv: null,
    oauthProviderId: null, oauthGrant: null, oauthClientId: null, oauthEndpointsJson: null, oauthScopesJson: null,
    oauthStatus: null, oauthExpiresAt: null, oauthTokenEnvName: null, oauthRefreshLeaseUntil: null,
    sealedOAuth: null, aadVersion: 1, oauthAadVersion: 1, createdAt: now, updatedAt: now, version: 1 };
}

async function harness() {
  const repo = new InMemoryExternalMcpServerRepo();
  const approved = record('approved');
  const other = record('other');
  await repo.upsert(approved);
  await repo.upsert(other);
  const probed: string[] = [];
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => 'binding-exchange' }, defaultChannel: 'mcp-ui' }),
    assertAccessApprover: async () => {} };
  const revision = externalMcpAccessSnapshot({ record: approved }).admissionRevision;
  const deps = { workspaceId, clock: { nowMs: () => Date.parse(now) }, externalMcpServerRepo: repo,
    externalMcpKnownToolNames: ({ admissionRevision }: { admissionRevision: string }) => admissionRevision === revision ? ['read'] : null,
    externalMcpProbe: async ({ serverId }: { serverId: string }) => { probed.push(serverId); return { ok: true, body: {} }; },
    authorize: async () => ({ allowed: true, reason: 'matched' }) } as unknown as ExternalMcpToolDeps;
  const registrations = buildExternalMcpRegistrations(deps, surfaces);
  const handlerFor = (id: string) => registrations.find(entry => entry.descriptor.id === id)!.handler;
  const controller = new AbortController();
  const ctxFor = (input: Record<string, unknown>): ToolExecutionContext => ({ executionId: 'execution', principal: { id: 'person' }, run: { id: 'chat' }, signal: controller.signal, input });
  return { repo, approved, other, probed, surfaces, handlerFor, ctxFor, controller };
}

// RED today: an open, unapproved proposal exists and the readiness check still opens a live probe.
// Repro: wire `externalMcpProbe`, open `external_mcp_save` for a saved id (do not submit), call
// `external_mcp_test_connection` with that id -> the probe is called once; the documented contract says zero.
test('test connection does not run a live probe for an unchanged unapproved proposal', { todo: 'B199: the readiness check runs the injected live probe although its documented contract is no network call; owner decides which side moves' }, async t => {
  const h = await harness(); t.after(() => h.controller.abort());
  const emissions: SurfaceEmission[] = [];
  void h.handlerFor('external_mcp_save')(
    h.ctxFor({ id: 'approved', transport: 'streamable_http', label: 'approved', enabled: true, allowedToolNames: 'read', writeAllowedToolNames: '' }),
    { emitSurface: async emission => { emissions.push(emission); } },
  );
  await turn();
  assert.equal(emissions.length, 1, 'an unapproved proposal is open');
  await h.handlerFor('external_mcp_test_connection')(h.ctxFor({ id: 'approved' }));
  assert.deepEqual(h.probed, [], 'the readiness check ran no live probe');
});

test('changing a proposed id does not execute or save a different server', async t => {
  const h = await harness(); t.after(() => h.controller.abort());
  const emissions: SurfaceEmission[] = [];
  const pending = h.handlerFor('external_mcp_save')(
    h.ctxFor({ id: 'approved', transport: 'streamable_http', label: 'approved', enabled: true, allowedToolNames: 'read', writeAllowedToolNames: '' }),
    { emitSurface: async emission => { emissions.push(emission); } },
  ) as Promise<Record<string, unknown>>;
  await turn();
  assert.equal(emissions.length, 1, 'the card opens for the approved id');
  h.surfaces.surfaceExchanges.deliver({ exchangeId: 'binding-exchange', principalId: 'person', params: { id: 'other', url: 'https://approved.example.test/mcp', label: 'Hijacked' } }, { toolId: 'external_mcp_save' });
  const result = await pending;
  // The exchange drops a submitted `id` (the form has no such field) and the handler's own guard
  // refuses one if it ever arrived, so either outcome is acceptable; saving or probing `other` is not.
  const savedServer = result.saved === true ? (result.server as { serverId: string }).serverId : undefined;
  assert.ok(savedServer === undefined || savedServer === 'approved', `only the approved server may be saved, got ${String(savedServer)}`);
  assert.deepEqual(h.probed.filter(id => id !== 'approved'), [], 'no probe ran for a different server');
  assert.deepEqual(await h.repo.findByServerId({ workspaceId, serverId: 'other' }), h.other, 'the other server is untouched');
});
