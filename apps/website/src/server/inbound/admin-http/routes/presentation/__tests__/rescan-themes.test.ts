import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import type { DiscoveredTheme } from "#src/features/theme/index";
import {
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminThemeRescanRoute } from "../rescan-themes.js";
import type { ContentRouteDeps } from "../../content/deps.js";

/**
 * @file Unit-tier branch/line coverage for `POST .../themes/rescan` (`registerAdminThemeRescanRoute`).
 * No existing test exercises this route at all: `marketplace-download-route.integration.test.ts`
 * calls `rescanThemes()` (the imported helper) directly from a DIFFERENT route, never through this
 * HTTP handler. Same bare-app + stubbed-principal pattern as this directory's own
 * `patch-active-theme.test.ts`.
 */

const WORKSPACE_ID = "workspace-local";
const PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/rescan`;

function buildApp(depsOverrides: Partial<ContentRouteDeps> = {}): express.Express {
  const base = createRouteDeps();
  const deps: ContentRouteDeps = {
    workspaceId: base.workspaceId,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: base.clock,
    idGen: base.idGen,
    postRepo: base.postRepo,
    pluginBeforeSaveHook: base.pluginBeforeSaveHook,
    pagesHtmlStore: base.pagesHtmlStore,
    changeSets: base.changeSets,
    outbox: base.outbox,
    bus: base.bus,
    revertRegistry: base.revertRegistry,
    presentationRepo: base.presentationRepo,
    themes: base.themes,
    themesDir: base.themesDir,
    entryRepo: base.entryRepo,
    mediaRepo: base.mediaRepo,
    transformDefinitionRepo: base.transformDefinitionRepo,
    menuRepo: base.menuRepo,
    ...depsOverrides,
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminThemeRescanRoute(app, deps);
  return app;
}

async function post(t: import("node:test").TestContext, app: express.Express, path = PATH) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" } });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("themes/rescan: mismatched workspaceId 404s", async (t) => {
  const app = buildApp();
  const { status, json } = await post(t, app, "/api/admin/v1/workspaces/not-real/themes/rescan");
  assert.equal(status, 404);
  assert.deepEqual(json, { error: "workspace was not found" });
});

test("themes/rescan: direct invoke fallback for nullish params.workspaceId (`req.params.workspaceId ?? \"\"`, unreachable through real HTTP since Express always populates a matched required :param)", async () => {
  const app = buildApp();
  const handler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/themes/rescan");
  const { res, capture } = createCapturingResponse();
  await handler({ params: {} }, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("themes/rescan: authorize denial 403s with the FORBIDDEN envelope naming theme.set", async (t) => {
  const app = buildApp({ authorize: async () => ({ allowed: false, reason: "no_grant" }) });
  const { status, json } = await post(t, app);
  assert.equal(status, 403);
  const body = json as { code: string; details: { permission: string; reason: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "theme.set");
  assert.equal(body.details.reason, "no_grant");
});

test("themes/rescan: success reports added/removed/total/availableThemeIds/duplicateIds by re-running real discovery", async (t) => {
  const base = createRouteDeps();
  const themes: DiscoveredTheme[] = [];
  const app = buildApp({ themes, themesDir: base.themesDir });
  const { status, json } = await post(t, app);
  assert.equal(status, 200, JSON.stringify(json));
  const body = json as { added: string[]; removed: string[]; total: number; availableThemeIds: string[]; duplicateIds: string[] };
  // Started empty; a real rescan against the real themes dir discovers at least the built-in themes.
  assert.ok(body.total > 0, "rescan discovered at least one real theme on disk");
  assert.ok(body.added.length > 0, "every discovered theme is newly 'added' relative to the empty starting array");
  assert.deepEqual(body.removed, []);
  assert.ok(Array.isArray(body.availableThemeIds));
  assert.ok(Array.isArray(body.duplicateIds));
  // The route mutates `deps.themes` in place (see `rescanThemes`'s own doc).
  assert.equal(themes.length, body.total);
});

test("themes/rescan: an unexpected failure during rescan 500s", async (t) => {
  const base = createRouteDeps();
  // `rescanThemes` does `themes.length = 0; themes.push(...)` -- a Proxy that throws on any `set`
  // (which a `length =` assignment triggers) simulates a failure partway through the real
  // discovery-and-refill step without needing a broken filesystem fixture.
  const throwingThemes = new Proxy([] as DiscoveredTheme[], {
    set(): boolean {
      throw new Error("simulated rescan failure");
    },
  });
  const app = buildApp({ themes: throwingThemes, themesDir: base.themesDir });
  const { status, json } = await post(t, app);
  assert.equal(status, 500);
  assert.deepEqual(json, { error: "internal error" });
});
