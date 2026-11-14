import type { ChangeSetItemRecord, ChangeSetRecord } from "#src/contracts/core/commands/index";
import { toChangeSetView } from "#src/features/change-sets/tool-registrations";

/**
 * @file HTTP response serializers for change sets (SPEC-001 api.spec §5).
 *
 * `inversePayload` is intentionally NEVER exposed over HTTP — it may hold full
 * content snapshots. Items expose a `revertible` boolean instead.
 */

export function toChangeSetHeaderResponse(changeSet: ChangeSetRecord) {
  return toChangeSetView({ changeSet });
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
