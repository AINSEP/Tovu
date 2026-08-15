import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createApp } from "../server/app";
import type { RouteDeps } from "../server/routes/types";
import { buildRouteManifest } from "./route-manifest";
import type { ManifestRoute, ManifestRouteKind, ManifestSkip } from "./ports";

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
 */

const ASSET_URL_PREFIXES = ["/theme-assets/", "/agent-icons/", "/m/"] as const;

/** One route this exporter attempted and wrote successfully. */
export interface ExportedRoute {
  path: string;
  kind: ManifestRouteKind;
  /** Written file, relative to `outputDir`. */
  outputFile: string;
}

/** One route this exporter attempted and could NOT write — always reported, never silently
 *  absent from the result (the brief's "a route that fails to render is a reported error, never a
 *  silently missing file" rule). */
export interface FailedRoute {
  path: string;
  kind: ManifestRouteKind;
  reason: string;
}

export interface ExportedAsset {
  /** The site-relative URL this asset was fetched from, e.g. `/theme-assets/basic/css/base.css`. */
  url: string;
  outputFile: string;
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

function writeTextFile(filePath: string, contents: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents, "utf8");
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * A static host has no server-side redirect mechanism to hand this rule to, so the exported file
 * IS the redirect: an immediate `<meta http-equiv="refresh">` plus a visible fallback link, both
 * pointing at whatever the live app's real 3xx response actually said (see {@link writeRedirectRoute}
 * — never the manifest's own `redirectTarget`, which is only a cross-check hint).
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

async function writeContentRoute(route: ManifestRoute, baseUrl: string, outputDir: string): Promise<RouteWriteOutcome> {
  const res = await fetch(`${baseUrl}${route.path}`);
  if (res.status !== 200) {
    return { failed: { path: route.path, kind: route.kind, reason: `expected 200, got ${res.status}` } };
  }
  const html = await res.text();
  const outFile = contentRouteOutputFile(route.path, outputDir);
  writeTextFile(outFile, html);
  return { succeeded: { path: route.path, kind: route.kind, outputFile: path.relative(outputDir, outFile) }, html };
}

async function writeRedirectRoute(route: ManifestRoute, baseUrl: string, outputDir: string): Promise<RouteWriteOutcome> {
  const res = await fetch(`${baseUrl}${route.path}`, { redirect: "manual" });
  if (res.status < 300 || res.status >= 400) {
    return { failed: { path: route.path, kind: route.kind, reason: `expected a 3xx redirect response, got ${res.status}` } };
  }
  const location = res.headers.get("location") ?? route.redirectTarget;
  if (!location) {
    return { failed: { path: route.path, kind: route.kind, reason: "redirect response carried no Location header" } };
  }
  const outFile = contentRouteOutputFile(route.path, outputDir);
  writeTextFile(outFile, renderRedirectStub(location));
  return { succeeded: { path: route.path, kind: route.kind, outputFile: path.relative(outputDir, outFile) } };
}

/** The 404 probe is written to `<outputDir>/404.html` — not to its own sentinel path — matching
 *  the convention static hosts (Netlify, GitHub Pages, S3+CloudFront) already look for at the
 *  output root. */
async function writeNotFoundRoute(route: ManifestRoute, baseUrl: string, outputDir: string): Promise<RouteWriteOutcome> {
  const res = await fetch(`${baseUrl}${route.path}`);
  if (res.status < 400) {
    return { failed: { path: route.path, kind: route.kind, reason: `expected a non-2xx response for the 404 probe, got ${res.status}` } };
  }
  const body = await res.text();
  const outFile = path.join(outputDir, "404.html");
  writeTextFile(outFile, body);
  return { succeeded: { path: route.path, kind: route.kind, outputFile: "404.html" } };
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
    mkdirSync(path.dirname(outFile), { recursive: true });
    writeFileSync(outFile, buffer);
    succeeded.push({ url, outputFile: path.relative(outputDir, outFile) });

    if (url.endsWith(".css")) {
      for (const ref of extractCssUrls(buffer.toString("utf8"), url)) {
        if (!seen.has(ref)) queue.push(ref);
      }
    }
  }

  return { succeeded, failed };
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
export async function exportSite(options: ExportSiteOptions): Promise<ExportReport> {
  const { routeDeps, outputDir, clean = false } = options;
  prepareOutputDir(outputDir, clean);

  const manifest = await buildRouteManifest(routeDeps);
  const server = createServer(createApp(routeDeps));
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
          ? await writeRedirectRoute(route, baseUrl, outputDir)
          : route.kind === "not-found"
            ? await writeNotFoundRoute(route, baseUrl, outputDir)
            : await writeContentRoute(route, baseUrl, outputDir);

      if (outcome.succeeded) routesSucceeded.push(outcome.succeeded);
      if (outcome.failed) routesFailed.push(outcome.failed);
      if (outcome.html) {
        for (const url of extractAssetUrls(outcome.html)) assetUrls.add(url);
      }
    }

    const { succeeded: assetsSucceeded, failed: assetsFailed } = await fetchAssets([...assetUrls], baseUrl, outputDir);

    return {
      outputDir,
      routes: { succeeded: routesSucceeded, failed: routesFailed },
      assets: { succeeded: assetsSucceeded, failed: assetsFailed },
      skippedManifestEntries: manifest.skipped,
    };
  } finally {
    server.closeAllConnections?.();
    await closeServer(server);
  }
}
