import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/app";
import {
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminIntegrationsCreateRoute } from "../create.js";
import type { IntegrationsRouteDeps } from "../deps.js";

/**
 * @file Unit-tier coverage for `POST .../integrations/subscriptions` (`registerAdminIntegrationsCreateRoute`).
 * Isolated/fast: a bare Express app with a stubbed `res.locals.principal` (skips real login/session,
 * `getAuthedPrincipal` only ever reads that field) and real in-memory repos narrowed out of
 * `createRouteDeps()` — same technique `explore-liquid-readable.test.ts` already uses. `authorize`
 * defaults to a permissive fake so most tests reach the route's own business logic; the one 403 test
 * overrides it to `allowed: false`.
 *
 * Every distinct outcome this file's real logic can produce is covered below: workspace mismatch
 * (404, both the real-HTTP mismatch and the direct-invoke `?? ""` fallback -- see the dedicated
 * test below), forbidden (403), each of `createSubscription`'s validation-error triggers (400 x6 —
 * label required, malformed URL, non-https URL, disallowed egress target, missing topics, non-array
 * topics), success (201), and a generic unexpected failure (500).
 *
 * Verified directly against this file's own raw V8 coverage (byte-offset ranges, not the lossier
 * line-based lcov view -- see this session's report for the technique): after the fixes above, the
 * only remaining zero-hit ranges are esbuild's own CJS/ESM interop shim internals (`__copyProps`'s
 * dead `typeof from === "function"` arm, and the `0 && (module.exports = {...})` TS-declaration
 * annotation esbuild always emits as unreachable-by-construction) -- neither is code this file
 * authored, both confirmed by diffing this file's own esbuild-transpiled output.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/integrations/subscriptions`;

function buildApp(depsOverrides: Partial<IntegrationsRouteDeps> = {}): express.Express {
  const base = createRouteDeps();
  const deps: IntegrationsRouteDeps = {
    workspaceId: base.workspaceId,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: base.clock,
    idGen: base.idGen,
    webhookSubscriptionRepo: base.webhookSubscriptionRepo,
    webhookDeliveryRepo: base.webhookDeliveryRepo,
    originRegistry: base.originRegistry,
    ...depsOverrides,
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminIntegrationsCreateRoute(app, deps);
  return app;
}

async function post(
  t: import("node:test").TestContext,
  app: express.Express,
  body: unknown,
  options: { noBody?: boolean; path?: string } = {}
): Promise<{ status: number; json: unknown }> {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${options.path ?? BASE}`, {
    method: "POST",
    headers: options.noBody ? {} : { "content-type": "application/json" },
    body: options.noBody ? undefined : JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("create: a mismatched workspaceId in the URL 404s", async (t) => {
  const app = buildApp();
  const { status } = await post(t, app, { label: "x" }, { path: "/api/admin/v1/workspaces/not-real/integrations/subscriptions" });
  assert.equal(status, 404);
});

test("create: authorize() returning allowed:false 403s", async (t) => {
  const app = buildApp({ authorize: async () => ({ allowed: false, reason: "no grant" }) });
  const { status } = await post(t, app, { label: "x", targetUrl: "https://example.com/hook", topics: ["a"] });
  assert.equal(status, 403);
});

test("create: no body at all (req.body undefined) still 400s on the missing-label validation", async (t) => {
  const app = buildApp();
  const { status } = await post(t, app, undefined, { noBody: true });
  assert.equal(status, 400);
});

test("create: empty object body 400s — label is required", async (t) => {
  const app = buildApp();
  const { status } = await post(t, app, {});
  assert.equal(status, 400);
});

test("create: label present, malformed targetUrl 400s", async (t) => {
  const app = buildApp();
  const { status } = await post(t, app, { label: "x", targetUrl: "not-a-url", topics: ["a"] });
  assert.equal(status, 400);
});

test("create: label + non-https targetUrl 400s", async (t) => {
  const app = buildApp();
  const { status } = await post(t, app, { label: "x", targetUrl: "http://example.com/hook", topics: ["a"] });
  assert.equal(status, 400);
});

test("create: label + https targetUrl but disallowed egress target 400s", async (t) => {
  const app = buildApp({
    originRegistry: { isAllowedEgressTarget: async () => false } as unknown as IntegrationsRouteDeps["originRegistry"],
  });
  const { status } = await post(t, app, { label: "x", targetUrl: "https://example.com/hook", topics: ["a"] });
  assert.equal(status, 400);
});

test("create: valid label/url, topics omitted (defaults to []) 400s — at least one topic is required", async (t) => {
  const app = buildApp();
  const { status } = await post(t, app, { label: "x", targetUrl: "https://example.com/hook" });
  assert.equal(status, 400);
});

test("create: valid label/url, topics is not an array 400s the same way as omitted", async (t) => {
  const app = buildApp();
  const { status } = await post(t, app, { label: "x", targetUrl: "https://example.com/hook", topics: "not-an-array" });
  assert.equal(status, 400);
});

test("create: fully valid request succeeds (201) and echoes the created subscription", async (t) => {
  const app = buildApp();
  const { status, json } = await post(t, app, { label: "x", targetUrl: "https://example.com/hook", topics: ["a", "b"] });
  assert.equal(status, 201, JSON.stringify(json));
  const body = json as { subscription: { label: string; targetUrl: string; topics: string[] } };
  assert.equal(body.subscription.label, "x");
  assert.deepEqual(body.subscription.topics, ["a", "b"]);
});

test("create: an undefined workspaceId param (impossible via real routing -- a matched `:workspaceId` segment is always a populated string) still 404s through the `?? \"\"` fallback", async (t) => {
  // Express's router never invokes this handler at all unless `:workspaceId` matched a non-empty
  // path segment, so `req.params.workspaceId` can never actually be `undefined` here through any
  // real request -- confirmed by V8's own per-branch coverage data (`??` on this exact expression
  // is the one real, always-zero-hit branch left after exhaustive HTTP-level testing; see this
  // session's report). Reached the same way a `default: throw` exhaustiveness guard is reached:
  // deliberately violate the (Express-guaranteed, not just TypeScript-inferred) contract by calling
  // the real handler directly with a `req.params.workspaceId` the router itself would never produce.
  const app = buildApp();
  const handler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions");
  const { res, capture } = createCapturingResponse();
  const req = { params: { workspaceId: undefined }, body: { label: "x" } } as unknown as Parameters<typeof handler>[0];

  await handler(req, res);

  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("create: an unexpected repo failure (not a validation/not-found error) 500s", async (t) => {
  const base = createRouteDeps();
  const app = buildApp({
    webhookSubscriptionRepo: {
      ...base.webhookSubscriptionRepo,
      save: async () => {
        throw new Error("boom");
      },
    },
  });
  const { status } = await post(t, app, { label: "x", targetUrl: "https://example.com/hook", topics: ["a"] });
  assert.equal(status, 500);
});
