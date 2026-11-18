import test from 'node:test';
import assert from 'node:assert/strict';
import express, { type Request } from 'express';
import { dispatchHttpRequest } from '#src/server/__tests__/helpers/in-process-http';
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

/** What the admin app's own query parser makes of `tabId`: the owner is read from `req.query`, so these shapes are decided by Express's `qs`, not by a URL parser. */
async function ownerOverExpress({ url, headers = {} }: { url: string; headers?: Record<string, string> }) {
  const app = express();
  // The auth middleware above the mount writes the principal into the headers the owner is read from.
  app.use((req, _res, next) => { req.headers[RUN_PRINCIPAL_HEADER] = 'verified-owner'; next(); });
  app.get('/stream', (req, res) => { res.json(adminFrontendOwner({ req, workspaceId: 'site' })); });
  const response = await dispatchHttpRequest({ app, method: 'GET', url, headers });
  return JSON.parse(response.body) as unknown;
}

test('admin tabId pin: a single tabId opens an owner, and the x-frontend-tab-id header wins over the query', async () => {
  assert.deepEqual(await ownerOverExpress({ url: '/stream?tabId=a' }), { workspaceId: 'site', principalId: 'verified-owner', tabId: 'a' });
  assert.deepEqual(await ownerOverExpress({ url: '/stream?tabId=a', headers: { 'x-frontend-tab-id': 'from-header' } }), { workspaceId: 'site', principalId: 'verified-owner', tabId: 'from-header' });
});

test('admin tabId pin: a repeated tabId, a bracketed tabId and a tabId after 1000 other parameters make no owner', async () => {
  const filler = Array.from({ length: 1000 }, (_unused, index) => `f${index}=1`).join('&');
  for (const url of ['/stream?tabId=a&tabId=b', '/stream?tabId[x]=a', `/stream?${filler}&tabId=a`]) assert.equal(await ownerOverExpress({ url }), null, url);
});

test('admin tabId pin: the principal is the one the auth layer above wrote, not one the client sent', async () => {
  const forged = await ownerOverExpress({ url: '/stream?tabId=a', headers: { [RUN_PRINCIPAL_HEADER]: 'client-claims-owner' } });
  assert.deepEqual(forged, { workspaceId: 'site', principalId: 'verified-owner', tabId: 'a' });
});
