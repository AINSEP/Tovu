/**
 * @file Post-build normalization from a framework's raw `code`-tier build output into Tovu's static-tier
 * on-disk contract (`static-asset-contract.ts`): the literal `TOKEN_STYLESHEET_SENTINEL` `<link>` tag and
 * the `../css/`/`../js/` asset-path shape `checkBuiltThemeConformance` (`build-conformance.ts`) enforces
 * at install time.
 *
 * Exists because no framework build tool emits this shape natively by configuration alone — see
 * `ADS-memory/reports/spikes/20260812-angular-code-tier-build-output-verification.md` for the empirical
 * verification this module is built from (real `ng build` output, not inference): Angular's own output
 * is flat (`dist/<project>/browser/{index.html,main.js,styles.css,...}`) with no configuration option to
 * split it into `css/`/`js/` subdirectories, and its default `optimization.styles.inlineCritical`
 * (Beasties) restructures the stylesheet `<link>` into an inlined `<style>` block plus an async-loading
 * `media="print" onload=...` link plus a duplicate `<noscript>` fallback — none of which can ever contain
 * the literal sentinel string regardless of path or hashing config. That spike doc's "End-to-end
 * validation" section hand-applied exactly the transform this module performs to real Angular SSG output
 * and confirmed it passes the ACTUAL `checkBuiltThemeConformance` (not a reimplementation) with zero
 * issues, before this module existed as production code.
 *
 * Split into a pure planning/rewriting core ({@link planAssetRelocation}, {@link rewriteBundlerHtml}) and
 * a thin filesystem-effectful wrapper ({@link normalizeBuildOutputDirectory}) — the decision of WHAT to
 * move and HOW to rewrite is unit-testable with in-memory strings; only the wrapper touches disk. This
 * mirrors `build-conformance.ts`'s own split between the pure `check*` functions and `walkGeneratedTree`'s
 * effectful walk.
 *
 * Scope: this normalizes a build's OUTPUT tree in place. It has no opinion on which framework produced
 * that output — Angular is the framework this module's design was verified against, but the transform
 * (relocate top-level `.css`/`.js` files into `css/`/`js/`, rewrite the referencing tags) is generic
 * enough to apply to any framework whose default output is similarly flat. `ThemeBuildInfo.framework`
 * (`theme.ts`) remains purely descriptive metadata, unrelated to this module.
 *
 * NOT yet handled by this module (see the spike doc's own "Known unverified risk" section):
 * CSS-internal relative `url(...)` references (background images, `@font-face` `src`) shift one directory
 * level when their stylesheet moves from the output root into `css/` — this module does not rewrite CSS
 * file CONTENTS, only the HTML tags referencing CSS/JS files by name. A theme whose stylesheet references
 * assets via a relative `url(...)` will need those made root-relative or otherwise unaffected by the move
 * before this module runs; there is no test proving this module handles that case because it does not
 * attempt to.
 */

import { lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { TOKEN_STYLESHEET_SENTINEL } from "./static-asset-contract";

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

/** {@link normalizeBuildOutputDirectory}'s result: what moved, and which on-disk page files were
 * rewritten in place. Returned rather than left implicit so a caller (a CLI, a build script) can log or
 * verify exactly what changed, instead of re-deriving it by diffing the directory itself. */
export interface NormalizeBuildOutputResult {
  readonly plan: AssetRelocationPlan;
  readonly rewrittenPageFiles: readonly string[];
}

/**
 * The thin filesystem-effectful wrapper around {@link planAssetRelocation} and {@link rewriteBundlerHtml}:
 * reads `outputDir`'s flat top-level listing, decides the relocation plan (pure), physically moves each
 * relocated file, then rewrites every named page file's HTML in place on disk (pure decision, effectful
 * write). All of this repository's actual matching/rewriting LOGIC lives in the two pure functions this
 * wraps — this function's own job is only sequencing real I/O around them, which is why it has no
 * dedicated unit tests of its own rewrite correctness (those live on the pure functions); its own tests
 * only need to prove the sequencing (files really moved, pages really got rewritten on disk).
 *
 * Directory entries are skipped, not relocated, even if their name happens to end in `.css`/`.js`/`.mjs`
 * — {@link planAssetRelocation}'s flat-output precondition is about FILES, and a same-named directory is
 * never something a real bundler emits, but skipping it here (via `lstatSync`) rather than deferring to
 * {@link planAssetRelocation}'s own path-separator check keeps this function's own contract (it hands
 * that function a flat FILE listing) honest without a special case leaking into the pure layer.
 *
 * @param required.outputDir - Absolute path to the build's flat output root (e.g. Angular's
 * `dist/<project>/browser/`). Mutated in place — files move, page files are overwritten.
 * @param required.pageFileNames - Which top-level `.html` files in `outputDir` are pages to rewrite (an
 * Angular SPA build emits exactly one, `index.html`; a prerendered multi-route build emits one per route).
 * @param required.primaryStylesheetFile - Passed through to {@link rewriteBundlerHtml} for every page.
 * @throws Whatever {@link planAssetRelocation} or {@link rewriteBundlerHtml} throw — a precondition
 * violation must stop the normalization, not leave the output directory partially rewritten and silently
 * declared done.
 * @complexity O(f + p·n) — f = top-level file count (one `readdirSync` + one move per relocated file), p
 * = page count, n = average page HTML length (one rewrite pass per page).
 */
export function normalizeBuildOutputDirectory(
  required: { outputDir: string; pageFileNames: readonly string[]; primaryStylesheetFile: string },
  _optional: Record<string, never> = {}
): NormalizeBuildOutputResult {
  const { outputDir, pageFileNames, primaryStylesheetFile } = required;

  const fileNames = readdirSync(outputDir).filter((name) => !lstatSync(join(outputDir, name)).isDirectory());
  const plan = planAssetRelocation({ fileNames });

  for (const relocation of plan.relocations) {
    const destination = join(outputDir, relocation.to);
    mkdirSync(dirname(destination), { recursive: true });
    renameSync(join(outputDir, relocation.from), destination);
  }

  for (const pageFileName of pageFileNames) {
    const pagePath = join(outputDir, pageFileName);
    const rewritten = rewriteBundlerHtml({ html: readFileSync(pagePath, "utf8"), plan, primaryStylesheetFile });
    writeFileSync(pagePath, rewritten, "utf8");
  }

  return { plan, rewrittenPageFiles: pageFileNames };
}
