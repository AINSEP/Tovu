import { useEffect, useState } from "react";
import { resolveActiveTabId } from "@/lib/resolve-active-tab-id";
import { navigate } from "@/lib/router";

const TAB_IDS = ["installed", "downloaded", "add", "marketplace"] as const;

/** URL changes (including browser navigation) and shell clicks use the same guarded tab set. */
export function useAgentPluginTab({ tabId }: { tabId?: string | null }, _optional = {}) {
  const resolved = resolveActiveTabId(tabId, TAB_IDS, "installed");
  const [activeTabId, setActiveTabId] = useState<string>(resolved);
  useEffect(() => setActiveTabId(resolved), [resolved]);
  return {
    activeTabId,
    onActiveTabIdChange: (next: string) => {
      const guarded = resolveActiveTabId(next, TAB_IDS, "installed");
      setActiveTabId(guarded);
      navigate(`/agent-plugins?tab=${guarded}`, { replace: true });
    },
  };
}
