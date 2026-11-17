#!/usr/bin/env node
/**
 * Mutation proof runner for the publish-engine Phase 0 characterization tests (design section 6).
 *
 * For each row of the spec it replaces one exact piece of source text (the check being proven),
 * runs the named test files, records whether they went red, and restores the file byte for byte.
 * A row whose mutation leaves the tests green is reported as SURVIVED: that check has no test.
 *
 * Usage (from the repository root, dependencies installed):
 *   node cloud-results/publish-p0-mutation-proof.mjs cloud-results/publish-p0-mutations.json [id-prefix ...]
 *
 * The source tree is left exactly as it was found, also when a run is interrupted (SIGINT/SIGTERM).
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const [specPath, ...filters] = process.argv.slice(2);
if (!specPath) {
  console.error("usage: publish-p0-mutation-proof.mjs <spec.json> [id-prefix ...]");
  process.exit(2);
}
const rows = JSON.parse(readFileSync(specPath, "utf8")).filter(
  (row) => filters.length === 0 || filters.some((prefix) => row.id.startsWith(prefix))
);

const NODE_TEST_ARGS = [
  "--import", "tsx",
  "--import", "./development/test-support/composed-bundle-env.ts",
  "--test", "--experimental-test-module-mocks", "--test-concurrency=1",
];

let restore = () => {};
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    restore();
    process.exit(130);
  });
}

function runTests({ tests }) {
  const result = spawnSync(process.execPath, [...NODE_TEST_ARGS, ...tests], {
    encoding: "utf8",
    env: { ...process.env, TSX_TSCONFIG_PATH: "apps/site-chat/tsconfig.json" },
    maxBuffer: 256 * 1024 * 1024,
    timeout: 600_000,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const count = (label) => Number(new RegExp(`^ℹ ${label} (\\d+)`, "m").exec(output)?.[1] ?? "-1");
  const firstFailure = /^\s*✖ (.+?)(?: \(\d+(?:\.\d+)?ms\))?$/m.exec(output)?.[1] ?? "";
  return { status: result.status, pass: count("pass"), fail: count("fail"), firstFailure };
}

const results = [];
for (const row of rows) {
  const original = readFileSync(row.file, "utf8");
  const occurrences = original.split(row.find).length - 1;
  if (occurrences !== 1) {
    results.push({ ...row, verdict: `SPEC-ERROR (find text occurs ${occurrences} times)` });
    console.error(`${row.id}: find text occurs ${occurrences} times in ${row.file}`);
    continue;
  }
  restore = () => writeFileSync(row.file, original);
  writeFileSync(row.file, original.replace(row.find, row.replace));
  let outcome;
  try {
    outcome = runTests({ tests: row.tests });
  } finally {
    restore();
    restore = () => {};
  }
  const red = outcome.status !== 0 && outcome.fail > 0;
  const verdict = red ? "RED" : outcome.status !== 0 ? "ERROR (runner failed without a failing test)" : "SURVIVED";
  results.push({ ...row, verdict, ...outcome });
  console.error(`${row.id}: ${verdict} pass=${outcome.pass} fail=${outcome.fail} ${outcome.firstFailure}`);
}

console.log("| Row | Check removed or inverted | Test file(s) | Result | First failing test |");
console.log("|---|---|---|---|---|");
for (const row of results) {
  const tests = row.tests.map((test) => test.replace(/^apps\/website\/src\//, "")).join("<br>");
  console.log(`| ${row.id} | ${row.what} (\`${row.file.replace(/^apps\/website\/src\//, "")}\`) | ${tests} | ${row.verdict}${row.fail > 0 ? ` (${row.fail} failed, ${row.pass} passed)` : ""} | ${row.firstFailure ?? ""} |`);
}
process.exit(results.every((row) => row.verdict === "RED") ? 0 : 1);
