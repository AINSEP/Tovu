import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminThemeFileRenameRoute } from "../explore.js";
import type { ContentRouteDeps } from "../../content/deps.js";

/**
 * @file Rename-route branches not already covered by `explore-built-theme-gate.test.ts` (ADR-020 §5
 * sourceDir/generated-tree gating and the extension-change refusal): the `REQUIRED_THEME_FILES` hard
 * lock, `sourceRenamable`'s non-compiled `READ_ONLY_GROUPS` refusal, the four `INVALID_NAME` shapes,
 * source-not-found, the same-name no-op (skipping the whole destination-checking block), and
 * dest-already-exists (`NAME_TAKEN`).
 *
 * NOT attempted here: the destination's own `GENERATED_READONLY` re-check
 * (`registerAdminThemeFileRenameRoute`'s own comment calls it "defense in depth, not currently
 * reachable through this route" -- `destPath` is always built from `sourcePath`'s own directory since
 * `name` may not contain `/`, so its write-scope is provably identical to `sourcePath`'s
 * already-checked one; there is no way to make `sourcePath` pass `sourceRenamable` while `destPath`
 * resolves to a DIFFERENT, generated-readonly scope through this HTTP surface, exactly as the source
 * comment states). See the report for this file's own header for the fuller note.
 */

const WORKSPACE_ID = "ws-file-rename-branches";

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-file-rename-branches-"));
  const dir = path.join(root, "static", "plain");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "pages", "about.html"), "<html><body>about</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "pages", "taken.html"), "<html><body>taken</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "main.js"), "console.log('x')", "utf8");
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "static", engine: 1 })
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
  registerAdminThemeFileRenameRoute(app, deps);
  return app;
}

const BASE = (themeId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${themeId}`;

async function rename(baseUrl: string, themeId: string, sourcePath: string, name: string) {
  return fetch(`${baseUrl}${BASE(themeId)}/file/rename`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: sourcePath, name }),
  });
}

for (const required of ["pages/index.html", "theme.json", "tokens.json"]) {
  test(`renaming REQUIRED_THEME_FILES entry '${required}' is hard-blocked 409 REQUIRED_FILE_LOCKED`, async (t) => {
    const themesDir = makeThemesRoot();
    const app = buildTestApp(themesDir);
    const baseUrl = await startTestServer(app, t);

    const res = await rename(baseUrl, "plain", required, "renamed.html");
    assert.equal(res.status, 409);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, "REQUIRED_FILE_LOCKED");
  });
}

test("renaming a script-group (.js) file on an ORDINARY (non-compiled) theme is refused 409 via READ_ONLY_GROUPS, not the sourceDir rule", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const target = path.join(themesDir, "static", "plain", "main.js");

  const res = await rename(baseUrl, "plain", "main.js", "renamed.js");
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "READ_ONLY_FILE");
  assert.equal(fs.existsSync(target), true, "the refused rename must leave the original file in place");
});

test("empty name 400s INVALID_NAME", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await rename(baseUrl, "plain", "pages/about.html", "");
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "INVALID_NAME");
});

test("a name containing '/' is a path, not a filename -- 400 INVALID_NAME", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const res = await rename(baseUrl, "plain", "pages/about.html", "sub/dir.html");
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { code: string }).code, "INVALID_NAME");
});

test("a name containing '\\\\' is refused the same way -- 400 INVALID_NAME", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const res = await rename(baseUrl, "plain", "pages/about.html", "sub\\dir.html");
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { code: string }).code, "INVALID_NAME");
});

test("a name of exactly '.' is refused -- 400 INVALID_NAME", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const res = await rename(baseUrl, "plain", "pages/about.html", ".");
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { code: string }).code, "INVALID_NAME");
});

test("a name of exactly '..' is refused -- 400 INVALID_NAME", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const res = await rename(baseUrl, "plain", "pages/about.html", "..");
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { code: string }).code, "INVALID_NAME");
});

test("renaming a source file that doesn't exist in the theme 404s FILE_NOT_FOUND", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const res = await rename(baseUrl, "plain", "pages/nope.html", "renamed.html");
  assert.equal(res.status, 404);
  assert.equal(((await res.json()) as { code: string }).code, "FILE_NOT_FOUND");
});

test("renaming a file to the SAME name it already has is a no-op (200), skipping the whole destination-checking block", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);
  const target = path.join(themesDir, "static", "plain", "pages", "about.html");
  const before = fs.readFileSync(target, "utf8");

  const res = await rename(baseUrl, "plain", "pages/about.html", "about.html");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { path: string; renamedFrom: string };
  assert.equal(body.path, "pages/about.html");
  assert.equal(body.renamedFrom, "pages/about.html");
  assert.equal(fs.readFileSync(target, "utf8"), before, "content must be untouched by a no-op rename");
});

test("renaming to a name that already exists in the theme 409s NAME_TAKEN", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await rename(baseUrl, "plain", "pages/about.html", "taken.html");
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "NAME_TAKEN");
  assert.equal(fs.existsSync(path.join(themesDir, "static", "plain", "pages", "about.html")), true);
});

test("an ordinary same-extension rename succeeds end to end (sanity check the success path this file's branches surround)", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await rename(baseUrl, "plain", "pages/about.html", "renamed-about.html");
  assert.equal(res.status, 200);
  assert.equal(fs.existsSync(path.join(themesDir, "static", "plain", "pages", "renamed-about.html")), true);
  assert.equal(fs.existsSync(path.join(themesDir, "static", "plain", "pages", "about.html")), false);
});

test("renaming a file over the theme-file size ceiling 400s ThemePathError via the route's own catch, not 409/500", async (t) => {
  // `renameThemeFile` -> `resolveCopyOrRenameTargets` checks the same `MAX_THEME_FILE_BYTES` ceiling
  // as copy, thrown as `ThemePathError` -- the one realistic way to reach rename's own
  // `catch (err) { sendThemeFileError(res, err) }` 400 branch (every other refusal in this file's
  // tests is a deliberate 400/404/409 BEFORE `renameThemeFile` is ever called).
  const themesDir = makeThemesRoot();
  fs.writeFileSync(path.join(themesDir, "static", "plain", "pages", "huge.html"), "x".repeat(1_000_001), "utf8");
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await rename(baseUrl, "plain", "pages/huge.html", "still-huge.html");
  const body = (await res.json()) as { code?: string };
  assert.equal(res.status, 400, `expected an oversized rename to 400, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.code, "INVALID_THEME_PATH");
  assert.equal(fs.existsSync(path.join(themesDir, "static", "plain", "pages", "still-huge.html")), false);
});

test("rename that fails for a reason OTHER than ThemePathError 500s via the route's generic catch branch", async (t) => {
  // Deny write permission on the containing folder so `renameThemeFile`'s `renameSync` throws a raw
  // EACCES, not a `ThemePathError`.
  const themesDir = makeThemesRoot();
  const dir = path.join(themesDir, "static", "plain", "pages");
  fs.chmodSync(dir, 0o555);
  t.after(() => fs.chmodSync(dir, 0o755));

  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await rename(baseUrl, "plain", "pages/about.html", "renamed-about.html");
  const body = (await res.json()) as { error?: string; code?: string };
  if (process.getuid && process.getuid() === 0) {
    t.skip("running as root: chmod 555 does not deny root a write, so EACCES cannot be forced here");
    return;
  }
  assert.equal(res.status, 500, `expected a permission-denied rename to 500, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.error, "internal error");
});
