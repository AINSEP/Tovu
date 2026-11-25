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
 * @file Save refusals over the mounted `external_mcp_save` registration. Three different causes
 * must stay distinguishable to the person and the model: bad form input (fix the field), a changed
 * approval basis (request a new card) and changed authority (permission). Before this file every
 * `ToolInputError` from the save port was reported as "no longer current" (B200/B201).
 */

const now = '2026-11-25T04:00:00.000Z';
const key = { workspaceId: 'save-refusals-site', serverId: 'source' };
const STALE_COPY = 'This connection or your access approval is no longer current. Review the connection and its allowed tools in Settings → External MCP, then request the card again. Nothing was saved.';
// A capability URL: the secret is an opaque path segment that shape-based redaction cannot recognize,
// so only the save path's refusal to interpolate submitted values keeps it out of the copy.
const PATH_SECRET = 'k9Qz7Xw2Lp4Rt8Vn3Bm6Hy1Jc5Fd0Gs';
const turn = () => new Promise<void>(resolve => setImmediate(resolve));

function source(): ExternalMcpServerRecord {
  return { ...key, label: 'Source', provisionedByPluginId: null, transport: 'streamable_http', authMode: 'none', enabled: true,
    command: null, url: 'https://example.test/mcp', args: '[]', allowedToolNames: '["read"]', writeAllowedToolNames: '[]',
    writeGrantsUpdatedByPrincipalId: null, writeGrantsUpdatedAt: null, envNames: null, sealedEnv: null,
    oauthProviderId: null, oauthGrant: null, oauthClientId: null, oauthEndpointsJson: null, oauthScopesJson: null,
    oauthStatus: null, oauthExpiresAt: null, oauthTokenEnvName: null, oauthRefreshLeaseUntil: null,
    sealedOAuth: null, aadVersion: 1, oauthAadVersion: 1, createdAt: now, updatedAt: now, version: 1 };
}

/** One open configuration card over the real registration, with injected repo, catalog and ports. */
async function openCard({ allowedToolNames = 'read' }: { allowedToolNames?: string } = {}) {
  const repo = new InMemoryExternalMcpServerRepo();
  const original = source();
  await repo.upsert(original);
  const controller = new AbortController();
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => 'refusal-exchange' }, defaultChannel: 'mcp-ui' }),
    assertAccessApprover: async () => {} };
  const knownRevision = externalMcpAccessSnapshot({ record: original }).admissionRevision;
  const deps = { workspaceId: key.workspaceId, clock: { nowMs: () => Date.parse(now) }, externalMcpServerRepo: repo,
    externalMcpKnownToolNames: ({ admissionRevision }: { admissionRevision: string }) => admissionRevision === knownRevision ? ['read'] : null,
    authorize: async () => ({ allowed: true, reason: 'matched' }) } as unknown as ExternalMcpToolDeps;
  const handler = buildExternalMcpRegistrations(deps, surfaces).find(entry => entry.descriptor.id === 'external_mcp_save')!.handler;
  const emissions: SurfaceEmission[] = [];
  const ctx: ToolExecutionContext = { executionId: 'execution', principal: { id: 'person' }, run: { id: 'chat' }, signal: controller.signal,
    input: { id: key.serverId, transport: 'streamable_http', label: 'Source', enabled: true, allowedToolNames, writeAllowedToolNames: '' } };
  const pending = handler(ctx, { emitSurface: async emission => { emissions.push(emission); } }) as Promise<Record<string, unknown>>;
  await turn();
  assert.equal(emissions.length, 1, 'the configuration card opens');
  const submit = (params: Record<string, unknown>) => surfaces.surfaceExchanges.deliver({ exchangeId: 'refusal-exchange', principalId: 'person', params }, { toolId: 'external_mcp_save' });
  return { repo, original, controller, emissions, pending, submit };
}

test('invalid External MCP form input explains the field instead of saying approval is stale', async t => {
  // A different address cannot inherit the saved grants: that is a fact about the submitted field.
  const changed = await openCard(); t.after(() => changed.controller.abort());
  changed.submit({ url: 'https://other.example.test/mcp', label: 'Source' });
  const refused = await changed.pending;
  assert.equal(refused.saved, false);
  assert.equal(refused.reason, 'error');
  assert.equal(refused.message, 'The connection address in this form differs from the saved one, so its allowed tools cannot carry over. Keep the saved address, or save the new address with no allowed tools and choose them after it connects. Nothing was saved.');
  assert.deepEqual(await changed.repo.findByServerId(key), changed.original);

  // A store validation failure keeps its field path, so the model can point the person at it.
  const invalid = await openCard({ allowedToolNames: '' }); t.after(() => invalid.controller.abort());
  invalid.submit({ url: 'http://other.example.test/mcp', label: 'Source' });
  const rejected = await invalid.pending;
  assert.equal(rejected.saved, false);
  assert.equal(rejected.reason, 'invalid');
  assert.equal(rejected.field, 'url');
  assert.doesNotMatch(String(rejected.message), /no longer current/);
  assert.deepEqual(await invalid.repo.findByServerId(key), invalid.original);
});

test('a changed approval basis asks for a new card and saves nothing', async t => {
  const f = await openCard(); t.after(() => f.controller.abort());
  const moved = { ...f.original, url: 'https://moved.example.test/mcp' };
  await f.repo.upsert(moved);
  f.submit({ url: f.original.url, label: 'Renamed source' });
  const result = await f.pending;
  assert.equal(result.saved, false);
  assert.equal(result.reason, 'error');
  assert.equal(result.field, undefined);
  assert.equal(result.message, STALE_COPY);
  assert.equal(f.emissions.length, 2, 'the card is replaced by one failure outcome');
  assert.match(JSON.stringify(f.emissions[1]), /no longer current/);
  assert.deepEqual(await f.repo.findByServerId(key), moved);
});

test('credential-shaped submitted values do not appear in either error or outcome', async t => {
  const capabilityUrl = (scheme: string) => `${scheme}://mcp.vendor.test/api/mcp/s/${PATH_SECRET}/mcp`;
  const cases: { name: string; allowedToolNames?: string; url: string; before?: (f: Awaited<ReturnType<typeof openCard>>) => Promise<void> }[] = [
    { name: 'changed target', url: capabilityUrl('https') },
    { name: 'invalid field', allowedToolNames: '', url: capabilityUrl('http') },
    { name: 'changed basis', url: capabilityUrl('https'), before: async f => { await f.repo.upsert({ ...f.original, label: 'Moved', allowedToolNames: '[]' }); } },
  ];
  for (const { name, allowedToolNames, url, before } of cases) {
    const f = await openCard(allowedToolNames === undefined ? {} : { allowedToolNames }); t.after(() => f.controller.abort());
    await before?.(f);
    f.submit({ url, label: 'Source' });
    const result = await f.pending;
    assert.equal(result.saved, false, name);
    assert.equal(typeof result.message, 'string', name);
    assert.ok(!JSON.stringify(result).includes(PATH_SECRET), `${name}: the model result echoes the submitted URL secret`);
    assert.equal(f.emissions.length, 2, name);
    assert.ok(!JSON.stringify(f.emissions[1]).includes(PATH_SECRET), `${name}: the outcome card echoes the submitted URL secret`);
  }
});
