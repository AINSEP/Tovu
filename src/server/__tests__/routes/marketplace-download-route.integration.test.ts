import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverAllBuiltInThemes, MARKETPLACE_CATALOG_DIR, THEME_CATALOG_DIR } from "#src/features/theme/index";
import { createApp, createRouteDeps } from "../../app";
import { bootAuthenticated } from "../helpers/http-test-server";
import type { RouteDeps } from "../../routes/types";

/**
 * @file Local marketplace fixture (build-only workstream, no spec id) — the download route's
 * collision path end-to-end. The real `src/themes/__marketplace__/static/basic` fixture deliberately
 * shares its id with the already-installed `src/themes/static/basic`; this certifies that shape
 * directly: downloading a marketplace theme whose id collides with an installed one must land the new
 * copy at `<id>-1`, write BOTH the catalog original and the editable copy to disk, stamp both
 * manifests' `id` to match their own folder name, and be immediately loadable as `status: "valid"`
 * with no server restart.
 *
 * Runs against a throwaway themes root (`fs.mkdtempSync`), never the real `src/themes/` — a real
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
 * `basic`, so downloading it always collides — mirroring the real fixture's own deliberate collision. */
function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-marketplace-"));
  writeMinimalStaticTheme(path.join(root, "static", "basic"), "basic", "Basic");
  writeMinimalStaticTheme(path.join(root, MARKETPLACE_CATALOG_DIR, "static", "basic"), "basic", "Basic (Marketplace)");
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

  const catalogManifest = JSON.parse(fs.readFileSync(catalogManifestPath, "utf8")) as Record<string, unknown>;
  const installedManifest = JSON.parse(fs.readFileSync(installedManifestPath, "utf8")) as Record<string, unknown>;
  assert.equal(catalogManifest.id, "basic-1", "the catalog copy's id must equal its own folder name");
  assert.equal(installedManifest.id, "basic-1", "the editable copy's id must equal its own folder name");
  assert.ok(installedManifest.lineage, "the editable copy must carry a lineage object");
  assert.equal((installedManifest.lineage as { marketplaceId: string }).marketplaceId, "basic");
  assert.equal(catalogManifest.lineage, undefined, "the catalog copy must NOT carry lineage");

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
