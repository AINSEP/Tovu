import { useVisitorAssistantTabs } from "./VisitorAssistantTabs.hooks";
import { useId, type ReactNode } from "react";
import { resolveTabBarTabIndex, tabHandleProps, useTabBarKeyboard } from "@jini-ai/ui/tab-strip";

import { VisitorToolsPanel } from "@jini-ai/admin/screens/assistant-settings/VisitorToolsPanel";
import { visitorToolsPanelBindings } from "./hooks/visitor-tools-dependencies.hooks";
// The segmented pill's look (`.jini-chat-settings-segmented`) lives with the chat dock's styles.
import "../../styles/assistant.css";

/**
 * Two tabs inside "Visitor's AI Assistant" (owner, 2026-10-22): "AI provider" is the screen that was
 * here before, unchanged; "Visitor tools" is the per-tool Auto | Ask first | Off list. Local state,
 * not a URL param: the outer `?tab=` already names this page tab, and nothing links to the inner one.
 * The tools panel mounts only while its tab is open, so the provider screen issues no extra request.
 *
 * Drawn as the Auto | Ask first | Off segmented pill (owner, 2026-10-24: "the active one is white and
 * the inactives are gray"), not `<TabBar>`'s underline row: same `.jini-chat-settings-segmented`
 * classes, but tab buttons on TabBar's own keyboard/roving-tabindex helpers, so it stays a tablist.
 */

export function VisitorAssistantTabs({ t, providerPanel, toolsPanel, useVisitorAssistantTabsHook = useVisitorAssistantTabs, useTabBarKeyboardHook = useTabBarKeyboard }: {
  t: (key: string) => string; providerPanel: ReactNode;
  /** Test seam; defaults to the wired tools panel. */
  toolsPanel?: ReactNode;
  useVisitorAssistantTabsHook?: typeof useVisitorAssistantTabs;
  useTabBarKeyboardHook?: typeof useTabBarKeyboard;
}) {
  const { active, select } = useVisitorAssistantTabsHook({});
  const panelId = useId();
  const tabs = [
    { id: "provider", label: t("AI provider"), handle: "ai-assistant-visitor-tab-provider", handleLabel: "Show the visitor AI provider settings" },
    { id: "tools", label: t("Visitor tools"), handle: "ai-assistant-visitor-tab-tools", handleLabel: "Show the visitor tools" },
  ];
  const { onKeyDown } = useTabBarKeyboardHook({ tabs, activeId: active, onChange: select });
  return (
    <div className="visitor-assistant-tabs">
      <div className="jini-chat-settings-segmented" role="tablist" aria-label={t("Visitor's AI Assistant")} onKeyDown={onKeyDown}>
        {tabs.map(tab => (
          <button key={tab.id} type="button" role="tab" className="jini-chat-settings-segment"
            aria-selected={active === tab.id} tabIndex={resolveTabBarTabIndex({ tabs, activeId: active, tab })}
            onClick={() => select(tab.id)} {...tabHandleProps({ tab })}>
            {tab.label}
          </button>
        ))}
      </div>
      <div id={panelId} role="tabpanel" aria-label={active === "tools" ? t("Visitor tools") : t("AI provider")}>
        {active === "tools" ? (toolsPanel ?? <VisitorToolsPanel t={t} {...visitorToolsPanelBindings} />) : providerPanel}
      </div>
    </div>
  );
}
