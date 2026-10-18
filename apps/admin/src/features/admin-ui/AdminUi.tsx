import { resolveActiveTabId } from "@jini-ai/ui/panel-kit";
import { TabBar, type TabBarTab } from "@jini-ai/ui/tab-strip";
import { navigate } from "../../lib/router";
import { AdminThemes } from "../admin-themes";
import { IntegrationsRedirect } from "../integrations";
import { AdminAppearance } from "../settings";
import "./admin-ui.css";

const TAB_IDS = ["theme", "appearance"] as const;
const TABS: TabBarTab[] = [
  { id: "theme", label: "Theme", handle: "admin-ui-tab-theme" },
  { id: "appearance", label: "Appearance", handle: "admin-ui-tab-appearance" },
];

/** Studio's admin-only presentation settings. Shared tabs own interaction; the URL owns selection.
 * Retired Design System links use the shared history-replacing redirect to Appearance.
 * @complexity O(1): two fixed tabs, with one mounted body at a time. */
export function AdminUi({ tabId }: { tabId?: string | null }) {
  if (tabId === "design-system") return <IntegrationsRedirect routePath="/admin-ui?tab=appearance" />;
  const activeId = resolveActiveTabId({ tabId, validIds: TAB_IDS, defaultId: "theme" });
  return (
    <div className="page admin-ui-page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Studio</p>
          <h1 className="page-title">Admin UI</h1>
        </div>
      </div>
      <TabBar
        ariaLabel="Admin UI"
        tabs={TABS}
        activeId={activeId}
        onChange={(nextTabId) => navigate(`/admin-ui?tab=${nextTabId}`, { replace: true })}
        containerHandle="admin-ui-tab-bar"
      />
      {activeId === "theme" ? <AdminThemes /> : null}
      {activeId === "appearance" ? <AdminAppearance /> : null}
    </div>
  );
}
