import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdminSurfaceConnectionsHost, AdminSurfaceDeclaredConnection } from '@jini-ai/agent-plugins/admin-surfaces';
import { createAdminSurfaceConnections } from '../surface-connections.js';

function harness() {
  const unavailable = new Error('Other host refusal.');
  const connection: AdminSurfaceDeclaredConnection = { pluginId: 'plugin', descriptor: { connectionId: 'account' }, scopeSets: ['read'] };
  const reads: string[] = [];
  const signal = new AbortController().signal;
  const view = { status: 'connected' as const, account: { accountId: 'account', displayName: 'Host account display' }, grantedScopes: ['read'], pendingSwitch: null };
  const host: AdminSurfaceConnectionsHost = {
    workspaceId: 'workspace', nowMs: () => 0, connectionKey: () => 'opaque-key',
    listConnections: async () => { reads.push('list'); return [connection]; }, requestedScopes: async () => ['read'],
    readRecord: async () => { reads.push('record'); return view; },
    getAccessToken: async (input, options) => { assert.deepEqual(input, { workspaceId: 'workspace', pluginId: 'plugin', connectionRef: 'opaque-key' }); assert.deepEqual(options, { expectedAccountId: 'pinned' }); return 'host-token'; },
    startSignIn: async () => { throw new Error('not used'); },
    service: () => ({ confirmSwitchAccount: async () => view, cancelSwitchAccount: async () => view, disconnect: async () => ({ ...view, remoteRevocation: 'confirmed' }) }),
    attempts: new Map(), callbackInbox: { deposit() {}, take: () => null }, notAvailable: () => unavailable,
    pinnedTokenOptions: input => { assert.equal(input.signal, signal); assert.equal(input.connectionRef, 'opaque-key'); return { expectedAccountId: 'pinned' }; },
  };
  return { host, reads, signal, unavailable };
}

test('the local surface port preserves host token pins, opaque keys and account projections', async () => {
  const { host, reads, signal } = harness();
  const port = createAdminSurfaceConnections({ host, pluginId: 'plugin', workspaceId: 'workspace', principalId: 'admin', signal });
  assert.equal(await port.getAccessToken({ connectionId: 'account' }), 'host-token');
  assert.deepEqual(reads, ['list']);
  assert.deepEqual(await port.status({ connectionId: 'account' }), { connectionId: 'account', status: 'connected', accountLabel: 'Host account display', grantedScopeSetIds: ['read'], pendingSwitchAccountLabel: null, lastSignInAttempt: null });
  assert.deepEqual(reads, ['list', 'list', 'record']);
});

test('foreign workspace and missing actor preserve the supplied error identity before any read', async () => {
  const { host, reads, unavailable } = harness();
  const foreign = createAdminSurfaceConnections({ host, pluginId: 'plugin', workspaceId: 'foreign', principalId: 'admin' });
  await assert.rejects(foreign.status({ connectionId: 'account' }), error => error === unavailable);
  const anonymous = createAdminSurfaceConnections({ host, pluginId: 'plugin', workspaceId: 'workspace' });
  await assert.rejects(anonymous.getAccessToken({ connectionId: 'account' }), error => error === unavailable);
  assert.deepEqual(reads, []);
});
