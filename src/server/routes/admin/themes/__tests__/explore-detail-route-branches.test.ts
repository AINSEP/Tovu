import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes, THEME_CATALOG_DIR } from "#src/features/theme/index";
import { THEME_LINEAGE_FILENAME, type ThemeLineage } from "#src/features/theme/theme-lineage";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminThemeDetailRoute } from "../explore.js";
import type { ContentRouteDeps } from "../../content/deps.js";
import type { DiscoveredTheme } from "#src/features/theme/index";

/**
 * @file Branch coverage for `registerAdminThemeDetailRoute`'s own logic, once the shared
 * access/not-found gates (`explore-access-and-not-found.test.ts`) and the built-theme write-scope
 * gates (`explore-built-theme-gate.test.ts`) are out of the way: the `lineage` read's own try/catch
 * (present, absent-key, and malformed-JSON outcomes), `hasOriginal` true/false, and the route's
 * outer catch-all 500 (nothing else in this file's existing coverage ever throws past the inner
 * `lineage` try/catch, so it has never actually fired).
 */

const WORKSPACE_ID = "ws-detail-branches";

function baseDeps(themesDir: string): ContentRouteDeps {
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "site" });
  return {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes,
    themesDir,
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

/** A theme with a catalog original present (so `hasOriginal` is true) and a `lineage` field on its
 *  manifest, so the "present, non-nullish" side of `raw.lineage ?? null` is real. */
function makeThemeWithLineageAndCatalog(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-detail-lineage-"));
  const manifest = JSON.stringify({
    id: "lineaged",
    name: "Lineaged",
    version: "1.0.0",
    tier: "static",
    engine: 1,
  });
  // Lineage lives in its own install-local sidecar (THEME_LINEAGE_FILENAME), NOT on the manifest --
  // 2026-08-18 schema decision, see registerAdminThemeDetailRoute's own comment and
  // theme-lineage.ts. A v2 manifest is additionalProperties:false, so a `lineage` key on
  // theme.json would not merely be ignored here, it would be schema-invalid.
  const lineage: ThemeLineage = {
    from: "marketplace",
    tier: "static",
    version: "1.0.0",
    catalog: `${THEME_CATALOG_DIR}/static/lineaged`,
    marketplaceId: "lineaged",
    name: "Lineaged",
  };
  const installDir = path.join(root, "static", "lineaged");
  for (const base of [installDir, path.join(root, THEME_CATALOG_DIR, "static", "lineaged")]) {
    fs.mkdirSync(path.join(base, "pages"), { recursive: true });
    fs.mkdirSync(path.join(base, "css"), { recursive: true });
    fs.writeFileSync(path.join(base, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
    fs.writeFileSync(path.join(base, "css", "styles.css"), "body{}", "utf8");
    fs.writeFileSync(path.join(base, "tokens.json"), "{}", "utf8");
    fs.writeFileSync(path.join(base, "theme.json"), manifest, "utf8");
  }
  // Install-local only: the catalog original is the pristine copy and carries no lineage of its own.
  fs.writeFileSync(path.join(installDir, THEME_LINEAGE_FILENAME), JSON.stringify(lineage), "utf8");
  return root;
}

/** A theme with NO catalog original at all (so `hasOriginal` is false) and a manifest with no
 *  `lineage` key (so `raw.lineage` is `undefined` and the `?? null` fallback is real). */
function makeThemeNoLineageNoCatalog(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-detail-no-lineage-"));
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

test("lineage sidecar present: the .tovu-lineage.json object is echoed back verbatim", async (t) => {
  const themesDir = makeThemeWithLineageAndCatalog();
  const app = buildTestApp(baseDeps(themesDir));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("lineaged")}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { lineage: unknown; hasOriginal: boolean };
  assert.deepEqual(body.lineage, {
    from: "marketplace",
    tier: "static",
    version: "1.0.0",
    catalog: `${THEME_CATALOG_DIR}/static/lineaged`,
    marketplaceId: "lineaged",
    name: "Lineaged",
  });
  assert.equal(body.hasOriginal, true, "a catalog original exists for this fixture");
});

test("lineage sidecar absent: readThemeLineageFile returns null, and hasOriginal is false with no catalog", async (t) => {
  const themesDir = makeThemeNoLineageNoCatalog();
  const app = buildTestApp(baseDeps(themesDir));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("fresh")}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { lineage: unknown; hasOriginal: boolean };
  assert.equal(body.lineage, null);
  assert.equal(body.hasOriginal, false, "no catalog folder was created for this fixture");
});

test("malformed theme.json: the route still 200s on a theme loadTheme marked invalid, and lineage reports null (no sidecar written)", async (t) => {
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
  } as unknown as ContentRouteDeps;
  const app = buildTestApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE(theme!.manifest.id)}`);
  assert.equal(res.status, 200, "the broken theme.json must not crash the detail route");
  const body = (await res.json()) as { lineage: unknown; status: string };
  assert.equal(body.lineage, null);
  assert.equal(body.status, "invalid");
});

test("an unrecognized theme root triggers the route's outer catch-all 500", async (t) => {
  // `listThemeFiles` throws `ThemePathError` when the theme folder is not under a recognized theme
  // root (`isRecognizedThemeRoot`) — normally impossible for a `deps.themes` entry, since
  // `discoverAllBuiltInThemes` only ever populates `dir` with folders it walked FROM `themesDir`
  // itself. Simulated here by discovering normally, then pointing `dir` at an unrelated folder, to
  // reach the one code path in this route that is otherwise unreachable through any real request:
  // the bare `catch { res.status(500)... }` wrapping the whole handler.
  const themesDir = makeThemeNoLineageNoCatalog();
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "site" });
  const theme = themes.find((t) => t.manifest.id === "fresh") as DiscoveredTheme;
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-outside-"));
  (theme as { dir: string }).dir = outsideDir;

  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes,
    themesDir,
  } as unknown as ContentRouteDeps;
  const app = buildTestApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("fresh")}`);
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});
