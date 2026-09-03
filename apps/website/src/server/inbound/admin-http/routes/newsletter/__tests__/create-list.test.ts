import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import {
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminNewsletterCreateListRoute } from "../create-list.js";
import type { NewsletterRouteDeps } from "../deps.js";
import type { ListRecord } from "#src/features/newsletter/index";

const WORKSPACE_ID = "workspace-local";

function buildApp(depsOverrides: Partial<NewsletterRouteDeps> = {}): {
  app: express.Express;
  deps: NewsletterRouteDeps;
} {
  const base = createRouteDeps();
  const deps = {
    ...base,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    ...depsOverrides,
  } as unknown as NewsletterRouteDeps;

  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminNewsletterCreateListRoute(app, deps);
  return { app, deps };
}

async function post(t: import("node:test").TestContext, app: express.Express, path: string, body: any = {}) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("create-list: mismatched workspaceId 404s", async (t) => {
  const { app } = buildApp();
  const { status, json } = await post(
    t,
    app,
    `/api/admin/v1/workspaces/other-ws/newsletter/lists`,
    { name: "Default", slug: "default" }
  );
  assert.equal(status, 404);
  assert.deepEqual(json, { error: "workspace was not found" });
});

test("create-list: missing name or slug returns 400", async (t) => {
  const { app } = buildApp();
  const handler = extractRouteHandler(
    app,
    "post",
    "/api/admin/v1/workspaces/:workspaceId/newsletter/lists"
  );
  const { res: resNullBody, capture: capNull } = createCapturingResponse();
  await handler({ params: { workspaceId: WORKSPACE_ID } } as any, resNullBody);
  assert.equal(capNull.statusCode, 400);

  const res1 = await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/lists`,
    { name: "Default" }
  );
  assert.equal(res1.status, 400);
  assert.equal((res1.json as any).code, "VALIDATION_ERROR");

  const res2 = await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/lists`,
    { slug: "default" }
  );
  assert.equal(res2.status, 400);
  assert.equal((res2.json as any).code, "VALIDATION_ERROR");
});

test("create-list: forbidden 403s when unauthorized", async (t) => {
  const { app } = buildApp({
    authorize: async () => ({ allowed: false, reason: "insufficient role" }),
  });
  const { status, json } = await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/lists`,
    { name: "Default", slug: "default" }
  );
  assert.equal(status, 403);
  assert.equal((json as { code?: string }).code, "FORBIDDEN");
});

test("create-list: successful creation returns 201 and creates list", async (t) => {
  const { app, deps } = buildApp();
  const { status, json } = await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/lists`,
    { name: "Weekly Digest", slug: "weekly-digest" }
  );
  assert.equal(status, 201);
  const body = json as { data?: ListRecord };
  assert.equal(body.data?.name, "Weekly Digest");
  assert.equal(body.data?.slug, "weekly-digest");

  const stored = await deps.newsletterListRepo.findById({
    workspaceId: WORKSPACE_ID,
    id: body.data!.id,
  });
  assert.equal(stored?.name, "Weekly Digest");
});

test("create-list: duplicate slug returns conflict 409", async (t) => {
  const { app } = buildApp();
  await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/lists`,
    { name: "List 1", slug: "dupe-slug" }
  );
  const { status, json } = await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/lists`,
    { name: "List 2", slug: "dupe-slug" }
  );
  assert.equal(status, 409);
  assert.equal((json as { code?: string }).code, "NEWSLETTER_CONFLICT");
});

test("create-list: unexpected error maps to 500", async (t) => {
  const { app, deps } = buildApp();
  await deps.newsletterReady;
  deps.newsletterListRepo.save = async () => {
    throw new Error("db failure");
  };

  const { status, json } = await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/lists`,
    { name: "List", slug: "slug" }
  );
  assert.equal(status, 500);
  assert.deepEqual(json, { error: "internal error", code: "INTERNAL_ERROR" });
});

test("create-list: undefined workspaceId fallback via direct handler invocation", async () => {
  const { app } = buildApp();
  const handler = extractRouteHandler(
    app,
    "post",
    "/api/admin/v1/workspaces/:workspaceId/newsletter/lists"
  );

  const { res, capture } = createCapturingResponse();
  const req = { params: { workspaceId: undefined }, body: { name: "A", slug: "a" } } as unknown as Parameters<typeof handler>[0];
  await handler(req, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});
