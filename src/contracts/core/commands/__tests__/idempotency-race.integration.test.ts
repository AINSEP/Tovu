import assert from "node:assert/strict";
import test from "node:test";

import { DuplicateCommandError, executeCommand, type CommandMutation } from "@jini-ai/cms/core";
import { openContentDb } from "#src/db/sqlite/content-db";
import { SqliteChangeSetRepo } from "#src/db/sqlite/change-set-repo.sqlite";

/**
 * @file Idempotency-key TOCTOU race.
 *
 * `executeCommand`'s pre-execute `findByIdempotencyKey` check and its post-execute
 * `changeSets.insert()` are separated by `captureInverse()`/`execute()` — two concurrent commands
 * on the same key can both pass the check before either inserts. The real SQLite adapter's unique
 * index (`idx_change_sets_idempotency`) then rejects the loser's insert. This must surface as the
 * intended `DuplicateCommandError` (referencing the winner's change set), not the raw driver error,
 * and the loser's mutation must still be rolled back. Only the SQLite adapter has a real unique
 * constraint to race against — `repo.memory.ts` has no such guard and is out of scope here.
 */

const WORKSPACE = "workspace-1";
const IDEMPOTENCY_KEY = "race-key-1";
const fixedClock = { nowIso: () => "2026-08-24T00:00:00.000Z" };

function counterIdGen(prefix: string) {
  let n = 0;
  return { newId: () => `${prefix}-${++n}` };
}

function racingMutation(
  entityId: string,
  rolledBack: { count: number }
): CommandMutation<{ ok: true; entityId: string }> {
  return {
    entityType: "post",
    entityId,
    operation: "create",
    captureInverse: async () => null,
    execute: async () => ({ ok: true, entityId }),
    rollback: async () => {
      rolledBack.count += 1;
    },
  };
}

test("concurrent executeCommand calls sharing an idempotency key: one wins, the loser gets DuplicateCommandError (not the raw driver error) and is rolled back", async () => {
  const db = openContentDb(":memory:");
  const changeSets = new SqliteChangeSetRepo(db);

  const rolledBackA = { count: 0 };
  const rolledBackB = { count: 0 };

  const callA = executeCommand({
    deps: { clock: fixedClock, idGen: counterIdGen("a"), changeSets },
    command: {
      workspaceId: WORKSPACE,
      actor: { id: "user-1", kind: "user" },
      summary: "Create post A",
      idempotencyKey: IDEMPOTENCY_KEY,
    },
    mutation: racingMutation("post-a", rolledBackA),
  });

  const callB = executeCommand({
    deps: { clock: fixedClock, idGen: counterIdGen("b"), changeSets },
    command: {
      workspaceId: WORKSPACE,
      actor: { id: "user-1", kind: "user" },
      summary: "Create post B",
      idempotencyKey: IDEMPOTENCY_KEY,
    },
    mutation: racingMutation("post-b", rolledBackB),
  });

  const [settledA, settledB] = await Promise.allSettled([callA, callB]);
  const settled = [settledA, settledB];

  const fulfilled = settled.filter((r) => r.status === "fulfilled");
  const rejected = settled.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1, "exactly one call should win");
  assert.equal(rejected.length, 1, "exactly one call should lose");

  const winner = fulfilled[0] as PromiseFulfilledResult<Awaited<typeof callA>>;
  const loser = rejected[0] as PromiseRejectedResult;

  assert.ok(
    loser.reason instanceof DuplicateCommandError,
    `loser should reject with DuplicateCommandError, got ${loser.reason?.constructor?.name}: ${loser.reason?.message}`
  );
  assert.equal(loser.reason.changeSetId, winner.value.changeSetId);

  // Exactly one rollback fired — for whichever mutation actually lost the race.
  assert.equal(rolledBackA.count + rolledBackB.count, 1);

  // Only the winner's change set is durably recorded; the loser left no trace.
  const all = await changeSets.listByWorkspace({ workspaceId: WORKSPACE });
  assert.equal(all.length, 1);
  assert.equal(all[0].id, winner.value.changeSetId);
});
