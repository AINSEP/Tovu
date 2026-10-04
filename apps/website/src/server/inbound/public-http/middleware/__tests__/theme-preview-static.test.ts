import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";

import { registerThemePreviewStatic } from "../theme-preview-static.js";

/**
 * @file Previously untested. Found while enumerating every path that serves a theme's raw files for
 * security pass 2026-08-13's Finding 1 (`ADS-memory/reports/security/2026-08-13-post-session-security-pass.md`):
 * this is a SECOND, independent `express.static` mount (distinct from `theme-static-assets.ts`), and it
 * was independently exposed to the identical `.svg`/`.html` script-execution risk — an admin can PUT
 * into a theme's `preview/…` via Explore (before this pass's fix, `isGeneratedThemePath` only excluded
 * that folder from the Explore file LIST, never from what PUT would accept).
 *
 * Proves `themeAssetSecurityHeaders` (shared with `theme-static-assets.ts` — one function, not two that
 * could drift apart) is actually wired into THIS mount too, not just its sibling.
 */

function withTempApp(fn: (baseUrl: string) => Promise<void>, themesStaticDir: string): Promise<void> {
  const app = express();
  registerThemePreviewStatic(app, { themesStaticDir });
  // Express's default finalhandler supplies its own CSP on 404 and overwrites the mount's CSP.
  // End fallthrough explicitly so these assertions measure the preview middleware's headers.
  app.use((_req, res) => { res.status(404).end(); });
  const server = createServer(app);
  return new Promise((resolve, reject) => {
    server.listen(0, async () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("expected a real listening address"));
        return;
      }
      const baseUrl = `http://127.0.0.1:${address.port}`;
      try {
        await fn(baseUrl);
        resolve();
      } catch (err) {
        reject(err as Error);
      } finally {
        server.close();
      }
    });
  });
}

test("registerThemePreviewStatic: a real preview build asset serves with the script-blocking CSP + nosniff headers, content unchanged", async (t) => {
  const themesStaticDir = mkdtempSync(path.join(tmpdir(), "theme-preview-static-"));
  t.after(() => rmSync(themesStaticDir, { recursive: true, force: true }));

  const previewDir = path.join(themesStaticDir, "sometheme", "preview");
  mkdirSync(path.join(previewDir, "light"), { recursive: true });
  writeFileSync(path.join(previewDir, "light", "styles.css"), "body{color:red}", "utf8");

  await withTempApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/theme-preview/sometheme/light/styles.css`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "body{color:red}", "bytes unchanged");

    const csp = res.headers.get("content-security-policy") ?? "";
    assert.equal(csp, "default-src 'none'; sandbox");
    assert.ok(!/\ballow-scripts\b/.test(csp));
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  }, themesStaticDir);
});

test("registerThemePreviewStatic: a preview build's font carries `Access-Control-Allow-Origin: *` without credentials; its CSS does not", async (t) => {
  const themesStaticDir = mkdtempSync(path.join(tmpdir(), "theme-preview-static-font-"));
  t.after(() => rmSync(themesStaticDir, { recursive: true, force: true }));

  const previewDir = path.join(themesStaticDir, "sometheme", "preview");
  mkdirSync(path.join(previewDir, "fonts"), { recursive: true });
  writeFileSync(path.join(previewDir, "fonts", "inter.woff2"), "wOF2-fixture", "utf8");
  writeFileSync(path.join(previewDir, "styles.css"), "body{}", "utf8");

  await withTempApp(async (baseUrl) => {
    const font = await fetch(`${baseUrl}/theme-preview/sometheme/fonts/inter.woff2`);
    assert.equal(font.status, 200);
    assert.equal(font.headers.get("content-security-policy"), "default-src 'none'; sandbox");
    assert.equal(font.headers.get("x-content-type-options"), "nosniff");
    assert.equal(font.headers.get("access-control-allow-origin"), "*");
    assert.equal(font.headers.get("access-control-allow-credentials"), null);

    const css = await fetch(`${baseUrl}/theme-preview/sometheme/styles.css`);
    assert.equal(css.status, 200);
    assert.equal(css.headers.get("content-security-policy"), "default-src 'none'; sandbox");
    assert.equal(css.headers.get("x-content-type-options"), "nosniff");
    assert.equal(css.headers.get("access-control-allow-origin"), null);
  }, themesStaticDir);
});

test("registerThemePreviewStatic: an .svg with an embedded <script> planted in a preview build is served non-executable (same headers, same class this whole fix closes)", async (t) => {
  const themesStaticDir = mkdtempSync(path.join(tmpdir(), "theme-preview-static-svg-"));
  t.after(() => rmSync(themesStaticDir, { recursive: true, force: true }));

  const previewDir = path.join(themesStaticDir, "sometheme", "preview");
  mkdirSync(path.join(previewDir, "dark"), { recursive: true });
  const payload = '<svg xmlns="http://www.w3.org/2000/svg"><script>document.title="pwned"</script></svg>';
  writeFileSync(path.join(previewDir, "dark", "evil.svg"), payload, "utf8");

  await withTempApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/theme-preview/sometheme/dark/evil.svg`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), payload, "content still served -- this is a serve-side defusal, not censorship");

    const csp = res.headers.get("content-security-policy") ?? "";
    assert.equal(csp, "default-src 'none'; sandbox");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  }, themesStaticDir);
});

test("registerThemePreviewStatic: an absent root and an unbuilt preview fall through to 404", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "theme-preview-missing-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "unbuilt"));
  for (const themesStaticDir of [path.join(root, "absent"), root]) {
    await withTempApp(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/theme-preview/unbuilt/dark/styles.css`);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get("content-security-policy"), null, "no preview mount was registered");
    }, themesStaticDir);
  }
});

test("registerThemePreviewStatic: missing assets and traversal within a registered mount retain security headers", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "theme-preview-traversal-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "sometheme", "preview"), { recursive: true });
  writeFileSync(path.join(root, "sometheme", "outside.txt"), "OUTSIDE-PREVIEW-SECRET");
  await withTempApp(async (baseUrl) => {
    for (const suffix of ["missing.svg", "%2e%2e%2foutside.txt"]) {
      const response = await fetch(`${baseUrl}/theme-preview/sometheme/${suffix}`);
      assert.equal(response.status, 404, suffix);
      assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; sandbox");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.doesNotMatch(await response.text(), /OUTSIDE-PREVIEW-SECRET/);
    }
    const missingTheme = await fetch(`${baseUrl}/theme-preview/unknown/styles.css`);
    assert.equal(missingTheme.status, 404);
    assert.equal(missingTheme.headers.get("content-security-policy"), null);
  }, root);
});
