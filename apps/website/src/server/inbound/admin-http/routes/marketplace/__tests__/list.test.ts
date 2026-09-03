import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { MARKETPLACE_CATALOG_DIR } from "#src/features/theme/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminMarketplaceThemesListRoute } from "../list.js";
import type { ContentRouteDeps } from "../../content/deps.js";

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-mp-list-"));
  const marketplaceDir = path.join(root, MARKETPLACE_CATALOG_DIR, "static", "basic");
  fs.mkdirSync(path.join(marketplaceDir, "pages"), { recursive: true });
  fs.writeFileSync(
    path.join(marketplaceDir, "theme.json"),
    JSON.stringify({ id: "basic", name: "Basic Marketplace", version: "1.0.0", tier: "static", engine: 1 }),
    "utf8",
  );
  fs.writeFileSync(path.join(marketplaceDir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(marketplaceDir, "pages", "index.html"), "ok", "utf8");
  return root;
}

function buildApp(depsOverrides: Partial<ContentRouteDeps> = {}, themesDir?: string): { app: express.Express; cleanup: () => void } {
  const root = themesDir ?? makeThemesRoot();
  const cleanup = () => {
    fs.rmSync(root, { recursive: true, force: true });
  };

  const deps: ContentRouteDeps = {
    workspaceId: "ws-1",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themesDir: root,
  } as any;
  Object.assign(deps, depsOverrides);

  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal", displayName: "Test Principal" };
    next();
  });
  registerAdminMarketplaceThemesListRoute(app, deps);
  return { app, cleanup };
}

test("marketplace list: returns 404 when workspaceId does not match", async (t) => {
  const { app, cleanup } = buildApp();
  t.after(cleanup);

  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/marketplace/themes`);
  assert.equal(res.status, 404);

  const body = await res.json();
  assert.equal(body.error, "workspace was not found");
});

test("marketplace list: returns 403 when authorization is denied", async (t) => {
  const { app, cleanup } = buildApp({
    authorize: async () => ({ allowed: false, reason: "permission denied" }),
  });
  t.after(cleanup);

  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/ws-1/marketplace/themes`);
  assert.equal(res.status, 403);

  const body = await res.json();
  assert.equal(body.code, "FORBIDDEN");
  assert.ok(body.error.includes("is not authorized for 'theme.set'"));
  assert.equal(body.details.permission, "theme.set");
  assert.equal(body.details.reason, "permission denied");
});

test("marketplace list: returns 200 with list of themes when authorized", async (t) => {
  const { app, cleanup } = buildApp();
  t.after(cleanup);

  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/ws-1/marketplace/themes`);
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.ok(Array.isArray(body.themes));
  assert.equal(body.themes.length, 1);
  assert.equal(body.themes[0].id, "basic");
  assert.equal(body.themes[0].name, "Basic Marketplace");
});

test("marketplace list: returns 500 when an internal error is thrown", async (t) => {
  const { app, cleanup } = buildApp({
    authorize: async () => {
      throw new Error("unexpected boom");
    },
  });
  t.after(cleanup);

  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/ws-1/marketplace/themes`);
  assert.equal(res.status, 500);

  const body = await res.json();
  assert.equal(body.error, "internal error");
});

test("marketplace list: handles undefined workspaceId param", async (t) => {
  const { app, cleanup } = buildApp();
  t.after(cleanup);

  // Directly call the handler with empty params
  let status: number | undefined;
  let jsonBody: unknown;
  const fakeRes: any = {
    status: (code: number) => {
      status = code;
      return fakeRes;
    },
    json: (body: unknown) => {
      jsonBody = body;
      return fakeRes;
    },
  };

  const routeLayer = app._router.stack.find((layer: any) => layer.route?.path === "/api/admin/v1/workspaces/:workspaceId/marketplace/themes");
  const handler = routeLayer.route.stack[0].handle;

  await handler({ params: {} }, fakeRes);
  assert.equal(status, 404);
  assert.deepEqual(jsonBody, { error: "workspace was not found" });
});
