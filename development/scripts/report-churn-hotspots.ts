/**
 * Churn × complexity hotspot report (2026-08-20).
 *
 * ## What this measures, and what it does NOT
 *
 * Complexity alone says which files are *bad*. It does not say which are *worth fixing*. A
 * cyclomatic-30 file nobody has touched in a year costs nothing; a cyclomatic-15 file edited
 * weekly costs on every edit. This crosses the two:
 *
 *     score = churn × (maxCyclomatic + maxCognitive)
 *
 * where `churn` is the number of commits touching the file in the last `--months` window (default
 * 6), and the two complexity numbers are the per-file MAXIMA across every violating function in
 * it — the same ESLint `complexity` / `sonarjs/cognitive-complexity` rules at the same hard 9/9
 * ceiling that `check-src-complexity-drift.ts` and `check-admin-complexity-drift.ts` enforce.
 *
 * This is a DIAGNOSTIC, not a gate. It always exits 0 and ratchets nothing. Churn is not a defect
 * — a file that changes often may simply be where the product is being built — so there is no
 * threshold to fail. `check:src-complexity-drift` already blocks on the complexity half; this only
 * helps decide what to spend a refactor pass on. Mirrors `classify-coverage-gaps.ts`'s role
 * relative to `check-route-coverage-diff.ts`.
 *
 * Scope is wider than either existing complexity gate on purpose: those cover
 * `src/server/routes/**` and `apps/admin/src/**`, which together leave ~262 of the repo's 367
 * 9/9 violations in subtrees nothing watches (measured 2026-08-20 — see
 * `ADS-memory/reports/2026-08-20-repo-wide-coverage-complexity-measurement.md` §4).
 *
 * ## The `.js` plugin trap — why the --ignore-pattern flags below are load-bearing
 *
 * `eslint.config.mjs` registers the `sonarjs` plugin only on `files: ['**\/*.ts','**\/*.tsx']`.
 * ESLint 10 lints `.js`/`.mjs`/`.cjs` by default, and `src/` contains 55 `.js` and 2 `.mjs` files.
 * A `--rule` override naming `sonarjs/cognitive-complexity` applied to a file matched by no
 * plugin-bearing config object is a HARD ERROR ("could not find plugin sonarjs"), not a skip — it
 * aborts the whole run and emits no JSON at all. `check-src-complexity-drift.ts` never hits this
 * only because `src/server/routes` happens to contain no `.js`. Any wider scope must exclude them.
 *
 * ## Reading the output — two caveats that fire on real files here
 *
 * 1. `FLAT_WIRING`: high cyclomatic with cognitive 0 is operator counting (a flat `??` chain, a
 *    long default-parameter list, a sequence of `||` fallbacks), not branching. Each default
 *    parameter costs +1 cyclomatic under this config independent of any control flow. Composition
 *    roots are the canonical case: `src/server/app.ts` measures cyclomatic 38 / cognitive 0 and
 *    `src/server/deps.ts` 14 / 0, both being long flat wiring lists where that IS the correct
 *    shape. They also carry the repo's highest churn (81 and 65) because a composition root
 *    changes whenever anything it wires changes — so they rank near the top on score while being
 *    the two files on the list least worth refactoring. Trust cognitive over cyclomatic; the
 *    inverse (high cognitive relative to cyclomatic) means nesting, which is the shape actually
 *    worth removing.
 * 2. `COLD`: zero commits in the window. Debt in code nobody touches is the cheapest debt there
 *    is — deprioritize rather than refactor. (Measured 2026-08-20: zero of 173 violating files
 *    were cold, so this flag is a real guard, not decoration.)
 *
 * ## Churn's own limits
 *
 * Commit count is a proxy, not a measurement of change volume: one 400-line commit and one
 * typo-fix commit count the same. `--follow` is used so a rename does not reset a file's history,
 * but `--follow` is single-path only and can lose history across a rename that also split a file.
 * Squash-merge workflows compress many real edits into one commit. Treat the ordering as a strong
 * hint and the absolute numbers as soft.
 *
 * Usage:
 *   npx tsx development/scripts/report-churn-hotspots.ts [--months=6] [--top=25] [--scope=src] [--json]
 * Exit code: always 0.
 */
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const THRESHOLD = 9;

/** Excluded from every scan. `src/themes` and `src/theme-archive` hold vendored/authored theme
 * sources rather than product code — owner instruction 2026-08-20 is that they are out of scope
 * for complexity work. The `.js`/`.mjs`/`.cjs` exclusions are the plugin trap in the header and
 * are NOT optional. */
const IGNORE_PATTERNS = [
  "**/*.js",
  "**/*.mjs",
  "**/*.cjs",
  "src/themes/**",
  "src/theme-archive/**",
] as const;

export interface Hotspot {
  readonly file: string;
  readonly cyclomatic: number;
  readonly cognitive: number;
  readonly violations: number;
  readonly churn: number;
  readonly score: number;
  readonly flags: readonly string[];
}

interface EslintMessage {
  ruleId: string | null;
  message: string;
}
interface EslintFileResult {
  filePath: string;
  messages: EslintMessage[];
}

interface Options {
  readonly months: number;
  readonly top: number;
  readonly scope: string;
  readonly json: boolean;
}

export function parseArgs(argv: readonly string[]): Options {
  const get = (name: string): string | undefined => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit?.slice(name.length + 3);
  };
  const months = Number(get("months") ?? 6);
  const top = Number(get("top") ?? 25);
  if (!Number.isFinite(months) || months <= 0) throw new Error(`--months must be a positive number, got "${get("months")}"`);
  if (!Number.isFinite(top) || top <= 0) throw new Error(`--top must be a positive number, got "${get("top")}"`);
  return { months, top, scope: get("scope") ?? "src", json: argv.includes("--json") };
}

/**
 * Live ESLint scan with `complexity` and `sonarjs/cognitive-complexity` hard-overridden to
 * `error`/9, same technique as `check-src-complexity-drift.ts`. Reads ESLint's structured `-f json`
 * output rather than scraping the human-readable formatter, which breaks on the next formatter
 * change. Returns per-file MAXIMA, because a file's refactor cost is driven by its worst function,
 * not by the sum of its functions' scores (those are per-scope and do not compose — see
 * `check-admin-complexity-drift.ts` on why nesting never folds into the parent here).
 */
export function scanComplexity(scope: string): Map<string, { cyclomatic: number; cognitive: number; violations: number }> {
  const ruleOverride = JSON.stringify({
    complexity: ["error", THRESHOLD],
    "sonarjs/cognitive-complexity": ["error", THRESHOLD],
  });
  const args = ["eslint", "--no-error-on-unmatched-pattern"];
  for (const pattern of IGNORE_PATTERNS) args.push("--ignore-pattern", pattern);
  args.push("--rule", ruleOverride, "-f", "json", scope);

  let raw: string;
  try {
    raw = execFileSync("npx", args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 * 32 });
  } catch (err) {
    // ESLint exits 1 whenever it finds lint errors — the expected case here, and its JSON report is
    // still on stdout (execFileSync attaches it to the thrown error). A genuine tooling failure
    // (crash, bad flags, the plugin trap in the header) produces no stdout at all, and must rethrow
    // rather than be silently reported as "no violations found".
    const stdout = (err as { stdout?: string }).stdout;
    if (typeof stdout !== "string" || stdout.length === 0) throw err;
    raw = stdout;
  }

  const results = JSON.parse(raw) as EslintFileResult[];
  const byFile = new Map<string, { cyclomatic: number; cognitive: number; violations: number }>();
  for (const result of results) {
    const relPath = path.relative(REPO_ROOT, result.filePath).split(path.sep).join("/");
    // Same exclusion both existing complexity gates apply, for the same reason: test and
    // measurement code is out of scope for this ceiling, not silently-tracked debt.
    if (relPath.includes("__tests__/") || relPath.includes("__measurements__/") || relPath.includes(".test.")) continue;
    let cyclomatic = 0;
    let cognitive = 0;
    let violations = 0;
    for (const message of result.messages) {
      if (message.ruleId === "complexity") {
        violations++;
        const m = /complexity of (\d+)/.exec(message.message);
        if (m) cyclomatic = Math.max(cyclomatic, Number(m[1]));
      } else if (message.ruleId === "sonarjs/cognitive-complexity") {
        violations++;
        const m = /Cognitive Complexity from (\d+)/.exec(message.message);
        if (m) cognitive = Math.max(cognitive, Number(m[1]));
      }
    }
    if (violations > 0) byFile.set(relPath, { cyclomatic, cognitive, violations });
  }
  return byFile;
}

/**
 * Commits touching `file` in the last `months` months. `--follow` keeps a rename from resetting a
 * file's history; see the header for what it still cannot survive. A path that git does not know
 * (brand-new, untracked) yields 0 rather than throwing — an untracked file legitimately has no
 * history, which is not an error condition for a diagnostic.
 */
export function churnFor(file: string, months: number): number {
  try {
    const out = execFileSync(
      "git",
      ["log", `--since=${months} months ago`, "--follow", "--format=%H", "--", file],
      { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 * 8 }
    );
    return out.split("\n").filter((line) => line.length > 0).length;
  } catch {
    return 0;
  }
}

/** Pure — separated from I/O so it is testable without a git repo or an ESLint run. */
export function rankHotspots(
  complexity: ReadonlyMap<string, { cyclomatic: number; cognitive: number; violations: number }>,
  churn: ReadonlyMap<string, number>
): Hotspot[] {
  const rows: Hotspot[] = [];
  for (const [file, c] of complexity) {
    const fileChurn = churn.get(file) ?? 0;
    const flags: string[] = [];
    // Cognitive exactly 0 alongside a cyclomatic violation is the operator-counting signature, not
    // branching. Gated on a cyclomatic violation actually being present so a file reported only for
    // cognitive can never be mislabelled flat.
    if (c.cognitive === 0 && c.cyclomatic > THRESHOLD) flags.push("FLAT_WIRING");
    if (fileChurn === 0) flags.push("COLD");
    rows.push({
      file,
      cyclomatic: c.cyclomatic,
      cognitive: c.cognitive,
      violations: c.violations,
      churn: fileChurn,
      score: fileChurn * (c.cyclomatic + c.cognitive),
      flags,
    });
  }
  // Score descending; ties broken by raw complexity then path, so output is deterministic across
  // runs (a churn tie between two files must not reorder them run to run).
  rows.sort((a, b) => b.score - a.score || b.cyclomatic + b.cognitive - (a.cyclomatic + a.cognitive) || a.file.localeCompare(b.file));
  return rows;
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`report-churn-hotspots — scanning ${opts.scope} at ${THRESHOLD}/${THRESHOLD}, churn window ${opts.months} months...\n`);

  const complexity = scanComplexity(opts.scope);
  const churn = new Map<string, number>();
  for (const file of complexity.keys()) churn.set(file, churnFor(file, opts.months));
  const rows = rankHotspots(complexity, churn);

  if (opts.json) {
    console.log(JSON.stringify({ months: opts.months, scope: opts.scope, threshold: THRESHOLD, hotspots: rows }, null, 2));
    return;
  }

  if (rows.length === 0) {
    console.log(`report-churn-hotspots — no file in ${opts.scope} violates ${THRESHOLD}/${THRESHOLD}.`);
    return;
  }

  console.log(`report-churn-hotspots — ${rows.length} violating file(s), top ${Math.min(opts.top, rows.length)} by score:\n`);
  console.log("  score  churn   cyc   cog   n  file");
  for (const row of rows.slice(0, opts.top)) {
    const flags = row.flags.length > 0 ? `  [${row.flags.join(" ")}]` : "";
    console.log(
      `  ${String(row.score).padStart(5)}  ${String(row.churn).padStart(5)}  ${String(row.cyclomatic).padStart(4)}  ${String(row.cognitive).padStart(4)}  ${String(row.violations).padStart(2)}  ${row.file}${flags}`
    );
  }

  const flat = rows.filter((r) => r.flags.includes("FLAT_WIRING"));
  const cold = rows.filter((r) => r.flags.includes("COLD"));
  console.log("");
  if (flat.length > 0) {
    console.log(
      `  FLAT_WIRING (${flat.length}) — cognitive 0 with a cyclomatic violation: operator counting, not branching. Usually a composition root or a default-parameter list, where a flat sequence is the correct shape. Do not refactor on score alone.`
    );
  }
  console.log(
    cold.length > 0
      ? `  COLD (${cold.length}) — no commits in the last ${opts.months} months. Cheapest debt in the repo; deprioritize.`
      : `  COLD (0) — every violating file was touched in the last ${opts.months} months. None of this debt is in cold code.`
  );
  console.log(`\n  Diagnostic only — this script ratchets nothing and always exits 0.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
