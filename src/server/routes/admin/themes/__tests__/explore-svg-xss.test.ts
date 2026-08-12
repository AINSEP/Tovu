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
import { registerAdminThemeFileCopyRoute, registerAdminThemeFilePutRoute } from "../explore";
import type { ContentRouteDeps } from "../../content/deps";

/**
 * @file FIX VERIFICATION, security pass 2026-08-13 (ADS-memory/reports/security/2026-08-13-post-session-security-pass.md,
 * Finding 1 -- team-lead cleared this fix 2026-08-12).
 *
 * `d822d87` closed the `.svg`/`.html`/`.js` XSS write hole for a COMPILED theme's `build.sourceDir`
 * only. The general `isThemeFileWritable` gate every OTHER theme write falls back to still classifies
 * `.svg` "asset" and a root-level `.html` "partial" -- neither is in `READ_ONLY_GROUPS` -- so both
 * remain writable everywhere else, exactly as before `3d36d44`/`d822d87`. This file used to PROVE that
 * gap (a version of it is preserved in this file's git history, and reproduced by the assertions this
 * file no longer makes -- write succeeds, unescaped script comes back over HTTP).
 *
 * THE FIX chosen here is deliberately SERVE-side, not write-side: `.svg`/`.html` stay exactly as
 * writable as before (theme authoring, including real SVG/HTML assets, is unaffected -- verified below
 * by asserting the WRITE still succeeds and the CONTENT-TYPE served is unchanged). What changes is that
 * `registerThemeStaticAssets` (and its sibling mount, `registerThemePreviewStatic` -- see that file's
 * own test) now sends `X-Content-Type-Options: nosniff` and a `Content-Security-Policy: default-src
 * 'none'; sandbox` header on EVERY response, matching the exact pattern already proven in this codebase
 * at `media/original.ts` (verified against that file directly, not assumed). `sandbox` with no
 * `allow-scripts` token disables script execution (also forms/popups) for any document a browser would
 * construct FROM this response -- direct navigation, `<iframe>`, `<object>`/`<embed>` -- per the CSP
 * spec, regardless of how the response was reached. It does NOT affect `<img src>`/`<link
 * rel=stylesheet>`/`<script src>` SUB-RESOURCE fetches, because those never evaluate the fetched
 * resource's own response headers as a document context; only the REFERENCING page's CSP governs
 * execution there, and this change does not touch that page's headers at all. This is why the fix is
 * uniform across the WHOLE mount rather than an extension allowlist: it applies identically to
 * `.svg`, `.html`, `.js`, `.css`, `.liquid`, everything -- there is no branch to narrow and therefore
 * no way to repeat `d822d87`'s "narrowed one side of an OR" mistake.
 *
 * Options considered and rejected -- see the report's Finding 1 mitigation section for the full
 * reasoning: sanitizing content at write time (SVG sanitization is a long-running, evasion-prone
 * problem with no vetted library already in this codebase, and would need to also handle arbitrary
 * author HTML for the `.html`/"partial" case); serving theme assets from an isolated origin
 * (architecturally correct long-term, but needs new DNS/TLS/deployment infrastructure out of scope for
 * this pass); banning `.svg`/top-level `.html` from the write allowlist (explicitly rejected by the
 * team lead -- SVGs and HTML partials are legitimate theme assets, and this fix removes the actual risk
 * without removing the capability).
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
  registerAdminThemeFileCopyRoute(app, deps);
  // Same-origin static mount every real deployment runs (server/app.ts), wired here so the write and
  // the serve happen through the identical two code paths a real request would take.
  registerThemeStaticAssets(app, { themeRoots: [path.join(themesDir, "static")] });
  return app;
}

const BASE = (themeId: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/themes/${themeId}`;

/** Asserts the response is defused per this file's own header doc: `sandbox` CSP (no `allow-scripts`)
 * plus `nosniff`, both present on every response this mount serves. */
function assertScriptExecutionIsBlocked(headers: Headers): void {
  const csp = headers.get("content-security-policy") ?? "";
  assert.ok(csp.includes("sandbox"), `expected a sandboxing CSP directive, got "${csp}"`);
  assert.ok(!/\ballow-scripts\b/.test(csp), `sandbox must not carry allow-scripts, got "${csp}"`);
  assert.equal(headers.get("x-content-type-options"), "nosniff");
}

test("FIXED: an .svg with an embedded <script> is still writable (theme authoring unaffected) and still served as image/svg+xml (legitimate SVG rendering unaffected), but the response now carries a script-blocking CSP + nosniff so a direct navigation cannot execute it", async (t) => {
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

  // Write-side is DELIBERATELY unchanged -- SVGs stay writable everywhere. See this file's header for
  // why the fix is serve-side, not a write-time ban.
  assert.equal(put.status, 200, "theme authoring must be unaffected: .svg stays writable everywhere");
  assert.equal(fs.readFileSync(path.join(themesDir, "static", "authored", "assets", "evil.svg"), "utf8"), payload);

  const served = await fetch(`${baseUrl}/theme-assets/authored/assets/evil.svg`);
  assert.equal(served.status, 200);
  // Content-type is UNCHANGED -- a real SVG logo/icon used as <img src> keeps working exactly as
  // before. Only the CSP/nosniff pair (asserted below) removes the script-execution capability.
  const contentType = served.headers.get("content-type") ?? "";
  assert.ok(contentType.includes("svg"), `expected an svg content-type, got "${contentType}"`);
  const body = await served.text();
  assert.equal(body, payload, "bytes are unchanged -- the fix does not sanitize or alter content");

  assertScriptExecutionIsBlocked(served.headers);
});

test("FIXED: a root-level .html file with an embedded <script> is still writable and served as text/html, but with the same script-blocking headers", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const payload = '<!doctype html><html><body><script>document.title="XSS-PROOF-HTML"</script></body></html>';

  const put = await fetch(`${baseUrl}${BASE("authored")}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "custom.html", content: payload }),
  });

  assert.equal(put.status, 200, "theme authoring must be unaffected: top-level .html stays writable");
  assert.equal(fs.readFileSync(path.join(themesDir, "static", "authored", "custom.html"), "utf8"), payload);

  const served = await fetch(`${baseUrl}/theme-assets/authored/custom.html`);
  assert.equal(served.status, 200);
  const contentType = served.headers.get("content-type") ?? "";
  assert.ok(contentType.includes("html"), `expected an html content-type, got "${contentType}"`);
  const body = await served.text();
  assert.equal(body, payload, "bytes are unchanged -- the fix does not sanitize or alter content");

  assertScriptExecutionIsBlocked(served.headers);
});

test("FIXED: the header applies uniformly to the WHOLE mount, not an extension allowlist -- an ordinary .css asset is completely unaffected in content/type, and also carries the same defensive headers", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const served = await fetch(`${baseUrl}/theme-assets/authored/css/styles.css`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "text/css; charset=UTF-8");
  assert.equal(await served.text(), "body{}", "css bytes are byte-for-byte unchanged");

  // Proves the fix is a blanket mount-level policy, not a per-extension branch -- exactly what closes
  // the "narrowed one side of an OR" trap d822d87 fell into: there is no allowlist here to narrow.
  assertScriptExecutionIsBlocked(served.headers);
});

test("FIXED (defense in depth): a SECOND path found while enumerating this class -- PUT into preview/ (hidden from the Explore file list, but never actually refused at write time) is now refused, matching the list filter's own intent", async (t) => {
  const themesDir = makeThemesRoot();
  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  // `isGeneratedThemePath` (theme-files.ts) already excludes `preview/` from the Explore file LIST
  // (explore.ts:426) on the grounds that it is generated build output, never real source. Before this
  // fix, that exclusion was listing-only: PUT never checked it, so `preview/` was writable exactly
  // like any other "asset" location -- and, since it is ALSO served raw by BOTH
  // registerThemeStaticAssets (unscoped to any subpath) and registerThemePreviewStatic (mounted
  // directly on a theme's preview/ folder), an .svg planted there was a THIRD, previously-undocumented
  // instance of this same XSS class, independent of the ordinary-asset-folder one the other tests here
  // cover. The CSP/nosniff fix above already closes the SERVE-side risk for this path regardless (see
  // the mount-wide-policy test above); this test closes the WRITE-side inconsistency too, so the write
  // gate and the list filter agree with each other again.
  const put = await fetch(`${baseUrl}${BASE("authored")}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "preview/evil.svg", content: "<svg><script>1</script></svg>" }),
  });

  assert.equal(put.status, 403, "preview/ is generated output and must be refused at write time, not merely hidden from the file list");
  assert.equal(fs.existsSync(path.join(themesDir, "static", "authored", "preview", "evil.svg")), false);
});

test("FIXED (defense in depth, continuation agent, 2026-08-13): a THIRD path into preview/ found while re-verifying this fix -- COPY of an already-existing preview/ file is now refused too, not only a direct PUT", async (t) => {
  const themesDir = makeThemesRoot();
  // Seed a file inside preview/ the way build-preview.mjs actually would -- COPY only ever
  // duplicates BYTES ALREADY ON DISK (never attacker-supplied content; `copyThemeFile` is a plain
  // `copyFileSync`), so this is not itself an injection vector -- but `resolveAdminThemeFileCopyRoute`
  // used `resolveThemeFileWriteScope` (the ADR-020 compiled-tree/generated-readonly question) as its
  // ONLY write-scope gate, which has nothing to do with `isGeneratedThemePath`/`preview/` at all and
  // resolves "editable" for every non-compiled theme regardless of path. Unlike PUT and rename (both
  // fixed above), COPY never consulted `isGeneratedThemePath`, so `preview/`'s own "nobody
  // hand-mutates generated output" invariant was still violable through this one remaining route --
  // proven here BEFORE the fix (this test is RED against pre-fix explore.ts), closed alongside it.
  const previewDir = path.join(themesDir, "static", "authored", "preview", "dark");
  fs.mkdirSync(previewDir, { recursive: true });
  fs.writeFileSync(path.join(previewDir, "index.html"), "<html><body>real build-preview.mjs output</body></html>", "utf8");

  const app = buildTestApp(themesDir);
  const baseUrl = await startTestServer(app, t);

  const copy = await fetch(`${baseUrl}${BASE("authored")}/file/copy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "preview/dark/index.html" }),
  });

  assert.equal(copy.status, 409, "preview/ is generated output and must be refused as a copy SOURCE too, matching PUT and rename");
  assert.deepEqual(
    fs.readdirSync(previewDir).sort(),
    ["index.html"],
    "no duplicate may be created inside preview/ via copy",
  );
});
