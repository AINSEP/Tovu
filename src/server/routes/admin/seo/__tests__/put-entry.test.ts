import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminSeoPutEntryRoute } from "../put-entry";
import type { SeoRouteDeps } from "../deps";

/**
 * @file Unit-tier coverage for `PUT .../seo/entries/:entryId` (`registerAdminSeoPutEntryRoute`).
 * Same bare-app + stubbed-principal + real-in-memory-repos pattern as
 * `admin/integrations/__tests__/create.test.ts`. `deps.postRepo` is the real `InMemoryPostRepo`
 * narrowed out of `createRouteDeps()`, seeded with `post-home` (a real seeded post id).
 */

const WORKSPACE_ID = "workspace-local";
const ENTRY_ID = "post-home";
const PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/seo/entries/${ENTRY_ID}`;

function buildApp(depsOverrides: Partial<SeoRouteDeps> = {}): express.Express {
  const base = createRouteDeps();
  const deps: SeoRouteDeps = {
    workspaceId: base.workspaceId,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: base.clock,
    idGen: base.idGen,
    seoReady: base.seoReady,
    postRepo: base.postRepo,
    settingsRepo: base.settingsRepo,
    principalRepo: base.principalRepo,
    mediaRepo: base.mediaRepo,
    assetRenditionRepo: base.assetRenditionRepo,
    transformDefinitionRepo: base.transformDefinitionRepo,
    ...depsOverrides,
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminSeoPutEntryRoute(app, deps);
  return app;
}

async function put(t: import("node:test").TestContext, app: express.Express, body: unknown, path = PATH) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("put-entry: mismatched workspaceId 404s", async (t) => {
  const app = buildApp();
  const { status } = await put(t, app, { title: "x" }, `/api/admin/v1/workspaces/not-real/seo/entries/${ENTRY_ID}`);
  assert.equal(status, 404);
});

test("put-entry: forbidden 403s", async (t) => {
  const app = buildApp({ authorize: async () => ({ allowed: false, reason: "no grant" }) });
  const { status } = await put(t, app, { title: "x" });
  assert.equal(status, 403);
});

test("put-entry: an unregistered field 400s (SEO_FIELD_VALIDATION_ERROR)", async (t) => {
  const app = buildApp();
  const { status, json } = await put(t, app, { notARealField: "x" });
  assert.equal(status, 400);
  assert.equal((json as { code?: string }).code, "SEO_FIELD_VALIDATION_ERROR");
});

test("put-entry: an unsafe canonical URL scheme 400s (SEO_INVALID_CANONICAL_URL)", async (t) => {
  const app = buildApp();
  const { status, json } = await put(t, app, { canonical: "javascript:alert(1)" });
  assert.equal(status, 400);
  assert.equal((json as { code?: string }).code, "SEO_INVALID_CANONICAL_URL");
});

test("put-entry: an unknown entry id 404s (SEO_ENTRY_NOT_FOUND)", async (t) => {
  const app = buildApp();
  const { status, json } = await put(t, app, { title: "x" }, `/api/admin/v1/workspaces/${WORKSPACE_ID}/seo/entries/does-not-exist`);
  assert.equal(status, 404);
  assert.equal((json as { code?: string }).code, "SEO_ENTRY_NOT_FOUND");
});

test("put-entry: a valid patch succeeds (200) and the meta reflects it", async (t) => {
  const app = buildApp();
  const { status, json } = await put(t, app, { title: "New SEO Title", noindex: true });
  assert.equal(status, 200, JSON.stringify(json));
  const body = json as { data: { title?: string; robots?: { noindex?: boolean } } };
  assert.equal(body.data.title, "New SEO Title");
  assert.equal(body.data.robots?.noindex, true);
});

test("put-entry: an unexpected repo failure 500s", async (t) => {
  const base = createRouteDeps();
  const app = buildApp({
    postRepo: {
      ...base.postRepo,
      save: async () => {
        throw new Error("boom");
      },
    },
  });
  const { status } = await put(t, app, { title: "x" });
  assert.equal(status, 500);
});
