/**
 * @file The shared display order for every publishable-content list (owner rule, 2026-09-26):
 * to-publish first, then can't-publish-yet, then up to date — A–Z within each, case-insensitive,
 * locale-aware, numeric.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { PublishContentOutcomeRow, PublishContentReport } from "../contract.js";
import { publishOrderComparator, sortPublishReportRows } from "../publish-order.js";
import { toPublishReportRows } from "../report-rows.js";

function outcomeRow(
  entityId: string,
  entityLabel: string,
  outcome: PublishContentOutcomeRow["outcome"],
  entityType = "post"
): PublishContentOutcomeRow {
  return {
    entityType,
    entityId,
    entityLabel,
    outcome,
    writes: outcome === "created" || outcome === "applied" || outcome === "forced",
    reason: outcome === "conflict" || outcome === "blocked" ? "edited on live" : null,
  };
}

function rowsOf(...rows: PublishContentOutcomeRow[]) {
  return toPublishReportRows({ refused: false, rows } as unknown as PublishContentReport);
}

test("to-publish rows come first, then skipped, then up to date — A–Z inside each", () => {
  const rows = rowsOf(
    outcomeRow("1", "Zebra", "unchanged"),
    outcomeRow("2", "banana", "applied"),
    outcomeRow("3", "Mango", "conflict"),
    outcomeRow("4", "apple", "unchanged"),
    outcomeRow("5", "Cherry", "created"),
    outcomeRow("6", "Apple pie", "forced"),
    outcomeRow("7", "Kiwi", "blocked")
  );
  const sorted = sortPublishReportRows(rows, "en");
  assert.deepEqual(
    sorted.map((row) => row.entityLabel),
    ["Apple pie", "banana", "Cherry", "Kiwi", "Mango", "apple", "Zebra"]
  );
});

test("A–Z ignores case and orders numbers numerically", () => {
  const rows = rowsOf(
    outcomeRow("1", "page 10", "applied"),
    outcomeRow("2", "Page 2", "applied"),
    outcomeRow("3", "PAGE 1", "applied")
  );
  assert.deepEqual(
    sortPublishReportRows(rows, "en").map((row) => row.entityLabel),
    ["PAGE 1", "Page 2", "page 10"]
  );
});

test("sorts a copy — the planner's row order is left untouched", () => {
  const rows = rowsOf(outcomeRow("1", "B", "unchanged"), outcomeRow("2", "A", "applied"));
  const before = rows.map((row) => row.key);
  sortPublishReportRows(rows, "en");
  assert.deepEqual(
    rows.map((row) => row.key),
    before
  );
});

test("same label: the order does not depend on input order", () => {
  const a = rowsOf(outcomeRow("x", "Home", "applied", "page"), outcomeRow("y", "Home", "applied", "post"));
  const b = [...a].reverse();
  assert.deepEqual(
    sortPublishReportRows(a, "en").map((row) => row.key),
    sortPublishReportRows(b, "en").map((row) => row.key)
  );
});

test("a malformed locale falls back instead of throwing", () => {
  const rows = rowsOf(outcomeRow("1", "b", "applied"), outcomeRow("2", "A", "applied"));
  assert.deepEqual(
    sortPublishReportRows(rows, "not a locale!!").map((row) => row.entityLabel),
    ["A", "b"]
  );
});

test("the generic comparator orders any item by group, then label", () => {
  const items = [
    { group: "current" as const, label: "a" },
    { group: "blocked" as const, label: "b" },
    { group: "publish" as const, label: "Z" },
    { group: "publish" as const, label: "y" },
  ];
  assert.deepEqual(
    [...items].sort(publishOrderComparator("en", (item) => item)).map((item) => item.label),
    ["y", "Z", "b", "a"]
  );
});
