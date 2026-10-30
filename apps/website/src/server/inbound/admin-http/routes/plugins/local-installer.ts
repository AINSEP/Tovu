import { resolveHostSignals } from "#src/server/runtime/composition/host-signals";
import type { PluginInstallerPort } from "@jini-ai/plugins/host/node";
import { sitePluginLocalInstallEnabled } from "#src/features/plugin-runtime/install";
import type { PluginsRouteDeps } from "./deps.js";

/** The deps that decide whether this server takes local (folder/ZIP) plugin installs. */
export type LocalInstallerDeps = Pick<PluginsRouteDeps, "pluginSourcePolicy" | "pluginInstaller">;

/**
 * The installer to use for a local folder/ZIP install, or `undefined` when this server takes none:
 * the injected source policy (or, when none is wired, the env-derived site policy) keeps local
 * installs off, or no installer is wired. The install routes refuse and the list route offers no
 * install sources on `undefined`.
 */
export function localPluginInstaller(deps: LocalInstallerDeps): PluginInstallerPort | undefined {
  const enabled = deps.pluginSourcePolicy?.localInstallEnabled({}, {}) ?? sitePluginLocalInstallEnabled({ env: process.env, hostSignals: resolveHostSignals({ env: process.env }) });
  return enabled ? deps.pluginInstaller : undefined;
}
