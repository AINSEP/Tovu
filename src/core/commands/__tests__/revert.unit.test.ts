import assert from "node:assert/strict";
import test from "node:test";

import {
  revertChangeSet,
  ChangeSetNotFoundError,
  ChangeSetInvalidStatusError,
  RevertNotPossibleError,
  RevertConflictError,
  type RevertChangeSetDeps,
} from "../revert.js";
import { createRevertRegistry, type EntityReverter } from "../appliers.js";
import { InMemoryChangeSetRepo } from "../repo.memory.js";
import type {
  ChangeSetItemRecord,
  ChangeSetRecord,
  ChangeSetRepoPort,
  ChangeSetWithItems,
  DomainEvent,
  OutboxPort,
} from "@jini-ai/cms/core";

/**
 * @file Direct unit coverage of `revert.ts`'s `revertChangeSet` — its own precondition ladder
 * (BR-05: exists -> applied -> every item has a reverter -> every item has an inverse payload ->
 * every item passes the version guard), the descending-position apply order, the post-apply
 * compare-and-set re-check (RT-003/INV-006), and the optional outbox event.
 *
 * The two existing suites that touch this function (`post-delete-reverter.test.ts`,
 * `revert-plugin-ext.integration.test.ts`) only exercise the single-item happy path through a real
 * post reverter. Every error branch and the multi-item ordering were previously unexercised by any
 * test in this repo (see ADS-memory/reports/2026-08-21-core-db-routing-coverage-baseline.md).
 */

const WS = "ws-1";
const clock = { nowIso: () => "2026-08-21T00:00:00.000Z" };
const idGen = { newId: () => "id-1" };

function fakeReverter(opts: {
  currentVersion: number | null;
  onApplyInverse?: (item: ChangeSetItemRecord) => void;
}): EntityReverter {
  return {
    currentVersion: async () => opts.currentVersion,
    applyInverse: async ({ item }) => {
      opts.onApplyInverse?.(item);
    },
  };
}

function baseChangeSet(overrides: Partial<ChangeSetRecord> = {}): ChangeSetRecord {
  return {
    id: "cs-1",
    workspaceId: WS,
    status: "applied",
    summary: "test change set",
    createdAt: "2026-08-20T00:00:00.000Z",
    appliedAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

function baseItem(overrides: Partial<ChangeSetItemRecord> = {}): ChangeSetItemRecord {
  return {
    id: "csi-1",
    changeSetId: "cs-1",
    entityType: "widget",
    entityId: "entity-1",
    operation: "update",
    inversePayload: { field: "old-value" },
    entityVersionAtApply: 1,
    position: 0,
    ...overrides,
  };
}

test("throws ChangeSetNotFoundError when no change set matches (workspace + id)", async () => {
  const changeSets = new InMemoryChangeSetRepo([], []);
  const deps: RevertChangeSetDeps = { changeSets, registry: createRevertRegistry(), clock, idGen };

  await assert.rejects(
    () => revertChangeSet({ deps, input: { workspaceId: WS, changeSetId: "missing-cs" } }),
    (err: unknown) => {
      assert.ok(err instanceof ChangeSetNotFoundError);
      assert.equal((err as Error).message, "change set 'missing-cs' was not found");
      return true;
    }
  );
});

test("throws ChangeSetInvalidStatusError when the change set is not 'applied'", async () => {
  const changeSet = baseChangeSet({ status: "proposed" });
  const changeSets = new InMemoryChangeSetRepo([changeSet], []);
  const deps: RevertChangeSetDeps = { changeSets, registry: createRevertRegistry(), clock, idGen };

  await assert.rejects(
    () => revertChangeSet({ deps, input: { workspaceId: WS, changeSetId: "cs-1" } }),
    (err: unknown) => {
      assert.ok(err instanceof ChangeSetInvalidStatusError);
      assert.equal(
        (err as Error).message,
        "change set 'cs-1' is 'proposed', only 'applied' can be reverted"
      );
      return true;
    }
  );
});

test("throws RevertNotPossibleError when no reverter is registered for the item's (entityType, operation)", async () => {
  const changeSet = baseChangeSet();
  const item = baseItem({ entityType: "widget", operation: "update" });
  const changeSets = new InMemoryChangeSetRepo([changeSet], [item]);
  const registry = createRevertRegistry(); // nothing registered
  const deps: RevertChangeSetDeps = { changeSets, registry, clock, idGen };

  await assert.rejects(
    () => revertChangeSet({ deps, input: { workspaceId: WS, changeSetId: "cs-1" } }),
    (err: unknown) => {
      assert.ok(err instanceof RevertNotPossibleError);
      assert.equal(
        (err as Error).message,
        "no inverse applier registered for 'widget/update'"
      );
      return true;
    }
  );
});

test("throws RevertNotPossibleError when the item has no inverse payload", async () => {
  const changeSet = baseChangeSet();
  const item = baseItem({ id: "csi-9", inversePayload: undefined });
  const changeSets = new InMemoryChangeSetRepo([changeSet], [item]);
  const registry = createRevertRegistry();
  registry.register("widget", "update", fakeReverter({ currentVersion: 1 }));
  const deps: RevertChangeSetDeps = { changeSets, registry, clock, idGen };

  await assert.rejects(
    () => revertChangeSet({ deps, input: { workspaceId: WS, changeSetId: "cs-1" } }),
    (err: unknown) => {
      assert.ok(err instanceof RevertNotPossibleError);
      assert.equal(
        (err as Error).message,
        "change-set item 'csi-9' has no inverse payload and cannot be reverted"
      );
      return true;
    }
  );
});

test("throws RevertConflictError with 'missing' when the entity no longer exists (currentVersion returns null)", async () => {
  const changeSet = baseChangeSet();
  const item = baseItem({ entityType: "widget", entityId: "entity-1", entityVersionAtApply: 3 });
  const changeSets = new InMemoryChangeSetRepo([changeSet], [item]);
  const registry = createRevertRegistry();
  registry.register("widget", "update", fakeReverter({ currentVersion: null }));
  const deps: RevertChangeSetDeps = { changeSets, registry, clock, idGen };

  await assert.rejects(
    () => revertChangeSet({ deps, input: { workspaceId: WS, changeSetId: "cs-1" } }),
    (err: unknown) => {
      assert.ok(err instanceof RevertConflictError);
      assert.equal(
        (err as Error).message,
        "entity 'widget:entity-1' changed since this change set (expected version 3, found missing)"
      );
      assert.equal((err as RevertConflictError).entityType, "widget");
      assert.equal((err as RevertConflictError).entityId, "entity-1");
      return true;
    }
  );
});

test("throws RevertConflictError with the found version when the entity has since moved on (version mismatch)", async () => {
  const changeSet = baseChangeSet();
  const item = baseItem({ entityType: "widget", entityId: "entity-1", entityVersionAtApply: 3 });
  const changeSets = new InMemoryChangeSetRepo([changeSet], [item]);
  const registry = createRevertRegistry();
  registry.register("widget", "update", fakeReverter({ currentVersion: 5 }));
  const deps: RevertChangeSetDeps = { changeSets, registry, clock, idGen };

  await assert.rejects(
    () => revertChangeSet({ deps, input: { workspaceId: WS, changeSetId: "cs-1" } }),
    (err: unknown) => {
      assert.ok(err instanceof RevertConflictError);
      assert.equal(
        (err as Error).message,
        "entity 'widget:entity-1' changed since this change set (expected version 3, found 5)"
      );
      return true;
    }
  );
});

test("applies inverses in descending position order (last-applied item is reverted first)", async () => {
  const changeSet = baseChangeSet();
  const items: ChangeSetItemRecord[] = [
    baseItem({ id: "csi-0", entityId: "entity-0", position: 0, entityVersionAtApply: 1 }),
    baseItem({ id: "csi-1", entityId: "entity-1", position: 1, entityVersionAtApply: 1 }),
    baseItem({ id: "csi-2", entityId: "entity-2", position: 2, entityVersionAtApply: 1 }),
  ];
  const changeSets = new InMemoryChangeSetRepo([changeSet], items);
  const applyOrder: string[] = [];
  const registry = createRevertRegistry();
  registry.register(
    "widget",
    "update",
    fakeReverter({
      currentVersion: 1,
      onApplyInverse: (item) => applyOrder.push(item.entityId),
    })
  );
  const deps: RevertChangeSetDeps = { changeSets, registry, clock, idGen };

  await revertChangeSet({ deps, input: { workspaceId: WS, changeSetId: "cs-1" } });

  assert.deepEqual(
    applyOrder,
    ["entity-2", "entity-1", "entity-0"],
    "highest position must be reverted first (undo in reverse apply order)"
  );
});

test("throws ChangeSetInvalidStatusError ('already reverted concurrently') when the status changed between the initial read and the CAS re-check", async () => {
  const changeSet = baseChangeSet();
  const item = baseItem();
  let findCalls = 0;
  const changeSets: ChangeSetRepoPort = {
    async insert() {},
    async findById(required): Promise<ChangeSetWithItems | null> {
      findCalls += 1;
      if (required.id !== "cs-1") return null;
      // First call (precondition read): still applied. Second call (CAS re-check):
      // simulate a concurrent revert that already flipped the status.
      const status = findCalls === 1 ? "applied" : "reverted";
      return { changeSet: { ...changeSet, status }, items: [item] };
    },
    async findByIdempotencyKey() {
      return null;
    },
    async listByWorkspace() {
      return [];
    },
    async save() {},
  };
  const registry = createRevertRegistry();
  registry.register("widget", "update", fakeReverter({ currentVersion: 1 }));
  const deps: RevertChangeSetDeps = { changeSets, registry, clock, idGen };

  await assert.rejects(
    () => revertChangeSet({ deps, input: { workspaceId: WS, changeSetId: "cs-1" } }),
    (err: unknown) => {
      assert.ok(err instanceof ChangeSetInvalidStatusError);
      assert.equal(
        (err as Error).message,
        "change set 'cs-1' was already reverted concurrently"
      );
      return true;
    }
  );
  assert.equal(findCalls, 2, "must re-read the change set for the CAS check after applying inverses");
});

test("enqueues a change-set.reverted event on the outbox when one is provided", async () => {
  const changeSet = baseChangeSet();
  const item = baseItem();
  const changeSets = new InMemoryChangeSetRepo([changeSet], [item]);
  const registry = createRevertRegistry();
  registry.register("widget", "update", fakeReverter({ currentVersion: 1 }));
  const enqueued: DomainEvent[] = [];
  const outbox: OutboxPort = {
    enqueue: async (event) => {
      enqueued.push(event);
    },
    claimPending: async () => [],
    markDelivered: async () => {},
    markFailed: async () => {},
  };
  const deps: RevertChangeSetDeps = { changeSets, registry, clock, idGen, outbox };

  const reverted = await revertChangeSet({ deps, input: { workspaceId: WS, changeSetId: "cs-1" } });

  assert.equal(enqueued.length, 1);
  assert.deepEqual(enqueued[0], {
    id: "id-1",
    name: "change-set.reverted",
    occurredAt: reverted.revertedAt,
    aggregateId: "cs-1",
    workspaceId: WS,
    actorId: undefined,
    changeSetId: "cs-1",
    payload: { changeSetId: "cs-1" },
  });
});

test("completes without enqueuing anything when no outbox is provided", async () => {
  const changeSet = baseChangeSet();
  const item = baseItem();
  const changeSets = new InMemoryChangeSetRepo([changeSet], [item]);
  const registry = createRevertRegistry();
  registry.register("widget", "update", fakeReverter({ currentVersion: 1 }));
  const deps: RevertChangeSetDeps = { changeSets, registry, clock, idGen };

  const reverted = await revertChangeSet({ deps, input: { workspaceId: WS, changeSetId: "cs-1" } });

  assert.equal(reverted.status, "reverted");
  assert.equal(reverted.revertedAt, "2026-08-21T00:00:00.000Z");
});
