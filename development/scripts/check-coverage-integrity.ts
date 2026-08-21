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

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const DEFAULT_LCOV_PATH = path.join(REPO_ROOT, "development/coverage/lcov.info");

/** esbuild's CJS-wrapper helper names, injected into every tsx CJS-hook-loaded module. Their
 *  presence in a first-party block's `FN:`/`FNDA:` records is the whole CONTAMINATED signal -- see
 *  this file's header for why no baseline function count is needed. */
const WRAPPER_HELPER_NAMES = new Set(["__toCommonJS", "__copyProps", "__toESM", "__export"]);

/** Below this many `DA:` records, a block has too few independent data points for a full-subset
 *  match against the wrapper's own FNDA hit-counts (the SEVERE escalation, below) to mean anything --
 *  a handful of lines coincidentally sharing one of the wrapper's own hit-count values is
 *  unremarkable in a tiny file (e.g. a 5-line re-export hit uniformly 32 times, which happens to
 *  equal `__toCommonJS`'s own count that run, is not evidence of anything). This floor gates ONLY the
 *  SEVERE escalation -- CONTAMINATED itself has no size floor, since wrapper-name presence needs no
 *  statistical support to be meaningful. 30 is comfortably below the real severe block measured
 *  2026-08-21 (357 DA records) and comfortably above a trivial single-purpose file.
 */
const MIN_DA_RECORDS_FOR_SEVERE_HEURISTIC = 30;

export interface LcovBlock {
  /** Raw `SF:` path text, not yet normalized to repo-relative. */
  readonly file: string;
  readonly fnda: ReadonlyArray<{ readonly name: string; readonly hits: number }>;
  /** `DA:` hit counts only, in record order. Line numbers are deliberately not kept -- see header. */
  readonly da: ReadonlyArray<number>;
  /** Declared `FNF:`/`FNH:` summary fields, when present. Aggregate counts, unlike `DA:` line
   *  numbers, are not subject to the comment-stripping line-number bug -- safe to read and report
   *  directly. `undefined` when the block omits them (lcov omits summary fields it has nothing to
   *  report, and hand-built test fixtures may omit them too). */
  readonly fnf?: number;
  readonly fnh?: number;
}

export type BlockStatus = "contaminated" | "ok" | "skip";

export interface BlockVerdict {
  readonly file: string;
  readonly status: BlockStatus;
  /** Only meaningful when `status === "contaminated"`. True when the wrapper image ALSO won the
   *  `DA:` line-hit merge -- see `classifyBlock`'s doc comment for the exact rule. A block can be
   *  contaminated without being severe (function table corrupted, line table happens to read clean);
   *  it can never be severe without being contaminated (the severity check has nothing to compare
   *  against unless wrapper FNDA records exist in the first place). */
  readonly severe: boolean;
  readonly reason: string;
}

export interface IntegrityReport {
  /** Every CONTAMINATED block, severe or not -- filter on `.severe` for the SEVERE subset. */
  readonly contaminated: readonly BlockVerdict[];
  /** First-party blocks actually run through the heuristics (i.e. not skipped as non-first-party). */
  readonly evaluated: number;
  readonly skipped: number;
}

/** A `BlockVerdict` with the `--baseline` ratchet applied. `baselined` is purely a membership fact
 *  (was this path in the ledger); `fails` is the actual gating decision, which is NOT the same thing
 *  for a `severe` block -- see `applyBaseline`. */
export interface GatedVerdict extends BlockVerdict {
  readonly baselined: boolean;
  readonly fails: boolean;
}

/** Applies the `--baseline` ratchet: a `severe` verdict always fails, regardless of baseline
 *  membership (see this file's header on why SEVERE is never baseline-suppressible). A non-severe
 *  CONTAMINATED verdict fails only when its path is NOT in `baselineSet`. Pure -- no I/O, easily
 *  tested against a plain `Set`.
 *  @complexity O(c) in the number of contaminated verdicts; each `Set.has` lookup is O(1) amortized.
 */
export function applyBaseline(
  contaminated: readonly BlockVerdict[],
  baselineSet: ReadonlySet<string>
): readonly GatedVerdict[] {
  return contaminated.map((v) => {
    const baselined = baselineSet.has(v.file);
    return { ...v, baselined, fails: v.severe || !baselined };
  });
}

interface BaselineFile {
  readonly _comment?: readonly string[];
  readonly knownContaminated?: readonly string[];
}

/** Parses a baseline JSON file's text into the set of known-contaminated paths it lists. An absent or
 *  malformed `knownContaminated` array reads as empty rather than throwing -- callers that need to
 *  distinguish "no baseline file yet" from "empty baseline" check `existsSync` themselves before
 *  calling this (see `main`).
 */
export function parseBaseline(baselineJson: string): ReadonlySet<string> {
  const parsed = JSON.parse(baselineJson) as BaselineFile;
  return new Set(parsed.knownContaminated ?? []);
}

/** Default `_comment` block for a freshly-created baseline file -- explains what the ledger is, how
 *  to regenerate it responsibly, and the SEVERE carve-out, so nobody has to re-derive any of that from
 *  this script's own header. `--update-baseline` preserves an existing file's `_comment` across
 *  regeneration (see `main`) rather than overwriting it with this default every time, mirroring
 *  `check-test-baseline.ts`'s `--capture` mode -- a human may have added file-specific notes worth
 *  keeping.
 */
export const DEFAULT_BASELINE_COMMENT: readonly string[] = [
  "coverage-integrity baseline: known, currently-open dual-instantiation CONTAMINATED findings.",
  "See development/scripts/check-coverage-integrity.ts's header for the mechanism and for why this",
  "file exists (Route A, src/server/deps.ts:1048, is a known, accepted, open issue -- some",
  "contamination is permanent for now, and a gate that always fails on it gets ignored, not fixed).",
  "Path-based, not count-based: block totals vary hugely by run scope, so a numeric threshold would",
  "be meaningless here.",
  "Regenerate with --update-baseline ONLY to record a deliberate, reviewed acceptance of new debt --",
  "never just to silence a failure you have not looked at. Review every diff to this file like a real",
  "debt ledger, because that is what it is.",
  "SEVERE findings are NEVER suppressed by this file, regardless of whether their path is listed",
  "below -- only the CONTAMINATED (function-table-only) tier can be baselined away.",
];

/** Serializes a baseline file's contents: deduped, alphabetically sorted paths (stable diffs -- a
 *  ledger that reorders itself on every regeneration is unreviewable) plus a `_comment` block. Pure
 *  string-in/string-out; `main`'s `--update-baseline` handler does the actual file I/O and existing-
 *  comment preservation around this.
 */
export function serializeBaseline(paths: readonly string[], comment: readonly string[] = DEFAULT_BASELINE_COMMENT): string {
  const knownContaminated = [...new Set(paths)].sort((a, b) => a.localeCompare(b));
  return `${JSON.stringify({ _comment: comment, knownContaminated }, null, 2)}\n`;
}

export interface ParsedArgs {
  readonly lcovArg?: string;
  readonly baselinePath?: string;
  readonly updateBaseline: boolean;
}

/** Hand-rolled rather than a dependency: this script takes exactly one optional positional
 *  (`lcovArg`), one optional value-bearing flag (`--baseline <path>`), and one optional boolean flag
 *  (`--update-baseline`) -- small enough that a parsing library would cost more than it saves. The
 *  first non-flag argument wins as `lcovArg`; a second one is silently ignored rather than erroring,
 *  matching this repo's other check-*.ts scripts' permissive argv handling (e.g.
 *  `check-test-baseline.ts`'s `args.filter((a) => !a.startsWith("--"))`).
 *  @complexity O(n) in argv length.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  let lcovArg: string | undefined;
  let baselinePath: string | undefined;
  let updateBaseline = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--update-baseline") {
      updateBaseline = true;
    } else if (arg === "--baseline") {
      baselinePath = argv[i + 1];
      i++; // consume the flag's value too
    } else if (!arg.startsWith("--") && lcovArg === undefined) {
      lcovArg = arg;
    }
  }
  return { lcovArg, baselinePath, updateBaseline };
}

/** Splits raw lcov text into per-`SF:` blocks. A record with no `SF:` line (malformed input, or text
 *  before the first block) is ignored rather than throwing -- this mirrors `route-coverage-lib.ts`'s
 *  `loadLcov`, which treats absence of an `SF:` line as "not a real record" rather than an error.
 *  @complexity O(n) in the input length; one regex pass per record for FNDA/DA/FNF/FNH extraction.
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
    const fnfMatch = record.match(/^FNF:(\d+)$/m);
    const fnhMatch = record.match(/^FNH:(\d+)$/m);
    blocks.push({
      file: sfMatch[1].trim(),
      fnda,
      da,
      fnf: fnfMatch ? Number(fnfMatch[1]) : undefined,
      fnh: fnhMatch ? Number(fnhMatch[1]) : undefined,
    });
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
 * Classifies one `SF:` block as `contaminated` (wrapper helper records found -- function coverage
 * for this block is untrustworthy, and it may additionally be `severe`), `ok` (no wrapper records --
 * this heuristic has no reason to distrust the block), or `skip` (out of scope).
 *
 * CONTAMINATED requires only that at least one `FNDA:` record names a wrapper helper -- see the
 * header for why presence alone, with no baseline function count, is a complete and rot-proof signal.
 *
 * SEVERE is an additional, stronger condition checked only when CONTAMINATED already holds: the
 * block's distinct `DA:` hit-count values are explained ENTIRELY by the wrapper helpers' own FNDA
 * hit-counts for that same block (plus 0, since dead/unreached code under either image legitimately
 * reads 0). That is the direct fingerprint of "the wrapper image, not the real module, produced every
 * line's hit count" -- i.e. the wrapper won the `DA:` merge too, not just the `FN:` merge. Gated by
 * `MIN_DA_RECORDS_FOR_SEVERE_HEURISTIC` for the reason documented on that constant. A simpler
 * candidate for this same escalation -- "few distinct DA values across many lines," with no
 * comparison to the wrapper's own counts -- was tried and rejected: measured against the same 6 real
 * runs, it flagged 53-54 first-party files as severe in EVERY run, clean or not (e.g.
 * `src/db/schema.ts`, 2589 lines, only 3 distinct hit-count values -- it is just declarative schema
 * code with almost no branching, nothing to do with the wrapper mechanism). Anchoring the comparison
 * to the wrapper's OWN hit-counts, not a bare threshold, is what makes SEVERE precise: validated
 * against all 172 first-party blocks across the same 6 runs, it fires on exactly the one confirmed-
 * corrupt block and zero others.
 *
 * @complexity O(f + d) per block, where f = FNDA record count and d = distinct DA value count.
 */
export function classifyBlock(block: LcovBlock): BlockVerdict {
  const file = toRepoRelative(block.file);

  if (!isFirstPartySourcePath(file)) {
    return {
      file,
      status: "skip",
      severe: false,
      reason: "not a first-party src/**, packages/*/src/**, or apps/*/src/** path",
    };
  }

  const wrapperNamesFound = new Set<string>();
  const wrapperValues = new Set<number>();
  for (const { name, hits } of block.fnda) {
    if (WRAPPER_HELPER_NAMES.has(name)) {
      wrapperNamesFound.add(name);
      wrapperValues.add(hits);
    }
  }

  if (wrapperNamesFound.size === 0) {
    return {
      file,
      status: "ok",
      severe: false,
      reason: "no esbuild CJS-wrapper FNDA records in this block",
    };
  }

  const fnSummary = block.fnf !== undefined && block.fnh !== undefined ? ` FNF:${block.fnf} FNH:${block.fnh}` : "";
  const contaminatedReason =
    `${wrapperNamesFound.size} esbuild CJS-wrapper helper record(s) [${[...wrapperNamesFound].sort().join(", ")}] ` +
    `present in this block's FNDA records -- two coverage images (real ESM + CJS wrapper) were merged ` +
    `here.${fnSummary} function coverage for this run is untrustworthy`;

  // SEVERE escalation: does the wrapper image's own hit-count fingerprint also explain every DA line
  // value, i.e. did it ALSO win the line-hit merge? See doc comment above for the full rule and why
  // MIN_DA_RECORDS_FOR_SEVERE_HEURISTIC gates it.
  if (block.da.length >= MIN_DA_RECORDS_FOR_SEVERE_HEURISTIC) {
    const comparisonSet = new Set(wrapperValues);
    comparisonSet.add(0); // dead/unreached code under either image legitimately reads 0

    const distinctDa = [...new Set(block.da)].sort((a, b) => a - b);
    const extra = distinctDa.filter((v) => !comparisonSet.has(v));
    const overlapHasRealSignal = distinctDa.some((v) => v !== 0 && comparisonSet.has(v));

    if (extra.length === 0 && overlapHasRealSignal) {
      const wrapperValuesSorted = [...wrapperValues].sort((a, b) => a - b);
      return {
        file,
        status: "contaminated",
        severe: true,
        reason:
          `${contaminatedReason}. SEVERE: additionally, every one of this block's ${distinctDa.length} ` +
          `distinct DA hit-count value(s) [${distinctDa.join(", ")}] matches a wrapper helper's own FNDA ` +
          `hit-count [${wrapperValuesSorted.join(", ")}] (or 0) -- the wrapper image also won the line-hit ` +
          `merge, so line coverage for this run is untrustworthy too, regardless of what LH:/LF: report`,
      };
    }
  }

  return { file, status: "contaminated", severe: false, reason: `${contaminatedReason}.` };
}

export function checkCoverageIntegrity(lcovText: string): IntegrityReport {
  const verdicts = parseLcovBlocks(lcovText).map(classifyBlock);
  const contaminated = verdicts.filter((v) => v.status === "contaminated");
  const skipped = verdicts.filter((v) => v.status === "skip").length;
  return { contaminated, evaluated: verdicts.length - skipped, skipped };
}

function resolveRepoPath(arg: string): string {
  return path.isAbsolute(arg) ? arg : path.join(REPO_ROOT, arg);
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
  writeFileSync(resolvedBaselinePath, serializeBaseline(knownPaths, existingComment ?? DEFAULT_BASELINE_COMMENT), "utf8");
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
  return parseBaseline(readFileSync(resolvedBaselinePath, "utf8"));
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
  const { lcovArg, baselinePath, updateBaseline } = parseArgs(process.argv.slice(2));
  const lcovPath = lcovArg ? resolveRepoPath(lcovArg) : DEFAULT_LCOV_PATH;

  if (!existsSync(lcovPath)) {
    console.error(
      `check:coverage-integrity — FAIL: ${lcovPath} does not exist. Run \`npm run test:cov\` first (or pass ` +
        `an existing lcov path as an argument) -- this script only parses lcov output, it does not run tests itself.`
    );
    process.exit(1);
  }

  const { contaminated, evaluated, skipped } = checkCoverageIntegrity(readFileSync(lcovPath, "utf8"));

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
      `check:coverage-integrity — OK: ${evaluated} first-party block(s) evaluated (${skipped} non-first-party ` +
        `skipped), 0 dual-instantiation contamination found.`
    );
    return;
  }

  const gated = applyBaseline(contaminated, loadBaselineSet(baselinePath));
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
