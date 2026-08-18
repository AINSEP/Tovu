import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverAllBuiltInThemes, THEME_CATALOG_DIR } from "#src/features/theme/index";
import { createApp, createRouteDeps } from "#src/server/app";
import { bootAuthenticated, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Integration-tier coverage for the theme Explore routes (`explore.ts`) — real composed app
 * (`createApp`/`createRouteDeps`), real login. `themes`/`themesDir` are overridden to a throwaway
 * `fs.mkdtempSync` fixture (same technique the unit-tier `explore-liquid-readable.test.ts` already
 * uses) so PUT/reset/copy/rename never touch this repo's real shipped theme sources.
 *
 * Deliberately leaner than the 76-test unit-tier suite across 8 files (that suite already exhausts
 * this file's intricate write-scope/security branch matrix) — this proves the SAME core outcomes
 * are reachable through the real login + real composed-app path, for the separate integration-tier
 * measurement.
 */

const WORKSPACE_ID = "workspace-local";
const THEME_ID = "fixture-theme";
const ORIGINAL_CSS = "body { color: black; }";

/** A minimal AUTHORED (no `build` field) theme with both a live copy and a catalog original, so
 *  reset has something real to restore from. */
function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-explore-integration-"));
  const manifest = JSON.stringify({ id: THEME_ID, name: "Fixture Theme", version: "1.0.0", tier: "static", engine: 1 });

  const live = path.join(root, "static", THEME_ID);
  fs.mkdirSync(path.join(live, "pages"), { recursive: true });
  fs.writeFileSync(path.join(live, "theme.json"), manifest, "utf8");
  fs.writeFileSync(path.join(live, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(live, "pages", "index.html"), "<h1>Home</h1>", "utf8");
  fs.writeFileSync(path.join(live, "style.css"), ORIGINAL_CSS, "utf8");

  const catalog = path.join(root, THEME_CATALOG_DIR, "static", THEME_ID);
  fs.mkdirSync(path.join(catalog, "pages"), { recursive: true });
  fs.writeFileSync(path.join(catalog, "theme.json"), manifest, "utf8");
  fs.writeFileSync(path.join(catalog, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(catalog, "pages", "index.html"), "<h1>Home</h1>", "utf8");
  fs.writeFileSync(path.join(catalog, "style.css"), ORIGINAL_CSS, "utf8");

  return root;
}

function testDeps(themesDir: string, overrides: Partial<RouteDeps> = {}): RouteDeps {
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "site" });
  return { ...createRouteDeps(), themes, themesDir, ...overrides };
}

const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${THEME_ID}`;

test("explore: mismatched workspaceId 404s on the detail route", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/themes/${THEME_ID}`, { headers: { cookie } });
  assert.equal(res.status, 404);
});

test("explore: a principal with no grants is denied 403 on the detail route", async (t) => {
  const themesDir = makeThemesRoot();
  const deps = testDeps(themesDir);
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}${BASE}`, { headers: { cookie: bareCookie } });
  assert.equal(res.status, 403);
});

test("explore: an unknown theme id 404s on the detail route", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/does-not-exist`, { headers: { cookie } });
  assert.equal(res.status, 404);
});

test("explore: detail lists the fixture's own files, real login, real composed app", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { files: Array<{ path: string }> };
  assert.ok(body.files.some((f) => f.path === "style.css"));
});

test("explore: PUT a writable file, then GET reflects the reload (not stale)", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const put = await fetch(`${baseUrl}${BASE}/file`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css", content: "body { color: red; }" }),
  });
  assert.equal(put.status, 200);

  const get = await fetch(`${baseUrl}${BASE}/file?path=style.css`, { headers: { cookie } });
  const body = (await get.json()) as { content: string };
  assert.equal(body.content, "body { color: red; }");
});

test("explore: PUT of a read-only group (script/.js) is refused 403", async (t) => {
  const themesDir = makeThemesRoot();
  fs.writeFileSync(path.join(themesDir, "static", THEME_ID, "app.js"), "console.log(1);", "utf8");
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "app.js", content: "console.log(2);" }),
  });
  assert.equal(res.status, 403);
});

test("explore: reset restores the catalog original verbatim after a direct on-disk edit", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const onDisk = path.join(themesDir, "static", THEME_ID, "style.css");
  fs.writeFileSync(onDisk, "body { color: blue; }", "utf8");

  const res = await fetch(`${baseUrl}${BASE}/file/reset`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css" }),
  });
  assert.equal(res.status, 200);
  assert.equal(fs.readFileSync(onDisk, "utf8"), ORIGINAL_CSS);
});

test("explore: copy duplicates a file under an auto-suffixed name", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file/copy`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { path: string; copiedFrom: string };
  assert.equal(body.path, "style-1.css");
  assert.equal(body.copiedFrom, "style.css");
});

test("explore: renaming REQUIRED_THEME_FILES ('pages/index.html') is hard-blocked 409", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file/rename`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/index.html", name: "home.html" }),
  });
  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { code?: string }).code, "REQUIRED_FILE_LOCKED");
});

test("explore: an ordinary rename succeeds end to end", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file/rename`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css", name: "main.css" }),
  });
  assert.equal(res.status, 200);
  assert.ok(fs.existsSync(path.join(themesDir, "static", THEME_ID, "main.css")));
});
