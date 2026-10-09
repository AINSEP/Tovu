#!/usr/bin/env node
/** cov1 host adapter. No application imports, no LLM, no installation, no unscoped runners. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, openSync, closeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { TEST_PASSES } from "../../apps/desktop/src/coverage-floors.js";
import { parseLcovBlocks, classifyBlock, isFirstPartySourcePath } from "./check-coverage-integrity.js";
import {
  changedSourceSet, parseJobReport, mergeLcov, evaluateFiles, classifyGap, hasInstrumentedHits,
  renderFixPrompt, renderMarkdown, summarizeFiles, resultExitCode, REUSE_NOTES, readNodeSummary,
  type CoverageImage, type GapTriage, type Optional,
} from "./coverage-changed-model.js";
import { discoverTests, scanModule, type Alias, type ModuleScan, type TestPick } from "./coverage-changed-discovery.js";

type Runner = "node" | "admin" | "desktop-node" | "desktop-tsx";
export interface TestCommand {
  executable: string; args: string[]; cwd: string; lcov: string; log: string;
  configFile?: string; configText?: string; resultFile?: string;
}
export interface CoveragePorts {
  readText: (required: { file: string }) => string;
  isFile: (required: { file: string }) => boolean;
  writeText: (required: { file: string; text: string }) => void;
  makeDirectory: (required: { directory: string }) => void;
  freshDirectory: (required: { prefix: string }) => string;
  git: (required: { args: readonly string[]; cwd: string }) => string;
  run: (required: { command: TestCommand }) => { status: number | null; signal: string | null; error?: string };
  print: (required: { text: string }) => void;
}
const GATE = "ADS-memory/.local-artifacts/test-slots/run-gated.sh";
const COMMON = "ADS-memory/.local-artifacts/codex-waves/features-2026-10-04/common.md";

export function parseCli({ args }: { args: readonly string[] }, _optional: Optional = {}): { input: string; out?: string; cap: number; totalCap?: number } {
  const usage = "usage: coverage-changed.sh <git-ref | job-report.md> [--out <dir>] [--max-tests <1..200 per file>] [--max-total-tests <1..2000>]";
  if (!args[0] || args[0].startsWith("-")) throw new Error(usage);
  let out: string | undefined, cap = 20, totalCap: number | undefined;
  for (let at = 1; at < args.length; at += 2) {
    const option = args[at], value = args[at + 1];
    if (!value || value.startsWith("-") || (option !== "--out" && option !== "--max-tests" && option !== "--max-total-tests")) throw new Error(usage);
    if (option === "--out") out = value; else if (option === "--max-total-tests") totalCap = Number(value); else cap = Number(value);
  }
  if (!Number.isInteger(cap) || cap < 1 || cap > 200) throw new Error(`${usage}; invalid test cap`);
  if (totalCap !== undefined && (!Number.isInteger(totalCap) || totalCap < 1 || totalCap > 2000)) throw new Error(`${usage}; invalid total test cap`);
  return { input: args[0], cap, ...(out === undefined ? {} : { out }), ...(totalCap === undefined ? {} : { totalCap }) };
}

function normalizeFile(repo: string, file: string): string {
  const absolute = file.startsWith("file:") ? fileURLToPath(file) : path.isAbsolute(file) ? file : path.resolve(repo, file);
  return path.relative(repo, absolute).split(path.sep).join("/");
}

export function normalizeCoveragePath({ repo, cwd, file }: { repo: string; cwd: string; file: string }, _optional: Optional = {}): string {
  // Resolve file URLs BEFORE cwd; path.resolve(cwd, 'file:///...') destroys the URL.
  return normalizeFile(repo, file.startsWith("file:") ? fileURLToPath(file) : path.resolve(cwd, file));
}

export function collectChanged({ repo, input, ports }: { repo: string; input: string; ports: CoveragePorts }, _optional: Optional = {}): {
  paths: string[]; deleted: string[]; reportedTests: string[]; kind: "report" | "git";
} {
  const reportPath = path.resolve(repo, input);
  if (ports.isFile({ file: reportPath })) {
    const report = parseJobReport({ text: ports.readText({ file: reportPath }) });
    return { paths: report.changed.map((file) => normalizeFile(repo, file)), deleted: report.deleted.map((file) => normalizeFile(repo, file)), reportedTests: report.tests.map((file) => normalizeFile(repo, file)), kind: "report" as const };
  }
  if (input.endsWith(".md") || input.startsWith("-")) throw new Error(`Missing report or invalid git ref: ${input}`);
  // Validate as a commit first. Never interpolate a ref into a shell or permit option injection.
  const commit = ports.git({ args: ["rev-parse", "--verify", `${input}^{commit}`], cwd: repo }).trim();
  const diff = ports.git({ args: ["diff", "--name-status", "--no-renames", "-z", commit, "--", "apps/", "development/"], cwd: repo });
  const untracked = ports.git({ args: ["ls-files", "--others", "--exclude-standard", "-z", "--", "apps/", "development/"], cwd: repo });
  const entries = diff.split("\0").filter(Boolean), paths: string[] = [], deleted: string[] = [];
  for (let at = 0; at < entries.length; at += 2) {
    const status = entries[at]!, file = entries[at + 1];
    if (!/^[ACDMTUXB]$/.test(status) || !file) throw new Error("Malformed git name-status result");
    paths.push(file); if (status === "D") deleted.push(file);
  }
  return { paths: [...new Set([...paths, ...untracked.split("\0")].filter(Boolean))], deleted, reportedTests: [], kind: "git" as const };
}

function runnerFor(file: string): Runner {
  if (file.startsWith("apps/admin/")) return "admin";
  if (file.startsWith("apps/desktop/")) {
    // Reuse the canonical pass data instead of duplicating its directory split by extension.
    const relative = file.slice("apps/desktop/".length);
    const tsxPass = TEST_PASSES.find((pass) => pass.nodeArgs.includes("tsx"));
    if (tsxPass?.globs.some((glob) => relative.startsWith(glob.slice(0, glob.indexOf("*"))))) return "desktop-tsx";
    return "desktop-node";
  }
  return "node";
}

export function buildTestCommand({ repo, runner, tests, changed, directory }: {
  repo: string; runner: Runner; tests: readonly string[]; changed: readonly string[]; directory: string; id: string;
}, { timeoutSeconds = 600 * tests.length }: { timeoutSeconds?: number } = {}): TestCommand {
  if (!tests.length) throw new Error("Refusing an empty/unscoped test command");
  if (tests.some((file) => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || /[*?{}\[\]]/.test(file) || file.startsWith("-"))) throw new Error("Every test command requires exact test file paths");
  if (changed.some((file) => /[*?{}\[\]]/.test(file))) throw new Error("Source paths containing coverage glob metacharacters are unsupported");
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1) throw new Error("Invalid gate timeout");
  const cwd = runner === "admin" ? path.join(repo, "apps/admin") : runner.startsWith("desktop-") ? path.join(repo, "apps/desktop") : repo;
  const relative = (file: string) => path.relative(cwd, path.join(repo, file)).split(path.sep).join("/");
  const lcov = path.join(directory, "lcov.info"), log = path.join(directory, "test.log");
  const args = ["-u", "TOVU_ADMIN_PASSWORD", "-u", "NODE_V8_COVERAGE", "-u", "TSX_TSCONFIG_PATH"];
  if (runner === "node") args.push(`TSX_TSCONFIG_PATH=${path.join(repo, "apps/site-chat/tsconfig.json")}`);
  args.push("bash", path.join(repo, GATE), "--timeout", String(timeoutSeconds));
  if (runner === "admin") {
    const configFile = path.join(directory, "vitest.config.mjs"), resultFile = path.join(directory, "vitest-results.json");
    const options = {
      include: tests.map(relative), maxWorkers: 1, fileParallelism: false, passWithNoTests: false,
      reporters: ["default", "json"], outputFile: { json: resultFile },
      coverage: { enabled: true, provider: "v8", include: changed.length ? changed.map(relative) : ["**/__no_changed_source_files__/**"], exclude: [],
        allowExternal: true, reporter: ["lcov"], reportsDirectory: directory, clean: false,
        reportOnFailure: true, thresholds: {} },
    };
    // An exact test.include whitelist closes Vitest's substring-filter widening. Preserve the
    // existing React/setup/alias configuration without changing another job's shared config.
    const configText = `import base from ${JSON.stringify(path.join(cwd, "vitest.config.ts"))};\nexport default { ...base, root: ${JSON.stringify(cwd)}, test: { ...base.test, ...${JSON.stringify(options, null, 2)} } };\n`;
    args.push(process.execPath, path.join(cwd, "node_modules/vitest/vitest.mjs"), "run", "--config", configFile, "--maxWorkers=1", ...tests.map(relative));
    return { executable: "env", args, cwd, lcov, log, configFile, configText, resultFile };
  }
  const pass = runner.startsWith("desktop-") ? TEST_PASSES.find((entry) => entry.id === (runner === "desktop-tsx" ? "tsx" : "node")) : undefined;
  if (runner.startsWith("desktop-") && !pass) throw new Error(`Canonical desktop pass is missing: ${runner}`);
  args.push(process.execPath, ...(pass ? pass.nodeArgs : ["--import", "tsx"]), "--test", "--test-concurrency=1",
    ...(pass?.nodeArgs.includes("--experimental-test-module-mocks") ? [] : ["--experimental-test-module-mocks"]),
    "--experimental-test-coverage", ...(changed.length ? changed.map((file) => `--test-coverage-include=${relative(file)}`) : ["--test-coverage-include=**/__no_changed_source_files__/**"]),
    // Node's default exclusion hides production test-* files, even with an explicit include.
    "--test-coverage-exclude=**/__no_route_coverage_gate_exclusions__/**",
    "--test-reporter=lcov", `--test-reporter-destination=${lcov}`, "--test-reporter=tap", "--test-reporter-destination=stdout", ...tests.map(relative));
  return { executable: "env", args, cwd, lcov, log };
}

function readAliases(repo: string, ports: CoveragePorts): Alias[] {
  const configPath = path.join(repo, "apps/admin/tsconfig.json");
  if (!ports.isFile({ file: configPath })) return [];
  const parsed = ts.parseConfigFileTextToJson(configPath, ports.readText({ file: configPath }));
  if (parsed.error) throw new Error("Cannot parse admin tsconfig aliases");
  const options = parsed.config?.compilerOptions ?? {};
  return Object.entries(options.paths ?? {}).map(([pattern, targets]) => ({ pattern,
    targets: (targets as string[]).map((target) => normalizeFile(repo, path.resolve(repo, "apps/admin", options.baseUrl ?? ".", target))) }));
}

function readableCommand(command: TestCommand): string {
  const quote = (arg: string) => /^[\w/.:=+-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`;
  return `cd ${quote(command.cwd)} && ${[command.executable, ...command.args].map(quote).join(" ")}`;
}

function integrityWarnings(text: string, cwd: string, repo: string, sources: ReadonlyMap<string, string>): Map<string, string[]> {
  const warnings = new Map<string, string[]>();
  for (const block of parseLcovBlocks(text)) {
    const file = normalizeCoveragePath({ repo, cwd, file: block.file });
    if (!sources.has(file)) continue;
    // The existing detector excludes development/ and app roots/scripts outside src/. Apply its
    // unchanged heuristic there too through a synthetic first-party path, not a weaker detector.
    const verdict = classifyBlock({ ...block, file: isFirstPartySourcePath(file) ? file : `apps/cov1/src/${file}` }, sources.get(file));
    if (verdict.status === "contaminated") warnings.set(file, [...(warnings.get(file) ?? []), `${verdict.severe ? "SEVERE " : ""}coverage integrity: ${verdict.reason}`]);
  }
  return warnings;
}

function imageScore(image: CoverageImage): number {
  const row = evaluateFiles({ files: [image.file], coverage: new Map([[image.file, image]]) })[0]!;
  return Math.min(row.line ?? 0, row.branch ?? 0, row.funcs ?? 0) * 1000 + (row.line ?? 0) + (row.branch ?? 0) + (row.funcs ?? 0);
}

export function runCoverageChanged({ repo, input, out, ports }: { repo: string; input: string; out: string; ports: CoveragePorts }, { cap = 20, totalCap = 200 }: { cap?: number; totalCap?: number } = {}) {
  ports.makeDirectory({ directory: out });
  const directory = ports.freshDirectory({ prefix: path.join(out, "run-") });
  const failures: string[] = [], toolErrors: string[] = [], excluded: { file: string; reason: string }[] = [];
  const deleted = new Set<string>(), missing = new Set<string>(), ranFiles = new Set<string>(), warnings: string[] = [];
  const sources = new Map<string, string>(), modules = new Map<string, ModuleScan>();
  const selectedTestSources = new Map<string, string>();
  const observedHashes = new Map<string, string>(), protectedSources = new Map<string, string>();
  const hash = (text: string) => createHash("sha256").update(text).digest("hex");
  const unloadedFunctions = new Map<string, string[]>();
  const coverage = new Map<string, CoverageImage>(), invalid = new Map<string, string[]>(), runners = new Map<string, string>();
  const loadedBy = new Map<string, string[]>(), selectedFor = new Map<string, string[]>(), triage = new Map<string, GapTriage>();
  const probeImages = new Map<Runner, Map<string, CoverageImage>>(), completeAggregates = new Set<Runner>();
  const runs: { id: string; tests: readonly string[]; status: number | null; log: string; command: string; role: string; runner: Runner; lcov: string; executedTests: number; durationMs?: number }[] = [];
  let files: string[] = [], rowFiles: string[] = [], selectedTests: string[] = [], omittedTests: string[] = [], picks: TestPick[] = [], rules = "", kind = "unknown";
  try {
    const changed = collectChanged({ repo, input, ports }); kind = changed.kind;
    const sourceSet = changedSourceSet({ paths: changed.paths });
    excluded.push(...sourceSet.excluded);
    rowFiles = sourceSet.files;
    files = sourceSet.files.filter((file) => {
      if (changed.deleted.includes(file)) { deleted.add(file); return false; }
      if (ports.isFile({ file: path.join(repo, file) })) return true;
      missing.add(file); return false;
    });
    for (const file of changed.paths) {
      if (!changed.deleted.includes(file) && ports.isFile({ file: path.join(repo, file) })) protectedSources.set(file, ports.readText({ file: path.join(repo, file) }));
    }
    rules = ports.readText({ file: path.join(repo, COMMON) });
    if (!rules.includes("## Hard rules")) throw new Error(`Missing owner rules block in ${COMMON}`);
    if (!ports.isFile({ file: path.join(repo, GATE) })) throw new Error(`Missing test memory/load gate: ${GATE}`);
    const gitInventory = new Set([
      ...ports.git({ args: ["ls-files", "-z", "--", "apps/", "development/"], cwd: repo }).split("\0"),
      ...ports.git({ args: ["ls-files", "--others", "--exclude-standard", "-z", "--", "apps/", "development/"], cwd: repo }).split("\0"),
    ].filter(Boolean));
    const inventory = [...new Set([...gitInventory, ...files])].filter((file) => /\.[cm]?[jt]sx?$/.test(file) && !/\/(?:node_modules|dist|build|coverage|generated|__generated__)\//.test(file) && ports.isFile({ file: path.join(repo, file) }));
    for (const file of inventory) {
      let source: string;
      try { source = ports.readText({ file: path.join(repo, file) }); }
      catch (error) {
        if (protectedSources.has(file) || changed.reportedTests.includes(file)) throw error;
        warnings.push(`Informational: unselected inventory file unavailable during discovery: ${file}`); continue;
      }
      observedHashes.set(file, hash(source));
      modules.set(file, scanModule({ file, source }));
      if (files.includes(file)) sources.set(file, source);
    }
    files = files.filter((file) => {
      if (!modules.get(file)?.generated) return true;
      excluded.push({ file, reason: "generated source header" }); sources.delete(file); rowFiles = rowFiles.filter((entry) => entry !== file); return false;
    });
    for (const file of files) unloadedFunctions.set(file, modules.get(file)?.declaredFunctions ?? []);
    const selection = discoverTests({ changed: files, modules, reported: changed.reportedTests, inventory: gitInventory }, { cap, totalCap, aliases: readAliases(repo, ports) });
    selectedTests = selection.tests; omittedTests = selection.omitted; picks = selection.picks; toolErrors.push(...selection.errors); warnings.push(...selection.warnings);
    for (const test of selectedTests) selectedTestSources.set(test, ports.readText({ file: path.join(repo, test) }));
    for (const file of files) {
      selectedFor.set(file, selection.byFile.get(file)?.filter((test) => selectedTests.includes(test)) ?? []);
      const scan = modules.get(file);
      const importing = selection.importingByFile.get(file)?.filter((test) => selectedTests.includes(test)) ?? [];
      triage.set(file, classifyGap({ complexity: scan?.complexity, runtimeReasons: scan?.runtimeReasons, mockCounts: importing.map((test) => modules.get(test)!.mockCount) }));
    }
    for (const test of selectedTests) {
      if (test.startsWith("development/e2e/")) toolErrors.push(`Browser test requires a separate scoped Playwright runner: ${test}`);
      if (!test.startsWith("apps/") && !test.startsWith("development/")) toolErrors.push(`Test is outside supported Tovu roots: ${test}`);
      if (!ports.isFile({ file: path.join(repo, test) })) toolErrors.push(`Selected test file is missing: ${test}`);
    }
    ports.print({ text: `Changed source files: ${files.length}. Selected exact test files: ${selectedTests.length} (per-file cap ${cap}, total cap ${totalCap}); omitted ${omittedTests.length}.\n${picks.map((pick) => `${pick.test} — ${pick.reason}${pick.changedFile ? ` for ${pick.changedFile}` : ""}`).join("\n")}\n` });
    if (omittedTests.length) ports.print({ text: `OMITTED BY CAP:\n${omittedTests.join("\n")}\n` });
    const groups = new Map<Runner, string[]>();
    for (const test of selectedTests) { const runner = runnerFor(test); const group = groups.get(runner) ?? []; group.push(test); groups.set(runner, group); }
    const runOne = (runner: Runner, tests: string[], id: string, role: "aggregate" | "provenance", timeoutSeconds?: number) => {
      for (const file of tests) if (!ports.isFile({ file: path.join(repo, file) })) throw new Error(`Test disappeared before launch: ${file}`);
      const runDirectory = path.join(directory, id); ports.makeDirectory({ directory: runDirectory });
      const command = buildTestCommand({ repo, runner, tests, changed: files, directory: runDirectory, id }, { timeoutSeconds });
      if (command.configFile) ports.writeText({ file: command.configFile, text: command.configText! });
      const printed = readableCommand(command); ports.print({ text: `[${id}] ${printed}\n` });
      const result = ports.run({ command });
      const run: (typeof runs)[number] = { id, tests, status: result.status, log: command.log, command: printed, role, runner, lcov: command.lcov, executedTests: 0 };
      runs.push(run);
      if (result.error || result.signal || result.status === null) { toolErrors.push(`${id}: ${result.error ?? result.signal ?? "no process status"}`); return; }
      if (result.status === 124) {
        const summary = readNodeSummary({ text: ports.readText({ file: command.log }) });
        run.executedTests = command.resultFile ? 0 : summary.executedTests;
        toolErrors.push(`${id}: gate timeout after ${command.args[command.args.indexOf("--timeout") + 1]}s; ${run.executedTests} completed test points before abort; TAP/coverage incomplete; ${command.log}`);
        return;
      }
      if (command.resultFile) {
        const json = JSON.parse(ports.readText({ file: command.resultFile }));
        run.executedTests = Math.max(0, (json.numTotalTests ?? 0) - (json.numPendingTests ?? 0) - (json.numTodoTests ?? 0));
        if (!(run.executedTests > 0) || typeof json.success !== "boolean") { toolErrors.push(`${id}: zero tests or incomplete Vitest result; ${command.resultFile}`); return; }
        if (result.status !== 0) failures.push(`${id}: test command exited ${result.status}; ${command.log}. Coverage not evidence.`);
        if (!json.success && result.status === 0) failures.push(`${id}: Vitest reports failure despite gate exit 0; ${command.resultFile}. Coverage not evidence.`);
      } else {
        const summary = readNodeSummary({ text: ports.readText({ file: command.log }) });
        run.executedTests = summary.executedTests;
        run.durationMs = summary.durationMs;
        if (!summary.complete || summary.tests === 0) { toolErrors.push(`${id}: runner reported no executed tests or incomplete TAP summary; ${command.log}`); return; }
        if (result.status !== 0) failures.push(`${id}: test command exited ${result.status}; TAP ${summary.fail} failed, ${summary.cancelled} cancelled${summary.failedTests.length ? `: ${summary.failedTests.join("; ")}` : ""}; ${command.log}. Coverage not evidence.`);
        if (result.status === 0 && (summary.fail > 0 || summary.cancelled > 0)) failures.push(`${id}: TAP reports failure/cancellation despite gate exit 0; ${command.log}. Coverage not evidence.`);
        if (run.executedTests === 0) { toolErrors.push(`${id}: no executed tests (only skipped/todo); ${command.log}`); return; }
      }
      if (role === "aggregate") for (const file of files) ranFiles.add(file);
      if (!ports.isFile({ file: command.lcov })) {
        if (result.status === 0) toolErrors.push(`${id}: successful tests produced no fresh LCOV; ${command.lcov}`);
        return;
      }
      const text = ports.readText({ file: command.lcov });
      const measured = mergeLcov({ text, normalizePath: (file) => normalizeCoveragePath({ repo, cwd: command.cwd, file }) });
      const integrity = integrityWarnings(text, command.cwd, repo, sources);
      if (role === "aggregate") {
        const lostHits = [...(probeImages.get(runner)?.keys() ?? [])].filter((file) => !measured.has(file));
        if (lostHits.length) toolErrors.push(`${id}: aggregate LCOV omitted sources with singleton hits: ${lostHits.join(", ")}; ${command.lcov}`);
        else completeAggregates.add(runner);
      }
      for (const file of files) {
        if (integrity.has(file)) invalid.set(file, [...(invalid.get(file) ?? []), ...integrity.get(file)!]);
        const image = measured.get(file);
        if (!image) continue;
        if (image.warnings.length) invalid.set(file, [...(invalid.get(file) ?? []), ...image.warnings]);
        if (tests.length === 1 && hasInstrumentedHits({ image }) && result.status === 0 && !failures.some((failure) => failure.startsWith(`${id}:`)) && !image.warnings.length && !integrity.has(file)) {
          loadedBy.set(file, [...new Set([...(loadedBy.get(file) ?? []), tests[0]!])]);
        }
        if (role !== "aggregate") {
          if (hasInstrumentedHits({ image })) {
            const images = probeImages.get(runner) ?? new Map<string, CoverageImage>();
            const previous = images.get(file);
            if (!previous || imageScore(image) > imageScore(previous)) images.set(file, image);
            probeImages.set(runner, images);
          }
          continue;
        }
        const previous = coverage.get(file);
        // Do not union branch positions from different tsx scopes or Node/Istanbul runners.
        // Retain a whole image and expose all raw aggregate artifacts as alternatives in JSON.
        if (!previous || imageScore(image) > imageScore(previous)) { coverage.set(file, image); runners.set(file, runner); }
      }
    };
    if (!toolErrors.length && selectedTests.length) {
      for (const [runner, tests] of groups) {
        if (tests.length > 1 && files.length) {
          for (let index = 0; index < tests.length; index++) runOne(runner, [tests[index]!], `${runner}-probe-${String(index + 1).padStart(2, "0")}`, "provenance");
        }
        const probes = runs.filter((run) => run.runner === runner && run.role === "provenance");
        const observedMs = probes.reduce((sum, run) => sum + (run.durationMs ?? 0), 0);
        const budget = probes.length === tests.length && probes.every((run) => run.durationMs !== undefined)
          ? Math.max(600, Math.ceil(observedMs * 2 / 1000) + 60) : undefined;
        runOne(runner, tests, `${runner}-aggregate`, "aggregate", budget);
      }
    }
    // A killed aggregate must not turn surviving real hits into NOT LOADED zeroes.
    // Keep ONE probe image as explicitly incomplete diagnostics, never union its branch IDs.
    for (const [runner, images] of probeImages) {
      if (completeAggregates.has(runner)) continue;
      for (const [file, image] of images) {
        if (coverage.has(file)) continue;
        coverage.set(file, image); runners.set(file, `${runner} (partial singleton; aggregate incomplete)`); ranFiles.add(file);
        invalid.set(file, [...(invalid.get(file) ?? []), "Partial singleton image only: aggregate incomplete; remeasure before using coverage gaps"]);
      }
    }
    // Coverage against code that changed during the shared-tree run is not current evidence.
    const protectedFiles = new Map([...protectedSources, ...sources, ...selectedTestSources]);
    for (const [file, original] of protectedFiles) {
      if (!ports.isFile({ file: path.join(repo, file) }) || ports.readText({ file: path.join(repo, file) }) !== original) toolErrors.push(`Source/test changed during measurement: ${file}; rerun with a stable tree`);
    }
    for (const [file, original] of observedHashes) {
      if (protectedFiles.has(file)) continue;
      let changed = false;
      try { changed = !ports.isFile({ file: path.join(repo, file) }) || hash(ports.readText({ file: path.join(repo, file) })) !== original; }
      catch { changed = true; } // Another worker can remove the file between isFile and readText.
      if (changed) warnings.push(`Informational: file outside changed set and selected tests changed during measurement: ${file}`);
    }
  } catch (error) { toolErrors.push(error instanceof Error ? error.message : String(error)); }
  const noTestsReason = runs.some((run) => run.executedTests > 0) ? undefined : toolErrors.join("; ") || (selectedTests.length ? "selected runners reported no executed tests" : "no eligible tests selected");
  const rows = evaluateFiles({ files: rowFiles, coverage, sources, loadedBy, selectedFor, triage, runners, invalid, unloadedFunctions }, { ranFiles, deleted, missing });
  const exitCode = resultExitCode({ rows, testFailures: failures, toolErrors });
  const evidence = !noTestsReason && !failures.length && !toolErrors.length && rows.filter((row) => row.status !== "DELETED" && row.status !== "MISSING").every((row) => row.evidence);
  if (!evidence) for (const row of rows) {
    row.evidence = false;
    if (row.status === "MEASURED") row.triage = { label: "needs-run", reasons: ["measurement is not trustworthy; resolve failures and remeasure before triage"] };
  }
  const report = { version: 2, input, kind, directory, cap, totalCap, evidence, noTestsReason, exitCode, files, selectedTests, omittedTests, picks, excluded, warnings, failures, toolErrors, runs, rows, overall: summarizeFiles({ rows }), reuse: REUSE_NOTES };
  ports.writeText({ file: path.join(out, "report.json"), text: JSON.stringify(report, null, 2) + "\n" });
  ports.writeText({ file: path.join(out, "report.md"), text: renderMarkdown({ rows, input, selectedTests, omittedTests, failures, toolErrors, runs, excluded, noTestsReason, picks, warnings }) });
  ports.writeText({ file: path.join(out, "fix-prompt.md"), text: renderFixPrompt({ rows, rules, input, out, failures, toolErrors }) });
  ports.print({ text: `coverage-changed: exit ${exitCode}; ${path.join(out, "report.md")}\n` });
  return { exitCode, report };
}

function filesystemPorts(): CoveragePorts {
  return {
    readText: ({ file }) => readFileSync(file, "utf8"),
    isFile: ({ file }) => existsSync(file) && statSync(file).isFile(),
    writeText: ({ file, text }) => writeFileSync(file, text),
    makeDirectory: ({ directory }) => { mkdirSync(directory, { recursive: true }); },
    freshDirectory: ({ prefix }) => mkdtempSync(prefix),
    git: ({ args, cwd }) => {
      const result = spawnSync("git", [...args], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      if (result.error || result.signal || result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.error?.message ?? result.stderr ?? result.signal}`);
      return result.stdout;
    },
    run: ({ command }) => {
      // Keep the runner's own status, with direct file descriptors, never a tee/pipe's status.
      const descriptor = openSync(command.log, "w");
      try {
        const env = { ...process.env }; delete env.TOVU_ADMIN_PASSWORD; delete env.NODE_V8_COVERAGE; delete env.TSX_TSCONFIG_PATH;
        const result = spawnSync(command.executable, command.args, { cwd: command.cwd, env, stdio: ["ignore", descriptor, descriptor] });
        return { status: result.status, signal: result.signal, error: result.error?.message };
      } finally { closeSync(descriptor); }
    },
    print: ({ text }) => { process.stdout.write(text); },
  };
}

function main(): void {
  try {
    const options = parseCli({ args: process.argv.slice(2) });
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const out = options.out ? path.resolve(process.cwd(), options.out) : path.join(repo, "ADS-memory/.local-artifacts/coverage-changed");
    process.exitCode = runCoverageChanged({ repo, input: options.input, out, ports: filesystemPorts() }, { cap: options.cap, totalCap: options.totalCap }).exitCode;
  } catch (error) { process.stderr.write(`coverage-changed: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
