import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { registerThemeStaticAssets } from "#src/server/middleware/theme-static-assets";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminThemeFilePutRoute } from "../explore";
import type { ContentRouteDeps } from "../../content/deps";

/**
 * @file PROVEN finding, security pass 2026-08-13 (ADS-memory/reports/security/2026-08-13-post-session-security-pass.md).
 *
 * `d822d87` closed the `.svg`/`.html`/`.js` XSS hole for a COMPILED theme's `build.sourceDir` by
 * splitting `isInsideCompiledSourceDir` into a disjoint rule that never falls back to the general
 * `isThemeFileWritable` gate. Its own commit message and `theme-static-assets.ts`'s header both say,
 * in so many words, that the general gate ITSELF still admits `.svg` with arbitrary content anywhere
 * else in ANY theme (authored or compiled, outside sourceDir) — because `fileGroup` classifies `.svg`
 * "asset", a group `READ_ONLY_GROUPS` has never covered, and `isThemeFileWritable` requires only
 * text-readable + not-read-only-group, with no notion of location. `explore-built-theme-gate.test.ts`'s
 * own test name for the sourceDir case ("even though those extensions ARE writable elsewhere in a
 * theme") already says this in the test suite.
 *
 * This test proves that comment true end-to-end over real HTTP: a `theme.set`-authorized write of an
 * `.svg` containing a `<script>` tag to an ORDINARY (non-sourceDir) location succeeds, and the SAME
 * static mount that serves every theme's assets (`registerThemeStaticAssets`, same-origin as
 * `/api/admin/*`) serves it back with an `image/svg+xml` content-type and the script byte-for-byte
 * unescaped — i.e. a direct navigation to that URL executes it. This is NOT gated on the sourceDir
 * carve-out at all: it reproduces for a theme with no `build` field (every theme on disk today).
 */

const WORKSPACE_ID = "ws-svg-xss";

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-svg-xss-"));
  const authored = path.join(root, "static", "authored");
  fs.mkdirSync(path.join(authored, "pages"), { recursive: true });
  fs.mkdirSync(path.join(authored, "css"), { recursive: true });
  fs.writeFileSync(path.join(authored, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(authored, "css", "styles.css"), "body{}", "utf8");
  fs.writeFileSync(path.join(authored, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(
    path.join(authored, "theme.json"),
    JSON.stringify({ id: "authored", name: "Authored", version: "1.0.0", tier: "static", engine: 1 })
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
  registerAdminThemeFilePutRoute(app, deps);
  // Same-origin static mount every real deployment runs (server/app.ts), wired here so the write and
  // the serve happen through the identical two code paths a real request would take.
  registerThemeStaticAssets(app, { themeRoots: [path.join(themesDir, "static")] });
  return app;
}

const BASE = (themeId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${themeId}`;

test("PROVEN: an .svg with an embedded <script>, written to an ordinary (non-sourceDir) theme location, is accepted by PUT and served as image/svg+xml with the script byte-for-byte unescaped", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const payload =
    '<svg xmlns="http://www.w3.org/2000/svg"><script>document.title="XSS-PROOF-2026-08-13"</script></svg>';

  const put = await fetch(`${baseUrl}${BASE("authored")}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "assets/evil.svg", content: payload }),
  });

  // If the write-time gate actually closed the .svg hole everywhere (not just sourceDir), this would
  // be 403 READ_ONLY_FILE, matching the sourceDir case in explore-built-theme-gate.test.ts. It is not.
  assert.equal(put.status, 200, "expected the general (non-sourceDir) write gate to accept .svg -- if this now fails, the class is closed and this test should be updated to assert the refusal instead");
  assert.equal(fs.readFileSync(path.join(themesDir, "static", "authored", "assets", "evil.svg"), "utf8"), payload);

  const served = await fetch(`${baseUrl}/theme-assets/authored/assets/evil.svg`);
  assert.equal(served.status, 200);
  const contentType = served.headers.get("content-type") ?? "";
  assert.ok(contentType.includes("svg"), `expected an svg content-type, got "${contentType}"`);
  const body = await served.text();
  assert.equal(body, payload, "the <script> must reach the client byte-for-byte unescaped -- this is what a direct navigation to this URL executes");
});

test("PROVEN: a root-level .html file with an embedded <script> is likewise accepted by PUT and served as text/html -- fileGroup classifies it 'partial', which is not in READ_ONLY_GROUPS either", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const payload = '<!doctype html><html><body><script>document.title="XSS-PROOF-HTML"</script></body></html>';

  const put = await fetch(`${baseUrl}${BASE("authored")}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "custom.html", content: payload }),
  });

  assert.equal(put.status, 200, "expected a root-level .html file to be accepted by the general write gate");
  assert.equal(fs.readFileSync(path.join(themesDir, "static", "authored", "custom.html"), "utf8"), payload);

  const served = await fetch(`${baseUrl}/theme-assets/authored/custom.html`);
  assert.equal(served.status, 200);
  const contentType = served.headers.get("content-type") ?? "";
  assert.ok(contentType.includes("html"), `expected an html content-type, got "${contentType}"`);
  const body = await served.text();
  assert.equal(body, payload, "the <script> must reach the client byte-for-byte unescaped");
});
