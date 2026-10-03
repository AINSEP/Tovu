import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { DomainEvent } from "@jini-ai/cms/core";
import type { NextFunction, Request, Response } from "express";

import { InMemoryWorkspaceRepo } from "#src/features/workspace/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminWorkspaceCreateRoute } from "../create.js";
import type { WorkspaceRouteDeps } from "../deps.js";

function buildApp(depsOverrides: Partial<WorkspaceRouteDeps> = {}): express.Express {
  const deps: WorkspaceRouteDeps = {
    workspaceId: "ws-1",
    workspaceRepo: new InMemoryWorkspaceRepo({}),
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
  const workspaceRepo = new InMemoryWorkspaceRepo({});
  const bus = new InMemoryEventBus();
  const outbox = new InMemoryOutbox();
  const events: DomainEvent[] = [];
  const authorizationCalls: unknown[] = [];
  await bus.subscribeAll(async (event) => { events.push(event); });
  const app = buildApp({
    workspaceRepo, bus, outbox,
    authorize: async (input) => {
      authorizationCalls.push(input);
      return { allowed: input.principalId === "test-principal" && input.workspaceId === "ws-1" && input.permission === "workspace.manage", reason: "matched" };
    },
  });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Acme", slug: "acme" }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.id, "id-1");
  assert.deepEqual(authorizationCalls, [{ principalId: "test-principal", workspaceId: "ws-1", permission: "workspace.manage" }]);
  assert.deepEqual(await workspaceRepo.findBySlug("acme"), {
    id: body.id, name: "Acme", slug: "acme", createdAt: "2026-01-01T00:00:00.000Z",
  });
  assert.deepEqual(events, [{
    id: "id-1", name: "workspace.created", occurredAt: "2026-01-01T00:00:00.000Z",
    aggregateId: body.id, workspaceId: body.id, payload: { workspaceId: body.id, slug: "acme" },
  }]);
  assert.deepEqual(await outbox.claimPending(20, "2026-01-02T00:00:00.000Z"), [], "the creation event was delivered, not merely enqueued");
});

test("create: returns 403 when principal is not authorized", async (t) => {
  const workspaceRepo = new InMemoryWorkspaceRepo({});
  const app = buildApp({ workspaceRepo, authorize: async () => ({ allowed: false, reason: "no_grant" }) });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Acme", slug: "acme" }),
  });
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.code, "FORBIDDEN");
  assert.deepEqual(await workspaceRepo.list(), [], "denied creation must not persist a workspace");
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
  const workspaceRepo = new InMemoryWorkspaceRepo({}, { initialRows: [{ id: "existing", name: "Existing", slug: "acme", createdAt: "2026-01-01T00:00:00.000Z" }] });
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

test("create: a failed event delivery returns 201 and retains the event for retry", async (t) => {
  const workspaceRepo = new InMemoryWorkspaceRepo({});
  const bus = new InMemoryEventBus();
  const outbox = new InMemoryOutbox();
  let attempts = 0;
  await bus.subscribe("workspace.created", async () => {
    attempts++;
    throw new Error("subscriber unavailable");
  });
  const app = buildApp({ workspaceRepo, bus, outbox });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Acme", slug: "acme" }),
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).id, "id-1");
  assert.equal((await workspaceRepo.findBySlug("acme"))?.id, "id-1");
  assert.equal(attempts, 1);
  assert.deepEqual(await outbox.claimPending(20, "2026-01-01T00:00:00.000Z"), []);
  const retry = await outbox.claimPending(20, "2026-01-01T00:01:00.000Z");
  assert.equal(retry.length, 1);
  assert.equal(retry[0].event.name, "workspace.created");
  assert.equal(retry[0].lastError, "subscriber unavailable");
});
