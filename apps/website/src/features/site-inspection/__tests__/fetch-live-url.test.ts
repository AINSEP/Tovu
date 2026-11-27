import { resolvePublishHistoryListLimit } from '@tovu/contracts/publish-history-list-limit';
/** t08 host wiring: the publish-peer rule, permission gate, real guarded client and publish-history adapters
 * bound into the engine's live-url fetch. The engine's own unit contracts live beside it in the engine. No sockets or real DNS. */
import assert from "node:assert/strict";
import test from "node:test";
import { EgressRefusedError, type HttpRequest, type HttpResponse } from "#src/platform/http/index";
import { fetchLiveUrl, listKnownLiveOrigins, type FetchLiveUrlDeps } from "@jini-ai/diagnostics/web-evidence/live-url";
import { selectConnectedDestination } from "@jini-ai/cms/publish/content/peer-registry";
import { RESERVED_SEGMENTS } from "@jini-ai/cms/routing/site/reserved-paths";
import { buildSiteInspectionRegistrations, contributeSiteInspectionTools } from "../tool-registrations.js";
import { LIVE_PAGE_EGRESS_POLICY } from "#src/platform/http/egress-policies";
const origin = 'https://site.example';
const hostPolicy = { reservedSegments: RESERVED_SEGMENTS, isEgressRefusal: (error: unknown): error is EgressRefusedError => error instanceof EgressRefusedError };
function fake(urls = [origin], responses: HttpResponse[] = [{ status: 200, headers: {}, bodyText: 'hello' }]) {
  const calls: HttpRequest[] = [];
  const deps: FetchLiveUrlDeps = { ...hostPolicy, listKnownOrigins: async () => urls, httpClient: { send: async req => {
    calls.push(req);
    assert.equal(req.method, 'GET'); assert.deepEqual(req.headers, {}); assert.equal(req.body, undefined);
    const timeoutMs = req.timeoutMs ?? 0; assert.equal(timeoutMs <= 15000 && timeoutMs > 0, true);
    const response = responses.shift(); assert.notEqual(response, undefined, 'unexpected extra request'); return response!;
  } } };
  return { deps, calls };
}
test("known origins are freshly read, deduplicated, and exclude superseded connections/dev origins", async () => {
  let peer = origin;
  const deps = { workspaceId: 'w', publishContentPeerRepo: { listByWorkspace: async () => [
    { baseUrl: 'https://old.example', sealed: null, updatedAt: 'a' }, { baseUrl: peer, sealed: null, updatedAt: 'b' }, { baseUrl: 'https://peer.example', sealed: {}, updatedAt: 'a' },
  ] }, publishHistoryStore: { listLiveUrls: async () => [origin + '/repo'] }, originRegistry: { canonicalOrigin: async () => ({ scheme: 'https', host: 'configured.example', source: 'workspace-setting' }) } };
  assert.deepEqual(await listKnownLiveOrigins({ ...deps, selectConnectedDestination } as never), ['https://configured.example', 'https://peer.example', origin]);
  peer = 'https://fresh.example'; assert.deepEqual(await listKnownLiveOrigins({ ...deps, selectConnectedDestination } as never), ['https://configured.example', 'https://fresh.example', 'https://peer.example', origin]);
});
test("registration is readOnly and permission denial prevents origin reads and fetches", async () => {
  let reads = 0;
  const registration = buildSiteInspectionRegistrations({ workspaceId: 'w', authorize: async () => ({ allowed: false, reason: 'denied' }) } as never, { listKnownOrigins: async () => { reads++; return [origin]; }, httpClient: fake().deps.httpClient }).find(r => r.descriptor.id === 'fetch_live_url')!;
  assert.equal(registration.descriptor.readOnly, true);
  await assert.rejects(registration.handler({ principal: { id: 'p' }, input: { path: '/' }, signal: new AbortController().signal } as never), { message: "principal 'p' is not authorized for 'content.read' (denied)" }); assert.equal(reads, 0);
});
test("the REAL guarded client refuses non-public DNS answers and a rebound redirect before connect", async t => {
  let addresses = ['8.8.8.8'];
  // The query string loads a fresh `client.js` instance; a computed specifier keeps TS from resolving
  // it as a file, and the annotation types it as the real module.
  const freshClient: string = '../../../platform/http/client.js?live-url-dns';
  const { createHttpClient }: typeof import('../../../platform/http/client.js') = await import(freshClient);
  const connected: string[] = [];
  const client = createHttpClient({ policy: LIVE_PAGE_EGRESS_POLICY, transport: { requestPinned: async (req, peer) => {
    connected.push(peer.ip); addresses = ['10.0.0.1']; return { status: 302, headers: { location: '/next' }, bodyText: '' };
  } } }, { dns: { resolve: async () => addresses } });
  for (const [address, range] of [['169.254.169.254', 'link-local'], ['127.0.0.1', 'loopback'], ['10.0.0.1', 'private'], ['::1', 'loopback'], ['0:0:0:0:0:0:0:1', 'loopback'], ['0:0:0:0:0:0:0:0', 'reserved'], ['fc00::1', 'private'], ['fd00::1', 'private'], ['100.64.0.1', 'private'], ['224.0.0.1', 'reserved'], ['fe80::1', 'link-local'], ['ff00::1', 'reserved']] as const) {
    addresses = [address];
    await assert.rejects(fetchLiveUrl({ ...hostPolicy, listKnownOrigins: async () => [origin], httpClient: client }, { path: '/' }), { message: `fetch_live_url: egress to 'site.example' rejected: resolved address is ${range}` }); assert.deepEqual(connected, []);
  }
  addresses = ['8.8.8.8', '10.0.0.1'];
  await assert.rejects(fetchLiveUrl({ ...hostPolicy, listKnownOrigins: async () => [origin], httpClient: client }, { path: '/' }), { message: "fetch_live_url: egress to 'site.example' rejected: resolved address is private" });
  assert.deepEqual(connected, []);
  addresses = ['8.8.8.8'];
  await assert.rejects(fetchLiveUrl({ ...hostPolicy, listKnownOrigins: async () => [origin], httpClient: client }, { path: '/' }), { message: "fetch_live_url: egress to 'site.example' rejected: resolved address is private" });
  assert.deepEqual(connected, ['8.8.8.8']);
});
test("the production publish-history adapter retains old live URLs beyond the list cap", async () => {
  const { openContentDb } = await import('#src/platform/db/sqlite/content-db');
  const { workspaces } = await import('#src/platform/db/schema.sqlite');
  const { SqlitePublishHistoryStore } = await import('#src/platform/db/sqlite/publish-history-repo.sqlite');
  const db = openContentDb(':memory:');
  for (const id of ['w', 'other']) db.insert(workspaces).values({ id, name: id, slug: id, createdAt: '2026-10-01' }).run();
  const history = new SqlitePublishHistoryStore({ store: db });
  const entry = { target: 'github-pages' as const, url: 'https://old.example', reachable: true, status: 'ready', projectName: 'test', publishedAt: '2026-10-01', triggeredBy: 'agent_tool' as const };
  await history.recordSuccess({ workspaceId: 'w', entry });
  for (let i = 0; i < 205; i++) await history.recordSuccess({ workspaceId: 'w', entry: { ...entry, url: origin } });
  await history.recordSuccess({ workspaceId: 'other', entry: { ...entry, url: 'https://other.example' } });
  assert.deepEqual(await history.listLiveUrls({ workspaceId: 'w' }), ['https://old.example', origin]);
  assert.deepEqual(await listKnownLiveOrigins({ selectConnectedDestination, workspaceId: 'w', publishHistoryStore: history }), ['https://old.example', origin]);
});
test("old distinct publish URLs survive more than 200 later publishes and stay workspace-scoped", async () => {
  const { InMemoryPublishHistoryStore } = await import('@jini-ai/devops/deploy/site/static-publish/publish-history');
  const history = new InMemoryPublishHistoryStore({ peerKind: "tovu-peer", resolvePublishHistoryListLimit });
  const entry = { target: 'test', url: 'https://old.example', reachable: true, status: 'published', projectName: 'test', publishedAt: '2026-10-01', triggeredBy: 'agent_tool' as const };
  await history.recordSuccess({ workspaceId: 'w', entry });
  for (let i = 0; i < 205; i++) await history.recordSuccess({ workspaceId: 'w', entry: { ...entry, url: origin } });
  await history.recordSuccess({ workspaceId: 'other-workspace', entry: { ...entry, url: 'https://other.example' } });
  assert.deepEqual(await listKnownLiveOrigins({ selectConnectedDestination, workspaceId: 'w', publishHistoryStore: history }), ['https://old.example', origin]);
  assert.deepEqual(await history.listLiveUrls({ workspaceId: 'w' }), ['https://old.example', origin]);
});

test("the live inspection contributor logs only the origin and response metadata", async t => {
  const date = new Date("2026-11-26T00:00:00.000Z");
  t.mock.timers.enable({ apis: ["Date"], now: date });
  const info = t.mock.method(console, "info", () => {});
  const f = fake();
  const deps = {
    workspaceId: "w",
    authorize: async (required: { principalId: string; workspaceId: string; permission: string }) => {
      assert.deepEqual([required.principalId, required.workspaceId, required.permission], ["editor", "w", "content.read"]);
      return { allowed: true, reason: "matched" };
    },
    originRegistry: { canonicalOrigin: async (required: { workspaceId: string }) => {
      assert.deepEqual(required, { workspaceId: "w" });
      return { scheme: "https", host: "site.example", source: "workspace-setting" };
    } },
  };
  const registration = contributeSiteInspectionTools({ httpClient: f.deps.httpClient, selectConnectedDestination })
    .build(deps as unknown as Parameters<ReturnType<typeof contributeSiteInspectionTools>["build"]>[0], undefined)
    .find(r => r.descriptor.id === "fetch_live_url");
  assert.ok(registration);
  const reply = await registration.handler({ principal: { id: "editor" }, input: { path: "/pricing?campaign=preview" }, signal: new AbortController().signal } as never) as { status: number; origin: string };
  assert.deepEqual([reply.status, reply.origin], [200, "https://site.example"]);
  assert.deepEqual(f.calls.map(call => call.url), ["https://site.example/pricing?campaign=preview"]);
  assert.deepEqual(info.mock.calls.map(call => call.arguments), [[JSON.stringify({
    timestamp: "2026-11-26T00:00:00.000Z", level: "info", service: "site-inspection", message: "fetch_live_url",
    context: { origin: "https://site.example", status: 200, durationMs: 0, outcome: "response" },
  })]]);
});
