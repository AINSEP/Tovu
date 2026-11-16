/**
 * lcov dual-instantiation contamination detector (2026-08-21).
 *
 * ## The mechanism
 *
 * When a test spawns a Node child process that inherits `NODE_V8_COVERAGE`, the child loads Tovu
 * source through tsx's **CJS** hook instead of the ESM hook the parent used. That produces TWO
 * separate coverage images for the same source file -- the real ESM module, and esbuild's CJS
 * wrapper shim (the `__toCommonJS`/`__copyProps`/`__toESM`/`__export` helpers it injects) -- and
 * Node's lcov writer merges both into a single `SF:` block. `src/server/deps.ts:1048`'s in-process
 * lazy `require()` (Route A, per `ADS-memory/reports/2026-08-21-coverage-dual-instantiation-root-
 * cause.md`) is a known, accepted, STILL-OPEN source of this -- do not treat a failing run of this
 * script as a bug in the script. It is the true, current state of this repo's coverage output.
 *
 * ## Two independent things go wrong, and they do NOT always go wrong together
 *
 * This is the part that makes a naive detector wrong in either direction, and it took two rounds to
 * get right -- read this before changing the gate condition.
 *
 * **Round 1 mistake (fixed 2026-08-21):** the first version of this script gated only on the DA
 * line-hit table looking corrupted, and treated a block as "clean" whenever `LH:` matched `LF:`. That
 * is wrong. Per the root-cause report (`ADS-memory/reports/2026-08-21-coverage-dual-instantiation-
 * root-cause.md`, "Round 7"/"Round 9" for the TRUE clean baseline and "Round 8"/"Rounds 11/12" for the
 * counterexample): the TRUE clean baseline for `src/media/provider-credential-store.ts` is 0 shim
 * markers, `FNF:20 FNH:20`, `LH:357 LF:357`. But a block can show the FULL contaminated function table
 * -- `FNF:43 FNH:29`, exactly double-ish the real function count, because BOTH images' functions
 * concatenate into one `FN:`/`FNDA:` list -- while its `DA:` (line-hit) table still happens to read
 * `LH:357 LF:357`, identical to the true clean baseline. `LH:`/`LF:` alone cannot tell these apart.
 * Five of the six lcov runs used to validate this script are exactly that shape: `FNF:43 FNH:29`
 * (contaminated function table) with `LH:357 LF:357` (line table that merely LOOKS clean). Calling
 * those runs "clean," as the first version of this script did, is the identical mistake the "LH: is
 * not a signature" rule below warns against, just applied to a different field.
 *
 * **What actually distinguishes the two failure depths:** whether esbuild's wrapper helper functions
 * (`__toCommonJS`/`__copyProps`/`__toESM`/`__export`) appear in the block's `FN:`/`FNDA:` records at
 * all. If they do, the function table is a concatenation of both images -- CONTAMINATED, full stop,
 * regardless of what `LH:`/`LF:` say. Separately, and only sometimes, the wrapper image's own (much
 * coarser) execution profile ALSO wins the `DA:` line-hit merge, which is the deeper, rarer failure
 * this script calls SEVERE. Validated against all 172 first-party `SF:` blocks across 6 real
 * `npm run test:cov`-shaped lcov runs from 2026-08-21: 63 of 93 evaluated first-party blocks in every
 * run are CONTAMINATED (this is a widespread, currently-open repo issue, not a one-file fluke) and
 * exactly one block in one run is additionally SEVERE (`src/media/provider-credential-store.ts`, the
 * one run independently confirmed corrupt by the root-cause investigation).
 *
 * ## Why CONTAMINATED is detected by wrapper-record PRESENCE with no baseline number
 *
 * An earlier draft of this design considered comparing a block's `FNF:`/`FNH:` against a known-good
 * "this file should have exactly N functions" constant per file. Rejected: a hardcoded per-file
 * baseline rots the moment the file gains or loses a function, and a rotten baseline that silently
 * stops matching reality is worse than no baseline -- it would either mass-false-positive after every
 * ordinary refactor, or (worse, if someone "fixes" the false positives by loosening it) stop catching
 * anything. Wrapper-helper-name presence needs no such number: `__toCommonJS`/`__copyProps`/
 * `__toESM`/`__export` are esbuild's own injected plumbing and have no legitimate reason to appear in
 * ANY first-party file's own `FN:`/`FNDA:` records, ever, at any function count. Presence alone is
 * the whole signal for CONTAMINATED.
 *
 * ## What's NOT corruption -- do not flag these
 *
 * - Duplicate `FN:` entries for a file's OWN (non-wrapper) function names are NORMAL in this repo's
 *   tsx-instrumented output for unrelated reasons (see `check-src-complexity-drift.ts`'s header for a
 *   real example of two textually-identical arrow functions producing duplicate entries). This script
 *   never gates on duplicate-FN-count in general -- only on the four specific wrapper helper names.
 * - `DA:` line numbers in this repo do NOT correspond to source lines (tsx strips comments before
 *   instrumenting). Never resolve or report a source `file:line` from an lcov line number --
 *   everything this script reports is at file granularity only.
 * - `LH:`/`LF:` matching is NOT proof of a clean block -- see "Round 1 mistake" above. This script
 *   never uses `LH:`/`LF:` as a signal at all; only `FN:`/`FNDA:`/`DA:` records are read.
 *
 * ## Scope
 *
 * Only `SF:` paths under `src/`, `packages/*​/src/`, or `apps/*​/src/` are evaluated -- everything
 * else (test infra, `node_modules`, build output, `development/`) is skipped without comment.
 *
 * ## Pure re-export barrels are also skipped (2026-09-05), and this is NOT the same exemption as
 * ## a normal CONTAMINATED-but-baselined file
 *
 * A file whose entire source is `export { ... } from "./x.js"` / `export type { ... } from "./x.js"`
 * statements (a barrel -- e.g. `apps/website/src/platform/export/index.ts`,
 * `apps/website/src/features/content-types/index.ts`) compiles to NOTHING but esbuild's CJS-interop
 * wrapper machinery (`__export`/`__copyProps`/`__toCommonJS`, plus one lazy getter per re-exported
 * name) -- there is no function of the barrel's OWN for a second image to merge with. Both real
 * files just named were verified 2026-09-05 to report wrapper-helper names in their FNDA records
 * (the CONTAMINATED signal) and, because a barrel's every `DA:` line is executed exactly once per
 * import -- the same load-time count the wrapper helpers themselves report -- `content-types/index.ts`
 * additionally satisfies the SEVERE full-subset condition below. Neither is evidence of a genuine
 * Route A dual-instantiation: it is the STRUCTURALLY GUARANTEED shape of compiling any pure re-export
 * file, present or absent regardless of whether Route A is ever fixed. This is categorically
 * different from a real logic-bearing file (`apps/website/src/contracts/core/commands/revert.ts`,
 * `.../platform/export/route-manifest.ts`) that happens to ALSO show wrapper names -- there, the
 * wrapper presence genuinely does mean a second image merged over real function/line data, exactly
 * what this script exists to catch, and this exclusion does not touch that case at all: detection is
 * by the file's SOURCE shape (`isPureReExportBarrelSource`, read from disk by `main`, threaded through
 * as an explicit optional parameter everywhere for testability), never by the lcov block's own
 * content, so it cannot be satisfied by a coincidentally-barrel-shaped DA/FNDA pattern in a file that
 * isn't actually one. A barrel classifies as `skip`, the same status non-first-party paths get -- not
 * `ok` (that would claim a real, clean function/branch measurement exists, which is false; there is
 * nothing here to measure) and not `contaminated` (there is no second image to distrust). Per the
 * header's own rule above ("do not weaken this gate to make CI pass"): this is not a softening of the
 * CONTAMINATED condition for files it correctly targets -- it is scoping the check to files where the
 * question it asks ("did two coverage images get merged?") is even coherent to ask.
 *
 * ## The `--baseline` ratchet -- why CONTAMINATED needs one and SEVERE never gets one
 *
 * As of 2026-08-21, Route A is a known, accepted, STILL-OPEN issue: 63 of 93 first-party blocks in a
 * real scoped `test:cov`-shaped run are CONTAMINATED, identically across every run measured. A gate
 * that hard-fails on all 63 forever gets ignored, not fixed -- the same reasoning
 * `check-test-baseline.ts`'s header gives for why THAT gate is a ratchet, not a raw pass/fail. This
 * script borrows the same shape, adapted to paths instead of test names:
 *
 * `--baseline <path>` points at a committed JSON ledger of currently-known-contaminated `SF:` paths
 * (see `serializeBaseline`/`parseBaseline`). A CONTAMINATED block whose path is already in that ledger
 * is reported every run (so nobody loses visibility into it) but does NOT fail the run. A CONTAMINATED
 * block whose path is NOT in the ledger fails immediately -- new contamination is never silently
 * absorbed. Regenerate the ledger deliberately with `--baseline <path> --update-baseline` after
 * reviewing what changed; regenerating it just to make a failure go away, without having looked at
 * what is now in the diff, defeats the entire point of keeping it.
 *
 * Baselining is **path-based, not count-based**, on purpose: block totals vary hugely by run scope (93
 * first-party blocks in one scoped validation run, 700+ in a broader one per the team lead's own
 * measurement) -- a numeric "N contaminated blocks allowed" threshold would be meaningless across
 * different invocations of this same script. A path either is or is not already-known-contaminated,
 * regardless of what else happened to run alongside it.
 *
 * **SEVERE is NEVER baseline-suppressible**, deliberately, regardless of whether its path also appears
 * in the ledger: a block that lost its line-level data too is a strictly worse, actively-getting-worse
 * problem than one that only lost its function table, and this script always hard-fails on it. Only
 * the plain CONTAMINATED tier can be ratcheted.
 *
 * If no `--baseline` is given, behavior is unchanged from before this ratchet existed: every
 * CONTAMINATED block fails, full stop. Nothing in this repo currently wires a default baseline path
 * into `npm run check:coverage-integrity` -- doing that responsibly requires a baseline captured from
 * a REAL, full `npm run test:cov` run, which this script's own author was expressly forbidden from
 * running (that command OOMs this machine and the coverage slot is owned by the Coordinator). A
 * baseline generated from a narrower, scoped validation run is committed as a demonstration
 * (`development/scripts/coverage-integrity-baseline.json`) but is NOT wired as anyone's default --
 * see that file's own `_comment` for why treating it as repo-wide-authoritative would be a mistake.
 *
 * ## A note to whoever reads this after a CI run goes red
 *
 * Do not make this gate quieter to get a green result. As of 2026-08-21, CONTAMINATED findings on a
 * majority of first-party files are the TRUE, currently-accurate state of this repo's coverage output
 * (Route A above is open, tracked, and not yet fixed) -- a red run is this script doing its job, not
 * a bug in it. If you are tempted to raise the wrapper-name list, add an exclusion, or otherwise
 * soften the CONTAMINATED condition to make CI pass, fix the root cause instead (or get sign-off that
 * the underlying corruption is now accepted, permanent, unfixable scope) and record why here. The
 * `--baseline` ratchet above is the sanctioned way to keep a red gate from being ignored -- use that,
 * not a weaker detector.
 *
 * Usage: npx tsx development/scripts/check-coverage-integrity.ts [lcovPath] [--baseline <path>] [--update-baseline]
 *   lcovPath         - defaults to development/coverage/lcov.info (npm run test:cov's output). This
 *                       script only parses lcov output, it does not run tests itself.
 *   --baseline <path> - optional; a JSON ledger of known-contaminated SF: paths (see above). Omit to
 *                       fail on every CONTAMINATED finding, ratchet-free.
 *   --update-baseline - with --baseline <path>, (re)writes that file from the CURRENT run's findings
 *                       instead of gating. Review the diff before committing it.
 * Exit codes (normal mode): 0 = zero CONTAMINATED blocks found, or every CONTAMINATED block is both
 *             non-SEVERE and already in the given baseline. 1 = at least one SEVERE block (always,
 *             baseline or not), or at least one CONTAMINATED block not in the baseline, or the lcov
 *             file is missing/unreadable.
 * Exit codes (--update-baseline mode): 0 on successful write. 1 if --baseline was not also given.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  applyBaseline,
  checkCoverageIntegrity,
  DEFAULT_BASELINE_COMMENT,
  parseArgs,
  parseBaseline,
  serializeBaseline,
  type BlockVerdict,
  type GatedVerdict,
} from "@jini-ai/devops/checks/coverage";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const DEFAULT_LCOV_PATH = path.join(REPO_ROOT, "development/coverage/lcov.info");

interface BaselineFile {
  readonly _comment?: readonly string[];
  readonly knownContaminated?: readonly string[];
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

/** Host classifier handed to the shared detector: this repo's first-party roots (see above). */
function isFirstParty({ file }: { file: string }): boolean {
  return isFirstPartySourcePath(file);
}

function resolveRepoPath(arg: string): string {
  return path.isAbsolute(arg) ? arg : path.join(REPO_ROOT, arg);
}

/** Real `readSource` for `checkCoverageIntegrity` (see that function's `@param readSource`): reads
 *  a repo-relative path's current on-disk contents, or `undefined` if it can't (deleted/moved since
 *  the lcov run, or any other read error) -- the safe default that falls back to normal wrapper-name
 *  classification rather than ever silently skipping a genuinely contaminated file. */
function readSourceFromDisk(repoRelativeFile: string): string | undefined {
  try {
    return readFileSync(path.join(REPO_ROOT, repoRelativeFile), "utf8");
  } catch {
    return undefined;
  }
}

/** `--update-baseline` handler: (re)writes `resolvedBaselinePath` from the current run's CONTAMINATED
 *  paths (severe or not -- see this file's header on why capturing both is correct), preserving an
 *  existing file's `_comment` if there is one. Prints the confirmation and the "review this diff"
 *  reminder; does not exit non-zero on success. Split out of `main` purely to keep that function's
 *  branching flat -- no independent reuse pressure otherwise.
 */
function handleUpdateBaseline(resolvedBaselinePath: string, contaminated: readonly BlockVerdict[]): void {
  const existingComment = existsSync(resolvedBaselinePath)
    ? (JSON.parse(readFileSync(resolvedBaselinePath, "utf8")) as BaselineFile)._comment
    : undefined;
  const knownPaths = [...new Set(contaminated.map((v) => v.file))];
  writeFileSync(resolvedBaselinePath, serializeBaseline({ paths: knownPaths }, { comment: existingComment ?? DEFAULT_BASELINE_COMMENT }), "utf8");
  console.log(
    `check:coverage-integrity — CAPTURED ${knownPaths.length} known-contaminated path(s) into ` +
      `${path.relative(REPO_ROOT, resolvedBaselinePath)}`
  );
  console.log(
    "Review this diff before committing: every entry is coverage debt you are agreeing to tolerate. " +
      "SEVERE findings are never suppressed by this file, regardless of what it lists."
  );
}

/** Loads the known-contaminated path set from `baselinePath` (repo-relative or absolute), or returns
 *  an empty set with a printed warning if no `--baseline` flag was given at all, or if the given path
 *  doesn't exist yet. An empty set is the correct "ratchet-free" default either way: every
 *  CONTAMINATED block reads as new. Split out of `main` for the same reason as
 *  `handleUpdateBaseline` above.
 */
function loadBaselineSet(baselinePath: string | undefined): ReadonlySet<string> {
  if (!baselinePath) return new Set();
  const resolvedBaselinePath = resolveRepoPath(baselinePath);
  if (!existsSync(resolvedBaselinePath)) {
    console.error(
      `check:coverage-integrity — no baseline file at ${path.relative(REPO_ROOT, resolvedBaselinePath)} yet; ` +
        `treating it as empty (every contaminated block below counts as new). Run with --update-baseline to create one.`
    );
    return new Set();
  }
  return parseBaseline({ baselineJson: readFileSync(resolvedBaselinePath, "utf8") });
}

/** Prints the full gated report (summary line, then SEVERE/NEW/KNOWN sections) and returns whether
 *  `main` should exit non-zero. Split out of `main` purely to keep that function's branching flat.
 */
function reportGatedFindings(gated: readonly GatedVerdict[], evaluated: number, baselinePath: string | undefined): boolean {
  const severeList = gated.filter((v) => v.severe);
  const newList = gated.filter((v) => !v.severe && !v.baselined);
  const knownList = gated.filter((v) => !v.severe && v.baselined);

  console.error(
    `check:coverage-integrity — ${gated.length} of ${evaluated} first-party block(s) contaminated: ` +
      `${severeList.length} SEVERE (never baseline-suppressible), ${newList.length} NEW, ${knownList.length} known via baseline.`
  );
  if (severeList.length > 0) {
    console.error("SEVERE (hard fail, no baseline escape):");
    for (const v of severeList) console.error(`  - ${v.file}: ${v.reason}`);
  }
  if (newList.length > 0) {
    console.error("NEW (not in baseline -- fails):");
    for (const v of newList) console.error(`  - ${v.file}: ${v.reason}`);
  }
  if (knownList.length > 0) {
    console.error("KNOWN (in baseline -- reported, does not fail):");
    for (const v of knownList) console.error(`  - ${v.file}: ${v.reason}`);
  }

  const shouldFail = severeList.length > 0 || newList.length > 0;
  if (!shouldFail) {
    console.log(
      `check:coverage-integrity — OK (ratcheted): 0 new/severe finding(s), ${knownList.length} known-baselined ` +
        `contaminated block(s) still tracked -- see ${baselinePath}.`
    );
    return false;
  }

  console.error(
    "\nCONTAMINATED means this block's FN:/FNDA: records are a merge of two coverage images (real ESM + " +
      "esbuild's CJS wrapper) -- its function coverage numbers for this run are not trustworthy. SEVERE means " +
      "the wrapper image additionally won the DA: line-hit merge -- line coverage is untrustworthy too, even if " +
      "LH:/LF: happen to look clean, and can never be suppressed by a baseline. Neither means the file is poorly " +
      "tested -- it means this lcov run cannot tell you either way. See this script's own header for the " +
      "mechanism (Route A, src/server/deps.ts:1048), the --baseline ratchet, and " +
      "ADS-memory/reports/2026-08-21-coverage-dual-instantiation-root-cause.md for the full investigation. " +
      "Do not weaken this gate to get a green result -- see the header's note on that."
  );
  return true;
}

function main(): void {
  const { lcovArg, baselinePath, updateBaseline } = parseArgs({ argv: process.argv.slice(2) });
  const lcovPath = lcovArg ? resolveRepoPath(lcovArg) : DEFAULT_LCOV_PATH;

  if (!existsSync(lcovPath)) {
    console.error(
      `check:coverage-integrity — FAIL: ${lcovPath} does not exist. Run \`npm run test:cov\` first (or pass ` +
        `an existing lcov path as an argument) -- this script only parses lcov output, it does not run tests itself.`
    );
    process.exit(1);
  }

  const { contaminated, evaluated, skipped } = checkCoverageIntegrity({ lcovText: readFileSync(lcovPath, "utf8"), repoRoot: REPO_ROOT, isFirstParty }, { readSource: ({ file }) => readSourceFromDisk(file) });

  if (updateBaseline) {
    if (!baselinePath) {
      console.error("check:coverage-integrity — FAIL: --update-baseline requires --baseline <path> too.");
      process.exit(1);
    }
    handleUpdateBaseline(resolveRepoPath(baselinePath), contaminated);
    return;
  }

  if (contaminated.length === 0) {
    console.log(
      `check:coverage-integrity — OK: ${evaluated} first-party block(s) evaluated (${skipped} skipped: ` +
        `non-first-party or pure re-export barrel), 0 dual-instantiation contamination found.`
    );
    return;
  }

  const gated = applyBaseline({ contaminated, baselineSet: loadBaselineSet(baselinePath) });
  if (reportGatedFindings(gated, evaluated, baselinePath)) {
    process.exit(1);
  }
}

// Guarded, matching check-src-complexity-drift.ts's and check-test-baseline.ts's idiom in this same
// directory: this file is also imported as a plain module by its own unit test, which exercises
// parseLcovBlocks/classifyBlock/checkCoverageIntegrity directly. Without the guard, importing those
// pure functions would also run the real lcov.info check against whatever happens to be on disk, and
// a bare process.exit(1) would kill the test process instead of failing one assertion.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
