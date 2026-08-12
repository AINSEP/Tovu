import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
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
 *
 * Scope history: {@link checkArtifactHashes} originally (09b1ab7, 2026-08-12) verified only the files
 * `build.artifactHashes` LISTS, not a full-tree inventory — deliberate, not an oversight, pending an
 * unresolved product question the FINAL debate report left to the owner: *who authors a built theme?*
 * That trigger fired the same day (2026-08-12): the owner decided anyone can author themes and
 * plugins, putting untrusted publishers in scope. {@link checkArtifactHashes} was promoted to a
 * full-tree inventory — every real file under the generated region must have a listed hash, every
 * listed hash must resolve to a real file inside that region, and a symlink anywhere in the tree is
 * refused outright rather than followed or silently skipped — matching the posture
 * `agent-plugins/install.ts`'s package extraction already uses for the identical "content from someone
 * other than the operator" threat model (see {@link checkArtifactHashes}'s own doc for why that
 * module's implementation is reproduced locally here rather than imported directly).
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

/** Internal signal that {@link walkGeneratedTree} could not safely finish — thrown, not returned, so
 * {@link checkArtifactHashes} short-circuits rather than report partial results from an inventory walk
 * it never completed. Never escapes {@link checkArtifactHashes}. */
class GeneratedTreeInventoryLimitExceeded extends Error {}

/** Ceiling on how many files {@link walkGeneratedTree} will enumerate, mirroring `theme-files.ts`'s own
 * `MAX_LISTED_FILES` — an untrusted publisher's build output is walked before any of it is trusted, so
 * the walk itself needs a bound, not just the checks it feeds. */
const MAX_INVENTORY_FILES = 2_000;

/** Depth ceiling on the same walk, mirroring `theme-files.ts`'s `MAX_WALK_DEPTH`. */
const MAX_INVENTORY_WALK_DEPTH = 12;

/**
 * Per-file and cumulative byte ceilings on the hashing pass, matching the order of magnitude
 * `agent-plugins/install.ts`'s own `LIMITS` uses for the identical "content from someone other than
 * the operator" threat model (this module's file header already names that precedent). `sha256` reads
 * a whole file into memory at once (`readFileSync`), so one unbounded file — or an unbounded SUM across
 * many merely-legal-sized ones — is a memory/CPU cost a hostile publisher's build could run up, not
 * just a correctness gap.
 *
 * Tripwire, recorded so a future "why did my theme stop installing" report starts here instead of a
 * cold re-derivation: these are a POLICY call, not a measured requirement, and a legitimately large
 * theme (a hero video, a large image gallery) can hit them. That failure must always surface as a
 * named, specific conformance issue — the size and the exact cap it exceeded, both in the message
 * (`checkArtifactHashes`'s own per-file/total-size branches interpolate both) — never a silent
 * truncation or an unexplained `invalid`. If a real theme trips this, the fix is to raise these two
 * constants, not to loosen the containment or symlink rules they sit next to.
 */
const MAX_HASHED_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_HASHED_BYTES = 64 * 1024 * 1024;

/**
 * Whether a theme-root-relative path (POSIX, produced by {@link walkGeneratedTree}) falls inside a
 * built theme's GENERATED region — the boundary the full-tree inventory below must account for.
 * Mirrors `theme-files.ts`'s `resolveThemeFileWriteScope` boundary (`theme.json` and everything under
 * `build.sourceDir` stay out) WITHOUT importing that module: `theme.ts` already imports this module,
 * and `theme-files.ts` imports `theme.ts` for `ThemeManifest` — importing `theme-files.ts` from here
 * would close that back into a cycle (`theme.ts` → `build-conformance.ts` → `theme-files.ts` →
 * `theme.ts`), the same cycle 09b1ab7's own commit message already routed around once already, for
 * `static-asset-contract.ts`. `theme-files.ts` is also under active structural refactor elsewhere in
 * this session, a second reason to leave its internals alone rather than a first. The predicate itself
 * is a handful of lines of pure string logic — one extra copy of a boundary rule is the smaller,
 * contained risk, and a cross-check test in `build-conformance.test.ts` pins it equal to the original.
 */
function isInGeneratedTree(relativePath: string, sourceDir: string | undefined): boolean {
  if (relativePath === "theme.json") return false;
  if (sourceDir !== undefined && (relativePath === sourceDir || relativePath.startsWith(`${sourceDir}/`))) {
    return false;
  }
  return true;
}

/** {@link walkGeneratedTree}'s result: every real file found (keyed by theme-relative path, valued by
 * its absolute path), plus every path refused outright as a symlink (keyed the same way, valued by the
 * `ConformanceIssue` explaining why) — kept separate from `files` rather than merged into one issue
 * list here, so {@link checkArtifactHashes} can use `rejected`'s KEYS to recognize "this path is
 * missing because it was refused, not because it was never there" and avoid reporting the same path
 * wrong twice (see that function's own doc). */
interface GeneratedTreeInventory {
  readonly files: ReadonlyMap<string, string>;
  readonly rejected: ReadonlyMap<string, ConformanceIssue>;
}

/**
 * Walks `themeDir`'s GENERATED region (see {@link isInGeneratedTree}) and returns every regular file
 * found. A symlink anywhere in the walk — file or directory — is refused OUTRIGHT rather than followed
 * or validated: recorded in the result's `rejected` map and neither descended into (so a symlinked
 * directory can never be used to walk this enumeration out of the theme folder) nor hashed. Matches
 * `agent-plugins/install.ts`'s own rule for the identical "content from someone other than the
 * operator" threat model (this module's file header already cites it): a theme's generated output has
 * no legitimate reason to contain a symlink, so this rejects the ENTRY KIND rather than attempting to
 * reason about where it points.
 *
 * Unlike an archive extractor's entry-PATH traversal risk (`agent-plugins/package-paths.ts`'s own
 * reason for full `realpath`-based containment on every entry), this walk has no equivalent lexical
 * `../` exposure: every path segment it ever joins comes from `readdirSync`'s own directory-entry
 * names, which the OS guarantees are single path components with no separator or `..` token — there is
 * no caller-supplied string here for a hostile name to smuggle a traversal through, the way an
 * archive's own entry-name field can. The symlink check above is therefore the whole containment
 * surface this walk has, and `lstatSync` (never `statSync`, which would follow the link) closes it.
 *
 * @throws {GeneratedTreeInventoryLimitExceeded} If the walk exceeds {@link MAX_INVENTORY_FILES} or
 * {@link MAX_INVENTORY_WALK_DEPTH} — an untrusted publisher's build is never walked unbounded.
 * @complexity O(n) in the generated tree's own file+directory count, bounded by the two ceilings above.
 */
function walkGeneratedTree(themeDir: string, sourceDir: string | undefined): GeneratedTreeInventory {
  const files = new Map<string, string>();
  const rejected = new Map<string, ConformanceIssue>();
  if (!existsSync(themeDir)) return { files, rejected };

  const walk = (dir: string, relPrefix: string, depth: number): void => {
    if (depth > MAX_INVENTORY_WALK_DEPTH) {
      throw new GeneratedTreeInventoryLimitExceeded(
        `generated tree exceeds the ${MAX_INVENTORY_WALK_DEPTH}-level depth cap under '${relPrefix || "."}'`
      );
    }
    for (const name of readdirSync(dir)) {
      if (files.size >= MAX_INVENTORY_FILES) {
        throw new GeneratedTreeInventoryLimitExceeded(`generated tree exceeds the ${MAX_INVENTORY_FILES}-file inventory cap`);
      }
      const absolute = join(dir, name);
      const relativePath = relPrefix ? `${relPrefix}/${name}` : name;
      if (!isInGeneratedTree(relativePath, sourceDir)) continue;

      const linkStat = lstatSync(absolute);
      if (linkStat.isSymbolicLink()) {
        rejected.set(relativePath, {
          page: relativePath,
          rule: "artifact-hash",
          message: `'${relativePath}' is a symbolic link inside the built theme's generated tree — symlinks are never permitted there, matching this repo's Agent Plugins package-extraction rule for the identical "content from someone other than the operator" threat model; the entry is refused outright, not followed`,
        });
        continue;
      }

      if (linkStat.isDirectory()) {
        walk(absolute, relativePath, depth + 1);
      } else if (linkStat.isFile()) {
        files.set(relativePath, absolute);
      }
      // Anything else (a FIFO, a socket, a device node) is silently skipped, matching
      // `theme-files.ts`'s own `listThemeFiles` posture — none of those are a "file" this gate has any
      // business hashing, and none can be used to escape containment the way a symlink can.
    }
  };

  walk(themeDir, "", 0);
  return { files, rejected };
}

/**
 * Verify a built theme's ENTIRE generated tree against `build.artifactHashes`: every real file under
 * the generated region (see {@link isInGeneratedTree}) must have a listed hash whose digest matches
 * its actual bytes, every listed hash must resolve to a real file inside that region, and no symlink
 * may appear anywhere in the tree ({@link walkGeneratedTree}). A file referenced that doesn't exist
 * (or resolves outside the generated region, or was refused as a symlink), or whose sha256 no longer
 * matches, means the shipped bytes drifted from what the build actually recorded — the integrity
 * property "immutable, versioned" (ADR-020 §5) depends on. A real file present but not listed is now
 * its own finding: promoted from "listed-file-only" hashing to this full-tree inventory on 2026-08-12
 * — see this module's file header for why, and for the promotion trigger this was deferred behind
 * only hours earlier the same day (74cdeee).
 *
 * A side effect of walking the tree to answer "what exists" rather than trusting each
 * `artifactHashes` key as a path to open directly (the prior implementation's own behavior, via
 * `join(themeDir, relativePath)`): a key shaped like `"../../../etc/passwd"` can no longer reach the
 * filesystem as a path component at all — it simply never appears in {@link walkGeneratedTree}'s
 * result (every relative path that function produces is built exclusively from real, OS-returned
 * directory-entry names, which cannot contain a `..` token), so it now reports as an ordinary "does
 * not exist" finding instead of ever calling `readFileSync` on an attacker-influenced path. Not the
 * motivating reason for this rewrite, but a real containment improvement that falls out of it for
 * free — locked in by a regression test in `build-conformance.test.ts`.
 *
 * An `artifactHashes` entry naming a path that turned out to be a REJECTED symlink reports only the
 * `walkGeneratedTree`-recorded symlink finding, not a second, redundant "does not exist" finding for
 * the same path — the symlink message already explains why the path can't be verified; restating it
 * as merely "missing" would be misleading (it isn't missing, it was refused) and would double-count
 * one real problem as two.
 *
 * @complexity O(f · s) — f = generated files actually found (bounded by {@link MAX_INVENTORY_FILES}),
 * s = each file's size (bounded by {@link MAX_HASHED_FILE_BYTES} per file and
 * {@link MAX_TOTAL_HASHED_BYTES} cumulatively).
 */
function checkArtifactHashes(
  themeDir: string,
  sourceDir: string | undefined,
  artifactHashes: Readonly<Record<string, string>>
): ConformanceIssue[] {
  const issues: ConformanceIssue[] = [];

  let inventory: GeneratedTreeInventory;
  try {
    inventory = walkGeneratedTree(themeDir, sourceDir);
  } catch (error) {
    if (error instanceof GeneratedTreeInventoryLimitExceeded) {
      issues.push({ page: themeDir, rule: "artifact-hash", message: error.message });
      return issues; // an unfinished walk cannot safely back a "here is everything" claim either way
    }
    throw error;
  }
  const { files: discovered, rejected } = inventory;
  issues.push(...rejected.values());

  let totalHashedBytes = 0;
  for (const [relativePath, expected] of Object.entries(artifactHashes)) {
    if (rejected.has(relativePath)) continue; // already reported above, as a symlink, not "missing"

    const absolutePath = discovered.get(relativePath);
    if (absolutePath === undefined) {
      issues.push({
        page: relativePath,
        rule: "artifact-hash",
        message: `build.artifactHashes references '${relativePath}', which does not exist on disk (or is outside the generated tree)`,
      });
      continue;
    }

    const size = statSync(absolutePath).size;
    if (size > MAX_HASHED_FILE_BYTES) {
      issues.push({
        page: relativePath,
        rule: "artifact-hash",
        message: `'${relativePath}' is ${size} bytes, over the ${MAX_HASHED_FILE_BYTES}-byte per-file verification cap`,
      });
      continue;
    }
    totalHashedBytes += size;
    if (totalHashedBytes > MAX_TOTAL_HASHED_BYTES) {
      issues.push({
        page: relativePath,
        rule: "artifact-hash",
        message: `the generated tree's total verified size exceeds the ${MAX_TOTAL_HASHED_BYTES}-byte cap at '${relativePath}'`,
      });
      break; // stop hashing further -- matches agent-plugins' own fail-fast on TOTAL_SIZE_EXCEEDED
    }

    const actual = createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
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

  const declared = new Set(Object.keys(artifactHashes));
  for (const relativePath of discovered.keys()) {
    if (!declared.has(relativePath)) {
      issues.push({
        page: relativePath,
        rule: "artifact-hash",
        message: `'${relativePath}' exists in this build's generated tree but has no entry in build.artifactHashes — every generated file must be accounted for now that a built theme can originate from an untrusted publisher`,
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
 * @param required.themeDir - The theme's own folder on disk, for {@link checkArtifactHashes}'s walk.
 * @param required.sourceDir - `manifest.build.sourceDir`, the theme-relative authored-source root that
 * stays OUT of {@link checkArtifactHashes}'s generated-tree inventory (see {@link isInGeneratedTree}).
 * `undefined` only for a fixture/test calling this function directly without going through `loadTheme`
 * — `loadTheme`'s own manifest-shape validation already flags a real `compiled` theme `invalid` if
 * `sourceDir` is missing, so this function never needs to guess a fallback convention.
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
    sourceDir?: string;
    pages: Readonly<Record<string, string>>;
    partials: Readonly<Record<string, string>>;
    artifactHashes: Readonly<Record<string, string>>;
  },
  _optional: Record<string, never> = {}
): ConformanceIssue[] {
  const { themeId, themeDir, sourceDir, pages, partials, artifactHashes } = required;
  const issues: ConformanceIssue[] = [];

  for (const [pageId, html] of Object.entries(pages)) {
    issues.push(...checkStylesheetSentinel(pageId, html));
    issues.push(...checkAssetPaths(pageId, html, themeId));
    issues.push(...checkIslandContent(pageId, html));
  }
  for (const [partialId, html] of Object.entries(partials)) {
    issues.push(...checkIslandContent(partialId, html));
  }
  issues.push(...checkArtifactHashes(themeDir, sourceDir, artifactHashes));

  return issues;
}
