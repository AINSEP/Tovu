import type { SettingsRepoPort } from "@jini-ai/core/settings";
import { ASSISTANT_SUBAGENTS_NAMESPACE, ASSISTANT_SUBAGENTS_KEY } from "#src/contracts/headless/assistant-subagents-policy";

/** Fresh ledger read per launch; the daemon cannot cache a grant changed by the API process.
 * Missing definitions/values stay off. Failed daemon reads deny delegation and log a safe diagnostic.
 * HTTP readers opt into propagation so the dock can display unknown instead of a false OFF.
 * @complexity O(1), one effective-setting resolution.
 */
export async function readAssistantSubagentsEnabled(required: {
  settingsRepo: SettingsRepoPort;
  getEffective: typeof import("@jini-ai/core/settings").getEffective;
  settingsReady: Promise<void>;
  workspaceId: string;
}, optional: { readFailure?: "deny" | "throw"; warn?: (message: string) => void } = {}): Promise<boolean> {
  try {
    await required.settingsReady;
    const setting = await required.getEffective({ repo: required.settingsRepo }, {
      namespace: ASSISTANT_SUBAGENTS_NAMESPACE, key: ASSISTANT_SUBAGENTS_KEY,
      scopeContext: { workspaceId: required.workspaceId },
    });
    return setting?.value === true;
  } catch (error) {
    if (optional.readFailure === "throw") throw error;
    // Storage exceptions may contain sensitive values; never copy them into daemon logs.
    (optional.warn ?? console.warn)("[agent-daemon] subagent settings unavailable; delegation remains OFF.");
    return false;
  }
}
