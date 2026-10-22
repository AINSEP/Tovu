import { useId, useState, type ReactNode } from "react";
import { TabBar } from "@jini-ai/ui/tab-strip";

import { VisitorToolsPanel } from "./VisitorToolsPanel";

/**
 * Two tabs inside "Visitor's AI Assistant" (owner, 2026-10-22): "AI provider" is the screen that was
 * here before, unchanged; "Visitor tools" is the per-tool Auto | Ask first | Off list. Local state,
 * not a URL param: the outer `?tab=` already names this page tab, and nothing links to the inner one.
 * The tools panel mounts only while its tab is open, so the provider screen issues no extra request.
 */
type InnerTab = "provider" | "tools";

export function VisitorAssistantTabs({ t, providerPanel, toolsPanel }: {
  t: (key: string) => string; providerPanel: ReactNode;
  /** Test seam; defaults to the wired tools panel. */
  toolsPanel?: ReactNode;
}) {
  const [active, setActive] = useState<InnerTab>("provider");
  const panelId = useId();
  return (
    <div className="visitor-assistant-tabs">
      <TabBar ariaLabel={t("Visitor's AI Assistant")} activeId={active}
        onChange={(id) => setActive(id === "tools" ? "tools" : "provider")}
        tabs={[
          { id: "provider", label: t("AI provider"), handle: "ai-assistant-visitor-tab-provider", handleLabel: "Show the visitor AI provider settings" },
          { id: "tools", label: t("Visitor tools"), handle: "ai-assistant-visitor-tab-tools", handleLabel: "Show the visitor tools" },
        ]} />
      <div id={panelId} role="tabpanel" aria-label={active === "tools" ? t("Visitor tools") : t("AI provider")}>
        {active === "tools" ? (toolsPanel ?? <VisitorToolsPanel t={t} />) : providerPanel}
      </div>
    </div>
  );
}
