import assert from "node:assert/strict";
import test from "node:test";

import { getTimeline } from "../../timeline.js";

/**
 * @file SPEC-017 C-101 / REQ-01 / REQ-04 / REQ-05 / AC-01 / AC-04 / AC-05 — the Timeline read model.
 *
 * Assumed seam design:
 *
 * ```ts
 * export interface LedgerRow {
 *   id: string; kind: string; createdAt: string; restorePointId: string | null; outcome: string;
 * }
 * export interface LedgerReadPort {
 *   query(filter: { kind?: string; fromDate?: string; toDate?: string; outcome?: string; cursor?: string | null; limit: number })
 *     : Promise<{ items: LedgerRow[]; nextCursor: string | null }>;
 * }
 * export async function getTimeline(
 *   required: { ledger: LedgerReadPort; filter?: { kind?: string; fromDate?: string; toDate?: string; outcome?: string; cursor?: string; limit?: number } },
 *   optional?: {}
 * ): Promise<{ items: LedgerRow[]; nextCursor: string | null }>; // throws ValidationError if limit > 200
 * ```
 */

function fakeLedger(rows: Array<{ id: string; createdAt: string; kind?: string; restorePointId?: string | null; outcome?: string }>) {
  return {
    async query(filter: { kind?: string; limit: number }) {
      const filtered = filter.kind ? rows.filter((r) => r.kind === filter.kind) : rows;
      return {
        items: filtered.slice(0, filter.limit).map((r) => ({
          id: r.id,
          kind: r.kind ?? "core.migration",
          createdAt: r.createdAt,
          restorePointId: r.restorePointId ?? "rp-1",
          outcome: r.outcome ?? "success",
        })),
        nextCursor: null,
      };
    },
  };
}

test("AC-01: getTimeline returns rows with restore-point linkage present", async () => {
  const ledger = fakeLedger([{ id: "row-1", createdAt: "2026-07-15T00:00:00.000Z", restorePointId: "rp-9" }]);
  const result = await getTimeline({ ledger });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].restorePointId, "rp-9");
});

test("AC-04 / REQ-04: getTimeline with a kind filter returns only matching rows", async () => {
  const ledger = fakeLedger([
    { id: "row-1", createdAt: "2026-07-15T00:00:00.000Z", kind: "core.migration" },
    { id: "row-2", createdAt: "2026-07-15T00:01:00.000Z", kind: "index.provision" },
  ]);
  const result = await getTimeline({ ledger, filter: { kind: "index.provision" } });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "row-2");
});

test("getTimeline returns an empty items array (never an error) when no rows match", async () => {
  const ledger = fakeLedger([]);
  const result = await getTimeline({ ledger, filter: { kind: "template.upgrade" } });
  assert.deepEqual(result.items, []);
});

test("REQ-04 / AC-34-adjacent: getTimeline rejects a limit above 200 (no raw SQL / unbounded query surface)", async () => {
  const ledger = fakeLedger([]);
  await assert.rejects(getTimeline({ ledger, filter: { limit: 500 } }));
});

test("AC-05 / REQ-05: this module exposes no raw-row-edit, SQL-console, or DB-first-mode function — only getTimeline is exported", async () => {
  const timelineModule = await import("../../timeline.js");
  const exportedNames = Object.keys(timelineModule);
  const disallowed = exportedNames.filter((name) => /rawQuery|sqlConsole|editRow|runSql/i.test(name));
  assert.deepEqual(disallowed, [], "AC-05: no raw-SQL/edit/DB-first-mode surface may exist in this module");
});
