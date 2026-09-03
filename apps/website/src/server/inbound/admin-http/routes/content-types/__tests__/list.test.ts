import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminContentTypeListRoute } from "../list.js";
import type { ContentTypesRouteDeps } from "../deps.js";

function buildApp(depsOverrides: Partial<ContentTypesRouteDeps> = {}): express.Express {
  const fakeRepo = {
    listByWorkspace: async ({ workspaceId }: { workspaceId: string }) => [
      {
        id: "ct-1",
        workspaceId,
        key: "post",
        name: "Post",
        status: "active",
        fields: [],
        version: 1,
      },
    ],
  };

  const deps: ContentTypesRouteDeps = {
    workspaceId: "ws-1",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: { now: () => new Date("2026-01-01T00:00:00Z") },
    idGen: { generate: () => "id-1" },
    outbox: { enqueue: async () => {} } as any,
    contentTypeRepo: fakeRepo as any,
    contentTypeIndexProvisioner: {} as any,
    entryRepo: {} as any,
    ...depsOverrides,
  };

  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal", displayName: "Test Principal" };
    next();
  });
  registerAdminContentTypeListRoute(app, deps);
  return app;
}

test("list: returns 200 with content types when authorized", async (t) => {
  const app = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/content-types`);
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.ok(Array.isArray(body.items));
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].id, "ct-1");
  assert.equal(body.items[0].key, "post");
});

test("list: returns 403 when principal is not authorized for admin.collections.read", async (t) => {
  const app = buildApp({
    authorize: async () => ({ allowed: false, reason: "insufficient_permissions" }),
  });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/content-types`);
  assert.equal(res.status, 403);

  const body = await res.json();
  assert.equal(body.code, "FORBIDDEN");
  assert.ok(body.error.includes("is not authorized for 'admin.collections.read'"));
  assert.equal(body.details.permission, "admin.collections.read");
  assert.equal(body.details.reason, "insufficient_permissions");
});

test("list: returns 500 when error is an instance of Error", async (t) => {
  const app = buildApp({
    contentTypeRepo: {
      listByWorkspace: async () => {
        throw new Error("connection failure");
      },
    } as any,
  });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/content-types`);
  assert.equal(res.status, 500);

  const body = await res.json();
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(body.error, "connection failure");
});

test("list: returns 500 when non-Error is thrown", async (t) => {
  const app = buildApp({
    contentTypeRepo: {
      listByWorkspace: async () => {
        throw "something went wrong";
      },
    } as any,
  });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/content-types`);
  assert.equal(res.status, 500);

  const body = await res.json();
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(body.error, "internal error");
});
