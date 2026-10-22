import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAdminRedirectUpdateRoute } from "../../inbound/admin-http/routes/redirects/update.js";
import { registerAdminRedirectCreateRoute } from "../../inbound/admin-http/routes/redirects/create.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerSiteRoutes } from "../../inbound/public-http/routes/site/pages.js";
import type { RouteDeps } from "../../routes/types.js";
import { startTestServer, loginAsOwner } from "../helpers/http-test-server.js";

/**
 * @file Coordinator-authored (2026-07-13), post-session-limit resume. Proves
 * the real HTTP boundary — not just the domain layer — actually serves a
 * redirect. `tasks.md`'s own Phase-1 note calls this "the single most
 * important test in this feature" (T041); it did not exist before this pass
 * because the killed implementation agent never reached Phase 3 (site-route
 * wiring). `src/server/routes/site/pages.ts` now calls
 * `runPreContentPhase`/`runPostContentPhase` before/after its own content
 * lookup — this test exercises that wiring against a real running server,
 * not a mocked resolver.
 */

const WORKSPACE_ID = "workspace-local";

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminRedirectCreateRoute(app, deps);
  registerAdminRedirectUpdateRoute(app, deps);
  registerSiteRoutes(app, deps);
  return { app, deps };
}

test("T041/INV-03: a real GET request to a redirect rule's source path is actually redirected by the live site route, not just resolvable in-domain", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  const cookie = await loginAsOwner(baseUrl);

  const create = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      matchType: "exact",
      fromPattern: "/old-page",
      toTarget: "/new-page",
      statusCode: 301,
      override: true,
    }),
  });
  assert.equal(create.status, 201, await create.text());

  const visit = await fetch(`${baseUrl}/old-page`, { redirect: "manual" });
  assert.equal(visit.status, 301);
  assert.equal(visit.headers.get("location"), "/new-page");
});

test("T041b: a path with no matching redirect rule still 404s through the normal site route (no false-positive redirect)", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);

  const visit = await fetch(`${baseUrl}/definitely-not-a-real-page-or-rule`, { redirect: "manual" });
  assert.equal(visit.status, 404);
});

// Imported store URLs like /products/<handle> are nested; redirects must not stop at /:slug.
test("nested redirect sources retain their status code and the existing trailing-slash/query normalization in both phases", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  const cookie = await loginAsOwner(baseUrl);

  for (const rule of [
    { fromPattern: "/products/blue-shirt", statusCode: 308, override: false },
    { fromPattern: "/old/catalog/shirts/blue", statusCode: 301, override: true },
  ]) {
    const create = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ matchType: "exact", toTarget: "/new-shirt", ...rule }),
    });
    assert.equal(create.status, 201, await create.text());

    for (const suffix of ["", "/", "?campaign=old", "/?campaign=old"]) {
      const visit = await fetch(`${baseUrl}${rule.fromPattern}${suffix}`, { redirect: "manual" });
      assert.equal(visit.status, rule.statusCode);
      assert.equal(visit.headers.get("location"), "/new-shirt");
      await visit.arrayBuffer();
    }
  }
});

// Bug A (2026-10-22): WordPress date permalinks are imported WITH their trailing slash, while the
// site route sees the request without it (and sometimes percent-encoded). Depths 1-5 must all redirect.
test("imported multi-segment sources stored with a trailing slash redirect at depths 1-5, with or without the slash", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  const cookie = await loginAsOwner(baseUrl);
  const segments = ["2022", "06", "13", "craving", "caf%C3%A9"];

  for (let depth = 1; depth <= 5; depth += 1) {
    const source = `/${segments.slice(0, depth).join("/")}/`;
    const create = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ matchType: "exact", fromPattern: depth === 5 ? source.replace("caf%C3%A9", "café") : source, toTarget: `/blog/post-${depth}`, statusCode: 301, override: false }),
    });
    assert.equal(create.status, 201, await create.text());

    for (const visitPath of [source, source.slice(0, -1)]) {
      const visit = await fetch(`${baseUrl}${visitPath}`, { redirect: "manual" });
      assert.equal(visit.status, 301, visitPath);
      assert.equal(visit.headers.get("location"), `/blog/post-${depth}`);
      await visit.arrayBuffer();
    }
  }
});

test("a nested override redirect wins pre_content before a more specific ordinary rule can win post_content", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  const cookie = await loginAsOwner(baseUrl);

  // A lone override also matches post_content, so it cannot detect a missing pre_content call.
  // The ordinary exact rule wins only if the override's earlier phase is bypassed.
  for (const rule of [
    { matchType: "exact", fromPattern: "/old/section", toTarget: "/ordinary-target", statusCode: 308, override: false },
    { matchType: "wildcard", fromPattern: "/old/*", toTarget: "/override-target", statusCode: 301, override: true },
  ]) {
    const create = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(rule),
    });
    assert.equal(create.status, 201, await create.text());
  }

  const visit = await fetch(`${baseUrl}/old/section`, { redirect: "manual" });
  assert.equal(visit.status, 301);
  assert.equal(visit.headers.get("location"), "/override-target");
  await visit.arrayBuffer();
});

test("a nested path with no redirect row still reaches the normal 404", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);

  const visit = await fetch(`${baseUrl}/products/missing-shirt`, { redirect: "manual" });
  assert.equal(visit.status, 404);
  assert.equal(visit.headers.get("location"), null);
  await visit.arrayBuffer();
});

test("admin/API misses never consult a broad nested redirect; public nested misses do", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await startTestServer(app, t);
  const cookie = await loginAsOwner(baseUrl);
  const create = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ matchType: "wildcard", fromPattern: "/*/*", toTarget: "/redirect-target", statusCode: 302, override: true }),
  });
  assert.equal(create.status, 201, await create.text());

  for (const path of ["/admin/missing", "/api/missing"]) {
    const visit = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
    assert.equal(visit.status, 404);
    assert.equal(visit.headers.get("location"), null);
    await visit.arrayBuffer();
  }

  const visit = await fetch(`${baseUrl}/guides/old`, { redirect: "manual" });
  assert.equal(visit.status, 302);
  assert.equal(visit.headers.get("location"), "/redirect-target");
  await visit.arrayBuffer();
});

/**
 * Security characterization test — NOT a bug fix, NOT written to move a coverage number. Exists so
 * nobody deletes it later as "redundant": `phase-handler.oracle.test.ts` already certifies this
 * invariant at the resolver-domain level (INV-03: `resolve()` returns `{ matched: false }`), but
 * nothing previously proved the FULL HTTP stack actually fails closed — that the real `GET /:slug`
 * route (`routes/site/pages.ts`'s `tryRedirectPhase`) turns that `matched: false` into an honest
 * 404, not a 500, an empty body, or (worst case) a real 3xx pointed at the disallowed origin. A
 * future refactor of `tryRedirectPhase`/`handlePostNotFoundOnSlugRoute` could silently regress that
 * translation without any resolver-level test catching it.
 *
 * Seeds the rule directly via `deps.redirectRepo.save()` (the same seam `redirects-auth.test.ts`
 * already uses), bypassing the admin CREATE route's own write-time oracle check — deliberately, so
 * this test exercises the READ-side gate specifically (the one a rule authored under a different
 * verified origin, or written some other way, would still have to pass at request time) rather than
 * asserting the write-time gate a second time.
 */
test("security characterization: a redirect rule whose target is a disallowed cross-origin destination fails CLOSED through the real HTTP route -- 404, never a 3xx to the disallowed origin", async (t) => {
  const { app, deps } = buildTestApp();
  const baseUrl = await startTestServer(app, t);

  const record = {
    id: "evil-redirect",
    workspaceId: WORKSPACE_ID,
    matchType: "exact" as const,
    fromPattern: "/go-evil",
    toTarget: "https://evil.example/steal",
    statusCode: 301 as const,
    status: "active" as const,
    override: true,
    priority: 0,
    source: "manual" as const,
    createdByPrincipal: "system",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    version: 1,
  };
  await deps.redirectRepo.save({
    record,
    revision: {
      redirectId: record.id,
      workspaceId: WORKSPACE_ID,
      seq: 1,
      state: record,
      tombstoned: false,
      actorId: "system",
      recordedAt: record.createdAt,
    },
  });

  const visit = await fetch(`${baseUrl}/go-evil`, { redirect: "manual" });

  assert.equal(visit.status, 404, "the disallowed cross-origin target must never reach a 3xx response");
  assert.equal(visit.headers.get("location"), null, "no Location header may point anywhere, let alone at the disallowed origin");
});


test("ordinary redirects serve content misses, while override controls precedence over a published page", async (t) => {
  const { app, deps } = buildTestApp();
  const [seed] = await deps.postRepo.list({ workspaceId: WORKSPACE_ID });
  assert.ok(seed);
  await deps.postRepo.save({ ...seed, id: "precedence-page", slug: "precedence-page", kind: "page", status: "published",
    bodyFormat: "doc", bodyHtml: null, bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Existing page wins" }] }] },
  });
  const baseUrl = await startTestServer(app, t);
  const cookie = await loginAsOwner(baseUrl);
  const create = async (fromPattern: string) => {
    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects`, {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ matchType: "exact", fromPattern, toTarget: "/precedence-target", statusCode: 302, override: false }),
    });
    assert.equal(res.status, 201, await res.clone().text());
    return (await res.json()).data.id as string;
  };
  await create("/content-miss");
  const miss = await fetch(`${baseUrl}/content-miss`, { redirect: "manual" });
  assert.equal(miss.status, 302);
  assert.equal(miss.headers.get("location"), "/precedence-target");
  const redirectId = await create("/precedence-page");
  const content = await fetch(`${baseUrl}/precedence-page`, { redirect: "manual" });
  assert.equal(content.status, 200);
  assert.equal(content.headers.get("location"), null);
  assert.ok((await content.text()).includes("<p>Existing page wins</p>"));
  const override = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects/${redirectId}`, {
    method: "PATCH", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ override: true }),
  });
  assert.equal(override.status, 200, await override.text());
  const redirected = await fetch(`${baseUrl}/precedence-page`, { redirect: "manual" });
  assert.equal(redirected.status, 302);
  assert.equal(redirected.headers.get("location"), "/precedence-target");
});
