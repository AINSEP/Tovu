import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminThemeFileDeleteRoute } from "../explore.js";
import type { ContentRouteDeps } from "../../content/deps.js";

/**
 * @file Branch coverage for `registerAdminThemeFileDeleteRoute` (2026-08-29, owner ask — the ⋮ menu's
 * third action alongside Copy/Rename). Mirrors `explore-file-rename-route-branches.test.ts`'s own
 * shape closely: delete shares its eligibility gate (`validateFileIdentityChange`,
 * `isFileIdentityChangeAllowed`) with rename almost entirely — the same `REQUIRED_THEME_FILES` hard
 * lock, the same `IDENTITY_LOCKED_GROUPS` (`script`/`other`) refusal, and the same ADR-020 §5
 * compiled-tree/sourceDir split — so this file exercises that shared gate through the DELETE route
 * specifically, plus the two branches delete alone has (no destination, so no `NAME_TAKEN`/no-op/
 * extension-change shapes; but its own `FILE_NOT_FOUND` and generic-catch-500 branches, same as every
 * other mutating route in `explore.ts`).
 */

const WORKSPACE_ID = "ws-file-delete-branches";

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-file-delete-branches-"));
  const dir = path.join(root, "static", "plain");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "pages", "about.html"), "<html><body>about</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "main.js"), "console.log('x')", "utf8");
  fs.writeFileSync(path.join(dir, "NOTICE.md"), "# notice", "utf8");
  fs.writeFileSync(path.join(dir, "logo.svg"), "<svg></svg>", "utf8");
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "static", engine: 1 })
  );
  return root;
}

function makeCompiledThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-file-delete-compiled-"));
  const dir = path.join(root, "static", "compiled");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "pages", "about.html"), "<html><body>about</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "src", "Header.tsx"), "source", "utf8");
  fs.writeFileSync(path.join(dir, "src", "helper.js"), "console.log('helper')", "utf8");
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
  registerAdminThemeFileDeleteRoute(app, deps);
  return app;
}

const BASE = (themeId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${themeId}`;

async function del(baseUrl: string, themeId: string, targetPath: string) {
  return fetch(`${baseUrl}${BASE(themeId)}/file/delete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: targetPath }),
  });
}

for (const required of ["pages/index.html", "theme.json", "tokens.json"]) {
  test(`deleting REQUIRED_THEME_FILES entry '${required}' is hard-blocked 409 REQUIRED_FILE_LOCKED`, async (t) => {
    const themesDir = makeThemesRoot();
    const app = buildTestApp(themesDir);
    const baseUrl = await startTestServer(app, t);

    const res = await del(baseUrl, "plain", required);
    assert.equal(res.status, 409);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, "REQUIRED_FILE_LOCKED");
    assert.equal(fs.existsSync(path.join(themesDir, "static", "plain", required)), true);
  });
}

test("deleting a script-group (.js) file on an ORDINARY (non-compiled) theme is refused 409 via IDENTITY_LOCKED_GROUPS -- content became editable 2026-08-29, identity did not", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const target = path.join(themesDir, "static", "plain", "main.js");

  const res = await del(baseUrl, "plain", "main.js");
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "READ_ONLY_FILE");
  assert.equal(fs.existsSync(target), true, "the refused delete must leave the file in place");
});

test("deleting an 'other'-group file is refused 409 via IDENTITY_LOCKED_GROUPS the same way", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const target = path.join(themesDir, "static", "plain", "NOTICE.md");

  const res = await del(baseUrl, "plain", "NOTICE.md");
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "READ_ONLY_FILE");
  assert.equal(fs.existsSync(target), true);
});

test("deleting an ordinary page succeeds and removes it from disk", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const target = path.join(themesDir, "static", "plain", "pages", "about.html");

  const res = await del(baseUrl, "plain", "pages/about.html");
  const body = (await res.json()) as { path?: string; deleted?: boolean; error?: string };
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.path, "pages/about.html");
  assert.equal(body.deleted, true);
  assert.equal(fs.existsSync(target), false);
});

test("deleting an asset (not a read-only-identity group) succeeds", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const target = path.join(themesDir, "static", "plain", "logo.svg");

  const res = await del(baseUrl, "plain", "logo.svg");
  assert.equal(res.status, 200);
  assert.equal(fs.existsSync(target), false);
});

test("deleting a source file that doesn't exist in the theme 404s FILE_NOT_FOUND", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await del(baseUrl, "plain", "pages/nope.html");
  assert.equal(res.status, 404);
  assert.equal(((await res.json()) as { code: string }).code, "FILE_NOT_FOUND");
});

test("delete of a file inside a built theme's generated tree is refused 409 GENERATED_READONLY", async (t) => {
  // `pages/about.html`, not `pages/index.html` -- the index page is ALSO a REQUIRED_THEME_FILES
  // entry, so it would hit that hard-block first and never reach the GENERATED_READONLY branch this
  // test means to exercise (`validateFileIdentityChange` checks required-file status before
  // writeScope). An ordinary, non-required generated page isolates the branch actually under test.
  const themesDir = makeCompiledThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const target = path.join(themesDir, "static", "compiled", "pages", "about.html");

  const res = await del(baseUrl, "compiled", "pages/about.html");
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "GENERATED_READONLY");
  assert.equal(fs.existsSync(target), true);
});

test("delete of a file inside a built theme's sourceDir with an allowed extension succeeds -- isFileIdentityChangeAllowed's isSourceDirWritableExtension branch", async (t) => {
  const themesDir = makeCompiledThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const target = path.join(themesDir, "static", "compiled", "src", "Header.tsx");

  const res = await del(baseUrl, "compiled", "src/Header.tsx");
  assert.equal(res.status, 200, await res.text());
  assert.equal(fs.existsSync(target), false);
});

test("delete of a .js file inside a built theme's sourceDir is STILL refused -- SOURCE_DIR_WRITABLE_EXTENSIONS excludes .js regardless of IDENTITY_LOCKED_GROUPS", async (t) => {
  const themesDir = makeCompiledThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const target = path.join(themesDir, "static", "compiled", "src", "helper.js");

  const res = await del(baseUrl, "compiled", "src/helper.js");
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "READ_ONLY_FILE");
  assert.equal(fs.existsSync(target), true);
});

test("delete that fails for a reason OTHER than ThemePathError 500s via the route's generic catch branch", async (t) => {
  const themesDir = makeThemesRoot();
  const dir = path.join(themesDir, "static", "plain", "pages");
  fs.chmodSync(dir, 0o555);
  t.after(() => fs.chmodSync(dir, 0o755));

  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await del(baseUrl, "plain", "pages/about.html");
  const body = (await res.json()) as { error?: string; code?: string };
  if (process.getuid && process.getuid() === 0) {
    t.skip("running as root: chmod 555 does not deny root a write, so EACCES cannot be forced here");
    return;
  }
  assert.equal(res.status, 500, `expected a permission-denied delete to 500, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.error, "internal error");
});
