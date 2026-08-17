import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

// No import of `server/app.ts` here, static OR lazy (2026-08-16 rework). This used to be the single
// shared back-edge that every export/publish import cycle ran through — `server/app.ts` (and
// anything it registers — the export route, the publish route, the deployments agent-tool domain)
// reaches `export/index.ts`, which reaches this file, so even the lazy `require("../server/app")`
// this file used to carry closed:
//
//     server/app.ts -> ... -> export/index.ts -> export/site-exporter.ts -> server/app.ts
//
// (`server/app.ts` runs its whole boot graph as a side effect of being loaded, so re-entering it
// mid-initialisation yields half-built module exports — on 2026-08-15 the EAGER version of this
// import killed the agent daemon on every boot with `TypeError: Cannot read properties of undefined
// (reading 'createInMemoryChatStoreFactory')`, exit code 1, while the API server stayed up, so the
// only visible symptom was "the AI assistant no longer works"; the lazy `require` that replaced it
// fixed load ORDER but left the dependency-cruiser-flagged `export <-> server` module cycle itself
// in place.)
//
// The fix that removes the edge instead of merely deferring it: `exportSite` now boots the app via
// `options.routeDeps.createSiteApp(routeDeps)` — the SAME `createApp` factory, injected through
// `RouteDeps` (`server/routes/types.ts`'s `createSiteApp` field doc has the full rationale) exactly
// the way `routeDeps.runExportSite` already injects THIS function the other direction. This file
// still imports `RouteDeps` as a TYPE below — that import is erased at compile time (zero runtime
// edge) and was never part of the cycle; only the runtime `require`/`import` of `createApp` was.
import type { RouteDeps } from "../server/routes/types";
import { buildRouteManifest } from "./route-manifest";
import type { ManifestActiveTheme, ManifestRoute, ManifestRouteKind, ManifestSkip } from "./ports";

/**
 * @file The static-site exporter engine: boots the REAL `createApp(routeDeps)` Express app
 * in-process, issues real HTTP requests for every route in the manifest, and writes each response
 * to a folder of files any static host can serve.
 *
 * Deliberately NOT a second renderer (`development/docs/deployment/deployment-constraints.md` §5):
 * this repo already carries the cost of two render paths (editor vs. public site) diverging, which
 * is why UI bugs here need end-to-end tests to catch. A hand-rolled export renderer would be a
 * THIRD path. Driving the real app over real HTTP — the same mechanism
 * `server/routes/site/__tests__/pages.route.test.ts` already uses to test these routes — is the
 * only way the exported HTML is guaranteed byte-identical to what a live visitor gets, including
 * whichever theme tier (declarative/templated/handlebars/static/code) is active and whatever
 * worker-thread sandbox a templated/handlebars theme renders inside (`render.ts:2002-2044`).
 *
 * Not a `Port` (unlike `route-manifest.ts`'s `RouteManifestPort`): there is exactly one way to
 * "boot the real app and fetch it" — no second implementation is ever expected, so wrapping this in
 * a swappable interface would be ceremony with no seam behind it.
 *
 * Assets (theme CSS/JS/images, `/agent-icons/*`, and uploads served through the `/m/` media
 * rendition route) are NOT copied from disk or read out of the DB — they are discovered by
 * crawling each successfully-rendered page's own HTML for `href`/`src` references under the known
 * public asset prefixes, then fetched the identical real-HTTP way. Three reasons, not one:
 * (a) uploads have no "the uploads folder" to copy — `/m/{assetId}/{transform}.v{version}/{file}`
 *     is a rendition pipeline over DB rows, not a static-file mount, so crawling the real emitted
 *     URLs is the only way to get the exact bytes a visitor would;
 * (b) copying a theme's whole folder would ship `.liquid`/`.hbs` SOURCE and any `build.sourceDir`
 *     compiler output — reachable today per `theme-static-assets.ts`'s own file header, but not
 *     content an OFFLINE static copy of the site needs to function; and
 * (c) it keeps every byte this exporter writes flowing through the one real-HTTP mechanism, with no
 *     second "trust the filesystem instead" code path to drift from it.
 * The CSS second-pass below (one bounded hop, not open-ended recursion) exists because a
 * stylesheet's own `url(...)` references (fonts, background images) are invisible to an HTML-only
 * crawl.
 *
 * Two more things a crawl structurally cannot see, per 2026-08-15 team-lead review:
 * - Convention-addressed files nothing links to (`robots.txt`, `sitemap.xml`) — no HTML references
 *   them, browsers/crawlers request them by exact name. `route-manifest.ts` now always includes
 *   them as ordinary `kind: "well-known"` routes rather than leaving them to a crawl that could
 *   never find them; {@link wellKnownOutputFile} writes them at their literal filename, not
 *   wrapped in a `<name>/index.html` directory like every other content route.
 * - Runtime-referenced assets: a theme's own JavaScript can build an image path or inject a font
 *   from a string at request time, which no static crawl can ever see (there is no link to find).
 *   This exporter does NOT attempt to catch these — instead {@link findUnreferencedThemeFiles}
 *   diffs the active theme's whole folder against what actually got rendered/fetched and reports
 *   the leftover files, so a caller gets an honest "these N files were never referenced" list
 *   instead of an export that silently looks complete.
 *
 * Every succeeded `ExportedRoute`/`ExportedAsset` also carries its own `data` (the exact bytes
 * written) and `contentType` (the real response header, or a fixed value for the one
 * exporter-authored page — the redirect stub) — added 2026-08-15 so this report is reachable as
 * DATA for a future deploy-shaped caller, not only as a side effect on disk. See those interfaces'
 * own doc comments (`ExportedRoute`/`ExportedAsset` below) for the confirmed downstream shape
 * (`@jini-ai/devops/deploy`'s `DeployFile`) and the resource tradeoff this implies.
 */

const ASSET_URL_PREFIXES = ["/theme-assets/", "/agent-icons/", "/m/"] as const;

/**
 * One route this exporter attempted and wrote successfully. `data`/`contentType` make the file set
 * reachable as DATA, not only as a side effect on disk — added 2026-08-15 so a future deploy-shaped
 * caller (`@jini-ai/devops/deploy`'s `DeployFile { file, data, contentType, sourcePath }`, confirmed
 * against the real package at `Jini/packages/devops/src/deploy/types.ts`) can build its own file set
 * straight from an `ExportReport` without re-reading every written file back off disk. `outputFile`
 * is already the deploy-relative path that shape's `file` field wants — this exporter has written
 * every path relative to `outputDir` since the first pass, not because of this addition.
 *
 * Resource note, disclosed rather than silently accepted: holding `data` on every entry means this
 * exporter's peak memory now includes every exported route's full body simultaneously (previously
 * write-and-discard, one body alive at a time). Fine at this feature's actual scale — one
 * workspace's content, a CLI-triggered, human-paced operation — but a caller exporting a very large
 * site and NOT immediately discarding the report should be aware the bytes are retained, not
 * streamed.
 */
export interface ExportedRoute {
  path: string;
  kind: ManifestRouteKind;
  /** Written file, relative to `outputDir` — already deploy-relative, not an absolute path. */
  outputFile: string;
  /** The exact bytes written to `outputFile`. Always text: every route this exporter produces is
   *  HTML, XML (`sitemap.xml`), or plain text (`robots.txt`, a redirect stub). */
  data: string;
  /** The real response's `Content-Type` header for a fetched route; a fixed, synthesized value for
   *  the redirect stub this exporter itself authors (see {@link writeRedirectRoute}) — that page was
   *  never fetched from anywhere, so there is no response header to read. */
  contentType?: string;
}

/** One route this exporter attempted and could NOT write — always reported, never silently
 *  absent from the result (the brief's "a route that fails to render is a reported error, never a
 *  silently missing file" rule). */
export interface FailedRoute {
  path: string;
  kind: ManifestRouteKind;
  reason: string;
}

/** Same "reachable as data" reasoning as {@link ExportedRoute} — see that interface's own doc. */
export interface ExportedAsset {
  /** The site-relative URL this asset was fetched from, e.g. `/theme-assets/basic/css/base.css`. */
  url: string;
  /** Written file, relative to `outputDir` — already deploy-relative. */
  outputFile: string;
  /** The exact bytes written to `outputFile`. `Buffer`, not `string`: an asset may be binary
   *  (an image, a font) as readily as text (a stylesheet). */
  data: Buffer;
  /** The real response's `Content-Type` header. */
  contentType?: string;
}

export interface FailedAsset {
  url: string;
  reason: string;
}

export interface ExportReport {
  outputDir: string;
  routes: { succeeded: ExportedRoute[]; failed: FailedRoute[] };
  assets: { succeeded: ExportedAsset[]; failed: FailedAsset[] };
  /** Manifest entries that could not even be attempted (e.g. non-`exact` redirect rules) — carried
   *  through from `RouteManifest.skipped` so one report names every known gap. */
  skippedManifestEntries: ManifestSkip[];
  /**
   * Files that physically exist in the active theme's own folder but were never written by this
   * export — neither rendered as a route (a theme page) nor discovered by the HTML/CSS crawl (an
   * asset). Paths are relative to the theme's own folder, e.g. `"images/hero-unused.jpg"`.
   *
   * This is a KNOWN, DISCLOSED gap, not a bug this exporter can close: a theme's own JavaScript can
   * construct an image path or inject a font at runtime from a string, which is invisible to a
   * static crawl by construction (there is no link for the crawl to find). Rather than let the
   * export look complete, every such file is named here so a caller can make an informed call about
   * whether it matters for THIS theme. Empty when the manifest resolved no active theme.
   */
  unreferencedThemeFiles: string[];
  /**
   * The normalized base path this export rewrote every root-relative reference for (e.g. `"/repo"`
   * for a GitHub Pages project site), or `undefined` when none was requested — the default,
   * byte-for-byte-unchanged apex-domain case. Set only when non-empty; see
   * {@link basePathRewriteWarning} for the disclosed limit that applies whenever this is set.
   */
  basePath?: string;
  /**
   * Present ONLY when `basePath` is set — a fixed disclosure, not a per-file diagnostic (there is
   * nothing to enumerate: a path a theme's own JavaScript builds at runtime from a string never
   * appears as text in a fetched response, so this rewrite cannot even detect that such a path
   * exists, let alone list it). Same "report the limit, don't claim completeness" treatment as
   * {@link unreferencedThemeFiles}, applied to a different, text-rewrite-shaped gap.
   */
  basePathRewriteWarning?: string;
}

export interface ExportSiteOptions {
  /** The same composition-root object `createApp`/`server/deps.ts` already build — the exporter
   *  boots the real app with this, exactly like `cli/commands/serve.ts` does. */
  routeDeps: RouteDeps;
  outputDir: string;
  /** When the output directory already has contents, `exportSite` refuses by default (removing
   *  files this process did not write is destructive — see this option's own call site in
   *  `cli/commands/export.ts` for the `--clean` flag that sets it). Pass `true` to remove the
   *  directory's existing contents before writing. */
  clean?: boolean;
  /**
   * When set (e.g. `"/my-repo"` for a GitHub Pages project site), every root-relative reference this
   * exporter writes — HTML `href`/`src`, `sitemap.xml`'s `<loc>`, `robots.txt`'s `Sitemap:` line, a
   * redirect stub's target — is rewritten to carry this prefix. Omitted/empty (the default) leaves
   * every byte this exporter writes IDENTICAL to a pre-`--base-path` export — proven by
   * `site-exporter.test.ts`'s own "unset is inert" regression test, not just asserted in this
   * comment.
   */
  basePath?: string;
}

/** Thrown when `outputDir` has existing contents and `options.clean` was not set. */
export class ExportOutputNotEmptyError extends Error {}

/**
 * Ensures `outputDir` exists and is ready to receive a fresh export: creates it if missing, leaves
 * it alone if already empty, and only clears existing contents when `clean` is explicitly `true`.
 *
 * @throws {ExportOutputNotEmptyError} the directory has entries and `clean` is not `true`.
 * @complexity O(n) in the directory's own (typically small) top-level entry count.
 */
function prepareOutputDir(outputDir: string, clean: boolean): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    return;
  }
  const entries = readdirSync(outputDir);
  if (entries.length === 0) return;
  if (!clean) {
    throw new ExportOutputNotEmptyError(
      `export output directory '${outputDir}' is not empty (${entries.length} existing ${entries.length === 1 ? "entry" : "entries"}) — ` +
        "pass --clean to remove its contents first, or point --out at an empty/new directory"
    );
  }
  for (const entry of entries) {
    rmSync(path.join(outputDir, entry), { recursive: true, force: true });
  }
}

/** `"/"` -> `<outputDir>/index.html`; `"/about"` -> `<outputDir>/about/index.html` — the standard
 *  "pretty URL" static-export convention (Next.js/Hugo/Gatsby all use it), which any plain static
 *  file server resolves without extra rewrite config, and which matches Tovu's own live route shape
 *  (no `.html` suffix — `pages.ts`'s `GET /:slug` strips one if a visitor typed it). */
function contentRouteOutputFile(routePath: string, outputDir: string): string {
  if (routePath === "/") return path.join(outputDir, "index.html");
  const trimmed = routePath.replace(/^\/+/, "").replace(/\/+$/, "");
  return path.join(outputDir, trimmed, "index.html");
}

/** `kind: "well-known"` routes (`/robots.txt`, `/sitemap.xml`) are convention-addressed BY NAME —
 *  a crawler or browser requests them at that exact literal path, never through a link — so unlike
 *  every other content route, they must land at that literal filename, not wrapped in a
 *  `<name>/index.html` directory. */
function wellKnownOutputFile(routePath: string, outputDir: string): string {
  return path.join(outputDir, routePath.replace(/^\/+/, ""));
}

function writeTextFile(filePath: string, contents: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents, "utf8");
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// --base-path support (2026-08-15, team-lead-approved option (a)): every route in this exporter's
// output is root-relative (`href="/about"`, `<loc>/welcome</loc>`, `Sitemap: /sitemap.xml`) because
// that is what the LIVE server actually emits — correct at an apex domain, broken at a GitHub Pages
// PROJECT site (`https://<owner>.github.io/<repo>/`, not the domain root). Rather than touch
// `render.ts`'s 10+ scattered hand-written `href="/…"` template strings (there is no single
// `urlFor`-style chokepoint for site hrefs to intercept upstream), this rewrites the ALREADY-
// RENDERED response bytes this exporter already holds — one small, scoped regex per response shape,
// extending the exact pattern `features/theme/static-asset-contract.ts`'s `rewriteAssetPaths`
// already proves out (quote-echoing `href=`/`src=` rewrite), rather than inventing a new mechanism.
//
// Deliberately does NOT touch CSS `url(...)` references: verified (grep, 2026-08-15) that the
// shipped `basic` theme's stylesheets contain no absolute `url(/...)` reference — every one is
// already relative to the stylesheet's own location, which moves correctly with the rest of
// `theme-assets/` under any base path without a rewrite.
// ---------------------------------------------------------------------------

/** `"repo"`, `"/repo"`, `"/repo/"` all normalize to `"/repo"` — one leading slash, no trailing
 *  one — so every call site below can prefix with straight string concatenation. `""`/`"/"` (no
 *  real base path) normalizes to `""`, which every caller below treats as "rewriting is off". */
function normalizeBasePath(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (trimmed === "" || trimmed === "/") return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * Prefixes ONE root-relative path with `basePath` — the single decision every rewrite below applies
 * per match, so "what counts as root-relative" and "how do we avoid double-prefixing" are decided
 * in exactly one place.
 *
 * Left untouched: anything that is not root-relative at all (a same-page `#anchor`, a relative
 * `pricing.html`, an absolute external `https://…` URL) and protocol-relative URLs (`//cdn.example
 * .com/x.js` — a root-relative-LOOKING path is actually a scheme-relative external reference).
 * Idempotent: a value that already starts with `basePath` (or equals it) is returned unchanged, so
 * running this twice — or a value that happens to already carry the prefix for some other reason —
 * can never produce `/repo/repo/about`.
 */
function prefixRootRelativePath(value: string, basePath: string): string {
  if (basePath === "") return value;
  if (!value.startsWith("/") || value.startsWith("//")) return value;
  if (value === basePath || value.startsWith(`${basePath}/`)) return value;
  return `${basePath}${value}`;
}

/** Rewrites every `href="…"`/`src="…"` (single- OR double-quoted, matching
 *  `static-asset-contract.ts`'s own quote-echoing convention — `pages.ts`'s bare 404 fallback is
 *  observed to use single quotes, so both are real, not hypothetical) root-relative attribute value
 *  in one rendered HTML document. */
function rewriteHtmlBasePath(html: string, basePath: string): string {
  if (basePath === "") return html;
  return html.replace(/\b(href|src)=(["'])([^"']*)\2/g, (_match, attr: string, quote: string, value: string) => `${attr}=${quote}${prefixRootRelativePath(value, basePath)}${quote}`);
}

/** Rewrites every `<loc>…</loc>` entry in a rendered `sitemap.xml` body. */
function rewriteSitemapBasePath(xml: string, basePath: string): string {
  if (basePath === "") return xml;
  return xml.replace(/<loc>([^<]*)<\/loc>/g, (_match, value: string) => `<loc>${prefixRootRelativePath(value, basePath)}</loc>`);
}

/** Rewrites the `Sitemap: …` line in a rendered `robots.txt` body (`robots.ts`'s own output shape —
 *  one `Sitemap:` line per advertised sitemap URL, each on its own line). */
function rewriteRobotsBasePath(text: string, basePath: string): string {
  if (basePath === "") return text;
  return text.replace(/^Sitemap: (.*)$/gm, (_match, value: string) => `Sitemap: ${prefixRootRelativePath(value.trim(), basePath)}`);
}

/**
 * A static host has no server-side redirect mechanism to hand this rule to, so the exported file
 * IS the redirect: an immediate `<meta http-equiv="refresh">` plus a visible fallback link, both
 * pointing at whatever the live app's real 3xx response actually said (see {@link writeRedirectRoute}
 * — never the manifest's own `redirectTarget`, which is only a cross-check hint). `location` is
 * expected to already be base-path-prefixed by the caller when applicable — this function only
 * embeds it, the same "one place decides the path" split every rewrite above already follows.
 */
function renderRedirectStub(location: string): string {
  const safe = escapeHtmlAttr(location);
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta http-equiv="refresh" content="0; url=${safe}">` +
    `<link rel="canonical" href="${safe}">` +
    `<title>Redirecting…</title></head>` +
    `<body>Redirecting to <a href="${safe}">${safe}</a>.</body></html>\n`
  );
}

/** Regex-based `href="…"`/`src="…"` scan, not a full HTML parse — bounded and sufficient for this
 *  exporter's one job (find asset URLs under the three known public prefixes); it does not attempt
 *  to resolve `srcset`, inline event-handler URLs, or any non-attribute reference. */
function extractAssetUrls(html: string): string[] {
  const found = new Set<string>();
  const pattern = /\b(?:href|src)="([^"]+)"/g;
  for (const match of html.matchAll(pattern)) {
    const value = match[1] ?? "";
    if (ASSET_URL_PREFIXES.some((prefix) => value.startsWith(prefix))) {
      found.add(value.split("#")[0] ?? value);
    }
  }
  return [...found];
}

/** One bounded hop into a fetched CSS file's own `url(...)` references (fonts, background images),
 *  resolved against that CSS file's own path — CSS is the only asset type this exporter follows a
 *  reference out of; images/fonts/scripts are leaves. */
function extractCssUrls(css: string, cssUrl: string): string[] {
  const found = new Set<string>();
  const pattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  for (const match of css.matchAll(pattern)) {
    const ref = (match[2] ?? "").trim();
    if (ref === "" || ref.startsWith("data:") || /^[a-z]+:\/\//i.test(ref)) continue; // data URI or absolute external URL — nothing to fetch
    const resolved = new URL(ref, `http://export-local${cssUrl}`).pathname;
    if (ASSET_URL_PREFIXES.some((prefix) => resolved.startsWith(prefix))) {
      found.add(resolved);
    }
  }
  return [...found];
}

/** Maps a fetched asset's site-relative URL to its output file, refusing anything that would
 *  escape `outputDir` — mirrors `theme-static-assets.ts`'s own containment check (a URL extracted
 *  from rendered HTML is still, transitively, request-shaped input, not a trusted literal). */
function assetOutputFile(url: string, outputDir: string): string | null {
  const pathname = decodeURIComponent(url.split("?")[0] ?? url);
  const trimmed = pathname.replace(/^\/+/, "");
  const resolved = path.resolve(outputDir, trimmed);
  if (resolved !== path.join(outputDir, trimmed)) return null;
  if (!resolved.startsWith(`${outputDir}${path.sep}`)) return null;
  return resolved;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

/** Common return shape for the three per-kind route writers below, so the caller's loop can handle
 *  all three uniformly without a discriminated-union narrowing dance. `html` is populated only by
 *  {@link writeContentRoute} — it is the one kind whose body is worth crawling for asset refs; a
 *  redirect stub and a raw 404 body are both written verbatim already, nothing about them needs
 *  crawling for cross-references this exporter must additionally fetch. */
interface RouteWriteOutcome {
  succeeded?: ExportedRoute;
  failed?: FailedRoute;
  html?: string;
}

/** `robots.txt`/`sitemap.xml`'s literal well-known paths — shared between `route-manifest.ts` (which
 *  enumerates them) and the base-path rewrite below (which needs to pick the right rewrite shape per
 *  path). Not exported from `ports.ts`: nothing outside this file's own rewrite dispatch needs them
 *  as a named constant rather than the two literal manifest routes they already are. */
const SITEMAP_PATH = "/sitemap.xml";
const ROBOTS_PATH = "/robots.txt";

/**
 * Applies whichever base-path rewrite matches this route's real content shape — HTML for every
 * ordinary content/theme/product/not-found route, `<loc>` for the sitemap, the `Sitemap:` line for
 * robots.txt. A no-op (returns `body` unchanged) when `basePath` is `""` (rewriting off).
 */
function rewriteRouteBodyForBasePath(route: ManifestRoute, body: string, basePath: string): string {
  if (route.path === SITEMAP_PATH) return rewriteSitemapBasePath(body, basePath);
  if (route.path === ROBOTS_PATH) return rewriteRobotsBasePath(body, basePath);
  return rewriteHtmlBasePath(body, basePath);
}

async function writeContentRoute(route: ManifestRoute, baseUrl: string, outputDir: string, basePath: string): Promise<RouteWriteOutcome> {
  const res = await fetch(`${baseUrl}${route.path}`);
  if (res.status !== 200) {
    return { failed: { path: route.path, kind: route.kind, reason: `expected 200, got ${res.status}` } };
  }
  const rawBody = await res.text();
  const contentType = res.headers.get("content-type") ?? undefined;
  const outFile = route.kind === "well-known" ? wellKnownOutputFile(route.path, outputDir) : contentRouteOutputFile(route.path, outputDir);
  // The CRAWL (below, via `html`) must see the RAW body — the live server has no concept of a base
  // path, so it still emits `/theme-assets/...` un-prefixed, which is exactly the URL the crawl must
  // request the asset FROM. Only the WRITTEN copy is rewritten; asset discovery and the on-disk
  // asset layout are entirely unaffected by `--base-path` (team-lead condition: rewriting is a pure
  // output-bytes transform, never a second render or a second fetch).
  const writtenBody = rewriteRouteBodyForBasePath(route, rawBody, basePath);
  writeTextFile(outFile, writtenBody);
  return {
    succeeded: { path: route.path, kind: route.kind, outputFile: path.relative(outputDir, outFile), data: writtenBody, contentType },
    html: rawBody,
  };
}

async function writeRedirectRoute(route: ManifestRoute, baseUrl: string, outputDir: string, basePath: string): Promise<RouteWriteOutcome> {
  const res = await fetch(`${baseUrl}${route.path}`, { redirect: "manual" });
  if (res.status < 300 || res.status >= 400) {
    return { failed: { path: route.path, kind: route.kind, reason: `expected a 3xx redirect response, got ${res.status}` } };
  }
  const location = res.headers.get("location") ?? route.redirectTarget;
  if (!location) {
    return { failed: { path: route.path, kind: route.kind, reason: "redirect response carried no Location header" } };
  }
  // Prefixed BEFORE constructing the stub, not by rewriting the stub's own HTML afterward — the
  // same "one place decides the path" split `prefixRootRelativePath` documents, applied directly
  // since this page's only path reference is the one value already in hand.
  const stub = renderRedirectStub(prefixRootRelativePath(location, basePath));
  const outFile = contentRouteOutputFile(route.path, outputDir);
  writeTextFile(outFile, stub);
  // This page was authored locally (see renderRedirectStub's own doc), never fetched — there is no
  // response header to read, so contentType is a fixed value describing what was actually written.
  return { succeeded: { path: route.path, kind: route.kind, outputFile: path.relative(outputDir, outFile), data: stub, contentType: "text/html; charset=utf-8" } };
}

/** The 404 probe is written to `<outputDir>/404.html` — not to its own sentinel path — matching
 *  the convention static hosts (Netlify, GitHub Pages, S3+CloudFront) already look for at the
 *  output root. */
async function writeNotFoundRoute(route: ManifestRoute, baseUrl: string, outputDir: string, basePath: string): Promise<RouteWriteOutcome> {
  const res = await fetch(`${baseUrl}${route.path}`);
  if (res.status < 400) {
    return { failed: { path: route.path, kind: route.kind, reason: `expected a non-2xx response for the 404 probe, got ${res.status}` } };
  }
  const rawBody = await res.text();
  const contentType = res.headers.get("content-type") ?? undefined;
  const body = rewriteHtmlBasePath(rawBody, basePath);
  const outFile = path.join(outputDir, "404.html");
  writeTextFile(outFile, body);
  return { succeeded: { path: route.path, kind: route.kind, outputFile: "404.html", data: body, contentType } };
}

/**
 * Breadth-first fetch of every asset URL discovered while writing routes, following ONE extra hop
 * out of any fetched `.css` file for its own `url(...)` references. Already-seen URLs are fetched
 * at most once regardless of how many pages/stylesheets reference them.
 *
 * @complexity O(A) HTTP requests for A distinct discovered asset URLs (each `.css` asset
 *   contributes at most its own reference count to the queue, bounded by the one-hop rule above —
 *   a CSS file's own referenced fonts/images are never themselves re-scanned for further `url(...)`
 *   references).
 */
async function fetchAssets(initialUrls: readonly string[], baseUrl: string, outputDir: string): Promise<{ succeeded: ExportedAsset[]; failed: FailedAsset[] }> {
  const succeeded: ExportedAsset[] = [];
  const failed: FailedAsset[] = [];
  const seen = new Set<string>();
  const queue = [...initialUrls];

  while (queue.length > 0) {
    const url = queue.shift() as string;
    if (seen.has(url)) continue;
    seen.add(url);

    const outFile = assetOutputFile(url, outputDir);
    if (!outFile) {
      failed.push({ url, reason: "asset URL resolved outside the output directory — refused" });
      continue;
    }

    const res = await fetch(`${baseUrl}${url}`);
    if (!res.ok) {
      failed.push({ url, reason: `GET ${url} -> ${res.status}` });
      continue;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? undefined;
    mkdirSync(path.dirname(outFile), { recursive: true });
    writeFileSync(outFile, buffer);
    succeeded.push({ url, outputFile: path.relative(outputDir, outFile), data: buffer, contentType });

    if (url.endsWith(".css")) {
      for (const ref of extractCssUrls(buffer.toString("utf8"), url)) {
        if (!seen.has(ref)) queue.push(ref);
      }
    }
  }

  return { succeeded, failed };
}

/** Every file under `dir`, recursively, as paths relative to `dir` using forward slashes (matching
 *  the URL-path separator every `ASSET_URL_PREFIXES` comparison elsewhere in this file already
 *  uses, so callers never need to normalize `path.sep` themselves). */
function listFilesRecursively(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listFilesRecursively(full).map((rel) => `${entry.name}/${rel}`));
    } else if (entry.isFile()) {
      found.push(entry.name);
    }
  }
  return found;
}

/**
 * Diffs the active theme's own folder against everything this export actually wrote FROM it (a
 * rendered theme-page route, or a crawled/fetched asset), per {@link ExportReport.unreferencedThemeFiles}'s
 * own doc. `manifestRoutes` supplies the `pages/<id>.html` exclusions — `"index"`/`"404"` always
 * (home and the 404 probe render from them regardless of whether that render succeeded), plus every
 * `kind: "theme-page"` route's own page id, so a page the export ATTEMPTED (even one that failed —
 * already reported, with more detail, in `routes.failed`) is never ALSO reported here as if no code
 * path had touched it at all.
 *
 * @complexity O(F) file-system entries under the theme's folder, one `readdirSync` per directory —
 *   a theme folder is a handful of files/folders in practice, never a caller-controlled collection.
 */
function findUnreferencedThemeFiles(activeTheme: ManifestActiveTheme, manifestRoutes: readonly ManifestRoute[], fetchedAssetUrls: readonly string[]): string[] {
  const accountedFor = new Set<string>(["pages/index.html", "pages/404.html"]);
  for (const route of manifestRoutes) {
    if (route.kind === "theme-page") accountedFor.add(`pages/${route.label}.html`);
  }
  const themeAssetPrefix = `/theme-assets/${activeTheme.id}/`;
  for (const url of fetchedAssetUrls) {
    if (url.startsWith(themeAssetPrefix)) accountedFor.add(url.slice(themeAssetPrefix.length));
  }

  return listFilesRecursively(activeTheme.dir)
    .filter((relativePath) => !accountedFor.has(relativePath))
    .sort();
}

/**
 * Exports the whole public site to `options.outputDir`: boots the real app in-process, enumerates
 * every route via {@link buildRouteManifest}, fetches each one over real HTTP, and writes the
 * response to disk — content routes as `<slug>/index.html`, redirects as a static meta-refresh
 * stub, the 404 probe as `404.html` at the root — then crawls the successfully-written HTML for
 * asset references and fetches those too.
 *
 * Never throws for an individual route or asset failure — each is recorded in the returned report
 * (`routes.failed`/`assets.failed`) so a caller can print an honest summary; it DOES throw
 * `ExportOutputNotEmptyError` up front (before booting anything) when `outputDir` has contents and
 * `options.clean` was not set, and propagates any error from booting the app itself uncaught.
 *
 * @complexity O(R + A) HTTP requests for R manifest routes and A discovered asset URLs — see
 *   {@link fetchAssets}'s own complexity note for the asset side. All routes are fetched serially,
 *   not concurrently: `better-sqlite3`-backed repos are synchronous per call, and this file's own
 *   job is fidelity over throughput — every export is a bounded, human-triggered operation on one
 *   workspace's content, not a hot path.
 */
/** Printed/reported only when `--base-path` is actually set — see `ExportReport.basePathRewriteWarning`'s
 *  own doc for why this cannot be a per-file list the way `unreferencedThemeFiles` is. */
const BASE_PATH_REWRITE_WARNING =
  "base-path rewriting is a best-effort TEXT rewrite over already-rendered responses — it cannot rewrite a path a theme's own JavaScript constructs at runtime from a string (same category of gap as the unreferenced-theme-file warning, just invisible to this rewrite instead of to the asset crawl).";

export async function exportSite(options: ExportSiteOptions): Promise<ExportReport> {
  const { routeDeps, outputDir, clean = false } = options;
  const basePath = normalizeBasePath(options.basePath ?? "");
  prepareOutputDir(outputDir, clean);

  const manifest = await buildRouteManifest(routeDeps);
  // Injected via `RouteDeps.createSiteApp` (see the file-header note and that field's own doc in
  // `server/routes/types.ts`) rather than imported from `server/app.ts` — no `require` left here at
  // all, lazy or otherwise.
  const server = createServer(routeDeps.createSiteApp(routeDeps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const routesSucceeded: ExportedRoute[] = [];
  const routesFailed: FailedRoute[] = [];
  const assetUrls = new Set<string>();

  try {
    for (const route of manifest.routes) {
      const outcome: RouteWriteOutcome =
        route.kind === "redirect"
          ? await writeRedirectRoute(route, baseUrl, outputDir, basePath)
          : route.kind === "not-found"
            ? await writeNotFoundRoute(route, baseUrl, outputDir, basePath)
            : await writeContentRoute(route, baseUrl, outputDir, basePath);

      if (outcome.succeeded) routesSucceeded.push(outcome.succeeded);
      if (outcome.failed) routesFailed.push(outcome.failed);
      if (outcome.html) {
        for (const url of extractAssetUrls(outcome.html)) assetUrls.add(url);
      }
    }

    // Asset discovery/fetch/output-layout is entirely basePath-agnostic (see writeContentRoute's own
    // comment) — no rewrite is applied here, by design, not by omission.
    const { succeeded: assetsSucceeded, failed: assetsFailed } = await fetchAssets([...assetUrls], baseUrl, outputDir);

    const unreferencedThemeFiles = manifest.activeTheme
      ? findUnreferencedThemeFiles(
          manifest.activeTheme,
          manifest.routes,
          assetsSucceeded.map((a) => a.url)
        )
      : [];

    return {
      outputDir,
      routes: { succeeded: routesSucceeded, failed: routesFailed },
      assets: { succeeded: assetsSucceeded, failed: assetsFailed },
      skippedManifestEntries: manifest.skipped,
      unreferencedThemeFiles,
      ...(basePath !== "" ? { basePath, basePathRewriteWarning: BASE_PATH_REWRITE_WARNING } : {}),
    };
  } finally {
    server.closeAllConnections?.();
    await closeServer(server);
  }
}
