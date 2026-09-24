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
import { entityKey } from "../../planner.js";
import {
  countSelectedPublishing,
  publishRowDisposition,
  selectableRowKeys,
  summarizePublishReport,
  toPublishReportRows,
} from "../report-rows.js";

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

// ---------------------------------------------------------------------------
// The entity column, and which rows may carry a checkbox (owner-directed, 2026-09-19)
// ---------------------------------------------------------------------------

test("a row renders its own human label rather than its id", () => {
  const [shaped] = toPublishReportRows(
    report([row({ outcome: "created", entityId: "d4bf2a26-2ed2-4143-b3ae-78404ca1b36b", entityLabel: "spring-sale" })])
  );

  assert.equal(shaped.entityLabel, "spring-sale");
  assert.equal(shaped.entityId, "d4bf2a26-2ed2-4143-b3ae-78404ca1b36b", "the id itself is still carried, just not what is displayed");
});

test("a row with no label falls back to a short id, never the whole uuid", () => {
  const uuid = "d4bf2a26-2ed2-4143-b3ae-78404ca1b36b";
  for (const missing of [null, undefined, "   "]) {
    const [shaped] = toPublishReportRows(report([row({ outcome: "created", entityId: uuid, entityLabel: missing })]));
    assert.equal(shaped.entityLabel, "d4bf2a26", `entityLabel ${JSON.stringify(missing)} must degrade to a short id`);
    assert.notEqual(shaped.entityLabel, uuid);
  }
});

test("only a row the run would write is selectable", () => {
  const rows = toPublishReportRows(
    report([
      row({ outcome: "created", entityId: "a" }),
      row({ outcome: "applied", entityId: "b" }),
      row({ outcome: "forced", entityId: "c", reason: "operator accepted the conflict" }),
      row({ outcome: "unchanged", entityId: "d" }),
      row({ outcome: "conflict", entityId: "e", reason: "edited on the live site" }),
      row({ outcome: "blocked", entityId: "f", reason: "slug taken" }),
    ])
  );

  assert.deepEqual(
    rows.map((r) => [r.entityId, r.selectable]),
    [["a", true], ["b", true], ["c", true], ["d", false], ["e", false], ["f", false]]
  );
  assert.deepEqual(selectableRowKeys(rows), ["post:a", "post:b", "post:c"]);
});

test("selectable row keys are byte-identical to the planner's own entity keys", () => {
  const rows = toPublishReportRows(report([row({ outcome: "created", entityType: "media", entityId: "m-1" })]));
  assert.deepEqual(selectableRowKeys(rows), [entityKey("media", "m-1")]);
});

test("the button's count is the intersection of the selection and what is selectable", () => {
  const rows = toPublishReportRows(
    report([
      row({ outcome: "created", entityId: "a" }),
      row({ outcome: "applied", entityId: "b" }),
      row({ outcome: "conflict", entityId: "c", reason: "edited on the live site" }),
    ])
  );

  assert.equal(countSelectedPublishing(rows, new Set(["post:a", "post:b"])), 2);
  assert.equal(countSelectedPublishing(rows, new Set(["post:a"])), 1);
  assert.equal(countSelectedPublishing(rows, new Set()), 0);
  // A key naming a row that cannot be published, or no row at all, must never inflate the promise
  // the primary button makes out loud.
  assert.equal(countSelectedPublishing(rows, new Set(["post:c", "post:gone"])), 0);
});

// ---------------------------------------------------------------------------
// "Overwrite on live" (publish-overwrite-live-plan-2026-09-24.md §4/S9)
// ---------------------------------------------------------------------------

test("overwritable is true only for a skipped row whose planner canOverwrite is true", () => {
  const rows = toPublishReportRows(
    report([
      row({ outcome: "blocked", entityId: "a", canOverwrite: true, reason: "slug taken" }),
      row({ outcome: "conflict", entityId: "b", canOverwrite: true, reason: "edited on the live site" }),
      row({ outcome: "blocked", entityId: "c", canOverwrite: false, reason: "blob missing" }),
      // A `forced` row is already `publish`, not `skipped` — it never gets a SECOND control
      // offering to do the same overwrite again, whatever its own `canOverwrite` says.
      row({ outcome: "forced", entityId: "d", canOverwrite: true, reason: "operator accepted the conflict" }),
      row({ outcome: "created", entityId: "e" }),
      row({ outcome: "unchanged", entityId: "f" }),
    ])
  );

  assert.deepEqual(
    rows.map((r) => [r.entityId, r.overwritable]),
    [["a", true], ["b", true], ["c", false], ["d", false], ["e", false], ["f", false]]
  );
});

test("retiresLabel names the live row an overwrite would retire, falling back to a short id", () => {
  const [withLabel] = toPublishReportRows(
    report([
      row({
        outcome: "blocked",
        entityId: "a",
        canOverwrite: true,
        reason: "slug taken",
        retires: { entityType: "post", entityId: "post-about", entityLabel: "About", hash: "h1" },
      }),
    ])
  );
  assert.equal(withLabel.retiresLabel, "About");

  const [withoutLabel] = toPublishReportRows(
    report([
      row({
        outcome: "blocked",
        entityId: "b",
        canOverwrite: true,
        reason: "slug taken",
        retires: { entityType: "post", entityId: "d4bf2a26-2ed2-4143-b3ae-78404ca1b36b", entityLabel: null, hash: "h2" },
      }),
    ])
  );
  assert.equal(withoutLabel.retiresLabel, "d4bf2a26");

  const [none] = toPublishReportRows(report([row({ outcome: "created", entityId: "c" })]));
  assert.equal(none.retiresLabel, null);
});
