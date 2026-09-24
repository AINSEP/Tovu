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
