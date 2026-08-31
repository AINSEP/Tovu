import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { Response } from "express";

import { discoverAllBuiltInThemes, THEME_CATALOG_DIR } from "#src/features/theme/index";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { bootAuthenticated, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";
import { nextAvailableFileName, reloadTheme, renameThemeFileIfChanged } from "../../explore.js";

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

test("explore: an unreadable theme directory 500s via the detail route's generic catch, not a 404/403", async (t) => {
  const themesDir = makeThemesRoot();
  const liveThemeDir = path.join(themesDir, "static", THEME_ID);
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // Chmod AFTER app boot (the theme catalog is discovered once, up front, from `deps.themes` -- see
  // `testDeps`/`discoverAllBuiltInThemes` above -- so `findThemeOrRespond`'s lookup is unaffected)
  // and right before the request, so only `listThemeFiles`'s own live `readdirSync(themeDir)`
  // inside the route's try block hits the permission error, not theme discovery/lookup.
  fs.chmodSync(liveThemeDir, 0o000);
  t.after(() => fs.chmodSync(liveThemeDir, 0o755));

  const res = await fetch(`${baseUrl}${BASE}`, { headers: { cookie } });
  if (process.getuid && process.getuid() === 0) {
    t.skip("running as root: chmod 000 does not deny root a read");
    return;
  }
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
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

test("explore: PUT of a script (.js) file succeeds -- 2026-08-29 owner ask, script is no longer a content-read-only group", async (t) => {
  const themesDir = makeThemesRoot();
  const appJsPath = path.join(themesDir, "static", THEME_ID, "app.js");
  fs.writeFileSync(appJsPath, "console.log(1);", "utf8");
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "app.js", content: "console.log(2);" }),
  });
  assert.equal(res.status, 200);
  assert.equal(fs.readFileSync(appJsPath, "utf8"), "console.log(2);");
});

test("explore: PUT of a read-only group ('other', e.g. NOTICE.md) is refused 403", async (t) => {
  const themesDir = makeThemesRoot();
  fs.writeFileSync(path.join(themesDir, "static", THEME_ID, "NOTICE.md"), "# notice", "utf8");
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "NOTICE.md", content: "tampered" }),
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

test("explore: renaming to the SAME name is a no-op 200, and renaming onto an existing name 409s NAME_TAKEN", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const noop = await fetch(`${baseUrl}${BASE}/file/rename`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css", name: "style.css" }),
  });
  assert.equal(noop.status, 200);

  const taken = await fetch(`${baseUrl}${BASE}/file/rename`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css", name: "tokens.json" }),
  });
  assert.equal(taken.status, 409);
  assert.equal(((await taken.json()) as { code?: string }).code, "NAME_TAKEN");
});

test("explore: renaming to a different extension is refused 400 EXTENSION_CHANGE_NOT_ALLOWED", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file/rename`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css", name: "style.txt" }),
  });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { code?: string }).code, "EXTENSION_CHANGE_NOT_ALLOWED");
});

test("explore: a source file that doesn't exist 404s FILE_NOT_FOUND on both copy and rename", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const copy = await fetch(`${baseUrl}${BASE}/file/copy`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "nope.css" }),
  });
  assert.equal(copy.status, 404);

  const rename = await fetch(`${baseUrl}${BASE}/file/rename`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "nope.css", name: "x.css" }),
  });
  assert.equal(rename.status, 404);
});

test("explore: a file present live but absent from the catalog 409s NOT_IN_ORIGINAL on reset", async (t) => {
  const themesDir = makeThemesRoot();
  fs.writeFileSync(path.join(themesDir, "static", THEME_ID, "author-added.txt"), "not in catalog", "utf8");
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file/reset`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "author-added.txt" }),
  });
  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { code?: string }).code, "NOT_IN_ORIGINAL");
});

test("explore: a path traversing outside the theme folder 400s ThemePathError on PUT, not 403", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "css/../../../../etc/evil.css", content: "body{}" }),
  });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { code?: string }).code, "INVALID_THEME_PATH");
});

test("explore: a permission-denied write 500s via the route's generic catch, not 400/403", async (t) => {
  const themesDir = makeThemesRoot();
  const target = path.join(themesDir, "static", THEME_ID, "style.css");
  fs.chmodSync(target, 0o444);
  t.after(() => fs.chmodSync(target, 0o644));

  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css", content: "body { color: green; }" }),
  });
  if (process.getuid && process.getuid() === 0) {
    t.skip("running as root: chmod 444 does not deny root a write");
    return;
  }
  assert.equal(res.status, 500);
});

/** A BUILT (`build.source: "compiled"`) theme, for the ADR-020 §5 write-scope split -- the plain
 *  `makeThemesRoot` fixture above is deliberately authored-only (no `build` field) and can't exercise
 *  `resolveThemeFileWriteScope`'s "generated-readonly" outcome at all. */
function makeCompiledThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-explore-integration-compiled-"));
  const id = "fixture-compiled";
  const live = path.join(root, "static", id);
  const catalog = path.join(root, THEME_CATALOG_DIR, "static", id);
  const manifest = JSON.stringify({
    id,
    name: "Fixture Compiled",
    version: "1.0.0",
    tier: "static",
    engine: 1,
    build: { source: "compiled", sourceDir: "src", artifactHashes: {} },
  });

  fs.mkdirSync(path.join(live, "pages"), { recursive: true });
  fs.mkdirSync(path.join(live, "src"), { recursive: true });
  fs.mkdirSync(path.join(live, "preview"), { recursive: true });
  fs.writeFileSync(path.join(live, "pages", "index.html"), "CORRUPTED-BEFORE-RESTORE", "utf8");
  fs.writeFileSync(path.join(live, "src", "Header.tsx"), "live source", "utf8");
  fs.writeFileSync(path.join(live, "preview", "app.css"), "GENERATED", "utf8");
  fs.writeFileSync(path.join(live, "theme.json"), manifest, "utf8");

  fs.mkdirSync(path.join(catalog, "pages"), { recursive: true });
  fs.mkdirSync(path.join(catalog, "src"), { recursive: true });
  fs.writeFileSync(path.join(catalog, "pages", "index.html"), "<html><body>built</body></html>", "utf8");
  fs.writeFileSync(path.join(catalog, "src", "Header.tsx"), "catalog source", "utf8");
  fs.writeFileSync(path.join(catalog, "theme.json"), manifest, "utf8");

  return root;
}

const COMPILED_ID = "fixture-compiled";
const COMPILED_BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${COMPILED_ID}`;

test("explore: PUT into a built theme's generated tree is refused, theme.json and sourceDir stay writable", async (t) => {
  const themesDir = makeCompiledThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const refused = await fetch(`${baseUrl}${COMPILED_BASE}/file`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/index.html", content: "HACKED" }),
  });
  assert.equal(refused.status, 403);
  assert.equal(((await refused.json()) as { code?: string }).code, "GENERATED_READONLY");

  const sourceDir = await fetch(`${baseUrl}${COMPILED_BASE}/file`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "src/Header.tsx", content: "edited" }),
  });
  assert.equal(sourceDir.status, 200);

  const themeJson = await fetch(`${baseUrl}${COMPILED_BASE}/file`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      path: "theme.json",
      content: JSON.stringify({
        id: COMPILED_ID,
        name: "Renamed",
        version: "1.0.0",
        tier: "static",
        engine: 1,
        build: { source: "compiled", sourceDir: "src", artifactHashes: {} },
      }),
    }),
  });
  assert.equal(themeJson.status, 200, "theme.json stays writable via the general path, not the sourceDir extension allowlist");
});

test("explore: reset on a built theme's generated file restores the whole tree atomically (scope: release)", async (t) => {
  const themesDir = makeCompiledThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${COMPILED_BASE}/file/reset`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/index.html" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { scope: string };
  assert.equal(body.scope, "release");
  assert.equal(
    fs.readFileSync(path.join(themesDir, "static", COMPILED_ID, "pages", "index.html"), "utf8"),
    "<html><body>built</body></html>"
  );
});

test("explore: copy/rename refuse a path inside a built theme's generated tree (preview/, outside sourceDir)", async (t) => {
  // This fixture's `sourceDir` is "src", not "preview" -- so `resolveThemeFileWriteScope` itself
  // already classifies "preview/app.css" as `generated-readonly` (it's neither `theme.json` nor under
  // `sourceDir`), and copy/rename refuse it there, before either ever reaches its OWN separate
  // `isGeneratedThemePath` check. (The unit tier's `explore-built-theme-gate.test.ts` covers the
  // narrower case where `sourceDir` itself IS "preview" -- the one shape that makes `isGeneratedThemePath`
  // the ACTUAL deciding check instead of `resolveThemeFileWriteScope`.)
  const themesDir = makeCompiledThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const copy = await fetch(`${baseUrl}${COMPILED_BASE}/file/copy`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "preview/app.css" }),
  });
  assert.equal(copy.status, 409);
  assert.equal(((await copy.json()) as { code?: string }).code, "GENERATED_READONLY");

  const rename = await fetch(`${baseUrl}${COMPILED_BASE}/file/rename`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "preview/app.css", name: "renamed.css" }),
  });
  assert.equal(rename.status, 409);
  assert.equal(((await rename.json()) as { code?: string }).code, "GENERATED_READONLY");
});

test("explore: PUT of an .svg (asset group) succeeds, a .md ('other' group) is refused -- isThemeFileWritable's per-group split", async (t) => {
  const themesDir = makeThemesRoot();
  fs.writeFileSync(path.join(themesDir, "static", THEME_ID, "logo.svg"), "<svg></svg>", "utf8");
  fs.writeFileSync(path.join(themesDir, "static", THEME_ID, "notes.md"), "# hi", "utf8");
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const svg = await fetch(`${baseUrl}${BASE}/file`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "logo.svg", content: "<svg><circle/></svg>" }),
  });
  assert.equal(svg.status, 200);

  const md = await fetch(`${baseUrl}${BASE}/file`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "notes.md", content: "# changed" }),
  });
  assert.equal(md.status, 403);
  assert.equal(((await md.json()) as { code?: string }).code, "READ_ONLY_FILE");
});

test("explore: GET file for a permission-denied path 500s via the route's generic catch, not 400", async (t) => {
  const themesDir = makeThemesRoot();
  const target = path.join(themesDir, "static", THEME_ID, "style.css");
  fs.chmodSync(target, 0o000);
  t.after(() => fs.chmodSync(target, 0o644));

  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file?path=style.css`, { headers: { cookie } });
  if (process.getuid && process.getuid() === 0) {
    t.skip("running as root: chmod 000 does not deny root a read");
    return;
  }
  assert.equal(res.status, 500);
});

test("explore: a no-extension file lists as unreadable/'other', a root-level .html OUTSIDE pages/ lists as 'partial'", async (t) => {
  const themesDir = makeThemesRoot();
  fs.writeFileSync(path.join(themesDir, "static", THEME_ID, "LICENSE"), "MIT", "utf8");
  fs.writeFileSync(path.join(themesDir, "static", THEME_ID, "nav.html"), "<nav></nav>", "utf8");
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}`, { headers: { cookie } });
  const body = (await res.json()) as { files: Array<{ path: string; group: string; readable: boolean }> };

  const license = body.files.find((f) => f.path === "LICENSE");
  assert.ok(license);
  assert.equal(license!.group, "other");
  assert.equal(license!.readable, false);

  const nav = body.files.find((f) => f.path === "nav.html");
  assert.ok(nav);
  assert.equal(nav!.group, "partial");
  assert.equal(nav!.readable, true);
});

test("explore: copying/renaming a file over the theme-file size ceiling 400s ThemePathError, not 500", async (t) => {
  const themesDir = makeThemesRoot();
  fs.writeFileSync(path.join(themesDir, "static", THEME_ID, "huge.css"), "x".repeat(1_000_001), "utf8");
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const copy = await fetch(`${baseUrl}${BASE}/file/copy`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "huge.css" }),
  });
  assert.equal(copy.status, 400);
  assert.equal(((await copy.json()) as { code?: string }).code, "INVALID_THEME_PATH");

  const rename = await fetch(`${baseUrl}${BASE}/file/rename`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "huge.css", name: "still-huge.css" }),
  });
  assert.equal(rename.status, 400);
  assert.equal(((await rename.json()) as { code?: string }).code, "INVALID_THEME_PATH");
});

test("explore: PUT into a compiled theme's sourceDir refuses a non-framework extension (.php), the bypass is a bounded allowlist", async (t) => {
  const themesDir = makeCompiledThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${COMPILED_BASE}/file`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "src/shell.php", content: "<?php system($_GET['c']); ?>" }),
  });
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as { code?: string }).code, "READ_ONLY_FILE");
});

test("explore: a compiled theme with no catalog original 409s NO_ORIGINAL on reset (restoreBuiltThemeGeneratedTree's own error)", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-explore-integration-compiled-nocatalog-"));
  const id = "fixture-compiled-orphan";
  const live = path.join(root, "static", id);
  fs.mkdirSync(path.join(live, "pages"), { recursive: true });
  fs.mkdirSync(path.join(live, "src"), { recursive: true });
  fs.writeFileSync(path.join(live, "pages", "index.html"), "<html></html>", "utf8");
  fs.writeFileSync(path.join(live, "src", "Header.tsx"), "source", "utf8");
  fs.writeFileSync(
    path.join(live, "theme.json"),
    JSON.stringify({
      id,
      name: "Orphan",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      build: { source: "compiled", sourceDir: "src", artifactHashes: {} },
    })
  );

  const app = createApp(testDeps(root));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${id}/file/reset`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/index.html" }),
  });
  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { code?: string }).code, "NO_ORIGINAL");
});

/**
 * Everything below closes real INTEGRATION-tier branch-coverage gaps found by an offset-level V8
 * audit against ONLY this file's own tests (the unit-tier `explore-*-route-branches.test.ts` suite
 * covers much of this same logic, but its coverage doesn't count for the integration tier, which is
 * measured from a separate `node --test` run). Grouped by technique, not by route.
 */

// --- authorizeThemeAccess / findThemeOrRespond's own `??""` fallbacks -----------------------------
// `String(req.params.workspaceId ?? "")` / `String(req.params.themeId ?? "")` can never see an
// `undefined` param through a REAL request: Express's own router guarantees every `:workspaceId`/
// `:themeId` segment is populated whenever this handler is dispatched to at all (a request that
// doesn't match a `:themeId` segment 404s from the router itself, before this code runs). The only
// way to genuinely execute the `??` side is to reach into the REAL composed app's router stack and
// call the registered handler directly with a hand-built `req` -- same technique already established
// by `create-delete-pause.integration.test.ts` for the identical shape of gap on a different route.

interface ExpressHandlerLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: (req: unknown, res: unknown) => unknown }[];
  };
}
interface ExpressAppWithRouter {
  _router: { stack: ExpressHandlerLayer[] };
}

/** `.../themes/:themeId/file` is matched by BOTH `GET` (read) and `PUT` (write) at the exact same
 *  path string (verified directly: `app._router.stack` has 2 layers there, `methods:{get:true}`
 *  and `methods:{put:true}`) -- matching by path alone (as this helper originally did, and as
 *  several sibling `create-delete-pause.integration.test.ts`/`export-site.integration.test.ts`
 *  copies of this same helper also did before being fixed) silently returns whichever method
 *  Express registered first, not necessarily the one the test means to call. Method is now part of
 *  the lookup so that mistake can't happen here. */
function extractHandler(
  app: ReturnType<typeof createApp>,
  method: "get" | "put",
  routePath: string
): (req: unknown, res: unknown) => unknown {
  const stack = (app as unknown as ExpressAppWithRouter)._router.stack;
  const layer = stack.find((l) => l.route?.path === routePath && l.route.methods[method]);
  if (!layer?.route) throw new Error(`${method.toUpperCase()} route '${routePath}' was not found in the router stack`);
  return layer.route.stack[0].handle;
}

function fakeExpressRes(): { res: unknown; getStatus: () => number | undefined; getBody: () => unknown } {
  let statusCode: number | undefined;
  let body: unknown;
  const res = {
    locals: { principal: { id: "forced-input-test-principal" } },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(payload: unknown) {
      body = payload;
      return res;
    },
  };
  return { res, getStatus: () => statusCode, getBody: () => body };
}

const DETAIL_ROUTE_PATH = "/api/admin/v1/workspaces/:workspaceId/themes/:themeId";
const FILE_ROUTE_PATH = "/api/admin/v1/workspaces/:workspaceId/themes/:themeId/file";

test("explore: authorizeThemeAccess's `req.params.workspaceId ?? \"\"` fallback, forced via a direct handler call on the REAL composed app (Express itself can never leave a required :workspaceId segment unset) -- still 404s as 'workspace was not found'", async () => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const handler = extractHandler(app, "get", DETAIL_ROUTE_PATH);
  const { res, getStatus, getBody } = fakeExpressRes();

  await handler({ params: {} }, res);

  assert.equal(getStatus(), 404);
  assert.deepEqual(getBody(), { error: "workspace was not found" });
});

test("explore: findThemeOrRespond's `req.params.themeId ?? \"\"` fallback, forced via a direct handler call with a correct workspaceId but an absent themeId param -- 404s 'theme \\'\\' was not found'", async () => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir, { authorize: async () => ({ allowed: true, reason: "forced" }) }));
  const handler = extractHandler(app, "get", DETAIL_ROUTE_PATH);
  const { res, getStatus, getBody } = fakeExpressRes();

  await handler({ params: { workspaceId: WORKSPACE_ID } }, res);

  assert.equal(getStatus(), 404);
  assert.deepEqual(getBody(), { error: "theme '' was not found" });
});

// --- bodyRecord's own `?? {}` fallback ---------------------------------------------------------
// The existing "PUT with no body/content-type at all" test below sends a real HTTP request with no
// body -- but `body-parser`'s `express.json()` middleware unconditionally does `req.body = req.body
// || {}` (verified directly in `node_modules/body-parser/lib/types/json.js`) BEFORE checking
// content-type at all, so `req.body` is `{}`, never `undefined`, for ANY real request through this
// app regardless of content-type. `bodyRecord({}).content` and `bodyRecord(undefined).content` both
// evaluate to `undefined`, so that test reaches the same `{ ok: false }` outcome either way WITHOUT
// ever exercising `bodyRecord`'s own `?? {}` branch -- same "provably unreachable via real HTTP,
// reachable via a forced direct call" shape as the params `??""` fallbacks above. Proven distinct,
// not just theoretically: drop the `?? {}` and `bodyRecord(undefined)` throws (`undefined.content`),
// which this route's outer `catch` turns into a 500 -- a genuinely different outcome from the 400
// this test asserts, so this specific scenario is what actually discriminates the fallback.
test("explore: bodyRecord's own `?? {}` fallback, forced via a direct handler call with a genuinely undefined req.body (not `{}`, which is all a real HTTP request can ever produce) -- still 400s INVALID_BODY", async () => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir, { authorize: async () => ({ allowed: true, reason: "forced" }) }));
  const handler = extractHandler(app, "put", FILE_ROUTE_PATH);
  const { res, getStatus, getBody } = fakeExpressRes();

  await handler({ params: { workspaceId: WORKSPACE_ID, themeId: THEME_ID }, body: undefined }, res);

  assert.equal(getStatus(), 400);
  assert.deepEqual(getBody(), { error: "content must be a string", code: "INVALID_BODY" });
});

// --- each non-detail route's OWN early-return branches --------------------------------------------
// `registerAdminThemeDetailRoute` already exercises both its own auth-failure and theme-not-found
// early returns (top of this file). Each of the other five routes has its OWN, separately-compiled
// copies of the same two `if (...) return;` checks -- covering them on the detail route does not
// cover them on GET-file/PUT/RESET/COPY/RENAME.

test("explore: GET file 404s on a mismatched workspaceId", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/themes/${THEME_ID}/file?path=style.css`, { headers: { cookie } });
  assert.equal(res.status, 404);
});

test("explore: GET file 404s on an unknown theme id", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/does-not-exist/file?path=style.css`, {
    headers: { cookie },
  });
  assert.equal(res.status, 404);
});

test("explore: PUT file 404s on a mismatched workspaceId", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/themes/${THEME_ID}/file`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css", content: "x" }),
  });
  assert.equal(res.status, 404);
});

test("explore: PUT file 404s on an unknown theme id", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/does-not-exist/file`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css", content: "x" }),
  });
  assert.equal(res.status, 404);
});

test("explore: reset 404s on a mismatched workspaceId", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/themes/${THEME_ID}/file/reset`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css" }),
  });
  assert.equal(res.status, 404);
});

test("explore: reset 404s on an unknown theme id", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/does-not-exist/file/reset`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css" }),
  });
  assert.equal(res.status, 404);
});

test("explore: copy 404s on a mismatched workspaceId", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/themes/${THEME_ID}/file/copy`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css" }),
  });
  assert.equal(res.status, 404);
});

test("explore: copy 404s on an unknown theme id", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/does-not-exist/file/copy`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css" }),
  });
  assert.equal(res.status, 404);
});

test("explore: rename 404s on a mismatched workspaceId", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/themes/${THEME_ID}/file/rename`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css", name: "main.css" }),
  });
  assert.equal(res.status, 404);
});

test("explore: rename 404s on an unknown theme id", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/does-not-exist/file/rename`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css", name: "main.css" }),
  });
  assert.equal(res.status, 404);
});

// --- GET file's own `String(req.query.path ?? "")` fallback ---------------------------------------

test("explore: GET file with no ?path= query at all 400s 'path is required' via the route's own query-param fallback", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file`, { headers: { cookie } });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "INVALID_THEME_PATH");
  assert.equal(body.error, "path is required");
});

// --- PUT with an entirely absent body (no content-type at all) -----------------------------------
// CORRECTION (2026-08-18): this test's original comment claimed `req.body` is `undefined` here
// because "express.json() never runs" -- that is wrong. `body-parser`'s `express.json()` middleware
// unconditionally does `req.body = req.body || {}` as its very first line, BEFORE checking
// content-type at all (verified directly in `node_modules/body-parser/lib/types/json.js`), so
// `req.body` is `{}` here, never `undefined`. `bodyRecord({}).content` and `bodyRecord(undefined)
// .content` both evaluate to `undefined` though, so this test still correctly reaches `{ ok: false
// }` / 400 INVALID_BODY -- it just does NOT exercise `bodyRecord`'s own `?? {}` branch, contrary to
// the original claim. See the forced-direct-call test above (`bodyRecord's own`?? {}` fallback`) for
// a test that genuinely passes `undefined` and does exercise that branch.

test("explore: PUT with no body/content-type at all still 400s INVALID_BODY (req.body is `{}` here, not `undefined` -- see the forced-call test above for the genuinely-undefined case)", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file`, { method: "PUT", headers: { cookie } });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "INVALID_BODY");
  assert.equal(body.error, "content must be a string");
});

// --- RESET / COPY refusing a `preview/` path on an ORDINARY (authored) theme -----------------------
// via their OWN `isGeneratedThemePath` check, distinct from `resolveThemeFileWriteScope`'s
// "generated-readonly" outcome (already covered above for a COMPILED theme). An authored theme's
// `resolveThemeFileWriteScope` always resolves "editable", so THIS is the only check that can refuse
// a `preview/...` path for it.

test("explore: reset of a 'preview/...' path on an ordinary (authored) theme is refused 409 via isGeneratedThemePath, not resolveThemeFileWriteScope", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file/reset`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "preview/x.css" }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "READ_ONLY_FILE");
  assert.equal(body.error, "'preview/x.css' is generated output and cannot be reset here");
});

test("explore: copy of a 'preview/...' path on an ordinary (authored) theme is refused 409 via isGeneratedThemePath", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file/copy`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "preview/x.css" }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "READ_ONLY_FILE");
  assert.equal(body.error, "'preview/x.css' is generated output and cannot be copied");
});

// --- RESET's per-file "no stored original" 409, distinct from handleGeneratedTreeReset's own -------
// ThemePathError of the same code: this is the AUTHORED-theme per-file path's own `!existsSync(catalogDir)`
// check, reached only when the theme has NO catalog counterpart at all.

test("explore: reset on an authored theme with no catalog counterpart at all 409s NO_ORIGINAL via the per-file existsSync(catalogDir) check", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-explore-integration-no-catalog-"));
  const id = "fixture-no-catalog";
  const live = path.join(root, "static", id);
  fs.mkdirSync(path.join(live, "pages"), { recursive: true });
  fs.writeFileSync(
    path.join(live, "theme.json"),
    JSON.stringify({ id, name: "No Catalog", version: "1.0.0", tier: "static", engine: 1 }),
    "utf8"
  );
  fs.writeFileSync(path.join(live, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(live, "pages", "index.html"), "<h1>Home</h1>", "utf8");
  fs.writeFileSync(path.join(live, "style.css"), "body{}", "utf8");

  const app = createApp(testDeps(root));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${id}/file/reset`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css" }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "NO_ORIGINAL");
  assert.equal(body.error, `theme '${id}' has no stored original, so nothing can be reset`);
});

// --- readOriginalForReset's own catch-and-rethrow, and RESET's outer catch -------------------------
// A permission-denied READ of the CATALOG file (not the live one) throws a plain fs error, not a
// ThemePathError -- readOriginalForReset's own `if (err instanceof ThemePathError)` is false, so it
// re-throws, and that propagates to the route's own outer `catch (err) { sendThemeFileError(res, err) }`.

test("explore: reset with an unreadable catalog file 500s via readOriginalForReset's own rethrow into the route's outer catch (not NOT_IN_ORIGINAL)", async (t) => {
  const themesDir = makeThemesRoot();
  const catalogFile = path.join(themesDir, THEME_CATALOG_DIR, "static", THEME_ID, "style.css");
  fs.chmodSync(catalogFile, 0o000);
  t.after(() => fs.chmodSync(catalogFile, 0o644));

  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file/reset`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css" }),
  });
  if (process.getuid && process.getuid() === 0) {
    t.skip("running as root: chmod 000 does not deny root a read");
    return;
  }
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

// --- handleGeneratedTreeReset's own catch-and-rethrow -----------------------------------------------
// Same shape, on the BUILT-theme generated-tree restore path: an unreadable CATALOG generated file
// makes `restoreBuiltThemeGeneratedTree`'s own `copyFileSync` throw a plain fs error, which
// `handleGeneratedTreeReset`'s `if (err instanceof ThemePathError)` does not match, so it re-throws
// into the same outer route catch.

test("explore: reset of a built theme with an unreadable catalog generated file 500s via handleGeneratedTreeReset's own rethrow", async (t) => {
  const themesDir = makeCompiledThemesRoot();
  const catalogGeneratedFile = path.join(themesDir, THEME_CATALOG_DIR, "static", COMPILED_ID, "pages", "index.html");
  fs.chmodSync(catalogGeneratedFile, 0o000);
  t.after(() => fs.chmodSync(catalogGeneratedFile, 0o644));

  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${COMPILED_BASE}/file/reset`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/index.html" }),
  });
  if (process.getuid && process.getuid() === 0) {
    t.skip("running as root: chmod 000 does not deny root a read");
    return;
  }
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

// --- RENAME's remaining branches --------------------------------------------------------------------

test("explore: renaming a script (.js) file on an ordinary theme is refused 409 READ_ONLY_FILE via validateFileIdentityChange's isFileIdentityChangeAllowed check", async (t) => {
  const themesDir = makeThemesRoot();
  fs.writeFileSync(path.join(themesDir, "static", THEME_ID, "app.js"), "console.log(1);", "utf8");
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file/rename`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "app.js", name: "app2.js" }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "READ_ONLY_FILE");
  assert.equal(body.error, "'app.js' is read-only in Explore and cannot be renamed");
});

test("explore: renaming a file inside a built theme's sourceDir succeeds -- isRenameSourceAllowed's isSourceDirWritableExtension branch", async (t) => {
  const themesDir = makeCompiledThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${COMPILED_BASE}/file/rename`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "src/Header.tsx", name: "Header2.tsx" }),
  });
  assert.equal(res.status, 200, await res.text());
  assert.ok(fs.existsSync(path.join(themesDir, "static", COMPILED_ID, "src", "Header2.tsx")));
});

test("explore: renaming to an empty name is refused 400 INVALID_NAME ('name is required')", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file/rename`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css", name: "" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "INVALID_NAME");
  assert.equal(body.error, "name is required");
});

test("explore: renaming to a name containing a path separator is refused 400 INVALID_NAME", async (t) => {
  const themesDir = makeThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file/rename`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "style.css", name: "sub/dir.css" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "INVALID_NAME");
  assert.equal(body.error, "name 'sub/dir.css' must be a plain filename in the same folder, not a path");
});

test("explore: renaming a file inside a subfolder keeps the same folder -- the path-join branch taken when sourcePath has a slash", async (t) => {
  const themesDir = makeThemesRoot();
  fs.writeFileSync(path.join(themesDir, "static", THEME_ID, "pages", "about.html"), "<h1>About</h1>", "utf8");
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/file/rename`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/about.html", name: "about2.html" }),
  });
  assert.equal(res.status, 200, await res.text());
  assert.ok(fs.existsSync(path.join(themesDir, "static", THEME_ID, "pages", "about2.html")));
});

// --- fileExtension's no-extension branch, via a compiled theme's sourceDir extension gate ----------

test("explore: PUT of an extensionless file inside a built theme's sourceDir is refused 403 -- fileExtension's no-extension branch feeding isSourceDirWritableExtension", async (t) => {
  const themesDir = makeCompiledThemesRoot();
  const app = createApp(testDeps(themesDir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${COMPILED_BASE}/file`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ path: "src/README", content: "hello" }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "READ_ONLY_FILE");
});

// --- nextAvailableFileName's remaining branches, exercised via a direct call -----------------------
// The COPY route ONLY ever calls this with `desiredPath: sourcePath`, and `sourcePath` is always
// already validated to be IN `existingPaths` (the route 404s beforehand otherwise) -- so
// `!existingPaths.has(desiredPath)` (the immediate no-collision return) can never be true through the
// real route, and neither can the `hasExt === false` ternary branches unless the colliding file
// itself has no extension, which the route's own fixtures never happen to exercise either. This
// EXPORTED pure helper is the approved seam: a direct call with a non-colliding, extensionless
// `desiredPath` covers all three; a second call with two pre-existing collisions covers the
// while-loop's own retry body (`suffix += 1`), which the existing COPY test never forces because its
// very first candidate is already free.

test("nextAvailableFileName: a non-colliding, extensionless desired path returns unchanged -- immediate-return and hasExt===false branches, unreachable through the real COPY route", () => {
  const result = nextAvailableFileName({ desiredPath: "newfile", existingPaths: new Set() });
  assert.equal(result, "newfile");
});

test("nextAvailableFileName: two pre-existing collisions force a second suffix -- the while-loop's own retry body", () => {
  const result = nextAvailableFileName({
    desiredPath: "style.css",
    existingPaths: new Set(["style.css", "style-1.css"]),
  });
  assert.equal(result, "style-2.css");
});

// --- renameThemeFileIfChanged's destWriteScope generated-readonly branch, exercised via a direct call
// The route's own `name` validation (no `/`/`\\`) guarantees destPath always shares sourcePath's
// folder, so destPath's write-scope is provably identical to sourcePath's already-checked one -- this
// function's own doc calls the check "defense-in-depth, not currently reachable through THIS route".
// Calling the EXPORTED function directly with a deliberately mismatched destPath (impossible to
// construct through the real route) is the only way to exercise it.

test("renameThemeFileIfChanged: a destPath resolving into a built theme's generated tree is refused 409 GENERATED_READONLY -- defense-in-depth, only reachable via a direct call", async () => {
  const themesDir = makeCompiledThemesRoot();
  const deps = testDeps(themesDir);
  const theme = deps.themes.find((t) => t.manifest.id === COMPILED_ID);
  assert.ok(theme);

  let statusCode: number | undefined;
  let jsonBody: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(payload: unknown) {
      jsonBody = payload;
      return res;
    },
  } as unknown as Response;

  const changed = renameThemeFileIfChanged(
    deps,
    theme!,
    { sourcePath: "src/Header.tsx", destPath: "preview/Header.tsx", name: "Header.tsx" },
    new Set(["src/Header.tsx"]),
    res
  );

  assert.equal(changed, false);
  assert.equal(statusCode, 409);
  assert.equal((jsonBody as { code: string }).code, "GENERATED_READONLY");
});

// --- reloadTheme's own early return, exercised via a direct call -----------------------------------
// Every ROUTE call site invokes this with `theme.manifest.id`, an id `findThemeOrRespond` just proved
// is present in `deps.themes` moments earlier -- so `deps.themes.findIndex(...) < 0` can never be true
// through any real route. `reloadTheme` is exported specifically as a reusable behavior (its own doc
// comment calls out matching the `theme_write_file` AGENT tool's identical reload step), so a direct
// call with an id that genuinely isn't in `deps.themes` is a legitimate exercise of its own documented
// no-op guard, not an invented scenario.

test("reloadTheme: an id absent from deps.themes is a silent no-op -- the early return this exported function documents", () => {
  const themesDir = makeThemesRoot();
  const deps = testDeps(themesDir);
  const before = [...deps.themes];

  reloadTheme(deps, "does-not-exist-in-deps-themes");

  assert.deepEqual(deps.themes, before);
});
