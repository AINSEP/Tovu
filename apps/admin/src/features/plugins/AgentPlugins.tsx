import {
  I18nProvider,
  SETTINGS_DIALOG_DICTIONARIES,
  SettingsDialogShell,
  type SettingsDialogTab,
} from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { agentHandle } from "@jini-ai/agentic";
import { useId, useState } from "react";

import type { AdminAgentPlugin } from "@/lib/api";
import { buildAgentListHandles } from "../../lib/agent-list-handles";
import { AgentPluginDetailsModal } from "./AgentPluginDetailsModal";
import { AgentPluginDisableConfirmDialog } from "./AgentPluginDisableConfirmDialog";
import { AgentPluginRow, type AgentPluginRowStateControl } from "./AgentPluginRow";
import { InstalledIcon, MarketplaceIcon } from "./agent-plugins-visuals";
import { filterEnabledAgentPlugins, humanizeAgentPluginId } from "./rules";
import { useWiredAgentPlugins, type AgentPluginsController } from "./hooks/use-agent-plugins.hooks";
import type { Translate } from "@/lib/dictionary-translator";

const AGENT_PLUGINS_SPEC_URL = "https://agent-plugins.org/specification";

/**
 * The panel's non-row messages: a failed load, an unsettled first load, a refused toggle, and a
 * genuinely empty scoped list.
 *
 * Extracted from `AgentPlugins` rather than inlined as four more ternaries in the tab array — that
 * shape put `AgentPlugins` at a complexity of 13 against this repo's ceiling of 9
 * (`check:admin-complexity-drift`). The split is along a real seam: these four are all "something
 * other than a list of plugins", and none of them needs a row handle or the modal.
 *
 * `toggleError` is deliberately separate from `error` and uses `role="alert"`, not `role="status"`:
 * a load failure is the state of the screen, while a refused toggle is the outcome of something the
 * operator just did and should interrupt.
 *
 * Split from `agentPlugins` as a THIRD parameter (`visiblePlugins`) since the Downloaded/Installed
 * split (2026-09-09): `agentPlugins` (the controller's raw, unfiltered load) still answers "has the
 * load settled", but "is the list genuinely empty" now depends on the TAB's own scope — Installed
 * can read `agentPlugins.length > 0` while still being empty of ENABLED rows. Collapsing these two
 * questions back into one, as the pre-split version did, would show Installed's "loading" state
 * forever whenever Downloaded had rows but none were enabled.
 */
function AgentPluginsStatus({
  agentPlugins,
  visiblePlugins,
  error,
  toggleError,
  emptyMessage,
  t,
}: {
  agentPlugins: AgentPluginsController["agentPlugins"];
  visiblePlugins: readonly AdminAgentPlugin[];
  error: AgentPluginsController["error"];
  toggleError: AgentPluginsController["toggleError"];
  emptyMessage: string;
  t: Translate;
}) {
  return (
    <>
      {error ? (
        <p className="agent-plugins-alert" role="status">
          {error}
        </p>
      ) : null}
      {!agentPlugins && !error ? <p role="status">{t("Loading Agent Plugins…")}</p> : null}
      {toggleError ? (
        <p className="agent-plugins-alert" role="alert">
          {toggleError}
        </p>
      ) : null}
      {agentPlugins && visiblePlugins.length === 0 ? (
        <p className="agent-plugins-empty-note" role="status">
          {emptyMessage}
        </p>
      ) : null}
    </>
  );
}

/** The row list itself, scoped to whichever tab is rendering it. Rendered only when there is at
 *  least one row, so it carries no emptiness branch of its own — {@link AgentPluginsStatus} owns
 *  that case.
 *
 * `stateControlFor` replaced a direct `controller.onToggleEnabled` call here (2026-09-09): once
 * Installed kept the real switch and Downloaded traded it for a Remove/Enable action (see
 * `AgentPluginRow`'s own header on the split), the two tabs need genuinely different per-row
 * `AgentPluginRowStateControl` values, not the same callback rendered two ways — so this list asks
 * its caller (a factory, computed once per tab in `AgentPlugins`) for one, per plugin, rather than
 * hard-coding either shape itself. */
function AgentPluginList({
  agentPlugins,
  controller,
  uninstallNoteId,
  stateControlFor,
}: {
  agentPlugins: AdminAgentPlugin[];
  controller: AgentPluginsController;
  uninstallNoteId: string;
  stateControlFor: (plugin: AdminAgentPlugin) => AgentPluginRowStateControl;
}) {
  // Plugin ids are stable and unique, same per-row-handle derivation every other list on this
  // workstream uses (`buildAgentListHandles`). Derived from each id alone (see that function's own
  // doc), so a plugin's row handle is identical whichever tab currently lists it.
  const rowHandles = buildAgentListHandles(
    "agent-plugin-row",
    agentPlugins.map((plugin) => plugin.pluginId),
  );

  return (
    <ul className="agent-plugin-rows">
      {agentPlugins.map((plugin, index) => (
        <AgentPluginRow
          key={plugin.pluginId}
          plugin={plugin}
          t={controller.t}
          locale={controller.locale}
          expanded={controller.expandedIds.has(plugin.pluginId)}
          busy={controller.togglingIds.has(plugin.pluginId)}
          onToggleExpanded={() => controller.onToggleExpanded(plugin.pluginId)}
          stateControl={stateControlFor(plugin)}
          onInspect={() =>
            controller.inspectPlugin({ id: plugin.pluginId, displayName: humanizeAgentPluginId(plugin.pluginId) })
          }
          uninstallNoteId={uninstallNoteId}
          agentHandleBase={rowHandles[index]!}
        />
      ))}
    </ul>
  );
}

/**
 * The shared shell both list tabs (Downloaded, Installed) render through: the status line(s), the
 * row list when the tab's own scope is non-empty, and the section-wide uninstall-unavailable
 * footnote plus spec link. Introduced with the Downloaded/Installed split (2026-09-09) so those two
 * tabs — which differ only in WHICH rows they scope to and their own copy, never in markup — share
 * one implementation instead of two copies that could drift.
 *
 * `visiblePlugins` is the tab's own already-scoped list (all of them for Downloaded, only the
 * enabled ones for Installed via `filterEnabledAgentPlugins`) — `null` while the underlying load
 * hasn't settled yet, same convention `AgentPluginsController.agentPlugins` uses.
 */
function AgentPluginListPanel({
  controller,
  uninstallNoteId,
  stateControlFor,
  sectionLabel,
  lede,
  emptyMessage,
  visiblePlugins,
}: {
  controller: AgentPluginsController;
  uninstallNoteId: string;
  stateControlFor: (plugin: AdminAgentPlugin) => AgentPluginRowStateControl;
  sectionLabel: string;
  lede: string;
  emptyMessage: string;
  visiblePlugins: AdminAgentPlugin[] | null;
}) {
  const { t, agentPlugins, error, toggleError } = controller;

  return (
    <section className="jini-settings-section" aria-label={sectionLabel}>
      <p className="agent-plugins-lede">{lede}</p>
      <AgentPluginsStatus
        agentPlugins={agentPlugins}
        visiblePlugins={visiblePlugins ?? []}
        error={error}
        toggleError={toggleError}
        emptyMessage={emptyMessage}
        t={t}
      />
      {visiblePlugins && visiblePlugins.length > 0 ? (
        <AgentPluginList
          agentPlugins={visiblePlugins}
          controller={controller}
          uninstallNoteId={uninstallNoteId}
          stateControlFor={stateControlFor}
        />
      ) : null}
      {/* `.agent-plugins-footnotes` (styles.css): section-wide facts, not per-plugin details, so
          they stay siblings of the list — but with their own separation, so they read as a footer
          rather than a stray line butted against the last row. Both list tabs share this exact
          footnote (and its handle) rather than each carrying their own — only one tab's panel is
          ever mounted at a time (`TabbedDialog` renders `activeTab.panel` alone), so there is no id
          collision in the live DOM. */}
      <div className="agent-plugins-footnotes">
        <p id={uninstallNoteId} className="jini-field-hint">
          {t("Uninstall is unavailable: these packages ship with Tovu and are restored on the next restart.")}
        </p>
        <p className="jini-field-hint">
          {t("Package format:")}{" "}
          <a
            href={AGENT_PLUGINS_SPEC_URL}
            target="_blank"
            rel="noreferrer"
            {...agentHandle("agent-plugins-spec-link", { role: "link", label: "Open the Agent Plugins open standard specification" })}
          >
            {t("Agent Plugins open standard")}
          </a>
        </p>
      </div>
    </section>
  );
}

type AgentPluginListPanelProps = Pick<
  Parameters<typeof AgentPluginListPanel>[0],
  "controller" | "uninstallNoteId" | "stateControlFor"
>;

/**
 * Downloaded tab: every package on disk for this workspace, unfiltered — the pre-split
 * `InstalledPanel`'s exact content, retitled. There is no cross-site "downloaded" registry (see
 * `agent-plugins/ws/<workspace>/packages/`), so this list is scoped to the current workspace, not
 * global — the copy below says so rather than implying otherwise.
 *
 * Reuses the pre-split lede and empty-state copy VERBATIM rather than rewording them for
 * "downloaded": a downloaded package that is not yet enabled is exactly the "sits inert until you
 * enable it" case those strings already describe. (Correction: an earlier revision of this comment
 * claimed both were already translated into every `plugins-i18n.ts` locale — checked and false,
 * neither has ever had a dictionary entry, pre-dating this split. Reusing them verbatim doesn't
 * regress anything either way, but the claim itself was wrong and is not repeated here.)
 */
function DownloadedPanel(props: AgentPluginListPanelProps) {
  return (
    <AgentPluginListPanel
      {...props}
      sectionLabel={props.controller.t("Downloaded Agent Plugins")}
      lede={props.controller.t(
        "An installed plugin sits inert until you enable it. Enabling one puts its skills in the assistant's prompt for every run.",
      )}
      emptyMessage={props.controller.t("No Agent Plugins are installed in this workspace.")}
      visiblePlugins={props.controller.agentPlugins}
    />
  );
}

/**
 * Installed tab: only the rows this workspace has actually turned on (`plugin.enabled === true`).
 * New with the Downloaded/Installed split (2026-09-09) — before it, "installed" meant "on disk",
 * which is now Downloaded's job. Reuses the pre-split tab label, section aria-label, and subtitle
 * verbatim: "Installed"/"Installed Agent Plugins"/"Portable packages installed for this workspace."
 * already meant "the ones actually installed", which is precisely this tab's new, narrower scope.
 */
function InstalledOnlyPanel(props: AgentPluginListPanelProps) {
  return (
    <AgentPluginListPanel
      {...props}
      sectionLabel={props.controller.t("Installed Agent Plugins")}
      lede={props.controller.t("These plugins are enabled. Their skills reach the assistant's prompt on every run.")}
      emptyMessage={props.controller.t("No Agent Plugins are enabled for this workspace.")}
      visiblePlugins={filterEnabledAgentPlugins(props.controller.agentPlugins)}
    />
  );
}

/**
 * The Marketplace tab: a designed empty state, not a mocked store.
 *
 * There are no listings to show because nothing in Tovu can fetch, list, or install a remote
 * package — `installAgentPluginFromUrl` exists as a function with zero production callers, and no
 * route or tool reaches it. So this panel shows the one real thing it can honestly offer: where the
 * package format is specified. Anything resembling a browsable catalog here would be a lie the
 * operator would try to click.
 */
function MarketplacePanel({ t }: { t: Translate }) {
  return (
    <section className="jini-settings-section" aria-label={t("Agent Plugin Marketplace")}>
      <div className="agent-plugins-marketplace-empty" role="note">
        <span className="agent-plugins-marketplace-glyph">
          <MarketplaceIcon size={28} />
        </span>
        <h3>{t("Nothing to browse yet")}</h3>
        <p>{t("Marketplace is planned for a future release. Tovu does not fetch, install, or list marketplace packages yet.")}</p>
        <p className="jini-field-hint">{t("Until then, the downloaded packages on the Downloaded tab are the ones Tovu ships.")}</p>
        {/* On its own line rather than trailing a centered sentence — a link that wraps mid-
            paragraph in a centered block reads as part of the prose instead of as the next step. */}
        <a
          className="agent-plugins-marketplace-link"
          href={AGENT_PLUGINS_SPEC_URL}
          target="_blank"
          rel="noreferrer"
          {...agentHandle("agent-plugins-marketplace-spec-link", {
            role: "link",
            label: "Open the Agent Plugins open standard specification",
          })}
        >
          {t("Read the package format")}
        </a>
      </div>
    </section>
  );
}

export interface AgentPluginsProps {
  /**
   * Dependency injection seam for tests — the same convention `PostsProps.usePostsHook` uses.
   * Defaulted to the real hook, so production callers pass nothing and behave exactly as before.
   */
  useAgentPluginsHook?: typeof useWiredAgentPlugins;
}

/**
 * Settings-style Agent Plugins catalog. Downloaded/Installed are both read from
 * `AGENT_PLUGINS_LIST` (real, per-workspace installed state); Marketplace is future-only.
 *
 * REDESIGNED 2026-09-09. Five changes worth stating, because each replaced something that was
 * deliberate at the time:
 *
 *  1. Cards became rows (`AgentPluginRow` — see its own header for the before/after and why
 *     nothing was dropped in the process).
 *  2. The enable/disable switch is REAL. This file's prior revision carried an explicit comment
 *     saying there is intentionally no toggle here because the read path was all that existed.
 *     `AGENT_PLUGIN_SET_ENABLED` now exists, so the toggle is wired end to end and its off-state
 *     genuinely refuses an assistant run.
 *  3. Marketplace got a designed empty state rather than one grey sentence. Its copy stays exactly
 *     as honest: nothing is fetched, listed, or installable, and the panel offers no control that
 *     pretends otherwise.
 *  4. The single "Installed" tab split into Downloaded (every package on disk for this workspace,
 *     unfiltered) and Installed (only `enabled: true`). They read identically today — every bundled
 *     package ships enabled — and diverge the moment an operator disables one; each has its own
 *     honest empty state for that day.
 *  5. Owner correction, same day: Installed is the FIRST/default tab (not Downloaded) — it is the
 *     "what's active" view, so it leads. And Downloaded's row dropped the Enable/Disable switch for
 *     a single Remove/Enable action (`AgentPluginRowStateControl`'s `"remove-or-enable"` variant):
 *     showing the switch on BOTH tabs repeated the same on/off fact Installed already conveys by
 *     which rows it lists at all. Both directions still turn a plugin's activation on or off through
 *     the exact same `AGENT_PLUGIN_SET_ENABLED` call either way — only which CONTROL asks, and
 *     whether it interrupts first, differs. See `AgentPluginDisableConfirmDialog`'s own header for
 *     the two `variant`s that follow from this.
 */
export function AgentPlugins({ useAgentPluginsHook = useWiredAgentPlugins }: AgentPluginsProps = {}) {
  const controller = useAgentPluginsHook();
  const { t, locale, agentPlugins, onToggleEnabled, inspectedPlugin, closeInspector } = controller;
  // One id, referenced by every row's disabled uninstall control — see `AgentPluginRow`'s header
  // for why the reason is stated once at section level rather than once per row.
  const uninstallNoteId = useId();

  // Which plugin (by id) is waiting on a disable/remove confirm dialog, and which CONTROL asked —
  // `null` when neither tab has one open. Lives here rather than in `useAgentPlugins` — this is
  // presentation flow ("has the operator confirmed yet"), not a network mutation, the same split
  // `ExternalMcpSettingsPanel.tsx`'s own `confirmRemoveId` draws for the identical shape of
  // interstitial. An id rather than a plugin object so the confirmed row is always looked up fresh
  // against the current `agentPlugins` — a stale object reference could not reflect the plugin
  // toggling or vanishing by some other route while the dialog sat open. `variant` travels alongside
  // the id (not derived from `plugin.enabled` at render time) because Installed's switch and
  // Downloaded's Remove button can both open this for an enabled row, and the dialog's own wording
  // must match whichever one the operator actually clicked, not the plugin's state.
  const [pendingDisable, setPendingDisable] = useState<{ pluginId: string; variant: "disable" | "remove" } | null>(
    null,
  );
  const pendingDisablePlugin = agentPlugins?.find((plugin) => plugin.pluginId === pendingDisable?.pluginId) ?? null;

  /** Installed's switch: enabling stays a plain one-click toggle, disabling opens the confirm
   *  dialog (`variant: "disable"`) instead of calling the mutation immediately. */
  function onRequestToggleEnabled(plugin: AdminAgentPlugin): void {
    if (plugin.enabled) {
      setPendingDisable({ pluginId: plugin.pluginId, variant: "disable" });
    } else {
      void onToggleEnabled(plugin);
    }
  }

  /** Downloaded's Remove action — shown only for a currently-enabled row (see `AgentPluginRow`'s
   *  own state-area rendering), so unlike `onRequestToggleEnabled` this has no direct-call branch:
   *  Remove always asks first, with `variant: "remove"` so the dialog reads accordingly. */
  function onRequestRemove(plugin: AdminAgentPlugin): void {
    setPendingDisable({ pluginId: plugin.pluginId, variant: "remove" });
  }

  const tabs: SettingsDialogTab[] = [
    {
      id: "installed",
      label: t("Installed"),
      icon: <InstalledIcon />,
      title: t("Agent Plugins"),
      subtitle: t("Portable packages installed for this workspace."),
      panel: (
        <InstalledOnlyPanel
          controller={controller}
          uninstallNoteId={uninstallNoteId}
          stateControlFor={(plugin) => ({ kind: "toggle", onToggleEnabled: () => onRequestToggleEnabled(plugin) })}
        />
      ),
    },
    {
      id: "downloaded",
      label: t("Downloaded"),
      icon: <InstalledIcon />,
      title: t("Agent Plugins"),
      subtitle: t("Every package downloaded to this workspace."),
      panel: (
        <DownloadedPanel
          controller={controller}
          uninstallNoteId={uninstallNoteId}
          stateControlFor={(plugin) => ({
            kind: "remove-or-enable",
            onRemove: () => onRequestRemove(plugin),
            onEnable: () => void onToggleEnabled(plugin),
          })}
        />
      ),
    },
    {
      id: "marketplace",
      label: t("Marketplace"),
      icon: <MarketplaceIcon />,
      title: t("Agent Plugin Marketplace"),
      subtitle: t("A future place to discover portable Agent Plugins."),
      panel: <MarketplacePanel t={t} />,
    },
  ];

  return (
    <I18nProvider
      initialLocale={locale}
      dictionaries={SETTINGS_DIALOG_DICTIONARIES}
      fallbackLocale="en"
      syncDocumentAttributes={false}
    >
      {/* `agent-plugins-section` (styles.css) scopes this screen's own measure to it alone — this
          panel has no `--page-flow` variant, so it had none of that modifier's existing
          `max-width` on `.jini-tabbed-dialog-content` (added for the identical "card ran the full
          admin column" problem on the BYOK tab). The row layout wants more of that column than the
          old card measure allowed, since a row carries its controls to the RIGHT of its text
          rather than underneath it — see that rule's own comment for the widened value. */}
      <div className="settings-ui-section agent-plugins-section" data-theme="light">
        <SettingsDialogShell
          tabs={tabs}
          presentation="inline"
          className="jini-tabbed-dialog--inline"
          fullscreenEnabled={false}
          labels={{ kicker: t("Plugins") }}
        />
        {inspectedPlugin ? <AgentPluginDetailsModal plugin={inspectedPlugin} onClose={closeInspector} /> : null}
        {pendingDisable && pendingDisablePlugin ? (
          <AgentPluginDisableConfirmDialog
            name={humanizeAgentPluginId(pendingDisablePlugin.pluginId)}
            variant={pendingDisable.variant}
            // Same derivation the row itself uses (`buildAgentListHandles`), computed from the one
            // id alone rather than threaded down from whichever tab's row is currently mounted —
            // that function derives a handle from the id, not list position, so this always matches
            // the handle the row published, in either tab.
            agentHandleBase={buildAgentListHandles("agent-plugin-row", [pendingDisablePlugin.pluginId])[0]!}
            onConfirm={() => {
              setPendingDisable(null);
              void onToggleEnabled(pendingDisablePlugin);
            }}
            onCancel={() => setPendingDisable(null)}
            t={t}
          />
        ) : null}
      </div>
    </I18nProvider>
  );
}
