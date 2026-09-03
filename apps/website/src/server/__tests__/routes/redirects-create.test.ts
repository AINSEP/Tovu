import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAdminRedirectCreateRoute } from "../../inbound/admin-http/routes/redirects/create.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import type { RouteDeps } from "../../routes/types.js";
import { bootAuthenticated, extractRouteHandler, createCapturingResponse } from "../helpers/http-test-server.js";

/**
 * @file Coverage-gap fill for `redirects/create.ts` (dispatched post-TestRunner). Existing suites
 * (`redirects-auth.test.ts`, `redirects-site-serving.test.ts`) only ever exercise the route with
 * one fully-valid body, so `parseRedirectCreateBody`'s own rejection branches, and the
 * domain-level (`createRedirect`) validation/conflict/loop branches the route's `catch` maps, were
 * never reached. Adds those, plus the two security questions the coverage-gap dispatch called out
 * explicitly: can this route create a redirect LOOP (self, or an A->B/B->A chain), or shadow an
 * existing rule silently.
 *
 * Verdict on both: NO. `resolveCollapsedTarget` (`features/redirects/redirects.ts`) rejects a
 * self-redirect and a two-hop A->B/B->A chain identically (both collapse to a target equal to the
 * request's own `fromPattern` and throw `RedirectLoopError`) — proven directly below, not asserted
 * from reading the source alone.
 */

const WORKSPACE_ID = "workspace-local";
const CREATE_URL = `/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects`;

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminRedirectCreateRoute(app, deps);
  return { app, deps };
}

function post(baseUrl: string, cookie: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${CREATE_URL}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

test("admin redirects create route: workspace mismatch is 404 before any body validation", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/redirects`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ matchType: "exact", fromPattern: "/a", toTarget: "/b", statusCode: 301 }),
  });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "workspace was not found");
});

test("admin redirects create route: every parseRedirectCreateBody rejection branch returns 400 VALIDATION_ERROR", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const cases: Array<[string, unknown]> = [
    ["missing matchType", { fromPattern: "/a", toTarget: "/b", statusCode: 301 }],
    ["invalid matchType", { matchType: "nonsense", fromPattern: "/a", toTarget: "/b", statusCode: 301 }],
    ["fromPattern not a string", { matchType: "exact", fromPattern: 123, toTarget: "/b", statusCode: 301 }],
    ["toTarget not a string", { matchType: "exact", fromPattern: "/a", toTarget: 123, statusCode: 301 }],
    ["missing statusCode", { matchType: "exact", fromPattern: "/a", toTarget: "/b" }],
    ["invalid statusCode", { matchType: "exact", fromPattern: "/a", toTarget: "/b", statusCode: 200 }],
  ];

  for (const [label, body] of cases) {
    const res = await post(baseUrl, cookie, body);
    assert.equal(res.status, 400, `${label} should be 400`);
    const json = (await res.json()) as { code: string; error: string };
    assert.equal(json.code, "VALIDATION_ERROR", label);
    assert.ok(json.error.length > 0, label);
  }
});

test("admin redirects create route: override/priority default to false/0 when omitted, and honor explicit values when present", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const withDefaults = await post(baseUrl, cookie, {
    matchType: "exact",
    fromPattern: "/defaults",
    toTarget: "/target-defaults",
    statusCode: 301,
  });
  const defaultsRaw = await withDefaults.text();
  assert.equal(withDefaults.status, 201, defaultsRaw);
  const defaultsJson = JSON.parse(defaultsRaw) as { data: { override: boolean; priority: number } };
  assert.equal(defaultsJson.data.override, false);
  assert.equal(defaultsJson.data.priority, 0);

  const withExplicit = await post(baseUrl, cookie, {
    matchType: "exact",
    fromPattern: "/explicit",
    toTarget: "/target-explicit",
    statusCode: 302,
    override: true,
    priority: 7,
  });
  const explicitRaw = await withExplicit.text();
  assert.equal(withExplicit.status, 201, explicitRaw);
  const explicitJson = JSON.parse(explicitRaw) as { data: { override: boolean; priority: number } };
  assert.equal(explicitJson.data.override, true);
  assert.equal(explicitJson.data.priority, 7);
});

test("admin redirects create route: matchType 'regex' is a valid request shape but is always rejected write-side (REQ-22)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await post(baseUrl, cookie, { matchType: "regex", fromPattern: "/re", toTarget: "/target", statusCode: 301 });
  assert.equal(res.status, 400);
  const json = (await res.json()) as { code: string; error: string };
  assert.equal(json.code, "REDIRECT_VALIDATION_ERROR");
  assert.match(json.error, /regex.*not enabled/);
});

test("admin redirects create route: an absolute toTarget outside the verified origin is rejected write-side (open-redirect oracle, REQ-08)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await post(baseUrl, cookie, {
    matchType: "exact",
    fromPattern: "/go-evil-create",
    toTarget: "https://evil.example/steal",
    statusCode: 301,
  });
  assert.equal(res.status, 400);
  const json = (await res.json()) as { code: string };
  assert.equal(json.code, "REDIRECT_TARGET_NOT_ALLOWED");
});

test("admin redirects create route: an active exact-match duplicate fromPattern is a 409 conflict", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const first = await post(baseUrl, cookie, { matchType: "exact", fromPattern: "/dup-create", toTarget: "/one", statusCode: 301 });
  assert.equal(first.status, 201, await first.text());

  const second = await post(baseUrl, cookie, { matchType: "exact", fromPattern: "/dup-create", toTarget: "/two", statusCode: 301 });
  assert.equal(second.status, 409);
  const json = (await second.json()) as { code: string };
  assert.equal(json.code, "REDIRECT_CONFLICT");
});

test("SECURITY: a self-redirect (fromPattern === toTarget) is rejected as a loop, not created", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await post(baseUrl, cookie, { matchType: "exact", fromPattern: "/self-loop", toTarget: "/self-loop", statusCode: 301 });
  assert.equal(res.status, 409);
  const json = (await res.json()) as { code: string; error: string };
  assert.equal(json.code, "REDIRECT_LOOP_DETECTED");
  assert.match(json.error, /cycle/);
});

test("SECURITY: creating B->A when A->B already exists collapses the chain and rejects it as a loop (never a live two-hop cycle)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const first = await post(baseUrl, cookie, { matchType: "exact", fromPattern: "/loop-a", toTarget: "/loop-b", statusCode: 301 });
  assert.equal(first.status, 201, await first.text());

  const second = await post(baseUrl, cookie, { matchType: "exact", fromPattern: "/loop-b", toTarget: "/loop-a", statusCode: 301 });
  const secondRaw = await second.text();
  assert.equal(second.status, 409, secondRaw);
  const json = JSON.parse(secondRaw) as { code: string; error: string };
  assert.equal(json.code, "REDIRECT_LOOP_DETECTED");
  assert.match(json.error, /cycle/);
});

test("admin redirects create route: an unexpected error surfaces as 500 INTERNAL_ERROR, not the domain 4xx mappings", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const origAuthorize = deps.authorize;
  deps.authorize = async () => {
    throw new Error("boom");
  };
  try {
    const res = await post(baseUrl, cookie, { matchType: "exact", fromPattern: "/err", toTarget: "/target", statusCode: 301 });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "internal error", code: "INTERNAL_ERROR" });
  } finally {
    deps.authorize = origAuthorize;
  }
});

test("admin redirects create route: req.params.workspaceId is always populated by Express for a matched route (defensive ?? \"\" fallback is unreachable through real HTTP)", async (t) => {
  // Same technique `extractRouteHandler`'s own doc prescribes: Express guarantees a matched
  // `:workspaceId` segment is always a populated string, so the `?? ""` fallback on
  // `redirects/create.ts`'s first line can only execute via a hand-built `req` that violates
  // that contract on purpose -- not through any real request.
  const { app, deps } = buildTestApp();
  const handler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/redirects");
  const { res, capture } = createCapturingResponse();

  await handler({ params: {}, body: { matchType: "exact", fromPattern: "/a", toTarget: "/b", statusCode: 301 } }, res);

  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
  void deps;
});
