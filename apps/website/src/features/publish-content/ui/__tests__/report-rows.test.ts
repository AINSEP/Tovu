/**
 * @file Task 11 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 11.
 *
 * The report-table semantics the admin dialog renders. These live in `features/publish-content/ui/`
 * rather than in `apps/admin` because they restate the planner's own safety property — which rows a
 * run writes and which it skips — and a second copy in the admin package could drift from
 * `planner.ts` without anything going red.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { PublishContentOutcomeRow, PublishContentReport } from "../contract.js";
import { publishRowDisposition, summarizePublishReport, toPublishReportRows } from "../report-rows.js";

function row(over: Partial<PublishContentOutcomeRow> & { outcome: PublishContentOutcomeRow["outcome"] }): PublishContentOutcomeRow {
  return {
    entityType: "post",
    entityId: "post-1",
    writes: over.outcome === "created" || over.outcome === "applied" || over.outcome === "forced",
    reason: null,
    ...over,
  };
}

function report(rows: readonly PublishContentOutcomeRow[]): PublishContentReport {
  return { refused: false, refusalReason: null, applyOrder: ["media", "post"], rows };
}

test("a conflict row is skipped, never publishable", () => {
  assert.equal(publishRowDisposition(row({ outcome: "conflict", reason: "edited on the live site" })), "skipped");
});

test("a blocked row is skipped", () => {
  assert.equal(publishRowDisposition(row({ outcome: "blocked", reason: "slug taken by a different id" })), "skipped");
});

test("created and applied rows publish; unchanged rows are their own disposition", () => {
  assert.equal(publishRowDisposition(row({ outcome: "created" })), "publish");
  assert.equal(publishRowDisposition(row({ outcome: "applied" })), "publish");
  assert.equal(publishRowDisposition(row({ outcome: "unchanged" })), "unchanged");
  assert.equal(publishRowDisposition(row({ outcome: "forced" })), "publish");
});

test("every row carries a stable key, a disposition label and its planner reason", () => {
  const rows = toPublishReportRows(
    report([
      row({ outcome: "created", entityId: "post-a" }),
      row({ outcome: "conflict", entityType: "media", entityId: "media-b", reason: "edited on the live site" }),
    ])
  );

  assert.deepEqual(
    rows.map((r) => ({ key: r.key, disposition: r.disposition, label: r.dispositionLabel, reason: r.reason })),
    [
      { key: "post:post-a", disposition: "publish", label: "Will publish — new", reason: null },
      { key: "media:media-b", disposition: "skipped", label: "Skipped", reason: "edited on the live site" },
    ]
  );
});

test("a skipped row with no planner reason still reads as skipped rather than blank", () => {
  const [only] = toPublishReportRows(report([row({ outcome: "blocked", reason: null })]));
  assert.equal(only.reason, "No reason recorded.");
});

test("the summary counts what the run writes, and excludes conflicts", () => {
  const summary = summarizePublishReport(
    toPublishReportRows(
      report([
        row({ outcome: "created", entityId: "a" }),
        row({ outcome: "applied", entityId: "b" }),
        row({ outcome: "unchanged", entityId: "c" }),
        row({ outcome: "conflict", entityId: "d", reason: "edited on the live site" }),
        row({ outcome: "blocked", entityId: "e", reason: "slug taken" }),
      ])
    )
  );

  assert.deepEqual(summary, { total: 5, publishing: 2, unchanged: 1, skipped: 2 });
});

test("a refused report produces no rows at all", () => {
  const rows = toPublishReportRows({
    refused: true,
    refusalReason: "these two instances are on different content-hash versions",
    applyOrder: [],
    rows: [],
  });
  assert.deepEqual(rows, []);
});
