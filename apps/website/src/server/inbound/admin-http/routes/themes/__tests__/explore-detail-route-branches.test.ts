import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes, THEME_CATALOG_DIR } from "#src/features/theme/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminThemeDetailRoute } from "../explore.js";
import type { ContentRouteDeps } from "../../content/deps.js";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { InMemoryPostRepo } from "#src/features/post/index";

/**
 * @file Branch coverage for `registerAdminThemeDetailRoute`'s own logic, once the shared
 * access/not-found gates (`explore-access-and-not-found.test.ts`) and the built-theme write-scope
 * gates (`explore-built-theme-gate.test.ts`) are out of the way: `hasOriginal` true/false, a
 * malformed `theme.json`, and the route's outer catch-all 500. (The `lineage` field and its
 * `.tovu-lineage.json` read went 2026-10-04 with the dead theme marketplace that wrote it.)
 */

const WORKSPACE_ID = "ws-detail-branches";

function baseDeps(themesDir: string): ContentRouteDeps {
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "site" });
  return {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes,
    themesDir,
    // The detail route now does one `postRepo.list()` per request (slug-collision signal,
    // `contentRecordsBySlug`) — an empty in-memory repo, matching every fixture in this file that
    // has no posts of its own to collide with any theme page.
    postRepo: new InMemoryPostRepo(),
  } as unknown as ContentRouteDeps;
}

function buildTestApp(deps: ContentRouteDeps): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminThemeDetailRoute(app, deps);
  return app;
}

const BASE = (themeId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${themeId}`;

/** A theme with a catalog original present (so `hasOriginal` is true). */
function makeThemeWithCatalog(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-detail-catalog-"));
  const manifest = JSON.stringify({
    id: "cataloged",
    name: "Cataloged",
    version: "1.0.0",
    tier: "static",
    engine: 1,
  });
  const installDir = path.join(root, "static", "cataloged");
  for (const base of [installDir, path.join(root, THEME_CATALOG_DIR, "static", "cataloged")]) {
    fs.mkdirSync(path.join(base, "pages"), { recursive: true });
    fs.mkdirSync(path.join(base, "css"), { recursive: true });
    fs.writeFileSync(path.join(base, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
    fs.writeFileSync(path.join(base, "css", "styles.css"), "body{}", "utf8");
    fs.writeFileSync(path.join(base, "tokens.json"), "{}", "utf8");
    fs.writeFileSync(path.join(base, "theme.json"), manifest, "utf8");
  }
  return root;
}

/** A theme with NO catalog original at all (so `hasOriginal` is false). */
function makeThemeNoCatalog(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-detail-no-catalog-"));
  const dir = path.join(root, "static", "fresh");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.mkdirSync(path.join(dir, "css"), { recursive: true });
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "css", "styles.css"), "body{}", "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "fresh", name: "Fresh", version: "1.0.0", tier: "static", engine: 1 })
  );
  return root;
}

test("hasOriginal is true when a catalog original exists", async (t) => {
  const themesDir = makeThemeWithCatalog();
  const app = buildTestApp(baseDeps(themesDir));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("cataloged")}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { hasOriginal: boolean };
  assert.equal(body.hasOriginal, true, "a catalog original exists for this fixture");
});

test("hasOriginal is false with no catalog", async (t) => {
  const themesDir = makeThemeNoCatalog();
  const app = buildTestApp(baseDeps(themesDir));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("fresh")}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { hasOriginal: boolean };
  assert.equal(body.hasOriginal, false, "no catalog folder was created for this fixture");
});

test("malformed theme.json: the route still 200s on a theme loadTheme marked invalid", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-detail-malformed-"));
  const dir = path.join(root, "static", "broken");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "theme.json"), "{ not valid json", "utf8");

  // `loadTheme` itself would report `status: "invalid"` for this manifest (its own `readJson` fails
  // the same way) but still returns a usable `DiscoveredTheme` — real discovery, not hand-built, so
  // this exercises the exact object the detail route receives in production for a broken theme.
  const themes = discoverAllBuiltInThemes({ dir: root, source: "site" });
  const theme = themes.find((t) => t.dir === dir);
  assert.ok(theme, "discovery must still surface the broken theme, just as status: invalid");

  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes,
    themesDir: root,
    postRepo: new InMemoryPostRepo(),
  } as unknown as ContentRouteDeps;
  const app = buildTestApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE(theme!.manifest.id)}`);
  assert.equal(res.status, 200, "the broken theme.json must not crash the detail route");
  const body = (await res.json()) as { status: string };
  assert.equal(body.status, "invalid");
});

test("an unrecognized theme root triggers the route's outer catch-all 500", async (t) => {
  // `listThemeFiles` throws `ThemePathError` when the theme folder is not under a recognized theme
  // root (`isRecognizedThemeRoot`) — normally impossible for a `deps.themes` entry, since
  // `discoverAllBuiltInThemes` only ever populates `dir` with folders it walked FROM `themesDir`
  // itself. Simulated here by discovering normally, then pointing `dir` at an unrelated folder, to
  // reach the one code path in this route that is otherwise unreachable through any real request:
  // the bare `catch { res.status(500)... }` wrapping the whole handler.
  const themesDir = makeThemeNoCatalog();
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "site" });
  const theme = themes.find((t) => t.manifest.id === "fresh") as DiscoveredTheme;
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-outside-"));
  (theme as { dir: string }).dir = outsideDir;

  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes,
    themesDir,
    // The detail route now does one `postRepo.list()` per request (slug-collision signal,
    // `contentRecordsBySlug`) — an empty in-memory repo, matching every fixture in this file that
    // has no posts of its own to collide with any theme page.
    postRepo: new InMemoryPostRepo(),
  } as unknown as ContentRouteDeps;
  const app = buildTestApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("fresh")}`);
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});
