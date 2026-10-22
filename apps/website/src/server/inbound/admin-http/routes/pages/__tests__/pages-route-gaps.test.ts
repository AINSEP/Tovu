import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { createCapturingResponse, startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { ContentRouteDeps } from "../../content/deps.js";
import { registerAdminPageCreateRoute } from "../create.js";
import { registerAdminPageDeleteRoute } from "../delete.js";
import { registerAdminPageGetRoute } from "../get-by-id.js";
import { registerAdminPageListRoute } from "../list.js";
import { registerAdminPageUpdateHtmlRoute } from "../update-html.js";
import { registerAdminPageUpdateRoute } from "../update.js";

/**
 * @file The admin Pages routes' error and fallback arms that the real-composition suites
 * (`admin-page-get-route.test.ts`, `pages-update-expected-version.test.ts`,
 * `admin-post-page-delete-routes.test.ts`, …) never reach: foreign-workspace 404s, a failing
 * permission lookup, an Idempotency-Key replay on update, a change-set persistence failure after
 * the write applied, and requests carrying no JSON body at all.
 *
 * Harness: the six registrars on a bare `express()` app over real `createRouteDeps()` repos, with
 * `res.locals.principal` stubbed (authentication is `requireAdminSession`'s job, not these routes')
 * and `authorize` allowing unless a test says otherwise. The `?? ""` param fallbacks follow this
 * repo's 2026-09-03 convention (`posts/__tests__/update.test.ts`): Express always populates a matched
 * `:param`, so those guards are exercised with a hand-built `req` that omits it.
 */

const WS = "workspace-local";
const PAGES = `/api/admin/v1/workspaces/${WS}/pages`;
const VALID_BODY_JSON = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }] };

function buildApp(options: { jsonParser?: boolean } = {}) {
  const { jsonParser = true } = options;
  const deps = {
    ...createRouteDeps(),
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as ContentRouteDeps;
  const app = express();
  if (jsonParser) app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  for (const register of [
    registerAdminPageListRoute,
    registerAdminPageCreateRoute,
    registerAdminPageGetRoute,
    registerAdminPageUpdateRoute,
    registerAdminPageUpdateHtmlRoute,
    registerAdminPageDeleteRoute,
  ]) {
    register(app, deps);
  }
  return { app, deps };
}

interface ExpressRouteLayer {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: (req: unknown, res: unknown) => unknown }[] };
}

/** The route's own (last) handler, past any `rejectOversizedJsonBody` middleware mounted ahead of it. */
function lastHandler(app: express.Express, method: "get" | "post" | "put" | "delete", path: string) {
  const stack = (app as unknown as { _router: { stack: ExpressRouteLayer[] } })._router.stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods[method]);
  if (!layer?.route) throw new Error(`no ${method} route for ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

/** Calls a route handler with a hand-built request; `withPrincipal` stands in for the session gate. */
async function callDirect(app: express.Express, method: "get" | "post" | "put" | "delete", path: string, req: Record<string, unknown>) {
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "test-principal" };
  await lastHandler(app, method, path)({ get: () => undefined, query: {}, ...req }, res);
  return capture;
}

async function createPage(baseUrl: string, title: string): Promise<{ id: string; slug: string; version: number }> {
  const res = await fetch(`${baseUrl}${PAGES}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  assert.equal(res.status, 201, await res.clone().text());
  return ((await res.json()) as { post: { id: string; slug: string; version: number } }).post;
}

const ROUTE_PATTERNS = [
  { name: "list", method: "get", path: "/api/admin/v1/workspaces/:workspaceId/pages" },
  { name: "create", method: "post", path: "/api/admin/v1/workspaces/:workspaceId/pages" },
  { name: "get-by-id", method: "get", path: "/api/admin/v1/workspaces/:workspaceId/pages/:pageId" },
  { name: "update", method: "put", path: "/api/admin/v1/workspaces/:workspaceId/pages/:pageId" },
  { name: "update-html", method: "put", path: "/api/admin/v1/workspaces/:workspaceId/pages/:pageId/html" },
  { name: "delete", method: "delete", path: "/api/admin/v1/workspaces/:workspaceId/pages/:pageId" },
] as const;

for (const route of ROUTE_PATTERNS) {
  test(`pages ${route.name}: \`req.params.workspaceId ?? ""\` fallback, forced via a hand-built request with no params, is the workspace 404`, async () => {
    const { app, deps } = buildApp();
    let authorizeCalls = 0;
    deps.authorize = async () => {
      authorizeCalls += 1;
      return { allowed: true, reason: "matched" };
    };
    const capture = await callDirect(app, route.method, route.path, { params: {}, body: {} });
    assert.equal(capture.statusCode, 404);
    assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
    assert.equal(authorizeCalls, 0);
  });
}

test("pages get-by-id: a workspace id that is not this site's is 404 without reading the page", async (t) => {
  const { app } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const page = await createPage(baseUrl, "Foreign Workspace Probe");
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/other-ws/pages/${page.id}`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "workspace was not found" });
});

test("pages update: a workspace id that is not this site's is 404 and the page is left unchanged", async (t) => {
  const { app, deps } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const page = await createPage(baseUrl, "Untouched Page");
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/other-ws/pages/${page.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Hijacked", slug: page.slug, bodyJson: VALID_BODY_JSON, status: "draft" }),
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "workspace was not found" });
  const stored = await deps.postRepo.findById({ workspaceId: WS, id: page.id });
  assert.equal(stored?.title, "Untouched Page");
});

test("pages list: a permission lookup that throws is an opaque 500, not a hung request", async (t) => {
  const { app, deps } = buildApp();
  deps.authorize = async () => {
    throw new Error("policy store unavailable");
  };
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${PAGES}`);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal error" });
});

test("pages get-by-id / update / delete: `req.params.pageId ?? \"\"` fallback resolves no page and is the ENTRY_NOT_FOUND 404", async () => {
  const { app } = buildApp();
  for (const route of ROUTE_PATTERNS.filter((r) => ["get-by-id", "update", "delete"].includes(r.name))) {
    const capture = await callDirect(app, route.method, route.path, {
      params: { workspaceId: WS },
      body: { title: "T", slug: "t", bodyJson: VALID_BODY_JSON, status: "draft" },
    });
    assert.equal(capture.statusCode, 404, route.name);
    // get-by-id surfaces the feature's own `post '…'` message; update/delete raise their own `page '…'` one.
    const noun = route.name === "get-by-id" ? "post" : "page";
    assert.deepEqual(capture.jsonBody, { error: `${noun} '' was not found`, code: "ENTRY_NOT_FOUND" }, route.name);
  }
});

test("pages update-html: `req.params.pageId ?? \"\"` fallback resolves no page and is a 404, never a write", async () => {
  const { app } = buildApp();
  const capture = await callDirect(app, "put", "/api/admin/v1/workspaces/:workspaceId/pages/:pageId/html", {
    params: { workspaceId: WS },
    body: { html: "<p>x</p>" },
  });
  assert.equal(capture.statusCode, 404);
  assert.equal((capture.jsonBody as { code: string }).code, "ENTRY_NOT_FOUND");
});

test("pages create: with no JSON body parser mounted, an empty POST still creates an 'Untitled' draft page", async (t) => {
  const { app, deps } = buildApp({ jsonParser: false });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${PAGES}`, { method: "POST" });
  assert.equal(res.status, 201);
  const { post } = (await res.json()) as { post: { id: string; title: string; kind: string; status: string } };
  assert.equal(post.title, "Untitled");
  assert.equal(post.kind, "page");
  assert.equal(post.status, "draft");
  assert.equal((await deps.postRepo.findById({ workspaceId: WS, id: post.id }))?.title, "Untitled");
});

test("pages create: a change-set persistence failure is reported as an opaque 500", async (t) => {
  const { app, deps } = buildApp();
  deps.changeSets.insert = async () => {
    throw new Error("simulated change-set persistence failure");
  };
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${PAGES}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Never Recorded" }),
  });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal error" });
});

test("pages create: a denied content.write is 403 FORBIDDEN carrying the permission and reason, and no page is stored", async (t) => {
  const { app, deps } = buildApp();
  deps.authorize = async () => ({ allowed: false, reason: "no-grant" });
  const baseUrl = await startTestServer(app, t);
  const ids: string[] = [];
  const newId = deps.idGen.newId.bind(deps.idGen);
  deps.idGen.newId = () => {
    const id = newId();
    ids.push(id);
    return id;
  };
  const res = await fetch(`${baseUrl}${PAGES}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Denied Page" }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string; reason: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.deepEqual(body.details, { permission: "content.write", reason: "no-grant" });
  assert.equal(await deps.postRepo.findById({ workspaceId: WS, id: ids[0] }), null);
});

test("pages create: an unknown status is 400 VALIDATION_ERROR", async (t) => {
  const { app } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${PAGES}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Bad Status", status: "not-a-status" }),
  });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { code: string }).code, "VALIDATION_ERROR");
});

test("pages create: reusing an existing page's slug is 409 SLUG_CONFLICT", async (t) => {
  const { app } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const post = (body: unknown) =>
    fetch(`${baseUrl}${PAGES}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const first = await post({ title: "Slug Owner", slug: "taken-page-slug" });
  assert.equal(first.status, 201, await first.clone().text());
  const second = await post({ title: "Slug Thief", slug: "taken-page-slug" });
  assert.equal(second.status, 409);
  assert.equal(((await second.json()) as { code: string }).code, "SLUG_CONFLICT");
});

test("pages create: replaying an Idempotency-Key is 409 DUPLICATE_COMMAND naming the first change set", async (t) => {
  const { app } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const request = {
    method: "POST" as const,
    headers: { "content-type": "application/json", "Idempotency-Key": "page-create-replay" },
    body: JSON.stringify({ title: "Created Once" }),
  };
  const first = await fetch(`${baseUrl}${PAGES}`, request);
  assert.equal(first.status, 201, await first.clone().text());
  const second = await fetch(`${baseUrl}${PAGES}`, request);
  assert.equal(second.status, 409);
  const body = (await second.json()) as { code: string; changeSetId: string };
  assert.equal(body.code, "DUPLICATE_COMMAND");
  assert.equal(typeof body.changeSetId, "string");
  assert.ok(body.changeSetId.length > 0);
});

test("pages update: a hand-built request with no body falls back to blank title/slug and is a 400 VALIDATION_ERROR that changes nothing", async (t) => {
  const { app, deps } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const page = await createPage(baseUrl, "Body-less Update Target");
  const capture = await callDirect(app, "put", "/api/admin/v1/workspaces/:workspaceId/pages/:pageId", {
    params: { workspaceId: WS, pageId: page.id },
  });
  assert.equal(capture.statusCode, 400);
  assert.equal((capture.jsonBody as { code: string }).code, "VALIDATION_ERROR");
  const stored = await deps.postRepo.findById({ workspaceId: WS, id: page.id });
  assert.equal(stored?.title, "Body-less Update Target");
  assert.equal(stored?.version, page.version);
});

test("pages update: replaying an Idempotency-Key is 409 DUPLICATE_COMMAND naming the first change set", async (t) => {
  const { app } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const page = await createPage(baseUrl, "Idempotent Page");
  const request = {
    method: "PUT" as const,
    headers: { "content-type": "application/json", "Idempotency-Key": "page-update-replay" },
    body: JSON.stringify({ title: "Idempotent Page", slug: page.slug, bodyJson: VALID_BODY_JSON, status: "draft" }),
  };
  const first = await fetch(`${baseUrl}${PAGES}/${page.id}`, request);
  assert.equal(first.status, 200, await first.clone().text());
  const second = await fetch(`${baseUrl}${PAGES}/${page.id}`, request);
  assert.equal(second.status, 409);
  const body = (await second.json()) as { code: string; changeSetId: string };
  assert.equal(body.code, "DUPLICATE_COMMAND");
  assert.equal(typeof body.changeSetId, "string");
  assert.ok(body.changeSetId.length > 0);
});

test("pages update: a change-set record failure after the edit applied is rolled back to the exact prior page and surfaces as a 500", async (t) => {
  const { app, deps } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const page = await createPage(baseUrl, "Rollback Page");
  const prior = await deps.postRepo.findById({ workspaceId: WS, id: page.id });
  assert.ok(prior);
  deps.changeSets.insert = async () => {
    throw new Error("simulated change-set persistence failure");
  };

  const res = await fetch(`${baseUrl}${PAGES}/${page.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Should Be Rolled Back", slug: "rolled-back-slug", bodyJson: VALID_BODY_JSON, status: "published" }),
  });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal error" });

  const restored = await deps.postRepo.findById({ workspaceId: WS, id: page.id });
  assert.ok(restored);
  assert.equal(restored.title, "Rollback Page");
  assert.equal(restored.slug, prior.slug);
  assert.equal(restored.status, prior.status);
  assert.deepEqual(restored.bodyJson, prior.bodyJson);
  assert.equal(restored.version, prior.version + 2, "compensation is a forward restore after the failed write");
});

test("pages list: a denied content.read is 403 FORBIDDEN naming the permission and reason", async (t) => {
  const { app, deps } = buildApp();
  deps.authorize = async () => ({ allowed: false, reason: "no-grant" });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${PAGES}`);
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string; reason: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.deepEqual(body.details, { permission: "content.read", reason: "no-grant" });
});

test("pages delete: replaying an Idempotency-Key is 409 DUPLICATE_COMMAND naming the first change set", async (t) => {
  const { app } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const page = await createPage(baseUrl, "Delete Once Page");
  const request = { method: "DELETE" as const, headers: { "Idempotency-Key": "page-delete-replay" } };
  const first = await fetch(`${baseUrl}${PAGES}/${page.id}`, request);
  assert.equal(first.status, 200, await first.clone().text());
  const second = await fetch(`${baseUrl}${PAGES}/${page.id}`, request);
  assert.equal(second.status, 409);
  const body = (await second.json()) as { code: string; changeSetId: string };
  assert.equal(body.code, "DUPLICATE_COMMAND");
  assert.equal(typeof body.changeSetId, "string");
  assert.ok(body.changeSetId.length > 0);
});
