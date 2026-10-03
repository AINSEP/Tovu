/** t08: SSRF, redirect, credential and read-only contracts. No sockets or real DNS. */
import assert from "node:assert/strict";
import test from "node:test";
import { ToolInputError } from "@jini-ai/core";
import type { HttpRequest, HttpResponse } from "#src/platform/http/index";
import { fetchLiveUrl, listKnownLiveOrigins, type FetchLiveUrlDeps } from "../live-url.js";
import { buildSiteInspectionRegistrations } from "../tool-registrations.js";
import { LIVE_PAGE_EGRESS_POLICY } from "#src/platform/http/egress-policies";
const origin = 'https://site.example';
function fake(urls = [origin], responses: HttpResponse[] = [{ status: 200, headers: {}, bodyText: 'hello' }]) {
  const calls: HttpRequest[] = [];
  const deps: FetchLiveUrlDeps = { listKnownOrigins: async () => urls, httpClient: { send: async req => {
    calls.push(req);
    assert.equal(req.method, 'GET'); assert.deepEqual(req.headers, {}); assert.equal(req.body, undefined);
    assert.equal(req.timeoutMs <= 15000 && req.timeoutMs > 0, true);
    const response = responses.shift(); assert.notEqual(response, undefined, 'unexpected extra request'); return response!;
  } } };
  return { deps, calls };
}
test("one known origin is selected and the page shape removes cookie values", async () => {
  const { deps, calls } = fake([origin], [{ status: 200, headers: { 'X-Test': 'yes', 'set-cookie': 'sid=SECRET' }, setCookies: ['sid=SECRET; Secure; HttpOnly', 'prefs=VALUE; Path=/'], bodyText: 'hello' }]);
  assert.deepEqual(await fetchLiveUrl(deps, { path: '/about' }), { path: '/about', url: origin + '/about', origin, redirects: [], status: 200, ok: true, headers: { 'x-test': 'yes' }, cookies: [{ name: 'sid', attributes: ['Secure', 'HttpOnly'] }, { name: 'prefs', attributes: ['Path=/'] }], body: 'hello', bodyBytes: 5, truncated: false, untrusted: true });
  assert.equal(calls.length, 1);
});
test("none, several, or an unknown origin have exact actionable errors", async () => {
  for (const [urls, supplied, message] of [
    [[], undefined, 'fetch_live_url: this site has no known live address yet. Publish it first, or use fetch_published_page to check the local render.'],
    [[origin, 'https://other.example'], undefined, 'fetch_live_url: several live origins are known. Pass origin as one of: https://other.example, https://site.example.'],
    [[origin], 'https://evil.example', 'fetch_live_url: origin is not a known live address. Pass one of: https://site.example.'],
  ] as const) {
    const { deps, calls } = fake([...urls]);
    await assert.rejects(fetchLiveUrl(deps, { path: '/', ...(supplied ? { origin: supplied } : {}) }), { message });
    assert.deepEqual(calls, []);
  }
});
test("origins require HTTPS/443 and inputs cannot escape onto admin or API", async () => {
  for (const url of ['http://site.example', 'https://site.example:8443', 'https://user:secret@site.example']) {
    const { deps, calls } = fake([url]);
    await assert.rejects(fetchLiveUrl(deps, { path: '/' }), { message: 'fetch_live_url: live origins must use HTTPS on port 443 without credentials.' });
    assert.deepEqual(calls, []);
  }
  for (const path of ['//evil.example', '/api/data', '/%61dmin', '/a/../b']) {
    const { deps, calls } = fake(); await assert.rejects(fetchLiveUrl(deps, { path })); assert.deepEqual(calls, []);
  }
});
test("live path refusals remain model-visible validation errors", async () => {
  const { deps, calls } = fake();
  await assert.rejects(fetchLiveUrl(deps, { path: '/api/data' }), {
    constructor: ToolInputError,
    message: "fetch_live_url: path must not target '/api' — that is the authenticated admin/API surface, not a published page.",
  });
  assert.deepEqual(calls, []);
});
test("explicit known origins select one destination and preserve the query; 404 is evidence", async () => {
  const { deps, calls } = fake(['https://other.example', origin], [{ status: 404, headers: {}, bodyText: 'Missing' }]);
  assert.deepEqual(await fetchLiveUrl(deps, { path: '/missing?lang=en', origin }), {
    path: '/missing?lang=en', status: 404, ok: false, headers: {}, cookies: [], body: 'Missing',
    bodyBytes: 7, truncated: false, url: origin + '/missing?lang=en', origin, redirects: [], untrusted: true,
  });
  assert.deepEqual(calls.map(call => call.url), [origin + '/missing?lang=en']);
});
test("same-origin redirects follow at most three; cross-origin is a result", async () => {
  const { deps, calls } = fake([origin], [{ status: 302, headers: { location: '/next', 'set-cookie': 'session=secret' }, bodyText: '' }, { status: 302, headers: { location: 'https://evil.example/' }, bodyText: 'moved' }]);
  const result = await fetchLiveUrl(deps, { path: '/' });
  assert.equal(result.status, 302); assert.equal(result.location, 'https://evil.example/'); assert.deepEqual(result.redirects, [origin + '/next']);
  assert.deepEqual(calls.map(x => x.url), [origin + '/', origin + '/next']);
  const chain = fake([origin], Array.from({ length: 4 }, (_, i) => ({ status: 302, headers: { location: '/hop' + i }, bodyText: '' })));
  const stopped = await fetchLiveUrl(chain.deps, { path: '/' });
  assert.equal(stopped.status, 302); assert.deepEqual(stopped.redirects, [origin + '/hop0', origin + '/hop1', origin + '/hop2']); assert.equal(chain.calls.length, 4);
});
test("redirects to API or credential URLs are never connected", async () => {
  for (const location of ['/api/private', origin.replace('https://', 'https://user:pass@') + '/']) {
    const { deps, calls } = fake([origin], [{ status: 302, headers: { location }, bodyText: 'stop' }]);
    await assert.rejects(fetchLiveUrl(deps, { path: '/' })); assert.equal(calls.length, 1);
  }
});
test("redirect traversal is refused before URL normalization removes mixed encoded dot segments", async () => {
  for (const location of [origin + '/a/.%2e/b', origin + '/a/%2e./b', 'a/.%2e/b', 'a/%2e./b']) {
    const { deps, calls } = fake([origin], [{ status: 302, headers: { location }, bodyText: '' }]);
    const rawPath = location.startsWith(origin) ? location.slice(origin.length) : '/' + location;
    await assert.rejects(fetchLiveUrl(deps, { path: '/' }), {
      constructor: ToolInputError,
      message: `fetch_live_url: path must not contain a '..' segment (encoded or not): '${rawPath}'.`,
    });
    assert.equal(calls.length, 1);
  }
});
test("a successful same-origin redirect never replays response cookies as request credentials", async () => {
  const { deps, calls } = fake([origin], [
    { status: 302, headers: { location: '/next?fresh=1' }, setCookies: ['session=SECRET'], bodyText: '' },
    { status: 200, headers: {}, bodyText: 'Ready' },
  ]);
  const result = await fetchLiveUrl(deps, { path: '/' });
  assert.equal(result.body, 'Ready');
  assert.deepEqual(result.redirects, [origin + '/next?fresh=1']);
  assert.deepEqual(calls.map(call => ({ method: call.method, headers: call.headers, body: call.body })), [
    { method: 'GET', headers: {}, body: undefined }, { method: 'GET', headers: {}, body: undefined },
  ]);
});
test("body shaping is bounded and textOnly precedes the requested output cap", async () => {
  const { deps } = fake([origin], [{ status: 200, headers: {}, bodyText: '<style>' + 'x'.repeat(300) + '</style><p>Hello there</p>' }]);
  assert.equal((await fetchLiveUrl(deps, { path: '/', textOnly: true, maxBytes: 5 })).body, 'Hello');
  const capped = fake([origin], [{ status: 200, headers: {}, bodyText: 'x'.repeat(200001) }]);
  const result = await fetchLiveUrl(capped.deps, { path: '/' }); assert.equal(result.bodyBytes, 200000); assert.equal(result.truncated, true); assert.equal(result.body?.length, 200000);
});
test("live find counts only available text and reports the upstream raw-read ceiling", async () => {
  const { deps, calls } = fake([origin], [{ status: 200, headers: {}, bodyText: '<script>needle</script><p>Needle</p>', bodyTruncated: true }]);
  assert.deepEqual(await fetchLiveUrl(deps, { path: '/', textOnly: true, find: 'needle' }), {
    path: '/', url: origin + '/', origin, redirects: [], status: 200, ok: true, headers: {}, cookies: [],
    matches: [{ offset: 0, snippet: 'Needle' }], matchCount: 1, bodyBytes: 6, truncated: true, untrusted: true,
  });
  assert.equal(calls[0]!.maxResponseBytes, 1000000);
});
test("known origins are freshly read, deduplicated, and exclude superseded connections/dev origins", async () => {
  let peer = origin;
  const deps = { workspaceId: 'w', publishContentPeerRepo: { listByWorkspace: async () => [
    { baseUrl: 'https://old.example', sealed: null, updatedAt: 'a' }, { baseUrl: peer, sealed: null, updatedAt: 'b' }, { baseUrl: 'https://peer.example', sealed: {}, updatedAt: 'a' },
  ] }, publishHistoryStore: { listLiveUrls: async () => [origin + '/repo'] }, originRegistry: { canonicalOrigin: async () => ({ scheme: 'https', host: 'configured.example', source: 'workspace-setting' }) } };
  assert.deepEqual(await listKnownLiveOrigins(deps as never), ['https://configured.example', 'https://peer.example', origin]);
  peer = 'https://fresh.example'; assert.deepEqual(await listKnownLiveOrigins(deps as never), ['https://configured.example', 'https://fresh.example', 'https://peer.example', origin]);
});
test("registration is readOnly and permission denial prevents origin reads and fetches", async () => {
  let reads = 0;
  const registration = buildSiteInspectionRegistrations({ workspaceId: 'w', authorize: async () => ({ allowed: false, reason: 'denied' }) } as never, { listKnownOrigins: async () => { reads++; return [origin]; }, httpClient: fake().deps.httpClient }).find(r => r.descriptor.id === 'fetch_live_url')!;
  assert.equal(registration.descriptor.readOnly, true);
  await assert.rejects(registration.handler({ principal: { id: 'p' }, input: { path: '/' }, signal: new AbortController().signal } as never), { message: "principal 'p' is not authorized for 'content.read' (denied)" }); assert.equal(reads, 0);
});
test("one absolute deadline bounds stalled origin reads and stalled HTTP reads", async t => {
  for (const stalled of ['origins', 'http'] as const) {
    const controller = new AbortController();
    const timeout = t.mock.method(AbortSignal, 'timeout', (ms: number) => { assert.equal(ms, 15000); return controller.signal; });
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const deps: FetchLiveUrlDeps = {
      listKnownOrigins: async () => stalled === 'origins' ? new Promise(() => { started(); }) : [origin],
      httpClient: { send: async request => {
        assert.equal(stalled, 'http'); assert.equal(request.signal, controller.signal);
        return new Promise((_resolve, reject) => {
          request.signal!.addEventListener('abort', () => reject(request.signal!.reason), { once: true });
          started();
        });
      } },
    };
    const work = fetchLiveUrl(deps, { path: '/' });
    await ready;
    controller.abort(new DOMException('deadline', 'TimeoutError'));
    await assert.rejects(work, { constructor: ToolInputError, message: 'fetch_live_url: fetching the live page exceeded 15000ms. Check the hosting service before retrying.' });
    timeout.mock.restore();
  }
});
test("deadline expiry between redirect hops is also a model-visible timeout", async t => {
  const controller = new AbortController();
  t.mock.method(AbortSignal, 'timeout', () => controller.signal);
  let requests = 0;
  const deps: FetchLiveUrlDeps = {
    listKnownOrigins: async () => [origin],
    httpClient: { send: async () => {
      requests++;
      controller.abort(new DOMException('deadline', 'TimeoutError'));
      return { status: 302, headers: { location: '/next' }, bodyText: '' };
    } },
  };
  await assert.rejects(fetchLiveUrl(deps, { path: '/' }), { constructor: ToolInputError, message: 'fetch_live_url: fetching the live page exceeded 15000ms. Check the hosting service before retrying.' });
  assert.equal(requests, 1);
});
test("the REAL guarded client refuses non-public DNS answers and a rebound redirect before connect", async t => {
  let addresses = ['8.8.8.8'];
  const { createHttpClient } = await import('../../../platform/http/client.js?live-url-dns');
  const connected: string[] = [];
  const client = createHttpClient({ policy: LIVE_PAGE_EGRESS_POLICY, transport: { requestPinned: async (req, peer) => {
    connected.push(peer.ip); addresses = ['10.0.0.1']; return { status: 302, headers: { location: '/next' }, bodyText: '' };
  } } }, { dns: { resolve: async () => addresses } });
  for (const [address, range] of [['169.254.169.254', 'link-local'], ['127.0.0.1', 'loopback'], ['10.0.0.1', 'private'], ['::1', 'loopback'], ['0:0:0:0:0:0:0:1', 'loopback'], ['0:0:0:0:0:0:0:0', 'reserved'], ['fc00::1', 'private'], ['fd00::1', 'private'], ['100.64.0.1', 'private'], ['224.0.0.1', 'reserved'], ['fe80::1', 'link-local'], ['ff00::1', 'reserved']] as const) {
    addresses = [address];
    await assert.rejects(fetchLiveUrl({ listKnownOrigins: async () => [origin], httpClient: client }, { path: '/' }), { message: `fetch_live_url: egress to 'site.example' rejected: resolved address is ${range}` }); assert.deepEqual(connected, []);
  }
  addresses = ['8.8.8.8', '10.0.0.1'];
  await assert.rejects(fetchLiveUrl({ listKnownOrigins: async () => [origin], httpClient: client }, { path: '/' }), { message: "fetch_live_url: egress to 'site.example' rejected: resolved address is private" });
  assert.deepEqual(connected, []);
  addresses = ['8.8.8.8'];
  await assert.rejects(fetchLiveUrl({ listKnownOrigins: async () => [origin], httpClient: client }, { path: '/' }), { message: "fetch_live_url: egress to 'site.example' rejected: resolved address is private" });
  assert.deepEqual(connected, ['8.8.8.8']);
});
test("the production publish-history adapter retains old live URLs beyond the list cap", async () => {
  const { openContentDb } = await import('#src/platform/db/sqlite/content-db');
  const { workspaces } = await import('#src/platform/db/schema.sqlite');
  const { SqlitePublishHistoryStore } = await import('#src/platform/db/sqlite/publish-history-repo.sqlite');
  const db = openContentDb(':memory:');
  for (const id of ['w', 'other']) db.insert(workspaces).values({ id, name: id, slug: id, createdAt: '2026-10-01' }).run();
  const history = new SqlitePublishHistoryStore(db);
  const entry = { target: 'github-pages' as const, url: 'https://old.example', reachable: true, status: 'ready', projectName: 'test', publishedAt: '2026-10-01', triggeredBy: 'agent_tool' as const };
  await history.recordSuccess({ workspaceId: 'w', entry });
  for (let i = 0; i < 205; i++) await history.recordSuccess({ workspaceId: 'w', entry: { ...entry, url: origin } });
  await history.recordSuccess({ workspaceId: 'other', entry: { ...entry, url: 'https://other.example' } });
  assert.deepEqual(await history.listLiveUrls({ workspaceId: 'w' }), ['https://old.example', origin]);
  assert.deepEqual(await listKnownLiveOrigins({ workspaceId: 'w', publishHistoryStore: history }), ['https://old.example', origin]);
});
test("old distinct publish URLs survive more than 200 later publishes and stay workspace-scoped", async () => {
  const { InMemoryPublishHistoryStore } = await import('#src/features/deployments/static-publish/index');
  const history = new InMemoryPublishHistoryStore();
  const entry = { target: 'test', url: 'https://old.example', reachable: true, status: 'published', projectName: 'test', publishedAt: '2026-10-01', triggeredBy: 'agent_tool' as const };
  await history.recordSuccess({ workspaceId: 'w', entry });
  for (let i = 0; i < 205; i++) await history.recordSuccess({ workspaceId: 'w', entry: { ...entry, url: origin } });
  await history.recordSuccess({ workspaceId: 'other-workspace', entry: { ...entry, url: 'https://other.example' } });
  assert.deepEqual(await listKnownLiveOrigins({ workspaceId: 'w', publishHistoryStore: history }), ['https://old.example', origin]);
  assert.deepEqual(await history.listLiveUrls({ workspaceId: 'w' }), ['https://old.example', origin]);
});
