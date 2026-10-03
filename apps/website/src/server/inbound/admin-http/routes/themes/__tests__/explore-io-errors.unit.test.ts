import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import { discoverAllBuiltInThemes, THEME_CATALOG_DIR } from "#src/features/theme/index";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import type { ContentRouteDeps } from "../../content/deps.js";
import {
  registerAdminThemeDetailRoute,
  registerAdminThemeFileDeleteRoute,
  registerAdminThemeFileGetRoute,
  registerAdminThemeFileRenameRoute,
  registerAdminThemeFileResetRoute,
} from "../explore.js";

/** n09: fault injection must reach real file I/O and preserve the live theme on failure. */
const scenarios = [
  { name: "directory listing", operation: "readdirSync", suffix: "" },
  { name: "file deletion", operation: "rmSync", suffix: "/file/delete" },
  { name: "file rename", operation: "renameSync", suffix: "/file/rename" },
  { name: "live-file read stat", operation: "statSync", suffix: "/file?path=pages/about.html" },
  { name: "original-file reset stat", operation: "statSync", suffix: "/file/reset", original: true },
  { name: "file deletion stat", operation: "statSync", suffix: "/file/delete" },
  { name: "file rename stat", operation: "statSync", suffix: "/file/rename" },
  { name: "live-file detail stat", operation: "statSync", suffix: "" },
  { name: "original-file detail stat", operation: "statSync", suffix: "", original: true },
  { name: "live-file detail byte read", operation: "openSync", suffix: "" },
  { name: "original-file detail byte read", operation: "openSync", suffix: "", original: true },
] as const;

for (const scenario of scenarios) {
  test(`explore returns 500 for ${scenario.name} EIO and leaves theme files unchanged`, async (t) => {
    const { operation, suffix } = scenario;
    // Canonicalize the root: macOS's /var alias otherwise misses the product's /private/var I/O.
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-explore-io-")));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const themeDir = path.join(root, "static", "fixture");
    fs.mkdirSync(path.join(themeDir, "pages"), { recursive: true });
    fs.writeFileSync(path.join(themeDir, "theme.json"), JSON.stringify({
      id: "fixture", name: "Fixture", version: "1.0.0", tier: "static", engine: 1,
    }));
    fs.writeFileSync(path.join(themeDir, "tokens.json"), "{}");
    fs.writeFileSync(path.join(themeDir, "pages", "index.html"), "<h1>Home</h1>");
    const target = path.join(themeDir, "pages", "about.html");
    fs.writeFileSync(target, "<h1>About</h1>");
    const catalogDir = path.join(root, THEME_CATALOG_DIR, "static", "fixture");
    fs.cpSync(themeDir, catalogDir, { recursive: true });
    const deps = {
      workspaceId: "ws-io",
      authorize: async () => ({ allowed: true, reason: "matched" }),
      postRepo: { list: async () => [] },
      themes: discoverAllBuiltInThemes({ dir: root, source: "site" }),
      themesDir: root,
    } as unknown as ContentRouteDeps;
    const app = express();
    app.use((_req, res, next) => { res.locals.principal = { id: "test-principal" }; next(); });
    registerAdminThemeDetailRoute(app, deps);
    registerAdminThemeFileDeleteRoute(app, deps);
    registerAdminThemeFileRenameRoute(app, deps);
    registerAdminThemeFileGetRoute(app, deps);
    registerAdminThemeFileResetRoute(app, deps);
    const fault = Object.assign(new Error("injected I/O failure"), { code: "EIO" });
    const original = fs[operation] as (...args: unknown[]) => unknown;
    let faultReached = false;
    const injected = t.mock.method(fs, operation, (...args: unknown[]) => {
      const faultTarget = "original" in scenario ? path.join(catalogDir, "pages", "about.html") : target;
      if (String(args[0]) === (operation === "readdirSync" ? themeDir : faultTarget)) {
        faultReached = true;
        throw fault;
      }
      return original(...args);
    });
    syncBuiltinESMExports();
    try {
      const base = "/api/admin/v1/workspaces/ws-io/themes/fixture";
      const method = suffix === "" || suffix.startsWith("/file?") ? "GET" : "POST";
      const result = await dispatchJsonRequest(app, method, base + suffix, { path: "pages/about.html", name: "renamed.html" });
      assert.equal(faultReached, true, "the injected failure must reach the filesystem operation");
      assert.deepEqual(result, { status: 500, body: { error: "internal error" } });
    } finally {
      injected.mock.restore();
      syncBuiltinESMExports();
    }
    assert.equal(fs.readFileSync(target, "utf8"), "<h1>About</h1>");
    assert.equal(fs.existsSync(path.join(themeDir, "pages", "renamed.html")), false);
  });
}
