import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import express from "express";

import { discoverAllBuiltInThemes, listThemeFiles } from "#src/features/theme/index";
import { buildThemesRegistrations, type ThemeToolDeps } from "#src/features/theme/tool-registrations";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import type { ContentRouteDeps } from "../../../content/deps.js";
import { registerAdminThemeDetailRoute, registerAdminThemeFileDeleteRoute } from "../../explore.js";

const BASE = "/api/admin/v1/workspaces/ws-trash/themes/fixture";

/** Real Express routes and theme filesystem; no listening socket is needed for this round trip. */
function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-explore-trash-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const themeDir = path.join(root, "static", "fixture");
  fs.mkdirSync(path.join(themeDir, "pages"), { recursive: true });
  fs.mkdirSync(path.join(themeDir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(themeDir, "theme.json"), JSON.stringify({
    id: "fixture", name: "Fixture", version: "1.0.0", tier: "static", engine: 1,
  }));
  fs.writeFileSync(path.join(themeDir, "tokens.json"), "{}");
  fs.writeFileSync(path.join(themeDir, "pages/index.html"), "<h1>Home</h1>");
  const deps = {
    workspaceId: "ws-trash",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    resolveActiveThemeId: async () => "fixture",
    themes: discoverAllBuiltInThemes({ dir: root, source: "site" }),
    themesDir: root,
    postRepo: { list: async () => [] },
  };
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "test-principal" }; next(); });
  registerAdminThemeDetailRoute(app, deps as unknown as ContentRouteDeps);
  registerAdminThemeFileDeleteRoute(app, deps as unknown as ContentRouteDeps);
  const files = () => listThemeFiles({ themeDir, themesRoot: root });
  return { app, deps, themeDir, files };
}

for (const [relativePath, bytes] of [
  ["pages/about.html", Buffer.from("<h1>About</h1>\r\n")],
  // Moving an image must preserve arbitrary bytes without applying the text-read size limit.
  ["assets/hero.png", Buffer.concat([Buffer.from([0x89, 0x50, 0xff, 0xfe, 0, 0x80]), Buffer.alloc(1_200_000, 0xa5)])],
] as const) {
  test(`Explore delete preserves ${relativePath} in theme trash and the assistant restores its exact bytes`, async (t) => {
    const { app, deps, themeDir, files } = fixture(t);
    fs.writeFileSync(path.join(themeDir, relativePath), bytes);
    const response = await dispatchJsonRequest(app, "POST", `${BASE}/file/delete`, { path: relativePath });
    assert.deepEqual(response, { status: 200, body: { path: relativePath, deleted: true } });
    assert.equal(fs.existsSync(path.join(themeDir, relativePath)), false);
    const trashed = files().filter((file) => file.startsWith(".trash/") && file.endsWith(`/${relativePath}`));
    assert.equal(trashed.length, 1, "Delete must retain one restorable copy in the theme trash");
    assert.match(trashed[0], /^\.trash\/\d+\//);
    assert.deepEqual(fs.readFileSync(path.join(themeDir, trashed[0])), bytes);

    const listing = await dispatchJsonRequest(app, "GET", BASE);
    assert.equal(listing.status, 200);
    const visible = (listing.body as { files: Array<{ path: string }> }).files.map((file) => file.path);
    assert.equal(visible.includes(relativePath), false);
    assert.equal(visible.some((file) => file.startsWith(".trash/")), false);

    const restore = buildThemesRegistrations(deps as ThemeToolDeps)
      .find((registration) => registration.descriptor.id === "theme_restore_trashed_file");
    assert.ok(restore);
    await restore.handler({
      executionId: "restore-ui-delete", principal: { id: "test-principal" }, run: { id: "run-1" },
      input: { themeId: "fixture", trashedPath: trashed[0] }, signal: new AbortController().signal,
    });
    assert.deepEqual(fs.readFileSync(path.join(themeDir, relativePath)), bytes);
    assert.equal(fs.existsSync(path.join(themeDir, trashed[0])), false);
    const restoredListing = await dispatchJsonRequest(app, "GET", BASE);
    assert.equal(restoredListing.status, 200);
    assert.ok((restoredListing.body as { files: Array<{ path: string }> }).files.some((file) => file.path === relativePath));
  });
}

test("Explore tree excludes existing trash while retaining ordinary files", async (t) => {
  const { app, themeDir } = fixture(t);
  fs.mkdirSync(path.join(themeDir, ".trash/123/pages"), { recursive: true });
  fs.writeFileSync(path.join(themeDir, ".trash/123/pages/about.html"), "trashed page");
  fs.writeFileSync(path.join(themeDir, "pages/about.html"), "live page");
  const response = await dispatchJsonRequest(app, "GET", BASE);
  assert.equal(response.status, 200);
  const visible = (response.body as { files: Array<{ path: string }> }).files.map((file) => file.path);
  assert.ok(visible.includes("pages/about.html"));
  assert.equal(visible.some((file) => file.startsWith(".trash/")), false);
});

test("Explore delete refuses compiled source when the theme has no writable trash, preserving its bytes", async (t) => {
  const { app, deps, themeDir, files } = fixture(t);
  const manifestPath = path.join(themeDir, "theme.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const artifacts = {
    "pages/index.html": '<!doctype html><html><head><link rel="stylesheet" href="../css/styles.css" /></head><body>Home</body></html>',
    "css/styles.css": "body { margin: 0; }",
    "tokens.json": "{}",
  };
  fs.mkdirSync(path.join(themeDir, "css"));
  for (const [file, content] of Object.entries(artifacts)) fs.writeFileSync(path.join(themeDir, file), content);
  manifest.build = {
    source: "compiled", sourceDir: "src",
    artifactHashes: Object.fromEntries(Object.entries(artifacts).map(([file, content]) => [file, createHash("sha256").update(content).digest("hex")])),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  fs.mkdirSync(path.join(themeDir, "src"));
  const bytes = Buffer.from("body { color: red; }\r\n");
  fs.writeFileSync(path.join(themeDir, "src/styles.css"), bytes);
  deps.themes.splice(0, deps.themes.length, ...discoverAllBuiltInThemes({ dir: deps.themesDir, source: "site" }));
  assert.equal(deps.themes[0].status, "valid", deps.themes[0].errors.join("; "));

  const response = await dispatchJsonRequest(app, "POST", `${BASE}/file/delete`, { path: "src/styles.css" });
  assert.deepEqual(response, {
    status: 403,
    body: {
      error: "'src/styles.css' cannot be trashed: this theme is a built release with no writable location outside build.sourceDir/theme.json to move a trashed file into",
      code: "GENERATED_READONLY",
    },
  });
  assert.deepEqual(fs.readFileSync(path.join(themeDir, "src/styles.css")), bytes);
  assert.equal(files().some((file) => file.startsWith(".trash/")), false);
});
