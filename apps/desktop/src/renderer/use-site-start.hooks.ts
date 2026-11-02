/**
 * @file Starting a site from its own tab (`SiteStartPanel`): one bridge call, the hook around it,
 * and the Start handler. Split out of `App.hooks.ts` (which still re-exports all of it) with no
 * behaviour change.
 */
import { useState } from 'react';
import { siteOperationError } from './site-shell-policy.js';
import { runnerInventoryBridge } from './runner-api.js';
import type { BridgeLookup } from './bridge-lookup.js';
import type { SiteRecord } from '../contracts/project.js';

/** What one `startSite` call came back with: main's refreshed record, or an operator-facing
 *  reason — {@link useSiteStart}'s own counterpart to `use-site-power.hooks.ts`'s
 *  `SitePowerResult`. */
export type SiteStartResult = { record: SiteRecord; error?: undefined } | { record?: undefined; error: string };

/**
 * Runs one `startSite` call against the desktop bridge and reports the outcome.
 *
 * Separated from {@link useSiteStart} for the identical reason `use-site-power.hooks.ts` splits
 * `performPowerAction` out of `useSitePower`: this package has no React renderer, so anything left
 * inside a hook's own closure can only be asserted against source text. This is the plain function
 * a test can call directly.
 *
 * A missing bridge is reported exactly like a rejected call rather than thrown — `useSiteStart`'s
 * `error` state is where an operator reads either one, matching `performPowerAction`'s own
 * contract verbatim (same message shape, same "no exception" rule).
 *
 * @returns `{record}` on success — main's own refreshed record, never one composed here from
 *   whatever was on screen before the click. That record is what lets a caller apply the outcome
 *   the instant this resolves, instead of waiting on `useSitesPolling`'s 4s poll to notice.
 * @complexity O(1) beyond the IPC round trip, which for a start includes the child's own boot
 *   (`DEFAULT_READY_TIMEOUT_MS`, up to 60s).
 */
export async function performSiteStart(
  id: string,
  bridge: { startSite: (id: string) => Promise<SiteRecord> } | undefined,
): Promise<SiteStartResult> {
  if (bridge === undefined) return { error: 'Tovu desktop connection required to start a website.' };
  try {
    return { record: await bridge.startSite(id) };
  } catch (err) {
    return { error: siteOperationError({ error: err, operation: 'start' }) };
  }
}

/**
 * `SiteStartPanel`'s start/pending/error state.
 *
 * Starting from here rather than only from the grid matters because this is where the operator
 * already is when they find out — the tab was opened expecting a site.
 *
 * **`onSiteUpdated` is what closes the gap between "main's call resolved" and "this tab's own
 * `project` prop agrees".** Before it existed, nothing was set locally on success at all: the
 * button's `starting` flag cleared the instant `startSite` resolved, reverting to an enabled,
 * idle-looking "Start site" — while the site had, in fact, already finished its 40-75s boot — and
 * stayed that way for up to `useSitesPolling`'s own 4s before `project.status` caught up to
 * `running` and `SiteWorkspace` swapped this panel for the guest. An operator glancing back in
 * that window saw a button that looked like their click had done nothing. Passing main's own
 * resolved record straight to `App`'s `applySiteRecord` (the same setter `use-site-power.hooks.ts`
 * already wires for the grid card) removes the wait entirely: the prop update and the button
 * clearing land in the same tick.
 *
 * Deliberately NOT built on `useDeleteConfirmation`'s shape, even though both are a "pending flag
 * + error string around one async call": on a missing bridge, `start` sets `error` and returns
 * WITHOUT ever setting `starting` true — a call that never got as far as attempting the action
 * shouldn't flash a loading state. `useDeleteConfirmation`'s `confirmDelete` always sets its
 * pending flag first and lets the try/catch around the call itself produce the error. A shared
 * generic "set pending, run this, catch" wrapper can't reproduce the early return without either
 * special-casing it (which defeats sharing) or setting `starting` true for one tick it was never
 * true for before. That is a real, if small, behaviour change, so the two stay separate.
 *
 * `start` resolves to whether it actually started the site — `false` on a missing bridge or a
 * caught `startSite` error, `true` otherwise — rather than throwing. It never rejects: both failure
 * paths are already reported through `error` state, so a caller does not also need a try/catch.
 * That boolean is what lets {@link startThenNotify} tell a real start apart from a failed attempt
 * that merely finished.
 *
 * @param onSiteUpdated applies main's refreshed record the moment a start resolves. Optional, and
 *   the tab is still eventually correct without it — the 4s poll gets there — but see this
 *   function's own doc above for why that gap is exactly the bug an operator can see.
 */
export function useSiteStart(
  project: SiteRecord,
  onSiteUpdated?: (record: SiteRecord) => void,
  { getBridge = runnerInventoryBridge }: { getBridge?: BridgeLookup<'startSite'> } = {},
): {
  starting: boolean;
  error: string | null;
  start: () => Promise<boolean>;
} {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setStarting(true);
    setError(null);
    const result = await performSiteStart(project.id, getBridge());
    try {
      if (result.error !== undefined) {
        setError(result.error);
        return false;
      }
      onSiteUpdated?.(result.record);
      return true;
    } finally {
      setStarting(false);
    }
  };

  return { starting, error, start };
}

/**
 * `SiteStartPanel`'s Start handler: awaits `start`, then calls `onStarted` only if `start` reports
 * it actually started the site.
 *
 * Both of `SiteStartPanel`'s `onStarted` call sites (`App.tsx`'s stalled/failed workspace overlays)
 * pass `workspace.recover`, which remounts the `<webview>` for a fresh attempt at loading the
 * guest. Remounting is only worth doing when the start it is reacting to actually happened — on a
 * failed attempt (missing bridge, or `startSite` itself failing) nothing changed for the guest to
 * find, so recovering would just remount into the same failure or stall. `useSiteStart`'s `start`
 * never rejects (a missing bridge or a caught error both resolve, having recorded `error` state
 * instead), so telling the two apart means reading the resolved boolean rather than whether the
 * promise settled at all. If `start` does reject for some other reason, `onStarted` is skipped and
 * the rejection reaches the caller, same as before.
 *
 * @complexity O(1) plus `start`'s own cost.
 */
export function startThenNotify(
  start: () => Promise<boolean>,
  onStarted: (() => void) | undefined,
): () => Promise<void> {
  return async () => {
    const started = await start();
    if (started) onStarted?.();
  };
}
