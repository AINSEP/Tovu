import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { PluginActivationRecord, PluginActivationRepoPort } from "./activation.js";
import { toActivationRecord, toActivationRow } from "./repo.rows.js";

/**
 * @file THE `PluginActivationRepoPort` adapter: one Kysely query body for every database the
 * storage kernel drives (SQLite, PGlite, Postgres). One row per (workspace, plugin); `save` upserts
 * on that key. Every statement goes through `kernel.run` and is awaited. Satisfies
 * `__tests__/integration/repo.contract.test.ts`, the suite `repo.memory.ts` runs identically.
 */
export class SqlPluginActivationRepo implements PluginActivationRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async getActivation(required: { workspaceId: string; pluginId: string }): Promise<PluginActivationRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("plugin_activations")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("plugin_id", "=", required.pluginId)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toActivationRecord(row) : null;
  }

  async save(record: PluginActivationRecord): Promise<void> {
    const row = toActivationRow(record);
    const { workspace_id: _workspaceId, plugin_id: _pluginId, ...set } = row;
    await this.kernel.run((db) =>
      db
        .insertInto("plugin_activations")
        .values(row)
        .onConflict((oc) => oc.columns(["workspace_id", "plugin_id"]).doUpdateSet(set))
        .execute()
    );
  }

  async deleteActivation(required: { workspaceId: string; pluginId: string }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .deleteFrom("plugin_activations")
        .where("workspace_id", "=", required.workspaceId)
        .where("plugin_id", "=", required.pluginId)
        .execute()
    );
  }

  async listAll(): Promise<PluginActivationRecord[]> {
    const rows = await this.kernel.run((db) => db.selectFrom("plugin_activations").selectAll().execute());
    return rows.map(toActivationRecord);
  }
}

/** The plugin-activation repo for `kernel`. */
export function pluginActivationRepoFor(kernel: ContentKernel): SqlPluginActivationRepo {
  return new SqlPluginActivationRepo(kernel);
}
