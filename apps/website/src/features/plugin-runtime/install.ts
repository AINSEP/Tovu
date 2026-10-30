import { createPluginSourcePolicy, type PluginSourcePolicyPort } from '@jini-ai/plugins/host';
import type { PluginHostFactsPort } from './service-ports.js';

/** One environment adapter for the injected deployment policy. Desktop's server is local even
 * when packaged with production assets; declared hosted platforms remain hosted even on desktop.
 * @param required Env snapshot and matched shipped platform facts.
 * @returns Jini's existing source policy; never changes the owner's explicit install opt-in.
 * @example createSitePluginPolicy({ env, hostSignals });
 * @complexity O(1) with injected facts. */
export function createSitePluginPolicy(required: { env: Readonly<Record<string, string | undefined>> } & PluginHostFactsPort, _optional: Record<string, never> = {}): PluginSourcePolicyPort {
  const env = required.env;
  const hostSignals = required.hostSignals;
  const desktop = env.ELECTRON_RUN_AS_NODE === '1' && !!env.TOVU_DESKTOP_OWNER_PID;
  return createPluginSourcePolicy({ hosted: hostSignals.hosted || (env.NODE_ENV === 'production' && !desktop), localInstallOptIn: env.TOVU_PLUGIN_LOCAL_INSTALL === '1' }, {});
}

/** Shared adapter retained for callers outside the composition root. Local sites install directly;
 * hosted folder/ZIP sources remain explicitly opt-in, even for admins.
 * @complexity O(1) with facts. No plugin code executes.
 */
export function sitePluginLocalInstallEnabled(required: { env: Readonly<Record<string, string | undefined>> } & PluginHostFactsPort, _optional: Record<string, never> = {}): boolean {
  return createSitePluginPolicy(required).localInstallEnabled({}, {});
}
