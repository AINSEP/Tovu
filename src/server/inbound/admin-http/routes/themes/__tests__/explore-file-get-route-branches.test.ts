import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminThemeFileGetRoute } from "../explore.js";
import type { ContentRouteDeps } from "../../content/deps.js";

/**
 * @file `sendThemeFileError`'s two branches, exercised through the GET-file route: a `ThemePathError`
 * (400 INVALID_THEME_PATH) and a non-`ThemePathError` (500 "internal error"). Neither has a test
 * anywhere yet — every existing GET-file test targets a path that resolves cleanly.
 */

const WORKSPACE_ID = "ws-file-get-branches";

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-file-get-branches-"));
  const dir = path.join(root, "static", "plain");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "secret.txt"), "top secret, permission-denied on purpose", "utf8");
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "static", engine: 1 })
  );
  return root;
}

function buildTestApp(themesDir: string): express.Express {
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "site" });
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes,
    themesDir,
  } as unknown as ContentRouteDeps;
  const app = express();
  app.use(express.json());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminThemeFileGetRoute(app, deps);
  return app;
}

const BASE = (themeId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${themeId}`;

test("GET file for a path that does not exist in the theme is a ThemePathError -> 400 INVALID_THEME_PATH", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("plain")}/file?path=${encodeURIComponent("pages/nope.html")}`);
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "INVALID_THEME_PATH");
});

test("GET file for a path escaping the theme folder is also a ThemePathError -> 400", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("plain")}/file?path=${encodeURIComponent("../../etc/passwd")}`);
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "INVALID_THEME_PATH");
});

test("GET file with the 'path' query string omitted entirely falls back to '' (a real, ordinary Express request -- req.query.path is genuinely undefined, unlike a route param) and still 400s as an invalid path, not a 500 crash", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  // No `?path=...` at all -- `req.query.path` is `undefined` (a query string param, unlike a named
  // route `:param`, is never guaranteed present by Express routing), exercising `String(req.query
  // .path ?? "")`'s nullish fallback for real, through a completely ordinary request.
  const res = await fetch(`${baseUrl}${BASE("plain")}/file`);
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "INVALID_THEME_PATH");
});

test("GET file where the underlying read throws something OTHER than ThemePathError -> 500 'internal error', not 400", async (t) => {
  // `readThemeFile` only ever throws `ThemePathError`. To exercise `sendThemeFileError`'s OTHER
  // branch honestly (a real non-ThemePathError exception reaching the route's catch), deny read
  // permission on the target file so `readFileSync` itself throws a raw `EACCES` error -- this is a
  // real, non-ThemePathError exception, not a fabricated one, and matches how this route would
  // actually 500 in production (e.g. a filesystem permission problem).
  const themesDir = makeThemesRoot();
  const target = path.join(themesDir, "static", "plain", "secret.txt");
  fs.chmodSync(target, 0o000);
  t.after(() => fs.chmodSync(target, 0o644));

  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("plain")}/file?path=${encodeURIComponent("secret.txt")}`);
  const body = (await res.json()) as { error?: string; code?: string };
  // Running as root (some CI/sandbox contexts) makes chmod 000 a no-op for reads -- skip the
  // assertion rather than fail on an environment property this test does not control.
  if (process.getuid && process.getuid() === 0) {
    t.skip("running as root: chmod 000 does not deny root a read, so EACCES cannot be forced here");
    return;
  }
  assert.equal(res.status, 500, `expected a permission-denied read to 500, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.error, "internal error");
  assert.equal(body.code, undefined, "the 500 branch has no 'code' field, unlike the 400 ThemePathError branch");
});
