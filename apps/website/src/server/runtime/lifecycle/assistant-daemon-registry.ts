import { join } from "node:path";
import { readLiveDaemonRegistryRecord } from "@jini-ai/sidecar";
import { createSupervisorRegistry } from "@jini-ai/sidecar/supervisor/node";

type RegistrySite = { siteDir: string };
type RegistryEnvironment = { env?: NodeJS.ProcessEnv };

/** Tovu's launch override must govern discovery too. Reading the binding's directory while the
 * supervisor publishes under TOVU_SITE_DIR can mistake a replacement's 404 for a live run's death.
 * Keep the Tovu filename/precedence here; Jini owns registry storage and process liveness. */
export function resolveAssistantDaemonRegistryPath(
  { siteDir }: RegistrySite,
  { env = process.env }: RegistryEnvironment = {},
): string {
  return join(env.TOVU_SITE_DIR ?? siteDir, "ops", "assistant-daemon.json");
}

/** Recovery snapshots this record before the replacement daemon publishes its address. */
export function readPreviousAssistantDaemon(
  required: RegistrySite,
  optional: RegistryEnvironment & { readRegistry?: typeof readLiveDaemonRegistryRecord } = {},
) {
  return (optional.readRegistry ?? readLiveDaemonRegistryRecord)({
    registryPath: resolveAssistantDaemonRegistryPath(required, optional),
  });
}

/** The child receives this exact path and publishes only after listening. */
export function createAssistantDaemonRegistry(
  required: RegistrySite,
  optional: RegistryEnvironment & { createRegistry?: typeof createSupervisorRegistry } = {},
) {
  const registryPath = resolveAssistantDaemonRegistryPath(required, optional);
  return { registryPath, registry: (optional.createRegistry ?? createSupervisorRegistry)({ registryPath }) };
}
