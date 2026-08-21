/**
 * lcov dual-instantiation corruption detector (2026-08-21).
 *
 * ## The mechanism
 *
 * When a test spawns a Node child process that inherits `NODE_V8_COVERAGE`, the child loads Tovu
 * source through tsx's **CJS** hook instead of the ESM hook the parent used. That produces TWO
 * separate coverage images for the same source file -- the real ESM module, and esbuild's CJS
 * wrapper shim (the `__toCommonJS`/`__copyProps`/`__toESM`/`__export` helpers it injects) -- and
 * Node's lcov writer merges both into a single `SF:` block. When the low-fidelity wrapper image
 * wins that merge, the block's `DA:` (line-hit) records stop reflecting the real module's coverage
 * and instead reflect the wrapper shim's own tiny, module-load-level execution profile: every line
 * in the file collapses onto one of a handful of hit-count "buckets" that really belong to
 * `__export`/`__copyProps`/`__toCommonJS` themselves, not to the file's actual branches. A corrupted
 * block still reports a plausible-looking `LH:`/`LF:` summary -- the corruption is invisible in the
 * percentage and only shows up if you read the raw `DA:` records.
 *
 * ## What actually detects it (read this before "fixing" the threshold)
 *
 * The obvious-looking detector -- "flag any block whose `FN:`/`FNDA:` records name a CJS-wrapper
 * helper" -- was the first design proposed for this script and it is WRONG. Validated against 6 real
 * `npm run test:cov` lcov files from 2026-08-21 (one confirmed corrupt run, five confirmed clean):
 * wrapper-helper FN/FNDA records are present in EVERY first-party block in ALL SIX runs, including
 * the clean ones -- in fact `src/media/provider-credential-store.ts`'s wrapper FNDA numbers
 * (`__export`:128, `__copyProps`:128, `__toCommonJS`:32) are byte-identical between the corrupt run
 * and every clean run. Gating on wrapper-record presence alone would have failed all 6 runs, not the
 * 1 that was actually corrupt -- a 100% false-positive rate on this repo's own output. In this
 * codebase, EVERY first-party file that any child-process test touches gets its coverage
 * dual-instantiated; the corruption is not "does the merge happen" (it always does) but "which image
 * wins the DA merge."
 *
 * A second candidate -- "flag a block whose `DA:` records show few distinct hit-count values across
 * many lines" -- is closer but ALSO produces mass false positives on its own: measured against the
 * same 6 runs, a flat few-distinct-values threshold flagged 53-54 first-party files as "corrupt" in
 * EVERY SINGLE RUN, clean or not (e.g. `src/db/schema.ts`, 2589 lines, only 3 distinct hit-count
 * values -- it is just declarative schema code with almost no branching, not corruption; the same is
 * true of several barrel `index.ts` files). Distinct-value-count alone cannot tell "this file
 * naturally has low branching" from "this file's real data got replaced by the wrapper's."
 *
 * The signal that actually works, validated with ZERO false positives: a block is corrupt when its
 * `DA:` hit-count values are explained ENTIRELY by the wrapper helpers' OWN `FNDA:` hit-counts for
 * that same block (plus 0, since dead/unreached code under the wrapper legitimately reads 0). That
 * is the direct fingerprint of "the wrapper image, not the real module, produced every line's hit
 * count." Validated against all 172 first-party `SF:` blocks across all 6 real runs (1032
 * evaluations): exactly 1 FAIL (`src/media/provider-credential-store.ts` in the confirmed-corrupt
 * run) and 0 false FAILs across the other 1031 evaluations. A softened near-miss version of the same
 * comparison (most, not all, distinct values explained by the wrapper) produced exactly 1 real WARN
 * in the same dataset (`src/core/embeds/marker.ts`, an unrelated file in a different, otherwise-clean
 * run) and 0 elsewhere -- see `classifyBlock` below for the exact rule and
 * `__tests__/check-coverage-integrity.test.ts` for both real fixtures.
 *
 * ## Things that are NOT corruption -- do not flag these
 *
 * - Duplicate `FN:` entries within one `SF:` block are NORMAL in this repo's tsx-instrumented
 *   output. Function coverage % here is a range, not a number. Do not flag duplicates, and do not
 *   gate anything on function-count.
 * - `DA:` line numbers in this repo do NOT correspond to source lines (tsx strips comments before
 *   instrumenting). Never resolve or report a source `file:line` from an lcov line number --
 *   everything this script reports is at file granularity only.
 * - A specific `LH:` value is not a signature -- the corrupt run measured today was `LH:291`, and
 *   prior corrupt runs were `LH:294`. The magnitude varies; never gate on `LH:`.
 * - Wrapper-helper FN/FNDA presence by itself is not a signature either (see above) -- it is reported
 *   as diagnostic context on a finding, never as the reason a block failed.
 *
 * ## Scope
 *
 * Only `SF:` paths under `src/`, `packages/*​/src/`, or `apps/*​/src/` are evaluated -- everything
 * else (test infra, `node_modules`, build output, `development/`) is skipped without comment.
 *
 * Usage: npx tsx development/scripts/check-coverage-integrity.ts [lcovPath]
 *   lcovPath - defaults to development/coverage/lcov.info (npm run test:cov's output). This script
 *              only parses lcov output, it does not run tests itself.
 * Exit codes: 0 = no dual-instantiation corruption found (warnings, if any, are printed but do not
 *             fail the run). 1 = at least one corrupted block found, or the lcov file is
 *             missing/unreadable.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const DEFAULT_LCOV_PATH = path.join(REPO_ROOT, "development/coverage/lcov.info");

/** esbuild's CJS-wrapper helper names, injected into every tsx CJS-hook-loaded module. Their own
 *  FNDA hit-counts are the comparison set `classifyBlock` checks a block's `DA:` values against --
 *  see this file's header for why presence of these names ALONE is not a usable signal. */
const WRAPPER_HELPER_NAMES = new Set(["__toCommonJS", "__copyProps", "__toESM", "__export"]);

/** Below this many `DA:` records, a block has too few independent data points for a full- or
 *  near-subset match against the wrapper's hit-counts to mean anything -- a handful of lines
 *  coincidentally sharing one of the wrapper's own hit-count values is unremarkable in a tiny file
 *  (e.g. a 5-line re-export hit uniformly 32 times, which happens to equal `__toCommonJS`'s own
 *  count that run, is not evidence of anything). 30 is comfortably below every real corrupt or
 *  near-miss block measured today (357 and 293 DA records) and comfortably above the kind of trivial
 *  single-purpose file where a coincidental match is plausible.
 */
const MIN_DA_RECORDS_FOR_HEURISTIC = 30;

export interface LcovBlock {
  /** Raw `SF:` path text, not yet normalized to repo-relative. */
  readonly file: string;
  readonly fnda: ReadonlyArray<{ readonly name: string; readonly hits: number }>;
  /** `DA:` hit counts only, in record order. Line numbers are deliberately not kept -- see header. */
  readonly da: ReadonlyArray<number>;
}

export type BlockStatus = "fail" | "warn" | "ok" | "skip";

export interface BlockVerdict {
  readonly file: string;
  readonly status: BlockStatus;
  readonly reason: string;
}

export interface IntegrityReport {
  readonly failures: readonly BlockVerdict[];
  readonly warnings: readonly BlockVerdict[];
  /** First-party blocks actually run through the heuristic (i.e. not skipped as non-first-party). */
  readonly evaluated: number;
  readonly skipped: number;
}

/** Splits raw lcov text into per-`SF:` blocks. A record with no `SF:` line (malformed input, or text
 *  before the first block) is ignored rather than throwing -- this mirrors `route-coverage-lib.ts`'s
 *  `loadLcov`, which treats absence of an `SF:` line as "not a real record" rather than an error.
 *  @complexity O(n) in the input length; one regex pass per record for FNDA/DA extraction.
 */
export function parseLcovBlocks(lcovText: string): LcovBlock[] {
  const records = lcovText.split(/^end_of_record$/m);
  const blocks: LcovBlock[] = [];
  for (const record of records) {
    const sfMatch = record.match(/^SF:(.+)$/m);
    if (!sfMatch) continue;
    const fnda = [...record.matchAll(/^FNDA:(\d+),(.+)$/gm)].map((m) => ({
      hits: Number(m[1]),
      name: m[2],
    }));
    const da = [...record.matchAll(/^DA:\d+,(\d+)$/gm)].map((m) => Number(m[1]));
    blocks.push({ file: sfMatch[1].trim(), fnda, da });
  }
  return blocks;
}

/** Normalizes an `SF:` path to a repo-relative, forward-slash path, mirroring
 *  `route-coverage-lib.ts`'s `toRepoRelative`: only rewrites when the path is absolute and inside
 *  this repo, otherwise returns it unchanged (lcov paths in this repo's own output are already
 *  repo-relative in practice, but this keeps the function correct for an absolute-path input too).
 */
export function toRepoRelative(sfPath: string): string {
  const trimmed = sfPath.trim();
  const rel = trimmed.startsWith(REPO_ROOT) ? path.relative(REPO_ROOT, trimmed) : trimmed;
  return rel.split(path.sep).join("/");
}

/** True for first-party source: `src/**`, `packages/*​/src/**`, `apps/*​/src/**`. Everything else
 *  (test infra outside those trees, `node_modules`, build output, `development/**`) is out of scope
 *  for this check per the dispatch brief -- skipped, not evaluated.
 */
export function isFirstPartySourcePath(relPath: string): boolean {
  if (relPath.startsWith("src/")) return true;
  if (/^packages\/[^/]+\/src\//.test(relPath)) return true;
  if (/^apps\/[^/]+\/src\//.test(relPath)) return true;
  return false;
}

/**
 * Classifies one `SF:` block as `fail` (confirmed dual-instantiation corruption), `warn` (partial
 * match, reported but not gated), `ok` (evaluated, clean), or `skip` (out of scope).
 *
 * The comparison set is the wrapper helpers' own `FNDA:` hit-counts for THIS block, plus 0 (dead
 * code under whichever image lost the merge legitimately reads 0 no matter which helper's count it's
 * compared to). `fail` requires every one of the block's distinct `DA:` values to fall in that set,
 * with at least one non-zero match (an all-zero block is just an untested file, not corruption).
 * `warn` is the same comparison loosened to "at least as many distinct values explained by the
 * wrapper as not" -- a softer, non-blocking signal for a block that looks partially contaminated
 * without full proof. See this file's header for why a bare distinct-value-count threshold (with no
 * comparison to the wrapper's own counts) was rejected -- it false-positives on ~30% of this repo's
 * first-party files.
 *
 * @complexity O(f + d) per block, where f = FNDA record count and d = distinct DA value count.
 */
export function classifyBlock(block: LcovBlock): BlockVerdict {
  const file = toRepoRelative(block.file);

  if (!isFirstPartySourcePath(file)) {
    return {
      file,
      status: "skip",
      reason: "not a first-party src/**, packages/*/src/**, or apps/*/src/** path",
    };
  }

  if (block.da.length < MIN_DA_RECORDS_FOR_HEURISTIC) {
    return {
      file,
      status: "ok",
      reason: `only ${block.da.length} DA record(s) -- below the ${MIN_DA_RECORDS_FOR_HEURISTIC}-record floor for this heuristic`,
    };
  }

  const wrapperValues = new Set<number>();
  for (const { name, hits } of block.fnda) {
    if (WRAPPER_HELPER_NAMES.has(name)) wrapperValues.add(hits);
  }
  if (wrapperValues.size === 0) {
    return {
      file,
      status: "ok",
      reason: "no esbuild CJS-wrapper FNDA records in this block -- nothing to compare against",
    };
  }

  const comparisonSet = new Set(wrapperValues);
  comparisonSet.add(0);

  const distinctDa = [...new Set(block.da)].sort((a, b) => a - b);
  const overlap = distinctDa.filter((v) => comparisonSet.has(v));
  const extra = distinctDa.filter((v) => !comparisonSet.has(v));
  const overlapHasRealSignal = overlap.some((v) => v !== 0);
  const wrapperValuesSorted = [...wrapperValues].sort((a, b) => a - b);

  if (extra.length === 0 && overlapHasRealSignal) {
    return {
      file,
      status: "fail",
      reason:
        `every one of this block's ${distinctDa.length} distinct DA hit-count value(s) [${distinctDa.join(", ")}] ` +
        `matches a CJS-wrapper helper's own FNDA hit-count [${wrapperValuesSorted.join(", ")}] (or 0) -- the ` +
        `wrapper image has overwritten this file's real coverage data`,
    };
  }

  if (overlapHasRealSignal && overlap.length >= extra.length) {
    return {
      file,
      status: "warn",
      reason:
        `${overlap.length} of this block's ${distinctDa.length} distinct DA hit-count value(s) match a ` +
        `CJS-wrapper helper's own FNDA hit-count (or 0) -- possible partial dual-instantiation ` +
        `contamination, not conclusive`,
    };
  }

  return { file, status: "ok", reason: "" };
}

export function checkCoverageIntegrity(lcovText: string): IntegrityReport {
  const verdicts = parseLcovBlocks(lcovText).map(classifyBlock);
  const failures = verdicts.filter((v) => v.status === "fail");
  const warnings = verdicts.filter((v) => v.status === "warn");
  const skipped = verdicts.filter((v) => v.status === "skip").length;
  return { failures, warnings, evaluated: verdicts.length - skipped, skipped };
}

function main(): void {
  const lcovArg = process.argv[2];
  const lcovPath = lcovArg
    ? path.isAbsolute(lcovArg)
      ? lcovArg
      : path.join(REPO_ROOT, lcovArg)
    : DEFAULT_LCOV_PATH;

  if (!existsSync(lcovPath)) {
    console.error(
      `check:coverage-integrity — FAIL: ${lcovPath} does not exist. Run \`npm run test:cov\` first (or pass ` +
        `an existing lcov path as an argument) -- this script only parses lcov output, it does not run tests itself.`
    );
    process.exit(1);
  }

  const { failures, warnings, evaluated, skipped } = checkCoverageIntegrity(readFileSync(lcovPath, "utf8"));

  // Printed ahead of the pass/fail verdict, same stream (stderr) as the failure block below, for the
  // same pipe-ordering reason `check-test-baseline.ts` documents: two independently-buffered async
  // streams can interleave out of call order under a piped CI runner, so anything meant to read in a
  // fixed order relative to the failure block belongs on the same stream.
  if (warnings.length > 0) {
    console.error(`check:coverage-integrity — ${warnings.length} suspicious (non-blocking) block(s):`);
    for (const w of warnings) console.error(`  - ${w.file}: ${w.reason}`);
  }

  if (failures.length === 0) {
    console.log(
      `check:coverage-integrity — OK: ${evaluated} first-party block(s) evaluated (${skipped} non-first-party ` +
        `skipped), 0 dual-instantiation corruption finding(s).`
    );
    return;
  }

  console.error(`check:coverage-integrity — ${failures.length} DUAL-INSTANTIATION CORRUPTION finding(s):`);
  for (const f of failures) console.error(`  - ${f.file}: ${f.reason}`);
  console.error(
    "\nEach listed file's SF: block is a merge of two coverage images (the real ESM module and esbuild's CJS " +
      "wrapper -- see this script's own header for the mechanism). Its line/function coverage numbers for THIS " +
      "run are not trustworthy and must not be quoted or gated on. This does not mean the file is poorly tested " +
      "-- it means this lcov run cannot tell you either way."
  );
  process.exit(1);
}

// Guarded, matching check-src-complexity-drift.ts's and check-test-baseline.ts's idiom in this same
// directory: this file is also imported as a plain module by its own unit test, which exercises
// parseLcovBlocks/classifyBlock/checkCoverageIntegrity directly. Without the guard, importing those
// pure functions would also run the real lcov.info check against whatever happens to be on disk, and
// a bare process.exit(1) would kill the test process instead of failing one assertion.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
