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
    assert.ok(csp.includes("sandbox"), `expected a sandboxing CSP, got "${csp}"`);
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
    assert.equal(font.headers.get("access-control-allow-origin"), "*");
    assert.equal(font.headers.get("access-control-allow-credentials"), null);

    const css = await fetch(`${baseUrl}/theme-preview/sometheme/styles.css`);
    assert.equal(css.status, 200);
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
    assert.ok(csp.includes("sandbox"), `expected a sandboxing CSP, got "${csp}"`);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  }, themesStaticDir);
});
