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
import { registerAdminNewsletterImportSubscriptionsRoute } from "../import-subscriptions.js";
import type { NewsletterRouteDeps } from "../deps.js";

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
  registerAdminNewsletterImportSubscriptionsRoute(app, deps);
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

test("import-subscriptions: mismatched workspaceId 404s", async (t) => {
  const { app } = buildApp();
  const { status, json } = await post(
    t,
    app,
    `/api/admin/v1/workspaces/other-ws/newsletter/lists/list-1/subscriptions/import`,
    { subscribers: [{ subscriberId: "sub-1" }] }
  );
  assert.equal(status, 404);
  assert.deepEqual(json, { error: "workspace was not found" });
});

test("import-subscriptions: invalid body returns 400", async (t) => {
  const { app } = buildApp();
  const handler = extractRouteHandler(
    app,
    "post",
    "/api/admin/v1/workspaces/:workspaceId/newsletter/lists/:listId/subscriptions/import"
  );
  const { res: resNullBody, capture: capNull } = createCapturingResponse();
  await handler({ params: { workspaceId: WORKSPACE_ID, listId: "list-1" } } as any, resNullBody);
  assert.equal(capNull.statusCode, 400);

  const res1 = await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/lists/list-1/subscriptions/import`,
    {}
  );
  assert.equal(res1.status, 400);
  assert.equal((res1.json as any).code, "VALIDATION_ERROR");

  const res2 = await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/lists/list-1/subscriptions/import`,
    { subscribers: "not-an-array" }
  );
  assert.equal(res2.status, 400);

  const res3 = await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/lists/list-1/subscriptions/import`,
    { subscribers: [null] }
  );
  assert.equal(res3.status, 400);

  const res4 = await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/lists/list-1/subscriptions/import`,
    { subscribers: [{ subscriberId: 123 }] }
  );
  assert.equal(res4.status, 400);
});

test("import-subscriptions: forbidden 403s when unauthorized", async (t) => {
  const { app } = buildApp({
    authorize: async () => ({ allowed: false, reason: "insufficient role" }),
  });
  const { status, json } = await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/lists/list-1/subscriptions/import`,
    { subscribers: [{ subscriberId: "sub-1" }] }
  );
  assert.equal(status, 403);
  assert.equal((json as { code?: string }).code, "FORBIDDEN");
});

test("import-subscriptions: successful import returns 207 Multi-Status", async (t) => {
  const { app, deps } = buildApp();
  await deps.newsletterReady;
  // Create a real list. `NewsletterListRepoPort.save` returns `Promise<void>` (ports.ts), not the
  // saved row, so the list literal itself — not a nonexistent return value — is the reference used
  // below.
  const list = {
    id: "import-target-list",
    workspaceId: WORKSPACE_ID,
    name: "Target List",
    slug: "target-list",
    description: null,
    isDefault: false,
    subscriberCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await deps.newsletterListRepo.save(list);

  // Create one valid subscriber. `subscriberId` resolves as a `memberId` (ADR-030:
  // subscriberId = memberId) via `SubscriberDirectoryPort` — Newsletter never owns subscriber
  // identity itself (subscriptions.ts's own header: "Never creates a new Members identity"), so
  // the fixture must seed `memberRepo`, not a (nonexistent) newsletter-owned subscriber repo.
  await deps.memberRepo.save({
    id: "sub-valid-1",
    workspaceId: WORKSPACE_ID,
    email: "sub1@example.com",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  });

  const { status, json } = await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/lists/${list.id}/subscriptions/import`,
    { subscribers: [{ subscriberId: "sub-valid-1" }, { subscriberId: "sub-nonexistent" }] }
  );
  assert.equal(status, 207);
  // importSubscriptions (subscriptions.ts) returns created: SubscriptionRow[] and
  // failed: { index, code, message }[] — not { subscriberId, error } shapes.
  const body = json as {
    created: Array<{ subscriberId: string }>;
    failed: Array<{ index: number; code: string; message: string }>;
  };
  assert.equal(body.created.length, 1);
  assert.equal(body.created[0]?.subscriberId, "sub-valid-1");
  assert.equal(body.failed.length, 1);
  assert.equal(body.failed[0]?.index, 1);
  assert.equal(body.failed[0]?.code, "NEWSLETTER_SUBSCRIBER_NOT_FOUND");
  assert.equal(body.failed[0]?.message, "subscriber sub-nonexistent was not found");
});

test("import-subscriptions: non-existent list returns 404", async (t) => {
  const { app, deps } = buildApp();
  await deps.newsletterReady;
  const { status, json } = await post(
    t,
    app,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/lists/non-existent-list/subscriptions/import`,
    { subscribers: [{ subscriberId: "sub-1" }] }
  );
  assert.equal(status, 404);
  assert.equal((json as { code?: string }).code, "NEWSLETTER_LIST_NOT_FOUND");
});

test("import-subscriptions: undefined workspaceId fallback via direct handler invocation", async () => {
  const { app } = buildApp();
  const handler = extractRouteHandler(
    app,
    "post",
    "/api/admin/v1/workspaces/:workspaceId/newsletter/lists/:listId/subscriptions/import"
  );

  const { res, capture } = createCapturingResponse();
  const req = { params: { workspaceId: undefined, listId: "list-1" }, body: { subscribers: [] } } as unknown as Parameters<typeof handler>[0];
  await handler(req, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});
