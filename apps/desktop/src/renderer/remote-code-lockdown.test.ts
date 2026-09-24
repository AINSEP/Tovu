/**
 * @file Guards against the renderer HTML loading third-party code from a remote origin again.
 *
 * `index.html` used to load kUInetic straight from `cdn.jsdelivr.net`, with no Subresource
 * Integrity, into a window that runs with `sandbox: false` and exposes the privileged
 * `window.tovuRunner` bridge (`openSitesHomeWindow` in `main.ts`). A compromised CDN or a
 * compromised `kuinetic` publish on the registry would have been silent code execution with that
 * bridge on the very next launch — nothing in this repo would have changed. The fix vendors the
 * exact pinned bytes into `public/vendor/kuinetic/` and adds a `script-src 'self'` CSP so a remote
 * `<script>` can never come back without failing this file first.
 *
 * Every renderer `*.html` is scanned (`**\/*.html`, not just `index.html` by name), so a future
 * second HTML entry point is covered automatically instead of silently falling outside scope.
 *
 * Source text, for the reason every other `*-wiring.test.ts` / `*-lockdown.test.ts` in this
 * directory states at length: this package's test script runs this file itself under
 * `node --import tsx --test`, which transpiles but supplies no DOM/browser runtime — there is no
 * live page to load, only the HTML source to scan.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererRoot = __dirname;

/** Every `*.html` under `src/renderer/`, recursively — `public/` included, since a stray copy
 *  left there would ship into `dist/renderer/` just as easily as one in the source tree proper. */
function findRendererHtmlFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findRendererHtmlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      found.push(full);
    }
  }
  return found;
}

/** `src="..."` / `href="..."` attribute values pulled from `<script>` and `<link>` tags only —
 *  the two tag types that fetch and can execute or style-inject remote content. Deliberately
 *  simple (no full HTML parse): this repo's renderer HTML is hand-authored and small, and a
 *  regex over raw source is exactly what a Vite/browser HTML parser will also see literally. */
function scriptAndLinkUrls(html: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*"([^"]*)"/gi)) {
    const url = match[1];
    if (url !== undefined) urls.push(url);
  }
  return urls;
}

/** Pulls a required capture group out of a regex match, failing the test immediately (rather than
 *  a confusing "possibly undefined" downstream) when the pattern itself did not match. */
function requiredMatch(source: string, pattern: RegExp, message: string): string {
  const match = source.match(pattern);
  assert.ok(match, message);
  const group = match[1];
  assert.ok(group !== undefined, message);
  return group;
}

const htmlFiles = findRendererHtmlFiles(rendererRoot);

test("at least one renderer HTML file exists to scan (a vacuous glob would pass every assertion below for free)", () => {
  assert.ok(htmlFiles.length > 0, "expected to find src/renderer/index.html or another renderer *.html file");
});

test("no renderer HTML file references a remote (http/https) <script> or <link> URL", () => {
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    const remote = scriptAndLinkUrls(html).filter((url) => /^https?:\/\//i.test(url));
    assert.deepEqual(
      remote,
      [],
      `${path.relative(rendererRoot, file)} must not load a script or stylesheet from a remote origin — vendor it into public/vendor/ instead. Found: ${remote.join(", ")}`,
    );
  }
});

test("index.html declares a Content-Security-Policy meta tag with script-src 'self' and no inline/eval exception", () => {
  const html = fs.readFileSync(path.join(rendererRoot, "index.html"), "utf8");
  const csp = requiredMatch(
    html,
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i,
    "index.html must declare a Content-Security-Policy meta tag",
  );
  const scriptSrc = requiredMatch(csp, /script-src\s+([^;]+);/, "the CSP must declare a script-src directive").trim();
  assert.equal(scriptSrc, "'self'", "script-src must be exactly 'self' — any remote host or 'unsafe-inline'/'unsafe-eval' reopens the code-execution gap this CSP exists to close");
});

test("the vendored kuinetic files index.html points at actually exist on disk, at the version index.html's own comment claims", () => {
  const html = fs.readFileSync(path.join(rendererRoot, "index.html"), "utf8");
  assert.match(html, /public\/vendor\/kuinetic\//, "index.html's own comment should still name the vendor path, so a future bump is a deliberate, greppable edit");
  assert.match(html, /0\.1\.4/, "index.html's own comment should still name the vendored kuinetic version");

  for (const rel of ["public/vendor/kuinetic/kuinetic.css", "public/vendor/kuinetic/kuinetic.js", "public/vendor/kuinetic/LICENSE"]) {
    const full = path.join(rendererRoot, rel);
    assert.ok(fs.existsSync(full), `${rel} must exist — index.html references it by a local path with no remote fallback`);
  }
});
