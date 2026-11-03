/** Serving-host ownership: one supervisor per binding, not one per HTTP request or route import. */
import { createLocalSiteIntentStore, createLocalSiteSupervisor, type LocalSiteSupervisorPort } from "#src/platform/site-dir/index";
import { switcherBaseForBinding, type SiteBinding, isSiteSwitcherEnabled } from "#src/platform/site-dir/index";
import { resolveCheckoutRoot } from "#src/platform/site-dir/product-root";
import { resolveDevTls, resolveDevTlsCertPaths } from "../boot/dev-tls.js";
import { createLocalSiteProcessPort } from "./local-site-process.js";
import { LocalSiteError, startLocalSiteWhenRunning } from "#src/platform/site-dir/index";
/** Each binding's supervisor, with the removal of the process listeners it registered. */
const hosts = new Map<string, { supervisor: LocalSiteSupervisorPort; detach: () => void }>();

/** Count the initial serving site in the warm budget and bind children to its control plane.
 * Outside warm dev, preserve the existing independent-site limit. @complexity O(env keys).
 */
function localSitePoolOptions({ workspaceId, scheme }: { workspaceId?: string; scheme: string },
  { env = process.env }: { env?: NodeJS.ProcessEnv } = {}) {
  const limit = Number(env.TOVU_LOCAL_SITE_LIMIT ?? 3);
  if (env.TOVU_DEV_WARM_SITES !== "1") return { env, maxConcurrent: limit, evictIdle: false };
  return { env: { ...env, TOVU_DEV_WARM_CONTROL_URL: `${scheme}://localhost:${env.PORT ?? 3000}`,
    TOVU_DEV_WARM_CONTROL_WORKSPACE: workspaceId }, maxConcurrent: Math.max(1, limit - 1), evictIdle: true };
}

/** The serving host alone owns warm URLs and the pool. Children delegate to it through Sites
 * HTTP; assistant tools receive the same callback from their composition. @complexity O(sites).
 */
export function warmSiteServerForHost({ binding, workspaceId }: { binding: SiteBinding; workspaceId: string }, _options = {}) {
  if (process.env.TOVU_DEV_WARM_SITES !== "1" || process.env.TOVU_DEV_WARM_CONTROL_URL) return undefined;
  const supervisor = localSiteSupervisorForHost({ binding, workspaceId });
  if (!supervisor) return undefined;
  const tls = resolveDevTls(resolveDevTlsCertPaths(resolveCheckoutRoot()));
  return async ({ name }: { name: string }): Promise<string> => {
    if (name === binding.name) return `${tls.active ? "https" : "http"}://localhost:${process.env.PORT ?? 3000}/admin/`;
    const state = await startLocalSiteWhenRunning({ supervisor, name });
    if (state.status === "running" && state.adminUrl) return state.adminUrl;
    // Never hand out a still-booting URL. Stop this failed request before the restart fallback
    // tries to claim the same site's boot lease.
    if (!state.external) await supervisor.stop({ name });
    throw new LocalSiteError("SITE_START_FAILED");
  };
}

/** Lazy host assembly; no server/child starts here. @complexity O(1). */
export function localSiteSupervisorForHost({ binding, workspaceId }: { binding: SiteBinding; workspaceId?: string }, _optional = {}): LocalSiteSupervisorPort | undefined {
  if (!isSiteSwitcherEnabled()) return undefined;
  if (process.env.TOVU_DEV_WARM_CONTROL_URL) return undefined;
  const base = switcherBaseForBinding(binding);
  if (base === null) return undefined;
  const existing = hosts.get(binding.dir);
  if (existing) return existing.supervisor;
  const tls = resolveDevTls(resolveDevTlsCertPaths(resolveCheckoutRoot()));
  const excludedPorts = [process.env.PORT, process.env.JINI_AGENT_DAEMON_PORT,
    process.env.JINI_AGENT_DAEMON_URL ? new URL(process.env.JINI_AGENT_DAEMON_URL).port : undefined]
    .filter((value) => value !== undefined).map(Number);
  const pool = localSitePoolOptions({ workspaceId, scheme: tls.active ? "https" : "http" });
  const supervisor = createLocalSiteSupervisor({ processPort: createLocalSiteProcessPort({ switcherBase: base }, { env: pool.env }), servingName: binding.name, scheme: tls.active ? "https" : "http" },
    { maxConcurrent: pool.maxConcurrent, excludedPorts, evictIdle: pool.evictIdle,
      ...(process.env.TOVU_DEV_SUPERVISOR_PID ? { devSession: process.env.TOVU_DEV_SUPERVISOR_PID,
        intentPort: createLocalSiteIntentStore({ servingSiteDir: binding.dir }) } : {}) });
  // Run before daemon/store exit handlers can call process.exit; the adapter signals synchronously.
  const shutdown = () => { void supervisor.shutdown().catch(() => {}); };
  const killNow = () => supervisor.killNow();
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) process.prependOnceListener(signal, shutdown);
  process.once("exit", killNow);
  const detach = () => {
    for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) process.removeListener(signal, shutdown);
    process.removeListener("exit", killNow);
  };
  hosts.set(binding.dir, { supervisor, detach });
  return supervisor;
}

/** Called after the API listens: assemble eagerly, then let the old host's tree release its lease.
 * Outside the dev.mjs session this does nothing, including no host assembly or filesystem access.
 * Returns a cancellation for listener closure. @complexity O(1) scheduling; supervisor owns recovery.
 */
export function resumeLocalSitesForHost(
  { binding }: { binding: SiteBinding },
  { env = process.env, forHost = localSiteSupervisorForHost }: { env?: NodeJS.ProcessEnv; forHost?: typeof localSiteSupervisorForHost } = {},
): () => void {
  if (!env.TOVU_DEV_SUPERVISOR_PID) return () => {};
  const supervisor = forHost({ binding });
  if (!supervisor) return () => {};
  const timer = setTimeout(() => {
    void supervisor.resume().catch(error => console.error("Local site resume failed:", error));
  }, 2000);
  timer.unref();
  return () => clearTimeout(timer);
}

/** Listener closure is terminal for its children even when the host process stays alive. A shut
 * down supervisor refuses every later start, so it leaves the cache once stopped: the binding's
 * next {@link localSiteSupervisorForHost} assembles a fresh one. A signal-driven shutdown keeps its
 * entry, since the process is exiting. @complexity O(hosts). */
export async function shutdownLocalSiteHosts(_required: Record<string, never>, _optional = {}): Promise<void> {
  await Promise.all([...hosts].map(async ([dir, host]) => {
    await host.supervisor.shutdown();
    if (hosts.get(dir) !== host) return;
    hosts.delete(dir);
    host.detach();
  }));
}
