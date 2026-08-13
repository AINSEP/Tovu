import type {
  ClockPort,
  DomainEvent,
  IdGeneratorPort,
  OutboxPort,
  UUID,
  ChangeSetRecord,
  ChangeSetRepoPort,
} from "@jini-ai/cms/core";
import type { RevertRegistry } from "./appliers";

/**
 * @file Revert executor (ADR-018 C-004).
 *
 * Undoes an applied change set by walking its items in descending `position`
 * and applying each inverse through the inverse-applier registry, under a strict
 * version guard. Preconditions are evaluated in a fixed order (BR-05) and the
 * first failure decides the error — no entity write happens during evaluation,
 * so a failed revert never partially applies (INV-05).
 */

export class ChangeSetNotFoundError extends Error {}
export class ChangeSetInvalidStatusError extends Error {}
export class RevertNotPossibleError extends Error {}
export class RevertConflictError extends Error {
  readonly entityType: string;
  readonly entityId: UUID;
  constructor(message: string, entityType: string, entityId: UUID) {
    super(message);
    this.entityType = entityType;
    this.entityId = entityId;
  }
}

export interface RevertChangeSetDeps {
  changeSets: ChangeSetRepoPort;
  registry: RevertRegistry;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  /** When provided, `change-set.reverted` is enqueued for async consumers. */
  outbox?: OutboxPort;
}

export interface RevertChangeSetRequired {
  deps: RevertChangeSetDeps;
  input: { workspaceId: UUID; changeSetId: UUID };
}

export interface RevertChangeSetOptional {}

export async function revertChangeSet(
  required: RevertChangeSetRequired,
  _optional: RevertChangeSetOptional = {}
): Promise<ChangeSetRecord> {
  const { deps, input } = required;
  const { changeSets, registry } = deps;

  // (1) exists in workspace
  const found = await changeSets.findById({
    workspaceId: input.workspaceId,
    id: input.changeSetId,
  });
  if (!found) {
    throw new ChangeSetNotFoundError(`change set '${input.changeSetId}' was not found`);
  }

  const { changeSet, items } = found;

  // (2) status is applied
  if (changeSet.status !== "applied") {
    throw new ChangeSetInvalidStatusError(
      `change set '${changeSet.id}' is '${changeSet.status}', only 'applied' can be reverted`
    );
  }

  const ordered = [...items].sort((a, b) => b.position - a.position);

  // (3) every item has a registered reverter, (4) every item has a non-null inverse
  for (const item of ordered) {
    const reverter = registry.resolve(item.entityType, item.operation);
    if (!reverter) {
      throw new RevertNotPossibleError(
        `no inverse applier registered for '${item.entityType}/${item.operation}'`
      );
    }
    if (item.inversePayload === undefined) {
      throw new RevertNotPossibleError(
        `change-set item '${item.id}' has no inverse payload and cannot be reverted`
      );
    }
  }

  // (5) every item passes the version guard (strict equality; missing entity fails)
  for (const item of ordered) {
    const reverter = registry.resolve(item.entityType, item.operation)!;
    const current = await reverter.currentVersion({
      workspaceId: input.workspaceId,
      entityId: item.entityId,
    });
    if (current === null || current !== item.entityVersionAtApply) {
      throw new RevertConflictError(
        `entity '${item.entityType}:${item.entityId}' changed since this change set (expected version ${item.entityVersionAtApply}, found ${current ?? "missing"})`,
        item.entityType,
        item.entityId
      );
    }
  }

  // All preconditions passed — apply inverses in descending position (INV-05: all-or-nothing).
  for (const item of ordered) {
    const reverter = registry.resolve(item.entityType, item.operation)!;
    await reverter.applyInverse({
      workspaceId: input.workspaceId,
      item,
    });
  }

  // Compare-and-set: re-assert the change set is still 'applied' before flipping,
  // so a concurrent revert that already flipped it loses here (RT-003 / INV-006).
  const latest = await changeSets.findById({
    workspaceId: input.workspaceId,
    id: input.changeSetId,
  });
  if (!latest || latest.changeSet.status !== "applied") {
    throw new ChangeSetInvalidStatusError(
      `change set '${input.changeSetId}' was already reverted concurrently`
    );
  }

  const reverted: ChangeSetRecord = {
    ...latest.changeSet,
    status: "reverted",
    revertedAt: deps.clock.nowIso(),
  };
  await changeSets.save(reverted);

  if (deps.outbox) {
    const event: DomainEvent<{ changeSetId: UUID }> = {
      id: deps.idGen.newId(),
      name: "change-set.reverted",
      occurredAt: reverted.revertedAt!,
      aggregateId: reverted.id,
      workspaceId: reverted.workspaceId,
      actorId: reverted.actorId,
      changeSetId: reverted.id,
      payload: { changeSetId: reverted.id },
    };
    await deps.outbox.enqueue(event);
  }

  return reverted;
}
