import { createPluginSourcePolicy, type PluginSourcePolicyPort } from '@jini-ai/plugins/host';

/** One environment adapter for the injected deployment policy. Desktop's server is local even
 * when packaged with production assets; Fly and other production servers remain hosted. */
export function createSitePluginPolicy(required: { env: Readonly<Record<string, string | undefined>> }, _optional = {}): PluginSourcePolicyPort {
  const env = required.env;
  const desktop = env.ELECTRON_RUN_AS_NODE === '1' && !!env.TOVU_DESKTOP_OWNER_PID;
  return createPluginSourcePolicy({ hosted: !!env.FLY_APP_NAME || (env.NODE_ENV === 'production' && !desktop), localInstallOptIn: env.TOVU_PLUGIN_LOCAL_INSTALL === '1' }, {});
}

/** Shared adapter retained for callers outside the composition root. Local sites install directly;
 * hosted folder/ZIP sources remain explicitly opt-in, even for admins. */
export function sitePluginLocalInstallEnabled(required: { env: Readonly<Record<string, string | undefined>> }, _optional = {}): boolean {
  return createSitePluginPolicy(required, {}).localInstallEnabled({}, {});
}
