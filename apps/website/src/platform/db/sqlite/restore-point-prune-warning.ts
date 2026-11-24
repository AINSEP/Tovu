import { formatErrorForLog } from "@jini-ai/core";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";

/** The host's `onPruneWarning` port for `SqliteRestorePointsRepo`: the copy and its row are already saved, so a
 *  failed cleanup of older restore points is only a redacted warning. Both restore-point constructions use it.
 *  @complexity O(1). */
export function warnRestorePointPruneFailed({ error }: { error: unknown }, _optional = {}): void {
  console.warn("[restore-points] Could not prune older restore points.", formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS));
}
