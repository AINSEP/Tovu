/**
 * @file Static guard: Tovu's UI must not burn CPU while idle.
 *
 * Owner request, 2026-09-29: another Electron app on this Mac redrew constantly while idle (renderer
 * and GPU ~50% each, WindowServer 80%). This fails on the source patterns that cause that, in the
 * desktop app (`apps/desktop`), the admin (`apps/admin`), the site assistant (`apps/site-chat`) and
 * the shipped themes (`content/themes/static`):
 *
 * - `background-throttling` — `backgroundThrottling: false`, `setBackgroundThrottling(false)`, or a
 *   Chromium switch that turns background/occlusion throttling off. Never allowed.
 * - `media-autoplay` — a `<video>`/`<audio>` with `autoplay` or `loop`. Never allowed.
 * - `infinite-animation` — a CSS `infinite` animation (or Tailwind `animate-spin|pulse|ping|bounce`)
 *   not in {@link INFINITE_ANIMATION_ALLOWLIST}, which says per selector why it only runs while
 *   something is actually happening. A file with an allowed one must also handle
 *   `prefers-reduced-motion`.
 * - `bare-interval` — a `setInterval(` in UI or Electron-main code not in {@link INTERVAL_ALLOWLIST}.
 *   New polling goes through a visibility-aware helper (`apps/desktop/src/renderer/visible-interval.ts`)
 *   or gets an entry here saying why it is cheap.
 *
 * An allowlist entry that no longer matches anything is reported too, so the list stays true.
 * Comments are stripped before matching. Run: `node --import tsx development/scripts/check-idle-motion.ts`;
 * `development/scripts/__tests__/check-idle-motion.test.ts` runs it in the root suite.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface IdleMotionViolation {
  rule: "background-throttling" | "media-autoplay" | "infinite-animation" | "bare-interval" | "reduced-motion" | "stale-allowlist";
  file: string;
  line: number;
  detail: string;
}

/** `file::selector` → why it only animates while something is in progress. */
export const INFINITE_ANIMATION_ALLOWLIST: Record<string, string> = {
  "apps/desktop/src/renderer/app.css::.spinner": "rendered only while a site server boots or its admin loads",
  "apps/desktop/src/renderer/app.css::.card.is-starting .state__dot,\n.card.is-stopping .state__dot":
    "only while a site is starting or stopping",
  "apps/admin/src/features/voice-input/push-to-talk-mic-button.css::.tovu-push-to-talk__dot": "rendered only while recording",
  "apps/admin/src/styles.css::.theme-card.active:hover::before": "only while the pointer is over the active theme card; runs 3 sweeps otherwise",
  "content/themes/static/basic-2/css/theme.css::.logo-track": "public-site logo marquee; transform-only (compositor), reduced-motion handled",
  "content/themes/static/tailark-quartz-libre/css/theme.css::.logo-track": "public-site logo marquee; transform-only (compositor), reduced-motion handled",
  "content/themes/static/tovu-starter/css/theme.css::.logo-track": "public-site logo marquee; transform-only (compositor), reduced-motion handled",
  "content/themes/static/tovu-theme/css/theme.css::.logo-track": "public-site logo marquee; transform-only (compositor), reduced-motion handled",
};

/** Files allowed to call `setInterval(` → why. */
export const INTERVAL_ALLOWLIST: Record<string, string> = {
  // 8ac88814c moved the main-process, unref'd 15-minute update tick into @jini-ai/desktop-host.
  "apps/desktop/src/renderer/visible-interval.ts": "the visibility-aware helper itself: stops while the window is hidden",
  "apps/admin/src/lib/visible-interval.ts": "the admin's copy of the same visibility-aware helper: stops while the window is hidden",
};

const ROOTS = ["apps/desktop/main.ts", "apps/desktop/src", "apps/admin/src", "apps/site-chat/src", "content/themes/static"];
const SKIP_DIRS = new Set(["node_modules", "dist", "dist-electron", "coverage", "vendor", "__tests__", "staging", "release"]);
const CODE_EXT = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;
const MARKUP_EXT = /\.(?:tsx|jsx|html)$/;

const THROTTLING_PATTERNS = [
  /backgroundThrottling\s*:\s*false/,
  /setBackgroundThrottling\(\s*false\s*\)/,
  /disable-renderer-backgrounding|disable-background-timer-throttling|disable-backgrounding-occluded-windows/,
];
const MEDIA_AUTOPLAY = /<(?:video|audio)\b[^>]*?\b(?:autoplay|autoPlay|loop)\b/g;
const TAILWIND_INFINITE = /\banimate-(?:spin|pulse|ping|bounce)\b/g;
const INFINITE_DECLARATION = /^(?:animation|animation-iteration-count|--[\w-]*iterations)\s*:[^;]*\binfinite\b/i;

function walk(abs: string, out: string[]): void {
  const stat = fs.statSync(abs, { throwIfNoEntry: false });
  if (!stat) return;
  if (stat.isFile()) {
    out.push(abs);
    return;
  }
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.isDirectory() && (SKIP_DIRS.has(entry.name) || entry.name.startsWith("release"))) continue;
    walk(path.join(abs, entry.name), out);
  }
}

/** Blank out comments, keeping every newline so line numbers survive. */
export function stripComments(source: string, css: boolean): string {
  const blank = (match: string) => match.replace(/[^\n]/g, " ");
  const blocks = source.replace(/\/\*[\s\S]*?\*\//g, blank);
  return css ? blocks : blocks.replace(/(^|[^:\\"'`])\/\/[^\n]*/g, (m, lead: string) => lead + blank(m.slice(lead.length)));
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/** Every declaration in a stylesheet with its innermost non-at-rule selector. */
export function cssDeclarations(css: string): Array<{ selector: string; declaration: string; index: number }> {
  const out: Array<{ selector: string; declaration: string; index: number }> = [];
  const stack: string[] = [];
  let buffer = "";
  let start = 0;
  const flush = () => {
    const declaration = buffer.trim();
    const selector = [...stack].reverse().find((s) => !s.startsWith("@"));
    if (declaration && selector !== undefined) out.push({ selector, declaration, index: start });
  };
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === "{") {
      stack.push(buffer.trim().replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n"));
      buffer = "";
      start = i + 1;
    } else if (ch === ";" || ch === "}") {
      flush();
      if (ch === "}") stack.pop();
      buffer = "";
      start = i + 1;
    } else {
      if (buffer.trim() === "") start = i;
      buffer += ch;
    }
  }
  return out;
}

/** Scan `repoRoot` and return every violation. */
export function checkIdleMotion(repoRoot: string): IdleMotionViolation[] {
  const files: string[] = [];
  for (const root of ROOTS) walk(path.join(repoRoot, root), files);
  const violations: IdleMotionViolation[] = [];
  const seenAnimations = new Set<string>();
  const seenIntervals = new Set<string>();

  for (const abs of files) {
    const rel = path.relative(repoRoot, abs).split(path.sep).join("/");
    if (/\.test\.|\.spec\./.test(rel)) continue;
    const isCss = rel.endsWith(".css");
    if (!isCss && !CODE_EXT.test(rel) && !MARKUP_EXT.test(rel)) continue;
    const text = stripComments(fs.readFileSync(abs, "utf8"), isCss);

    if (isCss) {
      let allowedHere = false;
      for (const { selector, declaration, index } of cssDeclarations(text)) {
        if (!INFINITE_DECLARATION.test(declaration)) continue;
        const key = `${rel}::${selector}`;
        seenAnimations.add(key);
        if (key in INFINITE_ANIMATION_ALLOWLIST) allowedHere = true;
        else violations.push({ rule: "infinite-animation", file: rel, line: lineOf(text, index), detail: `${selector} { ${declaration} }` });
      }
      if (allowedHere && !text.includes("prefers-reduced-motion")) {
        violations.push({ rule: "reduced-motion", file: rel, line: 1, detail: "has an infinite animation but no prefers-reduced-motion rule" });
      }
      continue;
    }

    for (const pattern of THROTTLING_PATTERNS) {
      const match = pattern.exec(text);
      if (match) violations.push({ rule: "background-throttling", file: rel, line: lineOf(text, match.index), detail: match[0] });
    }
    if (MARKUP_EXT.test(rel)) {
      for (const match of text.matchAll(MEDIA_AUTOPLAY)) {
        violations.push({ rule: "media-autoplay", file: rel, line: lineOf(text, match.index ?? 0), detail: match[0].slice(0, 80) });
      }
      for (const match of text.matchAll(TAILWIND_INFINITE)) {
        const key = `${rel}::${match[0]}`;
        seenAnimations.add(key);
        if (!(key in INFINITE_ANIMATION_ALLOWLIST)) {
          violations.push({ rule: "infinite-animation", file: rel, line: lineOf(text, match.index ?? 0), detail: match[0] });
        }
      }
    }
    const interval = /\bsetInterval\(/.exec(text);
    if (interval) {
      seenIntervals.add(rel);
      if (!(rel in INTERVAL_ALLOWLIST)) {
        violations.push({ rule: "bare-interval", file: rel, line: lineOf(text, interval.index), detail: "setInterval( — use a visibility-aware timer or allowlist it with a reason" });
      }
    }
  }

  for (const key of Object.keys(INFINITE_ANIMATION_ALLOWLIST)) {
    if (!seenAnimations.has(key)) violations.push({ rule: "stale-allowlist", file: key.split("::")[0]!, line: 0, detail: `INFINITE_ANIMATION_ALLOWLIST entry matches nothing: ${key}` });
  }
  for (const key of Object.keys(INTERVAL_ALLOWLIST)) {
    if (!seenIntervals.has(key)) violations.push({ rule: "stale-allowlist", file: key, line: 0, detail: "INTERVAL_ALLOWLIST entry matches nothing" });
  }
  return violations;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const violations = checkIdleMotion(repoRoot);
  for (const v of violations) console.error(`${v.file}:${v.line} [${v.rule}] ${v.detail}`);
  console.log(violations.length === 0 ? "idle-motion guard: clean" : `idle-motion guard: ${violations.length} violation(s)`);
  process.exitCode = violations.length === 0 ? 0 : 1;
}
