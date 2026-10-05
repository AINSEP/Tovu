/** Owner spec cov1: process/filesystem ports test orchestration without running tests or git. */
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { buildTestCommand, collectChanged, parseCli, runCoverageChanged, type CoveragePorts } from "../coverage-changed.js";

const repo = "/repo", source = "apps/website/src/rules.ts", covering = "apps/website/src/__tests__/rules.test.ts";
const gate = "ADS-memory/.local-artifacts/test-slots/run-gated.sh";
const common = "ADS-memory/.local-artifacts/codex-waves/features-2026-10-04/common.md";
function harness(options: { red?: boolean; malformed?: boolean; missingSource?: boolean; contaminated?: boolean } = {}) {
  const storage = new Map<string, string>([
    [path.join(repo, source), "export function choose() { return 1; }"],
    [path.join(repo, covering), "import '../rules.js'; import 'node:test';"],
    [path.join(repo, gate), "gate"], [path.join(repo, common), "## Hard rules (owner)\n- Do NOT run tests.\n"],
  ]);
  if (options.missingSource) storage.delete(path.join(repo, source));
  let directory = 0;
  const commands: ReturnType<typeof buildTestCommand>[] = [];
  const gitCalls: string[][] = [];
  const printed: string[] = [];
  const ports: CoveragePorts = {
    readText: ({ file }) => { if (!storage.has(file)) throw new Error(`ENOENT ${file}`); return storage.get(file)!; },
    isFile: ({ file }) => storage.has(file),
    writeText: ({ file, text }) => { storage.set(file, text); },
    makeDirectory: () => {},
    freshDirectory: ({ prefix }) => `${prefix}${++directory}`,
    git: ({ args }) => { gitCalls.push([...args]); return args[0] === "diff" ? `M\0${source}\0` : args[0] === "ls-files" && args.includes("--others") ? "development/scripts/new.ts\0" : args[0] === "ls-files" ? [...storage.keys()].filter((file) => file.startsWith(`${repo}/`) && /\.[cm]?[jt]sx?$/.test(file)).map((file) => path.relative(repo, file)).join("\0") + "\0" : "sha\n"; },
    run: ({ command }) => {
      commands.push(command);
      const helper = options.contaminated ? "__export" : "choose";
      storage.set(command.lcov, options.malformed ? "SF:broken.ts\n" : `SF:${path.join(repo, source)}\nFN:1,${helper}\nFNDA:1,${helper}\nFNF:1\nFNH:1\nDA:1,1\nLF:1\nLH:1\nend_of_record\n`);
      storage.set(command.log, options.red ? "# tests 1\n# pass 0\n# fail 1\n" : "# tests 1\n# pass 1\n# fail 0\n");
      if (command.resultFile) storage.set(command.resultFile, JSON.stringify({ numTotalTests: 1, success: !options.red }));
      return { status: options.red ? 1 : 0, signal: null };
    },
    print: ({ text }) => { printed.push(text); },
  };
  return { storage, commands, ports, gitCalls, printed };
}

test("CLI enforces input, out and bounded cap with no ambiguous extras", () => {
  assert.deepEqual(parseCli({ args: ["HEAD~2", "--out", "out", "--max-tests", "3"] }), { input: "HEAD~2", out: "out", cap: 3 });
  assert.deepEqual(parseCli({ args: ["HEAD", "--max-tests", "2", "--max-total-tests", "5"] }), { input: "HEAD", cap: 2, totalCap: 5 });
  for (const args of [[], ["HEAD", "--out"], ["HEAD", "--max-tests", "0"], ["HEAD", "--max-total-tests", "0"], ["HEAD", "--max-total-tests", "2001"], ["HEAD", "--all"], ["--help"]]) assert.throws(() => parseCli({ args }));
});

test("git changed set uses NUL lists and combines ref diff and untracked paths", () => {
  const h = harness();
  const input = collectChanged({ repo, input: "HEAD", ports: h.ports });
  assert.deepEqual(input.paths, [source, "development/scripts/new.ts"]);
  assert.ok(h.gitCalls.some((args) => args[0] === "diff" && args.includes("--name-status") && args.includes("--no-renames") && args.includes("-z")));
  assert.ok(h.gitCalls.some((args) => args.includes("--others") && args.includes("--exclude-standard")));
});

test("job report supplies its own source set and tests, without adding unrelated working-tree changes", () => {
  const h = harness();
  h.storage.set("/repo/job.md", `TESTS TO RUN:\n${covering}\nCHANGED FILES:\n${source}\n`);
  const input = collectChanged({ repo, input: "job.md", ports: h.ports });
  assert.deepEqual(input.paths, [source]);
  assert.deepEqual(input.reportedTests, [covering]);
  assert.equal(h.gitCalls.length, 0);
});

test("every command is gated, exact-file scoped, password UNSET, and desktop runners match passes", () => {
  const make = (runner: "node" | "admin" | "desktop-node" | "desktop-tsx", tests: string[]) => buildTestCommand({ repo, runner, tests, changed: [source], directory: "/out/run", id: runner });
  const node = make("node", [covering]);
  assert.equal(node.executable, "env");
  assert.ok(node.args.includes("-u") && node.args.includes("TOVU_ADMIN_PASSWORD"));
  assert.ok(node.args.includes(path.join(repo, gate)));
  assert.ok(node.args.includes("--experimental-test-coverage"));
  assert.ok(node.args.includes("--test-concurrency=1"));
  assert.ok(node.args.some((arg) => arg.startsWith("TSX_TSCONFIG_PATH=")));
  assert.equal(node.args.at(-1), covering);
  assert.ok(make("admin", ["apps/admin/src/a.test.tsx"]).args.includes("src/a.test.tsx"));
  assert.ok(make("admin", ["apps/admin/src/a.test.tsx"]).configText!.includes('"include": [\n    "src/a.test.tsx"'));
  const desktop = make("desktop-node", ["apps/desktop/src/main.test.ts"]);
  assert.equal(desktop.cwd, "/repo/apps/desktop");
  assert.ok(!desktop.args.includes("tsx"));
  assert.ok(desktop.args.includes("--experimental-test-module-mocks"));
  assert.ok(make("desktop-tsx", ["apps/desktop/src/renderer/a.test.ts"]).args.includes("tsx"));
  assert.throws(() => make("node", []), /scoped|empty/);
  assert.throws(() => make("node", ["apps/website/src/**"]), /exact|test file/);
});

test("orchestrator uses only fresh artifacts and emits markdown, JSON and rules-appended prompt", () => {
  const h = harness();
  // Report isolates this test from the synthetic untracked path above.
  h.storage.set("/repo/job.md", `CHANGED FILES:\n${source}\nTESTS TO RUN:\n${covering}\n`);
  h.storage.set("/out/report.json", "STALE");
  const result = runCoverageChanged({ repo, input: "job.md", out: "/out", ports: h.ports });
  assert.equal(result.exitCode, 0);
  assert.equal(h.commands.length, 1); // Singleton aggregate doubles as provenance probe.
  assert.ok(h.commands[0]!.lcov.startsWith("/out/run-1/"));
  const json = JSON.parse(h.storage.get("/out/report.json")!);
  assert.equal(json.rows[0].line, 100);
  assert.deepEqual(json.rows[0].loadedBy, [covering]);
  assert.match(h.storage.get("/out/fix-prompt.md")!, /Do NOT run tests/);
  assert.match(h.storage.get("/out/report.md")!, /Open-source reuse/);
  assert.match(h.printed.join("\n"), /rules\.test\.ts — report TESTS TO RUN/);
  assert.match(h.storage.get("/out/report.md")!, /rules\.test\.ts — report TESTS TO RUN/);
});

test("red tests mark all coverage not evidence and exit 1; malformed/integrity failures exit 2", () => {
  for (const options of [{ red: true }, { malformed: true }, { contaminated: true }]) {
    const h = harness(options);
    h.storage.set("/repo/job.md", `CHANGED FILES:\n${source}\nTESTS TO RUN:\n${covering}\n`);
    const result = runCoverageChanged({ repo, input: "job.md", out: "/out", ports: h.ports });
    assert.equal(result.exitCode, options.red ? 1 : 2);
    assert.equal(JSON.parse(h.storage.get("/out/report.json")!).evidence, false);
    assert.match(h.storage.get("/out/report.md")!, /NOT EVIDENCE/);
    assert.notEqual(result.report.rows[0]!.triage.label, "refactor-candidate");
  }
});

test("cov2 failing executed coverage cannot recommend a static refactor", () => {
  const h = harness({ red: true });
  h.storage.set(path.join(repo, source), "export function choose() { fetch('/api'); return 1; }");
  h.storage.set("/repo/job.md", `CHANGED FILES:\n${source}\nTESTS TO RUN:\n${covering}\n`);
  const result = runCoverageChanged({ repo, input: "job.md", out: "/out", ports: h.ports });
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.rows[0]!.status, "MEASURED");
  assert.equal(result.report.rows[0]!.triage.label, "needs-run");
  assert.doesNotMatch(h.storage.get("/out/report.md")!, /refactor-candidate/);
  assert.doesNotMatch(h.storage.get("/out/fix-prompt.md")!, /Fix the measured gaps/);
});

test("cov2 unrun changed source is unknown without invoking an unscoped runner", () => {
  const h = harness();
  h.storage.set("/repo/job.md", "CHANGED FILES:\ndevelopment/scripts/no-test.ts\nTESTS TO RUN:\n");
  h.storage.set("/repo/development/scripts/no-test.ts", "export const untested = 1;");
  const result = runCoverageChanged({ repo, input: "job.md", out: "/out", ports: h.ports });
  assert.equal(result.exitCode, 1);
  assert.equal(h.commands.length, 0);
  const row = JSON.parse(h.storage.get("/out/report.json")!).rows[0];
  assert.equal(row.status, "NOT RUN");
  assert.equal(row.line, null);
  assert.match(h.storage.get("/out/report.md")!.split("\n")[0]!, /no tests ran: no eligible tests selected/);
  assert.equal(row.triage.label, "needs-run");
});

test("test-only reports still run the reported test without broadening the source coverage scope", () => {
  const h = harness({ red: true });
  h.storage.set("/repo/job.md", `CHANGED FILES:\n${covering}\nTESTS TO RUN:\n${covering}\n`);
  const result = runCoverageChanged({ repo, input: "job.md", out: "/out", ports: h.ports });
  assert.equal(result.report.rows.length, 0);
  assert.equal(h.commands.length, 1);
  assert.ok(h.commands[0]!.args.includes("--test-coverage-include=**/__no_changed_source_files__/**"));
  assert.equal(result.exitCode, 1);
});

test("admin orchestration writes an exact whitelist config and rejects mocked-only module coverage", () => {
  const h = harness();
  const adminSource = "apps/admin/src/lib/client.ts", adminTest = "apps/admin/src/lib/__tests__/client.test.ts";
  h.storage.set(path.join(repo, adminSource), "export function request() { return fetch('/api'); }");
  h.storage.set(path.join(repo, adminTest), "import '../client.js'; vi.mock('../client.js');");
  h.storage.set("/repo/job.md", `CHANGED FILES:\n${adminSource}\nTESTS TO RUN:\n${adminTest}\n`);
  const fakeRun = h.ports.run;
  h.ports.run = (required) => {
    const result = fakeRun(required);
    h.storage.set(required.command.lcov, `SF:src/lib/client.ts\nFN:1,request\nFNDA:0,request\nFNF:1\nFNH:0\nDA:1,0\nLF:1\nLH:0\nend_of_record\n`);
    return result;
  };
  const result = runCoverageChanged({ repo, input: "job.md", out: "/out", ports: h.ports });
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.rows[0]!.status, "NOT LOADED");
  assert.deepEqual(result.report.rows[0]!.loadedBy, []);
  const command = h.commands[0]!;
  assert.equal(command.cwd, "/repo/apps/admin");
  assert.ok(h.storage.has(command.configFile!));
  assert.match(h.storage.get(command.configFile!)!, /reportOnFailure/);
});

test("multiple tests get singleton provenance and one authoritative aggregate, never a branch union across probes", () => {
  const h = harness();
  const second = "apps/website/src/__tests__/other.test.ts";
  h.storage.set(path.join(repo, second), "import '../rules.js'; import 'node:test';");
  h.storage.set("/repo/job.md", `CHANGED FILES:\n${source}\nTESTS TO RUN:\n${covering}\n${second}\n`);
  const nativeFake = h.ports.run;
  let active = 0;
  h.ports.run = (required) => {
    assert.equal(active++, 0);
    const result = nativeFake(required);
    if (required.command.lcov.includes("probe")) {
      const text = h.storage.get(required.command.lcov)!;
      const position = required.command.lcov.includes("01") ? "3,4" : "9,7";
      h.storage.set(required.command.lcov, text.replace("end_of_record", `BRDA:${position},0,1\nBRDA:${position},1,0\nBRF:2\nBRH:1\nend_of_record`));
    }
    active--;
    return result;
  };
  const result = runCoverageChanged({ repo, input: "job.md", out: "/out", ports: h.ports });
  assert.equal(result.exitCode, 0);
  assert.equal(h.commands.length, 3);
  assert.deepEqual(result.report.rows[0]!.loadedBy, [second, covering].sort());
  assert.equal(result.report.rows[0]!.line, 100); // Aggregate result wins, not probe results.
  assert.equal(result.report.rows[0]!.branch, 100);
  assert.deepEqual(result.report.runs.map((run) => run.role), ["provenance", "provenance", "aggregate"]);
});

test("source changes and zero executed tests produce reviewable tool-error reports", () => {
  for (const mode of ["change", "zero"] as const) {
    const h = harness();
    h.storage.set("/repo/job.md", `CHANGED FILES:\n${source}\nTESTS TO RUN:\n${covering}\n`);
    const fakeRun = h.ports.run;
    h.ports.run = (required) => {
      const result = fakeRun(required);
      if (mode === "change") h.storage.set(path.join(repo, source), "export const changed = true;");
      if (mode === "zero") h.storage.set(required.command.log, "# tests 0\n# pass 0\n# fail 0\n");
      return result;
    };
    const result = runCoverageChanged({ repo, input: "job.md", out: "/out", ports: h.ports });
    assert.equal(result.exitCode, 2);
    assert.equal(result.report.rows.length, 1);
    assert.equal(result.report.evidence, false);
    assert.ok(h.storage.has("/out/fix-prompt.md"));
    if (mode === "zero") {
      assert.equal(result.report.rows[0]!.status, "NOT RUN");
      assert.equal(result.report.rows[0]!.line, null);
      assert.match(h.storage.get("/out/report.md")!.split("\n")[0]!, /no tests ran:.*no executed tests/);
    }
  }
});

test("cov2 report deletion and missing non-deleted warning do not block remaining measurement", () => {
  for (const marker of [" (deleted)", ""] as const) {
    const h = harness();
    const absent = "apps/website/src/features/media/created-by.ts";
    h.storage.set("/repo/job.md", `CHANGED FILES:\n${source}\n${absent}${marker}\nTESTS TO RUN:\n${covering}\n`);
    const result = runCoverageChanged({ repo, input: "job.md", out: "/out", ports: h.ports });
    assert.equal(result.exitCode, 0);
    assert.equal(h.commands.length, 1);
    assert.deepEqual(result.report.toolErrors, []);
    assert.deepEqual(result.report.files, [source]);
    assert.equal(result.report.overall.fileCount, 1);
    const row = result.report.rows.find((row) => row.file === absent)!;
    assert.equal(row.status, marker ? "DELETED" : "MISSING");
    assert.equal(row.line, null);
    assert.equal(row.triage.label, "not-measured");
    assert.equal(row.warnings.length, marker ? 0 : 1);
    assert.equal(result.report.rows.find((row) => row.file === source)!.line, 100);
    assert.ok(!h.commands[0]!.args.some((arg) => arg.includes(`include=${absent}`)));
  }
});

test("cov2 git D status is preserved; a missing M path is a warning rather than inferred deletion", () => {
  const h = harness(), deleted = "apps/website/src/deleted.ts", missing = "apps/website/src/missing.ts";
  const originalGit = h.ports.git;
  h.ports.git = (required) => required.args[0] === "diff" ? `D\0${deleted}\0M\0${missing}\0M\0${source}\0` : originalGit(required);
  assert.deepEqual(collectChanged({ repo, input: "HEAD", ports: h.ports }).deleted, [deleted]);
  const result = runCoverageChanged({ repo, input: "HEAD", out: "/out", ports: h.ports });
  assert.equal(result.exitCode, 0);
  assert.equal(result.report.rows.find((row) => row.file === deleted)!.status, "DELETED");
  assert.equal(result.report.rows.find((row) => row.file === missing)!.status, "MISSING");
  assert.equal(h.commands.length, 1);
});

test("cov2 existing ignored reported tests cannot be injected into the git inventory", () => {
  const h = harness(), ignored = "apps/website/src/ignored.test.ts";
  h.storage.set(path.join(repo, ignored), "import './rules.js';");
  h.storage.set("/repo/job.md", `CHANGED FILES:\n${source}\nTESTS TO RUN:\n${ignored}\n`);
  const originalGit = h.ports.git;
  h.ports.git = (required) => originalGit(required).replace(`${ignored}\0`, "");
  const result = runCoverageChanged({ repo, input: "job.md", out: "/out", ports: h.ports });
  assert.ok(!result.report.selectedTests.includes(ignored));
  assert.equal(h.commands.length, 0);
  assert.equal(result.report.rows[0]!.status, "NOT RUN");
  assert.equal(result.report.rows[0]!.line, null);
  assert.equal(result.report.rows[0]!.triage.label, "needs-run");
  assert.match(h.storage.get("/out/report.md")!.split("\n")[0]!, /no tests ran:.*git inventory/);
  assert.match(h.storage.get("/out/report.md")!, /report|own directory/);
});

test("a gate exit 0 cannot conceal a failed TAP summary", () => {
  const h = harness();
  h.storage.set("/repo/job.md", `CHANGED FILES:\n${source}\nTESTS TO RUN:\n${covering}\n`);
  const fakeRun = h.ports.run;
  h.ports.run = (required) => {
    const result = fakeRun(required);
    h.storage.set(required.command.log, "# tests 1\n# pass 0\n# fail 1\n");
    return result;
  };
  const result = runCoverageChanged({ repo, input: "job.md", out: "/out", ports: h.ports });
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.evidence, false);
  assert.deepEqual(result.report.rows[0]!.loadedBy, []);
});
