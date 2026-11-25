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
export function runningSiteUrl({ record }: { record: DirectoryRunningRecord }, _optional: Record<string, never> = {}): string | null {
  return record.port > 0 ? `${record.scheme}://localhost:${record.port}/admin/` : null;
}
/** Must precede all database reads/writes; a concurrent loser cannot open content.db.
 * Returns an attachment when a live server already owns the database; only a new owner updates it.
 * @param required.purpose `"serve"` (default) for a server; `"maintenance"` for a stopped-site
 *   operation (`tovu storage clean`), whose lease has no address — never call `ready` on it.
 * `isHeld()` re-reads the lease and is true only while the record still carries THIS claim's token
 * (false for an attachment, after release, or when the record is unreadable), so a long stopped-site
 * operation can re-check ownership right before an irreversible step.
 * @throws Malformed locks still fail closed because their database owner cannot be established.
 * @complexity O(1) JSON I/O and liveness probe.
 */
export function claimSiteRunning(
  { dir, app, scheme = "http", purpose = "serve" }: { dir: string; app: "Web" | "Desktop"; scheme?: "http" | "https"; purpose?: "serve" | "maintenance" },
  { workspace = createSitesWorkspace({}), readSite = readSiteDir, log = (line: string) => console.log(line) }: { workspace?: SitesWorkspace; readSite?: typeof readSiteDir; log?: (line: string) => void } = {},
) {
  const claim = workspace.claim({ path: dir, app, scheme, purpose });
  if (!claim.acquired) {
    const url = runningSiteUrl({ record: claim.record });
    log(url ? `Using the site already running in ${claim.record.app}: ${url}` : `Using the site starting in ${claim.record.app}. Its admin URL will be available when that server finishes starting.`);
    // Attachment never owns the other process's token, database or exit cleanup.
    return { attached: claim.record, ready: () => {}, release: () => {}, isHeld: () => false };
  }
  const lock = workspace.running({ path: dir });
  let released = false;
  const release = () => { released = true; lock.release({ token: claim.record.token }); };
  const isHeld = (): boolean => {
    if (released) return false;
    try { return lock.read({})?.token === claim.record.token; } catch { return false; }
  };
  process.once("exit", release);
  return { attached: null, isHeld, ready: ({ port }: { port: number }) => {
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
    release: () => { process.removeListener("exit", release); release(); } };
}
