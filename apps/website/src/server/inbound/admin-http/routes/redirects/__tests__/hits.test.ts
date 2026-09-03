import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import {
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminRedirectHitsRoute } from "../hits.js";
import type { RedirectRouteDeps } from "#src/server/inbound/admin-http/http/redirects";

function buildApp(depsOverrides: Partial<RedirectRouteDeps> = {}): express.Express {
  const fakeRule = {
    id: "red-1",
    workspaceId: "ws-1",
    sourcePath: "/old",
    targetUrl: "/new",
    statusCode: 301,
    status: "active",
    version: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  const deps: RedirectRouteDeps = {
    workspaceId: "ws-1",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    redirectRepo: {
      findById: async ({ id }: { id: string }) => (id === "red-1" ? fakeRule : null),
    } as any,
    redirectHitSink: {
      getStats: async ({ redirectId }: { redirectId: string }) => {
        if (redirectId === "red-1") {
          return { redirectId: "red-1", workspaceId: "ws-1", hitCount: 42, lastHitAt: "2026-01-02T00:00:00Z" };
        }
        return null;
      },
    } as any,
    ...depsOverrides,
  };

  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal", displayName: "Test Principal" };
    next();
  });
  registerAdminRedirectHitsRoute(app, deps);
  return app;
}

test("redirect hits: 404 when workspaceId does not match", async (t) => {
  const app = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/redirects/red-1/hits`);
  assert.equal(res.status, 404);

  const body = await res.json();
  assert.equal(body.error, "workspace was not found");
});

test("redirect hits: handles undefined params via direct invoke fallback", async () => {
  const app = buildApp();
  const handler = extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/redirects/:id/hits");
  const { res, capture } = createCapturingResponse();
  await handler({ params: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("redirect hits: 403 when authorization denied", async (t) => {
  const app = buildApp({
    authorize: async () => ({ allowed: false, reason: "forbidden action" }),
  });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/ws-1/redirects/red-1/hits`);
  assert.equal(res.status, 403);

  const body = await res.json();
  assert.equal(body.code, "FORBIDDEN");
  assert.ok(body.error.includes("is not authorized for 'admin.redirects.manage'"));
  assert.equal(body.details.permission, "admin.redirects.manage");
  assert.equal(body.details.reason, "forbidden action");
});

test("redirect hits: 404 when redirect rule does not exist", async (t) => {
  const app = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/ws-1/redirects/missing-rule/hits`);
  assert.equal(res.status, 404);

  const body = await res.json();
  assert.equal(body.code, "REDIRECT_NOT_FOUND");
  assert.equal(body.error, "redirect 'missing-rule' was not found");
});

test("redirect hits: 200 with recorded hit stats", async (t) => {
  const app = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/ws-1/redirects/red-1/hits`);
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.data.redirectId, "red-1");
  assert.equal(body.data.hitCount, 42);
  assert.equal(body.data.lastHitAt, "2026-01-02T00:00:00Z");
});

test("redirect hits: 200 with fallback hit stats when sink returns null", async (t) => {
  const app = buildApp({
    redirectHitSink: {
      getStats: async () => null,
    } as any,
  });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/ws-1/redirects/red-1/hits`);
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.data.redirectId, "red-1");
  assert.equal(body.data.hitCount, 0);
  assert.equal(body.data.lastHitAt, null);
});

test("redirect hits: 500 when unexpected error occurs", async (t) => {
  const app = buildApp({
    redirectRepo: {
      findById: async () => {
        throw new Error("db crashed");
      },
    } as any,
  });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/ws-1/redirects/red-1/hits`);
  assert.equal(res.status, 500);

  const body = await res.json();
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(body.error, "internal error");
});
