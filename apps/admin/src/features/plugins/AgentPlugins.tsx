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
    <article className="jini-settings-section-card agent-plugin-card" aria-labelledby={`agent-plugin-${plugin.id}`}>
      <h3 id={`agent-plugin-${plugin.id}`} className="jini-byok-card-title">{plugin.displayName}</h3>
      <p className="jini-field-hint">{t(plugin.description)}</p>
      {/* `.agent-plugin-meta` (styles.css), not `.jini-settings-privacy-disclosure` — that class is
          the Privacy tab's own title+description pair (`dt` 13px/600/near-black, `dd` 12px/muted),
          built for a bold heading followed by a caption. Borrowed here for a label/value fact, it
          rendered backwards: "Source"/"Availability" outweighed the values they labeled. This is a
          purpose-built label-over-value pair instead, using Jini's `--jini-*` tokens (not Tovu's
          `--muted`/`--fg`) so it still resolves correctly under this screen's own
          `data-theme="light"` pin — Tovu's own tokens only redefine at `:root[data-theme="dark"]`,
          with no `[data-theme="light"]` reset, so they'd leak the dark value into this light-pinned
          island when the admin's root theme is dark; Jini's tokens define both directions. */}
      <dl className="agent-plugin-meta">
        {plugin.version ? <div><dt>{t("Version")}</dt><dd>{plugin.version}</dd></div> : null}
        <div><dt>{t("Source")}</dt><dd>{t(plugin.source)}</dd></div>
        <div><dt>{t("Availability")}</dt><dd>{t(plugin.availability)}</dd></div>
      </dl>
      {/* `.agent-plugin-skills` (styles.css), not `.jini-mcp-capabilities-card` — that class carries
          its own border and `--jini-bg-panel` fill, the SAME fill and border as the outer
          `.jini-settings-section-card` this sits inside, so it was a second identical box nested
          inside the first for one list. Dropped the inner box; kept the uppercase label. Each skill
          renders as its own name only — the list's one label already says these are skills, so
          repeating the word on every line ("Skill: ui-ux-design", seven times) was the list's
          section label doing the same job seven times over. */}
      <div className="agent-plugin-skills">
        <span className="agent-plugin-skills-label">{t("Portable components")}</span>
        <ul className="agent-plugin-skills-list">
          {plugin.skills.map((skill) => (
            <li key={skill.name}><code>{skill.name}</code></li>
          ))}
        </ul>
      </div>
      <button type="button" className="btn-secondary agent-plugin-inspect-btn" onClick={onInspect}>
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
          {/* `.agent-plugins-format-note` (styles.css): a section-wide footnote, not a per-plugin
              detail, so it stays a sibling of the card list rather than moving inside the last
              card — but it needs its own separation to read as a footer instead of a stray line
              butted against the last card's bottom edge. */}
          <p className="jini-field-hint agent-plugins-format-note">
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
