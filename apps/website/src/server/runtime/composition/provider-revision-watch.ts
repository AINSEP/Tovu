import { sql } from "kysely";
import type { StorageKernel } from "@jini-ai/db/kernel";

/** Presence/revision only: shared site.db is the change signal on local, desktop and Fly. */
export function siteProviderRevisions({ kernel, workspaceId }: { kernel: StorageKernel<unknown>; workspaceId: string }, _optional = {}) {
  return kernel.query<{ id: string; revision: number }>(sql`SELECT id, revision FROM secrets_vault WHERE workspace_id=${workspaceId} AND kind='api-connection' AND id LIKE 'plugin-state:%:provider.config' ORDER BY id`);
}

// The polling watcher lives in `@jini-ai/plugins/host` (`watchProviderRevisions`); Tovu binds its key
// format there as `pluginIdOf: providerPluginOf` (composition/deps.ts).
