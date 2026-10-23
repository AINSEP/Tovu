import { createPluginSourcePolicy, type PluginSourcePolicyPort } from '@jini-ai/plugins/host';
import { resolveBundledHostSignals } from '../agent-plugins/host-signals.js';
import type { HostSignalOptions } from '../../contracts/core/host-signals.js';

/** One environment adapter for the injected deployment policy. Desktop's server is local even
 * when packaged with production assets; declared hosted platforms remain hosted even on desktop.
 * @param required Env snapshot. @param optional Matched shipped platform facts.
 * @returns Jini's existing source policy; never changes the owner's explicit install opt-in.
 * @example createSitePluginPolicy({ env }, { hostSignals });
 * @complexity O(1) with injected facts; otherwise the synchronous bundled manifest scan. */
export function createSitePluginPolicy(required: { env: Readonly<Record<string, string | undefined>> }, optional: HostSignalOptions = {}): PluginSourcePolicyPort {
  const env = required.env;
  const hostSignals = optional.hostSignals ?? resolveBundledHostSignals({ env });
  const desktop = env.ELECTRON_RUN_AS_NODE === '1' && !!env.TOVU_DESKTOP_OWNER_PID;
  return createPluginSourcePolicy({ hosted: hostSignals.hosted || (env.NODE_ENV === 'production' && !desktop), localInstallOptIn: env.TOVU_PLUGIN_LOCAL_INSTALL === '1' }, {});
}

/** Shared adapter retained for callers outside the composition root. Local sites install directly;
 * hosted folder/ZIP sources remain explicitly opt-in, even for admins.
 * @complexity O(1) with facts; otherwise the bundled scan. No plugin code executes.
 */
export function sitePluginLocalInstallEnabled(required: { env: Readonly<Record<string, string | undefined>> }, optional: HostSignalOptions = {}): boolean {
  return createSitePluginPolicy(required, optional).localInstallEnabled({}, {});
}
