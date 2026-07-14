import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "../helpers/http-test-server";

import express from "express";

import type { NormalizedHit } from "../../../analytics/types";
import { createRouteDeps } from "../../app";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth";
import { registerAdminAnalyticsRecentHitsRoute } from "../../routes/admin/analytics/recent-hits";
import type { RouteDeps } from "../../routes/types";

/**
 * @file Route-level tests for `GET /api/admin/v1/workspaces/:workspaceId/analytics/recent-hits`.
 *
 * FEAT-014 / ADR-PIPE-014: this route previously registered zero `authorize()` call — any
 * authenticated admin session (any principal, any/no grants) could read the raw traffic buffer.
 * Rewritten from a bare no-auth standalone-Express-app harness to the real-session harness
 * (`createRouteDeps()` + `registerAuthRoutes` + `requireAdminSession` + real login), mirroring
 * `settings-auth.test.ts`'s `buildTestApp()` / `bootAuthenticated()` / `loginAsBarePrincipal()`
 * pattern, so the new `analytics.read` gate is exercised through a real HTTP + real session path
 * rather than a mock.
 */

function makeHit(overrides: Partial<NormalizedHit> = {}): NormalizedHit {
  return {
    workspaceId: "workspace-1",
    occurredAt: "2026-07-10T12:00:00.000Z",
    kind: "pageview",
    path: "/",
    referrerHost: null,
    utm: { source: null, medium: null, campaign: null, term: null, content: null },
    country: null,
    region: null,
    deviceClass: "desktop",
    browserFamily: "chrome",
    osFamily: "windows",
    visitorHash: "hash-1",
    sessionId: "session-1",
    eventName: null,
    eventProps: null,
    ...overrides,
  };
}

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminAnalyticsRecentHitsRoute(app, deps);
  return { app, deps };
}

/** A principal with a login but zero role/policy grants — `authorize()` returns `no_grant` for anything. */
async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string) {
  await deps.identityReady;
  const bareId = "bare-principal-analytics";
  await deps.principalRepo.save({
    id: bareId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: bareId,
    workspaceId: deps.workspaceId,
    username: "bare-analytics",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-analytics", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("REQ-14: GET recent-hits denied 403 FORBIDDEN without analytics.read; carries no hit data", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/analytics/recent-hits`, {
    headers: { cookie: bareCookie },
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string }; hits?: unknown };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "analytics.read");
  assert.equal("hits" in body, false); // INV-R1: no hit data leaks past a denial
});

test("REQ-14: GET recent-hits succeeds (200) for the seeded owner (wildcard grant)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/analytics/recent-hits`, {
    headers: { cookie: ownerCookie },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { hits: unknown[] };
  assert.deepEqual(body.hits, []);
});

test("AC-27: owner sees hits newest-first with only the honest raw-ingest fields", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.analyticsSink.acceptBatch([
    makeHit({ path: "/first", occurredAt: "2026-07-10T12:00:00.000Z" }),
    makeHit({ path: "/second", occurredAt: "2026-07-10T12:01:00.000Z" }),
  ]);
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/analytics/recent-hits`, {
    headers: { cookie: ownerCookie },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { hits: Array<Record<string, unknown>> };

  assert.equal(body.hits.length, 2);
  assert.equal(body.hits[0].path, "/second"); // newest first
  assert.equal(body.hits[1].path, "/first");

  const fields = Object.keys(body.hits[0]).sort();
  assert.deepEqual(fields, [
    "browserFamily",
    "deviceClass",
    "eventName",
    "kind",
    "occurredAt",
    "path",
    "referrerHost",
  ]);
  // No PII/internal fields leak through (workspaceId, visitorHash, sessionId, utm, ip, userAgent).
  assert.equal("visitorHash" in body.hits[0], false);
  assert.equal("sessionId" in body.hits[0], false);
  assert.equal("workspaceId" in body.hits[0], false);
});

test("AC-30: owner's ?limit= query param is respected", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.analyticsSink.acceptBatch([makeHit({ path: "/a" }), makeHit({ path: "/b" }), makeHit({ path: "/c" })]);
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/analytics/recent-hits?limit=1`,
    { headers: { cookie: ownerCookie } }
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { hits: Array<{ path: string }> };
  assert.equal(body.hits.length, 1);
  assert.equal(body.hits[0].path, "/c"); // most recently accepted
});

test("AC-31: owner's non-numeric ?limit= is ignored rather than erroring", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.analyticsSink.acceptBatch([makeHit(), makeHit(), makeHit()]);
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/analytics/recent-hits?limit=not-a-number`,
    { headers: { cookie: ownerCookie } }
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { hits: unknown[] };
  assert.equal(body.hits.length, 3); // falls back to the sink's default limit, not an error
});

test("AC-29: 404s on a workspace id that does not match the deployed workspace (checked before authorize)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/analytics/recent-hits`, {
    headers: { cookie: ownerCookie },
  });
  assert.equal(res.status, 404);
});

/**
 * T001b (INV-R2, resolved per tasks.md's flag): the ADR's own W-001/INV-R2 text claims
 * `authorize()` must run BEFORE the `:workspaceId` 404 check, citing `get-effective.ts`/`list.ts`
 * as precedent — but direct inspection of those two files (see tasks.md's flag block) shows they
 * both do the opposite: workspace-check first, then `authorize()`. T003 was implemented to match
 * that verified, byte-for-byte real precedent (same as Decision §1/Enforcement's own prose), not
 * W-001/INV-R2's incorrect claim. Under the real precedent, both ordering-pair cases collapse to
 * the same observable outcome: a mismatched `:workspaceId` always 404s before `authorize()` is
 * ever reached, regardless of the caller's grant. These two cases assert exactly that (mismatched
 * workspace + no grant; mismatched workspace + a valid `analytics.read` grant) so a future
 * accidental reordering (authorize-before-workspace-check) would be caught by a behavior change
 * here. Certified as a required pass/fail case, not left conditional — see this feature's report
 * for why: the "ambiguity" was between ADR prose and verified source, not a real design fork, so
 * the smallest reasonable resolution is to test the one ordering that is actually implemented.
 */
test("T001b/INV-R2: mismatched :workspaceId 404s before authorize() runs, for a bare (no-grant) principal", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/analytics/recent-hits`, {
    headers: { cookie: bareCookie },
  });
  // Workspace-check-first precedent: a 404 (not a 403) even though this principal would also be
  // denied by authorize() if the check order were reversed.
  assert.equal(res.status, 404);
});

test("T001b/INV-R2: mismatched :workspaceId 404s before authorize() runs, even for the owner's wildcard grant", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/analytics/recent-hits`, {
    headers: { cookie: ownerCookie },
  });
  // Workspace-check-first precedent: a 404 even for a principal that would pass authorize().
  assert.equal(res.status, 404);
});
