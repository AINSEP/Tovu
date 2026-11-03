/** Site activation owner: warm navigation first, the existing restart contract as recovery. */
import { activateSite, type ActivateSitePorts, type ActivateSiteRequired, type ActivateSiteResult, type SiteAdminRefusal } from './site-admin.js';
import { listSites, LocalSiteError } from '#src/platform/site-dir/index';

export interface WarmSiteActivationPorts extends ActivateSitePorts {
  warmServer?: (required: { name: string }) => Promise<string>;
  warn?: (message: string) => void;
}

/** Resolve a site-bound URL before changing the default. No global backend is retargeted.
 * Boot failures use the old restart path; capacity protection never restarts a busy host.
 * @complexity O(sites), plus a bounded warm-server readiness wait owned by the supervisor.
 */
export async function activateSiteWithWarmServer(required: ActivateSiteRequired, ports: WarmSiteActivationPorts = {}):
  Promise<(ActivateSiteResult & { url?: string }) | SiteAdminRefusal> {
  if (!required.restartNow || !ports.warmServer) return activateSite(required, ports);
  const match = (ports.listSites ?? listSites)({ cwd: required.switcherBase }).find(site => site.name === required.name);
  if (!match) return { ok: false, code: 'SITE_NOT_FOUND', error: `site '${required.name}' was not found` };
  try {
    const url = await ports.warmServer({ name: required.name });
    // Reuse activation's persistence owner, while a warm lease is deliberately navigable.
    const activated = activateSite({ ...required, currentSiteName: required.name, restartNow: false }, ports);
    return activated.ok ? { ...activated, url, restartInstructions: 'Open this site at its own server URL.' } : activated;
  } catch (error) {
    if (error instanceof LocalSiteError && ['SITE_LIMIT', 'SITE_STOP_FAILED'].includes(error.code)) {
      return { ok: false, code: 'SITE_ALREADY_RUNNING', error: 'The warm sites are busy. Finish their work or stop an idle site before opening another.' };
    }
    (ports.warn ?? console.warn)('tovu dev: warm site could not start; falling back to the restart switch.');
    return activateSite(required, ports);
  }
}
