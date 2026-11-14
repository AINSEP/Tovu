import type { SiteRecord } from '../contracts/project.js';
import type { useSitePower } from './use-site-power.hooks.js';

/** Stop only locally managed sites which are currently running. */
export function createResourceStop({ projects, power }: { projects: readonly SiteRecord[]; power: ReturnType<typeof useSitePower> }, _options = {}) {
  const byId = new Map(projects.map((site) => [site.id, site]));
  const onStop = ({ id }: { id: string }, _options = {}) => {
    const site = byId.get(id);
    if (site && !site.externalUrl && site.status === 'running') void power.toggle(site);
  };
  return onStop;
}
