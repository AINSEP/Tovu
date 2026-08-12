/**
 * @file Post-build normalization from a framework's raw `code`-tier build output into Tovu's static-tier
 * on-disk contract (`static-asset-contract.ts`): the literal `TOKEN_STYLESHEET_SENTINEL` `<link>` tag and
 * the `../css/`/`../js/` asset-path shape `checkBuiltThemeConformance` (`build-conformance.ts`) enforces
 * at install time.
 *
 * Exists because no framework build tool emits this shape natively by configuration alone — see
 * `ADS-memory/reports/spikes/20260812-angular-code-tier-build-output-verification.md` for the empirical
 * verification this module is built from (real `ng build` output, not inference).
 *
 * ## Required build configuration (Angular) — not optional, not a footnote
 *
 * A theme author building with Angular MUST set BOTH of these on the `production` build configuration
 * before this normalizer's preconditions hold:
 *
 * - `outputHashing: "none"` — without it, Angular hashes bundle filenames (`main-<HASH>.js`), which this
 *   module has no way to predict or match against `primaryStylesheetFile`.
 * - `optimization.styles.inlineCritical: false` — this is the more important of the two, and the one a
 *   "designed but unverified" version of this normalizer would have missed: Angular's default production
 *   optimization runs Beasties (critical-CSS inlining), which rewrites the plain `<link rel="stylesheet">`
 *   into an inlined `<style>` block plus an async-loading `<link media="print" onload="this.media='all'">`
 *   plus a duplicate `<noscript><link></noscript>` fallback. None of those shapes can ever contain the
 *   literal sentinel string, regardless of path or hashing config — {@link rewriteBundlerHtml} THROWS
 *   rather than silently ships a page missing the sentinel when it finds this shape instead of the plain
 *   tag, specifically because this is the setting most likely to be missed.
 *
 * ## Product statement: "Angular support" means PRERENDERED Angular only
 *
 * A CSR-only Angular build ships `<app-root></app-root>` — a literally empty mount point — as the page's
 * raw HTML; all real content arrives only after client-side hydration. That is invisible to GPTBot,
 * ClaudeBot, and PerplexityBot (none execute JavaScript) and delayed for Googlebot's two-phase indexing,
 * for the ENTIRE page, not just one `data-tovu-island` element — worse than the empty-island case
 * `checkIslandContent` (`build-conformance.ts`) already guards against. A theme built for Tovu MUST
 * run `ng add @angular/ssr` with `outputMode: "static"` and prerender every route that needs to be
 * indexable. This module does not enforce that — it normalizes whatever HTML it is given — so a theme
 * author skipping prerendering will not be stopped here; they will ship a page that passes every
 * conformance rule in this codebase while being invisible to the crawlers that matter.
 *
 * ## Design
 *
 * Split into a pure planning/rewriting core ({@link planAssetRelocation}, {@link rewriteBundlerHtml},
 * {@link rewriteCssRelativeUrls}) and a thin filesystem-effectful wrapper
 * ({@link normalizeBuildOutputDirectory}) — the decision of WHAT to move and HOW to rewrite is
 * unit-testable with in-memory strings; only the wrapper touches disk. This mirrors `build-conformance.ts`'s
 * own split between the pure `check*` functions and `walkGeneratedTree`'s effectful walk.
 *
 * Scope: this normalizes a build's OUTPUT tree in place. It has no opinion on which framework produced
 * that output — Angular is the framework this module's design was verified against, but the transform
 * (relocate top-level `.css`/`.js` files into `css/`/`js/`, rewrite the referencing tags) is generic
 * enough to apply to any framework whose default output is similarly flat. `ThemeBuildInfo.framework`
 * (`theme.ts`) remains purely descriptive metadata, unrelated to this module.
 *
 * ## Resolved risks (previously flagged, now handled)
 *
 * - **CSS-internal relative `url(...)` references** (background images, `@font-face` `src`) shift one
 *   directory level when their stylesheet moves from the output root into `css/` — `url(favicon.ico)`
 *   resolved from the output root, but resolves to the WRONG file (`css/favicon.ico`, which doesn't exist)
 *   once the stylesheet carrying it lives one level deeper. {@link rewriteCssRelativeUrls} prepends `../`
 *   to every relative `url(...)` reference in a relocated CSS file's content (skipping absolute URLs,
 *   scheme-prefixed URLs like `data:`, root-relative `/...`, protocol-relative `//...`, and bare
 *   fragments `#...`, none of which are affected by the directory shift), and
 *   {@link normalizeBuildOutputDirectory} runs it on every relocated CSS file automatically. NOT handled:
 *   a bare `@import "other.css";` (the quoted-string import form without a `url(...)` wrapper) — only the
 *   `url(...)` form is rewritten, matching what Angular's own build emits for component/global styles.
 * - **`index.csr.html`** — the CSR-fallback shell `ng add @angular/ssr` also emits into the output root
 *   alongside the prerendered `index.html`. Tovu's static-tier serving model has no client-side router to
 *   fall back to (`loadStaticTierAssets` serves each theme page's own prerendered HTML directly, one entry
 *   per route) — this file is dead weight that would otherwise trip `checkArtifactHashes`'s full-tree
 *   inventory rule as an unlisted file with no reason to be hashed and shipped.
 *   {@link normalizeBuildOutputDirectory} deletes it (see {@link DISCARDED_FRAMEWORK_ARTIFACTS}).
 *
 * ## Still open
 *
 * A `.js.map`/`.css.map` sourcemap file does not end in `.js`/`.css`, so {@link planAssetRelocation}
 * leaves it at the output root while its corresponding bundle moves into `js/`/`css/` — the bundle's own
 * `//# sourceMappingURL=` comment then points at a relative filename that no longer resolves from the
 * bundle's new location. Not exercised by any test here (the validated build config uses
 * `sourceMap: false`, so it never surfaced empirically); a theme build with source maps enabled needs
 * this module extended (relocate `*.map` alongside its bundle) before shipping.
 *
 * **This module has ZERO callers as of 2026-08-12.** Nothing in this repository invokes
 * {@link normalizeBuildOutputDirectory} outside its own test file — there is no CLI entrypoint, no
 * `package.json` script, no reference from `theme.ts`'s manifest/loader path, no wiring into
 * `checkBuiltThemeConformance`'s install-time gate (which validates an ALREADY-normalized theme's output;
 * it has no opinion on how that output got normalized). This is deliberate scoping, not an oversight — the
 * task this module was built for was the gate and the transform's correctness, not deciding who runs it —
 * but it means this module is inert until wired up. Wiring it would mean: (1) deciding WHO invokes it —
 * most likely a standalone CLI/script an Angular theme author runs locally or in their own CI after
 * `ng build`, consistent with this codebase's "Tovu never runs the build" decision
 * (`build-conformance.ts`'s file header cites the same `worker_threads`-isn't-code-isolation reasoning);
 * running it server-side inside Tovu's own process would be a different, larger architectural decision,
 * not an extension of this module; (2) an entrypoint accepting (or deriving from `angular.json`/
 * `theme.json`) the `outputDir`/`pageFileNames`/`primaryStylesheetFile` this module's functions currently
 * require the caller to supply explicitly; (3) theme-authoring documentation describing the full
 * `ng build` → normalize → compute `artifactHashes` → publish workflow end to end, since no such workflow
 * is written down anywhere yet.
 */

import { lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { TOKEN_STYLESHEET_SENTINEL } from "./static-asset-contract";

/** Framework-emitted output files this module deletes outright rather than relocating or leaving in
 * place — see this module's file header ("Resolved risks") for why each entry is here. A file only
 * belongs on this list if Tovu's serving model has NO path that would ever read it; deleting a file
 * something still needs would be a silent breakage worse than the vacuous-pass problem this whole
 * normalizer/gate pairing exists to close. */
const DISCARDED_FRAMEWORK_ARTIFACTS: ReadonlySet<string> = new Set(["index.csr.html"]);

/** One top-level output file's relocation: `from` is its original flat filename (no path separators —
 * this module only reasons about files sitting directly in the build's output root, matching what a flat
 * bundler output like Angular's actually produces), `to` is where it belongs under Tovu's contract. */
export interface AssetRelocation {
  readonly from: string;
  readonly to: string;
}

/** How a build's flat output root maps onto Tovu's `css/`/`js/` split. Kept as data (not applied as a
 * side effect here) so {@link rewriteBundlerHtml} and {@link normalizeBuildOutputDirectory} can each
 * consume the same decision without re-deriving it. */
export interface AssetRelocationPlan {
  readonly relocations: readonly AssetRelocation[];
}

/**
 * Classifies a flat build-output file listing into what needs to move where. A file only moves if its
 * name ends in `.css`, `.js`, or `.mjs` — everything else (HTML pages, `favicon.ico`, an already-nested
 * `media/` asset) is left exactly where the build put it; Tovu's asset-path contract only ever concerns
 * itself with `../css/`/`../js/` references, so only those two extensions are this function's business.
 *
 * @param required.fileNames - Every file sitting directly in the build's flat output root (e.g. Angular's
 * `dist/<project>/browser/`). Subdirectory entries (already-nested paths containing `/`) are rejected —
 * see `@throws` — because a build whose output ISN'T flat is not the case this module exists to fix, and
 * silently no-op'ing on an already-nested `css/main.css` would hide that assumption breaking rather than
 * surface it.
 * @throws {RangeError} If any entry in `fileNames` contains a path separator.
 * @complexity O(n) over `fileNames`.
 */
export function planAssetRelocation(required: { fileNames: readonly string[] }, _optional: Record<string, never> = {}): AssetRelocationPlan {
  const { fileNames } = required;
  const relocations: AssetRelocation[] = [];

  for (const name of fileNames) {
    if (name.includes("/") || name.includes("\\")) {
      throw new RangeError(
        `planAssetRelocation expects a FLAT build-output root, but got '${name}' — a build whose output already has subdirectories is not the flat-output case this normalizer exists to fix; verify the build config (see this module's file header)`
      );
    }
    if (name.endsWith(".css")) {
      relocations.push({ from: name, to: `css/${name}` });
    } else if (name.endsWith(".js") || name.endsWith(".mjs")) {
      relocations.push({ from: name, to: `js/${name}` });
    }
  }

  return { relocations };
}

/** Escapes every regex metacharacter in `value` so it can be embedded literally inside a `RegExp` source
 * string — filenames are build output, not attacker input, but a `.` in `styles.css` must still match
 * only a literal dot, not "any character", or `stylesXcss` would wrongly match too. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrites every bare-filename `href="fileName"`/`src="fileName"` occurrence in `html` to
 * `${attr}="${replacementValue}"` — anchored so the ENTIRE attribute value must equal `fileName` exactly
 * (same quote character on both sides), not merely contain it as a substring, so `main.js` never
 * accidentally matches inside `vendor-main.js` or a query-stringed `main.js?v=2`. Preserves every other
 * attribute on the tag untouched (only the one attribute value changes) — a `<script>`'s `type="module"`
 * or a `<link>`'s other attributes survive the rewrite verbatim.
 *
 * @complexity O(n) over `html`'s length — one regex scan per call.
 */
function rewriteExactBareAttributeValue(html: string, attr: "href" | "src", fileName: string, replacementValue: string): string {
  const pattern = new RegExp(`(${attr}=)(["'])${escapeForRegExp(fileName)}\\2`, "g");
  return html.replace(pattern, (_match, attrEquals: string, quote: string) => `${attrEquals}${quote}${replacementValue}${quote}`);
}

/**
 * Applies an {@link AssetRelocationPlan} to one page's raw HTML: every relocated `.css`/`.js`/`.mjs` file
 * that page's `<link>`/`<script>` tags reference by its ORIGINAL flat filename gets that reference
 * rewritten to the new `../css/`/`../js/`-relative location. The theme's single primary stylesheet
 * (`primaryStylesheetFile`, matching `angular.json`'s configured global-styles entry point) is handled
 * specially: rather than rewriting just its `href` attribute, the WHOLE `<link rel="stylesheet" ...>` tag
 * the build emitted is replaced with {@link TOKEN_STYLESHEET_SENTINEL} verbatim — the exact literal string
 * `checkBuiltThemeConformance`'s stylesheet-sentinel rule requires, imported from the single source of
 * truth (`static-asset-contract.ts`) rather than reconstructed here, so the two can never drift apart.
 *
 * @param required.html - One page's raw build-output HTML (e.g. Angular's emitted `index.html`).
 * @param required.plan - From {@link planAssetRelocation}, run over the SAME build's flat output listing.
 * @param required.primaryStylesheetFile - The relocated CSS file's original flat name that should become
 * the sentinel — e.g. `"styles.css"` when `angular.json`'s `styles` array names its one global entry
 * `src/styles.css` and `outputHashing` is `"none"` (Angular names the output bundle after the source
 * file's basename in that configuration — verified in the spike doc cited in this module's header).
 * @returns The page's HTML with every relocated asset reference rewritten.
 * @throws {Error} If `primaryStylesheetFile` names a file the plan does not relocate as CSS, or if the
 * expected plain `<link rel="stylesheet" href="${primaryStylesheetFile}">` tag shape is not found in
 * `html` — a precondition mismatch (e.g. Beasties' critical-CSS inlining left enabled) must surface
 * loudly here rather than silently ship a page missing the sentinel; see this module's file header for
 * why that precondition (`optimization.styles.inlineCritical: false`) is required upstream, in the build
 * config, not patched around after the fact.
 * @complexity O(r · n) — r = relocated files referenced, n = `html`'s length (each rewrite re-scans).
 */
export function rewriteBundlerHtml(
  required: { html: string; plan: AssetRelocationPlan; primaryStylesheetFile: string },
  _optional: Record<string, never> = {}
): string {
  const { plan, primaryStylesheetFile } = required;
  let { html } = required;

  const primaryRelocation = plan.relocations.find((r) => r.from === primaryStylesheetFile && r.from.endsWith(".css"));
  if (!primaryRelocation) {
    throw new Error(
      `rewriteBundlerHtml: primaryStylesheetFile '${primaryStylesheetFile}' is not among the plan's relocated CSS files — check angular.json's 'styles' entry point matches this value`
    );
  }

  const plainStylesheetTag = `<link rel="stylesheet" href="${primaryStylesheetFile}">`;
  if (!html.includes(plainStylesheetTag)) {
    throw new Error(
      `rewriteBundlerHtml: expected the plain build-output tag ${JSON.stringify(plainStylesheetTag)} in the page HTML but did not find it — ` +
        `if the build's critical-CSS inlining (Beasties) is still enabled, disable it via optimization.styles.inlineCritical: false ` +
        `(see ADS-memory/reports/spikes/20260812-angular-code-tier-build-output-verification.md, finding 4)`
    );
  }
  html = html.split(plainStylesheetTag).join(TOKEN_STYLESHEET_SENTINEL);

  for (const relocation of plan.relocations) {
    if (relocation.from === primaryStylesheetFile) continue; // already handled above, as the sentinel
    const attr = relocation.from.endsWith(".css") ? "href" : "src";
    html = rewriteExactBareAttributeValue(html, attr, relocation.from, `../${relocation.to}`);
  }

  return html;
}

/** Matches a CSS `url(...)` function, capturing an optional surrounding quote (`'`/`"`, or none) and the
 * raw URL content between the parens. Does not attempt to handle an escaped quote or parenthesis INSIDE
 * the URL itself (`url('foo\'bar.png')`) — a real but narrower gap than the directory-shift problem this
 * exists to fix, and not a shape any bundler in this codebase's toolchain emits (matching the precedent
 * `rewriteAssetPaths`'s own doc in `static-asset-contract.ts` sets for scoping a regex to observed shapes
 * rather than every theoretical one). */
const CSS_URL_FUNCTION = /url\(\s*(["']?)([^"')]*)\1\s*\)/gi;

/** Whether a CSS `url(...)` reference is affected by its stylesheet moving one directory level deeper —
 * true for an ordinary relative path (`foo.png`, `../fonts/x.woff2`, `media/logo.png`), false for
 * anything already independent of the stylesheet's own location: a URL scheme (`data:`, `http:`, ...), a
 * protocol-relative (`//cdn...`) or root-relative (`/...`) path, a bare fragment (`#...`), or empty. */
function isRelativeCssUrl(value: string): boolean {
  if (value.length === 0) return false;
  if (value.startsWith("#")) return false;
  if (value.startsWith("/")) return false; // covers both root-relative '/x' and protocol-relative '//x'
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false; // has an explicit scheme, e.g. data:, http:, https:
  return true;
}

/**
 * Prepends `../` to every relative `url(...)` reference in a CSS file's own content — the compensation a
 * stylesheet needs when {@link normalizeBuildOutputDirectory} relocates it one directory level deeper
 * (output root → `css/`). `url(favicon.ico)` resolved against the output root before the move; after the
 * move, the SAME reference resolves against `css/` instead, which is the wrong location unless every such
 * reference gains one more `../` to compensate. Scheme-prefixed, root-relative, protocol-relative, and
 * fragment-only URLs are left untouched — see {@link isRelativeCssUrl}.
 *
 * @complexity O(n) over `cssContent`'s length — one regex scan.
 */
export function rewriteCssRelativeUrls(cssContent: string): string {
  return cssContent.replace(CSS_URL_FUNCTION, (match, quote: string, rawUrl: string) => {
    if (!isRelativeCssUrl(rawUrl)) return match;
    return `url(${quote}../${rawUrl}${quote})`;
  });
}

/** {@link normalizeBuildOutputDirectory}'s result: what moved, what was rewritten, and what was deleted.
 * Returned rather than left implicit so a caller (a CLI, a build script) can log or verify exactly what
 * changed, instead of re-deriving it by diffing the directory itself. */
export interface NormalizeBuildOutputResult {
  readonly plan: AssetRelocationPlan;
  readonly rewrittenPageFiles: readonly string[];
  readonly discardedFiles: readonly string[];
}

/**
 * The thin filesystem-effectful wrapper around this module's pure planning/rewriting functions: deletes
 * {@link DISCARDED_FRAMEWORK_ARTIFACTS}, reads `outputDir`'s remaining flat top-level listing, decides the
 * relocation plan ({@link planAssetRelocation}, pure), physically moves each relocated file (rewriting a
 * moved CSS file's own `url(...)` references via {@link rewriteCssRelativeUrls} immediately after it
 * lands at its new location), then rewrites every named page file's HTML in place on disk
 * ({@link rewriteBundlerHtml}, pure decision + effectful write). All of this repository's actual
 * matching/rewriting LOGIC lives in the pure functions this wraps — this function's own job is only
 * sequencing real I/O around them, which is why it has no dedicated unit tests of its own rewrite
 * correctness (those live on the pure functions); its own tests only need to prove the sequencing (files
 * really moved, pages really got rewritten on disk, discarded files are really gone).
 *
 * Directory entries are skipped, not relocated, even if their name happens to end in `.css`/`.js`/`.mjs`
 * — {@link planAssetRelocation}'s flat-output precondition is about FILES, and a same-named directory is
 * never something a real bundler emits, but skipping it here (via `lstatSync`) rather than deferring to
 * {@link planAssetRelocation}'s own path-separator check keeps this function's own contract (it hands
 * that function a flat FILE listing) honest without a special case leaking into the pure layer.
 *
 * @param required.outputDir - Absolute path to the build's flat output root (e.g. Angular's
 * `dist/<project>/browser/`). Mutated in place — files move or are deleted, page files are overwritten.
 * @param required.pageFileNames - Which top-level `.html` files in `outputDir` are pages to rewrite (an
 * Angular SPA build emits exactly one, `index.html`; a prerendered multi-route build emits one per route).
 * @param required.primaryStylesheetFile - Passed through to {@link rewriteBundlerHtml} for every page.
 * @throws Whatever {@link planAssetRelocation} or {@link rewriteBundlerHtml} throw — a precondition
 * violation must stop the normalization, not leave the output directory partially rewritten and silently
 * declared done.
 * @complexity O(f + p·n + c·m) — f = top-level file count (one `readdirSync` + one move per relocated
 * file), p = page count, n = average page HTML length, c = relocated CSS file count, m = average CSS
 * file length (one `rewriteCssRelativeUrls` pass per relocated CSS file).
 */
export function normalizeBuildOutputDirectory(
  required: { outputDir: string; pageFileNames: readonly string[]; primaryStylesheetFile: string },
  _optional: Record<string, never> = {}
): NormalizeBuildOutputResult {
  const { outputDir, pageFileNames, primaryStylesheetFile } = required;

  const allFileNames = readdirSync(outputDir).filter((name) => !lstatSync(join(outputDir, name)).isDirectory());
  const discardedFiles = allFileNames.filter((name) => DISCARDED_FRAMEWORK_ARTIFACTS.has(name));
  for (const name of discardedFiles) {
    unlinkSync(join(outputDir, name));
  }

  const fileNames = allFileNames.filter((name) => !DISCARDED_FRAMEWORK_ARTIFACTS.has(name));
  const plan = planAssetRelocation({ fileNames });

  for (const relocation of plan.relocations) {
    const destination = join(outputDir, relocation.to);
    mkdirSync(dirname(destination), { recursive: true });
    renameSync(join(outputDir, relocation.from), destination);
    if (relocation.from.endsWith(".css")) {
      writeFileSync(destination, rewriteCssRelativeUrls(readFileSync(destination, "utf8")), "utf8");
    }
  }

  for (const pageFileName of pageFileNames) {
    const pagePath = join(outputDir, pageFileName);
    const rewritten = rewriteBundlerHtml({ html: readFileSync(pagePath, "utf8"), plan, primaryStylesheetFile });
    writeFileSync(pagePath, rewritten, "utf8");
  }

  return { plan, rewrittenPageFiles: pageFileNames, discardedFiles };
}
