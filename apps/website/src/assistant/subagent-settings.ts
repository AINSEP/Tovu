import type { SettingsRepoPort } from "@jini-ai/core/settings";
import { ASSISTANT_SUBAGENTS_NAMESPACE, ASSISTANT_SUBAGENTS_KEY, ASSISTANT_CLI_PERMISSIONS_KEY, ASSISTANT_CLI_CAPABILITIES, type AssistantCliPermissions } from "#src/contracts/headless/index";
import { assistantCliPermissions } from "#src/assistant/assistant-subagents-policy";

/** Fresh, owner/site-scoped launch snapshot in the existing ledger. Legacy booleans are read only
 * when no owner snapshot exists. Invalid persisted permissions and read failures deny access.
 * @complexity O(1), at most two bounded setting resolutions; errors optionally propagate to HTTP.
 */
export async function readAssistantCliPermissions(required: {
  settingsRepo: SettingsRepoPort; getEffective: typeof import("@jini-ai/core/settings").getEffective;
  settingsReady: Promise<void>; workspaceId: string; principalId: string;
}, optional: { readFailure?: "deny" | "throw"; warn?: (message: string) => void; onSource?: (source: "site" | "default") => void } = {}): Promise<AssistantCliPermissions> {
  try {
    await required.settingsReady;
    const stored = await required.getEffective({ repo: required.settingsRepo }, {
      namespace: ASSISTANT_SUBAGENTS_NAMESPACE, key: ASSISTANT_CLI_PERMISSIONS_KEY,
      scopeContext: { workspaceId: required.workspaceId, principalId: required.principalId },
    });
    // The definition default means no owner preference; inherit the legacy Full CLI access grant.
    if (stored?.value != null && stored.sourceLayer !== "default") { optional.onSource?.("site"); return parseCliPermissionsSnapshot({ value: stored.value }); }
    return assistantCliPermissions({ enabled: await readAssistantSubagentsEnabled(required, { readFailure: "throw", ...(optional.onSource ? { onSource: optional.onSource } : {}) }) });
  } catch (error) {
    denyOrRethrow({ error }, optional);
    return assistantCliPermissions({ enabled: false });
  }
}

/** Validates a persisted owner snapshot: the master flag and every known capability must be booleans.
 * @throws Error("Invalid CLI permissions") for any malformed snapshot, so the caller denies access.
 * @complexity O(c) for the fixed capability list.
 */
function parseCliPermissionsSnapshot(required: { value: unknown }): AssistantCliPermissions {
  const { enabled, capabilities, byAgent } = required.value as Partial<AssistantCliPermissions>;
  if (typeof enabled !== "boolean" || !capabilities ||
    !ASSISTANT_CLI_CAPABILITIES.every(({ key }) => typeof capabilities[key] === "boolean")) throw new Error("Invalid CLI permissions");
  if (byAgent !== undefined) validateAgentPermissions({ byAgent });
  return assistantCliPermissions({ enabled, capabilities, ...(byAgent ? { byAgent } : {}) });
}

/** Shared read-failure policy: HTTP readers propagate the error; the daemon logs a safe diagnostic
 * and the caller then denies access.
 * @throws the original error unchanged when `readFailure` is "throw".
 */
function denyOrRethrow(required: { error: unknown }, optional: { readFailure?: "deny" | "throw"; warn?: (message: string) => void }): void {
  if (optional.readFailure === "throw") throw required.error;
  // Storage exceptions may contain sensitive values; never copy them into daemon logs.
  (optional.warn ?? console.warn)("[agent-daemon] Full CLI access settings unavailable; access remains OFF.");
}

/** Fresh ledger read per launch; the daemon cannot cache a grant changed by the API process.
 * Missing definitions/values default ON. Failed daemon reads deny full CLI access and log a safe diagnostic.
 * HTTP readers opt into propagation so the dock can display unknown instead of a false OFF.
 * @complexity O(1), one effective-setting resolution.
 */
export async function readAssistantSubagentsEnabled(required: {
  settingsRepo: SettingsRepoPort;
  getEffective: typeof import("@jini-ai/core/settings").getEffective;
  settingsReady: Promise<void>;
  workspaceId: string;
}, optional: { readFailure?: "deny" | "throw"; warn?: (message: string) => void; onSource?: (source: "site" | "default") => void } = {}): Promise<boolean> {
  try {
    await required.settingsReady;
    const setting = await required.getEffective({ repo: required.settingsRepo }, {
      namespace: ASSISTANT_SUBAGENTS_NAMESPACE, key: ASSISTANT_SUBAGENTS_KEY,
      scopeContext: { workspaceId: required.workspaceId },
    });
    optional.onSource?.(setting && setting.sourceLayer !== "default" ? "site" : "default");
    return setting === null ? true : setting.value === true;
  } catch (error) {
    denyOrRethrow({ error }, optional);
    return false;
  }
}

/** Reject malformed per-agent overrides before any grant can reach a launch. Fixed keys per agent. */
function validateAgentPermissions({ byAgent }: { byAgent: unknown }): void {
  if (!byAgent || typeof byAgent !== "object" || Array.isArray(byAgent)) throw new Error("Invalid CLI permissions");
  for (const value of Object.values(byAgent)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid CLI permissions");
    const entry = value as { enabled?: unknown; capabilities?: unknown };
    if (entry.enabled !== undefined && typeof entry.enabled !== "boolean") throw new Error("Invalid CLI permissions");
    validateAgentCapabilities({ capabilities: entry.capabilities });
  }
}

function validateAgentCapabilities({ capabilities }: { capabilities: unknown }): void {
  if (capabilities === undefined) return;
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) throw new Error("Invalid CLI permissions");
  if (Object.entries(capabilities).some(([key, value]) => typeof value !== "boolean" || !ASSISTANT_CLI_CAPABILITIES.some(item => item.key === key))) throw new Error("Invalid CLI permissions");
}
