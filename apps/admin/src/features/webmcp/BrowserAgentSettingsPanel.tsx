import { useId } from "react";
import { useBrowserAgentSettings } from "./browser-agent-settings.hooks";
import { createDictionaryTranslator } from "@jini-ai/core/text";
import { WEBMCP_DICT } from "@jini-ai/admin/screens/webmcp/webmcp-i18n";
import { COMMON_I18N } from "../../lib/i18n-common";

/** The dictionary ships in Jini; the host binds it to its own common words (same as before the move). */
const t = createDictionaryTranslator({ featureDictionary: WEBMCP_DICT }, { commonDictionary: COMMON_I18N });

/** Same `jini-toggle-row` switch the Privacy tab's own toggles use, so the host CSS styles it. */
export function BrowserAgentSettingsPanel({ locale, useBrowserAgentSettingsHook = useBrowserAgentSettings }: { locale: string; useBrowserAgentSettingsHook?: typeof useBrowserAgentSettings; }) {
  const { enabled, setEnabled } = useBrowserAgentSettingsHook({});
  const id = useId();
  return (
    <section className="jini-settings-section">
      <div className="jini-settings-privacy-toggles">
        {/* Human-only: an agent must not be able to enable its own access. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={enabled}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-hint`}
          className={enabled ? "jini-toggle-row on" : "jini-toggle-row"}
          onClick={() => setEnabled({ enabled: !enabled })}
        >
          <span className="jini-toggle-row-text">
            <span id={`${id}-label`} className="jini-toggle-row-label">{t({ locale: locale, key: "Browser-agent access (WebMCP)" })}</span>
            <span id={`${id}-hint`} className="jini-toggle-row-hint">
              {t({ locale: locale, key: "Enabled by default. This choice applies to the admin in this browser on this site." })}
              {" "}
              {t({ locale: locale, key: "Compatible browsers can operate tagged admin controls. Destructive and publish actions require approval." })}
            </span>
          </span>
          <span className="jini-toggle-row-switch" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
