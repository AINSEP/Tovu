import type { Insertable, Selectable } from "kysely";

import type { ContentDatabase } from "../../platform/db/content-database.generated.js";
import { toBool } from "../../platform/db/kernel/index.js";
import type { PluginActivationRecord } from "./activation.js";

/**
 * @file Row mapping for `plugin_activations`, shared by every dialect (the generated
 * `ContentDatabase` snake_case columns; `enabled` is a boolean read through `toBool`). Neutral on
 * purpose — no repo, no driver.
 */

export type PluginActivationRow = Selectable<ContentDatabase["plugin_activations"]>;

/** One `plugin_activations` row as a {@link PluginActivationRecord}; NULL quarantine columns are omitted. */
export function toActivationRecord(row: PluginActivationRow): PluginActivationRecord {
  return {
    pluginId: row.plugin_id,
    workspaceId: row.workspace_id,
    version: row.version,
    enabled: toBool(row.enabled) === true,
    updatedAt: row.updated_at,
    ...(row.quarantined_at === null ? {} : { quarantinedAt: row.quarantined_at }),
    ...(row.quarantine_reason === null ? {} : { quarantineReason: row.quarantine_reason }),
    ...(row.quarantine_failure_count === null ? {} : { quarantineFailureCount: row.quarantine_failure_count }),
  };
}

/** The `plugin_activations` row `save` upserts; absent quarantine fields are written as NULL. */
export function toActivationRow(record: PluginActivationRecord): Insertable<ContentDatabase["plugin_activations"]> {
  return {
    workspace_id: record.workspaceId,
    plugin_id: record.pluginId,
    version: record.version,
    enabled: record.enabled,
    updated_at: record.updatedAt,
    quarantined_at: record.quarantinedAt ?? null,
    quarantine_reason: record.quarantineReason ?? null,
    quarantine_failure_count: record.quarantineFailureCount ?? null,
  };
}
