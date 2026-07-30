import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { runtimeSchemaVersion, compareSchemaVersion } from "../../schema-guard";

/**
 * @file SPEC-003 C-006 (`runtimeSchemaVersion` + guard compare) — TDD certification, unit tier.
 *
 * Traces: REQ-05, RT-005, INV-04, INV-05, state.spec.md §5/§7, CIC U-002 (Binding constraint
 * U-002-B1: "equal schemaVersion index but different schemaTag" must be treated identically to
 * "site newer than runtime" — index-only comparison is not a legal implementation).
 *
 * Neither export exists yet — expected to fail to compile/run until Programmer implements
 * `src/site-dir/schema-guard.ts` (tasks.md T012). Correct TDD state.
 *
 * `compareSchemaVersion(siteMeta)` reads the runtime's own identity internally (mirrors
 * `runtimeSchemaVersion`'s own no-argument contract per implementation-outline.md's Contract Map
 * C-006 Inputs column, which lists only `{ siteMeta }` for the compare side) rather than taking
 * an injected runtime fixture — so these tests derive their site-side fixtures relative to the
 * REAL `runtimeSchemaVersion()` value read at test time, staying correct regardless of how many
 * migrations exist when this suite runs.
 *
 * **Coverage tooling note (2026-07-28, TDD recertification — for whoever reads a coverage report
 * next, human or LLM):** `node --experimental-test-coverage`'s branch-coverage figure for
 * `schema-guard.ts` reads below its 98% gate as measured. This is NOT missing test coverage —
 * every reachable branch is exercised (verified: 100% of real source arms across all 4
 * unit-suite files; full mechanical breakdown in `test-certification.md`'s Coverage Gates
 * section). The shortfall is a `tsx`/esbuild artifact: transpiling any module that imports
 * something injects a CommonJS-interop preamble (`__copyProps`/`__toESM`/`__toCommonJS`) with no
 * real source-map anchor, so V8's block-coverage instrumentation attributes several of those
 * synthetic branches to nearby lines in the SOURCE file (confirmed pattern: for this file's
 * siblings, e.g. `resolve-workspace.ts`, the reported line numbers land inside that file's own
 * header JSDoc comment, not in executable code — same mechanism here). Do not "fix" this by
 * adding more tests — there is nothing left to cover. If this ever needs to actually read 98%+:
 * swap to a source-map-accurate coverage tool (c8/istanbul), logged as a real follow-up in
 * `todos.md`, not done as of this note.
 *
 * Outcome Matrix (REQ-05 sub-clauses a/b/c):
 *   Given site.schemaVersion > runtime.index                              -> throws SiteNewerThanRuntimeError
 *   Given site.schemaVersion === runtime.index AND site.schemaTag !== runtime.tag -> throws SiteNewerThanRuntimeError (RT-005 divergent lineage)
 *   Given site.schemaVersion === runtime.index AND site.schemaTag === runtime.tag -> returns "compatible"
 *   Given site.schemaVersion < runtime.index (any tag)                     -> returns "migrate"
 */

const JOURNAL_PATH = path.resolve(__dirname, "../../../infra/drizzle/meta/_journal.json");

function readRealJournalLatest(): { index: number; tag: string } {
  const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8")) as { entries: Array<{ idx: number; tag: string }> };
  const latest = journal.entries[journal.entries.length - 1];
  return { index: latest.idx, tag: latest.tag };
}

test("runtimeSchemaVersion() reads the runtime's bundled-migration identity from the real drizzle/meta/_journal.json (index + tag of the LAST entry)", () => {
  const expected = readRealJournalLatest();
  const actual = runtimeSchemaVersion();
  assert.equal(actual.index, expected.index, "schemaVersion is the latest migration's integer index (ordering) per REQ-05/state.spec.md §7");
  assert.equal(actual.tag, expected.tag, "schemaTag is the latest migration's tag/hash identity per REQ-05/state.spec.md §7");
});

test("site schemaVersion strictly less than the runtime's -> compareSchemaVersion returns 'migrate' regardless of schemaTag content", () => {
  const runtime = runtimeSchemaVersion();
  assert.ok(runtime.index > 0, "fixture assumption: at least 2 bundled migrations exist so index-1 is a valid older value");
  const result = compareSchemaVersion({ schemaVersion: runtime.index - 1, schemaTag: "some-older-or-unrelated-tag" });
  assert.equal(result, "migrate");
});

test("site schemaVersion equal to the runtime's AND schemaTag matches -> compareSchemaVersion returns 'compatible' (no migration needed)", () => {
  const runtime = runtimeSchemaVersion();
  const result = compareSchemaVersion({ schemaVersion: runtime.index, schemaTag: runtime.tag });
  assert.equal(result, "compatible");
});

test("RT-005 / U-002-B1: site schemaVersion equal to the runtime's but schemaTag DIVERGES -> compareSchemaVersion throws SiteNewerThanRuntimeError, not 'compatible' (index-only comparison is not a legal implementation)", () => {
  const runtime = runtimeSchemaVersion();
  assert.throws(
    () => compareSchemaVersion({ schemaVersion: runtime.index, schemaTag: `${runtime.tag}-divergent-fork` }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal((err as Error).name, "SiteNewerThanRuntimeError");
      return true;
    },
    "an equal index beside a different tag must raise the SAME error as 'site is newer' (INV-04's illegal-state definition, RT-005 divergent-lineage detection)"
  );
});

test("site schemaVersion strictly greater than the runtime's -> compareSchemaVersion throws SiteNewerThanRuntimeError", () => {
  const runtime = runtimeSchemaVersion();
  assert.throws(
    () => compareSchemaVersion({ schemaVersion: runtime.index + 1, schemaTag: "future-tag-not-yet-bundled" }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal((err as Error).name, "SiteNewerThanRuntimeError");
      return true;
    },
    "REQ-05(a): a site schema newer than this runtime must refuse rather than attempt to serve/downgrade"
  );
});
