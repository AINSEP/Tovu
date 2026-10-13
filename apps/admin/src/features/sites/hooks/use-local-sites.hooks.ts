/** Local lifecycle writes and confirmation live in the controller, never in card markup. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useInvalidate } from "@jini-ai/ui/fetch-query";
import { startVisibleInterval, type VisibilitySource, type IntervalTimers } from "@/lib/visible-interval";
import { describeApiError, type AdminLocalSiteAction, type AdminSitesSnapshot } from "@/lib/api";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { KEYS, siteWriteErrorKey } from "../rules";
import type { SitesPort } from "./sites-port.hooks";

const nativeConfirm = (message: string) => window.confirm(message);
export const LOCAL_SITE_CONFIRM_KEYS = {
  trash: "Move this site to Trash? You can restore it later.",
  delete: "Permanently delete this site and all its data? This cannot be undone.",
  switch: "Switch now? Unsaved changes will be lost.",
};

/** DI confirms allow cancellation and double-click tests without mocking browser modules. */
export function useLocalSites(
  { port, snapshot, t }: { port: SitesPort; snapshot: AdminSitesSnapshot | undefined; t: Translate },
  { confirm = nativeConfirm, visibility = document, timers }: {
    /** Receives the translated message plus the action, so a modal can title and tone itself. */
    confirm?: (message: string, context: { action: keyof typeof LOCAL_SITE_CONFIRM_KEYS }) => boolean | Promise<boolean>;
    /** Visibility and timer ports keep lifecycle polling testable without replacing modules. */
    visibility?: VisibilitySource;
    timers?: IntervalTimers;
  } = {},
) {
  const invalidate = useInvalidate();
  const [busyName, setBusyName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const busy = useRef(false);
  const enabled = snapshot?.localManagementEnabled === true;
  const refresh = useCallback(() => invalidate({ key: KEYS.list }), [invalidate]);
  // Poll only local-management hosts. A crash/ready transition is host state, not a content event.
  useEffect(() => {
    if (!enabled) return;
    return startVisibleInterval(refresh, 3000, visibility, timers);
  }, [enabled, refresh, visibility, timers]);
  const run = useCallback(async (name: string, action: AdminLocalSiteAction) => {
    if (busy.current || !port.manageLocalSite) return;
    if (action === "switch" ? snapshot?.canSwitchNow !== true : !enabled) return;
    if (action === "delete" && checked[name] !== true) return;
    busy.current = true;
    setBusyName(name); setError(null);
    try {
      const confirmable = action as keyof typeof LOCAL_SITE_CONFIRM_KEYS;
      const key = LOCAL_SITE_CONFIRM_KEYS[confirmable];
      if (key && !(await confirm(t(key), { action: confirmable }))) return;
      const result = await port.manageLocalSite({ name, action, confirmed: true, checked: checked[name] === true });
      if (action === "switch" && (result as { restarting?: boolean })?.restarting !== true) {
        setError(t("This host could not switch now. The default is saved for the next launch."));
      }
      refresh();
    } catch (failure) {
      const key = siteWriteErrorKey(failure);
      setError(key ? t(key) : describeApiError(failure instanceof Error ? failure : new Error("Request failed"), t("That request failed.")));
    }
    finally { busy.current = false; setBusyName(null); }
  }, [port, snapshot, enabled, checked, confirm, t, refresh]);
  const toggleChecked = useCallback((id: string, value: boolean) => setChecked((current) => ({ ...current, [id]: value })), []);
  return { busyName, error, checked, toggleChecked, run };
}
export type LocalSitesController = ReturnType<typeof useLocalSites>;
