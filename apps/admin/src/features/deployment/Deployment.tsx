import { agentHandle } from "@jini-ai/agentic";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { navigate } from "../../lib/router";
import { resolveActiveTabId } from "../../lib/resolve-active-tab-id";
import { TabBar, type TabBarTab } from "../../components/TabBar";
import { t } from "./deployment-i18n";
import { OverviewTab } from "./OverviewTab";
import { StaticSiteTab } from "./StaticSiteTab";
import { FullSiteTab } from "./FullSiteTab";
import { DockerfileTab } from "./DockerfileTab";
import { HistoryTab } from "./HistoryTab";
import { FullSiteIcon, HistoryIcon, LayersIcon, OverviewIcon, StaticSiteIcon } from "./deployment-visuals";

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

/** Falls back to the first tab for an absent or unrecognized `?tab=` value. Delegates to the
 *  shared `../../lib/resolve-active-tab-id` guard `Security.tsx`/`SourceControl.tsx`/
 *  `Database.tsx`/`Themes.tsx` all use — same reason `SettingsUi.tsx`'s `requestedTabId` and
 *  `WidgetInstanceEditor`'s `?type=` both apply their own guard (a stale link or a typo must not
 *  blank the panel). */
function resolveDeploymentTabId(tabId: string | null | undefined): DeploymentTabId {
  return resolveActiveTabId(tabId, DEPLOYMENT_TAB_IDS, "overview");
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
   *  `null` when the param is absent). See {@link resolveDeploymentTabId}. */
  tabId?: string | null;
}

export function Deployment(props: DeploymentProps) {
  // No hook file of its own — this shell owns no fetch/state (each tab owns its own), matching
  // `Database.tsx`'s own carve-out for a top-level screen with nothing to inject.
  const locale = useAdminLocale();
  const activeTabId = resolveDeploymentTabId(props.tabId);

  const tabs: TabBarTab[] = [
    {
      id: "overview",
      label: t(locale, "Overview"),
      icon: <OverviewIcon size={16} />,
      handle: "deployment-tab-overview",
      handleLabel: "Switch to the Overview tab — instance diagnostics and the Static vs. Full Site comparison",
    },
    {
      id: "static-site",
      label: t(locale, "Static Site"),
      icon: <StaticSiteIcon size={16} />,
      handle: "deployment-tab-static-site",
      handleLabel: "Switch to the Static Site tab — export a read-only copy of this site's published pages",
    },
    {
      id: "full-site",
      label: t(locale, "Full Site"),
      icon: <FullSiteIcon size={16} />,
      handle: "deployment-tab-full-site",
      handleLabel: "Switch to the Full Site tab — the complete Tovu server, host provider options",
    },
    {
      id: "dockerfile",
      label: t(locale, "Dockerfile"),
      icon: <LayersIcon size={16} />,
      handle: "deployment-tab-dockerfile",
      handleLabel: "Switch to the Dockerfile tab — view, edit and save the repo-root Dockerfile",
    },
    {
      id: "history",
      label: t(locale, "History"),
      icon: <HistoryIcon size={16} />,
      handle: "deployment-tab-history",
      handleLabel: "Switch to the History tab — past builds and deploys",
    },
  ];

  function handleTabChange(nextTabId: string) {
    navigate(`/deployment?tab=${nextTabId}`, { replace: true });
  }

  return (
    <div className="page">
      <div
        className="page-header"
        {...agentHandle("deployment-header", {
          role: "region",
          label: "Deployment panel header — choose how this site gets published",
        })}
      >
        <div className="page-header-text">
          <p className="page-kicker">{t(locale, "Operations")}</p>
          <h1 className="page-title">{t(locale, "Deployment")}</h1>
          <p className="page-description">
            {t(locale, "Choose how this site gets published, and see what self-hosting it involves.")}
          </p>
        </div>
      </div>
      <TabBar
        ariaLabel={t(locale, "Deployment")}
        tabs={tabs}
        activeId={activeTabId}
        onChange={handleTabChange}
        containerHandle="deployment-tab-bar"
      />
      {deploymentTabPanel(activeTabId)}
    </div>
  );
}
