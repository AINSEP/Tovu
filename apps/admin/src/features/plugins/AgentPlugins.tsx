import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { t as translatePlugins } from "./plugins-i18n";

const AGENT_PLUGINS_SPEC_URL =
  "https://developers.googleblog.com/agent-plugins-package-your-skills-tools-and-more/";

/**
 * Coming-soon screen for the Agent Plugins row, not the shared `Placeholder` — that component's
 * copy has no room for a reminder note, and this row needs one: a link back to the open standard
 * this section exists to eventually support, so the owner has the source at hand when they pick
 * this back up.
 */
export function AgentPlugins() {
  const locale = useAdminLocale();
  const t = (key: string): string => translatePlugins(locale, key);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Plugins")}</p>
          <h1 className="page-title">{t("Agent Plugins")}</h1>
          <p className="page-description">{t("Agent Plugins is coming soon.")}</p>
        </div>
      </div>
      <div className="notice">
        {t("This is from the")}{" "}
        <a href={AGENT_PLUGINS_SPEC_URL} target="_blank" rel="noreferrer">
          {t("Agent Plugins open standard")}
        </a>{" "}
        {t("— packaging skills, tools, and MCP servers into portable plugins.")}
      </div>
    </div>
  );
}
