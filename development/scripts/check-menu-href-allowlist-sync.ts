/**
 * Behavioral-equivalence gate for the author-link href allowlist (2026-09-03).
 *
 * ## What this catches, and why it's needed
 *
 * The predicate "is this href safe to emit as a public `<a href>`" now exists in three places:
 *
 * 1. **Canonical**: `isAllowedHref`, exported from `@jini-ai/cms/navigation` (Jini repo,
 *    `packages/cms/src/navigation/menu-service.ts`). Write-time — rejects a menu item's `url` target
 *    with a 400 `MenuValidationError` when it fails.
 * 2. `safeHref` in `apps/website/src/server/inbound/public-http/http/site/render.ts` (this repo).
 *    Render-time — coerces a failing value to `"#"` instead of rejecting.
 * 3. `safeHref` in `apps/website/src/features/theme/static-render.ts` (this repo, static-tier
 *    theme menu rendering). Same render-time coerce-to-`"#"` contract as #2 — a DELIBERATE duplicate
 *    of it, not a shared import, because `features/theme` may not deep-import `server/inbound/**`
 *    (`check:boundaries`' `feature-no-server-or-framework-imports` rule).
 *
 * All three are supposed to accept and reject the exact same shapes. They drifted once already (the
 * write-time copy was a scheme DENYLIST until this same day's companion fix promoted the render-time
 * copies' ALLOWLIST logic into Jini as the canonical implementation) and a HAND-MAINTAINED "keep
 * these three in sync" doc-comment is not a mechanism — nothing stops a future edit to any one of
 * them from silently reopening the gap. This script is the mechanism: it DERIVES a real, callable
 * function from each copy's actual current source (see "How the two Tovu copies are tested" below)
 * and asserts identical accept/reject behavior across a shared adversarial + legitimate table, so a
 * divergence fails a `check:*` script instead of drifting silently.
 *
 * ## How the two Tovu copies are tested — DERIVED, not hand-copied
 *
 * `render.ts` and `static-render.ts` are off-limits to edit in the change that added this gate (a
 * separate agent owns/owned them), so their `safeHref` functions are not `export`ed and cannot be
 * `import`ed directly. Rather than hand-copy their logic into this script (which would just be a
 * FOURTH copy, reintroducing the exact drift risk this gate exists to close), {@link extractSafeHrefDeclaration}
 * pulls the real, current function text out of each file (a balanced-brace scan anchored on the
 * literal `function safeHref(...)` declaration, plus its two `SAFE_HREF_RESOLUTION_*` const
 * dependencies), and {@link loadHrefChecker} writes that EXACT extracted text to a throwaway `.ts`
 * file and `import()`s it for real — so this gate always tests whatever the live file currently
 * contains, not a snapshot frozen at the time this script was written. If either file's `safeHref` is
 * ever renamed, restructured beyond what the extraction regex tolerates, or simply deleted, extraction
 * itself throws (caught in `main()`, reported, exit 1) rather than silently skipping that copy.
 *
 * ## `dist` vs `src` — asserted against
 *
 * The canonical Jini side is asserted against **`dist`**, not `src`: `@jini-ai/cms/navigation`'s
 * package.json `exports` map points only at `./dist/navigation/index.js` — there is no resolution
 * path from a consumer's `import` to Jini's `src/`. This means the gate can go stale relative to an
 * UNBUILT Jini source edit: after editing `packages/cms/src/navigation/menu-service.ts`, run
 * `pnpm --filter @jini-ai/cms build` (Jini repo) before re-running this gate, or it keeps asserting
 * against the previous `dist`. That is a real, disclosed limitation (the same "stale dist silently
 * ships old behavior" failure class this workspace has hit before with `packages/daemon/dist`), not
 * fixed here — this gate polices CROSS-REPO behavioral sync, not Jini's own build freshness, which is
 * a separate, unrelated problem. The two Tovu copies, by contrast, are asserted straight against
 * their live `.ts` SOURCE — no build step, always current.
 *
 * Usage: npx tsx development/scripts/check-menu-href-allowlist-sync.ts
 * Exit codes: 0 = all three copies agree on every href in the shared table.
 *             1 = at least one disagrees, or a copy's source could not be extracted at all.
 */
import { isAllowedHref } from "@jini-ai/cms/navigation";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const RENDER_TS_PATH = path.join(
  REPO_ROOT,
  "apps/website/src/server/inbound/public-http/http/site/render.ts"
);
const STATIC_RENDER_TS_PATH = path.join(REPO_ROOT, "apps/website/src/features/theme/static-render.ts");

/** A single implementation's accept/reject predicate, normalized to a boolean regardless of whether
 *  the underlying function rejects (returns `false`) or coerces (returns `"#"`) on failure. */
export type HrefChecker = (href: string) => boolean;

// ---------------------------------------------------------------------------
// Adversarial + legitimate table — kept in sync BY EYE with Jini's own copy in
// `packages/cms/src/navigation/__tests__/menu-service.test.ts`'s `DISALLOWED_URL_TARGET_HREFS` /
// `ALLOWED_URL_TARGET_HREFS` (that repo cannot import this file, and this repo cannot import that
// repo's test file, so the two lists are independently maintained — verify they still match when
// editing either).
// ---------------------------------------------------------------------------

export const REJECTED_HREFS: readonly string[] = [
  "javascript:alert(1)",
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
];

export const ACCEPTED_HREFS: readonly string[] = [
  "/quickstart",
  "#posts",
  "https://ok.example/x",
  "mailto:a@b.example",
];

// ---------------------------------------------------------------------------
// Extraction — pure text-in/text-out, independently testable without touching the filesystem.
// ---------------------------------------------------------------------------

/**
 * Returns the source range `[openBraceIndex, matchingCloseBraceIndex]` (inclusive) of the first
 * balanced `{...}` block starting at `openBraceIndex`, which must itself point at a `{`.
 *
 * @complexity O(n) in the scanned range's length — one linear pass, no backtracking.
 */
export function extractBalancedBraces(source: string, openBraceIndex: number): string {
  if (source[openBraceIndex] !== "{") {
    throw new Error(`extractBalancedBraces: index ${openBraceIndex} is not '{'`);
  }
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(openBraceIndex, i + 1);
    }
  }
  throw new Error("extractBalancedBraces: no matching closing brace found (unbalanced input)");
}

const SAFE_HREF_CONSTS_RE =
  /const SAFE_HREF_RESOLUTION_BASE\s*=\s*"[^"]*";\s*\nconst SAFE_HREF_RESOLUTION_ORIGIN\s*=\s*new URL\(SAFE_HREF_RESOLUTION_BASE\)\.origin;/;
const SAFE_HREF_FN_START_RE = /function safeHref\([^)]*\)[^{]*\{/;

/**
 * Extracts a self-contained, importable `.ts` module body from `source` (a whole file's text):
 * the two `SAFE_HREF_RESOLUTION_*` const declarations `safeHref` depends on, verbatim, followed by
 * the ENTIRE `safeHref` function declaration (found via a balanced-brace scan, so nested `if`/`try`
 * blocks inside it cannot truncate the extraction early), followed by an `export` statement.
 *
 * Deliberately throws rather than returning a best-effort partial result when either anchor is
 * missing — a silently-empty or truncated extraction would make the caller compare against
 * meaningless code and report a false "in sync", which is worse than a loud failure.
 *
 * @param source the whole file's text (caller supplies it; this function does no I/O)
 * @param label the file path, used only to make a thrown error message locate the problem
 * @complexity O(n) in `source`'s length.
 */
export function extractSafeHrefDeclaration(source: string, label: string): string {
  const constsMatch = SAFE_HREF_CONSTS_RE.exec(source);
  if (!constsMatch) {
    throw new Error(
      `extractSafeHrefDeclaration: could not find the SAFE_HREF_RESOLUTION_BASE/ORIGIN const pair in ${label}`
    );
  }
  const fnStartMatch = SAFE_HREF_FN_START_RE.exec(source);
  if (!fnStartMatch) {
    throw new Error(`extractSafeHrefDeclaration: could not find 'function safeHref(...)' in ${label}`);
  }
  const openBraceIndex = fnStartMatch.index + fnStartMatch[0].length - 1;
  const fnBody = extractBalancedBraces(source, openBraceIndex);
  const fnDeclaration = source.slice(fnStartMatch.index, openBraceIndex) + fnBody;
  return `${constsMatch[0]}\n\n${fnDeclaration}\n\nexport { safeHref };\n`;
}

/**
 * Reads `filePath`, extracts its `safeHref` declaration (see {@link extractSafeHrefDeclaration}),
 * writes the extracted text to a throwaway `.ts` file, `import()`s it for a REAL callable (relying on
 * this script's own `tsx` process-wide loader hook to strip the extracted file's TypeScript syntax —
 * same as every other `development/scripts/*.ts` entry point), and returns a boolean-normalized
 * {@link HrefChecker}. The throwaway file is removed in a `finally`, whether extraction/import
 * succeeds or throws.
 *
 * @complexity O(n) in the source file's length for extraction; one file write, one dynamic import,
 * one file delete.
 */
export async function loadHrefChecker(filePath: string): Promise<HrefChecker> {
  const source = fs.readFileSync(filePath, "utf8");
  const declaration = extractSafeHrefDeclaration(source, filePath);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "menu-href-allowlist-sync-"));
  const tmpFile = path.join(tmpDir, "extracted-safe-href.ts");
  try {
    fs.writeFileSync(tmpFile, declaration, "utf8");
    const mod = (await import(pathToFileURL(tmpFile).href)) as { safeHref: (value: string) => string };
    if (typeof mod.safeHref !== "function") {
      throw new Error(`loadHrefChecker: extracted module from ${filePath} did not export a 'safeHref' function`);
    }
    const safeHref = mod.safeHref;
    return (href: string) => safeHref(href) !== "#";
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

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
 * checker's accept/reject decision does not match `expectedAccept` for that table — i.e. every
 * checker must agree with the EXPECTED outcome (and therefore with each other) on every row. Reports
 * per-implementation results on a mismatch so the caller does not have to re-run anything to see which
 * implementation(s) diverged.
 *
 * @complexity O(c · h) in checkers times hrefs — both small in practice (3 checkers, ~19 hrefs).
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

/**
 * Loads all three real implementations and runs {@link compareCheckers} over the shared table.
 * Exported so the sibling test's "live" regression test can call this directly, the same shape
 * `check-governance-adr-scope-drift.ts`'s own "live" test calls its exported scan function.
 */
export async function runMenuHrefAllowlistSync(): Promise<readonly HrefMismatch[]> {
  const [renderTsChecker, staticRenderTsChecker] = await Promise.all([
    loadHrefChecker(RENDER_TS_PATH),
    loadHrefChecker(STATIC_RENDER_TS_PATH),
  ]);
  const checkers: Record<string, HrefChecker> = {
    "jini:isAllowedHref": (href) => isAllowedHref(href),
    "render.ts:safeHref": renderTsChecker,
    "static-render.ts:safeHref": staticRenderTsChecker,
  };
  return compareCheckers(checkers, buildSharedTable());
}

async function main(): Promise<void> {
  let mismatches: readonly HrefMismatch[];
  try {
    mismatches = await runMenuHrefAllowlistSync();
  } catch (err) {
    console.error(
      `check:menu-href-allowlist-sync — could not run the comparison at all (extraction failure, not a behavioral mismatch): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    process.exit(1);
    return;
  }

  if (mismatches.length === 0) {
    console.log(
      `check:menu-href-allowlist-sync — ok — jini:isAllowedHref, render.ts:safeHref, and static-render.ts:safeHref agree on all ${
        REJECTED_HREFS.length + ACCEPTED_HREFS.length
      } table rows.`
    );
    return;
  }

  console.error(`check:menu-href-allowlist-sync — ${mismatches.length} href(s) produced disagreement across the three copies:`);
  for (const m of mismatches) {
    console.error(`  - ${JSON.stringify(m.href)} (expected accept=${m.expectedAccept}): ${JSON.stringify(m.results)}`);
  }
  console.error(
    "\nThe write-time (Jini) and render-time (Tovu x2) href allowlists have drifted apart. Bring the " +
      "logic back in sync — see this script's own file header for which copy is canonical and the " +
      "retirement plan for the two Tovu duplicates."
  );
  process.exit(1);
}

// Guarded, following check-governance-adr-scope-drift.ts's own precedent: this file is also imported
// as a plain module by its own unit test, which exercises the pure functions (and the async
// live-comparison function) directly without this top-level `main()` also running and exiting.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main();
}
