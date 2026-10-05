/** Owner spec: 2026-10-04 cov1; pure contract tests, no runners spawned. */
import assert from "node:assert/strict";
import test from "node:test";
import {
  changedSourceSet, parseJobReport, mergeLcov, evaluateFiles, classifyGap,
  renderFixPrompt, renderMarkdown, summarizeFiles, resultExitCode,
} from "../coverage-changed-model.js";

const file = "apps/website/src/sample.ts";
const source = "export function choose(value: boolean) {\n  if (value) return 1;\n  return 2;\n}\n";
function lcov(hit: number, alternate = false): string {
  return `SF:${file}\nFN:1,choose\nFNDA:${hit},choose\nFNF:1\nFNH:${hit ? 1 : 0}\nDA:1,1\nDA:2,${alternate ? 0 : hit}\nDA:3,${alternate ? hit : 0}\nLF:3\nLH:${hit ? 2 : 1}\nBRDA:2,0,0,${alternate ? 0 : hit}\nBRDA:2,0,1,${alternate ? hit : 0}\nBRF:2\nBRH:${hit ? 1 : 0}\nend_of_record\n`;
}

test("report blocks accept fences, links, anchors and bullets but stop at the next heading", () => {
  const result = parseJobReport({ text: `Cov1(Execution):\nTESTS TO RUN:\n\`\`\`\napps/admin/src/x.test.tsx\n\`\`\`\nCHANGED FILES:\n- [sample](${file}:12)\n- \`development/scripts/util.mjs\`\n- ${file}\nSTAGED:\napps/website/src/unrelated.ts\n` });
  assert.deepEqual(result.changed, [file, "development/scripts/util.mjs"]);
  assert.deepEqual(result.tests, ["apps/admin/src/x.test.tsx"]);
  assert.throws(() => parseJobReport({ text: "No CHANGED FILES block" }), /CHANGED FILES/);
  assert.deepEqual(parseJobReport({ text: "CHANGED FILES:\n(none)\nTESTS TO RUN:\n" }).changed, []);
  assert.deepEqual(parseJobReport({ text: `CHANGED FILES:\n[file.ts](${file}:12)\nTESTS TO RUN:\n[test.ts](development/scripts/__tests__/x.test.ts:8)\n` }).tests, ["development/scripts/__tests__/x.test.ts"]);
});

test("git denominator includes untracked source and excludes fixtures/generated/tests/declarations", () => {
  const result = changedSourceSet({ paths: [file, "development/scripts/new.ts", "apps/admin/src/x.test.tsx", "apps/website/src/__tests__/fixture.ts", "apps/website/src/fixtures/x.ts", "apps/desktop/dist/main.js", "apps/website/src/generated/x.ts", "development/e2e/page.spec.ts", "apps/admin/src/x.d.ts", "README.md", file] });
  assert.deepEqual(result.files, [file, "development/scripts/new.ts"]);
  assert.equal(result.excluded.length, 8);
  assert.throws(() => changedSourceSet({ paths: ["apps/../../outside.ts"] }), /outside|escape/);
});

test("cov2 report preserves deletion markers after bullets, code paths and file links", () => {
  const deleted = "apps/website/src/features/media/created-by.ts";
  const result = parseJobReport({ text: `CHANGED FILES:\n- ${deleted} (deleted)\n- [sample](${file}:12) (deleted)\n- development/scripts/kept.ts\nTESTS TO RUN:\n` });
  assert.deepEqual(result.deleted, [deleted, file]);
  assert.deepEqual(result.changed, [deleted, file, "development/scripts/kept.ts"]);
});

test("cov2 zero runs and skipped source rows have unknown metrics and no gap/refactor claims", () => {
  const deleted = "apps/website/src/deleted.ts", missing = "apps/website/src/missing.ts";
  const rows = evaluateFiles({ files: [file, deleted, missing], coverage: new Map(), sources: new Map([[file, source]]), triage: new Map([[file, classifyGap({ complexity: 99 })]]) }, { ranFiles: new Set(), deleted: new Set([deleted]), missing: new Set([missing]) });
  assert.deepEqual(rows.map((row) => row.status).sort(), ["DELETED", "MISSING", "NOT RUN"]);
  for (const row of rows) {
    assert.equal(row.line, null);
    assert.equal(row.distance.line, null);
    assert.deepEqual(row.uncoveredFunctions, []);
    assert.deepEqual(row.uncoveredLines, []);
    assert.notEqual(row.triage.label, "refactor-candidate");
    assert.equal(row.evidence, false);
  }
  const markdown = renderMarkdown({ rows, input: "job.md", selectedTests: [], omittedTests: [], failures: [], toolErrors: [], runs: [], noTestsReason: "no eligible tests selected" });
  assert.match(markdown.split("\n")[0]!, /no tests ran: no eligible tests selected/);
  assert.match(markdown, /deleted — not measured/);
  assert.match(markdown, /WARNING.*missing/);
  assert.doesNotMatch(markdown, /0\.00|refactor-candidate|valid for this exact/);
  assert.equal(summarizeFiles({ rows }).fileCount, 1);
  assert.equal(summarizeFiles({ rows }).mean.line, null);
  assert.equal(resultExitCode({ rows: rows.filter((row) => row.status !== "NOT RUN") }), 0);
  const prompt = renderFixPrompt({ rows, rules: "owner rules", input: "job.md", out: "/out" });
  assert.match(prompt, /remeasure/i);
  assert.doesNotMatch(prompt, /refactor-candidate|line 0\.00/);
});

test("cov2 unloaded rows cannot inherit a refactor diagnosis from static complexity", () => {
  const row = evaluateFiles({ files: [file], coverage: new Map(), triage: new Map([[file, classifyGap({ complexity: 99 })]]) })[0]!;
  assert.equal(row.status, "NOT LOADED");
  assert.equal(row.triage.label, "needs-test");
});

test("duplicate SF records union hit identities instead of summing their denominators", () => {
  const coverage = mergeLcov({ text: lcov(1) + lcov(1, true), normalizePath: (p) => p });
  const rows = evaluateFiles({ files: [file], coverage, sources: new Map([[file, source]]) });
  assert.equal(rows[0]!.line, 100);
  assert.equal(rows[0]!.branch, 100);
  assert.equal(rows[0]!.funcs, 100);
  assert.equal(rows[0]!.counters!.lf, 3);
  assert.deepEqual(rows[0]!.uncoveredLines, []);
});

test("no LCOV record stays 0% NOT LOADED; loaded no-branch/no-function files are 100% on empty axes", () => {
  const rows = evaluateFiles({ files: [file, "development/scripts/missing.ts"], coverage: mergeLcov({ text: lcov(1), normalizePath: (p) => p }), sources: new Map([[file, source], ["development/scripts/missing.ts", "export const x = 1;"]]) });
  assert.equal(rows[0]!.file, "development/scripts/missing.ts");
  assert.equal(rows[0]!.status, "NOT LOADED");
  assert.deepEqual([rows[0]!.line, rows[0]!.branch, rows[0]!.funcs], [0, 0, 0]);
  assert.equal(rows[0]!.counters, null);
  const summary = summarizeFiles({ rows });
  assert.equal(summary.fileCount, 2);
  assert.equal(summary.notLoaded, 1);
  assert.equal(summary.mean.line, 100 / 3);
  const leaf = mergeLcov({ text: `SF:${file}\nDA:1,1\nLF:1\nLH:1\nend_of_record\n`, normalizePath: (p) => p });
  assert.equal(resultExitCode({ rows: evaluateFiles({ files: [file], coverage: leaf }) }), 0);
  const noRecord = evaluateFiles({ files: [file], coverage: new Map(), unloadedFunctions: new Map([[file, ["declared", "arrow"]]]) })[0]!;
  assert.deepEqual(noRecord.uncoveredFunctions.map((fn) => fn.name), ["declared", "arrow"]);
});

test("uncovered ranges and repeated anonymous functions keep distinct identities", () => {
  const text = `SF:${file}\nFN:1,(anonymous)\nFN:3,(anonymous)\nFNDA:1,(anonymous)\nFNDA:0,(anonymous)\nFNF:2\nFNH:1\nDA:1,1\nDA:2,0\nDA:3,0\nDA:5,0\nLF:4\nLH:1\nend_of_record\n`;
  const row = evaluateFiles({ files: [file], coverage: mergeLcov({ text, normalizePath: (p) => p }) })[0]!;
  assert.deepEqual(row.uncoveredLines, ["2-3", "5"]);
  assert.deepEqual(row.uncoveredFunctions.map((f) => f.name), ["(anonymous)"]);
  assert.equal(row.funcs, 50);
  assert.equal(evaluateFiles({ files: [file], coverage: mergeLcov({ text: text.replace("FN:3", "FN:undefined"), normalizePath: (p) => p }) })[0]!.uncoveredFunctions[0]!.line, null);
});

test("Vitest zero-hit include records and mocked call sites do not claim actual loading", () => {
  const text = `SF:${file}\nFN:1,choose\nFNDA:0,choose\nFNF:1\nFNH:0\nDA:1,0\nLF:1\nLH:0\nBRDA:1,0,0,-\nBRF:1\nBRH:0\nend_of_record\n`;
  const row = evaluateFiles({ files: [file], coverage: mergeLcov({ text, normalizePath: (p) => p }), selectedFor: new Map([[file, ["mocking.test.ts"]]]) })[0]!;
  assert.equal(row.status, "NOT LOADED");
  assert.deepEqual(row.loadedBy, []);
  assert.equal(row.branch, 0);
  assert.equal(row.uncoveredFunctions[0]!.name, "choose");
});

test("incompatible branch images and truncated LCOV cannot manufacture green", () => {
  const coverage = mergeLcov({ text: lcov(1) + lcov(1, true).replaceAll("BRDA:2,0", "BRDA:9,7"), normalizePath: (p) => p });
  const rows = evaluateFiles({ files: [file], coverage });
  assert.equal(rows[0]!.evidence, false);
  assert.match(rows[0]!.warnings.join(" "), /incompatible.*branch/i);
  assert.equal(resultExitCode({ rows }), 2);
  assert.throws(() => mergeLcov({ text: lcov(1).replace("end_of_record", ""), normalizePath: (p) => p }), /truncated/);
  assert.throws(() => mergeLcov({ text: lcov(1).replace("LF:3", "LF:9"), normalizePath: (p) => p }), /LF/);
});

test("triage uses explicit evidence and never labels branch positions phantom", () => {
  assert.equal(classifyGap({ complexity: 10 }).label, "refactor-candidate");
  assert.equal(classifyGap({ runtimeReasons: ["direct Electron import"] }).label, "refactor-candidate");
  assert.equal(classifyGap({ mockCounts: [5, 6] }).label, "refactor-candidate");
  assert.equal(classifyGap({ mockCounts: [5, 0], complexity: 3 }).label, "needs-test");
  assert.equal(classifyGap({}).label, "needs-test");
});

test("prompt lists every gap, keeps code-only rules and treats failed runs as not evidence", () => {
  const rows = evaluateFiles({ files: [file, "development/scripts/missing.ts"], coverage: mergeLcov({ text: lcov(1), normalizePath: (p) => p }) });
  const prompt = renderFixPrompt({ rows, rules: "## Hard rules (owner)\n- Do NOT run tests.\n", input: "HEAD", out: "/tmp/cov1", failures: ["test failed"] });
  assert.match(prompt, /<<SUBAGENT_DISPATCH>>/);
  assert.match(prompt, /NOT LOADED/);
  assert.match(prompt, /needs-test/);
  assert.match(prompt, /not evidence/i);
  assert.match(prompt, /Do NOT run tests/);
  assert.match(prompt, /instrumented.*source/i);
  assert.match(prompt, /apps\/website\/src\/sample.ts/);
  assert.equal(resultExitCode({ rows, testFailures: ["red"] }), 1);
  assert.equal(resultExitCode({ rows, toolErrors: ["missing path"] }), 2);
  const markdown = renderMarkdown({ rows, input: "HEAD", selectedTests: [], omittedTests: [], failures: [], toolErrors: [], runs: [] });
  assert.match(markdown, /NOT RUN/);
  assert.doesNotMatch(markdown, /0\.00 \(100\.00\)/);
  assert.match(markdown, /Overall/);
});
