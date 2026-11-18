/**
 * Gate for the single href standard of Tovu's public HTML (2026-09-03, reworked 2026-11-17).
 *
 * ## What this catches, and why it's needed
 *
 * The predicate "is this href safe to emit as a public `<a href>`" has ONE implementation:
 * `isAllowedHref` (decide) and `toAllowedHref` (coerce to `"#"`), exported from
 * `@jini-ai/cms/navigation/href` (the dependency-free leaf of `@jini-ai/cms/navigation`; Jini repo, `packages/cms/src/navigation/href.ts`). The same function
 * rejects a menu item's `url` target at write time (a 400 `MenuValidationError`) and degrades a
 * render-time link to `"#"`, in every Tovu renderer (public renderers, static theme tier, entry-list
 * templates). Tovu used to carry two hand-kept copies of it (`safeHref` in `platform/html/safe-url.ts`
 * and in `features/theme/render-contract.ts`), which drifted from each other and from Jini; this gate
 * existed to extract and compare those copies. They are deleted, so the gate now guards two things:
 *
 * 1. **The standard itself, as Tovu consumes it.** The adversarial + legitimate table below is run
 *    through the REAL `isAllowedHref` and `toAllowedHref` of the Jini build Tovu resolves, and both must
 *    agree with the expected outcome on every row. A Jini change that loosens the allowlist (or makes the
 *    two entry points disagree) fails here, in the repo that renders the links.
 * 2. **No second implementation comes back.** A source scan fails on any local declaration named
 *    `safeHref` in app/package source (tests are not scanned), so a future edit cannot quietly
 *    re-create a Tovu-side copy to drift.
 *
 * ## `dist` vs `src` — asserted against
 *
 * The Jini side is asserted against **`dist`**: `@jini-ai/cms/navigation/href`'s package.json `exports` map
 * points only at `./dist/navigation/index.js`. After editing Jini's `packages/cms/src/navigation/href.ts`,
 * rebuild it (`pnpm --filter @jini-ai/cms build`, Jini repo) before re-running this gate, or it asserts
 * against the previous `dist`. A disclosed limitation (the "stale dist silently ships old behavior"
 * class this workspace has hit before), not fixed here.
 *
 * Usage: npx tsx development/scripts/check-menu-href-allowlist-sync.ts [--root <dir>]
 * Exit codes: 0 = the standard passes every table row and no local copy exists.
 *             1 = a row disagrees, or a local `safeHref` declaration was found.
 */
import { isAllowedHref, toAllowedHref } from "@jini-ai/cms/navigation/href";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_ROOT = path.resolve(import.meta.dirname, "..", "..");

/** A single implementation's accept/reject predicate, normalized to a boolean regardless of whether
 *  the underlying function rejects (returns `false`) or coerces (returns `"#"`) on failure. */
export type HrefChecker = (href: string) => boolean;

// ---------------------------------------------------------------------------
// Adversarial + legitimate table — kept in sync BY EYE with Jini's own copy in
// `packages/cms/src/navigation/__tests__/href.test.ts` (that repo cannot import this file, and this
// repo cannot import that repo's test file, so the two lists are independently maintained — verify
// they still match when editing either).
// ---------------------------------------------------------------------------

export const REJECTED_HREFS: readonly string[] = [
  "javascript:alert(1)",
  "vbscript:msgbox(1)",
  "java\tscript:alert(1)",
  "java\nscript:alert(1)",
  "java\rscript:alert(1)",
  " javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "\u0001javascript:alert(1)", // leading C0 control (not just whitespace) ahead of the scheme
  "\u0000javascript:alert(1)", // leading NUL byte, same class
  "file:///etc/passwd",
  "blob:https://evil.example/x",
  "about:blank",
  "data:text/html,<script>alert(1)</script>",
  "//evil.example",
  "/\\evil.example",
  "/\t/evil.example",
  // A protocol-relative href is off-origin whatever its host, including the placeholder hosts the
  // standard (and Tovu's two retired copies) resolved `/…` hrefs against.
  "//safehref.invalid/x",
  "/\\safehref.invalid/x",
  "//safehref.invalid:80/x",
  "//tovu-safehref.invalid/x",
  "/\\tovu-safehref.invalid/x",
  "//tovu-safehref.invalid:443/x",
  "//tovu-safehref.invalid:80/x",
];

export const ACCEPTED_HREFS: readonly string[] = [
  "/quickstart",
  "#posts",
  "https://ok.example/x",
  "mailto:a@b.example",
];

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export interface HrefMismatch {
  readonly href: string;
  readonly expectedAccept: boolean;
  /** implementation name -> whether IT accepted this href (so a caller can see exactly which
   *  implementation(s) disagreed with the expectation, not just that a mismatch happened). */
  readonly results: Readonly<Record<string, boolean>>;
}

/**
 * Runs every href in `table` through every named checker in `checkers` and reports any row where a
 * checker's accept/reject decision does not match `expectedAccept` — i.e. every checker must agree
 * with the EXPECTED outcome (and therefore with each other) on every row. Reports per-implementation
 * results on a mismatch so the caller does not have to re-run anything to see which one diverged.
 *
 * @complexity O(c · h) in checkers times hrefs — both small in practice (2 checkers, ~27 hrefs).
 */
export function compareCheckers(
  checkers: Readonly<Record<string, HrefChecker>>,
  table: readonly { readonly href: string; readonly expectedAccept: boolean }[]
): readonly HrefMismatch[] {
  const mismatches: HrefMismatch[] = [];
  for (const { href, expectedAccept } of table) {
    const results: Record<string, boolean> = {};
    let allMatch = true;
    for (const [name, checker] of Object.entries(checkers)) {
      const accepted = checker(href);
      results[name] = accepted;
      if (accepted !== expectedAccept) allMatch = false;
    }
    if (!allMatch) mismatches.push({ href, expectedAccept, results });
  }
  return mismatches;
}

/** Builds the shared table from {@link REJECTED_HREFS}/{@link ACCEPTED_HREFS} — `expectedAccept` false
 *  and true respectively. Exported so the sibling test can reuse the exact same table `main()` uses. */
export function buildSharedTable(): readonly { readonly href: string; readonly expectedAccept: boolean }[] {
  return [
    ...REJECTED_HREFS.map((href) => ({ href, expectedAccept: false })),
    ...ACCEPTED_HREFS.map((href) => ({ href, expectedAccept: true })),
  ];
}

/** The two entry points of the standard, each normalized to {@link HrefChecker}. */
export function jiniHrefCheckers(): Readonly<Record<string, HrefChecker>> {
  return {
    "jini:isAllowedHref": (href) => isAllowedHref({ rawHref: href }),
    "jini:toAllowedHref": (href) => toAllowedHref({ rawHref: href }) !== "#",
  };
}

// ---------------------------------------------------------------------------
// Local-copy scan
// ---------------------------------------------------------------------------

export interface LocalHrefCopy {
  readonly file: string;
  readonly line: number;
}

const LOCAL_SAFE_HREF_DECLARATION_RE = /\b(?:function\s+safeHref\b|(?:const|let|var)\s+safeHref\b)/;
/** A line that is only comment text (`//`, `/*`, or a block comment's ` *` continuation) is a mention, not a declaration. */
const COMMENT_LINE_RE = /^\s*(?:\/\/|\/\*|\*)/;
const SKIPPED_DIRECTORY_NAMES = new Set(["node_modules", "dist", "__tests__", "coverage"]);

function* sourceFilesUnder({ dir }: { dir: string }): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORY_NAMES.has(entry.name)) yield* sourceFilesUnder({ dir: full });
      continue;
    }
    if (/\.(?:ts|tsx|mts)$/.test(entry.name) && !/\.test\./.test(entry.name)) yield full;
  }
}

/**
 * Finds every non-test source file under `<root>/apps/*` and `<root>/packages/*` that DECLARES a
 * `safeHref` (a `function`, `const`, `let` or `var` named `safeHref`). An import of one, or a
 * comment mentioning one, is not a declaration. Reads real files; a missing `apps`/`packages` directory is simply nothing to scan.
 *
 * @complexity O(total source bytes) — one pass over each file.
 */
export function findLocalHrefAllowlists({ root }: { root: string }): readonly LocalHrefCopy[] {
  const found: LocalHrefCopy[] = [];
  for (const top of ["apps", "packages"]) {
    const topDir = path.join(root, top);
    if (!fs.existsSync(topDir)) continue;
    for (const file of sourceFilesUnder({ dir: topDir })) {
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((text, index) => {
        if (!COMMENT_LINE_RE.test(text) && LOCAL_SAFE_HREF_DECLARATION_RE.test(text)) found.push({ file: path.relative(root, file), line: index + 1 });
      });
    }
  }
  return found;
}

export interface MenuHrefSyncResult {
  readonly mismatches: readonly HrefMismatch[];
  readonly localCopies: readonly LocalHrefCopy[];
}

/**
 * Runs the shared table through the real Jini entry points and scans `root` for a local copy.
 * Exported so the sibling test's "live" regression test can call this directly.
 */
export function runMenuHrefAllowlistSync({ root = DEFAULT_ROOT }: { root?: string } = {}): MenuHrefSyncResult {
  return {
    mismatches: compareCheckers(jiniHrefCheckers(), buildSharedTable()),
    localCopies: findLocalHrefAllowlists({ root }),
  };
}

function parseRootArgument({ argv }: { argv: readonly string[] }): string {
  const index = argv.indexOf("--root");
  if (index === -1) return DEFAULT_ROOT;
  const value = argv[index + 1];
  if (value === undefined) throw new Error("--root needs a directory");
  return path.resolve(value);
}

function main(): void {
  const { mismatches, localCopies } = runMenuHrefAllowlistSync({ root: parseRootArgument({ argv: process.argv.slice(2) }) });
  if (mismatches.length === 0 && localCopies.length === 0) {
    console.log(
      `check:menu-href-allowlist-sync — ok — jini:isAllowedHref and jini:toAllowedHref agree on all ${
        REJECTED_HREFS.length + ACCEPTED_HREFS.length
      } table rows and no local safeHref exists.`
    );
    return;
  }
  for (const m of mismatches) {
    console.error(`  - ${JSON.stringify(m.href)} (expected accept=${m.expectedAccept}): ${JSON.stringify(m.results)}`);
  }
  if (mismatches.length > 0) {
    console.error(`check:menu-href-allowlist-sync — ${mismatches.length} href(s) disagree with the expected outcome. The Jini href standard no longer matches what Tovu's renderers rely on.`);
  }
  for (const copy of localCopies) {
    console.error(`  - ${copy.file}:${copy.line} declares its own safeHref`);
  }
  if (localCopies.length > 0) {
    console.error("check:menu-href-allowlist-sync — a local safeHref is a second href standard. Import toAllowedHref/isAllowedHref from @jini-ai/cms/navigation/href instead.");
  }
  process.exit(1);
}

// Guarded, following check-governance-adr-scope-drift.ts's own precedent: this file is also imported
// as a plain module by its own unit test, which exercises the pure functions directly without this
// top-level `main()` also running and exiting.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
