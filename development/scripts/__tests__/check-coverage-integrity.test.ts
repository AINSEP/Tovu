import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  checkCoverageIntegrity,
  classifyBlock,
  isFirstPartySourcePath,
  parseLcovBlocks,
  type LcovBlock,
} from "../check-coverage-integrity.js";

/**
 * @file Direct coverage for `development/scripts/check-coverage-integrity.ts`.
 *
 * The real-data cases below (`corrupt-run3-*`, `clean-run{1,2,4,5,6}-*`, `warn-run5-embeds-marker`)
 * are the exact acceptance criterion from the 2026-08-21 dispatch: "must fail run 3 and pass the
 * other five." They are copied verbatim from real `npm run test:cov` lcov output, not invented --
 * see `check-coverage-integrity.ts`'s own header for why the two SIMPLER signals that were tried
 * first (bare wrapper-FN presence; bare DA distinct-value-count) both fail this same real dataset,
 * one with a 100% false-positive rate and the other with a ~30% false-positive rate. The remaining
 * cases (non-first-party skip, small-trivial-file floor) are hand-built because no real fixture for
 * them was available, but they exercise the same exported functions the real-data cases do.
 */

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures", "coverage-integrity");

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURES_DIR, name), "utf8");
}

// ---------------------------------------------------------------------------------------------
// Real-data acceptance criterion: fail run 3, pass runs 1/2/4/5/6.
// ---------------------------------------------------------------------------------------------

test("real fixture: run3's src/media/provider-credential-store.ts block FAILS with the exact expected reason", () => {
  const { failures, warnings, evaluated, skipped } = checkCoverageIntegrity(
    readFixture("corrupt-run3-provider-credential-store.lcov.info")
  );
  assert.equal(evaluated, 1);
  assert.equal(skipped, 0);
  assert.deepEqual(warnings, []);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].file, "src/media/provider-credential-store.ts");
  assert.equal(
    failures[0].reason,
    "every one of this block's 3 distinct DA hit-count value(s) [0, 32, 128] matches a CJS-wrapper " +
      "helper's own FNDA hit-count [32, 128] (or 0) -- the wrapper image has overwritten this file's " +
      "real coverage data"
  );
});

for (const run of [1, 2, 4, 5, 6]) {
  test(`real fixture: run${run}'s src/media/provider-credential-store.ts block passes clean (no failure, no warning)`, () => {
    const { failures, warnings, evaluated, skipped } = checkCoverageIntegrity(
      readFixture(`clean-run${run}-provider-credential-store.lcov.info`)
    );
    assert.equal(evaluated, 1);
    assert.equal(skipped, 0);
    assert.deepEqual(failures, []);
    assert.deepEqual(warnings, []);
  });
}

test("real fixture: run5's src/core/embeds/marker.ts block WARNS (partial match) but does not fail", () => {
  const { failures, warnings } = checkCoverageIntegrity(readFixture("warn-run5-embeds-marker.lcov.info"));
  assert.deepEqual(failures, []);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].file, "src/core/embeds/marker.ts");
  assert.equal(
    warnings[0].reason,
    "2 of this block's 4 distinct DA hit-count value(s) match a CJS-wrapper helper's own FNDA " +
      "hit-count (or 0) -- possible partial dual-instantiation contamination, not conclusive"
  );
});

// ---------------------------------------------------------------------------------------------
// Non-first-party paths are skipped, not evaluated.
// ---------------------------------------------------------------------------------------------

test("classifyBlock: a node_modules path is skipped with the exact expected reason, regardless of content", () => {
  const block: LcovBlock = {
    file: "node_modules/esbuild/lib/main.js",
    fnda: [
      { name: "__export", hits: 128 },
      { name: "__copyProps", hits: 128 },
      { name: "__toCommonJS", hits: 32 },
    ],
    da: Array.from({ length: 100 }, () => 32),
  };
  const verdict = classifyBlock(block);
  assert.equal(verdict.status, "skip");
  assert.equal(verdict.file, "node_modules/esbuild/lib/main.js");
  assert.equal(verdict.reason, "not a first-party src/**, packages/*/src/**, or apps/*/src/** path");
});

test("classifyBlock: apps/admin/dist (build output, not apps/*/src/) is skipped -- the glob is src only", () => {
  const block: LcovBlock = { file: "apps/admin/dist/index.js", fnda: [], da: [] };
  assert.equal(classifyBlock(block).status, "skip");
});

test("isFirstPartySourcePath: true for src/**, packages/*/src/**, apps/*/src/**", () => {
  assert.equal(isFirstPartySourcePath("src/media/provider-credential-store.ts"), true);
  assert.equal(isFirstPartySourcePath("packages/jini-admin/src/index.ts"), true);
  assert.equal(isFirstPartySourcePath("apps/admin/src/main.tsx"), true);
});

test("isFirstPartySourcePath: false for node_modules, dist output, and development/ tooling", () => {
  assert.equal(isFirstPartySourcePath("node_modules/esbuild/lib/main.js"), false);
  assert.equal(isFirstPartySourcePath("apps/admin/dist/index.js"), false);
  assert.equal(isFirstPartySourcePath("development/scripts/check-architecture.ts"), false);
  assert.equal(isFirstPartySourcePath("packages/jini-admin/dist/index.js"), false);
});

// ---------------------------------------------------------------------------------------------
// The secondary (warn) heuristic must not trip on a small/trivial file, even one that would
// coincidentally full-subset-match if the line-count floor did not exist.
// ---------------------------------------------------------------------------------------------

test("classifyBlock: a small trivial file below the DA-record floor is OK even though its hit-counts coincidentally match the wrapper's own", () => {
  // 5 DA records, every one of them 32 -- which is also __toCommonJS's own FNDA hit-count below.
  // Without the MIN_DA_RECORDS_FOR_HEURISTIC floor this would satisfy the full-subset FAIL rule; the
  // floor exists specifically so a handful of coincidentally-matching lines in a trivial file (e.g. a
  // 5-line re-export module, uniformly loaded 32 times) is never read as corruption.
  const block: LcovBlock = {
    file: "src/tiny/reexport.ts",
    fnda: [{ name: "__toCommonJS", hits: 32 }],
    da: [32, 32, 32, 32, 32],
  };
  const verdict = classifyBlock(block);
  assert.equal(verdict.status, "ok");
  assert.equal(verdict.reason, "only 5 DA record(s) -- below the 30-record floor for this heuristic");
});

test("classifyBlock: an all-zero block (untested file, not corruption) is OK even above the floor", () => {
  const block: LcovBlock = {
    file: "src/tiny/untested.ts",
    fnda: [{ name: "__toCommonJS", hits: 32 }],
    da: Array.from({ length: 40 }, () => 0),
  };
  const verdict = classifyBlock(block);
  assert.equal(verdict.status, "ok");
});

test("classifyBlock: a block above the floor with no wrapper FNDA records at all is OK -- nothing to compare against", () => {
  const block: LcovBlock = {
    file: "src/plain/no-wrapper.ts",
    fnda: [{ name: "someRealFunction", hits: 4 }],
    da: Array.from({ length: 40 }, (_, i) => i % 5),
  };
  const verdict = classifyBlock(block);
  assert.equal(verdict.status, "ok");
  assert.equal(verdict.reason, "no esbuild CJS-wrapper FNDA records in this block -- nothing to compare against");
});

test("classifyBlock: a large, healthily diverse block with wrapper FNDA records present is OK, not a false positive", () => {
  // Mirrors the real db/schema.ts false-positive risk documented in check-coverage-integrity.ts's
  // header: wrapper helpers ARE present (as they are for every first-party file in this repo), but
  // the file's own DA values (1..40, cycling) share nothing with the wrapper's hit-counts (128, 500),
  // so neither the fail nor warn rule should fire.
  const block: LcovBlock = {
    file: "src/plain/healthy.ts",
    fnda: [
      { name: "__export", hits: 128 },
      { name: "__toCommonJS", hits: 500 },
    ],
    da: Array.from({ length: 200 }, (_, i) => (i % 40) + 1),
  };
  const verdict = classifyBlock(block);
  assert.equal(verdict.status, "ok");
});

// ---------------------------------------------------------------------------------------------
// parseLcovBlocks: basic structural parsing.
// ---------------------------------------------------------------------------------------------

test("parseLcovBlocks: extracts SF path, FNDA name/hits pairs, and DA hit-counts (line numbers discarded) from one block", () => {
  const lcov = [
    "SF:src/example.ts",
    "FN:1,foo",
    "FN:8,__export",
    "FNDA:5,foo",
    "FNDA:128,__export",
    "DA:1,5",
    "DA:2,5",
    "DA:8,128",
    "end_of_record",
    "",
  ].join("\n");
  const blocks = parseLcovBlocks(lcov);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].file, "src/example.ts");
  assert.deepEqual(blocks[0].fnda, [
    { name: "foo", hits: 5 },
    { name: "__export", hits: 128 },
  ]);
  assert.deepEqual(blocks[0].da, [5, 5, 128]);
});

test("parseLcovBlocks: parses multiple SF blocks in one lcov file independently", () => {
  const lcov = [
    "SF:src/a.ts",
    "DA:1,1",
    "end_of_record",
    "SF:src/b.ts",
    "DA:1,2",
    "end_of_record",
    "",
  ].join("\n");
  const blocks = parseLcovBlocks(lcov);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].file, "src/a.ts");
  assert.equal(blocks[1].file, "src/b.ts");
});

test("parseLcovBlocks: text with no SF: line produces no block, rather than throwing", () => {
  assert.deepEqual(parseLcovBlocks("not an lcov file\njust text\n"), []);
});

// ---------------------------------------------------------------------------------------------
// checkCoverageIntegrity: aggregate counts.
// ---------------------------------------------------------------------------------------------

test("checkCoverageIntegrity: evaluated/skipped counts split first-party from non-first-party blocks", () => {
  const lcov = [
    "SF:src/a.ts",
    ...Array.from({ length: 40 }, (_, i) => `DA:${i + 1},${i % 5}`),
    "end_of_record",
    "SF:node_modules/lib/x.js",
    "DA:1,9",
    "end_of_record",
    "",
  ].join("\n");
  const report = checkCoverageIntegrity(lcov);
  assert.equal(report.evaluated, 1);
  assert.equal(report.skipped, 1);
  assert.deepEqual(report.failures, []);
});
