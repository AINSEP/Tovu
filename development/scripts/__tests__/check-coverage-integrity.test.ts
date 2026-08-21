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
 * The real-data cases below are the REVISED acceptance criterion from the 2026-08-21 dispatch, after
 * the team lead's correction: all six real runs (`clean-run{1,2,4,5,6}-*` and `corrupt-run3-*`) show
 * CONTAMINATED for `src/media/provider-credential-store.ts` -- per
 * `ADS-memory/reports/2026-08-21-coverage-dual-instantiation-root-cause.md` (rounds 7/9 for the true
 * clean baseline `FNF:20 FNH:20`, rounds 8/11/12 for the counterexample proving `LH:`/`LF:` alone
 * cannot detect this), every one of those fixtures actually reports `FNF:43 FNH:29` -- contaminated,
 * not clean, regardless of what its `LH:`/`LF:` say. Only run 3 is additionally SEVERE (the wrapper
 * image also won the DA line-hit merge). The fixture file NAMES still say "clean-run1" etc. -- kept
 * as-is because they are literally the same bytes originally copied from the team lead's `run1.lcov`
 * (real, not invented) and renaming them would misrepresent provenance; their CONTENT is what
 * changed meaning, not the files themselves. `warn-run5-embeds-marker` is a second real, DIFFERENT
 * file from the same run5 -- CONTAMINATED but not SEVERE, a genuine partial-match case found by
 * scanning the full real lcov corpus, not invented.
 */

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures", "coverage-integrity");

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURES_DIR, name), "utf8");
}

// ---------------------------------------------------------------------------------------------
// Real-data acceptance criterion: all 6 runs report CONTAMINATED; run 3 additionally SEVERE.
// ---------------------------------------------------------------------------------------------

test("real fixture: run3's src/media/provider-credential-store.ts block is CONTAMINATED and SEVERE, with the exact expected reason", () => {
  const { contaminated, evaluated, skipped } = checkCoverageIntegrity(
    readFixture("corrupt-run3-provider-credential-store.lcov.info")
  );
  assert.equal(evaluated, 1);
  assert.equal(skipped, 0);
  assert.equal(contaminated.length, 1);
  assert.equal(contaminated[0].file, "src/media/provider-credential-store.ts");
  assert.equal(contaminated[0].severe, true);
  assert.equal(
    contaminated[0].reason,
    "3 esbuild CJS-wrapper helper record(s) [__copyProps, __export, __toCommonJS] present in this " +
      "block's FNDA records -- two coverage images (real ESM + CJS wrapper) were merged here. FNF:43 " +
      "FNH:29 function coverage for this run is untrustworthy. SEVERE: additionally, every one of " +
      "this block's 3 distinct DA hit-count value(s) [0, 32, 128] matches a wrapper helper's own " +
      "FNDA hit-count [32, 128] (or 0) -- the wrapper image also won the line-hit merge, so line " +
      "coverage for this run is untrustworthy too, regardless of what LH:/LF: report"
  );
});

for (const run of [1, 2, 4, 5, 6]) {
  test(`real fixture: run${run}'s src/media/provider-credential-store.ts block is CONTAMINATED but NOT severe (FNF:43 FNH:29 despite LH:357 LF:357 looking clean)`, () => {
    const { contaminated, evaluated, skipped } = checkCoverageIntegrity(
      readFixture(`clean-run${run}-provider-credential-store.lcov.info`)
    );
    assert.equal(evaluated, 1);
    assert.equal(skipped, 0);
    assert.equal(contaminated.length, 1);
    assert.equal(contaminated[0].file, "src/media/provider-credential-store.ts");
    assert.equal(contaminated[0].severe, false);
    assert.equal(
      contaminated[0].reason,
      "3 esbuild CJS-wrapper helper record(s) [__copyProps, __export, __toCommonJS] present in this " +
        "block's FNDA records -- two coverage images (real ESM + CJS wrapper) were merged here. FNF:43 " +
        "FNH:29 function coverage for this run is untrustworthy."
    );
  });
}

test("real fixture: run5's src/core/embeds/marker.ts block is CONTAMINATED but not severe -- a different, real partial-match file", () => {
  const { contaminated } = checkCoverageIntegrity(readFixture("warn-run5-embeds-marker.lcov.info"));
  assert.equal(contaminated.length, 1);
  assert.equal(contaminated[0].file, "src/core/embeds/marker.ts");
  assert.equal(contaminated[0].severe, false);
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
  assert.equal(verdict.severe, false);
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
// CONTAMINATED has no size floor: wrapper-name presence alone is the whole signal, at any block
// size. Only the SEVERE escalation is floor-gated.
// ---------------------------------------------------------------------------------------------

test("classifyBlock: a tiny block with a wrapper FNDA record is CONTAMINATED even though it is far below the SEVERE floor", () => {
  const block: LcovBlock = {
    file: "src/tiny/reexport.ts",
    fnda: [{ name: "__toCommonJS", hits: 32 }],
    da: [32, 32, 32, 32, 32], // 5 DA records, well under MIN_DA_RECORDS_FOR_SEVERE_HEURISTIC
  };
  const verdict = classifyBlock(block);
  assert.equal(verdict.status, "contaminated");
  assert.equal(
    verdict.severe,
    false,
    "would satisfy the SEVERE full-subset condition if not for the floor -- must not escalate on 5 records"
  );
  assert.equal(
    verdict.reason,
    "1 esbuild CJS-wrapper helper record(s) [__toCommonJS] present in this block's FNDA records -- " +
      "two coverage images (real ESM + CJS wrapper) were merged here. function coverage for this run " +
      "is untrustworthy."
  );
});

test("classifyBlock: a block above the SEVERE floor with wrapper FNDA records but DA values unrelated to them is CONTAMINATED but not severe", () => {
  // Mirrors the real db/schema.ts false-positive risk documented in check-coverage-integrity.ts's
  // header for the REJECTED bare-threshold design: wrapper helpers ARE present (as they are for a
  // majority of first-party files in this repo right now), but the file's own DA values (1..40,
  // cycling) share nothing with the wrapper's hit-counts (128, 500), so SEVERE must not fire.
  const block: LcovBlock = {
    file: "src/plain/healthy.ts",
    fnda: [
      { name: "__export", hits: 128 },
      { name: "__toCommonJS", hits: 500 },
    ],
    da: Array.from({ length: 200 }, (_, i) => (i % 40) + 1),
  };
  const verdict = classifyBlock(block);
  assert.equal(verdict.status, "contaminated");
  assert.equal(verdict.severe, false);
});

test("classifyBlock: an all-zero DA block above the floor with wrapper records present is CONTAMINATED but not severe (untested, not proof of a DA merge)", () => {
  const block: LcovBlock = {
    file: "src/tiny/untested.ts",
    fnda: [{ name: "__toCommonJS", hits: 32 }],
    da: Array.from({ length: 40 }, () => 0),
  };
  const verdict = classifyBlock(block);
  assert.equal(verdict.status, "contaminated");
  assert.equal(verdict.severe, false);
});

test("classifyBlock: a block with no wrapper FNDA records at all is OK, regardless of size or DA shape", () => {
  const block: LcovBlock = {
    file: "src/plain/no-wrapper.ts",
    fnda: [{ name: "someRealFunction", hits: 4 }],
    da: Array.from({ length: 40 }, (_, i) => i % 5),
  };
  const verdict = classifyBlock(block);
  assert.equal(verdict.status, "ok");
  assert.equal(verdict.severe, false);
  assert.equal(verdict.reason, "no esbuild CJS-wrapper FNDA records in this block");
});

// ---------------------------------------------------------------------------------------------
// parseLcovBlocks: basic structural parsing, including the FNF:/FNH: summary fields.
// ---------------------------------------------------------------------------------------------

test("parseLcovBlocks: extracts SF path, FNDA name/hits pairs, DA hit-counts, and FNF/FNH from one block", () => {
  const lcov = [
    "SF:src/example.ts",
    "FN:1,foo",
    "FN:8,__export",
    "FNDA:5,foo",
    "FNDA:128,__export",
    "FNF:2",
    "FNH:2",
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
  assert.equal(blocks[0].fnf, 2);
  assert.equal(blocks[0].fnh, 2);
});

test("parseLcovBlocks: fnf/fnh are undefined when the block omits FNF:/FNH: lines", () => {
  const lcov = ["SF:src/example.ts", "DA:1,5", "end_of_record", ""].join("\n");
  const blocks = parseLcovBlocks(lcov);
  assert.equal(blocks[0].fnf, undefined);
  assert.equal(blocks[0].fnh, undefined);
});

test("parseLcovBlocks: parses multiple SF blocks in one lcov file independently", () => {
  const lcov = ["SF:src/a.ts", "DA:1,1", "end_of_record", "SF:src/b.ts", "DA:1,2", "end_of_record", ""].join("\n");
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
  assert.deepEqual(report.contaminated, []);
});

test("checkCoverageIntegrity: contaminated[] includes both severe and non-severe blocks together", () => {
  const lcov = [
    "SF:src/a-severe.ts",
    "FNDA:32,__toCommonJS",
    ...Array.from({ length: 35 }, () => "DA:1,32"),
    "end_of_record",
    "SF:src/b-contaminated-only.ts",
    "FNDA:32,__toCommonJS",
    ...Array.from({ length: 35 }, (_, i) => `DA:${i + 1},${i}`),
    "end_of_record",
    "",
  ].join("\n");
  const report = checkCoverageIntegrity(lcov);
  assert.equal(report.contaminated.length, 2);
  const severeFiles = report.contaminated.filter((v) => v.severe).map((v) => v.file);
  const nonSevereFiles = report.contaminated.filter((v) => !v.severe).map((v) => v.file);
  assert.deepEqual(severeFiles, ["src/a-severe.ts"]);
  assert.deepEqual(nonSevereFiles, ["src/b-contaminated-only.ts"]);
});
