/**
 * Replaced-element containment check (basic-theme video-overflow fix, 2026-08-24).
 *
 * ## The bug this guards
 *
 * `img`, `video`, and `iframe` are REPLACED elements: they size from their own intrinsic
 * dimensions and ignore the width of whatever box an author put them in. A resolved
 * `data-embed-type="media"` video embed renders as a bare `<video>` tag
 * (`renderVideoTag`, `src/server/http/site/render.ts`; `SELF_RENDERING_MEDIA_TAGS`,
 * `src/widgets/html-embeds.ts`) with nothing in the markup itself bounding its size — only the
 * ACTIVE THEME's own CSS can. An author writing the documented
 * `<div style="max-width:600px" data-embed-config='{"type":"media",...}'>` wrapper around a video
 * got a correctly capped 600px div containing a video rendered at full source resolution,
 * overflowing both the wrapper and the page — horizontal scroll on every viewport, on the live
 * public site, in production.
 *
 * Every shipped theme constrained `img` (a longstanding, uncontroversial default) but NONE
 * constrained `video`. The bug was invisible until the first real video embed, because nothing
 * exercised the gap before then. `basic`'s fix (`src/themes/static/basic/css/theme.css`, see the
 * comment directly above its `img, video, iframe { max-width: 100%; }` rule) is the template this
 * check enforces on every other theme: `iframe` is included alongside `video` because it is the
 * same class of bug waiting to happen (an embedded YouTube/Vimeo/etc. `<iframe>` also has no
 * intrinsic-size guard of its own).
 *
 * ## What "constrained" means here
 *
 * A theme passes an element (`img`/`video`/`iframe`) only if its CSS contains at least one rule,
 * OUTSIDE any `@media` block, whose selector list includes that BARE tag name (comma-split,
 * exact match — `.wrap img` or `.hero-media img` do NOT count; they only cap images already
 * inside a specific container, not every image the theme might ever render), declaring
 * `max-width: 100%`. Two things are deliberately excluded even though a naive substring match
 * would let them through, matching real false-pass shapes found while writing this check:
 *
 *   - `@media (max-width: ...) { video { max-width: 100%; } }` — a rule that only applies below
 *     some breakpoint does not protect the wide-viewport case, which is exactly the case that
 *     shipped the bug (a desktop browser rendering a video at native resolution).
 *   - `.post-detail-body .youtube-embed iframe { width: 100%; height: 100%; ... }` (present in
 *     `fuel` and `portfolite` today) — a compound descendant selector scoped to one specific
 *     wrapper class, not a general `iframe` rule. It protects iframes an author places inside that
 *     one wrapper and nothing else.
 *
 * ## Scope: `src/themes/static/` only — NOT `__original-themes__`, `__marketplace__`,
 * `declarative/`, `templated/`, or `handlebars/`
 *
 * Real theme discovery (`discoverAllBuiltInThemes`, `src/features/theme/theme.ts:1196`) scans
 * `ENGINE_SUBFOLDERS` (`declarative`, `templated`, `handlebars`, `static`) and explicitly excludes
 * `THEME_CATALOG_DIR` (`__original-themes__`) and `MARKETPLACE_CATALOG_DIR` (`__marketplace__`) —
 * that file's own doc comments spell out why: both are "NOT a tier and NOT a theme", never
 * runnable, never listed, never the active theme. `__original-themes__` is a pristine-copy catalog
 * kept for diffing/reset; `__marketplace__` is a local marketplace fixture (one entry deliberately
 * id-collides with `basic` to exercise the download de-dupe path). Scanning either would check
 * files nothing ever serves.
 *
 * This check goes narrower than `discoverAllBuiltInThemes` and scans `static/` ONLY, not the other
 * three real engine subfolders, for a different reason than the catalog exclusion above: the
 * audited bug and its fix are specific to the `static` tier's HTML-marker embed system
 * (`data-embed-config`, resolved through `resolveHtmlPageEmbeds`/`renderWidgetIr`). Whether
 * `declarative` (JSON block trees over a fixed component vocabulary) and `templated` (LiquidJS,
 * its own product/media components) themes reach the same `renderVideoTag` code path the same way
 * has NOT been verified here, and nobody has audited or triaged their CSS against this specific
 * rule. A quick look while writing this check found neither is clean either way —
 * `declarative/basic-declarative` constrains `img` but not `video`/`iframe`,
 * `templated/fashion-modern` constrains none of the three generally (only scoped selectors like
 * `.product-card__media img`), and `templated/storefront` ships no CSS file at all — but
 * `declarative/basic-declarative`'s own manifest says "Reference only — not wired into any site",
 * and widening this check to declarative/templated would be a NEW audit this task was not asked to
 * perform, layered onto a check whose whole point is to guard an already-audited, already-fixed
 * regression. If those tiers are ever audited, the fix is a one-line change: replace `SCAN_DIR`
 * below with a loop over `ENGINE_SUBFOLDERS` from `theme.ts`, reusing this file's parsing and
 * reporting untouched.
 *
 * ## RED on arrival — deliberate, same posture as `check:architecture`
 *
 * `basic` was fixed; `fuel`, `gracious-timing`, `portfolite`, `tailark-dusk`,
 * `tailark-quartz-dark`, and `tailark-quartz-libre` were not — the owner explicitly chose to ship
 * this guard rather than hand-patch all six in the same session. This check FAILS today, on
 * purpose, and there is no baseline/allowlist file to launder that away (unlike
 * `check-architecture.baseline.json`'s ratchet, there is nothing gradual about "does this element
 * have a max-width rule" — it is binary per theme). "Done" means: each of the six gets `basic`'s
 * `img, video, iframe { max-width: 100%; }` rule (or an equivalent, theme-specific ruleset that
 * satisfies the same containment property), and this check goes green with zero code changes to
 * this file.
 *
 * ## Parsing approach
 *
 * A hand-rolled shape-level CSS scan (brace-depth tracking + `@media` nesting detection +
 * comma-split selector matching), not a real CSS parser — no CSS parsing library is a project
 * dependency, and the same "shape check, not a full parser" trade-off `check-embed-marker-drift.ts`
 * documents for HTML applies here for CSS. It tracks quoted strings (so a `content: "{"` in a
 * declaration can't desync brace counting) and distinguishes at-rule preludes (`@media ...`,
 * `@font-face`, `@keyframes name`, ...) from ordinary selector-list rules, but does not handle the
 * CSS nesting-selector draft (`&`) or attribute/pseudo-qualified bare-tag selectors
 * (`img:not(.icon)`) — none of the theme files scanned today use either.
 *
 * Usage: npx tsx development/scripts/check-theme-replaced-elements.ts
 *        npx tsx development/scripts/check-theme-replaced-elements.ts --dir <path>  (scan an
 *        alternate directory of `<theme-id>/**\/*.css` instead of `src/themes/static` — the same
 *        self-test affordance `check-embed-marker-drift.ts`'s `--dir` already established, used by
 *        this script's own unit tests)
 * Exit codes: 0 = every discovered theme's stylesheet(s) constrain `img`, `video`, AND `iframe` via
 *             at least one unconditional (non-`@media`) bare-tag `max-width: 100%` rule.
 *             1 = at least one theme is missing at least one.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const dirFlagIndex = process.argv.indexOf("--dir");
const SCAN_DIR = dirFlagIndex === -1 ? path.join(REPO_ROOT, "content", "themes", "static") : path.resolve(process.argv[dirFlagIndex + 1]);

/** The three replaced elements a media/iframe embed can resolve to. Order is the report order. */
export const REPLACED_ELEMENTS = ["img", "video", "iframe"] as const;
export type ReplacedElement = (typeof REPLACED_ELEMENTS)[number];

interface CssRule {
  /** Comma-split, lowercased, whitespace-collapsed selector list, e.g. `["img", "video"]`. */
  selectors: string[];
  /** Raw declaration text between this rule's `{` and its matching `}`. */
  body: string;
  /** True if this rule sits inside one or more `@media` blocks — see this file's header for why
   * that disqualifies it from the general (unconditional) containment check. */
  insideMedia: boolean;
}

/** Same same-length blank-out approach `check-embed-marker-drift.ts` uses for HTML comments,
 * applied to CSS comments — preserves newlines so any future line-number reporting stays valid. */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/** Comma-split a rule prelude into individual selectors, collapsing internal whitespace/newlines
 * (a selector list is often written one-per-line) and lowercasing for case-insensitive tag
 * matching (CSS type selectors are case-insensitive for HTML). */
function splitSelectors(prelude: string): string[] {
  return prelude
    .split(",")
    .map((s) => s.replace(/\s+/g, " ").trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Hand-rolled brace-depth scan producing one {@link CssRule} per ordinary (non-at-rule) rule
 * block, tagged with whether an `@media` ancestor wraps it. At-rules that are NOT `@media`
 * (`@font-face`, `@keyframes`, `@supports`, ...) still push a stack frame so brace depth stays
 * correct, but are never themselves treated as `insideMedia` — only a real `@media` ancestor is.
 * Quoted strings are skipped char-for-char so a declaration value containing a literal `{`/`}`
 * (e.g. `content: "{"`) cannot desync the brace count.
 *
 * @complexity O(n) single left-to-right scan over the (comment-stripped) source, n = source length.
 */
export function parseCssRules(css: string): CssRule[] {
  const stripped = stripCssComments(css);
  const rules: CssRule[] = [];
  type Frame = { kind: "media" } | { kind: "other-at" } | { kind: "rule"; index: number; bodyStart: number };
  const stack: Frame[] = [];
  let bufStart = 0;
  const n = stripped.length;
  let i = 0;

  while (i < n) {
    const ch = stripped[i];

    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < n && stripped[i] !== quote) {
        if (stripped[i] === "\\") i++; // skip escaped char so an escaped quote can't end the string early
        i++;
      }
      i++; // consume closing quote
      continue;
    }

    if (ch === "{") {
      const prelude = stripped.slice(bufStart, i).trim();
      if (prelude.startsWith("@")) {
        stack.push(/^@media\b/i.test(prelude) ? { kind: "media" } : { kind: "other-at" });
      } else {
        const index = rules.length;
        rules.push({ selectors: splitSelectors(prelude), body: "", insideMedia: stack.some((f) => f.kind === "media") });
        stack.push({ kind: "rule", index, bodyStart: i + 1 });
      }
      bufStart = i + 1;
      i++;
      continue;
    }

    if (ch === "}") {
      const frame = stack.pop();
      if (frame?.kind === "rule") rules[frame.index].body = stripped.slice(frame.bodyStart, i);
      bufStart = i + 1;
      i++;
      continue;
    }

    i++;
  }

  return rules;
}

/** An unconditional `max-width: 100%` declaration, tolerant of whitespace around the colon. */
const MAX_WIDTH_FULL = /max-width\s*:\s*100%/i;

/**
 * Which of {@link REPLACED_ELEMENTS} lack an unconditional (non-`@media`) bare-tag
 * `max-width: 100%` rule anywhere in `css`. Empty array = fully constrained.
 *
 * @complexity O(r * s) where r = rule count, s = mean selectors per rule — both small and bounded
 * by real stylesheet size, dominated by the O(n) `parseCssRules` scan it calls once.
 */
export function findUnconstrainedElements(css: string): ReplacedElement[] {
  const constrained = new Set<ReplacedElement>();
  for (const rule of parseCssRules(css)) {
    if (rule.insideMedia) continue;
    if (!MAX_WIDTH_FULL.test(rule.body)) continue;
    for (const selector of rule.selectors) {
      if ((REPLACED_ELEMENTS as readonly string[]).includes(selector)) constrained.add(selector as ReplacedElement);
    }
  }
  return REPLACED_ELEMENTS.filter((el) => !constrained.has(el));
}

export interface ThemeStylesheets {
  themeId: string;
  themeDir: string;
  /** Every `.css` file found anywhere under the theme's own folder, sorted for determinism. */
  cssFiles: string[];
}

function collectCssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectCssFiles(full));
      continue;
    }
    if (entry.name.endsWith(".css")) out.push(full);
  }
  return out.sort();
}

/** Every theme (one folder = one theme) directly under `scanDir`, with every `.css` file found
 * anywhere inside it — not hardcoded to `css/theme.css`, so a theme that splits its stylesheet
 * across multiple files is still fully scanned. Missing `scanDir` ⇒ empty list, mirroring
 * `discoverThemes`'s own missing-dir-is-legal behavior (`src/features/theme/theme.ts`). */
export function discoverThemeStylesheets(scanDir: string): ThemeStylesheets[] {
  if (!fs.existsSync(scanDir)) return [];
  return fs
    .readdirSync(scanDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const themeDir = path.join(scanDir, entry.name);
      return { themeId: entry.name, themeDir, cssFiles: collectCssFiles(themeDir) };
    })
    .sort((a, b) => a.themeId.localeCompare(b.themeId));
}

export interface Finding {
  themeId: string;
  cssFiles: string[];
  /** Empty `cssFiles` (no stylesheet found at all) reports ALL of `REPLACED_ELEMENTS` missing —
   * "no CSS" is the maximal case of "nothing is constrained", not a separate skip state; see this
   * file's header for why `templated/storefront` (out of this check's scope) is the one theme in
   * the repo today that would hit this branch. */
  missing: ReplacedElement[];
}

/** Combines every CSS file a theme ships into one text before checking — a theme that splits
 * `reset.css`/`theme.css` still passes if the rule lives in either file. */
export function checkTheme(theme: ThemeStylesheets): Finding | null {
  const combinedCss = theme.cssFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  const missing = theme.cssFiles.length === 0 ? [...REPLACED_ELEMENTS] : findUnconstrainedElements(combinedCss);
  return missing.length > 0 ? { themeId: theme.themeId, cssFiles: theme.cssFiles, missing } : null;
}

function main(): void {
  const themes = discoverThemeStylesheets(SCAN_DIR);
  const findings = themes.map(checkTheme).filter((f): f is Finding => f !== null);
  const scanLabel = path.relative(REPO_ROOT, SCAN_DIR) || SCAN_DIR;

  if (findings.length === 0) {
    console.log(
      `check:theme-replaced-elements — OK: ${themes.length} theme(s) scanned under ${scanLabel}; every theme constrains img, video, and iframe.`,
    );
    return;
  }

  console.error(`check:theme-replaced-elements — ${findings.length} of ${themes.length} theme(s) under ${scanLabel} have unconstrained replaced element(s):`);
  for (const finding of findings) {
    const location = finding.cssFiles.length > 0 ? finding.cssFiles.map((f) => path.relative(REPO_ROOT, f)).join(", ") : "(no .css file found)";
    console.error(`  - ${finding.themeId} [${location}]: missing unconditional max-width:100% for ${finding.missing.join(", ")}`);
  }
  process.exit(1);
}

// Guarded, matching `check-src-complexity-drift.ts`/`check-route-coverage-diff.ts`: this file's
// exported functions are imported directly by
// `development/scripts/__tests__/check-theme-replaced-elements.test.ts`, and an unguarded `main()`
// would scan the real repo (and `process.exit(1)` on the six known-broken themes) as a side effect
// of that import.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
