/** Stopping the serving site: its address passes to the most recent other running site. */
import { LocalSiteError, persistActiveSite as persistActiveSiteReal, type LocalSiteSupervisorPort } from '#src/platform/site-dir/index';
import type { DevRestartPort } from '#src/platform/dev-supervisor/index';
import { activateSite, SITE_SWITCH_RESTARTING_NOTICE, type ActivateSitePorts, type ActivateSiteResult } from './site-admin.js';

export interface StopServingRequired {
  switcherBase: string;
  /** The site the caller asked to stop; must be the one this server is serving. */
  name: string;
  currentSiteName: string;
  dirOverridden: boolean;
}

export interface StopServingPorts extends ActivateSitePorts {
  supervisor: Pick<LocalSiteSupervisorPort, 'latestRunning' | 'start' | 'stop'>;
  devRestart: DevRestartPort;
}

/**
 * Hand this server's address to the site started most recently that is still running.
 *
 * Reuses Switch now's restart path: the target's own server stops first, because activation and
 * the dev supervisor both refuse a site that still holds its lease. A refusal after that stop
 * starts the target again, so a failed hand-over never leaves the owner with one site fewer.
 * @throws LocalSiteError `SITE_NOT_SERVING`, `SITE_NO_SWITCH_TARGET`, or `SITE_STOP_FAILED` for a
 * refused hand-over; anything else propagates to the route's generic failure.
 * @returns The activation result, once the supervisor has accepted the restart.
 * @complexity O(sites) for the lookups, plus the target's bounded stop and the supervisor's reply.
 */
export async function stopServingSite(required: StopServingRequired, ports: StopServingPorts): Promise<ActivateSiteResult> {
  const { name, currentSiteName, switcherBase, dirOverridden } = required;
  if (name !== currentSiteName) throw new LocalSiteError('SITE_NOT_SERVING');
  const target = ports.supervisor.latestRunning();
  if (!target) throw new LocalSiteError('SITE_NO_SWITCH_TARGET');
  await ports.supervisor.stop({ name: target.name });
  const startTargetAgain = () => ports.supervisor.start({ name: target.name }).catch(() => undefined);
  const activated = activateSite({ switcherBase, name: target.name, currentSiteName, dirOverridden }, ports);
  if (!activated.ok) {
    await startTargetAgain();
    throw new LocalSiteError('SITE_STOP_FAILED');
  }
  const decision = await ports.devRestart.requestRestart({ reason: `stop '${name}' and serve '${target.name}'` }, { awaitAcceptance: true });
  if (decision && !decision.accepted) {
    (ports.persistActiveSite ?? persistActiveSiteReal)({ name: currentSiteName }, { cwd: switcherBase });
    await startTargetAgain();
    throw new LocalSiteError('SITE_STOP_FAILED');
  }
  return { ...activated, restartInstructions: SITE_SWITCH_RESTARTING_NOTICE, restarting: true };
}
