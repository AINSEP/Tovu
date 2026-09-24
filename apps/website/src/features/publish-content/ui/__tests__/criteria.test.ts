/**
 * @file S1 of `ADS-memory/.local-artifacts/publish-criteria-tool-webmcp-plan-2026-09-24.md` §2/§4 —
 * the criteria contract that turns a `PublishCriteria` (from chat, or from a WebMCP call) into the
 * same `deselectedKeys`/`overwriteKeys` shape the dialog's own hook already threads through a re-plan
 * (`use-publish-content-confirm.hooks.ts`'s `setDeselectedKeys`/`applyOverwriteKeys`). Criteria only
 * ever set the *initial* value of state the dialog already owns.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { PublishContentOutcomeRow, PublishContentReport } from "../contract.js";
import { applyPublishCriteria } from "../criteria.js";
import { toPublishReportRows } from "../report-rows.js";

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
  return { refused: false, refusalReason: null, applyOrder: [], rows };
}

test("types filter keeps matching kinds, plural/alias forms accepted, and deselects the rest", () => {
  const rows = toPublishReportRows(
    report([
      row({ outcome: "created", entityType: "page", entityId: "p-1", entityLabel: "About" }),
      row({ outcome: "created", entityType: "menu", entityId: "m-1", entityLabel: "Main nav" }),
      row({ outcome: "created", entityType: "post", entityId: "post-1", entityLabel: "Hello" }),
      row({ outcome: "created", entityType: "redirect", entityId: "r-1", entityLabel: "/old" }),
    ])
  );

  // "pages" -> page, "nav" -> menu (plan §2's documented aliases).
  const selection = applyPublishCriteria(rows, { types: ["pages", "nav"] });

  assert.deepEqual([...selection.deselectedKeys].sort(), ["post:post-1", "redirect:r-1"]);
});

test("items filter matches a label case-insensitively and deselects every other row", () => {
  const rows = toPublishReportRows(
    report([
      row({ outcome: "created", entityType: "page", entityId: "p-1", entityLabel: "About" }),
      row({ outcome: "created", entityType: "page", entityId: "p-2", entityLabel: "Contact" }),
      row({ outcome: "created", entityType: "post", entityId: "post-1", entityLabel: "Team" }),
    ])
  );

  const selection = applyPublishCriteria(rows, { items: ["about"] });

  assert.deepEqual([...selection.deselectedKeys].sort(), ["page:p-2", "post:post-1"]);
});

test("overwrite:true ticks only overwritable rows that also match the criteria", () => {
  const rows = toPublishReportRows(
    report([
      // Matches type "page" AND is overwritable (a skipped row the planner says can be forced).
      row({ outcome: "blocked", entityType: "page", entityId: "p-1", canOverwrite: true, reason: "slug taken" }),
      // Overwritable, but the wrong type — must not be ticked.
      row({ outcome: "conflict", entityType: "menu", entityId: "m-1", canOverwrite: true, reason: "edited on the live site" }),
      // Matches the type, but is an ordinary publish row (never overwritable) — must not be ticked.
      row({ outcome: "created", entityType: "page", entityId: "p-2" }),
    ])
  );

  const selection = applyPublishCriteria(rows, { types: ["page"], overwrite: true });

  assert.deepEqual([...selection.overwriteKeys], ["page:p-1"]);
});

test("overwrite omitted ticks nothing, even for a matching overwritable row", () => {
  const rows = toPublishReportRows(
    report([row({ outcome: "blocked", entityType: "page", entityId: "p-1", canOverwrite: true, reason: "slug taken" })])
  );

  const selection = applyPublishCriteria(rows, { types: ["page"] });

  assert.deepEqual([...selection.overwriteKeys], []);
});

test("unmatchedItems and unknownTypes name what named nothing in the plan", () => {
  const rows = toPublishReportRows(
    report([row({ outcome: "created", entityType: "page", entityId: "p-1", entityLabel: "About" })])
  );

  const selection = applyPublishCriteria(rows, { items: ["About", "Nonexistent Page"], types: ["page", "redirect"] });

  assert.deepEqual(selection.unmatchedItems, ["Nonexistent Page"]);
  assert.deepEqual(selection.unknownTypes, ["redirect"]);
});

test("empty criteria give empty sets, the same as today's dialog", () => {
  const rows = toPublishReportRows(
    report([
      row({ outcome: "created", entityType: "page", entityId: "p-1" }),
      row({ outcome: "blocked", entityType: "menu", entityId: "m-1", canOverwrite: true, reason: "slug taken" }),
    ])
  );

  const selection = applyPublishCriteria(rows, {});

  assert.deepEqual(selection.deselectedKeys, new Set());
  assert.deepEqual(selection.overwriteKeys, new Set());
  assert.deepEqual(selection.unmatchedItems, []);
  assert.deepEqual(selection.unknownTypes, []);
});

test("a non-selectable row is never put in deselectedKeys, whatever the criteria", () => {
  const rows = toPublishReportRows(
    report([
      row({ outcome: "created", entityType: "page", entityId: "p-1" }),
      row({ outcome: "unchanged", entityType: "post", entityId: "post-1" }), // not selectable
    ])
  );

  const selection = applyPublishCriteria(rows, { types: ["page"] });

  assert.equal(
    rows.find((r) => r.key === "post:post-1")?.selectable,
    false,
    "test fixture check: the row this test relies on must actually be non-selectable"
  );
  assert.deepEqual([...selection.deselectedKeys], []);
});
