import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import express from "express";
import type { ErrorRequestHandler, RequestHandler } from "express";

import { registerThemeStaticAssets } from "../../theme-static-assets.js";

/**
 * @file Pins every branch of `registerThemeStaticAssets`' request handler that the public-asset suite
 * (`theme-static-assets.integration.test.ts`) does not: the `/theme-preview-assets/:revision/:themeId`
 * mount's cache headers, which revision is trusted, which requests get their CSS rewritten, and where
 * each refusal or failure falls through to (the next theme folder, the next middleware, or the error
 * handler). Driven over real HTTP through a real Express app so status codes, headers and bodies are
 * exactly what a browser sees.
 */

const SECURITY_CSP = "default-src 'none'; sandbox";

/** A CSS file covering every reference shape the preview rewrite treats differently. */
const SOURCE_CSS = [
  '@font-face{src:url("/theme-assets/t/fonts/a.woff2?v=2#x")}',
  ".a{background:url(/theme-assets/t/a.png)}",
  ".b{background:URL( '/theme-assets/t/b.png')}",
  '@import "/theme-assets/t/css/import.css";',
  "@IMPORT '/Theme-Assets/t/css/upper.css';",
  ".relative{background:url(../a.png)}",
  ".external{background:url(https://cdn.test/theme-assets/t/a.png)}",
  ".bare{content:'/theme-assets/t/not-a-reference'}",
].join("\n");

/** `SOURCE_CSS` as an authenticated preview of `revision` serves it (the revision is URL-encoded). */
function rewrittenCss(revision: string): string {
  const prefix = `/theme-preview-assets/${encodeURIComponent(revision)}/`;
  return [
    `@font-face{src:url("${prefix}t/fonts/a.woff2?v=2#x")}`,
    `.a{background:url(${prefix}t/a.png)}`,
    `.b{background:URL( '${prefix}t/b.png')}`,
    `@import "${prefix}t/css/import.css";`,
    `@IMPORT '${prefix}t/css/upper.css';`,
    ".relative{background:url(../a.png)}",
    ".external{background:url(https://cdn.test/theme-assets/t/a.png)}",
    ".bare{content:'/theme-assets/t/not-a-reference'}",
  ].join("\n");
}

/** Builds `<tmp>/<relPath>` = `content` for each entry and returns the temp root, removed after the test. */
function makeRoot(t: TestContext, files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "theme-assets-preview-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(root, relPath);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

type RegisterOptions = Parameters<typeof registerThemeStaticAssets>[1];

/**
 * Serves `registerThemeStaticAssets` on an ephemeral port: an optional `localsRevision` is planted on
 * `res.locals.themePreviewRevision` first (as `theme-preview-refresh.ts` does after authenticating),
 * fallthrough answers a plain 404 that adds no headers, and a forwarded error answers 500 with its
 * message, so each test can tell the three exits apart.
 */
async function startApp(
  t: TestContext,
  required: RegisterOptions & { localsRevision?: unknown },
): Promise<string> {
  const app = express();
  const plantRevision: RequestHandler = (_req, res, next) => {
    if ("localsRevision" in required) res.locals.themePreviewRevision = required.localsRevision;
    next();
  };
  app.use(plantRevision);
  registerThemeStaticAssets(app, required);
  app.use((_req, res) => res.status(404).type("text/plain").send("not found"));
  const onError: ErrorRequestHandler = (err: Error, _req, res, _next) => res.status(500).type("text/plain").send(`error: ${err.message}`);
  app.use(onError);
  const server = createServer(app);
  t.after(() => server.close());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected a real listening address");
  return `http://127.0.0.1:${address.port}`;
}

/** Revision predicate that trusts exactly the given revisions. */
function trusting(...revisions: string[]): NonNullable<RegisterOptions["isAuthenticatedPreviewRevision"]> {
  const trusted = new Set(revisions);
  return ({ revision }) => trusted.has(revision);
}

test("preview mount: an authenticated revision's CSS is rewritten to the preview prefix, uncached, with the security headers", async (t) => {
  const root = makeRoot(t, { "t/css/main.css": SOURCE_CSS });
  const baseUrl = await startApp(t, { themeRoots: [root], isAuthenticatedPreviewRevision: trusting("rev-1") });
  const res = await fetch(`${baseUrl}/theme-preview-assets/rev-1/t/css/main.css?v=3`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), rewrittenCss("rev-1"));
  assert.equal(res.headers.get("content-type"), "text/css; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("last-modified"), null);
  assert.equal(res.headers.get("content-security-policy"), SECURITY_CSP);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});

test("preview mount: a HEAD for authenticated CSS answers the rewritten length with no body", async (t) => {
  const root = makeRoot(t, { "t/css/main.css": SOURCE_CSS });
  const baseUrl = await startApp(t, { themeRoots: [root], isAuthenticatedPreviewRevision: trusting("rev-1") });
  const res = await fetch(`${baseUrl}/theme-preview-assets/rev-1/t/css/main.css`, { method: "HEAD" });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "");
  assert.equal(res.headers.get("content-length"), String(Buffer.byteLength(rewrittenCss("rev-1"))));
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("preview mount: an upper-case .CSS extension is rewritten too", async (t) => {
  const root = makeRoot(t, { "t/css/MAIN.CSS": SOURCE_CSS });
  const baseUrl = await startApp(t, { themeRoots: [root], isAuthenticatedPreviewRevision: trusting("rev-1") });
  const res = await fetch(`${baseUrl}/theme-preview-assets/rev-1/t/css/MAIN.CSS`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), rewrittenCss("rev-1"));
});

test("preview mount: a revision the predicate does not trust serves the CSS bytes unchanged, uncached and without validators", async (t) => {
  const root = makeRoot(t, { "t/css/main.css": SOURCE_CSS });
  const baseUrl = await startApp(t, { themeRoots: [root], isAuthenticatedPreviewRevision: trusting("other") });
  const res = await fetch(`${baseUrl}/theme-preview-assets/rev-1/t/css/main.css`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), SOURCE_CSS);
  assert.equal(res.headers.get("content-type"), "text/css; charset=UTF-8");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("etag"), null);
  assert.equal(res.headers.get("last-modified"), null);
});

test("preview mount: with no revision predicate configured, CSS serves unchanged", async (t) => {
  const root = makeRoot(t, { "t/css/main.css": SOURCE_CSS });
  const baseUrl = await startApp(t, { themeRoots: [root] });
  const res = await fetch(`${baseUrl}/theme-preview-assets/rev-1/t/css/main.css`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), SOURCE_CSS);
});

test("preview mount: a revision of exactly 100 word characters is trusted", async (t) => {
  const revision = "a".repeat(100);
  const root = makeRoot(t, { "t/css/main.css": SOURCE_CSS });
  const baseUrl = await startApp(t, { themeRoots: [root], isAuthenticatedPreviewRevision: trusting(revision) });
  const res = await fetch(`${baseUrl}/theme-preview-assets/${revision}/t/css/main.css`);
  assert.equal(await res.text(), rewrittenCss(revision));
});

test("preview mount: a 101-character revision is never offered to the predicate", async (t) => {
  const revision = "a".repeat(101);
  const asked: string[] = [];
  const root = makeRoot(t, { "t/css/main.css": SOURCE_CSS });
  const baseUrl = await startApp(t, {
    themeRoots: [root],
    isAuthenticatedPreviewRevision: ({ revision: asking }) => { asked.push(asking); return true; },
  });
  const res = await fetch(`${baseUrl}/theme-preview-assets/${revision}/t/css/main.css`);
  assert.equal(await res.text(), SOURCE_CSS);
  assert.deepEqual(asked, []);
});

test("preview mount: a revision with a character outside [A-Za-z0-9_-] is never offered to the predicate", async (t) => {
  const asked: string[] = [];
  const root = makeRoot(t, { "t/css/main.css": SOURCE_CSS });
  const baseUrl = await startApp(t, {
    themeRoots: [root],
    isAuthenticatedPreviewRevision: ({ revision }) => { asked.push(revision); return true; },
  });
  const res = await fetch(`${baseUrl}/theme-preview-assets/rev.1/t/css/main.css`);
  assert.equal(await res.text(), SOURCE_CSS);
  assert.deepEqual(asked, []);
});

test("preview mount: a revision already authenticated upstream (res.locals) wins over the URL's and is URL-encoded into the rewrite", async (t) => {
  const root = makeRoot(t, { "t/css/main.css": SOURCE_CSS });
  const baseUrl = await startApp(t, { themeRoots: [root], localsRevision: "up stream/1", isAuthenticatedPreviewRevision: trusting("rev-1") });
  const res = await fetch(`${baseUrl}/theme-preview-assets/rev-1/t/css/main.css`);
  assert.equal(await res.text(), rewrittenCss("up stream/1"));
});

test("preview mount: a non-string res.locals revision blocks the rewrite even when the URL's revision is trusted", async (t) => {
  const root = makeRoot(t, { "t/css/main.css": SOURCE_CSS });
  const baseUrl = await startApp(t, { themeRoots: [root], localsRevision: 7, isAuthenticatedPreviewRevision: trusting("rev-1") });
  const res = await fetch(`${baseUrl}/theme-preview-assets/rev-1/t/css/main.css`);
  assert.equal(await res.text(), SOURCE_CSS);
});

test("public mount: a res.locals revision never rewrites public CSS, which keeps its normal cache policy", async (t) => {
  const root = makeRoot(t, { "t/css/main.css": SOURCE_CSS });
  const baseUrl = await startApp(t, { themeRoots: [root], localsRevision: "rev-1", isAuthenticatedPreviewRevision: trusting("rev-1") });
  const res = await fetch(`${baseUrl}/theme-assets/t/css/main.css`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), SOURCE_CSS);
  assert.equal(res.headers.get("cache-control"), "public, max-age=0");
  assert.ok(res.headers.get("etag"));
  assert.ok(res.headers.get("last-modified"));
});

test("preview mount: a POST is not rewritten and falls through to the next middleware, still marked no-store", async (t) => {
  const root = makeRoot(t, { "t/css/main.css": SOURCE_CSS });
  const baseUrl = await startApp(t, { themeRoots: [root], isAuthenticatedPreviewRevision: trusting("rev-1") });
  const res = await fetch(`${baseUrl}/theme-preview-assets/rev-1/t/css/main.css`, { method: "POST" });
  assert.equal(res.status, 404);
  assert.equal(await res.text(), "not found");
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("preview mount: an undecodable path skips every remaining theme folder and falls through to the next middleware", async (t) => {
  // Both the renamed and the retired folder hold the file, so serving it from either would show.
  const root = makeRoot(t, { "tovu-theme/css/%E0%A4%A.css": "renamed", "basic/css/%E0%A4%A.css": "retired" });
  const baseUrl = await startApp(t, { themeRoots: [root], isAuthenticatedPreviewRevision: trusting("rev-1") });
  const res = await fetch(`${baseUrl}/theme-preview-assets/rev-1/basic/css/%E0%A4%A.css`);
  assert.equal(res.status, 404);
  assert.equal(await res.text(), "not found");
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("preview mount: CSS under a dot-prefixed directory is not rewritten, yet express.static still serves it (reported, not fixed)", async (t) => {
  // The rewrite refuses any dot-prefixed segment, but the request then falls to express.static,
  // whose default `dotfiles` handling only inspects the LAST segment: a file inside a hidden
  // directory of a theme folder (`.git/`, a scratch dir) is served on both mounts.
  const root = makeRoot(t, { "t/.hidden/x.css": SOURCE_CSS });
  const baseUrl = await startApp(t, { themeRoots: [root], isAuthenticatedPreviewRevision: trusting("rev-1") });
  const preview = await fetch(`${baseUrl}/theme-preview-assets/rev-1/t/.hidden/x.css`);
  assert.equal(preview.status, 200);
  assert.equal(await preview.text(), SOURCE_CSS);
  assert.equal(preview.headers.get("content-type"), "text/css; charset=UTF-8");
  const publicRes = await fetch(`${baseUrl}/theme-assets/t/.hidden/x.css`);
  assert.equal(publicRes.status, 200);
  assert.equal(await publicRes.text(), SOURCE_CSS);
});

test("preview mount: a dot-prefixed CSS file name is neither rewritten nor served", async (t) => {
  const root = makeRoot(t, { "t/css/.x.css": SOURCE_CSS });
  const baseUrl = await startApp(t, { themeRoots: [root], isAuthenticatedPreviewRevision: trusting("rev-1") });
  const res = await fetch(`${baseUrl}/theme-preview-assets/rev-1/t/css/.x.css`);
  assert.equal(res.status, 404);
  assert.equal(await res.text(), "not found");
});

test("preview mount: an encoded traversal out of the theme folder is not read by the rewrite and is refused", async (t) => {
  const root = makeRoot(t, { "t/css/main.css": SOURCE_CSS, "secret.css": "outside" });
  const baseUrl = await startApp(t, { themeRoots: [root], isAuthenticatedPreviewRevision: trusting("rev-1") });
  const res = await fetch(`${baseUrl}/theme-preview-assets/rev-1/t/css/..%2F..%2Fsecret.css`);
  assert.equal(res.status, 404);
  assert.equal(await res.text(), "not found");
});

test("preview mount: an authenticated non-CSS asset is served as-is by the static handler, uncached", async (t) => {
  const root = makeRoot(t, { "t/img/a.svg": "<svg>/theme-assets/t/x</svg>" });
  const baseUrl = await startApp(t, { themeRoots: [root], isAuthenticatedPreviewRevision: trusting("rev-1") });
  const res = await fetch(`${baseUrl}/theme-preview-assets/rev-1/t/img/a.svg`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "<svg>/theme-assets/t/x</svg>");
  assert.equal(res.headers.get("content-type"), "image/svg+xml");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("etag"), null);
});

test("preview mount: CSS missing from the renamed folder is read from the retired folder and rewritten", async (t) => {
  const root = makeRoot(t, { "tovu-theme/css/other.css": "x", "basic/css/main.css": SOURCE_CSS });
  const baseUrl = await startApp(t, { themeRoots: [root], isAuthenticatedPreviewRevision: trusting("rev-1") });
  const res = await fetch(`${baseUrl}/theme-preview-assets/rev-1/tovu-theme/css/main.css`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), rewrittenCss("rev-1"));
});

test("preview mount: authenticated CSS missing from every folder falls through to the next middleware", async (t) => {
  // The retired folder's `dir.css` is a directory, so reading it fails there too (EISDIR).
  const root = makeRoot(t, { "tovu-theme/css/other.css": "x", "basic/css/dir.css/keep": "x" });
  const baseUrl = await startApp(t, { themeRoots: [root], isAuthenticatedPreviewRevision: trusting("rev-1") });
  const res = await fetch(`${baseUrl}/theme-preview-assets/rev-1/basic/css/dir.css`);
  assert.equal(res.status, 404);
  assert.equal(await res.text(), "not found");
});

test("preview mount: an unknown theme falls through without the no-store header", async (t) => {
  const root = makeRoot(t, {});
  const baseUrl = await startApp(t, { themeRoots: [root], isAuthenticatedPreviewRevision: trusting("rev-1") });
  const res = await fetch(`${baseUrl}/theme-preview-assets/rev-1/missing/css/main.css`);
  assert.equal(res.status, 404);
  assert.equal(await res.text(), "not found");
  assert.equal(res.headers.get("cache-control"), null);
});

test("static handler errors are forwarded to the error handler instead of trying the next folder", async (t) => {
  const root = makeRoot(t, { "tovu-theme/a.txt": "renamed", "basic/a.txt": "retired" });
  const roots: string[] = [];
  const serveStatic = Object.assign(
    (dir: string): ReturnType<typeof express.static> => (_req, _res, next) => {
      roots.push(path.basename(dir));
      next(Object.assign(new Error("disk unavailable"), { status: 500, statusCode: 500, expose: false }));
    },
    { mime: express.static.mime },
  );
  const baseUrl = await startApp(t, { themeRoots: [root], serveStatic });
  const res = await fetch(`${baseUrl}/theme-assets/basic/a.txt`);
  assert.equal(res.status, 500);
  assert.equal(await res.text(), "error: disk unavailable");
  assert.equal(res.headers.get("content-security-policy"), SECURITY_CSP);
  assert.deepEqual(roots, ["tovu-theme"]);
});
