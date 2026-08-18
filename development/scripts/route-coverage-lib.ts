/**
 * Shared lcov-parsing helpers for the `src/server/routes/**` coverage gates
 * (`check-route-coverage-floor.ts`, `check-route-coverage-diff.ts`).
 *
 * Both gates read `development/coverage/lcov.info`, produced by `npm run test:cov` — they do NOT
 * run tests themselves. `npm run test:cov` already fails the build on any test failure (its own
 * `node --test` exit code), and per the 2026-08-16 coverage audit's §3, node:test still writes the
 * lcov reporter's destination file even when a test in the run fails — so CI can run `test:cov` once
 * and run both gates as fast, pure-parsing steps after it. If `test:cov` itself fails, the workflow
 * stops there (fail-fast) and these gates never need to re-detect that failure independently.
 *
 * ## The trap this file works around
 *
 * Node's `--experimental-test-coverage` silently EXCLUDES from its report any file whose name
 * matches its own built-in test-file-discovery glob (patterns like `test-*.{js,cjs,mjs,ts}`) — even
 * when that file is application code, not a test, and even when `--test-coverage-include` is given
 * an explicit glob that matches it (verified 2026-08-16: an explicit include glob for the exact
 * directory still produced no row for the two files below). Passing an explicit
 * `--test-coverage-exclude` REPLACES that default silently rather than adding to it, which is why
 * `test:cov` in package.json now passes one (a sentinel pattern that matches nothing real in this
 * repo). Verified 2026-08-16: without that override, `src/server/routes/admin/assistant/
 * test-agent.ts` and `test-connection.ts` never appear in the lcov output AT ALL, regardless of how
 * well tested they are — the original 2026-08-16 audit's "no lcov record — never loaded" finding for
 * `test-connection.ts` specifically was measuring this Node behavior, not the file's real test
 * coverage (it has 8 passing tests hitting its exact registered route). Any FUTURE route file whose
 * name happens to start with `test-` would hit the same silent blind spot if this sentinel exclude
 * were ever removed from `test:cov`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const LCOV_PATH = path.join(REPO_ROOT, "development/coverage/lcov.info");
/** Produced by `npm run test:cov:server:unit` — every `*.test.ts` file EXCEPT the integration tier
 *  below (see `isIntegrationTestFile`). Read by `check-route-coverage-diff.ts`'s unit tier. */
export const LCOV_UNIT_PATH = path.join(REPO_ROOT, "development/coverage/lcov.unit.info");
/** Produced by `npm run test:cov:server:integration` — only files matching `isIntegrationTestFile`.
 *  Read by `check-route-coverage-diff.ts`'s integration tier. */
export const LCOV_INTEGRATION_PATH = path.join(REPO_ROOT, "development/coverage/lcov.integration.info");

export interface FileCoverage {
  /** repo-relative, forward-slash path, e.g. "src/server/routes/admin/assistant/test-agent.ts" */
  file: string;
  lf: number;
  lh: number;
  brf: number;
  brh: number;
  fnf: number;
  fnh: number;
}

export function pct(hit: number, found: number): number {
  return found === 0 ? 100 : (100 * hit) / found;
}

/** True for files either gate should evaluate: real `src/server/routes/**` source, excluding test
 *  files (co-located `__tests__/` dirs, `*.test.ts`, `*.spec.ts`) and this repo's established
 *  type-only convention files (`deps.ts` / `execution-deps.ts` / `types.ts` — the 2026-08-16 audit
 *  read three of these and confirmed every export is `export type`, so they can never produce a
 *  measurable line/branch/func number; all 17 of the audit's "zero coverage, non-issue" files match
 *  this exact basename set). A future type-only file under a different name would not be recognized
 *  by this heuristic and would need adding here, or it will read as a false failure on the diff gate.
 */
/** This repo's existing, established naming convention for the two test tiers (not invented here —
 *  see e.g. `src/server/__tests__/integration/boot-lifecycle-real-deps.integration.test.ts`): a test
 *  file is "integration" when its name ends `.integration.test.ts`, OR it lives under a
 *  `__tests__/integration/` directory (some integration suites are grouped that way without the
 *  filename suffix). Everything else ending `.test.ts` is "unit". Used both by the
 *  `test:cov:server:unit`/`test:cov:server:integration` npm scripts (which file list to hand
 *  `node --test`) and, implicitly, by which of `LCOV_UNIT_PATH`/`LCOV_INTEGRATION_PATH` a given
 *  test's coverage ends up in. */
export function isIntegrationTestFile(relPath: string): boolean {
  const normalized = relPath.split(path.sep).join("/");
  if (/\.integration\.test\.ts$/.test(normalized)) return true;
  return normalized.includes("/__tests__/integration/");
}

export function isMeasurableRouteFile(relPath: string): boolean {
  const normalized = relPath.split(path.sep).join("/");
  if (!normalized.startsWith("src/server/routes/")) return false;
  if (normalized.includes("/__tests__/")) return false;
  if (/\.(test|spec)\.ts$/.test(normalized)) return false;
  const base = path.basename(normalized);
  if (base === "deps.ts" || base === "execution-deps.ts" || base === "types.ts") return false;
  return true;
}

function toRepoRelative(sourceFilePath: string): string {
  const abs = sourceFilePath.trim();
  const rel = abs.startsWith(REPO_ROOT) ? path.relative(REPO_ROOT, abs) : abs;
  return rel.split(path.sep).join("/");
}

/** Pulls a single `KEY:123` numeric field out of one lcov record block; 0 if the key is absent
 *  (lcov omits BRF/BRH entirely for a file with no branches, for example). */
function lcovField(record: string, key: string): number {
  const match = record.match(new RegExp(`^${key}:(\\d+)$`, "m"));
  return Number(match?.[1] ?? 0);
}

/** Parses every `SF:`/`end_of_record` block in the lcov file into a `FileCoverage` row, with no
 *  filtering — callers that want only route files should use `loadRouteCoverage()` below. */
export function loadLcov(lcovPath: string = LCOV_PATH): FileCoverage[] {
  if (!existsSync(lcovPath)) {
    throw new Error(
      `${lcovPath} does not exist. Run \`npm run test:cov\` first — these gates only parse its output, they do not run tests themselves.`
    );
  }
  const text = readFileSync(lcovPath, "utf8");
  const records = text.split(/^end_of_record$/m);
  const out: FileCoverage[] = [];
  for (const rec of records) {
    const sf = rec.match(/^SF:(.+)$/m);
    if (!sf) continue;
    out.push({
      file: toRepoRelative(sf[1]),
      lf: lcovField(rec, "LF"),
      lh: lcovField(rec, "LH"),
      brf: lcovField(rec, "BRF"),
      brh: lcovField(rec, "BRH"),
      fnf: lcovField(rec, "FNF"),
      fnh: lcovField(rec, "FNH"),
    });
  }
  return out;
}

export function loadRouteCoverage(lcovPath: string = LCOV_PATH): FileCoverage[] {
  return loadLcov(lcovPath).filter((f) => isMeasurableRouteFile(f.file));
}
