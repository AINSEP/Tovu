import { useCallback } from "react";
import { resolveActiveTabId } from "../../lib/resolve-active-tab-id";
import { navigate, useRouteLocation } from "../../lib/router";

const SKILLS_TAB_IDS = ["skills", "add"] as const;

/** URL-backed tabs using the sibling pages' `?tab=` and replacement navigation. */
export function useSkillsTabs() {
  const route = useRouteLocation();
  const requestedTab = new URLSearchParams(route.split("?")[1]).get("tab");
  const activeTabId = resolveActiveTabId(requestedTab, SKILLS_TAB_IDS, "skills");
  const onTabChange = useCallback((tabId: string) => {
    const nextTab = resolveActiveTabId(tabId, SKILLS_TAB_IDS, "skills");
    navigate(`/skills?tab=${nextTab}`, { replace: true });
  }, []);
  const onShowSkills = useCallback(() => onTabChange("skills"), [onTabChange]);
  const onShowAdd = useCallback(() => onTabChange("add"), [onTabChange]);
  return { activeTabId, onTabChange, onShowSkills, onShowAdd };
}
