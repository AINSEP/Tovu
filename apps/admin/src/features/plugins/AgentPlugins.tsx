import {
  I18nProvider,
  SETTINGS_DIALOG_DICTIONARIES,
  SettingsDialogShell,
  type SettingsDialogTab,
} from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { agentHandle } from "@jini-ai/agentic";
import { useId } from "react";

import type { AdminAgentPlugin } from "@/lib/api";
import { buildAgentListHandles } from "../../lib/agent-list-handles";
import { AgentPluginDetailsModal } from "./AgentPluginDetailsModal";
import { AgentPluginRow } from "./AgentPluginRow";
import { InstalledIcon, MarketplaceIcon } from "./agent-plugins-visuals";
import { humanizeAgentPluginId } from "./rules";
import { useWiredAgentPlugins, type AgentPluginsController } from "./hooks/use-agent-plugins.hooks";
import type { Translate } from "@/lib/dictionary-translator";

const AGENT_PLUGINS_SPEC_URL = "https://agent-plugins.org/specification";

/**
 * The panel's non-row messages: a failed load, an unsettled first load, a refused toggle, and a
 * genuinely empty install directory.
 *
 * Extracted from `AgentPlugins` rather than inlined as four more ternaries in the tab array — that
 * shape put `AgentPlugins` at a complexity of 13 against this repo's ceiling of 9
 * (`check:admin-complexity-drift`). The split is along a real seam: these four are all "something
 * other than a list of plugins", and none of them needs a row handle or the modal.
 *
 * `toggleError` is deliberately separate from `error` and uses `role="alert"`, not `role="status"`:
 * a load failure is the state of the screen, while a refused toggle is the outcome of something the
 * operator just did and should interrupt.
 */
function AgentPluginsStatus({
  agentPlugins,
  error,
  toggleError,
  t,
}: Pick<AgentPluginsController, "agentPlugins" | "error" | "toggleError" | "t">) {
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
      {agentPlugins && agentPlugins.length === 0 ? (
        <p className="agent-plugins-empty-note" role="status">
          {t("No Agent Plugins are installed in this workspace.")}
        </p>
      ) : null}
    </>
  );
}

/** The installed list itself. Rendered only when there is at least one row, so it carries no
 *  emptiness branch of its own — {@link AgentPluginsStatus} owns that case. */
function AgentPluginList({
  agentPlugins,
  controller,
  uninstallNoteId,
}: {
  agentPlugins: AdminAgentPlugin[];
  controller: AgentPluginsController;
  uninstallNoteId: string;
}) {
  // Plugin ids are stable and unique, same per-row-handle derivation every other list on this
  // workstream uses (`buildAgentListHandles`).
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
          onToggleEnabled={() => void controller.onToggleEnabled(plugin)}
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

/** The Installed tab's whole panel. */
function InstalledPanel({ controller, uninstallNoteId }: { controller: AgentPluginsController; uninstallNoteId: string }) {
  const { t, agentPlugins, error, toggleError } = controller;

  return (
    <section className="jini-settings-section" aria-label={t("Installed Agent Plugins")}>
      <p className="agent-plugins-lede">
        {t("An installed plugin sits inert until you enable it. Enabling one puts its skills in the assistant's prompt for every run.")}
      </p>
      <AgentPluginsStatus agentPlugins={agentPlugins} error={error} toggleError={toggleError} t={t} />
      {agentPlugins && agentPlugins.length > 0 ? (
        <AgentPluginList agentPlugins={agentPlugins} controller={controller} uninstallNoteId={uninstallNoteId} />
      ) : null}
      {/* `.agent-plugins-footnotes` (styles.css): section-wide facts, not per-plugin details, so
          they stay siblings of the list — but with their own separation, so they read as a footer
          rather than a stray line butted against the last row. */}
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
        <p className="jini-field-hint">{t("Until then, the installed packages on the Installed tab are the ones Tovu ships.")}</p>
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
 * Settings-style Agent Plugins catalog. Installed is read from `AGENT_PLUGINS_LIST` (real,
 * per-workspace installed state); Marketplace is future-only.
 *
 * REDESIGNED 2026-09-09. Three changes worth stating, because each replaced something that was
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
 */
export function AgentPlugins({ useAgentPluginsHook = useWiredAgentPlugins }: AgentPluginsProps = {}) {
  const controller = useAgentPluginsHook();
  const { t, locale, inspectedPlugin, closeInspector } = controller;
  // One id, referenced by every row's disabled uninstall control — see `AgentPluginRow`'s header
  // for why the reason is stated once at section level rather than once per row.
  const uninstallNoteId = useId();

  const tabs: SettingsDialogTab[] = [
    {
      id: "installed",
      label: t("Installed"),
      icon: <InstalledIcon />,
      title: t("Agent Plugins"),
      subtitle: t("Portable packages installed for this workspace."),
      panel: <InstalledPanel controller={controller} uninstallNoteId={uninstallNoteId} />,
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
      </div>
    </I18nProvider>
  );
}
