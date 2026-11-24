import { createDictionaryTranslator } from "@jini-ai/core/text";
import { WEBMCP_DICT } from "@jini-ai/admin/screens/webmcp/webmcp-i18n";
import { COMMON_I18N } from "../../lib/i18n-common";
import { createBrowserAgentSettingsPort, useBrowserAgentSettings, type BrowserAgentSettingsState } from "@jini-ai/admin/screens/webmcp/browser-agent-settings.hooks";

/** The admin's own storage key for the browser-agent opt-out. Unchanged since the feature
 * shipped, so an opt-out saved before the preference port moved to Jini still applies. */
export const WEBMCP_PREFERENCE_KEY = "tovu.admin.webmcp.enabled";

/** The one preference port the panel, the dock and the WebMCP registration all share, so a
 * toggle updates every mount immediately. */
export const browserAgentSettingsPort = createBrowserAgentSettingsPort({ preferenceKey: WEBMCP_PREFERENCE_KEY });

/** Jini's preference hook bound to the admin's port — injected into `BrowserAgentSettingsPanel`. */
export function useAdminBrowserAgentSettings(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): BrowserAgentSettingsState {
  return useBrowserAgentSettings({ port: browserAgentSettingsPort });
}

/** The dictionary ships in Jini; the host binds it to its own common words (same as before the move). */
export const webMcpT = createDictionaryTranslator({ featureDictionary: WEBMCP_DICT }, { commonDictionary: COMMON_I18N });
