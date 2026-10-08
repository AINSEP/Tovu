import type { RequestListener } from "node:http";
import path from "node:path";
import { exportSite as runExport, redirectOutcomeFor as redirectDecision } from "@jini-ai/devops/static-export";
import { createNodeAppFactory, createNodeArtifactWriter, createNodeAssetSource } from "@jini-ai/devops/static-export/node";
import { trackFetch, type ObservabilityPort } from "#src/platform/observability/index";
import { resolveThemeLayout } from "#src/features/theme/index";
import { buildRouteManifest, type RouteManifestDeps } from "./route-manifest.js";
import { withSecurityMeta } from "./static-security-headers.js";
export { ExportOutputNotEmptyError } from "@jini-ai/devops/static-export";
export type { ExportReport, ExportedRoute, FailedRoute, ExportedAsset, FailedAsset } from "@jini-ai/devops/static-export";
import type { ExportReport } from "@jini-ai/devops/static-export";
export { firstExportFailure, type ExportFailureSummary } from "./export-failure-summary.js";

// App boot is injected via createSiteApp(): importing server/app.ts, even lazily, would close
// the export/server cycle and can expose half-initialized boot state. The composition root binds
// that nullary factory once. Structural ExportSiteRouteDeps keep this feature independent of RouteDeps.
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
 * crawling each successfully-rendered page's own HTML for `href`/`src`/`srcset` references under the known
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
/** Written file, relative to `outputDir` — already deploy-relative, not an absolute path. */
/** The exact bytes written to `outputFile`. Always text: every route this exporter produces is
   *  HTML, XML (`sitemap.xml`), or plain text (`robots.txt`, a redirect stub). */
/** The real response's `Content-Type` header for a fetched route; a fixed, synthesized value for
   *  the redirect stub this exporter itself authors (see {@link writeRedirectRoute}) — that page was
   *  never fetched from anywhere, so there is no response header to read. `null` (as opposed to
   *  `undefined`) means a fetched response genuinely carried no `Content-Type` header — a real,
   *  spec-legal `Headers.get()` outcome, not a defensive placeholder; kept distinct from `undefined`
   *  (this field simply absent) rather than collapsed at the source, so a caller that cares about the
   *  distinction still can. See {@link toDeployFile} for where it is finally squashed to `undefined`
   *  for the one external shape that has no concept of `null` here. */
/** One route this exporter attempted and could NOT write — always reported, never silently
 *  absent from the result (the brief's "a route that fails to render is a reported error, never a
 *  silently missing file" rule). */
/** Same "reachable as data" reasoning as {@link ExportedRoute} — see that interface's own doc. */
/** The site-relative URL this asset was fetched from, e.g. `/theme-assets/basic/css/base.css`. */
/** Written file, relative to `outputDir` — already deploy-relative. */
/** The exact bytes written to `outputFile`. `Buffer`, not `string`: an asset may be binary
   *  (an image, a font) as readily as text (a stylesheet). */
/** The real response's `Content-Type` header. `null` means the fetched response genuinely carried
   *  none — see {@link ExportedRoute.contentType}'s own doc for why this is kept distinct from
   *  `undefined` rather than collapsed at the source. */
/** Manifest entries that could not even be attempted (e.g. non-`exact` redirect rules) — carried
   *  through from `RouteManifest.skipped` so one report names every known gap. */
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
/**
   * The normalized base path this export rewrote every root-relative reference for (e.g. `"/repo"`
   * for a GitHub Pages project site), or `undefined` when none was requested — the default,
   * byte-for-byte-unchanged apex-domain case. Set only when non-empty; see
   * {@link basePathRewriteWarning} for the disclosed limit that applies whenever this is set.
   */
/**
   * Present ONLY when `basePath` is set — a fixed disclosure, not a per-file diagnostic (there is
   * nothing to enumerate: a path a theme's own JavaScript builds at runtime from a string never
   * appears as text in a fetched response, so this rewrite cannot even detect that such a path
   * exists, let alone list it). Same "report the limit, don't claim completeness" treatment as
   * {@link unreferencedThemeFiles}, applied to a different, text-rewrite-shaped gap.
   */
/**
 * Re-exported from `./export-failure-summary.js`, where both symbols now live so that a caller
 * wanting only this check does not have to load this file's 65-module runtime graph (`express`,
 * `#src/features/theme/index`, and through it better-sqlite3/drizzle/handlebars/liquidjs) to run
 * ten lines of array reads. See that file's header for the full reasoning and the measurement.
 *
 * Deliberately re-exported rather than left for callers to import from the leaf: this module's
 * public surface predates the split, the barrel (`./index.ts`) re-exports both names from HERE,
 * and `__tests__/index.test.ts` asserts the barrel's `firstExportFailure` is reference-identical
 * to this module's. Dropping the re-export would break that identity and the barrel at once.
 */
/**
 * Everything {@link exportSite} needs, declared locally rather than importing `server/routes/
 * types.ts`'s `RouteDeps` (2026-08-20 RouteDeps-narrowing pass 2 — see the file-header note above
 * for the full trace). A structural superset of `route-manifest.ts`'s own `RouteManifestDeps`
 * (re-used here via `extends` rather than duplicated — `buildRouteManifest(routeDeps)` below needs
 * exactly that shape) plus the one extra field this file reads directly.
 *
 * `createSiteApp` is NULLARY (`() => RequestListener`, which the Express app satisfies), not
 * `(routeDeps: RouteDeps) => Express` — see that
 * field's own doc in `server/routes/types.ts` for why: it is bound to its own `routeDeps` ONCE, at
 * composition-root construction time, the same way `RouteDeps.exportSiteBound` already binds
 * `exportSite` itself.
 *
 * A real `RouteDeps` object (what `createApp`/`serve.ts` already build) always satisfies this
 * trivially; only a test needs to assemble one, and every route test in this repo already does via
 * `createRouteDeps()`.
 */
/** Traces each loopback render/asset fetch as one outbound span (method, host/port, status —
   *  never the route path). `RouteDeps.observability`; the no-op port in hermetic roots. */
/** The same composition-root object `createApp`/`server/deps.ts` already build — the exporter
   *  boots the real app with this, exactly like `cli/commands/serve.ts` does. */
/** By default, replace this export's files and keep unrelated files (removing files this process
   *  did not write is destructive — see `cli/commands/export.ts` for the `--clean` flag).
   *  Pass `true` to remove the directory's existing contents before writing. */
/**
   * When set (e.g. `"/my-repo"` for a GitHub Pages project site), every root-relative reference this
   * exporter writes — HTML `href`/`src`/`srcset`, `sitemap.xml`'s `<loc>`, `robots.txt`'s `Sitemap:` line, a
   * redirect stub's target — is rewritten to carry this prefix. Omitted/empty (the default) leaves
   * every byte this exporter writes IDENTICAL to a pre-`--base-path` export — proven by
   * `site-exporter.test.ts`'s own "unset is inert" regression test, not just asserted in this
   * comment.
   */
/** The legacy nonempty-output error remains re-exported for compatibility. */
/**
 * Ensures `outputDir` exists and is ready to receive an export: creates it if missing, preserves
 * existing contents by default, and only clears them when `clean` is explicitly `true`.
 *
 * @throws when output storage fails the path/symlink checks or a filesystem operation fails.
 * @complexity O(n) in the directory's own (typically small) top-level entry count.
 */
/** `"/"` -> `<outputDir>/index.html`; `"/about"` -> `<outputDir>/about/index.html` — the standard
 *  "pretty URL" static-export convention (Next.js/Hugo/Gatsby all use it), which any plain static
 *  file server resolves without extra rewrite config, and which matches Tovu's own live route shape
 *  (no `.html` suffix — `pages.ts`'s `GET /:slug` strips one if a visitor typed it). */
/** `kind: "well-known"` routes (`/robots.txt`, `/sitemap.xml`) are convention-addressed BY NAME —
 *  a crawler or browser requests them at that exact literal path, never through a link — so unlike
 *  every other content route, they must land at that literal filename, not wrapped in a
 *  `<name>/index.html` directory. */
// Fixed placeholder origin `safeHref` (below) resolves a claimed same-origin-relative href
// against, so "//evil.example" (protocol-relative) and "/\evil.example" (backslash-folded by a
// real browser) both resolve OFF this origin and get refused, the same reasoning
// `features/theme/static-render.ts`'s own copy of this constant documents at length.
/**
 * Scheme allowlist for a redirect-stub target, applied before {@link escapeHtmlAttr} embeds it
 * into `renderRedirectStub`'s three sinks. `escapeHtmlAttr` alone only neutralizes
 * quote/attribute-breakout characters — it does nothing to stop a `javascript:`/`data:` scheme
 * from executing once emitted into an `href`, the exact gap `a69f5892`/`0a41515c`
 * closed for every other comparable sink in `features/theme/static-render.ts` and
 * `server/inbound/public-http/http/site/render.ts`. THIS is a third, deliberate duplicate of
 * those two files' own byte-identical `safeHref` — not a shared import, because `features/site-export`
 * pulling a private helper out of either of those modules would need it exported first, widening
 * a surface neither module wants widened for one more caller; those two files already document
 * this exact "duplicate, don't share" precedent for the identical reason. If this logic changes,
 * BOTH of those copies must change too — none of the three update each other automatically.
 *
 * @returns the original value when it passes the allowlist, otherwise `"#"` — never a malformed or
 *   unsafe href, matching this codebase's "degrade, don't disappear" convention for a link target.
 * @complexity O(n) in the length of `value` (bounded by one `URL` parse); O(1) space.
 */
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
/** URL spans in a srcset, excluding descriptors. Read URLs through whitespace so a data URL's
 * commas stay inside its URL; trailing commas and commas after descriptors separate candidates.
 * @complexity O(n) in the attribute's length. */
    // Width/density descriptors contain no URLs; skip to the next candidate.
/** Rewrites every `href="…"`/`src="…"`/`srcset="…"` (single- OR double-quoted, matching
 *  `static-asset-contract.ts`'s own quote-echoing convention — `pages.ts`'s bare 404 fallback is
 *  observed to use single quotes, so both are real, not hypothetical) root-relative attribute value
 *  in one rendered HTML document. */
    // Replace backwards so offsets keep referring to the original attribute. Preserve descriptors,
    // spacing and data/external URLs, using the same prefix/idempotency rule as href/src.
/** Rewrites every `<loc>…</loc>` entry in a rendered `sitemap.xml` body. */
/** Rewrites the `Sitemap: …` line in a rendered `robots.txt` body (`robots.ts`'s own output shape —
 *  one `Sitemap:` line per advertised sitemap URL, each on its own line). */
/**
 * A static host has no server-side redirect mechanism to hand this rule to, so the exported file
 * IS the redirect: an immediate `<meta http-equiv="refresh">` plus a visible fallback link, both
 * pointing at whatever the live app's real 3xx response actually said (see {@link writeRedirectRoute}
 * — never the manifest's own `redirectTarget`, which is only a cross-check hint). `location` is
 * expected to already be base-path-prefixed by the caller when applicable — this function only
 * embeds it, the same "one place decides the path" split every rewrite above already follows.
 */
  // Scheme-checked FIRST, escaped second — matching every other href sink's `escapeHtml(safeHref(x))`
  // order in `render.ts`/`static-render.ts`. `safeHref` degrades an unsafe scheme to `"#"` rather
  // than refusing to render the page: this stub's whole job is being a working redirect, and a
  // `javascript:`/`data:` target was never a real destination to preserve. Used for all three
  // sinks (meta refresh, canonical, and the visible link's `href`) — the label text below is
  // separately escaped-only, matching this codebase's convention that display TEXT (never parsed
  // as a URL by the browser) doesn't need the scheme check a live `href`/`url=` attribute does.
/** Regex-based `href="…"`/`src="…"`/`srcset="…"` scan, not a full HTML parse — bounded and sufficient for this
 *  exporter's one job (find asset URLs under the three known public prefixes); it does not attempt
 *  to resolve inline event-handler URLs or any non-attribute reference. */
        // `String.prototype.split` always returns at least one element, so index 0 is always defined.
/** One bounded hop into a fetched CSS file's own `url(...)` references (fonts, background images),
 *  resolved against that CSS file's own path — CSS is the only asset type this exporter follows a
 *  reference out of; images/fonts/scripts are leaves. */
    // Capture group 2 is mandatory in this pattern (`([^'")]+)`, not optional) — always populated
    // whenever the surrounding match succeeds (see extractAssetUrls's own note on match[1]).
/**
 * Maps a fetched asset's site-relative URL to its output file, via `core/path-containment.ts`'s
 * shared `resolvePathWithin` — the same check `theme-static-assets.ts`'s `resolveThemeDir` applies
 * to a theme id. A URL extracted from rendered HTML is still, transitively, request-shaped input,
 * not a trusted literal, and the refusal is genuinely reachable: `extractAssetUrls` is a raw
 * `href`/`src`/`srcset` scan with NO URL normalization, so a rendered page that literally embeds a
 * `../`-laden value under an asset prefix passes its filter unchanged and reaches this function —
 * see `resolvePathWithin`'s own doc for the two escapes it refuses.
 */
  // `String.prototype.split` always returns at least one element, so index 0 is always defined.
/** Common return shape for the three per-kind route writers below, so the caller's loop can handle
 *  all three uniformly without a discriminated-union narrowing dance. `html` is populated only by
 *  {@link writeContentRoute} — it is the one kind whose body is worth crawling for asset refs; a
 *  redirect stub and a raw 404 body are both written verbatim already, nothing about them needs
 *  crawling for cross-references this exporter must additionally fetch. */
/** `robots.txt`/`sitemap.xml`'s literal well-known paths — shared between `route-manifest.ts` (which
 *  enumerates them) and the base-path rewrite below (which needs to pick the right rewrite shape per
 *  path). Not exported from `ports.ts`: nothing outside this file's own rewrite dispatch needs them
 *  as a named constant rather than the two literal manifest routes they already are. */
/** `Jini/packages/cms/src/seo/feed.ts`'s `FEED_PATH`. Written verbatim: see {@link rewriteRouteBodyForBasePath}. */
/**
 * Applies whichever base-path rewrite matches this route's real content shape — HTML for every
 * ordinary content/theme/product/not-found route, `<loc>` for the sitemap, the `Sitemap:` line for
 * robots.txt. A no-op (returns `body` unchanged) when `basePath` is `""` (rewriting off).
 */
  // The RSS feed is never rewritten: feed readers need absolute links, which the feed already
  // carries, and its only `href` is its own absolute `atom:link`.
/** Bounds a single fetch against the in-process loopback server this file just booted — generous
 *  enough that a genuinely slow (but working) render/asset response never trips it, but finite so a
 *  hung render (a runaway worker-thread sandbox, `render.ts`'s own concern — not this file's) fails
 *  the ONE affected route/asset instead of hanging the whole export forever. Mirrors the
 *  `AbortSignal.timeout` pattern already used for outbound fetches elsewhere in this codebase
 *  (`site-inspection/published-page.ts`, `external-mcp/admissions.ts`) rather than inventing a new
 *  one. Not overridable per call — no caller threads options through these fetches today. */
/**
 * Owner decision (2026-09-27, static-export chat-widget gap): a static export/publish carries no
 * `/api/site-assistant/chat` endpoint for the visitor-chat bubble to talk to, so the bubble must
 * never ship in exported HTML at all — regardless of the workspace's own `site.assistant
 * .public_enabled` setting, which stays untouched for the LIVE site. Sent as a plain request header
 * on every crawl request below rather than a `RouteDeps`/`routeDeps` field: this exporter's ephemeral
 * server and the main process's own live server can share the exact same `routeDeps` object (see
 * `exportSite`'s own doc, "including inside the agent daemon" vs. a concurrent live boot) — a
 * per-request header stays scoped to THIS crawl's own requests with no shared mutable state to race
 * a concurrent live request reading the same `routeDeps`. `routes/site/pages.ts`'s
 * `resolveSiteAssistantEnabledForRequest` is the other half of this switch: it short-circuits to
 * `false` the moment it sees this header, before ever consulting the real setting. Kept as a literal
 * string in both files rather than a shared import — `site-export` intentionally never imports from
 * `server/inbound/**` (this file's own header explains the module-cycle history that rule prevents) —
 * same "literal string kept in both files" tradeoff `render.ts`'s `SITE_ASSISTANT_MOUNT_ID` already
 * uses across the render.ts/site-chat module boundary.
 */
/** `init.headers` may be a `Headers` instance or entry array, which an object spread silently drops —
 *  normalized through `Headers` so the marker is added without losing a caller's own headers. */
/** The export's own loopback listener and the (traced) fetch every request to it goes through. */
/** The one place every fetch below goes through — adds the timeout, the {@link
 *  STATIC_EXPORT_REQUEST_HEADER} marker, and turns a thrown network or timeout failure into the
 *  same typed, non-throwing outcome `writeContentRoute` / `writeRedirectRoute` /
 *  `writeNotFoundRoute` / `fetchOneAsset` already return for an unexpected status code, so
 *  `exportSite`'s documented "never throws for an individual route or asset failure" contract
 *  (this file's own header) holds for a hung/refused fetch too, not only for a
 *  received-but-wrong-status response. */
  // A real, spec-legal `null` when the response has no Content-Type header — left as `string | null`
  // rather than coalesced to `undefined` here (see ExportedRoute.contentType's own doc): tests never
  // exercise a fetched response with no Content-Type at all, so a `?? undefined` conversion at this
  // call site would be an uncoverable branch. The one caller that needs strictly `string | undefined`
  // (toDeployFile, in an unrelated file) does that squash itself, at its own already-tested branch.
  // The CRAWL (below, via `html`) must see the RAW body — the live server has no concept of a base
  // path, so it still emits `/theme-assets/...` un-prefixed, which is exactly the URL the crawl must
  // request the asset FROM. Only the WRITTEN copy is rewritten; asset discovery and the on-disk
  // asset layout are entirely unaffected by `--base-path` (team-lead condition: rewriting is a pure
  // output-bytes transform, never a second render or a second fetch).
  // The live server's security headers do not travel with a static file; the one an HTML page can
  // carry itself goes into the page (`static-security-headers.ts`). Non-HTML routes stay verbatim.
/**
 * The whole "given this response and this route, what should happen" decision for a
 * `kind: "redirect"` route — a live 3xx with no `Location` header falls back to the manifest's own
 * `redirectTarget`; either missing fails. `Location` wins over `redirectTarget` when both are
 * present because the writer's job is to record what the live server actually did, not what the
 * rule declared (`ManifestRoute.redirectTarget`'s own doc). Pure and exported so the "no Location
 * AND no redirectTarget" failure is directly testable: `route-manifest.ts` never builds a redirect
 * route with an empty `redirectTarget`, so no real manifest route can produce that combination.
 */
/** Writes a `kind: "redirect"` manifest route by re-requesting it and applying
 *  {@link redirectOutcomeFor} to the real response — never the manifest's own `redirectTarget`
 *  alone, so the written stub always reflects what the live server actually answered with. */
  // Prefixed BEFORE constructing the stub, not by rewriting the stub's own HTML afterward — the
  // same "one place decides the path" split `prefixRootRelativePath` documents, applied directly
  // since this page's only path reference is the one value already in hand.
  // This page was authored locally (see renderRedirectStub's own doc), never fetched — there is no
  // response header to read, so contentType is a fixed value describing what was actually written.
/** The 404 probe is written to `<outputDir>/404.html` — not to its own sentinel path — matching
 *  the convention static hosts (Netlify, GitHub Pages, S3+CloudFront) already look for at the
 *  output root. */
  // Bounded on BOTH sides, matching redirectOutcomeFor's own `< 300 || >= 400` shape one status
  // class over: a genuine 404 page is a 4xx, full stop. Unbounded above, a 500 from a crashed
  // 404-page render would previously be ACCEPTED — its body written verbatim to <outputDir>/404.html
  // and the route reported as succeeded, shipping a broken page as the site's production 404 while
  // the export reports clean.
  // A real, spec-legal `null` when the response has no Content-Type header — left as `string | null`
  // rather than coalesced to `undefined` here (see ExportedRoute.contentType's own doc): tests never
  // exercise a fetched response with no Content-Type at all, so a `?? undefined` conversion at this
  // call site would be an uncoverable branch. The one caller that needs strictly `string | undefined`
  // (toDeployFile, in an unrelated file) does that squash itself, at its own already-tested branch.
/**
 * Fetches and writes one already-containment-checked asset to disk. Never throws — a non-OK
 * response comes back as a typed `failure` for the caller to record. `outFile` is trusted: the
 * caller ({@link fetchAssets}) has already refused anything `resolveAssetPathWithinOutputDir` would
 * refuse before this function is ever invoked, so no I/O happens on a hostile `url`. `cssRefs` is
 * the one-hop `url(...)` harvest from a `.css` asset's own body (empty for every other kind).
 */
  // A real, spec-legal `null` when the response has no Content-Type header — left as `string | null`
  // rather than coalesced to `undefined` here (see ExportedRoute.contentType's own doc): tests never
  // exercise a fetched response with no Content-Type at all, so a `?? undefined` conversion at this
  // call site would be an uncoverable branch. The one caller that needs strictly `string | undefined`
  // (toDeployFile, in an unrelated file) does that squash itself, at its own already-tested branch.
/**
 * Breadth-first fetch of every asset URL discovered while writing routes, following ONE extra hop
 * out of any fetched `.css` file for its own `url(...)` references. Already-seen URLs are fetched
 * at most once regardless of how many pages/stylesheets reference them. The containment check
 * (`resolveAssetPathWithinOutputDir`) runs here, before {@link fetchOneAsset} is ever called, so a
 * refused URL never reaches the network.
 *
 * @complexity O(A) HTTP requests for A distinct discovered asset URLs (each `.css` asset
 *   contributes at most its own reference count to the queue, bounded by the one-hop rule above —
 *   a CSS file's own referenced fonts/images are never themselves re-scanned for further `url(...)`
 *   references).
 */
/** Every file under `dir`, recursively, as paths relative to `dir` using forward slashes (matching
 *  the URL-path separator every `ASSET_URL_PREFIXES` comparison elsewhere in this file already
 *  uses, so callers never need to normalize `path.sep` themselves). */
/**
 * Diffs the active theme's own folder against everything this export actually wrote FROM it (a
 * rendered theme-page route, or a crawled/fetched asset), per {@link ExportReport.unreferencedThemeFiles}'s
 * own doc. `manifestRoutes` supplies the `<pagesDir>/<id>.html` exclusions (`pagesDir` is
 * `render/pages` for a schema-v2 theme, `pages` for v1) — `"index"`/`"404"` always (home and the
 * 404 probe render from them regardless of whether that render succeeded), plus every
 * `kind: "theme-page"` route's own page id, so a page the export ATTEMPTED (even one that failed —
 * already reported, with more detail, in `routes.failed`) is never ALSO reported here as if no code
 * path had touched it at all.
 *
 * @complexity O(F) file-system entries under the theme's folder, one `readdirSync` per directory —
 *   a theme folder is a handful of files/folders in practice, never a caller-controlled collection.
 */
  // `resolveThemeLayout` (`theme-layout.ts`, 2026-08-19 architecture audit findings 1 & 2) is the one
  // apiVersion-aware source of truth for schema v2's `render/pages/` vs v1's theme-root `pages/` —
  // `ManifestActiveTheme.apiVersion` is threaded from `theme.manifest.apiVersion` in
  // `route-manifest.ts` for exactly this. RE-AUDIT (2026-08-19, `gpt-5.6-sol` and `gpt-5.6-terra`
  // independently) found this call site still hand-rolled the same `apiVersion === 2 ? "render/pages"
  // : "pages"` branch the resolver exists to centralize — written in the SAME commit that introduced
  // the resolver to eliminate exactly this duplication. Values matched today (no live bug), but a
  // second independently-maintained copy is how the resolver's own six other pre-fix call sites
  // drifted in the first place.
/**
 * Exports the whole public site to `options.outputDir`: boots the real app in-process, enumerates
 * every route via {@link buildRouteManifest}, fetches each one over real HTTP, and writes the
 * response to disk — content routes as `<slug>/index.html`, redirects as a static meta-refresh
 * stub, the 404 probe as `404.html` at the root — then crawls the successfully-written HTML for
 * asset references and fetches those too.
 *
 * Never throws for an individual route or asset failure — each is recorded in the returned report
 * (`routes.failed`/`assets.failed`) so a caller can print an honest summary; it DOES throw
 * up front (before booting anything) when output storage is unsafe or inaccessible, and
 * propagates any error from booting the app itself uncaught.
 *
 * @complexity O(R + A) HTTP requests for R manifest routes and A discovered asset URLs — see
 *   {@link fetchAssets}'s own complexity note for the asset side. All routes are fetched serially,
 *   not concurrently: `better-sqlite3`-backed repos are synchronous per call, and this file's own
 *   job is fidelity over throughput — every export is a bounded, human-triggered operation on one
 *   workspace's content, not a hot path.
 */
/** Printed/reported only when `--base-path` is actually set — see `ExportReport.basePathRewriteWarning`'s
 *  own doc for why this cannot be a per-file list the way `unreferencedThemeFiles` is. */
/** Dispatches one manifest route to the writer matching its kind. */
/** Writes every manifest route to disk, collecting succeeded/failed routes plus every asset URL discovered in their HTML. */
/** `unreferencedThemeFiles` needs a theme to diff against — no theme discovered means nothing to report. */
  // Injected via `RouteDeps.createSiteApp` (see the file-header note and that field's own doc in
  // `server/routes/types.ts`) rather than imported from `server/app.ts` — no `require` left here at
  // all, lazy or otherwise. Nullary as of 2026-08-20 (RouteDeps-narrowing pass 2) — already closed
  // over its own `routeDeps` at composition-root construction time, so no argument is passed here.
  // LAN-bind plan: this temporary server previously bound every interface (Node's own
  // default) for the length of an export. Its own client below always dials `127.0.0.1` anyway
  // (`baseUrl`), so restricting the bind to `127.0.0.1` costs nothing and closes a brief
  // LAN-reachable window.
    // The global `fetch` read per call, so a test that swaps it is still honored.
    // Asset discovery/fetch/output-layout is entirely basePath-agnostic (see writeContentRoute's own
    // comment) — no rewrite is applied here, by design, not by omission.

export interface ExportSiteRouteDeps extends RouteManifestDeps {
  readonly createSiteApp: () => RequestListener;
  /** Traces each loopback render/asset fetch as one outbound span (method, host/port, status —
   *  never the route path). `RouteDeps.observability`; the no-op port in hermetic roots. */
  readonly observability: ObservabilityPort;
}

export interface ExportSiteOptions {
  /** The same composition-root object `createApp`/`server/deps.ts` already build — the exporter
   *  boots the real app with this, exactly like `cli/commands/serve.ts` does. */
  routeDeps: ExportSiteRouteDeps;
  outputDir: string;
  /** By default, replace this export's files and keep unrelated files (removing files this process
   *  did not write is destructive — see `cli/commands/export.ts` for the `--clean` flag).
   *  Pass `true` to remove the directory's existing contents before writing. */
  clean?: boolean;
  /**
   * When set (e.g. `"/my-repo"` for a GitHub Pages project site), every root-relative reference this
   * exporter writes — HTML `href`/`src`/`srcset`, `sitemap.xml`'s `<loc>`, `robots.txt`'s `Sitemap:` line, a
   * redirect stub's target — is rewritten to carry this prefix. Omitted/empty (the default) leaves
   * every byte this exporter writes IDENTICAL to a pre-`--base-path` export — proven by
   * `site-exporter.test.ts`'s own "unset is inert" regression test, not just asserted in this
   * comment.
   */
  basePath?: string;
}


/** Legacy decision signature, forwarded to the one export owner. */
export function redirectOutcomeFor(status: number, locationHeader: string | null, manifestTarget: string | undefined) {
  return redirectDecision({ status, locationHeader }, { ...(manifestTarget !== undefined ? { manifestTarget } : {}) });
}

/** Compose the real CMS manifest/theme/security policy with Jini's export engine. */
export async function exportSite({ routeDeps, outputDir, clean, basePath }: ExportSiteOptions): Promise<ExportReport> {
  const tracedFetch = trackFetch({ fetch: (input, init) => fetch(input, init), observability: routeDeps.observability });
  return runExport({
    outputDir: path.resolve(outputDir),
    manifest: { build: () => buildRouteManifest(routeDeps) },
    app: createNodeAppFactory({ createApp: () => routeDeps.createSiteApp() }, {}),
    writer: createNodeArtifactWriter({}, {}),
    fetch: ({ url }, options) => tracedFetch(url, options?.init),
    assetSource: createNodeAssetSource({}, {}),
    themeLayout: { resolve: ({ theme }) => ({
      pagesDir: resolveThemeLayout(theme.apiVersion as 2 | undefined).pagesDir,
      assetUrlPrefix: `/theme-assets/${theme.id}/`,
    }) },
    assetUrlPrefixes: ["/theme-assets/", "/agent-icons/", "/m/"],
    requestHeaders: { "x-tovu-static-export": "1" },
    security: { transformHtml: ({ html }) => withSecurityMeta(html) },
    errorPage: { outputFile: "404.html", acceptStatus: ({ status }) => status >= 400 && status < 500,
      rejectionReason: ({ status }) => `expected a 4xx response for the 404 probe, got ${status}` },
    assetPathFailureReason: "asset URL resolved outside the output directory — refused",
    describeError: ({ error }) => error instanceof Error ? error.message : String(error),
  }, { ...(clean !== undefined ? { clean } : {}), ...(basePath !== undefined ? { basePath } : {}) }).then(report => ({ ...report, outputDir }));
}
