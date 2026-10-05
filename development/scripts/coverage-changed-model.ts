/**
 * cov1 pure model: the changed source set owns the denominator, never LCOV.
 * JINI CANDIDATE: no product runtime, filesystem, process, or LLM dependency.
 * LCOV positions are deliberately called instrumented indices, not source anchors.
 */
export type Optional = Record<string, never>;

/** Node's final counters are authoritative; completed test points only diagnose aborted runs. */
export function readNodeSummary({ text }: { text: string }, _optional: Optional = {}) {
  const log = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  const count = (name: string) => {
    const matches = [...log.matchAll(new RegExp(`^# ${name} (\\d+)\\s*$`, "gm"))];
    return matches.length ? Number(matches.at(-1)![1]) : undefined;
  };
  const tests = count("tests"), pass = count("pass"), fail = count("fail"), cancelled = count("cancelled") ?? 0;
  const complete = tests !== undefined && pass !== undefined && fail !== undefined;
  const completedTestPoints = [...log.matchAll(/^(?:not )?ok \d+ - .*$/gm)].filter((match) => !/ # (?:SKIP|TODO)\b/i.test(match[0])).length;
  const duration = /^# duration_ms ([\d.]+)\s*$/m.exec(log);
  return { complete, tests: tests ?? 0, pass: pass ?? 0, fail: fail ?? 0, cancelled,
    executedTests: complete ? pass! + fail! : completedTestPoints,
    failedTests: [...log.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1]!),
    durationMs: duration ? Number(duration[1]) : undefined };
}
export interface Counters { lf: number; lh: number; brf: number; brh: number; fnf: number; fnh: number }
export interface FunctionHit { key: string; name: string; line: number | null; hits: number }
export interface CoverageImage {
  file: string;
  lines: Map<number, number>;
  branches: Map<string, number>;
  functions: Map<string, FunctionHit>;
  warnings: string[];
}
export interface GapTriage { label: "needs-test" | "refactor-candidate" | "needs-run" | "not-measured"; reasons: string[] }
export interface FileRow {
  file: string;
  status: "MEASURED" | "NOT LOADED" | "NOT RUN" | "DELETED" | "MISSING";
  line: number | null; branch: number | null; funcs: number | null;
  distance: { line: number | null; branch: number | null; funcs: number | null };
  counters: Counters | null;
  uncoveredLines: string[];
  uncoveredFunctions: FunctionHit[];
  uncoveredBranches: string[];
  loadedBy: string[];
  selectedFor: string[];
  runner: string;
  evidence: boolean;
  warnings: string[];
  triage: GapTriage;
}

/** Report paths support plain lines, bullets, fenced blocks, inline code and file:line links. */
function reportSection(text: string, name: string): string | undefined {
  const lines: string[] = [];
  let active = false, found = false, fenced = false;
  for (const line of text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    const header = !fenced && /^\s*(?:#{1,6}\s*)?(?:\*\*)?([A-Z][A-Z0-9 /_-]*?)(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.*)$/.exec(line);
    const heading = !fenced && /^\s*#{1,6}\s+(.+?)\s*$/.exec(line);
    const title = header ? header[1]!.trim() : heading ? heading[1]!.replace(/[*:]/g, "").trim() : undefined;
    if (title) {
      if (title === name) { active = found = true; if (header) lines.push(header[2]!); continue; }
      if (active) break;
    }
    if (active) lines.push(line);
  }
  return found ? lines.join("\n") : undefined;
}

function pathsIn(text: string): string[] {
  // Same path vocabulary as the job tooling; anchors and explanatory suffixes are excluded.
  // A filename used as a link LABEL is not another input path.
  const targets = text.replace(/\[[^\]]*\]\(([^)]+)\)/g, "$1");
  return [...new Set([...targets.matchAll(/(?<![\w./@+-])(?:\/?[\w@+.-]+\/)*[\w@+-][\w@+.-]*\.[A-Za-z0-9]+/g)].map((m) => m[0]))];
}

export function parseJobReport({ text }: { text: string }, _optional: Optional = {}): { changed: string[]; deleted: string[]; tests: string[] } {
  const changed = reportSection(text, "CHANGED FILES");
  if (changed === undefined) throw new Error("Job report is missing its CHANGED FILES: block");
  const deleted = changed.split(/\r?\n/).filter((line) => /\(deleted\)\s*$/i.test(line)).flatMap(pathsIn);
  return { changed: pathsIn(changed), deleted: [...new Set(deleted)], tests: pathsIn(reportSection(text, "TESTS TO RUN") ?? "").filter(isTestPath) };
}

function isTestPath(file: string): boolean { return /\.(test|spec)\.[cm]?[jt]sx?$/.test(file); }

export function changedSourceSet({ paths }: { paths: readonly string[] }, _optional: Optional = {}): { files: string[]; excluded: { file: string; reason: string }[] } {
  const files: string[] = [], excluded: { file: string; reason: string }[] = [];
  for (const raw of [...new Set(paths)].sort()) {
    const file = raw.replaceAll("\\", "/").replace(/^\.\//, "");
    if (file.split("/").includes("..")) throw new Error(`Path escapes the source root: ${raw}`);
    let reason = "";
    if (!/^(apps|development)\//.test(file)) reason = "outside apps/ and development/";
    else if (!/\.[cm]?[jt]sx?$/.test(file)) reason = "not JS/TS source";
    else if (/\.d\.[cm]?ts$/.test(file)) reason = "type declaration";
    else if (isTestPath(file) || /\/(?:__tests__|__measurements__|__mocks__|__fixtures__|fixtures|test-fixtures|testdata|e2e)\//.test(file)) reason = "test or fixture";
    else if (/\/(?:node_modules|dist|build|coverage|generated|__generated__|\.next|\.cache)\//.test(file) || /\.(generated|gen)\.[cm]?[jt]sx?$/.test(file)) reason = "generated or build output";
    if (reason) excluded.push({ file, reason }); else files.push(file);
  }
  return { files: [...new Set(files)].sort(), excluded };
}

function counter(value: string, label: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`Invalid LCOV ${label}: ${value}`);
  return Number(value);
}

function parseImage(record: string, normalizePath: (file: string) => string): CoverageImage | undefined {
  const sf = /^SF:(.+)$/m.exec(record);
  if (!sf) return undefined;
  const image: CoverageImage = { file: normalizePath(sf[1]!.trim()), lines: new Map(), branches: new Map(), functions: new Map(), warnings: [] };
  const declarations: { name: string; line: number | null; key: string }[] = [];
  const namedCounts = new Map<string, number>();
  const hits = new Map<string, number[]>();
  const summaries = new Map<string, number>();
  for (const row of record.split("\n")) {
    if (/^(LF|LH|BRF|BRH|FNF|FNH):/.test(row)) {
      const [key, value] = row.split(":");
      summaries.set(key!, counter(value!, key!));
    } else if (row.startsWith("DA:")) {
      const [position, count] = row.slice(3).split(",");
      const line = counter(position!, "DA position");
      image.lines.set(line, Math.max(image.lines.get(line) ?? 0, counter(count!, "DA count")));
    } else if (row.startsWith("BRDA:")) {
      const fields = row.slice(5).split(",");
      if (fields.length !== 4) throw new Error(`Invalid BRDA: ${row}`);
      const key = fields.slice(0, 3).join(",");
      const hit = fields[3] === "-" ? 0 : counter(fields[3]!, "BRDA count");
      image.branches.set(key, Math.max(image.branches.get(key) ?? 0, hit));
    } else if (row.startsWith("FN:")) {
      const match = /^FN:(\d+|undefined),(?:(\d+),)?(.+)$/.exec(row);
      if (!match) throw new Error(`Invalid FN: ${row}`);
      const line = match[1] === "undefined" ? null : Number(match[1]), name = match[3]!;
      const base = `${line}:${name}`, occurrence = namedCounts.get(base) ?? 0;
      namedCounts.set(base, occurrence + 1);
      declarations.push({ name, line, key: `${base}:${occurrence}` });
    } else if (row.startsWith("FNDA:")) {
      const match = /^FNDA:(\d+),(.+)$/.exec(row);
      if (!match) throw new Error(`Invalid FNDA: ${row}`);
      const values = hits.get(match[2]!) ?? [];
      values.push(Number(match[1])); hits.set(match[2]!, values);
    }
  }
  for (const declaration of declarations) {
    const values = hits.get(declaration.name);
    if (!values?.length) throw new Error(`LCOV function ${declaration.name} is missing FNDA`);
    image.functions.set(declaration.key, { ...declaration, hits: values.shift()! });
  }
  if ([...hits.values()].some((values) => values.length)) throw new Error(`LCOV FNDA has no matching FN: ${image.file}`);
  const actual = imageCounters(image);
  for (const [key, value] of summaries) {
    if (actual[key.toLowerCase() as keyof Counters] !== value) throw new Error(`LCOV ${key} does not match detail records in ${image.file}`);
  }
  return image;
}

function sameKeys(a: ReadonlyMap<unknown, unknown>, b: ReadonlyMap<unknown, unknown>): boolean {
  return a.size === b.size && [...a.keys()].every((key) => b.has(key));
}

/** Only merge records from ONE artifact/scope. Cross-run branch IDs under tsx are unstable. */
export function mergeLcov({ text, normalizePath }: { text: string; normalizePath: (file: string) => string }, _optional: Optional = {}): Map<string, CoverageImage> {
  const normalized = text.replaceAll("\r\n", "\n");
  const blocks = normalized.split(/^end_of_record\s*$/m);
  if (/^SF:/m.test(blocks.at(-1) ?? "")) throw new Error("LCOV is truncated (missing end_of_record)");
  const images = new Map<string, CoverageImage>();
  for (const record of blocks) {
    const next = parseImage(record, normalizePath);
    if (!next) continue;
    const previous = images.get(next.file);
    if (!previous) { images.set(next.file, next); continue; }
    // Same-image duplicate SF blocks are a union, never summed LF/BRF/FNF denominators.
    for (const axis of ["lines", "branches", "functions"] as const) {
      if (!sameKeys(previous[axis], next[axis])) previous.warnings.push(`incompatible ${axis === "branches" ? "branch" : axis} layouts in duplicate SF records; coverage not evidence`);
    }
    for (const [line, hit] of next.lines) previous.lines.set(line, Math.max(previous.lines.get(line) ?? 0, hit));
    for (const [key, hit] of next.branches) previous.branches.set(key, Math.max(previous.branches.get(key) ?? 0, hit));
    for (const [key, fn] of next.functions) previous.functions.set(key, { ...fn, hits: Math.max(previous.functions.get(key)?.hits ?? 0, fn.hits) });
  }
  return images;
}

function imageCounters(image: CoverageImage): Counters {
  return {
    lf: image.lines.size, lh: [...image.lines.values()].filter((hit) => hit > 0).length,
    brf: image.branches.size, brh: [...image.branches.values()].filter((hit) => hit > 0).length,
    fnf: image.functions.size, fnh: [...image.functions.values()].filter((fn) => fn.hits > 0).length,
  };
}

export function hasInstrumentedHits({ image }: { image: CoverageImage }, _optional: Optional = {}): boolean {
  const c = imageCounters(image);
  return c.lh + c.brh + c.fnh > 0;
}

export function classifyGap({ complexity = 0, runtimeReasons = [], mockCounts = [] }: { complexity?: number; runtimeReasons?: readonly string[]; mockCounts?: readonly number[] }, _optional: Optional = {}): GapTriage {
  const reasons: string[] = [...runtimeReasons];
  if (complexity > 9) reasons.push(`maximum function cyclomatic complexity ${complexity} exceeds 9 (AST estimate)`);
  if (mockCounts.length > 0 && mockCounts.every((count) => count >= 4)) reasons.push("every selected importing test uses at least four module mocks (deep-mock signal)");
  return { label: reasons.length ? "refactor-candidate" : "needs-test", reasons: reasons.length ? reasons : ["add assertions that exercise the uncovered behavior"] };
}

function ranges(positions: number[]): string[] {
  const out: string[] = [];
  let start: number | undefined, last: number | undefined;
  for (const next of [...new Set(positions)].sort((a, b) => a - b)) {
    if (last !== undefined && next !== last + 1) { out.push(start === last ? `${start}` : `${start}-${last}`); start = undefined; }
    if (start === undefined) start = next;
    last = next;
  }
  if (start !== undefined) out.push(start === last ? `${start}` : `${start}-${last}`);
  return out;
}

export function evaluateFiles({ files, coverage, sources = new Map(), loadedBy = new Map(), selectedFor = new Map(), triage = new Map(), runners = new Map(), invalid = new Map(), unloadedFunctions = new Map() }: {
  files: readonly string[]; coverage: ReadonlyMap<string, CoverageImage>;
  sources?: ReadonlyMap<string, string>; loadedBy?: ReadonlyMap<string, string[]>;
  selectedFor?: ReadonlyMap<string, string[]>; triage?: ReadonlyMap<string, GapTriage>;
  runners?: ReadonlyMap<string, string>; invalid?: ReadonlyMap<string, string[]>;
  unloadedFunctions?: ReadonlyMap<string, readonly string[]>;
}, { ranFiles, deleted = new Set(), missing = new Set() }: { ranFiles?: ReadonlySet<string>; deleted?: ReadonlySet<string>; missing?: ReadonlySet<string> } = {}): FileRow[] {
  return files.map((file): FileRow => {
    const skipped = deleted.has(file) ? "DELETED" : missing.has(file) ? "MISSING" : ranFiles && !ranFiles.has(file) ? "NOT RUN" : undefined;
    if (skipped) return {
      file, status: skipped, line: null, branch: null, funcs: null,
      distance: { line: null, branch: null, funcs: null }, counters: null,
      uncoveredLines: [], uncoveredFunctions: [], uncoveredBranches: [], loadedBy: [],
      selectedFor: [...(selectedFor.get(file) ?? [])], runner: "unmeasured", evidence: false,
      warnings: skipped === "MISSING" ? ["WARNING: missing non-deleted source — not measured"] : [],
      triage: { label: skipped === "NOT RUN" ? "needs-run" : "not-measured", reasons: [skipped === "NOT RUN" ? "run selected tests and remeasure before diagnosing gaps" : skipped === "DELETED" ? "deleted — not measured" : "restore or correct the missing path before measurement"] },
    };
    const image = coverage.get(file);
    // Vitest's coverage.include also emits zero-hit records for unloaded files. Imports/mocks
    // are only discovery hints; neither existence in that report nor a grep establishes execution.
    const loaded = !!image && hasInstrumentedHits({ image });
    const counters = loaded ? imageCounters(image!) : null;
    const pct = (hit: number, found: number) => found === 0 ? 100 : hit * 100 / found;
    const line = counters ? pct(counters.lh, counters.lf) : 0;
    const branch = counters ? pct(counters.brh, counters.brf) : 0;
    const funcs = counters ? pct(counters.fnh, counters.fnf) : 0;
    const warnings = [...(image?.warnings ?? []), ...(invalid.get(file) ?? [])];
    return {
      file, status: loaded ? "MEASURED" : "NOT LOADED", line, branch, funcs,
      distance: { line: 100 - line, branch: 100 - branch, funcs: 100 - funcs }, counters,
      uncoveredLines: image?.lines.size ? ranges([...image.lines].filter(([, hit]) => hit === 0).map(([position]) => position)) : (sources.has(file) ? [`1-${sources.get(file)!.trimEnd().split("\n").length} (whole source; executable indices unknown)`] : ["whole file (no LCOV record)"]),
      uncoveredFunctions: image?.functions.size ? [...image.functions.values()].filter((fn) => fn.hits === 0) : loaded ? [] : (unloadedFunctions.get(file) ?? []).map((name, index) => ({ key: `source:${index}:${name}`, name, line: null, hits: 0 })),
      uncoveredBranches: image ? [...image.branches].filter(([, hit]) => hit === 0).map(([key]) => key) : [],
      loadedBy: [...(loadedBy.get(file) ?? [])].sort(), selectedFor: [...(selectedFor.get(file) ?? [])].sort(),
      runner: runners.get(file) ?? "unmeasured", evidence: warnings.length === 0,
      warnings, triage: loaded && !warnings.length ? triage.get(file) ?? classifyGap({}) : { label: "needs-test", reasons: ["no instrumented hits in executed scope; inspect test selection and loading before diagnosing a refactor"] },
    };
  }).sort((a, b) => (a.line ?? -1) - (b.line ?? -1) || (a.branch ?? -1) - (b.branch ?? -1) || (a.funcs ?? -1) - (b.funcs ?? -1) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

export function summarizeFiles({ rows }: { rows: readonly FileRow[] }, _optional: Optional = {}) {
  const eligible = rows.filter((row) => row.status !== "DELETED" && row.status !== "MISSING");
  const byRunner: Record<string, Counters & { fileCount: number }> = {};
  for (const row of rows) {
    if (!row.counters) continue;
    const sum = byRunner[row.runner] ?? { lf: 0, lh: 0, brf: 0, brh: 0, fnf: 0, fnh: 0, fileCount: 0 };
    for (const key of ["lf", "lh", "brf", "brh", "fnf", "fnh"] as const) sum[key] += row.counters[key];
    sum.fileCount++; byRunner[row.runner] = sum;
  }
  // Unknown executable counts cannot honestly be invented for NOT LOADED files. All-file means
  // keep those files at zero, and measured counters remain visibly incomplete and runner-specific.
  const mean = (axis: "line" | "branch" | "funcs") => eligible.some((row) => row[axis] === null) || !eligible.length ? null : eligible.reduce((sum, row) => sum + (row[axis] ?? 0), 0) / eligible.length;
  return { fileCount: eligible.length, notRun: eligible.filter((row) => row.status === "NOT RUN").length, notLoaded: eligible.filter((row) => row.status === "NOT LOADED").length,
    mean: { line: mean("line"), branch: mean("branch"), funcs: mean("funcs") }, byRunner };
}

export function resultExitCode({ rows, testFailures = [], toolErrors = [] }: { rows: readonly FileRow[]; testFailures?: readonly string[]; toolErrors?: readonly string[] }, _optional: Optional = {}): 0 | 1 | 2 {
  if (toolErrors.length) return 2;
  if (testFailures.length) return 1;
  const eligible = rows.filter((row) => row.status !== "DELETED" && row.status !== "MISSING");
  if (eligible.some((row) => row.status !== "NOT RUN" && !row.evidence)) return 2;
  if (eligible.some((row) => row.line === null || row.branch === null || row.funcs === null || row.line < 100 || row.branch < 100 || row.funcs < 100)) return 1;
  return 0;
}

function cell(value: string): string { return value.replaceAll("|", "\\|").replaceAll("\n", " "); }
function gaps(row: FileRow): string {
  if (row.status === "NOT RUN") return "unknown — selected tests have not executed; remeasure first";
  if (row.status === "DELETED") return "deleted — not measured";
  if (row.status === "MISSING") return "WARNING: missing non-deleted source — not measured";
  return `LCOV instrumented indices: ${row.uncoveredLines.join(", ") || "none"}; functions: ${row.uncoveredFunctions.map((fn) => `${fn.name}${fn.line === null ? "" : ` (index ${fn.line})`}`).join(", ") || (row.status === "NOT LOADED" ? "unknown until loaded" : "none")}; branches: ${row.counters ? row.counters.brf - row.counters.brh : "unknown"} uncovered (IDs ${row.uncoveredBranches.join("; ") || "none/unknown"})`;
}

export function renderFixPrompt({ rows, rules, input, out, failures = [], toolErrors = [] }: { rows: readonly FileRow[]; rules: string; input: string; out: string; failures?: readonly string[]; toolErrors?: readonly string[] }, _optional: Optional = {}): string {
  const targets = rows.filter((row) => row.status === "MEASURED" && row.evidence && !failures.length && !toolErrors.length && ((row.line ?? 0) < 100 || (row.branch ?? 0) < 100 || (row.funcs ?? 0) < 100));
  const remeasure = rows.filter((row) => row.status !== "DELETED" && !targets.includes(row) && (row.status !== "MEASURED" || !row.evidence || failures.length || toolErrors.length));
  return ["<<PEER_DISPATCH>>", "", "<<SUBAGENT_DISPATCH>>", "", "# Code-only coverage fixes (cov2)", "",
    `Input: ${input}`, `Coverage artifacts: ${out}`, "",
    targets.length ? "Fix the measured gaps below with behavior assertions, or extract a testable policy behind an injected port when triage recommends refactoring. Triage signals are advisory, never proof of unreachable code." : remeasure.length ? "No trustworthy measured gaps are available for code fixes. Have the coordinator run tests and remeasure unknown rows before diagnosing or changing production code." : "No measured coverage gaps require code changes.",
    "Do NOT run tests, typecheck, vitest, builds, dev servers, or git writes. The coordinator runs verification.",
    "Preserve strict assertions and why comments; never delete tests, bypass coverage, grandfather gaps, or call branches phantom.",
    "LCOV instrumented indices under tsx are NOT source line anchors. Branch IDs cannot identify source arms or be compared across differently scoped runs. Read the source and prove behavior with assertions.",
    "Only real instrumented hits count as loaded; mocked imports do not cover the module. Serialized browser/process code needs separate execution evidence.",
    failures.length || toolErrors.length ? "Coverage is not evidence: resolve test/tool failures and have the coordinator remeasure before using the numbers." : "Coverage scope is exactly the printed selected test set; omitted tests may cover additional behavior.",
    "", "Failures:", ...[...failures, ...toolErrors].map((failure) => `- ${failure}`), "",
    "Measured files requiring work:", ...targets.map((row) => `- ${row.file} | ${row.status} | line ${row.line!.toFixed(2)}%, branch ${row.branch!.toFixed(2)}%, functions ${row.funcs!.toFixed(2)}% | ${row.triage.label}\n  ${gaps(row)}\n  Reasons: ${row.triage.reasons.join("; ")}\n  Tests with instrumented hits: ${row.loadedBy.join(", ") || "none"}`),
    ...(targets.length ? [] : ["(No trustworthy measured file gaps.)"]), "",
    "Remeasure before diagnosing gaps:", ...remeasure.map((row) => `- ${row.file} | ${row.status} | ${row.triage.label}: ${row.triage.reasons.join("; ")}`), "",
    "Deleted — not measured:", ...rows.filter((row) => row.status === "DELETED").map((row) => `- ${row.file}`), "", rules.trim(), ""].join("\n");
}

export const REUSE_NOTES = "Reused existing TypeScript AST, admin @vitest/coverage-v8 and its Istanbul reporting pipeline, desktop TEST_PASSES, and check-coverage-integrity.ts. Inspected node_modules: istanbul-lib-coverage / istanbul-lib-report exist only in admin; they consume Istanbul JSON rather than parse Node LCOV. lcov-parse, c8 and v8-to-istanbul are absent. No dependency added; a small LCOV adapter preserves same-scope duplicate unions and rejects incompatible layouts. [IstanbulJS](https://github.com/istanbuljs/istanbuljs), [lcov-parse](https://github.com/davglass/lcov-parse). [diff-cover](https://github.com/Bachmann1234/diff_cover) measures changed lines; a --changed-lines mode is worth adding for source-mapped coverage, after tsx position accuracy is solved.";

export function renderMarkdown({ rows, input, selectedTests, omittedTests, failures, toolErrors, runs, excluded = [], noTestsReason, picks = [], warnings = [] }: {
  rows: readonly FileRow[]; input: string; selectedTests: readonly string[]; omittedTests: readonly string[];
  failures: readonly string[]; toolErrors: readonly string[]; runs: readonly { id: string; tests: readonly string[]; status: number | null; log: string; command: string; role: string; executedTests?: number }[];
  excluded?: readonly { file: string; reason: string }[]; noTestsReason?: string;
  picks?: readonly { test: string; changedFile?: string; reason: string }[]; warnings?: readonly string[];
}, _optional: Optional = {}): string {
  const noTests = noTestsReason ?? (runs.length === 0 || runs.every((run) => run.executedTests === 0) ? toolErrors.join("; ") || (selectedTests.length ? "selected runners reported no executed tests" : "no eligible tests selected") : undefined);
  // A renderer may be handed older/default model rows. Never display 0% or measured
  // coverage from those rows when the run context says no tests actually executed.
  const visibleRows: readonly FileRow[] = noTests ? rows.map((row): FileRow => row.status === "DELETED" || row.status === "MISSING" ? row : ({
    ...row, status: "NOT RUN", runner: "unmeasured", line: null, branch: null, funcs: null,
    distance: { line: null, branch: null, funcs: null }, counters: null,
    uncoveredLines: [], uncoveredFunctions: [], uncoveredBranches: [], loadedBy: [], evidence: false,
    triage: { label: "needs-run", reasons: ["run selected tests and remeasure before diagnosing gaps"] },
  })) : rows;
  const total = summarizeFiles({ rows: visibleRows });
  const value = (number: number | null) => number === null ? "N/A" : number.toFixed(2);
  const metric = (number: number | null, gap: number | null) => number === null ? "N/A" : `${value(number)} (${value(gap)})`;
  const status = (row: FileRow) => row.status === "DELETED" ? "deleted — not measured" : row.status === "MISSING" ? "WARNING: missing — not measured" : `${row.status} / ${row.runner}${!row.evidence ? " / NOT EVIDENCE" : ""}`;
  const scopeInvalid = failures.length || toolErrors.length || rows.some((row) => row.status !== "DELETED" && row.status !== "MISSING" && !row.evidence);
  return [noTests ? `# Coverage of changed files — no tests ran: ${noTests}` : "# Coverage of changed files", "", `Input: ${input}`, "",
    `Coverage evidence: ${noTests ? "NOT EVIDENCE (no tests ran)" : scopeInvalid ? "NOT EVIDENCE (test/tool/integrity failures or unrun scope)" : "valid for this exact selected scope"}.`, "",
    "LCOV ranges below are instrumented line indices; tsx positions are not reliable source locations. Branch gaps are counts and opaque IDs, never source-arm claims. Node includes comments/blanks in its line denominator; Vitest does not. Across runners, keep a complete image rather than union incomparable denominators.", "",
    "| Changed file | Status / runner | Line % (gap pp) | Branch % (gap pp) | Function % (gap pp) | Uncovered | Tests with instrumented hits | Triage |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...visibleRows.map((row) => `| ${cell(row.file)} | ${cell(status(row))} | ${metric(row.line, row.distance.line)} | ${metric(row.branch, row.distance.branch)} | ${metric(row.funcs, row.distance.funcs)} | ${cell(gaps(row))} | ${cell(row.loadedBy.join(", ") || "none")} | ${cell(row.triage.label + ": " + row.triage.reasons.join("; "))} |`), "",
    `Overall: ${total.fileCount} changed source files eligible for measurement; ${total.notRun} NOT RUN; ${total.notLoaded} NOT LOADED. Deleted/missing paths are excluded from coverage gaps. All-file mean (unloaded files = 0; unrun files unknown): lines ${value(total.mean.line)}${total.mean.line === null ? "" : "%"}, branches ${value(total.mean.branch)}${total.mean.branch === null ? "" : "%"}, functions ${value(total.mean.funcs)}${total.mean.funcs === null ? "" : "%"}.`,
    "Executable totals for unloaded/unrun files are unknown, not silently excluded or estimated. Measured-only counters by runner:",
    ...Object.entries(total.byRunner).map(([runner, c]) => `- ${runner}: ${c.fileCount} files; lines ${c.lh}/${c.lf}, branches ${c.brh}/${c.brf}, functions ${c.fnh}/${c.fnf}`), "",
    `Selected tests (${selectedTests.length}; exact paths, capped):`, ...selectedTests.map((test) => {
      const reasons = picks.filter((pick) => pick.test === test).map((pick) => `${pick.reason}${pick.changedFile ? ` for ${pick.changedFile}` : ""}`);
      return `- ${test}${reasons.length ? ` — ${reasons.join("; ")}` : ""}`;
    }), "",
    `Omitted by cap (${omittedTests.length}):`, ...omittedTests.map((test) => `- ${test}`), "",
    "Runs (sequential; aggregate determines coverage, singleton probes establish provenance):", ...runs.map((run) => `- ${run.id} (${run.role}) exit ${run.status}; executed tests ${run.executedTests ?? "unknown"}: ${run.command}; log ${run.log}`), "",
    "Failures / tool errors:", ...[...failures, ...toolErrors].map((failure) => `- ${failure}`), "",
    "Measurement warnings:", ...warnings.map((warning) => `- ${warning}`), ...rows.flatMap((row) => row.warnings.map((warning) => `- ${row.file}: ${warning}`)), "",
    "Excluded input paths:", ...excluded.map((entry) => `- ${entry.file}: ${entry.reason}`), "",
    "Open-source reuse:", "", REUSE_NOTES, "", "JINI CANDIDATE: pure model and import-discovery policy; Jini is outside this job's writable roots. Host runner adapters stay in Tovu.", ""].join("\n");
}
