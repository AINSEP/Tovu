import assert from "node:assert/strict";
import test from "node:test";
import { warnUnindexedEntryRef } from "../../entry-refs/unindexed-ref-warning.js";

test("unindexed reference warnings identify the page operators need to review", t => {
  const warnings: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args); });
  warnUnindexedEntryRef({ message: "Cannot index the collection target in this marker.", sourceEntryId: "page-72" });
  assert.deepEqual(warnings, [["Cannot index the collection target in this marker.", { sourceEntryId: "page-72" }]]);
});
