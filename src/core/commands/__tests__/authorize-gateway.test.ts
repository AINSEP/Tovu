import assert from "node:assert/strict";
import test from "node:test";

import { DuplicateCommandError, ForbiddenError, executeCommand } from "../command";
import { InMemoryChangeSetRepo } from "../repo.memory";
import type { AuthorizeFn, CommandMutation } from "../command";

/**
 * @file SPEC-006 REQ-05/INV-04 — the gateway's `authorize()` gate.
 *
 * Certifies: an allowed caller's mutation runs normally; a denied caller's
 * mutation never executes and no change set is written; `authorize()` runs
 * BEFORE the idempotency check so a denied caller replaying a previously
 * successful command id gets `ForbiddenError`, never `DuplicateCommandError`
 * (EC-08); and the all-or-nothing wiring guard (partial `permission`/
 * `authorize` wiring is a thrown programming error, not a silent skip).
 */

const WORKSPACE = "workspace-1";
const fixedClock = { nowIso: () => "2026-07-10T00:00:00.000Z" };

function counterIdGen() {
  let n = 0;
  return { newId: () => `id-${++n}` };
}

function noopMutation(executed: { count: number }): CommandMutation<{ ok: true }> {
  return {
    entityType: "post",
    entityId: "post-1",
    operation: "update",
    captureInverse: async () => null,
    execute: async () => {
      executed.count += 1;
      return { ok: true };
    },
  };
}

function alwaysAllow(): AuthorizeFn {
  return async () => ({ allowed: true, reason: "matched" });
}

function alwaysDeny(reason: string): AuthorizeFn {
  return async () => ({ allowed: false, reason });
}

test("an allowed caller's mutation executes and records exactly one change set", async () => {
  const executed = { count: 0 };
  const changeSets = new InMemoryChangeSetRepo();

  const { changeSetId } = await executeCommand({
    deps: { clock: fixedClock, idGen: counterIdGen(), changeSets, authorize: alwaysAllow() },
    command: {
      workspaceId: WORKSPACE,
      actor: { id: "editor-1", kind: "user" },
      summary: "Update post",
      permission: "content.write",
    },
    mutation: noopMutation(executed),
  });

  assert.equal(executed.count, 1);
  const recorded = await changeSets.findById({ workspaceId: WORKSPACE, id: changeSetId });
  assert.ok(recorded);
  assert.equal(recorded?.changeSet.actorId, "editor-1");
});

test("a denied caller's mutation never executes and no change set is written (REQ-05)", async () => {
  const executed = { count: 0 };
  const changeSets = new InMemoryChangeSetRepo();

  await assert.rejects(
    executeCommand({
      deps: { clock: fixedClock, idGen: counterIdGen(), changeSets, authorize: alwaysDeny("no_grant") },
      command: {
        workspaceId: WORKSPACE,
        actor: { id: "viewer-1", kind: "user" },
        summary: "Update post",
        permission: "content.write",
      },
      mutation: noopMutation(executed),
    }),
    (err: unknown) => {
      assert.ok(err instanceof ForbiddenError);
      assert.equal(err.permission, "content.write");
      assert.equal(err.reason, "no_grant");
      return true;
    }
  );

  assert.equal(executed.count, 0, "the feature mutation must never run for a denied caller");
});

test("EC-08/INV-04: authorize() runs before the idempotency check — a denied replay never leaks DUPLICATE_COMMAND", async () => {
  const changeSets = new InMemoryChangeSetRepo();
  const idempotencyKey = "cmd-123";

  // First call: allowed, succeeds, records a change set under idempotencyKey.
  const first = await executeCommand({
    deps: { clock: fixedClock, idGen: counterIdGen(), changeSets, authorize: alwaysAllow() },
    command: {
      workspaceId: WORKSPACE,
      actor: { id: "editor-1", kind: "user" },
      summary: "Update post",
      permission: "content.write",
      idempotencyKey,
    },
    mutation: noopMutation({ count: 0 }),
  });
  assert.ok(first.changeSetId);

  // Second call: same idempotencyKey, but the caller is now denied (e.g.
  // demoted/revoked). Must get ForbiddenError, NEVER DuplicateCommandError —
  // that would leak that a command with this id previously succeeded.
  await assert.rejects(
    executeCommand({
      deps: { clock: fixedClock, idGen: counterIdGen(), changeSets, authorize: alwaysDeny("no_grant") },
      command: {
        workspaceId: WORKSPACE,
        actor: { id: "demoted-1", kind: "user" },
        summary: "Update post",
        permission: "content.write",
        idempotencyKey,
      },
      mutation: noopMutation({ count: 0 }),
    }),
    (err: unknown) => {
      assert.ok(err instanceof ForbiddenError, "must be ForbiddenError, not DuplicateCommandError");
      assert.ok(!(err instanceof DuplicateCommandError));
      return true;
    }
  );
});

test("wiring guard: supplying only command.permission without deps.authorize throws (not a silent skip)", async () => {
  const changeSets = new InMemoryChangeSetRepo();

  await assert.rejects(
    executeCommand({
      deps: { clock: fixedClock, idGen: counterIdGen(), changeSets },
      command: {
        workspaceId: WORKSPACE,
        actor: { id: "editor-1", kind: "user" },
        summary: "Update post",
        permission: "content.write",
      },
      mutation: noopMutation({ count: 0 }),
    }),
    /permission.*authorize.*must be supplied together/
  );
});

test("wiring guard: supplying only deps.authorize without command.permission throws (not a silent allow)", async () => {
  const changeSets = new InMemoryChangeSetRepo();

  await assert.rejects(
    executeCommand({
      deps: { clock: fixedClock, idGen: counterIdGen(), changeSets, authorize: alwaysAllow() },
      command: {
        workspaceId: WORKSPACE,
        actor: { id: "editor-1", kind: "user" },
        summary: "Update post",
      },
      mutation: noopMutation({ count: 0 }),
    }),
    /permission.*authorize.*must be supplied together/
  );
});

test("legacy path: omitting both permission and authorize preserves pre-identity behavior (no regression)", async () => {
  const executed = { count: 0 };
  const changeSets = new InMemoryChangeSetRepo();

  const { result } = await executeCommand({
    deps: { clock: fixedClock, idGen: counterIdGen(), changeSets },
    command: { workspaceId: WORKSPACE, actor: { id: "user-local", kind: "user" }, summary: "Update post" },
    mutation: noopMutation(executed),
  });

  assert.equal(executed.count, 1);
  assert.deepEqual(result, { ok: true });
});
