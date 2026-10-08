import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import type { RedirectRecord } from "@jini-ai/cms/redirects";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import {
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminRedirectListRoute } from "../list.js";
import type { RedirectRouteDeps } from "#src/server/inbound/admin-http/http/redirects";

const WORKSPACE_ID = "workspace-local";
const ROUTE_PATH = `/api/admin/v1/workspaces/:workspaceId/redirects`;
const URL_BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects`;

const rules: RedirectRecord[] = [
  { id: "redirect-one", workspaceId: WORKSPACE_ID, matchType: "exact", fromPattern: "/old-one", toTarget: "/new-one", statusCode: 301, status: "active", override: false, priority: 7, source: "manual", createdByPrincipal: "owner", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z", version: 2 },
  { id: "redirect-two", workspaceId: WORKSPACE_ID, matchType: "prefix", fromPattern: "/legacy/", toTarget: "https://example.com/current/", statusCode: 302, status: "disabled", override: true, priority: 11, source: "import", sourceEntryId: "post-2", fromPathAtCapture: "/legacy/", toPathAtCapture: "/current/", createdByPrincipal: "editor", createdByPluginId: "importer", createdAt: "2026-09-03T00:00:00.000Z", updatedAt: "2026-09-04T00:00:00.000Z", version: 3 },
];

function buildApp(depsOverrides: Partial<RedirectRouteDeps> = {}): { app: express.Express; deps: RedirectRouteDeps } {
  const base = createRouteDeps();
  const deps: RedirectRouteDeps = {
    ...base,
    authorize: async () => ({ allowed: true, reason: "owner_wildcard" }),
    ...depsOverrides,
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminRedirectListRoute(app, deps);
  return { app, deps };
}

test("LIST_REDIRECTS route: 404 when workspaceId does not match", async (t) => {
  const { app } = buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/redirects`);
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("LIST_REDIRECTS route: direct invoke fallback for nullish params.workspaceId", async () => {
  const { app } = buildApp();
  const handler = extractRouteHandler(app, "get", ROUTE_PATH);
  const { res, capture } = createCapturingResponse();
  await handler({ params: {}, query: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("LIST_REDIRECTS route: 403 when principal is not authorized", async (t) => {
  const { app } = buildApp({
    authorize: async () => ({ allowed: false, reason: "no_grant" }),
  });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${URL_BASE}`);
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string; reason: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "admin.redirects.manage");
  assert.equal(body.details.reason, "no_grant");
});

test("LIST_REDIRECTS route: 200 success without filters", async (t) => {
  let capturedQuery: unknown;
  const { app } = buildApp({ redirectRepo: {
    list: async (query: unknown) => { capturedQuery = query; return rules; },
  } as RedirectRouteDeps["redirectRepo"] });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${URL_BASE}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: unknown[] };
  assert.ok(Array.isArray(body.data));
  assert.deepEqual(body.data, [{ ...rules[0], sourceEntryId: null, fromPathAtCapture: null, toPathAtCapture: null, createdByPluginId: null }, rules[1]]);
  assert.deepEqual(capturedQuery, { workspaceId: WORKSPACE_ID, status: undefined, source: undefined, matchType: undefined });
});

test("LIST_REDIRECTS route: 200 success with status, source, and matchType filters", async (t) => {
  let capturedQuery: unknown;
  const mockRepo = {
    list: async (query: unknown) => {
      capturedQuery = query;
      return [rules[0]];
    },
  };
  const { app } = buildApp({
    redirectRepo: mockRepo as unknown as RedirectRouteDeps["redirectRepo"],
  });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${URL_BASE}?status=active&source=manual&matchType=exact`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: unknown[] };
  assert.deepEqual(body.data, [{ ...rules[0], sourceEntryId: null, fromPathAtCapture: null, toPathAtCapture: null, createdByPluginId: null }]);
  assert.deepEqual(capturedQuery, {
    workspaceId: WORKSPACE_ID,
    status: "active",
    source: "manual",
    matchType: "exact",
  });
});

test("LIST_REDIRECTS route: 500 on unexpected repository error", async (t) => {
  const throwingRepo = {
    list: async () => {
      throw new Error("db failure");
    },
  };
  const { app } = buildApp({
    redirectRepo: throwingRepo as unknown as RedirectRouteDeps["redirectRepo"],
  });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${URL_BASE}`);
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.error, "internal error");
  assert.equal(body.code, "INTERNAL_ERROR");
});
