import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminThemeFileCopyRoute } from "../explore.js";
import type { ContentRouteDeps } from "../../content/deps.js";

/**
 * @file The copy-route branches `explore-built-theme-gate.test.ts` doesn't reach (it only covers the
 * ADR-020 §5 write-scope refusals and one collision-free copy): a source file that doesn't exist
 * (404 FILE_NOT_FOUND), and `nextAvailableFileName`'s collision LOOP running more than once (proving
 * the `while` re-checks rather than stopping after the first `-1` suffix).
 */

const WORKSPACE_ID = "ws-file-copy-branches";

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-file-copy-branches-"));
  const dir = path.join(root, "static", "plain");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "pages", "about.html"), "<html><body>about</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "pages", "about-1.html"), "<html><body>already taken</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
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
  registerAdminThemeFileCopyRoute(app, deps);
  return app;
}

const BASE = (themeId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${themeId}`;

test("copy of a source file that doesn't exist in the theme 404s FILE_NOT_FOUND", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("plain")}/file/copy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/nope.html" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FILE_NOT_FOUND");
});

test("copy when both 'name-1' and the base name already exist lands on 'name-2' -- the collision loop runs more than once", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("plain")}/file/copy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/about.html" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { path: string; copiedFrom: string };
  assert.equal(body.path, "pages/about-2.html", "about.html and about-1.html both already exist, so the next free suffix is -2");
  assert.equal(body.copiedFrom, "pages/about.html");
  assert.equal(fs.existsSync(path.join(themesDir, "static", "plain", "pages", "about-2.html")), true);
});

/** 1.2 MB of image bytes, past the 1 MB text-read limit: a PNG signature, then every byte value repeated. */
function largeImageBytes(): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, Buffer.alloc(1_200_000).map((_, i) => i % 256)]);
}

test("copying an image over 1 MB succeeds byte for byte -- the 1 MB text-read limit does not apply to copy", async (t) => {
  const themesDir = makeThemesRoot();
  const bytes = largeImageBytes();
  const dir = path.join(themesDir, "static", "plain", "assets");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "hero.png"), bytes);
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("plain")}/file/copy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "assets/hero.png" }),
  });
  const body = (await res.json()) as { path?: string; copiedFrom?: string };
  assert.equal(res.status, 200, `expected a large image copy to succeed, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.path, "assets/hero-1.png");
  assert.equal(body.copiedFrom, "assets/hero.png");
  assert.ok(fs.readFileSync(path.join(dir, "hero-1.png")).equals(bytes), "the copy must hold the source's exact bytes");
  assert.ok(fs.readFileSync(path.join(dir, "hero.png")).equals(bytes), "the source must be unchanged");
});

test("copy that fails for a reason OTHER than ThemePathError 500s via the route's generic catch branch", async (t) => {
  // Deny write permission on the theme's own folder (copyFileSync needs to CREATE the destination,
  // which needs write permission on the containing directory) so `copyThemeFile`'s `copyFileSync`
  // throws a raw EACCES, not a `ThemePathError`.
  const themesDir = makeThemesRoot();
  const dir = path.join(themesDir, "static", "plain", "pages");
  fs.chmodSync(dir, 0o555);
  t.after(() => fs.chmodSync(dir, 0o755));

  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE("plain")}/file/copy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "pages/about.html" }),
  });
  const body = (await res.json()) as { error?: string; code?: string };
  if (process.getuid && process.getuid() === 0) {
    t.skip("running as root: chmod 555 does not deny root a write, so EACCES cannot be forced here");
    return;
  }
  assert.equal(res.status, 500, `expected a permission-denied copy to 500, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.error, "internal error");
});
