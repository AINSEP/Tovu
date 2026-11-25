import { startRoutineSites, type RoutineBootLogEntry, type RoutineSitesDeps } from "./routine-sites.ts";
import { relayWake, type RoutineWakeLogEntry, type RoutineWakeSiteHandle, type WakePowerMonitor, type WakeTimers } from "./routine-wake.ts";

/**
 * @file The desktop-ready routine lifecycle (P3-T1b.T): one background pass that starts registered
 * sites whose beacon says `enabled > 0`, plus the Electron `powerMonitor` `resume` relay.
 *
 * Why its own module rather than inline in `main/index.ts`: every Electron, filesystem and serializer
 * edge is injected, so `desktop-agent-service.test.ts` runs the whole lifecycle with fakes. Why the
 * release flag is a required input: the root binds `ROUTINES_RELEASE_ENABLED` once; tests opt in.
 */

export interface DesktopRoutinesDeps {
  releaseEnabled: boolean;
  listSites: RoutineSitesDeps["listSites"];
  readBeacon: RoutineSitesDeps["readBeacon"];
  /** The serialized background start (`startRoutineSiteInBackground`): withdrawal is rechecked inside the site's key. */
  backgroundStart: (input: { siteDir: string }) => Promise<unknown>;
  isRunning: RoutineSitesDeps["isRunning"];
  isWithdrawn: RoutineSitesDeps["isWithdrawn"];
  powerMonitor: WakePowerMonitor;
  /** Every running site handle; ownership is filtered by the relay itself, never trusted from here. */
  ownedRunningSites: () => readonly RoutineWakeSiteHandle[];
  timers: WakeTimers;
  log: (entry: RoutineBootLogEntry | RoutineWakeLogEntry) => void;
}

/** Arms both halves; `dispose` removes the resume listener and any pending debounce (call on quit). */
export function armDesktopRoutines(deps: DesktopRoutinesDeps, _optional = {}): { booted: Promise<{ started: string[] }>; dispose: () => void } {
  if (!deps.releaseEnabled) return { booted: Promise.resolve({ started: [] }), dispose: () => {} };
  const dispose = relayWake({ powerMonitor: deps.powerMonitor, ownedRunningSites: deps.ownedRunningSites, timers: deps.timers, log: deps.log });
  const booted = startRoutineSites({ listSites: deps.listSites, readBeacon: deps.readBeacon, startSite: deps.backgroundStart,
    isRunning: deps.isRunning, isWithdrawn: deps.isWithdrawn, log: deps.log, policy: "registered-enabled-except-withdrawn" }, { releaseEnabled: true });
  return { booted, dispose };
}
