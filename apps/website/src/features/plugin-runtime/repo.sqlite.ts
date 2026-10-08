import { contentKernel, type ContentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { pluginActivationRepoFor, type PluginActivationSqlRequired, type SqlPluginActivationRepo } from "@jini-ai/plugins/host/sql";

/** Binds the site's existing connection and activation table to Jini's single SQL owner. The
 * kernel carries the full content schema; this view exposes only the activation adapter's table.
 * @param required.store The site's storage kernel or existing SQLite content database handle.
 * @returns The Jini activation repository on the same connection, with unchanged columns.
 * @complexity O(1); no queries until a repository method is called.
 * @example sqlitePluginActivationRepoFor({ store: contentDb }, {})
 */
export function sqlitePluginActivationRepoFor(
  required: { store: ContentKernel | ContentDb },
  _optional: Record<string, never> = {},
): SqlPluginActivationRepo {
  return pluginActivationRepoFor({
    kernel: contentKernel(required.store) as unknown as PluginActivationSqlRequired["kernel"],
    tables: { activations: "plugin_activations" },
  }, {});
}
