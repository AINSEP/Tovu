/** Full-site boot, shared with journeys: same static admin bundle + ordinary index entrypoint.
 * The watchdog runs before bundle work too; a killed host cannot strand a Vite build process.
 */
import { journeyAdminBundle } from "./local-admin-bundle.js";
import { createNodeDaemonProcessAdapter } from "@jini-ai/sidecar/supervisor/node";
const parentPid = Number(process.env.TOVU_LOCAL_SITE_OWNER_PID);
if (!Number.isInteger(parentPid) || parentPid < 1) throw new Error("Local site owner is required");
// This adapter is used only to reap this process's own tree; it never launches another child.
const reaper = createNodeDaemonProcessAdapter({ command: process.execPath, args: [], cwd: process.cwd(), env: process.env,
  registry: { readLive: async () => null, write: async () => {}, removeIfCurrent: async () => {} } }, {});
function parentGone() {
  if (process.ppid !== parentPid) return true;
  try { process.kill(parentPid, 0); return false; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH"; }
}
function reapOwnTree() {
  void reaper.terminateProcess({ child: { pid: process.pid, on() {}, kill(_required, { signal = "SIGTERM" } = {}) {
    process.kill(process.pid, signal); return true;
  } } }).catch(() => process.exit(1));
}
const watchdog = setInterval(() => {
  if (!parentGone()) return;
  clearInterval(watchdog); reapOwnTree();
}, 1000);
watchdog.unref();
if (parentGone()) { clearInterval(watchdog); reapOwnTree(); }
else {
  if (!process.env.TOVU_ADMIN_DIST) {
    process.env.TOVU_ADMIN_DIST = await journeyAdminBundle({
      runtimeDir: process.env.TOVU_LOCAL_ADMIN_BUILD_ROOT!, repoRoot: process.env.TOVU_REPO_ROOT!,
    }, { env: process.env });
  }
  await import("../../index.js");
}
