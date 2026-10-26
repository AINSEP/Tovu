import type { ComponentType } from "react";

import type { AdminPlugin } from "@/lib/api";
import { buildAgentListHandles } from "@jini-ai/agentic";
import { Toast } from "@jini-ai/ui";
import { TabBar, type TabBarTab } from "@jini-ai/ui/tab-strip";
import { resolveActiveTabId } from "@jini-ai/ui/panel-kit";
import { navigate } from "../../lib/router";
import { PluginRow } from "./PluginRow";
import { PluginPackageFilesModal } from "./PluginPackageFilesModal";
import { PluginProviderSettingsDialog } from "./PluginProviderSettingsDialog";
import { PluginRemoveConfirmDialog } from "./PluginRemoveConfirmDialog";
import { AddPluginPanel } from "./AddPluginPanel";
import { UploadIcon } from "./agent-plugins-visuals";
import { addPluginTabSoonTag, marketplaceTabSoonTag } from "./add-plugin-tab-soon";
import { DownloadedTabIcon, InstalledTabIcon, MarketplaceTabIcon, PluginTrashIcon } from "./plugins-visuals";
import { pluginRemoveAriaLabel, pluginRemoveBlocker, pluginToggleAriaLabel, pluginToggleControl } from "./rules";
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
 * toggle-cell decision, subline, and remove-confirm copy live in `rules.ts`. Route `/addons/plugins`;
 * consumes `PLUGINS_LIST`/`PLUGIN_SET_ENABLED`/`PLUGIN_UNINSTALL` (`api.listPlugins()`/
 * `api.setPluginEnabled()`/`api.uninstallPlugin()`) as a black box. Every Installed and Downloaded
 * row also has an eye button opening `PluginPackageFilesModal` (`PLUGIN_FILES`, 2026-09-13) — the
 * same read-only package-files viewer Agent Plugins uses.
 *
 * Four tabs, Installed first (owner correction, applied identically to the sibling screen the same
 * night — Installed before Downloaded, not the other way round):
 *  - **Installed** — every installed plugin, on or off (owner 2026-10-25, the same call Agent
 *    Plugins' Installed got on 2026-09-13: a provider plugin that is installed but off was listed
 *    only under Downloaded). Carries the Enable/Disable toggle unchanged from the pre-split table
 *    (`pluginToggleControl`/`onToggleEnabled`). `?plugin=<id>` scrolls to, focuses and highlights
 *    that row (`usePluginRowFocus`) — a linked agent plugin's padlock on Agent Plugins links here.
 *  - **Downloaded** — every plugin `PLUGINS_LIST` returns, unfiltered (this workspace's on-disk
 *    set). Every row carries Remove, which drives the REAL `PLUGIN_UNINSTALL` route: it deletes the
 *    plugin's on-disk artifact, gated behind `PluginRemoveConfirmDialog`. Remove is usable only
 *    where that route can succeed — a switched-off site plugin. On a built-in row, or a row that is
 *    still on, it is honestly disabled and points at a section note saying why
 *    (`pluginRemoveBlocker`; 2026-09-13 fix — before it, Remove showed ONLY on enabled rows, which
 *    the route always refuses). A disabled row also carries a direct, unconfirmed Enable (written
 *    when Installed listed only enabled rows; Installed's toggle now does the same).
 *  - **Add a plugin** — the shared `InstallTabCard` (`AddPluginPanel.tsx`): a server folder or one
 *    `.zip`, previewed before install. Replaced the header "Install plugin" popup (owner, 2026-10-06),
 *    so all three install screens (Skills, Agent Plugins, Plugins) share one tab and card. On a
 *    server that refuses local installs (`installSources` without "folder", e.g. tovu.dev) the tab is
 *    greyed out and tagged "Soon" instead (owner, 2026-10-17): it has no destination there, so it is
 *    disabled and `?tab=add` falls back to Installed.
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
  /** The `?plugin=` query value: the row Installed scrolls to and highlights. */
  focusPluginId?: string | null;
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   * nothing and behave exactly as before.
   */
  usePluginsHook?: typeof useWiredPlugins;
}

const PLUGINS_TAB_IDS = ["installed", "downloaded", "add", "marketplace"] as const;
type PluginsTabId = (typeof PLUGINS_TAB_IDS)[number];

/** Falls back to the Installed tab for an absent or unrecognized `?tab=` value, and for `add` when
 *  this server refuses local installs (that tab is disabled). Delegates to the shared
 *  `../../lib/resolve-active-tab-id` guard every other URL-deep-linked tabbed admin screen uses. */
function resolvePluginsTabId(tabId: string | null | undefined, canInstall: boolean): PluginsTabId {
  const validIds = canInstall ? PLUGINS_TAB_IDS : PLUGINS_TAB_IDS.filter((id) => id !== "add");
  return resolveActiveTabId({ tabId: tabId, validIds: validIds, defaultId: "installed" });
}

/** The Installed tab's own row list — the Enable/Disable toggle unchanged from the pre-split table,
 *  now living in the row's action slot instead of a `DataTable` cell. */
function InstalledPluginRows({
  plugins,
  controller,
  expandedIds,
  onToggleExpanded,
  rowHandleById,
  focusPluginId,
}: {
  plugins: AdminPlugin[];
  controller: PluginsController;
  expandedIds: ReadonlySet<string>;
  onToggleExpanded: (id: string) => void;
  rowHandleById: Map<string, string>;
  focusPluginId?: string | null | undefined;
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
            {...(plugin.providerSettings ? { onSettings: () => controller.onOpenSettings(plugin.id) } : {})}
            focused={plugin.id === focusPluginId}
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
            {...(plugin.providerSettings ? { onSettings: () => controller.onOpenSettings(plugin.id) } : {})}
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
  focusPluginId?: string | null | undefined;
}

/** The Downloaded tab's two Remove notes, by {@link pluginRemoveBlocker} reason — a disabled Remove
 *  points at the one that explains it. */
const PLUGINS_REMOVE_NOTE_IDS = {
  "built-in": "plugins-remove-unavailable-note",
  enabled: "plugins-remove-enabled-note",
} as const;

/** Installed: every installed plugin, on or off, or an honest empty note when there are none. */
function InstalledPanel({ plugins, controller, rowHandleById, focusPluginId }: PluginsTabPanelProps) {
  const { t } = controller;
  if (plugins.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>{t("No plugins installed.")}</p>
          <p className="page-description">{t("Enabled plugins extend what this site can do.")}</p>
        </div>
      </div>
    );
  }
  return (
    <InstalledPluginRows
      plugins={plugins}
      controller={controller}
      expandedIds={controller.expandedIds}
      onToggleExpanded={controller.onToggleExpanded}
      rowHandleById={rowHandleById}
      focusPluginId={focusPluginId}
    />
  );
}

/** Downloaded: the two remove notes as compact helper text under the tabs, then every plugin — or
 *  its own empty state. The notes sat under the list until the owner moved them up (2026-10-07). */
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
      <div className="plugins-remove-notes">
        <p id={PLUGINS_REMOVE_NOTE_IDS["built-in"]} className="page-description">
          {t("Built-in plugins ship with Tovu itself and have no on-disk files to remove.")}
        </p>
        <p id={PLUGINS_REMOVE_NOTE_IDS.enabled} className="page-description">
          {t("Turn a plugin off on Installed before removing it.")}
        </p>
      </div>
      <DownloadedPluginRows
        plugins={plugins}
        controller={controller}
        expandedIds={controller.expandedIds}
        onToggleExpanded={controller.onToggleExpanded}
        rowHandleById={rowHandleById}
        onRequestRemove={controller.onRequestRemove}
      />
    </>
  );
}

/** Marketplace: a designed empty state — see this file's header for why nothing is listed. Same
 *  capped, centered card as Agent Plugins' Marketplace (owner, 2026-10-17: it ran the full column),
 *  so it reuses that screen's `agent-plugins-marketplace-*` classes rather than a second copy. */
function MarketplacePanel({ controller }: PluginsTabPanelProps) {
  const { t } = controller;
  return (
    <div className="agent-plugins-marketplace-empty" role="note">
      <span className="agent-plugins-marketplace-glyph">
        <MarketplaceTabIcon size={28} />
      </span>
      <h3>{t("Nothing to browse yet")}</h3>
      <p>{t("Marketplace is planned for a future release. Tovu does not fetch, list, or install plugins from a marketplace yet.")}</p>
      {controller.canInstallFolder ? null : (
        <p>{t("Install a plugin by placing its files in this site's plugin install directory.")}</p>
      )}
    </div>
  );
}

/** Add a plugin: the shared install card. Without an install controller (a test hook that omits
 *  it) the tab is empty; on a server that refuses local installs the tab is disabled and never
 *  resolves here. */
function AddPanel({ controller }: PluginsTabPanelProps) {
  return controller.install ? <AddPluginPanel controller={controller.install} /> : null;
}

const PLUGINS_TAB_PANELS: Record<PluginsTabId, ComponentType<PluginsTabPanelProps>> = {
  installed: InstalledPanel,
  downloaded: DownloadedPanel,
  add: AddPanel,
  marketplace: MarketplacePanel,
};

/** `TabBar`'s `onChange`: the active tab lives in the URL (`?tab=`), so switching is a navigation. */
function navigateToPluginsTab(nextTabId: string) {
  navigate(`/addons/plugins?tab=${nextTabId}`, { replace: true });
}

export function Plugins({ tabId, focusPluginId, usePluginsHook = useWiredPlugins }: PluginsProps = {}) {
  const controller = usePluginsHook();
  const { plugins, error, t } = controller;

  // `error && !plugins`, not `error` alone (2026-09-20 platform review, X1): a NEVER-loaded fetch
  // (no `plugins` yet) is still fatal — there is nothing else to show. But once the list has loaded
  // once, a later reload failure (a toggle's post-write re-fetch) must not blank the whole screen —
  // see `LoadedPlugins`'s own error notice below, and `use-plugins.hooks.ts`'s `reload()` header.
  if (error && !plugins) return <div className="notice error">{error}</div>;
  if (!plugins) return <div className="notice">{t("Loading plugins…")}</div>;
  return <LoadedPlugins plugins={plugins} controller={controller} activeTabId={resolvePluginsTabId(tabId, controller.canInstallFolder === true)} focusPluginId={focusPluginId} />;
}

/** The screen once `PLUGINS_LIST` has settled: header, row error, tab bar, the active tab's panel,
 *  and the package-files viewer and Remove confirm dialog (both opened through the controller). */
function LoadedPlugins({ plugins, controller, activeTabId, focusPluginId }: { plugins: AdminPlugin[]; controller: PluginsController; activeTabId: PluginsTabId; focusPluginId?: string | null | undefined }) {
  const { error, rowError, t, locale, inspectedPlugin, pendingRemovePlugin, settingsPlugin } = controller;

  // Plugin ids are stable and unique, same per-row-handle derivation every other list on this
  // workstream uses (`buildAgentListHandles`), computed once from the FULL unfiltered list so a
  // plugin's handle is identical whichever tab currently lists it (mirrors `AgentPluginRow`'s own
  // reasoning for deriving from the id alone, not list position).
  const rowHandles = buildAgentListHandles({ prefix: "plugins-row", ids: plugins.map((plugin) => plugin.id) }
  );
  const rowHandleById = new Map(plugins.map((plugin, index) => [plugin.id, rowHandles[index]!]));
  const ActivePanel = PLUGINS_TAB_PANELS[activeTabId];
  const canInstall = controller.canInstallFolder === true;

  const tabs: TabBarTab[] = [
    { id: "installed", label: t("Installed"), icon: <InstalledTabIcon />, handle: "plugins-tab-installed", handleLabel: "Switch to the Installed tab — every plugin installed for this site, on or off" },
    { id: "downloaded", label: t("Downloaded"), icon: <DownloadedTabIcon />, handle: "plugins-tab-downloaded", handleLabel: "Switch to the Downloaded tab — every plugin on disk for this site, regardless of whether it's turned on" },
    { id: "add", label: t("Add a plugin"), tag: addPluginTabSoonTag(locale, canInstall ? undefined : true), disabled: !canInstall, icon: <UploadIcon />, handle: "plugins-tab-add", handleLabel: "Switch to the Add a plugin tab — install a plugin from a folder on this server or a .zip" },
    { id: "marketplace", label: t("Marketplace"), tag: marketplaceTabSoonTag(locale), icon: <MarketplaceTabIcon />, handle: "plugins-tab-marketplace", handleLabel: "Switch to the Marketplace tab — a future place to discover plugins" },
  ];

  return (
    <div className="page plugins-page">
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
      {/* A reload failure AFTER the list has loaded once (X1) — the list, tabs and dialogs below
       *  stay on screen; only `error && !plugins` in `Plugins` itself is fatal. Same markup as
       *  `rowError` above. */}
      {error ? (
        <div className="notice error">
          <span role="alert">{error}</span>
        </div>
      ) : null}

      <TabBar ariaLabel={t("Plugins")} tabs={tabs} activeId={activeTabId} onChange={navigateToPluginsTab} containerHandle="plugins-tab-bar" />

      <ActivePanel plugins={plugins} controller={controller} rowHandleById={rowHandleById} focusPluginId={focusPluginId} />

      {inspectedPlugin ? <PluginPackageFilesModal plugin={inspectedPlugin} onClose={controller.onCloseInspector} /> : null}

      {settingsPlugin ? (
        <PluginProviderSettingsDialog plugin={settingsPlugin} agentHandleBase={rowHandleById.get(settingsPlugin.id)!} onClose={controller.onCloseSettings} onSaved={controller.onSettingsSaved} />
      ) : null}
      {/* A toast, like Themes' and Library's: it confirms what the owner just did and clears itself. */}
      {controller.settingsNotice ? <Toast message={controller.settingsNotice} role="status" tone="success" ttlMs={6000} onDismiss={controller.dismissSettingsNotice} /> : null}

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
