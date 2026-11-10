/** Local lifecycle writes and confirmation live in the controller, never in card markup. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useInvalidate } from "@jini-ai/ui/fetch-query";
import { startVisibleInterval, type VisibilitySource, type IntervalTimers } from "@/lib/visible-interval";
import { describeApiError, type AdminLocalSiteAction, type AdminSitesSnapshot } from "@/lib/api";
import { interpolate, type Translate } from "@jini-ai/ui/panel-kit";
import { KEYS, SERVING_CHAT_WARNING_KEY, siteWriteErrorKey } from "../rules";
import type { SitesPort } from "./sites-port.hooks";

const nativeConfirm = (message: string) => window.confirm(message);
export const LOCAL_SITE_CONFIRM_KEYS = {
  trash: "Move this site to Trash? You can restore it later.",
  delete: "Permanently delete this site and all its data? This cannot be undone.",
  switch: "Switch now? Unsaved changes will be lost.",
  "stop-serving": "Stop {name} and move this address to {target}? {target} restarts here, and anything running on either site stops.",
};
type ConfirmableAction = keyof typeof LOCAL_SITE_CONFIRM_KEYS;

/** Whether an action asks the operator first (Trash, permanent delete, Switch now). */
function isConfirmable(action: AdminLocalSiteAction): action is ConfirmableAction {
  return action in LOCAL_SITE_CONFIRM_KEYS;
}

/** Whether the snapshot's capabilities let `action` run at all: Switch now needs `canSwitchNow`,
 *  every other action needs local management, a permanent delete also needs its checkbox, and
 *  Stop on the serving site needs a site to hand its address to. */
function localActionAllowed(
  { action, canSwitchNow, enabled, deleteChecked, stopServingTarget }: { action: AdminLocalSiteAction; canSwitchNow: boolean; enabled: boolean; deleteChecked: boolean; stopServingTarget: string | null },
): boolean {
  if (action === "switch" ? !canSwitchNow : !enabled) return false;
  if (action === "stop-serving") return stopServingTarget !== null;
  return action !== "delete" || deleteChecked;
}

/** The confirmation body. Stop on the serving site names who takes over and warns about a chat,
 *  so a hand-over never cuts a chat off silently. @complexity O(1). */
function localActionConfirmMessage(
  { action, name, stopServing, t }: { action: ConfirmableAction; name: string; stopServing: AdminSitesSnapshot["stopServing"]; t: Translate },
): string {
  const message = t(LOCAL_SITE_CONFIRM_KEYS[action]);
  if (action !== "stop-serving") return message;
  const named = interpolate({ template: message, vars: { name, target: stopServing?.target ?? "" } });
  return stopServing?.chatRunning ? `${named} ${t(SERVING_CHAT_WARNING_KEY)}` : named;
}

/** Whether the host accepted Switch now and is restarting, rather than only saving the default. */
function restartAccepted(result: unknown): boolean {
  return (result as { restarting?: boolean } | undefined)?.restarting === true;
}

/** The operator-facing message for a failed lifecycle write: this feature's own copy for its codes,
 *  otherwise the shared `describeApiError` fallback. */
function localActionErrorMessage(failure: unknown, t: Translate): string {
  const key = siteWriteErrorKey(failure);
  if (key) return t(key);
  return describeApiError(failure instanceof Error ? failure : new Error("Request failed"), t("That request failed."));
}

/** Only an enabled local host with an unfinished start needs startup polling. */
function localSiteIsStarting({ enabled, snapshot }: { enabled: boolean; snapshot: AdminSitesSnapshot | undefined }): boolean {
  return enabled && snapshot?.localSites?.some(site => site.status === "starting") === true;
}

/** DI confirms allow cancellation and double-click tests without mocking browser modules.
 * Restart refreshes use the live binding, stop after 60 seconds, and release on unmount.
 * @complexity O(1) state and work per tick; invalidation reuses the cached Sites read.
 */
export function useLocalSites(
  { port, snapshot, t }: { port: SitesPort; snapshot: AdminSitesSnapshot | undefined; t: Translate },
  { confirm = nativeConfirm, visibility = document, timers }: {
    /** Receives the translated message plus the action, so a modal can title and tone itself. */
    confirm?: (message: string, context: { action: ConfirmableAction }) => boolean | Promise<boolean>;
    /** Visibility and timer ports keep lifecycle polling testable without replacing modules. */
    visibility?: VisibilitySource;
    timers?: IntervalTimers;
  } = {},
) {
  const invalidate = useInvalidate();
  const [busyName, setBusyName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [switchTarget, setSwitchTarget] = useState<{ name: string; deadline: number } | null>(null);
  const busy = useRef(false);
  const enabled = snapshot?.localManagementEnabled === true;
  const canSwitchNow = snapshot?.canSwitchNow === true;
  const stopServing = snapshot?.stopServing;
  const stopServingTarget = stopServing?.available === true ? stopServing.target : null;
  const activeSiteName = snapshot?.currentSite.name;
  const refresh = useCallback(() => invalidate({ key: KEYS.list }), [invalidate]);
  const starting = localSiteIsStarting({ enabled, snapshot });
  // Idle hosts need no timer. Refresh only an unfinished start or accepted restart; broad
  // idle invalidation used to refetch shares and publish permissions every three seconds.
  useEffect(() => {
    if (switchTarget && activeSiteName === switchTarget.name) {
      setSwitchTarget(null);
      return undefined;
    }
    if (!starting && !switchTarget) return undefined;
    // Replace the slow poll while a restart is pending; a saved default alone is not completion.
    return startVisibleInterval(() => {
      if (switchTarget && Date.now() >= switchTarget.deadline) setSwitchTarget(null);
      refresh();
    }, switchTarget ? 300 : 3000, visibility, timers);
  }, [starting, switchTarget, activeSiteName, refresh, visibility, timers]);
  function handleSwitchResult(name: string, result: unknown) {
    const url = (result as { url?: unknown } | undefined)?.url;
    if (typeof url === "string") port.openSite?.(url);
    else if (restartAccepted(result)) setSwitchTarget({ name, deadline: Date.now() + 60_000 });
    else setError(t("This host could not switch now. The default is saved for the next launch."));
  }
  const run = useCallback(async (name: string, action: AdminLocalSiteAction) => {
    if (busy.current || !port.manageLocalSite) return;
    if (!localActionAllowed({ action, canSwitchNow, enabled, deleteChecked: checked[name] === true, stopServingTarget })) return;
    busy.current = true;
    setBusyName(name); setError(null);
    try {
      if (isConfirmable(action) && !(await confirm(localActionConfirmMessage({ action, name, stopServing, t }), { action }))) return;
      const result = await port.manageLocalSite({ name, action, confirmed: true, checked: checked[name] === true });
      if (action === "switch") handleSwitchResult(name, result);
      // The server restarts onto the hand-over target, so the page waits for that site, not this one.
      if (action === "stop-serving" && stopServingTarget !== null) handleSwitchResult(stopServingTarget, result);
      refresh();
    } catch (failure) {
      setError(localActionErrorMessage(failure, t));
    }
    finally { busy.current = false; setBusyName(null); }
  }, [port, canSwitchNow, enabled, stopServing, stopServingTarget, checked, confirm, t, refresh]);
  const toggleChecked = useCallback((id: string, value: boolean) => setChecked((current) => ({ ...current, [id]: value })), []);
  return { busyName, error, checked, toggleChecked, run };
}
export type LocalSitesController = ReturnType<typeof useLocalSites>;
