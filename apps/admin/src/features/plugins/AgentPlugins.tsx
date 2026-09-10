import {
  I18nProvider,
  SETTINGS_DIALOG_DICTIONARIES,
  SettingsDialogShell,
  type SettingsDialogTab,
} from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { agentHandle } from "@jini-ai/agentic";
import type { AdminAgentPlugin } from "@/lib/api";
import { buildAgentListHandles } from "../../lib/agent-list-handles";

import { AgentPluginDetailsModal } from "./AgentPluginDetailsModal";
import { humanizeAgentPluginId } from "./rules";
import { useWiredAgentPlugins } from "./hooks/use-agent-plugins.hooks";

const AGENT_PLUGINS_SPEC_URL = "https://agent-plugins.org/specification";

/**
 * One installed Agent Plugin's card. There is intentionally no Enable/Disable toggle or Run
 * control here — see `modules/agent-plugins.ts`'s own header: this dispatch wires a read path only,
 * and an enable toggle is explicitly the visual-redesign workstream's scope, not this one's.
 */
function AgentPluginCard(props: {
  plugin: AdminAgentPlugin;
  t: (key: string) => string;
  onInspect: () => void;
  agentHandleBase: string;
}) {
  const { plugin, t, onInspect, agentHandleBase } = props;
  const displayName = humanizeAgentPluginId(plugin.pluginId);

  return (
    <article className="jini-settings-section-card agent-plugin-card" aria-labelledby={`agent-plugin-${plugin.pluginId}`}>
      <h3 id={`agent-plugin-${plugin.pluginId}`} className="jini-byok-card-title">{displayName}</h3>
      {plugin.description ? <p className="jini-field-hint">{plugin.description}</p> : null}
      {/* `.agent-plugin-meta` (styles.css) — see `AgentPluginCard`'s prior revision for why this
          purpose-built label/value pair exists rather than `.jini-settings-privacy-disclosure`.
          Version/Keywords are real, installed-package facts, shown only when present (both are
          genuinely optional in the Agent Plugins spec). "Source"/"Availability" rows this card used
          to carry here are gone: they described the static `TOVU_BUNDLED_AGENT_PLUGINS` catalog's
          one hand-authored entry, not anything this real installed-plugin data actually reports. */}
      <dl className="agent-plugin-meta">
        {plugin.version ? <div><dt>{t("Version")}</dt><dd>{plugin.version}</dd></div> : null}
        <div><dt>{t("Status")}</dt><dd>{plugin.enabled ? t("Enabled") : t("Disabled")}</dd></div>
        {plugin.keywords.length > 0 ? <div><dt>{t("Keywords")}</dt><dd>{plugin.keywords.join(", ")}</dd></div> : null}
      </dl>
      {/* Each skill renders as its own name only — the list's one label already says these are
          skills, so repeating the word on every line was the list's section label doing the same
          job seven times over (carried forward from this card's prior revision). */}
      <div className="agent-plugin-skills">
        <span className="agent-plugin-skills-label">{t("Portable components")}</span>
        <ul className="agent-plugin-skills-list">
          {plugin.skills.map((skill) => (
            <li key={skill.name}><code>{skill.name}</code></li>
          ))}
        </ul>
      </div>
      {/* Reuses the same list markup/classes as the skills block above (no new visual treatment)
          for the OTHER thing an installed Agent Plugin can contribute — see `AGENT_PLUGINS_LIST`'s
          own header ("what it contributes: skills, MCP servers"). Only rendered when the package
          actually declares one; most don't. */}
      {plugin.mcpServerIds.length > 0 ? (
        <div className="agent-plugin-skills">
          <span className="agent-plugin-skills-label">{t("MCP servers")}</span>
          <ul className="agent-plugin-skills-list">
            {plugin.mcpServerIds.map((serverId) => (
              <li key={serverId}><code>{serverId}</code></li>
            ))}
          </ul>
        </div>
      ) : null}
      <button
        type="button"
        className="btn-secondary agent-plugin-inspect-btn"
        onClick={onInspect}
        // "Inspect package files" reads identically on every card — see the identical note on this
        // button's prior revision for why the plugin's own name must still be in the accessible name.
        aria-label={`${t("Inspect package files")} — ${displayName}`}
        {...agentHandle(`${agentHandleBase}-inspect`, { role: "button", label: `Inspect the "${displayName}" package files` })}
      >
        {t("Inspect package files")}
      </button>
    </article>
  );
}

export interface AgentPluginsProps {
  /**
   * Dependency injection seam for tests — the same convention `PostsProps.usePostsHook` uses.
   * Defaulted to the real hook, so production callers pass nothing and behave exactly as before.
   */
  useAgentPluginsHook?: typeof useWiredAgentPlugins;
}

/** Settings-style Agent Plugins catalog. Installed is read from `AGENT_PLUGINS_LIST` (real,
 *  per-workspace installed state); Marketplace is future-only. */
export function AgentPlugins({ useAgentPluginsHook = useWiredAgentPlugins }: AgentPluginsProps = {}) {
  const { t, locale, agentPlugins, error, inspectedPlugin, inspectPlugin, closeInspector } = useAgentPluginsHook();
  // Plugin ids are stable and unique, same per-row-handle derivation every other list on this
  // workstream uses (`buildAgentListHandles`).
  const cardHandles = buildAgentListHandles(
    "agent-plugin-card",
    (agentPlugins ?? []).map((plugin) => plugin.pluginId),
  );
  const tabs: SettingsDialogTab[] = [
    {
      id: "installed",
      label: t("Installed"),
      title: t("Agent Plugins"),
      subtitle: t("Portable packages installed for this workspace."),
      panel: (
        <section className="jini-settings-section" aria-label={t("Installed Agent Plugins")}>
          <p className="settings-ui-inert-note" role="note">
            {t(
              "These packages are bundled with Tovu and catalogued as installed. An installed plugin's skills reach the assistant once an operator enables it for this workspace.",
            )}
          </p>
          {error ? <p role="status">{error}</p> : null}
          {!agentPlugins && !error ? <p role="status">{t("Loading Agent Plugins…")}</p> : null}
          {agentPlugins?.map((plugin, index) => (
            <AgentPluginCard
              key={plugin.pluginId}
              plugin={plugin}
              t={t}
              onInspect={() => inspectPlugin({ id: plugin.pluginId, displayName: humanizeAgentPluginId(plugin.pluginId) })}
              agentHandleBase={cardHandles[index]!}
            />
          ))}
          {/* `.agent-plugins-format-note` (styles.css): a section-wide footnote, not a per-plugin
              detail, so it stays a sibling of the card list rather than moving inside the last
              card — but it needs its own separation to read as a footer instead of a stray line
              butted against the last card's bottom edge. */}
          <p className="jini-field-hint agent-plugins-format-note">
            {t("Package format:")} {" "}
            <a
              href={AGENT_PLUGINS_SPEC_URL}
              target="_blank"
              rel="noreferrer"
              {...agentHandle("agent-plugins-spec-link", { role: "link", label: "Open the Agent Plugins open standard specification" })}
            >
              {t("Agent Plugins open standard")}
            </a>
          </p>
        </section>
      ),
    },
    {
      id: "marketplace",
      label: t("Marketplace"),
      title: t("Agent Plugin Marketplace"),
      subtitle: t("A future place to discover portable Agent Plugins."),
      panel: (
        <section className="jini-settings-section" aria-label={t("Agent Plugin Marketplace")}>
          <p className="settings-ui-inert-note" role="note">
            {t("Marketplace is planned for a future release. Tovu does not fetch, install, or list marketplace packages yet.")}
          </p>
        </section>
      ),
    },
  ];

  return (
    <I18nProvider
      initialLocale={locale}
      dictionaries={SETTINGS_DIALOG_DICTIONARIES}
      fallbackLocale="en"
      syncDocumentAttributes={false}
    >
      {/* `agent-plugins-section` (styles.css) scopes the measure fix below to this screen only —
          this panel has no `--page-flow` variant, so it had none of that modifier's existing
          `max-width: 46rem` on `.jini-tabbed-dialog-content` (added for the identical "card ran the
          full admin column" problem on the BYOK tab). Same value, reused here on a screen-specific
          class instead of the shared modifier so no other `.settings-ui-section` consumer is
          affected. */}
      <div className="settings-ui-section agent-plugins-section" data-theme="light">
        <SettingsDialogShell
          tabs={tabs}
          presentation="inline"
          className="jini-tabbed-dialog--inline"
          fullscreenEnabled={false}
          labels={{ kicker: t("Plugins") }}
        />
        {inspectedPlugin ? (
          <AgentPluginDetailsModal plugin={inspectedPlugin} onClose={closeInspector} />
        ) : null}
      </div>
    </I18nProvider>
  );
}
