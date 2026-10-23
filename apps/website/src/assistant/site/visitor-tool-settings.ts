/** Read Tovu's site-owned policy through the existing settings owner; there is no policy cache. */
import { getEffective, type SettingsRepoPort } from "@jini-ai/core/settings";
import { parseVisitorToolPolicy, VISITOR_TOOLS_SETTING, type VisitorToolPolicy } from "../../contracts/site-assistant/visitor-tools.js";

/** Missing definitions, invalid JSON and storage failures deny the entire managed catalog.
 * A newly registered default is {version:1,tools:{}} and retains the seven upgrade Auto grants.
 * @complexity One bounded settings resolution and O(t) validation, t ≤ 128.
 * @example readVisitorToolPolicy({ settingsRepo, workspaceId, reportError });
 */
export async function readVisitorToolPolicy({ settingsRepo, workspaceId, reportError }: {
  settingsRepo: SettingsRepoPort; workspaceId: string; reportError: (error: unknown) => void;
}, _options = {}): Promise<VisitorToolPolicy | null> {
  try {
    const resolved = await getEffective({ repo: settingsRepo }, { ...VISITOR_TOOLS_SETTING, scopeContext: { workspaceId } });
    if (!resolved) return null;
    return parseVisitorToolPolicy({ value: resolved.value });
  } catch (error) {
    reportError(error);
    return null;
  }
}
