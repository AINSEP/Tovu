/** Serving-host ownership: one supervisor per binding, not one per HTTP request or route import. */
import { createLocalSiteSupervisor, type LocalSiteSupervisorPort } from "#src/platform/site-dir/local-site-supervisor";
import { switcherBaseForBinding, type SiteBinding, isSiteSwitcherEnabled } from "#src/platform/site-dir/index";
import { resolveCheckoutRoot } from "#src/platform/site-dir/product-root";
import { resolveDevTls, resolveDevTlsCertPaths } from "../boot/dev-tls.js";
import { createLocalSiteProcessPort } from "./local-site-process.js";
const hosts = new Map<string, LocalSiteSupervisorPort>();

/** Lazy host assembly; no server/child starts here. @complexity O(1). */
export function localSiteSupervisorForHost({ binding }: { binding: SiteBinding }, _optional = {}): LocalSiteSupervisorPort | undefined {
  if (!isSiteSwitcherEnabled()) return undefined;
  const base = switcherBaseForBinding(binding);
  if (base === null) return undefined;
  const existing = hosts.get(binding.dir);
  if (existing) return existing;
  const tls = resolveDevTls(resolveDevTlsCertPaths(resolveCheckoutRoot()));
  const excludedPorts = [process.env.PORT, process.env.JINI_AGENT_DAEMON_PORT,
    process.env.JINI_AGENT_DAEMON_URL ? new URL(process.env.JINI_AGENT_DAEMON_URL).port : undefined]
    .filter((value) => value !== undefined).map(Number);
  const supervisor = createLocalSiteSupervisor({ processPort: createLocalSiteProcessPort({ switcherBase: base }), servingName: binding.name, scheme: tls.active ? "https" : "http" },
    { maxConcurrent: Number(process.env.TOVU_LOCAL_SITE_LIMIT ?? 3), excludedPorts });
  hosts.set(binding.dir, supervisor);
  // Run before daemon/store exit handlers can call process.exit; the adapter signals synchronously.
  const shutdown = () => { void supervisor.shutdown().catch(() => {}); };
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) process.prependOnceListener(signal, shutdown);
  process.once("exit", () => supervisor.killNow());
  return supervisor;
}

/** Listener closure is terminal for its children even when the host process stays alive. */
export async function shutdownLocalSiteHosts(_required: Record<string, never>, _optional = {}): Promise<void> {
  await Promise.all([...hosts.values()].map((host) => host.shutdown()));
}
