import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { parseArgs, rankHotspots } from "../report-churn-hotspots.js";

/**
 * @file Direct coverage for the pure half of `report-churn-hotspots.ts` — argument parsing and the
 * ranking/flagging logic. CLI fixtures supply strict process-boundary responses for ESLint and
 * git, exercising extraction, history counting and report assembly without running a real scan.
 *
 * Every fixture below uses REAL measured numbers from the 2026-08-20 repo-wide scan
 * (`ADS-memory/reports/2026-08-20-repo-wide-coverage-complexity-measurement.md` §6) rather than
 * invented ones, so the FLAT_WIRING case in particular is testing the actual shape that motivated
 * the flag — `src/server/app.ts` at cyclomatic 38 / cognitive 0 with churn 81, which outranks
 * genuinely tangled files on raw score while being one of the two files on the list least worth
 * refactoring.
 */

type ComplexityEntry = { cyclomatic: number; cognitive: number; violations: number };

function complexityMap(entries: Record<string, ComplexityEntry>): Map<string, ComplexityEntry> {
  return new Map(Object.entries(entries));
}

test("parseArgs defaults to a 6-month window, top 25, scope src, human output", () => {
  const opts = parseArgs([]);
  assert.equal(opts.months, 6);
  assert.equal(opts.top, 25);
  assert.equal(opts.scope, "src");
  assert.equal(opts.json, false);
});

test("parseArgs reads each flag", () => {
  const opts = parseArgs(["--months=12", "--top=5", "--scope=apps/admin/src", "--json"]);
  assert.equal(opts.months, 12);
  assert.equal(opts.top, 5);
  assert.equal(opts.scope, "apps/admin/src");
  assert.equal(opts.json, true);
});

test("parseArgs rejects a non-positive or non-numeric window with the offending value named", () => {
  assert.throws(() => parseArgs(["--months=0"]), {
    message: '--months must be a positive number, got "0"',
  });
  assert.throws(() => parseArgs(["--months=soon"]), {
    message: '--months must be a positive number, got "soon"',
  });
  assert.throws(() => parseArgs(["--top=-3"]), {
    message: '--top must be a positive number, got "-3"',
  });
  assert.throws(() => parseArgs(["--top=abc"]), { message: '--top must be a positive number, got "abc"' });
});

test("parseArgs accepts flags in different positions", () => {
  assert.deepEqual(parseArgs(["--json", "--scope=apps/admin/src", "--top=5", "--months=12"]), {
    months: 12, top: 5, scope: "apps/admin/src", json: true,
  });
});

test("score is churn times summed complexity, ranked descending", () => {
  const rows = rankHotspots(
    complexityMap({
      "src/server/http/site/render.ts": { cyclomatic: 76, cognitive: 64, violations: 12 },
      "src/features/theme/theme.ts": { cyclomatic: 56, cognitive: 76, violations: 10 },
      "src/features/post/post.ts": { cyclomatic: 17, cognitive: 15, violations: 2 },
    }),
    new Map([
      ["src/server/http/site/render.ts", 48],
      ["src/features/theme/theme.ts", 30],
      ["src/features/post/post.ts", 16],
    ])
  );

  assert.deepEqual(
    rows.map((r) => [r.file, r.score]),
    [
      ["src/server/http/site/render.ts", 6720],
      ["src/features/theme/theme.ts", 3960],
      ["src/features/post/post.ts", 512],
    ]
  );
});

test("FLAT_WIRING flags cognitive 0 alongside a cyclomatic violation — the composition-root shape", () => {
  const rows = rankHotspots(
    complexityMap({
      "src/server/app.ts": { cyclomatic: 38, cognitive: 0, violations: 1 },
      "src/server/deps.ts": { cyclomatic: 14, cognitive: 0, violations: 1 },
    }),
    new Map([
      ["src/server/app.ts", 81],
      ["src/server/deps.ts", 65],
    ])
  );

  assert.deepEqual(rows.map((r) => r.flags), [["FLAT_WIRING"], ["FLAT_WIRING"]]);
  // The whole point of the flag: app.ts scores 3078, above genuinely-tangled files, purely on churn.
  assert.equal(rows[0].score, 3078);
});

test("FLAT_WIRING does NOT fire on a file reported only for cognitive complexity", () => {
  // `agent-daemon-server.ts` really measures cyclomatic 0 / cognitive 11 — no cyclomatic violation
  // at all. Flagging it flat would invert the meaning: it is pure nesting, the shape most worth
  // removing.
  const rows = rankHotspots(
    complexityMap({ "src/server/inbound/assistant/agent-daemon-server.ts": { cyclomatic: 0, cognitive: 11, violations: 1 } }),
    new Map([["src/server/inbound/assistant/agent-daemon-server.ts", 28]])
  );
  assert.deepEqual(rows[0].flags, []);
});

test("COLD flags a file with no commits in the window, and a missing churn entry counts as 0", () => {
  const rows = rankHotspots(
    complexityMap({
      "src/legacy/untouched.ts": { cyclomatic: 30, cognitive: 30, violations: 3 },
      "src/legacy/unknown-to-git.ts": { cyclomatic: 12, cognitive: 12, violations: 1 },
    }),
    new Map([["src/legacy/untouched.ts", 0]])
  );

  for (const row of rows) {
    assert.ok(row.flags.includes("COLD"), `${row.file} should be COLD`);
    assert.equal(row.score, 0);
  }
});

test("ties are broken deterministically by complexity then path, not by insertion order", () => {
  // Both score 100. Without the tiebreak these could emerge in either order run to run, which would
  // make the report's output churn against itself.
  const first = rankHotspots(
    complexityMap({
      "src/b.ts": { cyclomatic: 15, cognitive: 5, violations: 1 },
      "src/a.ts": { cyclomatic: 15, cognitive: 5, violations: 1 },
    }),
    new Map([
      ["src/b.ts", 5],
      ["src/a.ts", 5],
    ])
  );
  const second = rankHotspots(
    complexityMap({
      "src/a.ts": { cyclomatic: 15, cognitive: 5, violations: 1 },
      "src/b.ts": { cyclomatic: 15, cognitive: 5, violations: 1 },
    }),
    new Map([
      ["src/a.ts", 5],
      ["src/b.ts", 5],
    ])
  );

  assert.deepEqual(first.map((r) => r.file), ["src/a.ts", "src/b.ts"]);
  assert.deepEqual(second.map((r) => r.file), ["src/a.ts", "src/b.ts"]);
});

test("higher raw complexity wins a score tie before the path tiebreak applies", () => {
  const rows = rankHotspots(
    complexityMap({
      "src/aaa-low-complexity.ts": { cyclomatic: 10, cognitive: 10, violations: 1 },
      "src/zzz-high-complexity.ts": { cyclomatic: 20, cognitive: 20, violations: 1 },
    }),
    new Map([
      ["src/aaa-low-complexity.ts", 20],
      ["src/zzz-high-complexity.ts", 10],
    ])
  );

  assert.deepEqual(rows.map((r) => r.score), [400, 400]);
  assert.deepEqual(rows.map((r) => r.file), ["src/zzz-high-complexity.ts", "src/aaa-low-complexity.ts"]);
});

test("an empty scan produces an empty ranking rather than throwing", () => {
  assert.deepEqual(rankHotspots(new Map(), new Map()), []);
});

test("CLI extracts complexity maxima, excludes tests, counts history and reports tooling failures", (t) => {
  const repo = path.resolve(import.meta.dirname, "../../..");
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "churn-report-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const script = path.join(root, "development/scripts/report-churn-hotspots.ts");
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.copyFileSync(path.join(repo, "development/scripts/report-churn-hotspots.ts"), script);
  fs.writeFileSync(path.join(root, "package.json"), '{"type":"module"}');
  fs.symlinkSync(path.join(repo, "node_modules"), path.join(root, "node_modules"), "dir");
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "package.json"), '{"type":"commonjs"}');
  const message = (ruleId: string, text: string) => ({ ruleId, message: text });
  const results = [
    { filePath: path.join(root, "src/hot.ts"), messages: [message("complexity", "Function has a complexity of 12."), message("complexity", "Function has a complexity of 24."), message("sonarjs/cognitive-complexity", "Refactor to reduce its Cognitive Complexity from 17 to the 9 allowed."), message("unrelated-rule", "ignored")] },
    { filePath: path.join(root, "src/cold.ts"), messages: [message("complexity", "Function has a complexity of 10.")] },
    ...["src/__tests__/ignored.ts", "src/__measurements__/ignored.ts", "src/ignored.test.ts"].map((file) => ({ filePath: path.join(root, file), messages: [message("complexity", "Function has a complexity of 99.")] })),
    { filePath: path.join(root, "src/clean.ts"), messages: [message("unrelated-rule", "ignored")] },
  ];
  const expectedNpxArgs = ["eslint", "--no-error-on-unmatched-pattern", ...["**/*.js", "**/*.mjs", "**/*.cjs", "content/themes/**", "development/fixtures/theme-archive/**"].flatMap((pattern) => ["--ignore-pattern", pattern]), "--rule", JSON.stringify({ complexity: ["error", 9], "sonarjs/cognitive-complexity": ["error", 9] }), "-f", "json", "src"];
  const npx = `#!${process.execPath}\nconst assert = require("node:assert/strict"); assert.deepEqual(process.argv.slice(2), ${JSON.stringify(expectedNpxArgs)}); if (process.env.FIXTURE_TOOL_FAILURE === "yes") { console.error("fixture tooling failure"); process.exit(42); } console.log(${JSON.stringify(JSON.stringify(results))}); process.exit(1);\n`;
  const git = `#!${process.execPath}\nconst assert = require("node:assert/strict"); const args = process.argv.slice(2); assert.deepEqual(args.slice(0, 5), ["log", "--since=3 months ago", "--follow", "--format=%H", "--"]); assert.equal(args.length, 6); assert.ok(["src/hot.ts", "src/cold.ts"].includes(args[5]), "unexpected history query"); process.stdout.write(args[5] === "src/hot.ts" ? "commit-one\\ncommit-two\\n" : "");\n`;
  for (const [name, body] of [["npx", npx], ["git", git]]) fs.writeFileSync(path.join(bin, name), body, { mode: 0o755 });
  const run = (failure: boolean) => spawnSync(process.execPath, ["--import", "tsx", script, "--months=3", "--scope=src", "--json"], {
    cwd: root, encoding: "utf8", env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, FIXTURE_TOOL_FAILURE: failure ? "yes" : "no" },
  });
  const result = run(false);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "", "strict process fixtures must accept every invocation");
  assert.deepEqual(JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))), {
    months: 3, scope: "src", threshold: 9,
    hotspots: [
      { file: "src/hot.ts", cyclomatic: 24, cognitive: 17, violations: 3, churn: 2, score: 82, flags: [] },
      { file: "src/cold.ts", cyclomatic: 10, cognitive: 0, violations: 1, churn: 0, score: 0, flags: ["FLAT_WIRING", "COLD"] },
    ],
  });
  const failed = run(true);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /fixture tooling failure/);
  assert.doesNotMatch(failed.stdout, /"hotspots"/);
});
