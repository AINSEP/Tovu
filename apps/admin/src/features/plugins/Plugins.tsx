import type { ComponentType } from "react";

import type { AdminPlugin } from "@/lib/api";
import { buildAgentListHandles } from "../../lib/agent-list-handles";
import { TabBar, type TabBarTab } from "../../components/TabBar";
import { resolveActiveTabId } from "../../lib/resolve-active-tab-id";
import { navigate } from "../../lib/router";
import { PluginRow } from "./PluginRow";
import { PluginPackageFilesModal } from "./PluginPackageFilesModal";
import { PluginRemoveConfirmDialog } from "./PluginRemoveConfirmDialog";
import { DownloadedTabIcon, InstalledTabIcon, MarketplaceTabIcon, PluginTrashIcon } from "./plugins-visuals";
import { filterInstalledPlugins, pluginRemoveAriaLabel, pluginRemoveBlocker, pluginToggleAriaLabel, pluginToggleControl } from "./rules";
import { useWiredPlugins, type PluginsController } from "./hooks/use-plugins.hooks";

/**
 * @file `Plugins` — the admin `.tovu-plugin` list screen (SPEC-005 REQ-12..18, ui.spec.md), rebuilt
 * from a single flat `DataTable` into the row-based, tabbed shape `AgentPlugins.tsx` (a sibling
 * screen for the unrelated agent-plugins.org standard — see `panels.tsx`'s own "Integrations" group
 * comment for why these two are deliberately not the same system) already has, but independent of
 * it: nothing here imports from `AgentPlugins.tsx`/`AgentPluginRow.tsx`, and neither can this file's
 * behavior change by editing those.
 *
 * State and API calls live in `hooks/use-plugins.hooks.ts`; the server-error-message override,
 * toggle-cell decision, subline, and remove-confirm copy live in `rules.ts`. Route `/plugins`;
 * consumes `PLUGINS_LIST`/`PLUGIN_SET_ENABLED`/`PLUGIN_UNINSTALL` (`api.listPlugins()`/
 * `api.setPluginEnabled()`/`api.uninstallPlugin()`) as a black box. Every Installed and Downloaded
 * row also has an eye button opening `PluginPackageFilesModal` (`PLUGIN_FILES`, 2026-09-13) — the
 * same read-only package-files viewer Agent Plugins uses.
 *
 * Three tabs, Installed first (owner correction, applied identically to the sibling screen the same
 * night — Installed before Downloaded, not the other way round):
 *  - **Installed** — `plugin.enabled === true` only. Carries the Enable/Disable toggle unchanged
 *    from the pre-split table (`pluginToggleControl`/`onToggleEnabled`).
 *  - **Downloaded** — every plugin `PLUGINS_LIST` returns, unfiltered (this workspace's on-disk
 *    set). Every row carries Remove, which drives the REAL `PLUGIN_UNINSTALL` route: it deletes the
 *    plugin's on-disk artifact, gated behind `PluginRemoveConfirmDialog`. Remove is usable only
 *    where that route can succeed — a switched-off site plugin. On a built-in row, or a row that is
 *    still on, it is honestly disabled and points at a section note saying why
 *    (`pluginRemoveBlocker`; 2026-09-13 fix — before it, Remove showed ONLY on enabled rows, which
 *    the route always refuses). A disabled row also carries a direct, unconfirmed Enable — the only
 *    lever on this screen to re-activate a plugin once it's off, since Installed only ever lists
 *    enabled rows.
 *  - **Marketplace** — a designed empty state; nothing is fetched, listed, or installable (REQ-02:
 *    install is a filesystem operation, placing files under this site's plugin install directory,
 *    not an HTTP one — `api.spec.md` §1 lists no install/marketplace route for this family either).
 *
 * `?tab=` is URL-deep-linked through the shared `resolveActiveTabId` guard, the same idiom
 * `Security.tsx`/`Database.tsx`/`SourceControl.tsx`/`Deployment.tsx` all use — `panels.tsx`'s
 * `plugins` entry passes `ctx.query.get("tab")` through as `tabId`.
 */
export interface PluginsProps {
  /** The `?tab=` query value from `panels.tsx`'s `plugins` route. See {@link resolvePluginsTabId}. */
  tabId?: string | null;
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   * nothing and behave exactly as before.
   */
  usePluginsHook?: typeof useWiredPlugins;
}

const PLUGINS_TAB_IDS = ["installed", "downloaded", "marketplace"] as const;
type PluginsTabId = (typeof PLUGINS_TAB_IDS)[number];

/** Falls back to the Installed tab for an absent or unrecognized `?tab=` value. Delegates to the
 *  shared `../../lib/resolve-active-tab-id` guard every other URL-deep-linked tabbed admin screen
 *  uses. */
function resolvePluginsTabId(tabId: string | null | undefined): PluginsTabId {
  return resolveActiveTabId(tabId, PLUGINS_TAB_IDS, "installed");
}

/** The Installed tab's own row list — the Enable/Disable toggle unchanged from the pre-split table,
 *  now living in the row's action slot instead of a `DataTable` cell. */
function InstalledPluginRows({
  plugins,
  controller,
  expandedIds,
  onToggleExpanded,
  rowHandleById,
}: {
  plugins: AdminPlugin[];
  controller: PluginsController;
  expandedIds: ReadonlySet<string>;
  onToggleExpanded: (id: string) => void;
  rowHandleById: Map<string, string>;
}) {
  const { t, locale, rowSavingId, onToggleEnabled } = controller;
  return (
    <ul className="plugin-rows">
      {plugins.map((plugin) => {
        const control = pluginToggleControl(plugin, rowSavingId, locale);
        return (
          <PluginRow
            key={plugin.id}
            plugin={plugin}
            t={t}
            expanded={expandedIds.has(plugin.id)}
            onToggleExpanded={() => onToggleExpanded(plugin.id)}
            agentHandleBase={rowHandleById.get(plugin.id)!}
            onInspect={() => controller.onInspectPlugin(plugin.id)}
            action={
              <button
                type="button"
                disabled={control.disabled}
                onClick={() => onToggleEnabled(plugin)}
                aria-label={pluginToggleAriaLabel(plugin, locale)}
              >
                {control.label}
              </button>
            }
          />
        );
      })}
    </ul>
  );
}

/** The Downloaded tab's own row list. Every row carries Remove (confirm-gated, see this file's own
 *  header), usable only when {@link pluginRemoveBlocker} finds no reason `PLUGIN_UNINSTALL` would
 *  refuse; otherwise it is disabled and described by the matching section note. A disabled row
 *  also gets a direct, unconfirmed Enable. Before the 2026-09-10 fix there was no control anywhere
 *  on this screen to re-enable a plugin once disabled — including a quarantined one — short of
 *  removing and reinstalling it.
 *
 *  Enable is offered regardless of `source`: unlike Remove (irreversibly destructive for a real
 *  on-disk artifact, so a built-in row's Remove stays honestly disabled), turning a plugin back on
 *  has no comparable cost, so a built-in row gets the same direct control a site-sourced one does. */
function DownloadedPluginRows({
  plugins,
  controller,
  expandedIds,
  onToggleExpanded,
  rowHandleById,
  onRequestRemove,
}: {
  plugins: AdminPlugin[];
  controller: PluginsController;
  expandedIds: ReadonlySet<string>;
  onToggleExpanded: (id: string) => void;
  rowHandleById: Map<string, string>;
  onRequestRemove: (plugin: AdminPlugin) => void;
}) {
  const { t, locale, rowSavingId, onToggleEnabled } = controller;
  return (
    <ul className="plugin-rows">
      {plugins.map((plugin) => {
        const removeBlocker = pluginRemoveBlocker(plugin);
        const busy = rowSavingId === plugin.id;
        const action = (
          <>
            {plugin.enabled ? null : (
              <button type="button" disabled={busy} onClick={() => onToggleEnabled(plugin)} aria-label={pluginToggleAriaLabel(plugin, locale)}>
                {t("Enable")}
              </button>
            )}
            <button
              type="button"
              className="plugin-icon-btn"
              disabled={removeBlocker !== null || busy}
              onClick={() => onRequestRemove(plugin)}
              aria-label={pluginRemoveAriaLabel(plugin, locale)}
              aria-describedby={removeBlocker ? PLUGINS_REMOVE_NOTE_IDS[removeBlocker] : undefined}
            >
              <PluginTrashIcon />
            </button>
          </>
        );
        return (
          <PluginRow
            key={plugin.id}
            plugin={plugin}
            t={t}
            expanded={expandedIds.has(plugin.id)}
            onToggleExpanded={() => onToggleExpanded(plugin.id)}
            agentHandleBase={rowHandleById.get(plugin.id)!}
            onInspect={() => controller.onInspectPlugin(plugin.id)}
            action={action}
          />
        );
      })}
    </ul>
  );
}

/** Every tab panel's inputs — one shape, so {@link PLUGINS_TAB_PANELS} can pick a panel by tab id. */
interface PluginsTabPanelProps {
  plugins: AdminPlugin[];
  controller: PluginsController;
  rowHandleById: Map<string, string>;
}

/** The Downloaded tab's two Remove notes, by {@link pluginRemoveBlocker} reason — a disabled Remove
 *  points at the one that explains it. */
const PLUGINS_REMOVE_NOTE_IDS = {
  "built-in": "plugins-remove-unavailable-note",
  enabled: "plugins-remove-enabled-note",
} as const;

/** Installed: the enabled rows, or an honest empty note when none are. */
function InstalledPanel({ plugins, controller, rowHandleById }: PluginsTabPanelProps) {
  const { t } = controller;
  const installedPlugins = filterInstalledPlugins(plugins) ?? [];
  if (installedPlugins.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>{t("No plugins are enabled for this site.")}</p>
          <p className="page-description">{t("Enabled plugins extend what this site can do.")}</p>
        </div>
      </div>
    );
  }
  return (
    <InstalledPluginRows
      plugins={installedPlugins}
      controller={controller}
      expandedIds={controller.expandedIds}
      onToggleExpanded={controller.onToggleExpanded}
      rowHandleById={rowHandleById}
    />
  );
}

/** Downloaded: every plugin, followed by the built-in note — or its own empty state. */
function DownloadedPanel({ plugins, controller, rowHandleById }: PluginsTabPanelProps) {
  const { t } = controller;
  if (plugins.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>{t("No plugins installed.")}</p>
          <p className="page-description">
            {t(
              "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.",
            )}
          </p>
        </div>
      </div>
    );
  }
  return (
    <>
      <DownloadedPluginRows
        plugins={plugins}
        controller={controller}
        expandedIds={controller.expandedIds}
        onToggleExpanded={controller.onToggleExpanded}
        rowHandleById={rowHandleById}
        onRequestRemove={controller.onRequestRemove}
      />
      <p id={PLUGINS_REMOVE_NOTE_IDS["built-in"]} className="page-description">
        {t("Built-in plugins ship with Tovu itself and have no on-disk files to remove.")}
      </p>
      <p id={PLUGINS_REMOVE_NOTE_IDS.enabled} className="page-description">
        {t("Turn a plugin off on Installed before removing it.")}
      </p>
    </>
  );
}

/** Marketplace: a designed empty state — see this file's header for why nothing is listed. */
function MarketplacePanel({ controller: { t } }: PluginsTabPanelProps) {
  return (
    <div className="card">
      <div className="empty-state" role="note">
        <p>{t("Nothing to browse yet")}</p>
        <p className="page-description">
          {t("Marketplace is planned for a future release. Tovu does not fetch, list, or install plugins from a marketplace yet.")}
        </p>
        <p className="page-description">
          {t("Install a plugin by placing its files in this site's plugin install directory.")}
        </p>
      </div>
    </div>
  );
}

const PLUGINS_TAB_PANELS: Record<PluginsTabId, ComponentType<PluginsTabPanelProps>> = {
  installed: InstalledPanel,
  downloaded: DownloadedPanel,
  marketplace: MarketplacePanel,
};

/** `TabBar`'s `onChange`: the active tab lives in the URL (`?tab=`), so switching is a navigation. */
function navigateToPluginsTab(nextTabId: string) {
  navigate(`/plugins?tab=${nextTabId}`, { replace: true });
}

export function Plugins({ tabId, usePluginsHook = useWiredPlugins }: PluginsProps = {}) {
  const controller = usePluginsHook();
  const { plugins, error, t } = controller;

  if (error) return <div className="notice error">{error}</div>;
  if (!plugins) return <div className="notice">{t("Loading plugins…")}</div>;
  return <LoadedPlugins plugins={plugins} controller={controller} activeTabId={resolvePluginsTabId(tabId)} />;
}

/** The screen once `PLUGINS_LIST` has settled: header, row error, tab bar, the active tab's panel,
 *  and the package-files viewer and Remove confirm dialog (both opened through the controller). */
function LoadedPlugins({ plugins, controller, activeTabId }: { plugins: AdminPlugin[]; controller: PluginsController; activeTabId: PluginsTabId }) {
  const { rowError, t, inspectedPlugin, pendingRemovePlugin } = controller;

  // Plugin ids are stable and unique, same per-row-handle derivation every other list on this
  // workstream uses (`buildAgentListHandles`), computed once from the FULL unfiltered list so a
  // plugin's handle is identical whichever tab currently lists it (mirrors `AgentPluginRow`'s own
  // reasoning for deriving from the id alone, not list position).
  const rowHandles = buildAgentListHandles(
    "plugins-row",
    plugins.map((plugin) => plugin.id),
  );
  const rowHandleById = new Map(plugins.map((plugin, index) => [plugin.id, rowHandles[index]!]));
  const ActivePanel = PLUGINS_TAB_PANELS[activeTabId];

  const tabs: TabBarTab[] = [
    { id: "installed", label: t("Installed"), icon: <InstalledTabIcon />, handle: "plugins-tab-installed", handleLabel: "Switch to the Installed tab — plugins this site has turned on" },
    { id: "downloaded", label: t("Downloaded"), icon: <DownloadedTabIcon />, handle: "plugins-tab-downloaded", handleLabel: "Switch to the Downloaded tab — every plugin on disk for this site, regardless of whether it's turned on" },
    { id: "marketplace", label: t("Marketplace"), icon: <MarketplaceTabIcon />, handle: "plugins-tab-marketplace", handleLabel: "Switch to the Marketplace tab — a future place to discover plugins" },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Integrations")}</p>
          <h1 className="page-title">{t("Plugins")}</h1>
          <p className="page-description">
            {t("Enable or disable plugins discovered in this site's plugin install directory.")}
          </p>
        </div>
      </div>
      {rowError ? (
        <div className="notice error">
          <span role="alert">{rowError}</span>
        </div>
      ) : null}

      <TabBar ariaLabel={t("Plugins")} tabs={tabs} activeId={activeTabId} onChange={navigateToPluginsTab} containerHandle="plugins-tab-bar" />

      <ActivePanel plugins={plugins} controller={controller} rowHandleById={rowHandleById} />

      {inspectedPlugin ? <PluginPackageFilesModal plugin={inspectedPlugin} onClose={controller.onCloseInspector} /> : null}

      {pendingRemovePlugin ? (
        <PluginRemoveConfirmDialog
          name={pendingRemovePlugin.name}
          agentHandleBase={rowHandleById.get(pendingRemovePlugin.id)!}
          onConfirm={() => controller.onConfirmRemove(pendingRemovePlugin)}
          onCancel={controller.onCancelRemove}
          t={t}
        />
      ) : null}
    </div>
  );
}
