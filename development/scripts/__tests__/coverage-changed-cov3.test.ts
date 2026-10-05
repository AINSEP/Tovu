/** Owner cov3 dispatch: real trial2 fixtures + fake ports; coordinator owns execution. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildTestCommand, normalizeCoveragePath, runCoverageChanged, type CoveragePorts, type TestCommand } from "../coverage-changed.js";
import { mergeLcov, readNodeSummary } from "../coverage-changed-model.js";

const repo = "/repo";
const fixture = (name: string) => readFileSync(new URL(`./fixtures/coverage-changed-cov3/${name}`, import.meta.url), "utf8");
const capturedLcov = fixture("created-by.lcov"), capturedTap = fixture("created-by.tap"), timeoutTap = fixture("aggregate-timeout.tap");
const media = "apps/website/src/features/media/";
const source = `${media}duplicate-asset.ts`;
const sources = [...capturedLcov.matchAll(/^SF:(.+)$/gm)].map((match) => match[1]!);
const tests = [`${media}__tests__/created-by.test.ts`, `${media}__tests__/tool-registrations.test.ts`];
const unrelated = "apps/website/src/unrelated/value.ts", unrelatedTest = "apps/website/src/unrelated/__tests__/value.test.ts";

function harness({ timeout = false, durationMs }: { timeout?: boolean; durationMs?: number } = {}) {
  const storage = new Map<string, string>([
    ...sources.map((file): [string, string] => [path.join(repo, file), "export const value = 1;"]),
    ...tests.map((file): [string, string] => [path.join(repo, file), "import '../duplicate-asset.js';"]),
    [path.join(repo, unrelated), "export const value = 1;"],
    [path.join(repo, unrelatedTest), "import '../value.js';"],
    ["/repo/job.md", `CHANGED FILES:\n${sources.join("\n")}\nTESTS TO RUN:\n${tests.join("\n")}\n`],
    ["/repo/ADS-memory/.local-artifacts/test-slots/run-gated.sh", "gate"],
    ["/repo/ADS-memory/.local-artifacts/codex-waves/features-2026-10-04/common.md", "## Hard rules\nDo NOT run tests."],
  ]);
  const inventory = [...sources, ...tests, unrelated, unrelatedTest].join("\0") + "\0";
  const commands: TestCommand[] = [];
  const ports: CoveragePorts = {
    readText: ({ file }) => { assert.ok(storage.has(file), `missing fake file ${file}`); return storage.get(file)!; },
    isFile: ({ file }) => storage.has(file),
    writeText: ({ file, text }) => { storage.set(file, text); },
    makeDirectory: () => {}, freshDirectory: ({ prefix }) => `${prefix}fresh`,
    git: ({ args }) => args.includes("--others") ? "" : inventory,
    print: () => {},
    run: ({ command }) => {
      commands.push(command);
      const abort = timeout && command.lcov.includes("aggregate");
      storage.set(command.lcov, abort ? "" : capturedLcov);
      storage.set(command.log, abort ? timeoutTap : durationMs === undefined ? capturedTap : capturedTap.replace(/^# duration_ms [\d.]+$/m, `# duration_ms ${durationMs}`));
      return { status: abort ? 124 : 0, signal: null };
    },
  };
  const measure = () => runCoverageChanged({ repo, input: "job.md", out: "/out", ports });
  return { storage, commands, ports, measure };
}

test("cov3 real LCOV contains repo-relative changed-file hits; runner cwd and file URLs also normalize", () => {
  const images = mergeLcov({ text: capturedLcov, normalizePath: (file) => normalizeCoveragePath({ repo, cwd: repo, file }) });
  assert.equal(images.size, 5);
  for (const file of sources) assert.ok([...images.get(file)!.lines.values()].some((hit) => hit > 0), file);
  for (const file of [source, `/repo/${source}`, `file:///repo/${source}`]) {
    assert.equal(normalizeCoveragePath({ repo, cwd: repo, file }), source);
  }
  assert.equal(normalizeCoveragePath({ repo, cwd: "/repo/apps/website", file: "src/features/media/duplicate-asset.ts" }), source);
  assert.equal(normalizeCoveragePath({ repo, cwd: "/repo/apps/website", file: `file:///repo/${source}` }), source);
});

test("cov3 trial timeout preserves surviving singleton coverage instead of five false NOT LOADED zeroes", () => {
  const h = harness({ timeout: true }), result = h.measure();
  assert.equal(result.exitCode, 2);
  assert.equal(result.report.noTestsReason, undefined);
  assert.deepEqual(result.report.failures, []); // Timeout is tool failure, not an assertion failure.
  assert.equal(result.report.toolErrors.length, 1);
  assert.match(result.report.toolErrors[0]!, /gate timeout.*completed test points.*TAP\/coverage incomplete/);
  assert.ok(!result.report.toolErrors[0]!.includes("no executed tests"));
  assert.equal(result.report.runs.at(-1)!.executedTests, 241);
  assert.equal(result.report.rows.length, 5);
  for (const row of result.report.rows) {
    assert.equal(row.status, "MEASURED", row.file);
    assert.ok(row.line! > 0, row.file);
    assert.equal(row.evidence, false);
    assert.equal(row.triage.label, "needs-run");
    assert.match(row.runner, /partial singleton/);
    assert.ok(row.warnings.some((warning) => warning.includes("aggregate incomplete")));
  }
  assert.match(h.storage.get("/out/fix-prompt.md")!, /No trustworthy measured gaps/);
  assert.doesNotMatch(h.storage.get("/out/report.md")!, /no tests ran/);
});

test("cov3 aggregate timeout budget follows observed singleton durations", () => {
  const h = harness({ durationMs: 500_000 });
  h.measure();
  const aggregate = h.commands.at(-1)!;
  assert.equal(aggregate.args[aggregate.args.indexOf("--timeout") + 1], "2060");
  const fallback = buildTestCommand({ repo, runner: "node", tests, changed: sources, directory: "/out", id: "aggregate" });
  assert.equal(fallback.args[fallback.args.indexOf("--timeout") + 1], "1200");
  assert.throws(() => buildTestCommand({ repo, runner: "node", tests, changed: sources, directory: "/out", id: "aggregate" }, { timeoutSeconds: 0 }), /timeout/);
});

test("cov3 complete aggregate stays authoritative when probes have better percentages", () => {
  const h = harness(), originalRun = h.ports.run;
  h.ports.run = (required) => {
    const result = originalRun(required);
    if (required.command.lcov.includes("aggregate")) {
      h.storage.set(required.command.lcov, capturedLcov.replace(/SF:apps\/website\/src\/features\/media\/duplicate-asset\.ts\n[\s\S]*?end_of_record/, `SF:${source}\nFN:1,choose\nFNDA:1,choose\nFNF:1\nFNH:1\nDA:1,1\nDA:2,0\nLF:2\nLH:1\nend_of_record`));
    }
    return result;
  };
  const result = h.measure(), row = result.report.rows.find((row) => row.file === source)!;
  assert.equal(row.line, 50);
  assert.equal(row.runner, "node");
  assert.deepEqual(row.warnings, []);
  assert.equal(result.report.rows.find((entry) => entry.file.endsWith("/index.ts"))!.runner, "node");
});

test("cov3 a complete TAP summary with empty aggregate LCOV cannot erase singleton hits", () => {
  const h = harness(), originalRun = h.ports.run;
  h.ports.run = (required) => {
    const result = originalRun(required);
    if (required.command.lcov.includes("aggregate")) h.storage.set(required.command.lcov, "");
    return result;
  };
  const result = h.measure();
  assert.equal(result.exitCode, 2);
  assert.ok(result.report.toolErrors.some((error) => error.includes("aggregate LCOV omitted sources with singleton hits")));
  assert.ok(result.report.rows.every((row) => row.status === "MEASURED" && !row.evidence));
});

test("cov3 unrelated concurrent removal between isFile and readText stays informational", () => {
  const h = harness(), originalRun = h.ports.run, originalRead = h.ports.readText;
  let measured = false;
  h.ports.run = (required) => { measured = true; return originalRun(required); };
  h.ports.readText = (required) => {
    if (measured && required.file === path.join(repo, unrelated)) throw new Error("ENOENT after isFile");
    return originalRead(required);
  };
  const result = h.measure();
  assert.deepEqual(result.report.toolErrors, []);
  assert.ok(result.report.warnings.some((warning) => warning.includes(unrelated)));
});

test("cov3 unselected source/test edits are informational and never invalidate coverage", () => {
  const h = harness(), originalRun = h.ports.run;
  h.ports.run = (required) => {
    const result = originalRun(required);
    h.storage.set(path.join(repo, unrelated), "export const value = 2;");
    h.storage.delete(path.join(repo, unrelatedTest));
    return result;
  };
  const result = h.measure();
  assert.ok(!result.report.selectedTests.includes(unrelatedTest));
  assert.deepEqual(result.report.toolErrors, []);
  assert.equal(result.report.evidence, true);
  assert.equal(result.report.warnings.filter((warning) => warning.startsWith("Informational:")).length, 2);
});

test("cov3 changed sources and selected tests still invalidate measurement", () => {
  for (const file of [source, tests[0]!]) {
    const h = harness(), originalRun = h.ports.run;
    h.ports.run = (required) => {
      const result = originalRun(required);
      h.storage.set(path.join(repo, file), "export const value = 2;");
      return result;
    };
    const result = h.measure();
    assert.equal(result.exitCode, 2);
    assert.ok(result.report.toolErrors.some((error) => error.includes(`Source/test changed during measurement: ${file}`)));
  }
});

test("cov3 changed test outside selection remains in the drift guard", () => {
  const h = harness(), originalRun = h.ports.run;
  h.storage.set("/repo/job.md", h.storage.get("/repo/job.md")!.replace("CHANGED FILES:\n", `CHANGED FILES:\n${unrelatedTest}\n`));
  h.ports.run = (required) => {
    const result = originalRun(required);
    h.storage.delete(path.join(repo, unrelatedTest));
    return result;
  };
  const result = h.measure();
  assert.ok(!result.report.selectedTests.includes(unrelatedTest));
  assert.equal(result.exitCode, 2);
  assert.ok(result.report.toolErrors.some((error) => error.includes(unrelatedTest)));
});

test("cov3 real completed probe and aborted aggregate produce distinct summaries", () => {
  const probe = readNodeSummary({ text: capturedTap }), aggregate = readNodeSummary({ text: timeoutTap });
  assert.equal(probe.complete, true);
  assert.equal(probe.executedTests, 8);
  assert.equal(aggregate.complete, false);
  assert.equal(aggregate.executedTests, 241);
  assert.equal(readNodeSummary({ text: "ok 1 - skipped # SKIP\nok 2 - todo # TODO\n" }).executedTests, 0);
});

test("cov3 real assertion failure is reported by test name and distinguished from tool timeout", () => {
  const h = harness(), originalRun = h.ports.run, log = fixture("install-failure.tap");
  h.ports.run = (required) => {
    originalRun(required);
    h.storage.set(required.command.log, log);
    return { status: 1, signal: null };
  };
  const result = h.measure();
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.report.toolErrors, []);
  assert.ok(result.report.failures.every((failure) => failure.includes("TAP 1 failed") && failure.includes("install -> parse mcp.json")));
  assert.ok(result.report.rows.every((row) => !row.evidence));
});

test("cov3 timeout without completed test points remains unrun", () => {
  const h = harness(), originalRun = h.ports.run;
  h.ports.run = (required) => {
    originalRun(required);
    h.storage.set(required.command.log, "run-gated: timeout after 600s, killed process group\nrc=124\n");
    h.storage.set(required.command.lcov, "");
    return { status: 124, signal: null };
  };
  const result = h.measure();
  assert.equal(result.exitCode, 2);
  assert.ok(result.report.noTestsReason);
  assert.ok(result.report.rows.every((row) => row.status === "NOT RUN" && row.line === null));
});
