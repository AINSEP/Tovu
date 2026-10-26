import { providerPluginOf } from "#src/features/project-keys/service";
import { sql } from "kysely";
import type { StorageKernel } from "@jini-ai/db/kernel";

/** Presence/revision only: shared site.db is the change signal on local, desktop and Fly. */
export function siteProviderRevisions({ kernel, workspaceId }: { kernel: StorageKernel<unknown>; workspaceId: string }, _optional = {}) {
  return kernel.query<{ id: string; revision: number }>(sql`SELECT id, revision FROM secrets_vault WHERE workspace_id=${workspaceId} AND kind='api-connection' AND id LIKE 'plugin-state:%:provider.config' ORDER BY id`);
}

/** Keep site and project revisions distinct even when both stores contain the same provider id. */
function revisionSnapshot({ project, site }: {
  project: readonly { id: string; revision: number; attached_at: string }[];
  site: readonly { id: string; revision: number }[];
}): Map<string, string> {
  const entries = new Map<string, string[]>();
  for (const [scope, rows] of [["project", project], ["site", site]] as const) for (const row of rows) {
    const pluginId = providerPluginOf({ keyId: row.id });
    if (!pluginId) continue;
    const revisions = entries.get(pluginId) ?? [];
    revisions.push(`${scope}:${row.revision}:${"attached_at" in row ? row.attached_at : ""}`);
    entries.set(pluginId, revisions);
  }
  return new Map([...entries].map(([id, values]) => [id, JSON.stringify(values.sort())]));
}

/** One metadata query per store every 30 seconds; both processes observe saved revisions and detachments. */
export function watchProviderRevisions({ read, readSite = async () => [], reapply }: {
  read: () => Promise<readonly { id: string; revision: number; attached_at: string }[]>;
  readSite?: () => Promise<readonly { id: string; revision: number }[]>;
  reapply: (input: { pluginId: string }) => Promise<"now" | "restart">;
}, optional: { schedule?: (check: () => Promise<void>, intervalMs: number) => () => void } = {}): () => void {
  let previous = new Map<string, string>();
  let running = false;
  let closed = false;
  async function check() {
    if (running || closed) return;
    running = true;
    try {
      const [project, site] = await Promise.all([read(), readSite()]);
      const next = revisionSnapshot({ project, site });
      for (const pluginId of new Set([...previous.keys(), ...next.keys()])) {
        if (!closed && previous.get(pluginId) !== next.get(pluginId)) await reapply({ pluginId });
      }
      previous = next;
    } catch { /* A transient store read must not terminate the site's polling loop. */ }
    finally { running = false; }
  }
  void check();
  const schedule = optional.schedule ?? ((run: () => Promise<void>, intervalMs: number) => {
    const timer = setInterval(() => void run(), intervalMs); timer.unref?.();
    return () => clearInterval(timer);
  });
  const cancel = schedule(check, 30_000);
  return () => { closed = true; cancel(); };
}
