import {
  I18nProvider,
  SETTINGS_DIALOG_DICTIONARIES,
  SettingsDialogShell,
  type SettingsDialogTab,
} from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";

import { AgentPluginDetailsModal } from "./AgentPluginDetailsModal";
import { TOVU_BUNDLED_AGENT_PLUGINS, type BundledAgentPlugin } from "./agent-plugin-catalog";
import { useWiredAgentPlugins } from "./hooks/use-agent-plugins.hooks";

const AGENT_PLUGINS_SPEC_URL = "https://agent-plugins.org/specification";

/**
 * One source-bundled plugin card. There is intentionally no Enable or Run control: exposing the
 * checked-in package in the Installed catalog is the only capability this slice implements.
 */
function AgentPluginCard(props: {
  plugin: BundledAgentPlugin;
  t: (key: string) => string;
  onInspect: () => void;
}) {
  const { plugin, t, onInspect } = props;

  return (
    <article className="jini-settings-section-card" aria-labelledby={`agent-plugin-${plugin.id}`}>
      <h3 id={`agent-plugin-${plugin.id}`} className="jini-byok-card-title">{plugin.displayName}</h3>
      <p className="jini-field-hint">{t(plugin.description)}</p>
      <dl className="jini-settings-privacy-disclosure">
        {plugin.version ? <div><dt>{t("Version")}</dt><dd>{plugin.version}</dd></div> : null}
        <div><dt>{t("Source")}</dt><dd>{t(plugin.source)}</dd></div>
        <div><dt>{t("Availability")}</dt><dd>{t(plugin.availability)}</dd></div>
      </dl>
      <div className="jini-mcp-capabilities-card">
        <span className="jini-mcp-capabilities-label">{t("Portable components")}</span>
        <ul className="jini-mcp-capabilities-list">
          {plugin.skills.map((skill) => (
            <li key={skill.name}>{t("Skill")}: <code>{skill.name}</code></li>
          ))}
        </ul>
      </div>
      <button type="button" className="btn-secondary" onClick={onInspect}>
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

/** Settings-style Agent Plugins catalog. Installed is source-backed; Marketplace is future-only. */
export function AgentPlugins({ useAgentPluginsHook = useWiredAgentPlugins }: AgentPluginsProps = {}) {
  const { t, locale, inspectedPlugin, inspectPlugin, closeInspector } = useAgentPluginsHook();
  const tabs: SettingsDialogTab[] = [
    {
      id: "installed",
      label: t("Installed"),
      title: t("Agent Plugins"),
      subtitle: t("Portable packages bundled in Tovu's source tree."),
      panel: (
        <section className="jini-settings-section" aria-label={t("Installed Agent Plugins")}>
          <p className="settings-ui-inert-note" role="note">
            {t("These packages are bundled with Tovu and catalogued as installed. Tovu does not execute Agent Plugins yet.")}
          </p>
          {TOVU_BUNDLED_AGENT_PLUGINS.map((plugin) => (
            <AgentPluginCard
              key={plugin.id}
              plugin={plugin}
              t={t}
              onInspect={() => inspectPlugin(plugin)}
            />
          ))}
          <p className="jini-field-hint">
            {t("Package format:")} {" "}
            <a href={AGENT_PLUGINS_SPEC_URL} target="_blank" rel="noreferrer">
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
      <div className="settings-ui-section" data-theme="light">
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
