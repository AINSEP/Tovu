import { createHash } from "node:crypto";

import type { PublishContentOutcomeRow } from "./planner.js";
import type { PackedEntity } from "./type-registry.js";

/** Stable command key for one source version; reviewed file reverts also bind the destination version. */
export function publishContentItemIdempotencyKey(input: {
  workspaceId: string;
  sourcePrincipalId: string;
  entity: PackedEntity;
  sourceReplacement?: PublishContentOutcomeRow["sourceReplacement"];
}): string {
  const exactVersion = JSON.stringify([
    input.workspaceId,
    input.sourcePrincipalId,
    input.entity.entityType,
    input.entity.id,
    input.entity.schemaVersion,
    input.entity.hashVersion,
    input.entity.contentHash,
  ]);
  return `publish-content:v1:${createHash("sha256").update(exactVersion).digest("hex")}` +
    (input.sourceReplacement ? `:${input.sourceReplacement.version}` : "");
}
