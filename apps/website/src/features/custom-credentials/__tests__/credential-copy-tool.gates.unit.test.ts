import '../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';

import { createFakeClock } from '#src/__tests__/support/fake-clock';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { buildCredentialCopyRegistrations, catalog, CREDENTIAL_COPY_TOOL_ID, type CredentialCopyToolDeps } from '../credential-copy-tool.js';

/**
 * @file Gate pins for `credential_copy_from_project` (Stryker lane L14: 83 %, the instance-authorizer
 * request `{ principalId, permission: 'system.write' }` could be emptied with no test failing, AP7).
 * Copying keys between projects is owner-only; these assert WHO and WHAT each gate is asked, and that
 * a refusal happens before any source inventory is read.
 */

function deps(over: { instanceAllowed?: boolean; rbacAllowed?: boolean } = {}) {
  const rbac: unknown[] = [];
  const instance: unknown[] = [];
  let listed = 0;
  const d: CredentialCopyToolDeps = {
    workspaceId: 'target', ownerPrincipalId: Promise.resolve('owner'),
    authorize: async (q) => { rbac.push(q); return { allowed: over.rbacAllowed ?? true, reason: 'r' }; },
    gatedMutations: { gatewayDeps: { authorizeInstance: async (q) => { instance.push(q); return { allowed: over.instanceAllowed ?? true, reason: 'r' }; } } },
    localCredentialCopy: { localHost: true, list: async () => { listed += 1; return []; }, copy: async () => [] },
  };
  const surfaceExchanges = createSurfaceExchangeStore({ clock: createFakeClock({ startIso: '2026-10-25T00:00:00Z' }),
    idGenerator: { newId: () => 'x' }, defaultChannel: 'mcp-ui', scheduler: { schedule: () => () => {} } });
  const tool = buildCredentialCopyRegistrations({ deps: d, surfaces: { surfaceExchanges } })[0]!;
  const run = (principalId = 'owner') => tool.handler({ executionId: 'e', principal: { id: principalId }, run: { id: 'r' }, input: {},
    signal: new AbortController().signal }, { emitSurface: async () => {} });
  return { run, rbac, instance, listed: () => listed };
}

test('catalog: one owner-gated tool with system.write and a closed, empty input schema', () => {
  assert.deepEqual(catalog.map(({ description: _d, ...rest }) => rest), [{
    name: CREDENTIAL_COPY_TOOL_ID, sideEffects: 'mutates-durable-state', authorization: { permission: 'system.write' },
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  }]);
});

test('the instance authorizer is asked for system.write by the calling owner, and its refusal stops before any inventory read', async () => {
  const f = deps({ instanceAllowed: false });
  await assert.rejects(f.run(), { message: 'Copy is not authorized for this installation.' });
  assert.deepEqual(f.instance, [{ principalId: 'owner', permission: 'system.write' }]);
  assert.equal(f.listed(), 0);
});

test('RBAC is asked for system.write in this workspace before the instance gate; its refusal stops everything', async () => {
  const f = deps({ rbacAllowed: false });
  await assert.rejects(f.run(), (e: unknown) => (e as { permission?: string }).permission === 'system.write');
  assert.deepEqual(f.rbac, [{ principalId: 'owner', permission: 'system.write', workspaceId: 'target' }]);
  assert.deepEqual(f.instance, []);
  assert.equal(f.listed(), 0);
});

test('a non-owner is refused before RBAC, the instance gate or inventory are consulted', async () => {
  const f = deps();
  await assert.rejects(f.run('admin'), { message: 'Use the installation owner’s session to copy keys.' });
  assert.deepEqual([f.rbac, f.instance, f.listed()], [[], [], 0]);
});
