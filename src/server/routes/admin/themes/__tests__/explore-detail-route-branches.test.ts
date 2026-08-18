import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes, THEME_CATALOG_DIR } from "#src/features/theme/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminThemeDetailRoute } from "../explore";
import type { ContentRouteDeps } from "../../content/deps";
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
  const manifestWithLineage = JSON.stringify({
    id: "lineaged",
    name: "Lineaged",
    version: "1.0.0",
    tier: "static",
    engine: 1,
    lineage: { copiedFrom: "basic", copiedAt: "2026-08-17T00:00:00.000Z" },
  });
  for (const base of [path.join(root, "static", "lineaged"), path.join(root, THEME_CATALOG_DIR, "static", "lineaged")]) {
    fs.mkdirSync(path.join(base, "pages"), { recursive: true });
    fs.mkdirSync(path.join(base, "css"), { recursive: true });
    fs.writeFileSync(path.join(base, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
    fs.writeFileSync(path.join(base, "css", "styles.css"), "body{}", "utf8");
    fs.writeFileSync(path.join(base, "tokens.json"), "{}", "utf8");
    fs.writeFileSync(path.join(base, "theme.json"), manifestWithLineage, "utf8");
  }
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

test("lineage present and non-null: the manifest's own lineage object is echoed back verbatim", async (t) => {
  const themesDir = makeThemeWithLineageAndCatalog();
  const app = buildTestApp(baseDeps(themesDir));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("lineaged")}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { lineage: unknown; hasOriginal: boolean };
  assert.deepEqual(body.lineage, { copiedFrom: "basic", copiedAt: "2026-08-17T00:00:00.000Z" });
  assert.equal(body.hasOriginal, true, "a catalog original exists for this fixture");
});

test("lineage absent from the manifest: falls back to null via '?? null', and hasOriginal is false with no catalog", async (t) => {
  const themesDir = makeThemeNoLineageNoCatalog();
  const app = buildTestApp(baseDeps(themesDir));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("fresh")}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { lineage: unknown; hasOriginal: boolean };
  assert.equal(body.lineage, null);
  assert.equal(body.hasOriginal, false, "no catalog folder was created for this fixture");
});

test("malformed theme.json: the lineage re-read's bare catch swallows the JSON.parse failure, lineage reports null, response still 200", async (t) => {
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
