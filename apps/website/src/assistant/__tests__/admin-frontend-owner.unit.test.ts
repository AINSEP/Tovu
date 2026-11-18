import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { TOVU_REQUEST_FACTS } from '#src/contracts/core/request-facts';
import { createFrontendControl } from '@jini-ai/daemon/http';
import { createNodeDispatcher } from '@jini-ai/http-kit/node-bridge';
import { daemonRouteHost, mountJiniRoutes, nodeSessionTimer } from '#src/server/runtime/composition/jini-routes';
import { dispatchHttpRequest } from '#src/server/__tests__/helpers/in-process-http';
import { adminFrontendOwner, adminFrontendRunOwner } from '../admin-frontend-owner.js';
import { RUN_PRINCIPAL_HEADER } from '../daemon-access.js';

/** The hook input a Jini route list gives: the request's headers and the facts the host put in `locals` (the host app's parsed query among them). */
function hookInput({ headers, query }: { headers: Record<string, string>; query: Record<string, unknown> }) {
  const facts = { clientAddress: '203.0.113.1', servingProtocol: 'https', secure: true, query };
  return { request: new Request('https://site.test/stream', { headers }), locals: { [TOVU_REQUEST_FACTS]: facts } };
}

test('frontend owner uses verified proxy principal and the originating tab', () => {
  const input = hookInput({ headers: { [RUN_PRINCIPAL_HEADER]: 'owner', 'x-frontend-tab-id': 'tab-a' }, query: {} });
  assert.deepEqual(adminFrontendOwner({ ...input, workspaceId: 'site' }), { workspaceId: 'site', principalId: 'owner', tabId: 'tab-a' });
});
test('frontend streams use the same tab identity as response requests', () => {
  const input = hookInput({ headers: { [RUN_PRINCIPAL_HEADER]: 'owner' }, query: { tabId: 'tab-a' } });
  assert.deepEqual(adminFrontendOwner({ ...input, workspaceId: 'site' }), { workspaceId: 'site', principalId: 'owner', tabId: 'tab-a' });
});
test('missing principal, ambiguous tab and missing tab never create an owner', () => {
  const cases: Array<[string | undefined, unknown]> = [[undefined, 'tab'], ['owner', undefined], ['owner', ['a', 'b']]];
  for (const [principalId, tabId] of cases) {
    const input = hookInput({ headers: principalId ? { [RUN_PRINCIPAL_HEADER]: principalId } : {}, query: { tabId } });
    assert.equal(adminFrontendOwner({ ...input, workspaceId: 'site' }), null);
  }
});
test('a request mounted without the host facts cannot name a tab through the query: the hook throws instead of guessing', () => {
  const request = new Request('https://site.test/stream?tabId=a', { headers: { [RUN_PRINCIPAL_HEADER]: 'owner' } });
  assert.throws(() => adminFrontendOwner({ request, locals: {}, workspaceId: 'site' }), /request facts are missing/);
});
test('run binding uses the server-stamped principal and current tab, refusing malformed context', () => {
  assert.deepEqual(adminFrontendRunOwner({ contextRef: JSON.stringify({ principalId: 'owner', frontendTabId: 'tab-a' }), workspaceId: 'site' }), { workspaceId: 'site', principalId: 'owner', tabId: 'tab-a' });
  for (const contextRef of ['bad', 'null', '{}', '{"principalId":"owner"}']) assert.equal(adminFrontendRunOwner({ contextRef, workspaceId: 'site' }), undefined);
});

/** What the admin app's own query parser makes of `tabId`, through the real mount path (`mountJiniRoutes` and the bridge): the owner is read from the facts' query, so these shapes are decided by Express's `qs`, not by a URL parser. */
async function ownerOverExpress({ url, headers = {} }: { url: string; headers?: Record<string, string> }) {
  const app = express();
  // The auth middleware above the mount writes the principal into the headers the owner is read from.
  app.use((req, _res, next) => { req.headers[RUN_PRINCIPAL_HEADER] = 'verified-owner'; next(); });
  mountJiniRoutes({ app, routes: [{ method: 'GET', path: '/stream', handler: ({ request, locals }) => Response.json(adminFrontendOwner({ request, locals: locals ?? {}, workspaceId: 'site' })) }] });
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

/** The admin frontend routes exactly as `createFrontendControl` returns them, mounted WITHOUT the host adapter that computes the request facts. Every internal report is kept. */
async function adminRoutesWithoutFacts({ url, method = 'GET', headers = {} }: { url: string; method?: string; headers?: Record<string, string> }) {
  const reports: unknown[] = [];
  const control = createFrontendControl({ capabilities: [{ id: 'page.click', description: 'Activate one control.' }], resolveBindToken: () => undefined, setTimer: nodeSessionTimer,
    session: { resolveOwner: async (input) => adminFrontendOwner({ ...input, workspaceId: 'site' }) } });
  const host = daemonRouteHost({ context: { originPolicy: { isSameOrigin: () => true } }, parserLimitBytes: 1024 });
  const dispatcher = createNodeDispatcher({}, { expressCompatible: true });
  for (const route of control.routes({ host: { ...host, reportInternalError: (required, optional) => { reports.push(required.report); return host.reportInternalError(required, optional); } } })) dispatcher.server.route(route);
  const app = express();
  app.use((req, _res, next) => { req.headers[RUN_PRINCIPAL_HEADER] = 'verified-owner'; next(); });
  app.use((req, res, next) => { void dispatcher.handle({ incoming: req, out: res }, { next, parsedBody: {}, locals: res.locals }); });
  const response = await dispatchHttpRequest({ app, method, url, headers });
  return { status: response.status, body: response.body, reports };
}

test('A11 stream: without the request facts the owner hook throws, the stream answers 500 with a request ID, and one report is made', async () => {
  const answer = await adminRoutesWithoutFacts({ url: '/api/frontend-sessions/stream?capability=page.click' });
  assert.equal(answer.status, 500);
  assert.match(answer.body, /"requestId"/);
  assert.doesNotMatch(answer.body, /request facts/);
  assert.equal(answer.reports.length, 1);
  assert.match(String((answer.reports[0] as { error: Error }).error.message), /request facts are missing/);
});

test('A11 responses: without the request facts the gate answers the plain 403 and the error is reported once', async () => {
  const answer = await adminRoutesWithoutFacts({ url: '/api/frontend-sessions/session-1/responses', method: 'POST', headers: { 'content-type': 'application/json' } });
  assert.equal(answer.status, 403);
  assert.equal(answer.body, 'Forbidden');
  assert.equal(answer.reports.length, 1);
});
