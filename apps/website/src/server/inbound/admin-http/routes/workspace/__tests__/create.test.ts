import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { InMemoryWorkspaceRepo } from "#src/features/workspace/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminWorkspaceCreateRoute } from "../create.js";
import type { WorkspaceRouteDeps } from "../deps.js";

function buildApp(depsOverrides: Partial<WorkspaceRouteDeps> = {}): express.Express {
  const deps: WorkspaceRouteDeps = {
    workspaceId: "ws-1",
    workspaceRepo: new InMemoryWorkspaceRepo(),
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: { now: () => new Date("2026-01-01T00:00:00Z"), nowIso: () => "2026-01-01T00:00:00.000Z" } as any,
    idGen: { generate: () => "id-1", newId: () => "id-1" } as any,
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    ...depsOverrides,
  };

  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal", displayName: "Test Principal" };
    next();
  });
  registerAdminWorkspaceCreateRoute(app, deps);
  return app;
}

test("create: returns 201 with id on success", async (t) => {
  const app = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Acme", slug: "acme" }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.id, "id-1");
});

test("create: returns 403 when principal is not authorized", async (t) => {
  const app = buildApp({ authorize: async () => ({ allowed: false, reason: "no_grant" }) });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Acme", slug: "acme" }),
  });
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.code, "FORBIDDEN");
});

test("create: returns 400 when name/slug fail validation", async (t) => {
  const app = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "", slug: "acme" }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("create: returns 409 when slug already exists", async (t) => {
  const workspaceRepo = new InMemoryWorkspaceRepo([{ id: "existing", name: "Existing", slug: "acme", createdAt: "2026-01-01T00:00:00.000Z" }]);
  const app = buildApp({ workspaceRepo });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Acme Two", slug: "acme" }),
  });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.code, "RESOURCE_CONFLICT");
  assert.equal(body.details.field, "slug");
});

test("create: returns 500 on unexpected error", async (t) => {
  const workspaceRepo = {
    insert: async () => {
      throw new Error("db down");
    },
    findBySlug: async () => null,
    findById: async () => null,
    list: async () => [],
    update: async () => {},
    delete: async () => {},
  };
  const app = buildApp({ workspaceRepo: workspaceRepo as any });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Acme", slug: "acme" }),
  });
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.error, "internal error");
});
