import { useEffect, useRef } from "react";
import { findActiveTab, resolveInitialActiveTabId, useTabbedDialog, type SettingsDialogTab } from "@jini-ai/ui";
import { navigate } from "@/lib/router";

/** Adapt Jini's tab owner to this page's URL and translated header copy.
 * Invalid or unavailable deep links use the shell's first tab; tab panels stay lazy.
 * @complexity O(n) in the bounded tab list, O(1) retained state.
 */
export function useObservabilityTab({ tabs, tabId }: {
  tabs: readonly SettingsDialogTab[]; tabId?: string | null;
}, _options = {}) {
  const requestedTabId = resolveInitialActiveTabId(tabs, tabId);
  const controller = useTabbedDialog({ tabs, initialActiveTabId: requestedTabId ?? undefined });
  const selectRef = useRef(controller.setActiveTabId);
  selectRef.current = controller.setActiveTabId;
  useEffect(() => {
    if (requestedTabId !== null) selectRef.current(requestedTabId);
  }, [requestedTabId]);
  const activeTabId = resolveInitialActiveTabId(tabs, controller.activeTabId);
  return {
    activeTabId: activeTabId ?? undefined,
    subtitle: findActiveTab(tabs, activeTabId)?.subtitle,
    onTabChange: (nextTabId: string) => {
      controller.setActiveTabId(nextTabId);
      navigate(`/observability?tab=${encodeURIComponent(nextTabId)}`, { replace: true });
    },
  };
}
