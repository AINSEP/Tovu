import { resolveActiveTabId } from "@jini-ai/ui/panel-kit";
import { TabBar, type TabBarTab } from "@jini-ai/ui/tab-strip";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { navigate } from "../../lib/router";
import { AdminThemes } from "../admin-themes";
import { t } from "../admin-themes/admin-themes-i18n";
import { IntegrationsRedirect } from "../integrations";
import { AdminAppearance } from "../settings";
import "./admin-ui.css";

const TAB_IDS = ["theme", "appearance"] as const;

/** Studio's admin-only presentation settings. Shared tabs own interaction; the URL owns selection.
 * Retired Design System links use the shared history-replacing redirect to Appearance.
 * @complexity O(1): two fixed tabs, with one mounted body at a time. */
export function AdminUi({ tabId }: { tabId?: string | null }) {
  const locale = useAdminLocale();
  if (tabId === "design-system") return <IntegrationsRedirect routePath="/admin-ui?tab=appearance" />;
  const activeId = resolveActiveTabId({ tabId, validIds: TAB_IDS, defaultId: "theme" });
  const tabs: TabBarTab[] = [
    { id: "theme", label: t({ locale, key: "Theme" }), handle: "admin-ui-tab-theme" },
    { id: "appearance", label: t({ locale, key: "Appearance" }), handle: "admin-ui-tab-appearance" },
  ];
  return (
    <div className="page admin-ui-page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t({ locale, key: "Studio" })}</p>
          <h1 className="page-title">{t({ locale, key: "Admin UI" })}</h1>
        </div>
      </div>
      <TabBar
        ariaLabel={t({ locale, key: "Admin UI" })}
        tabs={tabs}
        activeId={activeId}
        onChange={(nextTabId) => navigate(`/admin-ui?tab=${nextTabId}`, { replace: true })}
        containerHandle="admin-ui-tab-bar"
      />
      {activeId === "theme" ? <AdminThemes /> : null}
      {activeId === "appearance" ? <AdminAppearance /> : null}
    </div>
  );
}
