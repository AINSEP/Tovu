import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "../../app.js";
import { registerAdminRedirectCreateRoute } from "../../routes/admin/redirects/create.js";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth.js";
import { registerSiteRoutes } from "../../routes/site/pages.js";
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
