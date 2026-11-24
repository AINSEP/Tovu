import { validateNativePermissionSnapshot, InvalidNativePermissionsError } from "@jini-ai/agent-runtime/native-permissions";
import { readEffectiveFailClosed, type SettingsRepoPort } from "@jini-ai/core/settings";
import { ASSISTANT_SUBAGENTS_NAMESPACE, ASSISTANT_SUBAGENTS_KEY, ASSISTANT_CLI_PERMISSIONS_KEY, CLI_CAPABILITY_KEYS, type AssistantCliPermissions } from "@tovu/contracts/assistant-subagents-policy";
import { assistantCliPermissions } from "@tovu/contracts/assistant-native-fallbacks";

/** Fresh, owner/site-scoped launch snapshot in the existing ledger. Legacy booleans are read only
 * when no owner snapshot exists. Invalid persisted permissions and read failures deny access.
 * @complexity O(1), at most two bounded setting resolutions; errors optionally propagate to HTTP.
 */
export async function readAssistantCliPermissions(required: {
  settingsRepo: SettingsRepoPort; getEffective: typeof import("@jini-ai/core/settings").getEffective;
  settingsReady: Promise<void>; workspaceId: string; principalId: string;
}, optional: { readFailure?: "deny" | "throw"; warn?: (message: string) => void; onSource?: (required: { source: "site" | "default" }, optional?: Record<string, never>) => void } = {}): Promise<AssistantCliPermissions> {
  return readEffectiveFailClosed({ ...failClosedDeps(required, optional), namespace: ASSISTANT_SUBAGENTS_NAMESPACE, key: ASSISTANT_CLI_PERMISSIONS_KEY,
    scopeContext: { workspaceId: required.workspaceId, principalId: required.principalId },
    project: async ({ setting: stored }) => {
      // The definition default means no owner preference; inherit the legacy Full CLI access grant.
      if (stored?.value != null && stored.sourceLayer !== "default") { optional.onSource?.({ source: "site" }); return parseCliPermissionsSnapshot({ value: stored.value }); }
      return assistantCliPermissions({ enabled: await readAssistantSubagentsEnabled(required, { readFailure: "throw", ...(optional.onSource ? { onSource: optional.onSource } : {}) }) });
    },
    denied: () => assistantCliPermissions({ enabled: false }) }, optional);
}

/** Validates a persisted owner snapshot: the master flag and every known capability must be booleans.
 * @throws Error("Invalid CLI permissions") for any malformed snapshot, so the caller denies access.
 * @complexity O(c) for the fixed capability list.
 */
function parseCliPermissionsSnapshot(required: { value: unknown }): AssistantCliPermissions {
  let validated: AssistantCliPermissions;
  try {
    validated = validateNativePermissionSnapshot({ value: required.value, capabilityKeys: CLI_CAPABILITY_KEYS }, { message: "Invalid CLI permissions" });
  } catch (error) {
    if (error instanceof InvalidNativePermissionsError) throw new Error("Invalid CLI permissions", { cause: error });
    throw error;
  }
  const { enabled, capabilities } = validated;
  const { byAgent, userMcpDefaultOn } = required.value as Partial<AssistantCliPermissions> & { userMcpDefaultOn?: unknown };
  // Site-level saves before 2026-11-10 persisted personal MCP false as the default, whatever the
  // owner meant; read that false as unset. Saves since carry userMcpDefaultOn, so their false is the
  // owner's choice. Per-agent entries are only written by the owner's switch and are always kept.
  const { userMcp, ...rest } = capabilities;
  const site = userMcpDefaultOn === true || userMcp ? capabilities : rest;
  return assistantCliPermissions({ enabled, capabilities: site, ...(byAgent ? { byAgent } : {}) });
}

/** Shared read-failure policy: HTTP readers propagate the error; the daemon logs a safe diagnostic
 * and the caller then denies access (the fail-closed mechanics live in @jini-ai/core/settings).
 */
function failClosedDeps(required: { settingsRepo: SettingsRepoPort; getEffective: typeof import("@jini-ai/core/settings").getEffective; settingsReady: Promise<void> },
  optional: { warn?: (message: string) => void }) {
  return { settingsRepo: required.settingsRepo, getEffective: required.getEffective, settingsReady: required.settingsReady,
    deniedWarning: "[agent-daemon] Full CLI access settings unavailable; access remains OFF.", // Resolved at failure time, as before, so a console replaced after the call is honoured.
    warn: (message: string) => (optional.warn ?? console.warn)(message) };
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
}, optional: { readFailure?: "deny" | "throw"; warn?: (message: string) => void; onSource?: (required: { source: "site" | "default" }, optional?: Record<string, never>) => void } = {}): Promise<boolean> {
  return readEffectiveFailClosed({ ...failClosedDeps(required, optional), namespace: ASSISTANT_SUBAGENTS_NAMESPACE, key: ASSISTANT_SUBAGENTS_KEY,
    scopeContext: { workspaceId: required.workspaceId },
    project: ({ setting }) => {
      optional.onSource?.({ source: setting && setting.sourceLayer !== "default" ? "site" : "default" });
      return setting === null ? true : setting.value === true;
    },
    denied: () => false }, optional);
}
