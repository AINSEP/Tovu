import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverAllBuiltInThemes, MARKETPLACE_CATALOG_DIR, THEME_CATALOG_DIR } from "#src/features/theme/index";
import { createApp, createRouteDeps } from "../../app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file Local marketplace fixture (build-only workstream, no spec id) — the download route's
 * collision path end-to-end. The real `content/themes/__marketplace__/static/basic` fixture deliberately
 * shares its id with the already-installed `content/themes/static/basic`; this certifies that shape
 * directly: downloading a marketplace theme whose id collides with an installed one must land the new
 * copy at `<id>-1`, write BOTH the catalog original and the editable copy to disk, stamp both
 * manifests' `id` to match their own folder name, and be immediately loadable as `status: "valid"`
 * with no server restart.
 *
 * Runs against a throwaway themes root (`fs.mkdtempSync`), never the real `content/themes/` — a real
 * dev server may be serving off that checkout, and this route's whole job is writing theme folders to
 * disk, so a test asserting on real writes must not land them where the running site could see them.
 */

const STATIC_MANIFEST = (id: string, name: string): string =>
  JSON.stringify({ id, name, version: "1.0.0", tier: "static", engine: 1 }, null, 2);

function writeMinimalStaticTheme(dir: string, id: string, name: string): void {
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(path.join(dir, "theme.json"), STATIC_MANIFEST(id, name), "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<!doctype html><html><body>ok</body></html>", "utf8");
}

/** A scratch themes root with an already-installed `basic` AND a marketplace fixture also id'd
 * `basic`, so downloading it always collides — mirroring the real fixture's own deliberate collision.
 *
 * The marketplace fixture also carries a `preview/index.html` — `build-preview.mjs`'s generated
 * output shape — so the download route's `preview/`-exclusion filter (`marketplace.ts`'s
 * `isGeneratedPreviewPath`) has something to actually exclude. Without this, the filter's own unit
 * test would be the only evidence it does anything, and the real `content/themes/__marketplace__/`
 * fixture this test otherwise mirrors doesn't happen to ship a `preview/` dir either.
 */
function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-marketplace-"));
  writeMinimalStaticTheme(path.join(root, "static", "basic"), "basic", "Basic");
  const marketplaceDir = path.join(root, MARKETPLACE_CATALOG_DIR, "static", "basic");
  writeMinimalStaticTheme(marketplaceDir, "basic", "Basic (Marketplace)");
  fs.mkdirSync(path.join(marketplaceDir, "preview"), { recursive: true });
  fs.writeFileSync(path.join(marketplaceDir, "preview", "index.html"), "<!doctype html><html><body>stale</body></html>", "utf8");
  return root;
}

function testDeps(themesRoot: string): RouteDeps {
  return {
    ...createRouteDeps(),
    themesDir: themesRoot,
    themes: discoverAllBuiltInThemes({ dir: themesRoot, source: "built-in" }),
  };
}

const listUrl = (baseUrl: string, workspaceId: string): string =>
  `${baseUrl}/api/admin/v1/workspaces/${workspaceId}/marketplace/themes`;
const downloadUrl = (baseUrl: string, workspaceId: string, themeId: string): string =>
  `${baseUrl}/api/admin/v1/workspaces/${workspaceId}/marketplace/themes/${themeId}/download`;

test("marketplace download: an id collision installs the new theme at '<id>-1' on both disk locations", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const response = await fetch(downloadUrl(baseUrl, deps.workspaceId, "basic"), {
    method: "POST",
    headers: { cookie },
  });
  const body = (await response.json()) as {
    id: string;
    suffixed: boolean;
    tier: string;
    lineage: { marketplaceId: string };
    rescan: { added: string[] };
  };

  assert.equal(response.status, 200);
  assert.equal(body.id, "basic-1");
  assert.equal(body.suffixed, true);
  assert.equal(body.tier, "static");
  assert.equal(body.lineage.marketplaceId, "basic");

  const catalogManifestPath = path.join(themesRoot, THEME_CATALOG_DIR, "static", "basic-1", "theme.json");
  const installedManifestPath = path.join(themesRoot, "static", "basic-1", "theme.json");
  assert.ok(fs.existsSync(catalogManifestPath), "the catalog original must exist on disk");
  assert.ok(fs.existsSync(installedManifestPath), "the editable copy must exist on disk");

  // The fixture's generated preview/ must not survive the copy into either destination — the
  // filter's whole point — while an ordinary file it ships alongside it (tokens.json) still does, so
  // this proves selective exclusion rather than an accidentally-empty or failed copy.
  const catalogDir = path.join(themesRoot, THEME_CATALOG_DIR, "static", "basic-1");
  const installedDir = path.join(themesRoot, "static", "basic-1");
  assert.ok(!fs.existsSync(path.join(catalogDir, "preview")), "catalog copy must not carry preview/");
  assert.ok(!fs.existsSync(path.join(installedDir, "preview")), "editable copy must not carry preview/");
  assert.ok(fs.existsSync(path.join(catalogDir, "tokens.json")), "catalog copy must still carry ordinary files");
  assert.ok(fs.existsSync(path.join(installedDir, "tokens.json")), "editable copy must still carry ordinary files");

  const catalogManifest = JSON.parse(fs.readFileSync(catalogManifestPath, "utf8")) as Record<string, unknown>;
  const installedManifest = JSON.parse(fs.readFileSync(installedManifestPath, "utf8")) as Record<string, unknown>;
  assert.equal(catalogManifest.id, "basic-1", "the catalog copy's id must equal its own folder name");
  assert.equal(installedManifest.id, "basic-1", "the editable copy's id must equal its own folder name");
  // 2026-08-18 schema v2 decision: lineage lives in its own install-local sidecar file, never merged
  // into theme.json — an unknown key there would fail a strict v2 manifest schema regardless of
  // whether anything reads it. See `theme-lineage.ts`'s file header.
  assert.equal(installedManifest.lineage, undefined, "the editable copy's theme.json must NOT carry lineage");
  assert.equal(catalogManifest.lineage, undefined, "the catalog copy must NOT carry lineage");

  const installedLineagePath = path.join(installedDir, ".tovu-lineage.json");
  const catalogLineagePath = path.join(catalogDir, ".tovu-lineage.json");
  assert.ok(fs.existsSync(installedLineagePath), "the editable copy must carry a lineage sidecar file");
  const installedLineage = JSON.parse(fs.readFileSync(installedLineagePath, "utf8")) as { marketplaceId: string };
  assert.equal(installedLineage.marketplaceId, "basic");
  assert.ok(!fs.existsSync(catalogLineagePath), "the catalog copy must NOT carry a lineage sidecar file");

  const reloaded = discoverAllBuiltInThemes({ dir: themesRoot, source: "built-in" }).find(
    (theme) => theme.manifest.id === "basic-1"
  );
  assert.ok(reloaded, "the new theme must be discoverable");
  assert.equal(reloaded!.status, "valid", `expected valid, got: ${JSON.stringify(reloaded!.errors)}`);

  // The response's own rescan result, and deps.themes (mutated in place by the route), both reflect
  // the new theme immediately — no restart required.
  assert.ok(body.rescan.added.includes("basic-1"));
  assert.ok(deps.themes.some((theme) => theme.manifest.id === "basic-1"));
});

test("marketplace download: a fixture that fails install-profile validation is refused BEFORE either copy, disk untouched (2026-08-18 validate-then-copy gate)", async (t) => {
  const themesRoot = makeThemesRoot();
  // A second, deliberately BROKEN fixture: its theme.json id ('mismatched') does not equal its own
  // folder name ('broken') — a real `loadTheme()` failure, exactly the class of defect the
  // validate-then-copy gate exists to catch before it becomes local files.
  const brokenDir = path.join(themesRoot, MARKETPLACE_CATALOG_DIR, "static", "broken");
  writeMinimalStaticTheme(brokenDir, "mismatched", "Broken");
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const response = await fetch(downloadUrl(baseUrl, deps.workspaceId, "broken"), {
    method: "POST",
    headers: { cookie },
  });
  const body = (await response.json()) as { code: string; error: string };

  assert.equal(response.status, 400, `expected 400, got ${response.status}: ${JSON.stringify(body)}`);
  assert.equal(body.code, "INVALID_PACKAGE");
  assert.match(body.error, /must equal folder name/);

  assert.ok(!fs.existsSync(path.join(themesRoot, THEME_CATALOG_DIR, "static", "broken")), "the catalog copy must never be written for a refused fixture");
  assert.ok(!fs.existsSync(path.join(themesRoot, "static", "broken")), "the editable copy must never be written for a refused fixture");
});

test("marketplace list: the colliding fixture is flagged as already taken locally", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const response = await fetch(listUrl(baseUrl, deps.workspaceId), { headers: { cookie } });
  const body = (await response.json()) as { themes: Array<{ id: string; tier: string; idTaken: boolean }> };

  assert.equal(response.status, 200);
  const basic = body.themes.find((theme) => theme.id === "basic");
  assert.ok(basic, "the marketplace fixture must be listed");
  assert.equal(basic!.tier, "static");
  assert.equal(basic!.idTaken, true);
});

test("marketplace download: an unknown marketplace theme is a 404", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const response = await fetch(downloadUrl(baseUrl, deps.workspaceId, "does-not-exist"), {
    method: "POST",
    headers: { cookie },
  });

  assert.equal(response.status, 404);
});

test("marketplace download: a path-traversal id is rejected as a 400, never resolved against the filesystem", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const response = await fetch(downloadUrl(baseUrl, deps.workspaceId, encodeURIComponent("../../etc")), {
    method: "POST",
    headers: { cookie },
  });

  assert.equal(response.status, 400);
});

test("marketplace download: requires an authenticated admin session", async (t) => {
  const themesRoot = makeThemesRoot();
  const deps = testDeps(themesRoot);
  const { baseUrl } = await bootAuthenticated(createApp(deps), t);

  const response = await fetch(downloadUrl(baseUrl, deps.workspaceId, "basic"), { method: "POST" });

  assert.equal(response.status, 401);
});
