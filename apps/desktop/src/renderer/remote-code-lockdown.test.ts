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
import { createHash } from "node:crypto";
import { parse, type DefaultTreeAdapterMap } from "parse5";
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

/** Use HTML's actual attribute parsing, including single quotes, unquoted values and entities. */
function htmlElements(html: string): DefaultTreeAdapterMap["element"][] {
  const elements: DefaultTreeAdapterMap["element"][] = [];
  function visit(node: DefaultTreeAdapterMap["node"]): void {
    if ("tagName" in node) elements.push(node);
    if ("childNodes" in node) for (const child of node.childNodes) visit(child);
  }
  visit(parse(html));
  return elements;
}

function scriptAndLinkUrls(html: string): string[] {
  return htmlElements(html).flatMap((node) => {
    const attribute = node.tagName === "script" ? "src" : node.tagName === "link" ? "href" : null;
    return attribute === null ? [] : node.attrs.filter((attr) => attr.name === attribute).map((attr) => attr.value);
  });
}

function remoteResourceUrls(html: string): string[] {
  return scriptAndLinkUrls(html).filter((url) => {
    const normalized = url.replace(/[\t\r\n]/g, "").trim();
    return /^(?:https?:)?\/\//i.test(normalized) || /^https?:$/i.test(new URL(normalized, "file:///renderer/index.html").protocol);
  });
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
    const remote = remoteResourceUrls(html);
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

test("every renderer HTML entry declares a CSP with script-src 'self' and no inline/eval exception", () => {
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    const meta = htmlElements(html).find((node) => node.tagName === "meta" && node.attrs.some(
      (attr) => attr.name === "http-equiv" && attr.value.toLowerCase() === "content-security-policy",
    ));
    assert.ok(meta, `${path.relative(rendererRoot, file)} must declare a Content-Security-Policy meta tag`);
    const csp = meta.attrs.find((attr) => attr.name === "content")?.value;
    assert.ok(csp, "the CSP meta must have content");
    const scriptSrc = requiredMatch(csp, /script-src\s+([^;]+)(?:;|$)/, "the CSP must declare a script-src directive").trim();
    assert.equal(scriptSrc, "'self'", "script-src must be exactly 'self' — any remote host or 'unsafe-inline'/'unsafe-eval' reopens the code-execution gap this CSP exists to close");
  }
});

test("the HTML scanner detects remote resources with any quoting and protocol-relative URLs", () => {
  const html = `<!-- <script src="https://comment.invalid/a.js"></script> -->
    <script src='https://cdn.invalid/single.js'></script>
    <script src=//cdn.invalid/unquoted.js></script>
    <link href="//cdn.invalid/style.css" rel="stylesheet">
    <script SRC="https&#58;//cdn.invalid/entity.js"></script>
    <script src="./local.js"></script>`;
  assert.deepEqual(remoteResourceUrls(html), [
    "https://cdn.invalid/single.js", "//cdn.invalid/unquoted.js", "//cdn.invalid/style.css", "https://cdn.invalid/entity.js",
  ]);
});

test("the vendored kuinetic files index.html points at actually exist on disk, at the version index.html's own comment claims", () => {
  const html = fs.readFileSync(path.join(rendererRoot, "index.html"), "utf8");
  assert.match(html, /public\/vendor\/kuinetic\//, "index.html's own comment should still name the vendor path, so a future bump is a deliberate, greppable edit");
  assert.match(html, /0\.1\.4/, "index.html's own comment should still name the vendored kuinetic version");

  // Pin the checked-in vendored baseline. A version bump must deliberately update these digests;
  // an empty, modified or different-version asset cannot inherit the unchanged HTML comment.
  const digests = {
    "kuinetic.css": "53be899acde5b69d0a712d3cfc18873b161828b7c20ac2cc39944c98cf9a6b00",
    "kuinetic.js": "7c82e8f7f1fd4e6f2327b6662b939e9460ceeda6815431fcc0237ca3dbda9f73",
    LICENSE: "a5e4bcb52054b20c50420fac17c98df885694d26c52e220e6a2ac92882595faf",
  };
  const referenced = scriptAndLinkUrls(html);
  for (const [name, digest] of Object.entries(digests)) {
    const rel = `public/vendor/kuinetic/${name}`;
    const full = path.join(rendererRoot, rel);
    assert.ok(fs.existsSync(full), `${rel} must exist — index.html references it by a local path with no remote fallback`);
    if (name !== "LICENSE") assert.ok(referenced.includes(`./vendor/kuinetic/${name}`), `${name} must be the asset index.html loads`);
    assert.equal(createHash("sha256").update(fs.readFileSync(full)).digest("hex"), digest, `${rel} must match its pinned vendored bytes`);
  }
});
