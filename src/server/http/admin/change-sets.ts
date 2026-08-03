import type { ChangeSetItemRecord, ChangeSetRecord } from "#src/core/commands/index";

/**
 * @file HTTP response serializers for change sets (SPEC-001 api.spec §5).
 *
 * `inversePayload` is intentionally NEVER exposed over HTTP — it may hold full
 * content snapshots. Items expose a `revertible` boolean instead.
 */

export function toChangeSetHeaderResponse(changeSet: ChangeSetRecord) {
  return {
    id: changeSet.id,
    workspaceId: changeSet.workspaceId,
    actorId: changeSet.actorId ?? null,
    status: changeSet.status,
    summary: changeSet.summary,
    intentRef: changeSet.intentRef ?? null,
    createdAt: changeSet.createdAt,
    appliedAt: changeSet.appliedAt ?? null,
    revertedAt: changeSet.revertedAt ?? null,
  };
}

export function toChangeSetItemResponse(item: ChangeSetItemRecord) {
  return {
    id: item.id,
    entityType: item.entityType,
    entityId: item.entityId,
    operation: item.operation,
    revertible: item.inversePayload !== undefined,
    entityVersionAtApply: item.entityVersionAtApply ?? null,
    position: item.position,
  };
}
