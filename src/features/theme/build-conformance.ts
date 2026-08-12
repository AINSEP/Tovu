import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { findUnrewrittenAssetPaths, rewriteAssetPaths, TOKEN_STYLESHEET_SENTINEL } from "./static-asset-contract";

/**
 * @file The install-time conformance gate a `build.source: "compiled"` theme (ADR-020 §5) must pass
 * before `loadTheme()` accepts it as `status: "valid"`.
 *
 * Why this exists at all: the headline decision on framework-authored themes is "frameworks compile at
 * build time down to the existing `static` contract; Tovu never runs the build." That contract is
 * currently enforced only by convention — `static-render.ts` string-matches a LITERAL stylesheet tag
 * and a LITERAL `../css/`/`../js/` asset-path shape, and silently degrades (a console warning, not a
 * rejection) when a page doesn't carry them. That degradation is an acceptable failure mode for a
 * human hand-authoring HTML, who sees the broken page immediately. It is not acceptable for a bundler's
 * output landing in the theme catalog unreviewed: a build that renames the stylesheet, hashes an asset
 * path, or minifies away the sentinel would ship a page with silently missing tokens and dead assets
 * with NO error anywhere. This module is what turns that into a hard, install-time rejection instead —
 * `loadTheme()` never serves an invalid theme's pages, so a build that fails this gate never reaches a
 * visitor at all (see this repo's `SPEC-004 REQ-10` fault-isolation contract this module extends).
 *
 * Reuses `static-asset-contract.ts`'s sentinel constant and rewrite/detect pair rather than
 * re-implementing the same regex here — the whole point is that this gate checks the SAME contract
 * `static-render.ts` depends on at request time, not a parallel approximation of it that could drift.
 *
 * Only ever called from `loadTheme()` for a `manifest.build?.source === "compiled"` theme (see that
 * function's own call site). An authored theme (every theme on disk today, `build` absent) never runs
 * these checks — this module changes nothing about the 7 live themes' validation.
 */

/**
 * Marks one element as a hydration island: interactivity added ON TOP of content that must already be
 * present, server-rendered, in the raw HTML — never the mechanism that first-paints that content.
 *
 * The reason this is enforced at all: GPTBot, ClaudeBot, and PerplexityBot execute no JavaScript
 * whatsoever and see only this raw HTML; Bingbot's JS support is partial; even Googlebot's rendered-
 * content indexing is a delayed second pass, not immediate. An island whose content only exists after
 * client-side hydration is therefore invisible to most of the traffic that matters for indexing, not
 * just a graceful-degradation edge case.
 *
 * A plain `data-*` marker on any element (not a dedicated custom tag) — the same vocabulary shape as
 * this codebase's existing `data-embed-type`/`data-tovu-slot` markers, deliberately distinct from them:
 * an embed marker is resolved by the SERVER at request time; `data-tovu-island` is resolved by the BUILD
 * at compile time and the server never touches it, so reusing the embed vocabulary here would misstate
 * which layer owns it.
 */
const ISLAND_MARKER = /<([a-z][a-z0-9-]*)\b[^>]*\bdata-tovu-island\b[^>]*>([\s\S]*?)<\/\1>/gi;

/** One conformance failure, always naming which page and which rule. */
export interface ConformanceIssue {
  readonly page: string;
  readonly rule: "stylesheet-sentinel" | "asset-path" | "island-content" | "artifact-hash";
  readonly message: string;
}

/**
 * How many times `needle` occurs in `haystack`, non-overlapping. `String.split(needle).length - 1` is
 * the plain-string-count idiom this codebase already reaches for over a regex when the needle has no
 * pattern metacharacters worth escaping (the sentinel is a fixed literal).
 */
function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * A built page must carry {@link TOKEN_STYLESHEET_SENTINEL} EXACTLY ONCE — zero means token injection
 * silently no-ops (`static-render.ts`'s own runtime warning for this same condition), more than one
 * means the runtime's single `.replace()` only tokens the first occurrence and leaves the rest bare.
 */
function checkStylesheetSentinel(pageId: string, html: string): ConformanceIssue[] {
  const count = countOccurrences(html, TOKEN_STYLESHEET_SENTINEL);
  if (count === 1) return [];
  return [
    {
      page: pageId,
      rule: "stylesheet-sentinel",
      message:
        count === 0
          ? `missing the literal stylesheet tag ${JSON.stringify(TOKEN_STYLESHEET_SENTINEL)} — token injection would silently no-op and this page would ship with no design tokens`
          : `the stylesheet tag appears ${count} times — token injection replaces only the first match, later duplicates get no tokens`,
    },
  ];
}

/**
 * Runs the SAME rewrite-then-detect pipeline `renderStaticPage` runs at request time
 * (`rewriteAssetPaths` then {@link findUnrewrittenAssetPaths} on the result), against the theme's raw
 * on-disk HTML instead of a live request. Anything still unrewritten after that pipeline is a `../css/`
 * or `../js/` reference the runtime rewrite cannot recognize and that will 404 in the browser — exactly
 * the failure `static-render.ts` currently only reports as a `console.warn` at serve time. Here it fails
 * the install instead.
 */
function checkAssetPaths(pageId: string, html: string, themeId: string): ConformanceIssue[] {
  const unrewritten = findUnrewrittenAssetPaths(rewriteAssetPaths(html, themeId));
  return unrewritten.map((reference) => ({
    page: pageId,
    rule: "asset-path",
    message: `asset reference '${reference}' cannot be rewritten to the served theme-assets route and will 404 in the browser`,
  }));
}

/**
 * Strip an island's inner markup down to its visible text, the same "is there really something here"
 * question a crawler with no JavaScript is asking. Comments and `<script>`/`<style>` bodies never count
 * as content; nested tags are stripped, not their text.
 */
function visibleIslandText(innerHtml: string): string {
  return innerHtml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:nbsp|#160);/gi, "")
    .trim();
}

/**
 * Every `data-tovu-island` element must have non-empty server-rendered text in the RAW artifact — see
 * {@link ISLAND_MARKER}'s own doc for why. An island whose entire content is filled in by client-side
 * hydration (an empty mount point) fails here rather than shipping invisible-to-most-crawlers content.
 */
function checkIslandContent(pageId: string, html: string): ConformanceIssue[] {
  const issues: ConformanceIssue[] = [];
  for (const match of html.matchAll(ISLAND_MARKER)) {
    if (visibleIslandText(match[2]).length === 0) {
      issues.push({
        page: pageId,
        rule: "island-content",
        message:
          "an interactive island (data-tovu-island) has no server-rendered text content in the shipped HTML — GPTBot, ClaudeBot, and PerplexityBot execute no JavaScript and would see nothing here; an island may only add interactivity on top of content already present in the artifact, never be what first-paints it",
      });
    }
  }
  return issues;
}

/**
 * Verify every LISTED `build.artifactHashes` entry against the real bytes on disk. A file referenced
 * that doesn't exist, or whose sha256 no longer matches, means the shipped bytes drifted from what the
 * build actually recorded — the integrity property "immutable, versioned" (ADR-020 §5) depends on.
 *
 * Scoped to files the manifest actually lists, not a full-tree inventory: `build.artifactHashes` being
 * non-empty is already required by `loadTheme`'s manifest-shape validation, but this does not (yet)
 * require every generated file to have a listed hash — a documented gap, not a silent one; see this
 * module's own file header.
 *
 * @complexity O(f · s), f = number of hashed files, s = each file's size (one digest per file).
 */
function checkArtifactHashes(themeDir: string, artifactHashes: Readonly<Record<string, string>>): ConformanceIssue[] {
  const issues: ConformanceIssue[] = [];
  for (const [relativePath, expected] of Object.entries(artifactHashes)) {
    let actual: string;
    try {
      actual = createHash("sha256").update(readFileSync(join(themeDir, relativePath))).digest("hex");
    } catch {
      issues.push({
        page: relativePath,
        rule: "artifact-hash",
        message: `build.artifactHashes references '${relativePath}', which does not exist on disk`,
      });
      continue;
    }
    // Accept both a bare hex digest and a "sha256:"/"sha256-"-prefixed one — theme.json authors and
    // build tooling both write either convention; the digest itself is the only thing being verified.
    const normalizedExpected = expected.replace(/^sha256[:-]/, "").toLowerCase();
    if (actual !== normalizedExpected) {
      issues.push({
        page: relativePath,
        rule: "artifact-hash",
        message: `'${relativePath}' does not match its recorded build.artifactHashes digest — the file changed after the build produced it`,
      });
    }
  }
  return issues;
}

/**
 * The install-time gate: every check a `build.source: "compiled"` theme must pass before `loadTheme()`
 * accepts it as `status: "valid"`. A no-op (`[]`) for any theme that isn't a compiled build — see this
 * module's own file header for why that's the only case this is ever called for.
 *
 * @param required.themeId - `manifest.id`, threaded through to {@link rewriteAssetPaths} rather than
 * re-read off `manifest` here, so this function's signature says exactly what it uses.
 * @param required.themeDir - The theme's own folder on disk, for {@link checkArtifactHashes}'s reads.
 * @param required.pages - Raw `pages/*.html` source, keyed by page id (`loadStaticTierAssets`'s shape).
 * @param required.partials - Raw root-partial source (`nav.html`, `footer.html`, …) — checked for
 * island content only (see {@link checkIslandContent}'s call site below): a partial never carries the
 * page-level stylesheet sentinel itself (`renderStaticPartial` supplies that via its own host-document
 * wrapper), so sentinel/asset-path checks stay scoped to real pages.
 * @param required.artifactHashes - `manifest.build.artifactHashes`, or `{}` if the theme declares none
 * (a case `loadTheme`'s manifest-shape validation already flags `invalid` on its own).
 * @complexity O(p · n) over pages' combined HTML length, p = page count, n = average page length; plus
 * {@link checkArtifactHashes}'s own O(f · s).
 */
export function checkBuiltThemeConformance(
  required: {
    themeId: string;
    themeDir: string;
    pages: Readonly<Record<string, string>>;
    partials: Readonly<Record<string, string>>;
    artifactHashes: Readonly<Record<string, string>>;
  },
  _optional: Record<string, never> = {}
): ConformanceIssue[] {
  const { themeId, themeDir, pages, partials, artifactHashes } = required;
  const issues: ConformanceIssue[] = [];

  for (const [pageId, html] of Object.entries(pages)) {
    issues.push(...checkStylesheetSentinel(pageId, html));
    issues.push(...checkAssetPaths(pageId, html, themeId));
    issues.push(...checkIslandContent(pageId, html));
  }
  for (const [partialId, html] of Object.entries(partials)) {
    issues.push(...checkIslandContent(partialId, html));
  }
  issues.push(...checkArtifactHashes(themeDir, artifactHashes));

  return issues;
}
