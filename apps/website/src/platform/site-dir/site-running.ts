/** Server boot owns the lease; host launchers only observe it. Never release on SIGTERM before
 * storage has closed. Process exit (or proven dead-pid cleanup) is the terminal ownership boundary.
 */
import { createSitesWorkspace, type SitesWorkspace } from "./sites-home.js";
import { readSiteDir } from "./read-site-dir.js";
import { SiteDirInvalidError } from "./errors.js";
import type { DirectoryRunningRecord } from "@jini-ai/platform/fs";

export function readSiteRunning({ dir }: { dir: string }, { workspace = createSitesWorkspace({}) }: { workspace?: SitesWorkspace } = {}): DirectoryRunningRecord | null {
  return workspace.running({ path: dir }).read({});
}
export function runningSiteUrl({ record }: { record: DirectoryRunningRecord }, _options = {}): string | null {
  return record.port > 0 ? `${record.scheme}://localhost:${record.port}/admin/` : null;
}
/** Must precede all database reads/writes; a concurrent loser cannot open content.db.
 * @throws An actionable running/starting message; malformed locks also fail closed.
 * @complexity O(1) JSON I/O and liveness probe.
 */
export function claimSiteRunning(
  { dir, app, scheme = "http" }: { dir: string; app: "Web" | "Desktop"; scheme?: "http" | "https" },
  { workspace = createSitesWorkspace({}), readSite = readSiteDir }: { workspace?: SitesWorkspace; readSite?: typeof readSiteDir } = {},
) {
  const claim = workspace.claim({ path: dir, app, scheme });
  if (!claim.acquired) {
    const status = claim.record.port > 0 ? `port ${claim.record.port}` : "starting";
    throw new Error(`Running in ${claim.record.app} (${status}). ${runningSiteUrl({ record: claim.record }) ?? "Wait for this site to finish starting."}`);
  }
  const lock = workspace.running({ path: dir });
  const release = () => lock.release({ token: claim.record.token });
  process.once("exit", release);
  return { ready: ({ port }: { port: number }, _options = {}) => {
    lock.update({ token: claim.record.token, port });
    let site: ReturnType<typeof readSiteDir>;
    try { site = readSite({ dir }); }
    catch (error) {
      // The existing checkout default can run without install-dir markers; do not invent them.
      if (error instanceof SiteDirInvalidError) return;
      throw error;
    }
    workspace.registry({}).merge({ entries: [{ id: site.meta.siteId, name: site.config.name, path: dir, createdBy: app, lastOpened: null }] });
    workspace.registry({}).opened({ path: dir, at: new Date().toISOString() });
  },
    release: (_required: Record<string, never> = {}, _options = {}) => { process.removeListener("exit", release); release(); } };
}
