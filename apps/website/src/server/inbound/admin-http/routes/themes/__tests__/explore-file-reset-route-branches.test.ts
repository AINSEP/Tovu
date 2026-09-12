import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes, THEME_CATALOG_DIR } from "#src/features/theme/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminThemeFileResetRoute } from "../explore.js";
import type { ContentRouteDeps } from "../../content/deps.js";

/**
 * @file The two `NO_ORIGINAL`/`NOT_IN_ORIGINAL` reset-route branches not covered by
 * `explore-built-theme-gate.test.ts` (which covers the generated-tree-restore SUCCESS path and an
 * authored theme's plain `NO_ORIGINAL`) or `explore-liquid-readable.test.ts` (the per-file
 * SUCCESS path): a COMPILED theme's `restoreBuiltThemeGeneratedTree` call failing because its
 * catalog is missing (a DIFFERENT `NO_ORIGINAL` code path than the authored one -- this one is
 * reached via the `writeScope.kind === "generated-readonly"` branch's own try/catch, not the later
 * `!existsSync(catalogDir)` check), and a per-file reset whose catalog exists but does not contain
 * the requested file (`NOT_IN_ORIGINAL`).
 */

const WORKSPACE_ID = "ws-file-reset-branches";

/** A compiled theme with NO catalog original at all. */
function makeCompiledNoCatalogRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-reset-no-catalog-"));
  const dir = path.join(root, "static", "compiled");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "src", "Header.tsx"), "source", "utf8");
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({
      id: "compiled",
      name: "Compiled",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      build: { source: "compiled", sourceDir: "src", artifactHashes: {} },
    }),
    "utf8"
  );
  return root;
}

/** An authored theme WITH a catalog original, but the catalog is missing one file the live copy has. */
function makeAuthoredPartialCatalogRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-reset-partial-catalog-"));
  const manifest = JSON.stringify({ id: "partial", name: "Partial", version: "1.0.0", tier: "static", engine: 1 });

  const live = path.join(root, "static", "partial");
  fs.mkdirSync(path.join(live, "pages"), { recursive: true });
  fs.writeFileSync(path.join(live, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(live, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(live, "theme.json"), manifest, "utf8");
  // Author added this file themselves after copying -- it has no catalog counterpart.
  fs.writeFileSync(path.join(live, "author-added.txt"), "added later, not in the original", "utf8");

  const catalog = path.join(root, THEME_CATALOG_DIR, "static", "partial");
  fs.mkdirSync(path.join(catalog, "pages"), { recursive: true });
  fs.writeFileSync(path.join(catalog, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(catalog, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(catalog, "theme.json"), manifest, "utf8");

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
  registerAdminThemeFileResetRoute(app, deps);
  return app;
}

const BASE = (themeId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${themeId}`;

test("reset on a compiled theme's generated file with NO catalog at all -> 409 NO_ORIGINAL from restoreBuiltThemeGeneratedTree's own ThemePathError", async (t) => {
  const themesDir = makeCompiledNoCatalogRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("compiled")}/file/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/index.html" }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string; error: string };
  assert.equal(body.code, "NO_ORIGINAL");
  assert.match(body.error, /generated tree cannot be restored/, "this is restoreBuiltThemeGeneratedTree's own message, not the per-file NO_ORIGINAL message below it");
});

test("reset on a file present live but absent from an otherwise-real catalog -> 409 NOT_IN_ORIGINAL", async (t) => {
  const themesDir = makeAuthoredPartialCatalogRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const target = path.join(themesDir, "static", "partial", "author-added.txt");
  const before = fs.readFileSync(target, "utf8");

  const res = await fetch(`${baseUrl}${BASE("partial")}/file/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "author-added.txt" }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "NOT_IN_ORIGINAL");
  assert.equal(fs.readFileSync(target, "utf8"), before, "a refused reset must not touch disk");
});

test("a catalog read failure OTHER than ThemePathError, during a per-file reset, propagates to the route's outer catch -> 500, not 409", async (t) => {
  // The per-file reset maps only "the catalog has no regular file here" (`resetThemeFileToOriginal`
  // returning null) to 409 NOT_IN_ORIGINAL. Anything that function throws goes to the route's outer
  // `catch (err) { sendThemeFileError(res, err) }` -- exercised here by denying read permission on
  // the CATALOG copy, so opening it throws a raw EACCES -> 500 instead.
  const themesDir = makeAuthoredPartialCatalogRoot();
  const catalogTarget = path.join(themesDir, "__original-themes__", "static", "partial", "tokens.json");
  fs.chmodSync(catalogTarget, 0o000);
  t.after(() => fs.chmodSync(catalogTarget, 0o644));

  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("partial")}/file/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "tokens.json" }),
  });
  const body = (await res.json()) as { error?: string; code?: string };
  if (process.getuid && process.getuid() === 0) {
    t.skip("running as root: chmod 000 does not deny root a read, so EACCES cannot be forced here");
    return;
  }
  assert.equal(res.status, 500, `expected a permission-denied catalog read to 500, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.error, "internal error");
});

test("a generated-tree restore failure OTHER than ThemePathError propagates to the route's outer catch -> 500, not 409", async (t) => {
  // Same shape as the catalog-read case above, but for the `writeScope.kind === 'generated-readonly'`
  // branch's own inner try/catch around `restoreBuiltThemeGeneratedTree`: denying WRITE permission on
  // the live theme folder (removing an existing generated file needs unlink permission on its parent
  // directory) makes `rmSync` throw a raw EACCES, which that inner catch's `instanceof ThemePathError`
  // check does not match, so it rethrows to the route's outer catch instead of mapping to 409.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-reset-restore-eacces-"));
  const manifest = JSON.stringify({
    id: "compiled",
    name: "Compiled",
    version: "1.0.0",
    tier: "static",
    engine: 1,
    build: { source: "compiled", sourceDir: "src", artifactHashes: {} },
  });
  const live = path.join(root, "static", "compiled");
  fs.mkdirSync(path.join(live, "pages"), { recursive: true });
  fs.mkdirSync(path.join(live, "src"), { recursive: true });
  fs.writeFileSync(path.join(live, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(live, "src", "Header.tsx"), "source", "utf8");
  fs.writeFileSync(path.join(live, "theme.json"), manifest, "utf8");

  const catalog = path.join(root, THEME_CATALOG_DIR, "static", "compiled");
  fs.mkdirSync(path.join(catalog, "pages"), { recursive: true });
  fs.mkdirSync(path.join(catalog, "src"), { recursive: true });
  fs.writeFileSync(path.join(catalog, "pages", "index.html"), "<html><body>catalog</body></html>", "utf8");
  fs.writeFileSync(path.join(catalog, "src", "Header.tsx"), "catalog source", "utf8");
  fs.writeFileSync(path.join(catalog, "theme.json"), manifest, "utf8");

  const pagesDir = path.join(live, "pages");
  fs.chmodSync(pagesDir, 0o555);
  t.after(() => fs.chmodSync(pagesDir, 0o755));

  const app = buildTestApp(root);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("compiled")}/file/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/index.html" }),
  });
  const body = (await res.json()) as { error?: string; code?: string };
  if (process.getuid && process.getuid() === 0) {
    t.skip("running as root: chmod 555 does not deny root an unlink, so EACCES cannot be forced here");
    return;
  }
  assert.equal(res.status, 500, `expected a permission-denied generated-tree restore to 500, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.error, "internal error");
});
