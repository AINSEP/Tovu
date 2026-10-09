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
import { registerAdminThemeDetailRoute, registerAdminThemeFileResetRoute, registerAdminThemeSaveOriginalRoute } from "../explore.js";
import type { ContentRouteDeps } from "../../content/deps.js";

/**
 * @file `POST .../themes/:themeId/original` — Explore's "Save as original" (owner 2026-10-08): a theme
 * with no stored original gets its CURRENT files written to the hidden catalog
 * (`<themes>/__original-themes__/<tier>/<id>`, where seeded themes keep theirs), so the banner goes away
 * and Reset restores any single file from it. Never a visible theme; never overwrites an existing one.
 */

const WORKSPACE_ID = "ws-save-original";
const MANIFEST = (id: string) => JSON.stringify({ id, name: `${id} theme`, version: "1.0.0", tier: "static", engine: 1 });

function write(dir: string, relativePath: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(dir, relativePath)), { recursive: true });
  fs.writeFileSync(path.join(dir, relativePath), content);
}

/** `rose` has no original and an edited home page; `kept` already has one. */
function makeThemesRoot(t: test.TestContext): string {
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-save-original-"));
  t.after(() => fs.rmSync(themesDir, { recursive: true, force: true }));
  for (const id of ["rose", "kept"]) {
    const live = path.join(themesDir, "static", id);
    write(live, "theme.json", MANIFEST(id));
    write(live, "tokens.json", "{}");
    write(live, "pages/index.html", `<html><body>${id} as edited</body></html>`);
  }
  const keptOriginal = path.join(themesDir, THEME_CATALOG_DIR, "static", "kept");
  write(keptOriginal, "theme.json", MANIFEST("kept"));
  write(keptOriginal, "tokens.json", "{}");
  write(keptOriginal, "pages/index.html", "<html><body>kept as shipped</body></html>");
  return themesDir;
}

async function startApp(t: test.TestContext): Promise<{ baseUrl: string; themesDir: string }> {
  const themesDir = makeThemesRoot(t);
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
  registerAdminThemeSaveOriginalRoute(app, deps);
  return { baseUrl: await startTestServer(app, t), themesDir };
}

function themeUrl(baseUrl: string, themeId: string): string {
  return `${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${themeId}`;
}

async function post(url: string, body: unknown = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function hasOriginal(baseUrl: string, themeId: string): Promise<unknown> {
  const res = await fetch(themeUrl(baseUrl, themeId));
  return ((await res.json()) as { hasOriginal?: unknown }).hasOriginal;
}

test("saves the theme's current files as its hidden original; the theme then has one and Reset restores from it", async (t) => {
  const { baseUrl, themesDir } = await startApp(t);
  assert.equal(await hasOriginal(baseUrl, "rose"), false);

  const saved = await post(`${themeUrl(baseUrl, "rose")}/original`);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body, { themeId: "rose", saved: true });

  const originalDir = path.join(themesDir, THEME_CATALOG_DIR, "static", "rose");
  assert.equal(fs.readFileSync(path.join(originalDir, "pages", "index.html"), "utf8"), "<html><body>rose as edited</body></html>");
  assert.equal(await hasOriginal(baseUrl, "rose"), true);
  assert.equal(fs.readdirSync(path.join(themesDir, "static")).sort().join(","), "kept,rose", "no visible theme was created");

  const live = path.join(themesDir, "static", "rose", "pages", "index.html");
  fs.writeFileSync(live, "<html><body>broken later</body></html>");
  const reset = await post(`${themeUrl(baseUrl, "rose")}/file/reset`, { path: "pages/index.html" });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.equal(fs.readFileSync(live, "utf8"), "<html><body>rose as edited</body></html>");
});

test("refuses (409 ORIGINAL_EXISTS) a theme that already has a stored original, leaving it untouched", async (t) => {
  const { baseUrl, themesDir } = await startApp(t);

  const refused = await post(`${themeUrl(baseUrl, "kept")}/original`);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, "ORIGINAL_EXISTS");
  assert.equal(
    fs.readFileSync(path.join(themesDir, THEME_CATALOG_DIR, "static", "kept", "pages", "index.html"), "utf8"),
    "<html><body>kept as shipped</body></html>"
  );
});

test("an unknown theme id answers 404 and writes nothing", async (t) => {
  const { baseUrl, themesDir } = await startApp(t);
  const res = await post(`${themeUrl(baseUrl, "missing")}/original`);
  assert.equal(res.status, 404);
  assert.equal(fs.existsSync(path.join(themesDir, THEME_CATALOG_DIR, "static", "missing")), false);
});
