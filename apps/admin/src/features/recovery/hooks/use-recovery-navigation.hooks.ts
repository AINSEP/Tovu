import { useCallback } from "react";
import type { AdminRestorePoint } from "@/lib/api";
import { navigate } from "@/lib/router";
import { resolveActiveTabId } from "@/lib/resolve-active-tab-id";

const RECOVERY_TAB_IDS = ["restore-points", "restore"] as const;

export interface RecoveryNavigationPort {
  navigate: typeof navigate;
}

const defaultNavigationPort: RecoveryNavigationPort = { navigate };

/** Navigation is a feature-local adapter: the shared Jini shell owns presentation, and the
 * Recovery route owns the selected restore point and URL. No create/restore API calls here. */
export function useRecoveryNavigation(
  { tabId, setSelected }: {
    tabId?: string | null;
    setSelected: (point: AdminRestorePoint | null) => void;
  },
  { port = defaultNavigationPort }: { port?: RecoveryNavigationPort } = {},
) {
  // A stale link or typo must open the list rather than blank the panel. Same shared guard
  // Database uses; the shell's controlled prop must never receive a raw query value.
  const activeTabId = resolveActiveTabId(tabId, RECOVERY_TAB_IDS, "restore-points");
  const onTabChange = useCallback((nextTabId: string) => {
    const next = resolveActiveTabId(nextTabId, RECOVERY_TAB_IDS, "restore-points");
    port.navigate(`/recovery?tab=${next}`, { replace: true });
  }, [port]);

  // Selecting a row and backing out both navigate explicitly, rather than deriving the active
  // tab from selected: the two sections remain independently reachable through ?tab=.
  const onSelectPoint = useCallback((point: AdminRestorePoint) => {
    setSelected(point);
    port.navigate("/recovery?tab=restore", { replace: true });
  }, [port, setSelected]);
  const onBackFromFlow = useCallback(() => {
    setSelected(null);
    port.navigate("/recovery?tab=restore-points", { replace: true });
  }, [port, setSelected]);

  return { activeTabId, onTabChange, onSelectPoint, onBackFromFlow };
}
