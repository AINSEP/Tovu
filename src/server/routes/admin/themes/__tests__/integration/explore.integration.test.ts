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
