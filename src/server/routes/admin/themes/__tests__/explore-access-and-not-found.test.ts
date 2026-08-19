import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import {
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import {
  registerAdminThemeDetailRoute,
  registerAdminThemeFileGetRoute,
  registerAdminThemeFilePutRoute,
  registerAdminThemeFileResetRoute,
  registerAdminThemeFileCopyRoute,
  registerAdminThemeFileRenameRoute,
} from "../explore.js";
import type { ContentRouteDeps } from "../../content/deps.js";

/**
 * @file Branch coverage for the two gates every one of the six routes runs BEFORE its own logic:
 * `authorizeThemeAccess` (workspace-path-param mismatch 404, `theme.set` 403) and each route's own
 * `findTheme(...)` → 404 check. The existing sibling test files all use an `authorize` stub that
 * always allows and always target a theme id that exists, so neither branch has been exercised on
 * any of the six routes until now.
 *
 * Correction (this session): the original version of this file only ever sent its
 * workspace-mismatch/`theme.set`-denied requests to the DETAIL route (`BASE(id)` with no suffix) --
 * despite this header's own claim, `authorizeThemeAccess`'s two branches were still completely
 * untested on the other five routes (file get/put/reset/copy/rename), confirmed directly via this
 * file's own raw per-branch V8 coverage: each of those five routes' `if (!(await
 * authorizeThemeAccess(...))) return;` had zero hits. `REQUESTS` below is the fix -- one entry per
 * route's own method/path/body shape, driven through both gate checks for every route, not just
 * the first one.
 */

const WORKSPACE_ID = "ws-access-gate";

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-access-gate-"));
  const dir = path.join(root, "static", "plain");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.mkdirSync(path.join(dir, "css"), { recursive: true });
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "css", "styles.css"), "body{}", "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "static", engine: 1 })
  );
  return root;
}

function buildTestApp(
  themesDir: string,
  authorize: ContentRouteDeps["authorize"] = async () => ({ allowed: true, reason: "matched" })
): express.Express {
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "site" });
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize,
    themes,
    themesDir,
  } as unknown as ContentRouteDeps;

  const app = express();
  app.use(express.json());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminThemeDetailRoute(app, deps);
  registerAdminThemeFileGetRoute(app, deps);
  registerAdminThemeFilePutRoute(app, deps);
  registerAdminThemeFileResetRoute(app, deps);
  registerAdminThemeFileCopyRoute(app, deps);
  registerAdminThemeFileRenameRoute(app, deps);
  return app;
}

const BASE = (themeId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${themeId}`;

test("workspace-path-param mismatch 404s before any theme lookup happens", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-this-workspace/themes/plain`);
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("a principal denied 'theme.set' gets 403 with the authorize() reason echoed back", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir, async () => ({ allowed: false, reason: "no_grant" }));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("plain")}`);
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string; reason: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "theme.set");
  assert.equal(body.details.reason, "no_grant");
});

/** One entry per route's own method/path/body shape -- `path`/`themeId` are substituted per test. */
const ROUTES: { name: string; method: string; suffix: string; body?: Record<string, unknown> }[] = [
  { name: "GET file", method: "GET", suffix: "/file?path=pages/index.html" },
  { name: "PUT file", method: "PUT", suffix: "/file", body: { path: "pages/index.html", content: "x" } },
  { name: "reset", method: "POST", suffix: "/file/reset", body: { path: "pages/index.html" } },
  { name: "copy", method: "POST", suffix: "/file/copy", body: { path: "pages/index.html" } },
  { name: "rename", method: "POST", suffix: "/file/rename", body: { path: "pages/index.html", name: "index2.html" } },
];

for (const route of ROUTES) {
  test(`${route.name}: workspace-path-param mismatch 404s before any theme lookup happens`, async (t) => {
    const themesDir = makeThemesRoot();
    const app = buildTestApp(themesDir);
    const baseUrl = await startTestServer(app, t);

    const res = await fetch(
      `${baseUrl}/api/admin/v1/workspaces/not-this-workspace/themes/plain${route.suffix}`,
      {
        method: route.method,
        headers: route.body ? { "content-type": "application/json" } : {},
        body: route.body ? JSON.stringify(route.body) : undefined,
      }
    );
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "workspace was not found");
  });

  test(`${route.name}: a principal denied 'theme.set' gets 403 with the authorize() reason echoed back`, async (t) => {
    const themesDir = makeThemesRoot();
    const app = buildTestApp(themesDir, async () => ({ allowed: false, reason: "no_grant" }));
    const baseUrl = await startTestServer(app, t);

    const res = await fetch(`${baseUrl}${BASE("plain")}${route.suffix}`, {
      method: route.method,
      headers: route.body ? { "content-type": "application/json" } : {},
      body: route.body ? JSON.stringify(route.body) : undefined,
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { code: string; details: { permission: string; reason: string } };
    assert.equal(body.code, "FORBIDDEN");
    assert.equal(body.details.permission, "theme.set");
    assert.equal(body.details.reason, "no_grant");
  });
}

test("GET detail on a missing theme 404s", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE("does-not-exist")}`);
  assert.equal(res.status, 404);
  assert.match(((await res.json()) as { error: string }).error, /was not found/);
});

test("GET file on a missing theme 404s", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE("does-not-exist")}/file?path=pages/index.html`);
  assert.equal(res.status, 404);
});

test("PUT file on a missing theme 404s", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE("does-not-exist")}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/index.html", content: "x" }),
  });
  assert.equal(res.status, 404);
});

test("reset on a missing theme 404s", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE("does-not-exist")}/file/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/index.html" }),
  });
  assert.equal(res.status, 404);
});

test("copy on a missing theme 404s", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE("does-not-exist")}/file/copy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/index.html" }),
  });
  assert.equal(res.status, 404);
});

test("rename on a missing theme 404s", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE("does-not-exist")}/file/rename`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/index.html", name: "index2.html" }),
  });
  assert.equal(res.status, 404);
});

test("workspaceId/themeId params can never actually be undefined through real routing (a matched `:param` segment is always a populated string) -- `authorizeThemeAccess`'s and `findThemeOrRespond`'s `?? \"\"` fallbacks are reached by calling the real (detail-route) handler directly, the same type-bypass technique a `default: throw` exhaustiveness guard would need; both are shared by all six routes, so this one route's handler exercises the fallback for every caller", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const handler = extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/themes/:themeId");

  // authorizeThemeAccess's `String(req.params.workspaceId ?? "") !== deps.workspaceId` fallback.
  {
    const { res, capture } = createCapturingResponse();
    const req = { params: { workspaceId: undefined, themeId: "plain" } } as unknown as Parameters<typeof handler>[0];
    await handler(req, res);
    assert.equal(capture.statusCode, 404);
    assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
  }

  // findThemeOrRespond's `String(req.params.themeId ?? "")` fallback -- resolves to "", which no
  // real theme is ever discovered with as an id, so it 404s the same honest way an unknown id would.
  {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "test-principal" };
    const req = { params: { workspaceId: WORKSPACE_ID, themeId: undefined } } as unknown as Parameters<typeof handler>[0];
    await handler(req, res);
    assert.equal(capture.statusCode, 404);
    assert.deepEqual(capture.jsonBody, { error: "theme '' was not found" });
  }
});
