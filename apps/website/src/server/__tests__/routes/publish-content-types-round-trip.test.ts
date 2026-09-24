import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type { NavMenuEntry } from "@jini-ai/cms/navigation";
import type { PostRecord } from "#src/features/post/post";
import type { PublishContentReport } from "#src/features/publish-content/planner";
import { createPublishContentSeedHash } from "#src/features/publish-content/seed-hash";
import { createRedirect } from "#src/features/redirects/index";
import type { HttpClientPort, HttpRequest, HttpResponse } from "#src/platform/http/index";
import { toPublishContentDeps } from "#src/server/inbound/admin-http/routes/publish-content/deps";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";

/**
 * @file End to end, over real HTTP between two hermetic instances, the three things the owner's next
 * publish must do on a NEW-build destination — the header nav replaces the seeded one (S3 + D1), a
 * redirect with `override` lands (S2), and a page whose editor format changed replaces the live copy
 * (D2) — while a page someone edited on the destination stays a `conflict` and is left alone. And on
 * an OLD-build destination (no `/capabilities` route), the push trims itself to post/page/media.
 *
 * The destination's "seed" is a THIRD instance holding exactly what the destination was hydrated
 * with, read through the real `createPublishContentSeedHash()` — the same lookup the SQLite root
 * builds over `content.seed.db` (`composition/publish-content-seed-hash.ts`, pinned against the real
 * tracked seed by `composition/__tests__/publish-content-seed-hash.test.ts`).
 */

const WORKSPACE = "workspace-local";

type Deps = ReturnType<typeof createRouteDeps>;

async function startServer(deps: Deps) {
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { deps, server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function expectJson<T>(res: Response, status: number): Promise<T> {
  const raw = await res.text();
  assert.equal(res.status, status, raw);
  return JSON.parse(raw) as T;
}

async function loginAsOwner(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  assert.equal(res.status, 200, await res.text());
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function page(overrides: Partial<PostRecord> & { id: string; slug: string }): PostRecord {
  return {
    workspaceId: WORKSPACE,
    title: overrides.slug,
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "seeded body" }] }] },
    status: "published",
    kind: "page",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    version: 1,
    createdByPrincipalId: null,
    ...overrides,
  } as PostRecord;
}

function headerNav(label: string, href: string): NavMenuEntry {
  return {
    id: "menu-header-nav",
    workspaceId: WORKSPACE,
    slug: "header-nav",
    title: "Header",
    status: "published",
    doc: { type: "menu", version: 1, items: [{ id: "item-1", label, target: { kind: "url", href } }] },
    locations: ["header"],
    updatedAt: "2026-09-01T00:00:00.000Z",
    version: 1,
  } as NavMenuEntry;
}

/** What `content.seed.db` put on the destination: the old header nav, a doc-format About, a FAQ,
 *  and a live page at `/old-page` the redirect must win over. */
async function writeSeedContent(deps: Deps): Promise<void> {
  await deps.menuRepo.save(headerNav("Old link", "/old-link"));
  await deps.postRepo.save(page({ id: "page-about", slug: "e2e-about", title: "About" }));
  await deps.postRepo.save(page({ id: "page-faq", slug: "e2e-faq", title: "FAQ" }));
  await deps.postRepo.save(page({ id: "page-old", slug: "e2e-old-page", title: "Old page" }));
}

test("publish types: nav, an override redirect and a doc->html page land on a new-build destination; a live edit stays a conflict", async (t) => {
  const seed = createRouteDeps();
  await writeSeedContent(seed);

  const destinationDeps = createRouteDeps({
    publishContentSeedHash: createPublishContentSeedHash({ loadSeedDeps: () => toPublishContentDeps(seed) }),
  });
  await writeSeedContent(destinationDeps);
  // Someone edited the FAQ on the destination after it was seeded — this one must NOT be overwritten.
  await destinationDeps.postRepo.save(page({ id: "page-faq", slug: "e2e-faq", title: "FAQ edited on live", version: 2 }));

  const sourceDeps = createRouteDeps();
  await writeSeedContent(sourceDeps);
  await sourceDeps.menuRepo.save({ ...headerNav("Docs", "/docs"), version: 2 });
  await sourceDeps.postRepo.save(
    page({ id: "page-about", slug: "e2e-about", title: "About", bodyFormat: "html", bodyJson: null, bodyHtml: "<p>new about</p>", version: 2 } as Partial<PostRecord> & { id: string; slug: string })
  );
  await sourceDeps.postRepo.save(page({ id: "page-faq", slug: "e2e-faq", title: "FAQ from local", version: 2 }));
  await createRedirect({
    deps: sourceDeps.redirectsWriteDeps,
    input: { workspaceId: WORKSPACE, matchType: "exact", fromPattern: "/e2e-old-page", toTarget: "/new-page", statusCode: 301, override: true, actorId: "owner" },
  });

  const source = await startServer(sourceDeps);
  t.after(() => new Promise<void>((resolve) => source.server.close(() => resolve())));
  const destination = await startServer(destinationDeps);
  t.after(() => new Promise<void>((resolve) => destination.server.close(() => resolve())));
  const sourceCookie = await loginAsOwner(source.baseUrl);
  const cookie = await loginAsOwner(destination.baseUrl);
  const api = `${destination.baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content`;
  const post = (path: string, body: unknown) =>
    fetch(`${api}${path}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });

  // A new-build destination advertises every type.
  const caps = await expectJson<{ entityTypes: string[] }>(await fetch(`${api}/capabilities`, { headers: { cookie } }), 200);
  for (const type of ["post", "page", "media", "redirect", "menu"]) assert.ok(caps.entityTypes.includes(type), `capabilities lacks ${type}`);

  const bundle = await expectJson<{ entities: Array<{ entityType: string }> }>(
    await fetch(`${source.baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/export`, { headers: { cookie: sourceCookie } }),
    200
  );
  const { bundleId } = await expectJson<{ bundleId: string }>(await post("/bundles", bundle), 201);
  const planned = await expectJson<{ planId: string; planHash: string; details: PublishContentReport }>(await post("/import/plan", { bundleId }), 200);

  const outcomeOf = (entityType: string, entityId: string) =>
    planned.details.rows.find((row) => row.entityType === entityType && row.entityId === entityId);
  assert.equal(outcomeOf("menu", "menu-header-nav")?.outcome, "applied", JSON.stringify(outcomeOf("menu", "menu-header-nav")));
  assert.equal(outcomeOf("page", "page-about")?.outcome, "applied", JSON.stringify(outcomeOf("page", "page-about")));
  assert.equal(outcomeOf("redirect", "exact:/e2e-old-page")?.outcome, "created", JSON.stringify(outcomeOf("redirect", "exact:/e2e-old-page")));
  assert.equal(outcomeOf("page", "page-faq")?.outcome, "conflict");
  assert.equal(
    outcomeOf("page", "page-faq")?.reason,
    "no prior sync baseline for page 'page-faq' with this peer — the destination already holds different content"
  );

  const { confirmationToken } = await expectJson<{ confirmationToken: string }>(
    await post("/import/confirm", { planId: planned.planId, planHash: planned.planHash }),
    200
  );
  const executed = await expectJson<{ changeSetIds: string[] }>(await post("/import/execute", { bundleId, confirmationToken }), 200);
  assert.equal(executed.changeSetIds.length, 3, "exactly the nav, the About page and the redirect were written");

  const nav = await destinationDeps.menuRepo.findById({ workspaceId: WORKSPACE, id: "menu-header-nav" });
  assert.equal(nav?.doc.items[0]?.label, "Docs", "the live header nav must now be the local one");
  const binding = await destinationDeps.navLocationBindingRepo.findByLocation({ workspaceId: WORKSPACE, locationKey: "header" });
  assert.equal(binding?.menuId, "menu-header-nav");

  const about = await destinationDeps.postRepo.findById({ workspaceId: WORKSPACE, id: "page-about" });
  assert.equal(about?.bodyFormat, "html");
  assert.equal(about?.bodyHtml, "<p>new about</p>");

  const redirects = await destinationDeps.redirectsWriteDeps.repo.list({ workspaceId: WORKSPACE, matchType: "exact" });
  const redirect = redirects.find((row) => row.fromPattern === "/e2e-old-page");
  assert.equal(redirect?.override, true);
  assert.equal(redirect?.toTarget, "/new-page");

  const faq = await destinationDeps.postRepo.findById({ workspaceId: WORKSPACE, id: "page-faq" });
  assert.equal(faq?.title, "FAQ edited on live", "a row edited on the destination must be left alone");
});

/** Stands in for an OLD-build peer: no `/capabilities` route (Express's plain 404), and records the
 *  bundle the push driver actually staged. */
class OldBuildPeerClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    const json = (value: unknown, status = 200): HttpResponse => ({ status, headers: {}, bodyText: JSON.stringify(value) });
    if (request.url.endsWith("/publish-content/capabilities")) return { status: 404, headers: {}, bodyText: "Cannot GET" };
    if (request.url.includes("/blobs/probe")) return json({ missing: [] });
    if (request.url.endsWith("/publish-content/bundles")) return json({ bundleId: "peer-bundle-1" });
    if (request.url.endsWith("/publish-content/import/plan")) {
      return json({ planId: "p", planHash: "h", details: { refused: false, refusalReason: null, applyOrder: [], rows: [] } });
    }
    throw new Error(`unexpected peer request: ${request.method} ${request.url}`);
  }
}

test("publish types: a push to an OLD-build destination trims redirects and menus and names what stayed here", async (t) => {
  const deps = createRouteDeps();
  await writeSeedContent(deps);
  await createRedirect({
    deps: deps.redirectsWriteDeps,
    input: { workspaceId: WORKSPACE, matchType: "exact", fromPattern: "/e2e-old-page", toTarget: "/new-page", statusCode: 301, override: true, actorId: "owner" },
  });
  const peerClient = new OldBuildPeerClient();
  deps.publishContentPeerHttpClient = peerClient;
  const { baseUrl, server } = await startServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const cookie = await loginAsOwner(baseUrl);

  const peersBase = `${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/peers`;
  const { peer } = await expectJson<{ peer: { id: string } }>(
    await fetch(peersBase, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ label: "production", baseUrl: "https://peer.example.com", remoteWorkspaceId: "remote-ws-9", apiKey: "tovu_live_0123456789abcdef" }),
    }),
    201
  );
  const pushed = await expectJson<{ notSupportedByLive: Array<{ entityType: string; count: number }> }>(
    await fetch(`${peersBase}/${peer.id}/push/plan`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: "{}" }),
    200
  );

  const staged = peerClient.calls.find((call) => call.method === "POST" && call.url.endsWith("/publish-content/bundles"));
  assert.ok(staged?.body);
  const types = new Set((JSON.parse(staged.body) as { entities: Array<{ entityType: string }> }).entities.map((e) => e.entityType));
  assert.deepEqual([...types].filter((type) => !["post", "page", "media"].includes(type)), [], "an old build must only receive post/page/media");
  const heldBack = new Map(pushed.notSupportedByLive.map((entry) => [entry.entityType, entry.count]));
  assert.equal(heldBack.get("redirect"), 1);
  assert.ok((heldBack.get("menu") ?? 0) >= 1, JSON.stringify(pushed.notSupportedByLive));
});

test("publish types: an unmatched admin API route answers 404, which is what the capabilities probe reads as 'old build'", async (t) => {
  const { baseUrl, server } = await startServer(createRouteDeps());
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const cookie = await loginAsOwner(baseUrl);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/no-such-route`, { headers: { cookie } });
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// "Overwrite on live anyway" (publish-overwrite-live-plan-2026-09-24 §4/S2-S7), end to end over
// real HTTP: the three shapes the owner's own publish hits, each left alone without a tick and
// landing with one.
// ---------------------------------------------------------------------------

type PlannedReport = { planId: string; planHash: string; details: PublishContentReport };

/** Live holds its own header nav (never published from here, no seed), a POST at /about with a
 *  different id than the local About PAGE, and the Docs page under the same id at /documentation. */
async function setUpOverwriteScenario(t: import("node:test").TestContext) {
  const destinationDeps = createRouteDeps();
  await destinationDeps.menuRepo.save(headerNav("Live link", "/live-link"));
  await destinationDeps.postRepo.save(page({ id: "post-live-about", slug: "e2e-about", kind: "post", title: "About (live)" }));
  await destinationDeps.postRepo.save(page({ id: "page-docs", slug: "e2e-documentation", title: "Docs" }));

  const sourceDeps = createRouteDeps();
  await sourceDeps.menuRepo.save({ ...headerNav("Docs", "/docs"), version: 2 });
  await sourceDeps.postRepo.save(page({ id: "page-about-local", slug: "e2e-about", title: "About Tovu" }));
  await sourceDeps.postRepo.save(page({ id: "page-docs", slug: "e2e-docs", title: "Docs" }));

  const source = await startServer(sourceDeps);
  t.after(() => new Promise<void>((resolve) => source.server.close(() => resolve())));
  const destination = await startServer(destinationDeps);
  t.after(() => new Promise<void>((resolve) => destination.server.close(() => resolve())));
  const sourceCookie = await loginAsOwner(source.baseUrl);
  const cookie = await loginAsOwner(destination.baseUrl);
  const workspaceApi = `${destination.baseUrl}/api/admin/v1/workspaces/${WORKSPACE}`;
  const api = `${workspaceApi}/publish-content`;
  const post = (path: string, body: unknown) =>
    fetch(`${api}${path}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });

  const bundle = await expectJson<unknown>(
    await fetch(`${source.baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/export`, { headers: { cookie: sourceCookie } }),
    200
  );
  const { bundleId } = await expectJson<{ bundleId: string }>(await post("/bundles", bundle), 201);

  /** plan → confirm → execute, the keys sent at plan AND execute (the confirmed hash binds them). */
  async function publish(overwriteEntityKeys?: string[]) {
    const keys = overwriteEntityKeys === undefined ? {} : { overwriteEntityKeys };
    const planned = await expectJson<PlannedReport>(await post("/import/plan", { bundleId, ...keys }), 200);
    const { confirmationToken } = await expectJson<{ confirmationToken: string }>(
      await post("/import/confirm", { planId: planned.planId, planHash: planned.planHash }),
      200
    );
    const executed = await expectJson<{ changeSetIds: string[]; retiredChangeSetIds: string[] }>(
      await post("/import/execute", { bundleId, confirmationToken, ...keys }),
      200
    );
    const row = (entityType: string, entityId: string) =>
      planned.details.rows.find((candidate) => candidate.entityType === entityType && candidate.entityId === entityId);
    return { planned, executed, row };
  }

  return { destinationDeps, workspaceApi, cookie, publish };
}

const NAV_KEY = "menu:menu-header-nav";
const ABOUT_KEY = "page:page-about-local";
const DOCS_KEY = "page:page-docs";

test("overwrite live: unticked, the nav, the clashing About and the moved Docs are left alone on live, each with its reason", async (t) => {
  const { destinationDeps, publish } = await setUpOverwriteScenario(t);

  const { executed, row } = await publish();

  assert.deepEqual(
    { outcome: row("menu", "menu-header-nav")?.outcome, canOverwrite: row("menu", "menu-header-nav")?.canOverwrite, reason: row("menu", "menu-header-nav")?.reason },
    { outcome: "conflict", canOverwrite: true, reason: "no prior sync baseline for menu 'menu-header-nav' with this peer — the destination already holds different content" }
  );
  assert.deepEqual(
    { outcome: row("page", "page-about-local")?.outcome, canOverwrite: row("page", "page-about-local")?.canOverwrite, reason: row("page", "page-about-local")?.reason },
    { outcome: "blocked", canOverwrite: true, reason: "slug 'e2e-about' is already held by a different page ('post-live-about')" }
  );
  assert.deepEqual(
    { entityType: row("page", "page-about-local")?.retires?.entityType, entityId: row("page", "page-about-local")?.retires?.entityId, entityLabel: row("page", "page-about-local")?.retires?.entityLabel },
    { entityType: "post", entityId: "post-live-about", entityLabel: "About (live)" },
    "the plan names the live row a tick would move to Trash"
  );
  assert.deepEqual(
    { outcome: row("page", "page-docs")?.outcome, canOverwrite: row("page", "page-docs")?.canOverwrite, reason: row("page", "page-docs")?.reason },
    { outcome: "conflict", canOverwrite: true, reason: "no prior sync baseline for page 'page-docs' with this peer — the destination already holds different content" }
  );

  assert.deepEqual(executed.changeSetIds, []);
  assert.deepEqual(executed.retiredChangeSetIds, []);
  const nav = await destinationDeps.menuRepo.findById({ workspaceId: WORKSPACE, id: "menu-header-nav" });
  assert.equal(nav?.doc.items[0]?.label, "Live link");
  const liveAbout = await destinationDeps.postRepo.findById({ workspaceId: WORKSPACE, id: "post-live-about" });
  assert.equal(liveAbout?.slug, "e2e-about");
  assert.equal(liveAbout?.deletedAt ?? null, null);
  assert.equal(await destinationDeps.postRepo.findById({ workspaceId: WORKSPACE, id: "page-about-local" }), null);
  const docs = await destinationDeps.postRepo.findById({ workspaceId: WORKSPACE, id: "page-docs" });
  assert.equal(docs?.slug, "e2e-documentation");
});

test("overwrite live: ticked, the nav lands, live's /about post goes to Trash renamed and the local page takes /about, and Docs moves to /docs", async (t) => {
  const { destinationDeps, workspaceApi, cookie, publish } = await setUpOverwriteScenario(t);

  const { planned, executed, row } = await publish([NAV_KEY, ABOUT_KEY, DOCS_KEY]);

  assert.equal(row("menu", "menu-header-nav")?.outcome, "forced", JSON.stringify(planned.details.rows));
  assert.equal(row("page", "page-about-local")?.outcome, "forced");
  assert.equal(row("page", "page-about-local")?.retires?.entityId, "post-live-about");
  assert.equal(row("page", "page-docs")?.outcome, "forced");
  assert.equal(executed.changeSetIds.length, 3, "the nav, the local About page and Docs");
  assert.equal(executed.retiredChangeSetIds.length, 1, "live's About post, retired");

  // (a) the header nav with no baseline on live.
  const nav = await destinationDeps.menuRepo.findById({ workspaceId: WORKSPACE, id: "menu-header-nav" });
  assert.equal(nav?.doc.items[0]?.label, "Docs");

  // (b) the clash: live's post is in Trash under <slug>-replaced-<date>; the local page holds /about.
  const retired = await destinationDeps.postRepo.findById({ workspaceId: WORKSPACE, id: "post-live-about" });
  assert.ok(retired?.deletedAt, "live's About post must be in Trash");
  assert.equal(retired?.slug, `e2e-about-replaced-${retired!.deletedAt!.slice(0, 10).replace(/-/g, "")}`);
  const atAbout = await destinationDeps.postRepo.findBySlug({ workspaceId: WORKSPACE, slug: "e2e-about" });
  assert.equal(atAbout?.id, "page-about-local", "the local page lands under its own id");
  assert.equal(atAbout?.kind, "page");
  assert.equal(atAbout?.title, "About Tovu");

  const trash = await expectJson<{ items: Array<{ entityId: string; subtitle: string | null }> }>(
    await fetch(`${workspaceApi}/trash`, { headers: { cookie } }),
    200
  );
  assert.equal(trash.items.find((item) => item.entityId === "post-live-about")?.subtitle, "e2e-about (replaced by publish)");

  // Restoring it from Trash brings it back at the renamed address, never clashing with the new page.
  const restored = await expectJson<{ restored: number }>(
    await fetch(`${workspaceApi}/trash/restore`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ items: [{ entityType: "post", entityId: "post-live-about" }] }),
    }),
    200
  );
  assert.equal(restored.restored, 1);
  const back = await destinationDeps.postRepo.findById({ workspaceId: WORKSPACE, id: "post-live-about" });
  assert.equal(back?.deletedAt ?? null, null);
  assert.equal(back?.slug, retired?.slug);
  assert.equal((await destinationDeps.postRepo.findBySlug({ workspaceId: WORKSPACE, slug: "e2e-about" }))?.id, "page-about-local");

  // (c) the same id under a different slug on live.
  const docs = await destinationDeps.postRepo.findById({ workspaceId: WORKSPACE, id: "page-docs" });
  assert.equal(docs?.slug, "e2e-docs");
});

test("overwrite live: ticks sent through the relay to an OLD-build live are refused before anything is staged", async (t) => {
  const deps = createRouteDeps();
  await writeSeedContent(deps);
  const peerClient = new OldBuildPeerClient();
  deps.publishContentPeerHttpClient = peerClient;
  const { baseUrl, server } = await startServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const cookie = await loginAsOwner(baseUrl);
  const peersBase = `${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/peers`;
  const { peer } = await expectJson<{ peer: { id: string } }>(
    await fetch(peersBase, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ label: "production", baseUrl: "https://peer.example.com", remoteWorkspaceId: "remote-ws-9", apiKey: "tovu_live_0123456789abcdef" }),
    }),
    201
  );

  const refused = await expectJson<{ error: string; code: string }>(
    await fetch(`${peersBase}/${peer.id}/push/plan`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ overwriteEntityKeys: ["page:page-about"] }),
    }),
    502
  );
  assert.deepEqual(refused, {
    error: "https://peer.example.com is on an older Tovu, so it can't overwrite these yet. Update https://peer.example.com, then publish again.",
    code: "PEER_CANNOT_OVERWRITE",
  });
  assert.equal(peerClient.calls.some((call) => call.url.endsWith("/publish-content/bundles")), false, "nothing may be staged on the old live");
});

/** A grantless api_key principal issued a key under the admin built-in policy, as a Bearer header —
 *  the same pair `admin-site-token-routes.test.ts` mints. */
async function issueAdminApiKey(baseUrl: string, cookie: string): Promise<{ authorization: string }> {
  const principal = await expectJson<{ principal: { id: string } }>(
    await fetch(`${baseUrl}/api/admin/v1/api-keys/principals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ displayName: "overwrite-probe" }),
    }),
    201
  );
  const policies = await expectJson<{ policies: Array<{ id: string; name: string }> }>(
    await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/policies`, { headers: { cookie } }),
    200
  );
  const policyId = policies.policies.find((row) => row.name === "admin-builtin-policy")?.id;
  assert.ok(policyId);
  const issued = await expectJson<{ apiKey: { rawKey: string } }>(
    await fetch(`${baseUrl}/api/admin/v1/api-keys`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ principalId: principal.principal.id, label: "overwrite-probe", policyIds: [policyId] }),
    }),
    201
  );
  return { authorization: `Bearer ${issued.apiKey.rawKey}` };
}

test("overwrite live: an API key cannot send ticks through the relay — only a signed-in admin can", async (t) => {
  const deps = createRouteDeps();
  const peerClient = new OldBuildPeerClient();
  deps.publishContentPeerHttpClient = peerClient;
  const { baseUrl, server } = await startServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const cookie = await loginAsOwner(baseUrl);
  const bearer = await issueAdminApiKey(baseUrl, cookie);
  const peersBase = `${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/peers`;
  const { peer } = await expectJson<{ peer: { id: string } }>(
    await fetch(peersBase, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ label: "production", baseUrl: "https://peer.example.com", remoteWorkspaceId: "remote-ws-9", apiKey: "tovu_live_0123456789abcdef" }),
    }),
    201
  );

  for (const [path, body] of [
    ["push/plan", { overwriteEntityKeys: ["page:page-about"] }],
    ["push/execute", { bundleId: "b1", confirmationToken: "tok-1", overwriteEntityKeys: ["page:page-about"] }],
  ] as const) {
    const refused = await expectJson<{ code: string; error: string; details: { reason: string } }>(
      await fetch(`${peersBase}/${peer.id}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...bearer },
        body: JSON.stringify(body),
      }),
      403
    );
    assert.equal(refused.code, "FORBIDDEN", path);
    assert.equal(refused.error, "'overwriteEntityKeys' can only be sent from a signed-in admin session", path);
    assert.equal(refused.details.reason, "credential_kind_not_permitted", path);
  }
  assert.deepEqual(peerClient.calls, [], "a refused request never reaches the peer");
});

test("overwrite live: on the destination, an API key cannot send ticks to /import/plan or /import/execute", async (t) => {
  const { baseUrl, server } = await startServer(createRouteDeps());
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const cookie = await loginAsOwner(baseUrl);
  const bearer = await issueAdminApiKey(baseUrl, cookie);
  const api = `${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content`;

  for (const [path, body] of [
    ["/import/plan", { bundleId: "b1", overwriteEntityKeys: ["page:page-about"] }],
    ["/import/execute", { bundleId: "b1", confirmationToken: "tok-1", overwriteEntityKeys: ["page:page-about"] }],
  ] as const) {
    const refused = await expectJson<{ code: string; error: string; details: { reason: string } }>(
      await fetch(`${api}${path}`, { method: "POST", headers: { "content-type": "application/json", ...bearer }, body: JSON.stringify(body) }),
      403
    );
    assert.equal(refused.code, "FORBIDDEN", path);
    assert.equal(refused.error, "'overwriteEntityKeys' can only be sent from a signed-in admin session or a publishing instance", path);
    assert.equal(refused.details.reason, "credential_kind_not_permitted", path);
  }
});
