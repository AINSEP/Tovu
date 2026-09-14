import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteOutboxAdapter } from "#src/platform/db/sqlite/outbox-repo.sqlite";
import { SqliteChangeSetRepo } from "#src/platform/db/sqlite/change-set-repo.sqlite";
import { InMemoryEventBus, processOutbox } from "../index.js";

/**
 * @file ADR-046 Phase 1's own required production gate for the Outbox row: "Crash/restart tests
 * prove no committed event is lost and duplicate delivery is safe." Mirrors
 * `core/commands/__tests__/change-sets-restart.integration.test.ts`'s restart-survival pattern.
 */

test("SqliteOutboxAdapter: an enqueued event survives a simulated process restart and is claimable after", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-outbox-restart-test-"));
  const dbPath = join(dir, "content.db");
  try {
    // "First boot": enqueue an event, do NOT deliver it (simulates a crash before the worker ran).
    const db1 = openContentDb(dbPath);
    const outbox1 = new SqliteOutboxAdapter(db1);
    await outbox1.enqueue({
      id: "evt-restart-1",
      name: "change-set.applied",
      occurredAt: "2026-07-16T00:00:00.000Z",
      workspaceId: "workspace-restart-test",
      payload: { changeSetId: "cs-restart-1" },
    });

    // "Restart": a brand-new content.db handle + a brand-new SqliteOutboxAdapter against the SAME
    // on-disk file — the in-memory adapter this replaces would have lost the event entirely.
    const db2 = openContentDb(dbPath);
    const outbox2 = new SqliteOutboxAdapter(db2);

    const claimed = await outbox2.claimPending(10, "2026-07-16T00:00:01.000Z");
    assert.equal(claimed.length, 1, "the enqueued event must survive a restart");
    assert.equal(claimed[0].id, "evt-restart-1");
    assert.deepEqual(claimed[0].event.payload, { changeSetId: "cs-restart-1" });

    // Mark delivered, then confirm a THIRD restart still reflects the delivered state (no
    // re-delivery after a successful hand-off survives a restart either).
    await outbox2.markDelivered("evt-restart-1");

    const db3 = openContentDb(dbPath);
    const outbox3 = new SqliteOutboxAdapter(db3);
    const afterDelivery = await outbox3.claimPending(10, "2099-01-01T00:00:00.000Z");
    assert.equal(afterDelivery.length, 0, "a delivered event must not be re-claimed after a restart");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("SqliteChangeSetRepo.insert() + SqliteOutboxAdapter: the co-persisted event survives a restart via the SAME table", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-outbox-cochangeset-restart-test-"));
  const dbPath = join(dir, "content.db");
  try {
    // "First boot": executeCommand()'s real path — insert() co-persists the outbox event.
    const db1 = openContentDb(dbPath);
    const changeSets1 = new SqliteChangeSetRepo(db1);
    await changeSets1.insert(
      {
        id: "cs-cochangeset-1",
        workspaceId: "workspace-restart-test",
        status: "applied",
        summary: "Renamed a post",
        createdAt: "2026-07-16T00:00:00.000Z",
        appliedAt: "2026-07-16T00:00:00.000Z",
      },
      [
        {
          id: "cs-cochangeset-1-item-1",
          changeSetId: "cs-cochangeset-1",
          entityType: "post",
          entityId: "post-1",
          operation: "update",
          position: 0,
        },
      ],
      {
        id: "evt-cochangeset-1",
        name: "change-set.applied",
        occurredAt: "2026-07-16T00:00:00.000Z",
        workspaceId: "workspace-restart-test",
        changeSetId: "cs-cochangeset-1",
        payload: { changeSetId: "cs-cochangeset-1", entityType: "post", entityId: "post-1" },
      }
    );

    // "Restart": a fresh SqliteOutboxAdapter must find the event that SqliteChangeSetRepo wrote —
    // proving the two adapters genuinely share one table, not two disconnected write paths.
    const db2 = openContentDb(dbPath);
    const outbox2 = new SqliteOutboxAdapter(db2);
    const claimed = await outbox2.claimPending(10, "2026-07-16T00:00:01.000Z");

    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].id, "evt-cochangeset-1");
    assert.equal(claimed[0].event.name, "change-set.applied");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("SqliteOutboxAdapter: a row stranded in processing by a process that died mid-drain is delivered by the next process once the claim lease expires (2026-09-14)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-outbox-stranded-restart-test-"));
  const dbPath = join(dir, "content.db");
  try {
    // "First process": claims the row, then dies before its handler finishes, so neither
    // markDelivered nor markFailed ever runs (a tsx-watch reload or a crash does exactly this).
    const outbox1 = new SqliteOutboxAdapter(openContentDb(dbPath), { claimLeaseMs: 60_000 });
    await outbox1.enqueue({
      id: "evt-stranded-1",
      name: "entry.updated",
      occurredAt: "2026-07-16T00:00:00.000Z",
      workspaceId: "workspace-restart-test",
      payload: { entryId: "post-1" },
    });
    assert.equal((await outbox1.claimPending(20, "2026-07-16T00:00:01.000Z")).length, 1);

    // "Next process": fresh handles on the same file, a bus carrying the real subscriber, and a
    // drain that runs after the dead process's claim lease has run out.
    const outbox2 = new SqliteOutboxAdapter(openContentDb(dbPath), { claimLeaseMs: 60_000 });
    const bus = new InMemoryEventBus();
    const received: string[] = [];
    await bus.subscribe("entry.updated", async (event) => {
      received.push(event.id);
    });

    const processed = await processOutbox({ outbox: outbox2, bus, clock: { nowIso: () => "2026-07-16T00:01:01.000Z" } });

    assert.deepEqual({ processed, received }, { processed: 1, received: ["evt-stranded-1"] });
    assert.equal((await outbox2.claimPending(20, "2099-01-01T00:00:00.000Z")).length, 0, "once delivered it must stay delivered");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
