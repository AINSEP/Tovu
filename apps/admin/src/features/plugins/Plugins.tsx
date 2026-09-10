import { useState } from "react";

import type { AdminPlugin } from "@/lib/api";
import { buildAgentListHandles } from "../../lib/agent-list-handles";
import { TabBar, type TabBarTab } from "../../components/TabBar";
import { resolveActiveTabId } from "../../lib/resolve-active-tab-id";
import { navigate } from "../../lib/router";
import { PluginRow } from "./PluginRow";
import { PluginRemoveConfirmDialog } from "./PluginRemoveConfirmDialog";
import { DownloadedTabIcon, InstalledTabIcon, MarketplaceTabIcon, PluginTrashIcon } from "./plugins-visuals";
import { filterInstalledPlugins, pluginRemoveAriaLabel, pluginToggleAriaLabel, pluginToggleControl } from "./rules";
import { useWiredPlugins, type PluginsController } from "./hooks/use-plugins.hooks";

/**
 * @file `Plugins` — the admin `.tovu-plugin` list screen (SPEC-005 REQ-12..18, ui.spec.md), rebuilt
 * from a single flat `DataTable` into the row-based, tabbed shape `AgentPlugins.tsx` (a sibling
 * screen for the unrelated agent-plugins.org standard — see `panels.tsx`'s own "Add-Ons" group
 * comment for why these two are deliberately not the same system) already has, but independent of
 * it: nothing here imports from `AgentPlugins.tsx`/`AgentPluginRow.tsx`, and neither can this file's
 * behavior change by editing those.
 *
 * State and API calls live in `hooks/use-plugins.hooks.ts`; the server-error-message override,
 * toggle-cell decision, subline, and remove-confirm copy live in `rules.ts`. Route `/plugins`;
 * consumes `PLUGINS_LIST`/`PLUGIN_SET_ENABLED`/`PLUGIN_UNINSTALL` (`api.listPlugins()`/
 * `api.setPluginEnabled()`/`api.uninstallPlugin()`) as a black box.
 *
 * Three tabs, Installed first (owner correction, applied identically to the sibling screen the same
 * night — Installed before Downloaded, not the other way round):
 *  - **Installed** — `plugin.enabled === true` only. Carries the Enable/Disable toggle unchanged
 *    from the pre-split table (`pluginToggleControl`/`onToggleEnabled`).
 *  - **Downloaded** — every plugin `PLUGINS_LIST` returns, unfiltered (this workspace's on-disk
 *    set). Row-state-dependent action (2026-09-10 fix): an enabled row carries Remove instead of
 *    the toggle — showing the same switch on both tabs would be redundant once Downloaded already
 *    answers "is it on disk", and unlike `AgentPlugins.tsx`'s own Downloaded tab (which has no real
 *    uninstall route and only relabels its toggle), this Remove drives the REAL `PLUGIN_UNINSTALL`
 *    route: it deletes the plugin's on-disk artifact, gated behind `PluginRemoveConfirmDialog`. A
 *    built-in plugin's Remove is honestly disabled — see `pluginRemoveAriaLabel`/the section note
 *    below. A disabled row instead carries a direct, unconfirmed Enable — the only lever on this
 *    screen to re-activate a plugin once it's off, since Installed only ever lists enabled rows.
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

/** The Downloaded tab's own row list — context-sensitive by row state, mirroring the identical split
 *  `AgentPluginRow`'s `"remove-or-enable"` variant already made for the sibling `AgentPlugins.tsx`
 *  screen (2026-09-09, `9eb2b4ab`/`b65d1695`): an enabled row keeps Remove (confirm-gated, see this
 *  file's own header), a disabled row gets a direct, unconfirmed Enable instead. Before this split
 *  (2026-09-10 fix), Downloaded's action slot was unconditionally Remove, and since Installed only
 *  ever lists `enabled: true` rows, there was no control anywhere on this screen to re-enable a
 *  plugin once disabled — including a quarantined one — short of removing and reinstalling it.
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
  removeNoteId,
  onRequestRemove,
}: {
  plugins: AdminPlugin[];
  controller: PluginsController;
  expandedIds: ReadonlySet<string>;
  onToggleExpanded: (id: string) => void;
  rowHandleById: Map<string, string>;
  removeNoteId: string;
  onRequestRemove: (plugin: AdminPlugin) => void;
}) {
  const { t, locale, rowSavingId, onToggleEnabled } = controller;
  return (
    <ul className="plugin-rows">
      {plugins.map((plugin) => {
        const builtIn = plugin.source === "built-in";
        const busy = rowSavingId === plugin.id;
        const action = plugin.enabled ? (
          <button
            type="button"
            className="plugin-icon-btn"
            disabled={builtIn || busy}
            onClick={() => onRequestRemove(plugin)}
            aria-label={pluginRemoveAriaLabel(plugin, locale)}
            aria-describedby={builtIn ? removeNoteId : undefined}
          >
            <PluginTrashIcon />
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => onToggleEnabled(plugin)} aria-label={pluginToggleAriaLabel(plugin, locale)}>
            {t("Enable")}
          </button>
        );
        return (
          <PluginRow
            key={plugin.id}
            plugin={plugin}
            t={t}
            expanded={expandedIds.has(plugin.id)}
            onToggleExpanded={() => onToggleExpanded(plugin.id)}
            agentHandleBase={rowHandleById.get(plugin.id)!}
            action={action}
          />
        );
      })}
    </ul>
  );
}

export function Plugins({ tabId, usePluginsHook = useWiredPlugins }: PluginsProps = {}) {
  const controller = usePluginsHook();
  const { plugins, error, rowError, t, expandedIds, onToggleExpanded } = controller;
  const activeTabId = resolvePluginsTabId(tabId);

  // Which plugin (by id) is waiting on the Remove confirm dialog, or `null` when it's closed. Stays
  // here rather than moving into `use-plugins.hooks.ts` alongside `expandedIds` — this is
  // presentation flow ("has the operator confirmed yet"), not a network mutation, the same
  // reasoning `AgentPlugins.tsx`'s own `pendingDisable` and `ExternalMcpSettingsPanel.tsx`'s
  // `confirmRemoveId` give for the identical shape of interstitial. An id rather than a plugin
  // object so the confirmed row is always looked up fresh against the current `plugins`.
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const pendingRemovePlugin = plugins?.find((plugin) => plugin.id === pendingRemoveId) ?? null;
  const removeNoteId = "plugins-remove-unavailable-note";

  function handleTabChange(nextTabId: string) {
    navigate(`/plugins?tab=${nextTabId}`, { replace: true });
  }

  if (error) return <div className="notice error">{error}</div>;
  if (!plugins) return <div className="notice">{t("Loading plugins…")}</div>;

  // Plugin ids are stable and unique, same per-row-handle derivation every other list on this
  // workstream uses (`buildAgentListHandles`), computed once from the FULL unfiltered list so a
  // plugin's handle is identical whichever tab currently lists it (mirrors `AgentPluginRow`'s own
  // reasoning for deriving from the id alone, not list position).
  const rowHandles = buildAgentListHandles(
    "plugins-row",
    plugins.map((plugin) => plugin.id),
  );
  const rowHandleById = new Map(plugins.map((plugin, index) => [plugin.id, rowHandles[index]!]));

  const installedPlugins = filterInstalledPlugins(plugins) ?? [];
  const downloadedPlugins = plugins;

  const tabs: TabBarTab[] = [
    { id: "installed", label: t("Installed"), icon: <InstalledTabIcon />, handle: "plugins-tab-installed", handleLabel: "Switch to the Installed tab — plugins this site has turned on" },
    { id: "downloaded", label: t("Downloaded"), icon: <DownloadedTabIcon />, handle: "plugins-tab-downloaded", handleLabel: "Switch to the Downloaded tab — every plugin on disk for this site, regardless of whether it's turned on" },
    { id: "marketplace", label: t("Marketplace"), icon: <MarketplaceTabIcon />, handle: "plugins-tab-marketplace", handleLabel: "Switch to the Marketplace tab — a future place to discover plugins" },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Add-Ons")}</p>
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

      <TabBar ariaLabel={t("Plugins")} tabs={tabs} activeId={activeTabId} onChange={handleTabChange} containerHandle="plugins-tab-bar" />

      {activeTabId === "installed" ? (
        installedPlugins.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <p>{t("No plugins are enabled for this site.")}</p>
              <p className="page-description">{t("Enabled plugins extend what this site can do.")}</p>
            </div>
          </div>
        ) : (
          <InstalledPluginRows
            plugins={installedPlugins}
            controller={controller}
            expandedIds={expandedIds}
            onToggleExpanded={onToggleExpanded}
            rowHandleById={rowHandleById}
          />
        )
      ) : null}

      {activeTabId === "downloaded" ? (
        downloadedPlugins.length === 0 ? (
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
        ) : (
          <>
            <DownloadedPluginRows
              plugins={downloadedPlugins}
              controller={controller}
              expandedIds={expandedIds}
              onToggleExpanded={onToggleExpanded}
              rowHandleById={rowHandleById}
              removeNoteId={removeNoteId}
              onRequestRemove={(plugin) => setPendingRemoveId(plugin.id)}
            />
            <p id={removeNoteId} className="page-description">
              {t("Built-in plugins ship with Tovu itself and have no on-disk files to remove.")}
            </p>
          </>
        )
      ) : null}

      {activeTabId === "marketplace" ? (
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
      ) : null}

      {pendingRemovePlugin ? (
        <PluginRemoveConfirmDialog
          name={pendingRemovePlugin.name}
          agentHandleBase={rowHandleById.get(pendingRemovePlugin.id)!}
          onConfirm={() => {
            setPendingRemoveId(null);
            void controller.onRemovePlugin(pendingRemovePlugin);
          }}
          onCancel={() => setPendingRemoveId(null)}
          t={t}
        />
      ) : null}
    </div>
  );
}
