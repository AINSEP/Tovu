import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import { adminFrontendOwner, adminFrontendRunOwner } from '../admin-frontend-owner.js';
import { RUN_PRINCIPAL_HEADER } from '../daemon-access.js';

test('frontend owner uses verified proxy principal and the originating tab', () => {
  const req = { get: (name: string) => ({ [RUN_PRINCIPAL_HEADER]: 'owner', 'x-frontend-tab-id': 'tab-a' })[name], query: {} } as unknown as Request;
  assert.deepEqual(adminFrontendOwner({ req, workspaceId: 'site' }), { workspaceId: 'site', principalId: 'owner', tabId: 'tab-a' });
});
test('frontend streams use the same tab identity as response requests', () => {
  const req = { get: (name: string) => name === RUN_PRINCIPAL_HEADER ? 'owner' : undefined, query: { tabId: 'tab-a' } } as unknown as Request;
  assert.deepEqual(adminFrontendOwner({ req, workspaceId: 'site' }), { workspaceId: 'site', principalId: 'owner', tabId: 'tab-a' });
});
test('missing principal, ambiguous tab and missing tab never create an owner', () => {
  for (const [principalId, tabId] of [[undefined, 'tab'], ['owner', undefined], ['owner', ['a', 'b']]]) {
    const req = { get: (name: string) => name === RUN_PRINCIPAL_HEADER ? principalId : undefined, query: { tabId } } as unknown as Request;
    assert.equal(adminFrontendOwner({ req, workspaceId: 'site' }), null);
  }
});
test('run binding uses the server-stamped principal and current tab, refusing malformed context', () => {
  assert.deepEqual(adminFrontendRunOwner({ contextRef: JSON.stringify({ principalId: 'owner', frontendTabId: 'tab-a' }), workspaceId: 'site' }), { workspaceId: 'site', principalId: 'owner', tabId: 'tab-a' });
  for (const contextRef of ['bad', 'null', '{}', '{"principalId":"owner"}']) assert.equal(adminFrontendRunOwner({ contextRef, workspaceId: 'site' }), undefined);
});
