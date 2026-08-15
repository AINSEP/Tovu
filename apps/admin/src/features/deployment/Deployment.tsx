import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { navigate } from "../../lib/router";
import { TabBar, type TabBarTab } from "../../components/TabBar";
import { t } from "./deployment-i18n";
import { OverviewTab } from "./OverviewTab";
import { StaticSiteTab } from "./StaticSiteTab";
import { FullSiteTab } from "./FullSiteTab";
import { DockerfileTab } from "./DockerfileTab";
import { HistoryTab } from "./HistoryTab";

/**
 * @file The Deployment panel (`/admin/deployment`) — five tabs: Overview, Static Site, Full Site,
 * Dockerfile, History. Replaces the earlier `PlaceholderTabs` stub (Home/GitHub/AWS), which was
 * shaped for the self-hosted-developer audience while the panel's `soon`-scaffolded copy still
 * described the not-yet-built hosted-SaaS product — see `development/docs/deployment/
 * deployment-constraints.md` §9 for that history. The owner has since decided self-hosted-for-
 * developers ships first, which is what these five tabs are built for.
 *
 * `TabBar` (`components/TabBar.tsx`), not `@jini-ai/ui`'s `SettingsDialogShell` — this is a
 * full-page screen, not a dialog-shaped surface. `SettingsDialogShell` bundles its own vertical
 * sidebar plus a kicker/title/subtitle header, which is the right shape for Settings' 13 tabs but
 * would fight this screen's own `.page-header` the same way `PlaceholderTabs.tsx`'s doc comment
 * describes a past `--page-flow` mismatch. `TabBar` is the horizontal, headerless primitive
 * `Pages.tsx`/`ThemeExplore.tsx`-adjacent screens already use for exactly this "one page, several
 * flat tabs" shape.
 *
 * `?tab=` deep-linking follows `SettingsUi.tsx`'s own pattern: `panels.tsx` passes `ctx.query.get
 * ("tab")` in as `tabId`, an unrecognized or absent value falls back to the first tab ("overview")
 * rather than rendering nothing, and switching tabs calls `navigate(..., { replace: true })` so the
 * URL stays a correct deep link without growing the back-button history one entry per click.
 *
 * Each tab is its own top-level component/file (`OverviewTab.tsx`, `StaticSiteTab.tsx`, etc.) — kept
 * separate from the start per this app's per-scope ESLint complexity gate, rather than one large
 * component with five inline branches.
 */

const DEPLOYMENT_TAB_IDS = ["overview", "static-site", "full-site", "dockerfile", "history"] as const;
type DeploymentTabId = (typeof DEPLOYMENT_TAB_IDS)[number];

/** Falls back to the first tab for an absent or unrecognized `?tab=` value — same "don't trust a
 *  raw query value" guard `SettingsUi.tsx`'s `requestedTabId` and `WidgetInstanceEditor`'s `?type=`
 *  both apply, for the same reason (a stale link or a typo must not blank the panel).
 *  @complexity O(1) — fixed-size id list, not caller-controlled. */
function resolveActiveTabId(tabId: string | null | undefined): DeploymentTabId {
  return tabId && (DEPLOYMENT_TAB_IDS as readonly string[]).includes(tabId) ? (tabId as DeploymentTabId) : "overview";
}

/** Dispatches the one active tab's panel as a flat if-chain — same shape `ThemeExplore.tsx`'s
 *  `ThemeExploreMainPane`/`Database.tsx`'s `migrateForwardStep` use for the identical complexity-gate
 *  reason: a component's OWN cyclomatic/cognitive score counts a ternary or `&&` written directly in
 *  its JSX, not one delegated to a plain function like this.
 *  @complexity O(1) — five mutually exclusive branches, no iteration. */
function deploymentTabPanel(activeTabId: DeploymentTabId) {
  if (activeTabId === "overview") return <OverviewTab />;
  if (activeTabId === "static-site") return <StaticSiteTab />;
  if (activeTabId === "full-site") return <FullSiteTab />;
  if (activeTabId === "dockerfile") return <DockerfileTab />;
  return <HistoryTab />;
}

export interface DeploymentProps {
  /** The `?tab=` query value from `panels.tsx`'s `deployment` route (`URLSearchParams.get` returns
   *  `null` when the param is absent). See {@link resolveActiveTabId}. */
  tabId?: string | null;
}

export function Deployment(props: DeploymentProps) {
  // No hook file of its own — this shell owns no fetch/state (each tab owns its own), matching
  // `Database.tsx`'s own carve-out for a top-level screen with nothing to inject.
  const locale = useAdminLocale();
  const activeTabId = resolveActiveTabId(props.tabId);

  const tabs: TabBarTab[] = [
    { id: "overview", label: t(locale, "Overview") },
    { id: "static-site", label: t(locale, "Static Site") },
    { id: "full-site", label: t(locale, "Full Site") },
    { id: "dockerfile", label: t(locale, "Dockerfile") },
    { id: "history", label: t(locale, "History") },
  ];

  function handleTabChange(nextTabId: string) {
    navigate(`/deployment?tab=${nextTabId}`, { replace: true });
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t(locale, "Operations")}</p>
          <h1 className="page-title">{t(locale, "Deployment")}</h1>
          <p className="page-description">
            {t(locale, "Choose how this site gets published, and see what self-hosting it involves.")}
          </p>
        </div>
      </div>
      <TabBar ariaLabel={t(locale, "Deployment")} tabs={tabs} activeId={activeTabId} onChange={handleTabChange} />
      {deploymentTabPanel(activeTabId)}
    </div>
  );
}
