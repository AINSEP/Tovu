import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes, THEME_CATALOG_DIR } from "#src/features/theme/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminThemeDetailRoute, registerAdminThemeFileResetRoute } from "../explore.js";
import type { ContentRouteDeps } from "../../content/deps.js";

/**
 * @file The per-file reset's layout guard on the HTTP side. When a theme's saved original declares a
 * different layout version (`apiVersion`) than the live copy, every per-file reset is refused with
 * 409 `ORIGINAL_LAYOUT_MISMATCH`, and the detail listing reports every file `resettable: false`,
 * `modified: null`, so the admin never offers Reset.
 *
 * The live case is `basic` on 2026-09-14: a v2 live theme over a v1 original (`497c9d35` migrated the
 * live copy and never touched `__original-themes__`). Resetting its `theme.json` would write a
 * manifest with no `apiVersion`, and the theme would then load invalid.
 */

const WORKSPACE_ID = "ws-reset-layout-mismatch";
const BASE = (themeId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${themeId}`;
const MISMATCH_ERROR = "this theme's saved original does not match its current layout, so its files cannot be reset";

type FileEntry = { path: string; resettable: boolean; modified: boolean | null };

function write(dir: string, relativePath: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(dir, relativePath)), { recursive: true });
  fs.writeFileSync(path.join(dir, relativePath), content, "utf8");
}

function v1Manifest(id: string): string {
  return JSON.stringify({ id, name: id, version: "1.0.0", tier: "static", engine: 1 });
}

function v2Manifest(id: string, name: string = id): string {
  return JSON.stringify({ apiVersion: 2, id, name, version: "1.0.0", tier: "static", engine: 1 });
}

/** A v1 static theme: flat `pages/`, `css/styles.css`. */
function writeV1Theme(dir: string, manifest: string, ink: string): void {
  write(dir, "theme.json", manifest);
  write(dir, "tokens.json", JSON.stringify({ "--ink": ink }));
  write(dir, "pages/index.html", "<html><body>v1</body></html>");
  write(dir, "css/styles.css", "body{}");
}

/** A v2 static theme: nested `render/pages/`, `css/theme.css`. */
function writeV2Theme(dir: string, manifest: string, ink: string): void {
  write(dir, "theme.json", manifest);
  write(dir, "tokens.json", JSON.stringify({ "--ink": ink }));
  write(dir, "render/pages/index.html", "<html><body>v2</body></html>");
  write(dir, "css/theme.css", "body{}");
}

/**
 * - `drifted`: live v2, original v1, with different `theme.json` and `tokens.json` bytes on each side.
 * - `aligned`: live v2, original v2 under a different display `name`, so `theme.json` differs but
 *   resets normally.
 * - `unparseable`: live v1, original whose `theme.json` is not JSON, so its layout is unknown.
 */
function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-reset-layout-mismatch-"));
  const catalog = (id: string) => path.join(root, THEME_CATALOG_DIR, "static", id);
  const live = (id: string) => path.join(root, "static", id);

  writeV2Theme(live("drifted"), v2Manifest("drifted"), "#111");
  writeV1Theme(catalog("drifted"), v1Manifest("drifted"), "#000");

  writeV2Theme(live("aligned"), v2Manifest("aligned", "Aligned, renamed"), "#111");
  writeV2Theme(catalog("aligned"), v2Manifest("aligned"), "#000");

  writeV1Theme(live("unparseable"), v1Manifest("unparseable"), "#111");
  writeV1Theme(catalog("unparseable"), "{ not json", "#000");
  return root;
}

async function startApp(t: test.TestContext): Promise<{ baseUrl: string; themesDir: string }> {
  const themesDir = makeThemesRoot();
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "site" }),
    themesDir,
    postRepo: new InMemoryPostRepo(),
  } as unknown as ContentRouteDeps;
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminThemeDetailRoute(app, deps);
  registerAdminThemeFileResetRoute(app, deps);
  return { baseUrl: await startTestServer(app, t), themesDir };
}

async function postReset(
  baseUrl: string,
  themeId: string,
  filePath: string
): Promise<{ status: number; body: { error?: string; code?: string; wasModified?: boolean } }> {
  const res = await fetch(`${baseUrl}${BASE(themeId)}/file/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: filePath }),
  });
  return { status: res.status, body: (await res.json()) as { error?: string; code?: string; wasModified?: boolean } };
}

function readLive(themesDir: string, themeId: string, relativePath: string): string {
  return fs.readFileSync(path.join(themesDir, "static", themeId, relativePath), "utf8");
}

test("reset: theme.json on a v2 theme whose original is v1 is refused 409 ORIGINAL_LAYOUT_MISMATCH, and the live manifest keeps apiVersion 2", async (t) => {
  const { baseUrl, themesDir } = await startApp(t);
  const before = readLive(themesDir, "drifted", "theme.json");

  const { status, body } = await postReset(baseUrl, "drifted", "theme.json");

  assert.equal(status, 409, JSON.stringify(body));
  assert.deepEqual(body, { error: MISMATCH_ERROR, code: "ORIGINAL_LAYOUT_MISMATCH" });
  assert.equal(readLive(themesDir, "drifted", "theme.json"), before, "a refused reset must not touch disk");
  assert.equal((JSON.parse(readLive(themesDir, "drifted", "theme.json")) as { apiVersion?: number }).apiVersion, 2);
});

test("reset: every file of a layout-mismatched theme is refused, not only theme.json", async (t) => {
  const { baseUrl, themesDir } = await startApp(t);
  const before = readLive(themesDir, "drifted", "tokens.json");

  const { status, body } = await postReset(baseUrl, "drifted", "tokens.json");

  assert.equal(status, 409, JSON.stringify(body));
  assert.deepEqual(body, { error: MISMATCH_ERROR, code: "ORIGINAL_LAYOUT_MISMATCH" });
  assert.equal(readLive(themesDir, "drifted", "tokens.json"), before);
});

test("reset: an original whose theme.json cannot be parsed has an unknown layout, so reset is refused", async (t) => {
  const { baseUrl, themesDir } = await startApp(t);
  const before = readLive(themesDir, "unparseable", "tokens.json");

  const { status, body } = await postReset(baseUrl, "unparseable", "tokens.json");

  assert.equal(status, 409, JSON.stringify(body));
  assert.deepEqual(body, { error: MISMATCH_ERROR, code: "ORIGINAL_LAYOUT_MISMATCH" });
  assert.equal(readLive(themesDir, "unparseable", "tokens.json"), before);
});

test("detail listing: every file of a layout-mismatched theme is resettable: false, modified: null", async (t) => {
  const { baseUrl } = await startApp(t);
  const res = await fetch(`${baseUrl}${BASE("drifted")}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { hasOriginal: boolean; files: FileEntry[] };

  assert.ok(body.files.some((f) => f.path === "theme.json"), "theme.json must be listed");
  for (const file of body.files) {
    assert.deepEqual({ resettable: file.resettable, modified: file.modified }, { resettable: false, modified: null }, file.path);
  }
  // `hasOriginal` still reports that the catalog folder exists; only per-file reset is withdrawn.
  assert.equal(body.hasOriginal, true);
});

test("reset and listing: an original with the same layout as the live theme still resets theme.json", async (t) => {
  const { baseUrl, themesDir } = await startApp(t);
  const res = await fetch(`${baseUrl}${BASE("aligned")}`);
  assert.equal(res.status, 200);
  const listed = ((await res.json()) as { files: FileEntry[] }).files.find((f) => f.path === "theme.json");
  assert.deepEqual({ resettable: listed?.resettable, modified: listed?.modified }, { resettable: true, modified: true });

  const { status, body } = await postReset(baseUrl, "aligned", "theme.json");

  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.wasModified, true);
  assert.equal(readLive(themesDir, "aligned", "theme.json"), v2Manifest("aligned"));
});
