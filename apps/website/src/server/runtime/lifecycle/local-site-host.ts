/** Serving-host ownership: one supervisor per binding, not one per HTTP request or route import. */
import { createLocalSiteSupervisor, type LocalSiteSupervisorPort } from "#src/platform/site-dir/index";
import { switcherBaseForBinding, type SiteBinding, isSiteSwitcherEnabled } from "#src/platform/site-dir/index";
import { resolveCheckoutRoot } from "#src/platform/site-dir/product-root";
import { resolveDevTls, resolveDevTlsCertPaths } from "../boot/dev-tls.js";
import { createLocalSiteProcessPort } from "./local-site-process.js";
/** Each binding's supervisor, with the removal of the process listeners it registered. */
const hosts = new Map<string, { supervisor: LocalSiteSupervisorPort; detach: () => void }>();

/** Lazy host assembly; no server/child starts here. @complexity O(1). */
export function localSiteSupervisorForHost({ binding }: { binding: SiteBinding }, _optional = {}): LocalSiteSupervisorPort | undefined {
  if (!isSiteSwitcherEnabled()) return undefined;
  const base = switcherBaseForBinding(binding);
  if (base === null) return undefined;
  const existing = hosts.get(binding.dir);
  if (existing) return existing.supervisor;
  const tls = resolveDevTls(resolveDevTlsCertPaths(resolveCheckoutRoot()));
  const excludedPorts = [process.env.PORT, process.env.JINI_AGENT_DAEMON_PORT,
    process.env.JINI_AGENT_DAEMON_URL ? new URL(process.env.JINI_AGENT_DAEMON_URL).port : undefined]
    .filter((value) => value !== undefined).map(Number);
  const supervisor = createLocalSiteSupervisor({ processPort: createLocalSiteProcessPort({ switcherBase: base }), servingName: binding.name, scheme: tls.active ? "https" : "http" },
    { maxConcurrent: Number(process.env.TOVU_LOCAL_SITE_LIMIT ?? 3), excludedPorts });
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
