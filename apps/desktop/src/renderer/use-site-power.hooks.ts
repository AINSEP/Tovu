/**
 * @file The site card's Start/Stop control: what it should say right now, and what a click does.
 *
 * **Why the app needed this at all.** Nothing in this shell could stop ONE site. Quitting stopped
 * every open site (`before-quit`), deleting one stopped it on the way to erasing it, and that was
 * the list — an operator who wanted a single site down had to find its `tovu serve` in a terminal
 * and kill it, which is exactly the move that costs unsaved work.
 *
 * **The label is derived from status, never from what was clicked.** A button that remembers its
 * own press is the one that lies: a start that fails, a site that dies during a stop, a second
 * window acting on the same site, and the button still says what the click implied. `powerControl`
 * below is a pure function of the status, so the only way to make it say "Stopping…" is for the
 * site to actually be stopping.
 *
 * **Two sources of that status, and the local one is the smaller.** Main owns it — `handleStart`
 * and `handleStop` mark the site `starting`/`stopping` for as long as their work runs
 * (`site-transitions.ts`), and every reader of the polled record sees it. But the poll is every 4 s,
 * so between the click and the next poll the card would still be showing the pre-click status. The
 * `pending` map here closes exactly that gap, and it is dropped the moment the call settles; it is
 * never an answer of its own about a site.
 */
import { useCallback, useState } from 'react';

import { runnerInventoryBridge } from './runner-api.js';
import type { SiteLifecycleStatus, SiteRecord } from '../contracts/project.js';
import { desktopCopy } from '../desktop-i18n.js';

/** Which way a click moves a site. */
export type SitePowerAction = 'start' | 'stop';
type SitePowerOperation = SitePowerAction | 'restart';

/** Await a graceful stop before starting; never start if stopping failed. */
export async function performSiteRestart({ id, bridge }: {
  id: string;
  bridge: Parameters<typeof performPowerAction>[2];
}, { onStopped }: { onStopped?: (record: SiteRecord) => void } = {}): Promise<SitePowerResult> {
  const stopped = await performPowerAction('stop', id, bridge);
  if (stopped.error !== undefined) return stopped;
  onStopped?.(stopped.record);
  return performPowerAction('start', id, bridge);
}

export function restartControl({ project, status, restarting }: {
  project: SiteRecord;
  status: SiteLifecycleStatus;
  restarting: boolean;
}, { locale = typeof navigator === 'undefined' ? 'en' : navigator.language }: { locale?: string } = {}) {
  const copy = desktopCopy({ locale });
  const label = restarting ? copy.restarting : copy.restart;
  return { label, ariaLabel: `${label} ${project.displayName}`, disabled: status !== 'running' || Boolean(project.folderMissing) };
}

/** What the card should render for a site's power control. */
export interface SitePowerControl {
  /** What a click does — `null` while a transition is in flight, which renders the button disabled
   *  rather than hiding it, so the row does not reflow under the pointer mid-press. */
  action: SitePowerAction | null;
  label: string;
  busy: boolean;
}

/**
 * The card's power button for a site in `status`, or `null` when there is no honest button to draw.
 *
 * `provisioning` and `blocked` get `null` rather than a disabled Start: there is nothing to start
 * yet for the first, and never will be for the second, and a control that is permanently inert
 * teaches an operator that this card's buttons sometimes do nothing.
 *
 * `failed` gets Start, not a disabled button — a site whose last boot failed is precisely one an
 * operator wants to try again, and `handleStart` is what they would be reaching for.
 *
 * @complexity O(1).
 */
export function powerControl(status: SiteLifecycleStatus): SitePowerControl | null {
  if (status === 'running') return { action: 'stop', label: 'Stop', busy: false };
  if (status === 'stopped' || status === 'failed') return { action: 'start', label: 'Start', busy: false };
  if (status === 'starting') return { action: null, label: 'Starting…', busy: true };
  if (status === 'stopping') return { action: null, label: 'Stopping…', busy: true };
  return null;
}

/** What {@link useSitePower} returns. */
export interface SitePower {
  /** The status the card should render for this project — its polled one, or the transition this
   *  window started and is still waiting on. */
  statusOf: (project: SiteRecord) => SiteLifecycleStatus;
  /** Why this site's last start or stop failed, or `null`. Main's own sentence, verbatim. */
  errorOf: (id: string) => string | null;
  /** Start a stopped site or stop a running one. A no-op while one is already in flight. */
  toggle: (project: SiteRecord) => Promise<void>;
  restart: (project: SiteRecord) => Promise<void>;
  restartControlOf: (project: SiteRecord) => ReturnType<typeof restartControl>;
}

/** The status a click's own transition reads as while it is in flight. */
export const IN_FLIGHT_STATUS: Record<SitePowerAction, SiteLifecycleStatus> = {
  start: 'starting',
  stop: 'stopping',
};

/** What one start or stop came back with: main's refreshed record, or an operator-facing reason. */
export type SitePowerResult = { record: SiteRecord; error?: undefined } | { record?: undefined; error: string };

/**
 * Run one start or stop against the desktop bridge and report the outcome.
 *
 * Separated from the hook below so the whole decision — which bridge call, what a rejection turns
 * into, what "no bridge at all" means — is directly testable: this package has no React renderer,
 * so anything left inside a `useCallback` can only be asserted against source text. Same split
 * `use-site-rename.hooks.ts` makes, for the same reason.
 *
 * A missing bridge is reported exactly like a rejection rather than thrown: a renderer with no
 * `window.tovuRunner` is a shell that failed to wire its preload, and the card's own error line is
 * where an operator can see that.
 *
 * @returns `{record}` on success — main's, never one composed here from what was clicked.
 * @complexity O(1) beyond the IPC round trip, which for a stop includes the child's own drain.
 */
export async function performPowerAction(
  action: SitePowerAction,
  id: string,
  bridge: { startSite: (id: string) => Promise<SiteRecord>; stopSite: (id: string) => Promise<SiteRecord> } | undefined,
): Promise<SitePowerResult> {
  if (bridge === undefined) return { error: 'The desktop bridge is unavailable.' };
  try {
    return { record: action === 'start' ? await bridge.startSite(id) : await bridge.stopSite(id) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * @param onSiteUpdated applies the refreshed record main resolves with. Optional, and the card is
 *   still correct without it — the 4 s poll would catch up — but up to four seconds of showing a
 *   stopped site as running is exactly the lie this control exists not to tell, so `App.tsx` wires
 *   it. The record is main's, never one composed here from what was clicked.
 * @returns the three things a card needs: the status to render, the failure to show, the click.
 * @complexity O(1) per call; the two maps hold one entry per site with an unsettled action.
 */
export function useSitePower(onSiteUpdated?: (record: SiteRecord) => void): SitePower {
  const [pending, setPending] = useState<Readonly<Record<string, SitePowerOperation>>>({});
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  // A stable lock independent of React's batched render: a fast second click uses the old closure.
  // useState's lazy initializer preserves the Set for this hook's lifetime without scheduling it.
  const [inFlight] = useState(() => new Set<string>());

  const statusOf = useCallback(
    (project: SiteRecord) => {
      const action = pending[project.id];
      return action === undefined ? project.status : action === 'restart' ? 'starting' : IN_FLIGHT_STATUS[action];
    },
    [pending],
  );

  const errorOf = useCallback((id: string) => errors[id] ?? null, [errors]);

  const toggle = useCallback(
    async (project: SiteRecord) => {
      const action = powerControl(statusOf(project))?.action;
      // `null` covers both "nothing to do for this status" and "a transition is already running",
      // so a second click during a stop cannot queue a second one behind it.
      if (action === undefined || action === null || inFlight.has(project.id)) return;

      const id = project.id;
      inFlight.add(id);
      setPending((current) => ({ ...current, [id]: action }));
      setErrors((current) => withoutKey(current, id));

      try {
        const result = await performPowerAction(action, id, runnerInventoryBridge());
        if (result.error === undefined) onSiteUpdated?.(result.record);
        else setErrors((current) => ({ ...current, [id]: result.error }));
      } finally {
        // Cleared on BOTH arms: a start that failed leaves the site stopped, which is what the
        // polled record already says. Holding `starting` after that would be the button remembering
        // its own press — the one thing this control must never do.
        inFlight.delete(id);
        setPending((current) => withoutKey(current, id));
      }
    },
    [onSiteUpdated, statusOf, inFlight],
  );

  const restartControlOf = useCallback((project: SiteRecord) => restartControl({
    project, status: statusOf(project), restarting: pending[project.id] === 'restart',
  }), [pending, statusOf]);

  const restart = useCallback(async (project: SiteRecord) => {
    if (restartControlOf(project).disabled || inFlight.has(project.id)) return;
    const id = project.id;
    inFlight.add(id);
    setPending(current => ({ ...current, [id]: 'restart' as const }));
    setErrors(current => withoutKey(current, id));
    try {
      const result = await performSiteRestart({ id, bridge: runnerInventoryBridge() }, { onStopped: onSiteUpdated });
      if (result.error === undefined) onSiteUpdated?.(result.record);
      else setErrors(current => ({ ...current, [id]: result.error }));
    } finally {
      inFlight.delete(id);
      setPending(current => withoutKey(current, id));
    }
  }, [inFlight, onSiteUpdated, restartControlOf]);

  return { statusOf, errorOf, toggle, restart, restartControlOf };
}

/**
 * `record` without `key`, as a new object — the two maps above are replaced rather than mutated so
 * React sees the change.
 *
 * @complexity O(n) in the map's size, which is the number of sites with an action in flight.
 */
function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}
