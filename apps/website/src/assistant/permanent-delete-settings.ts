import type { SettingsRepoPort, getEffective } from "@jini-ai/core/settings";
import { ASSISTANT_PERMANENT_DELETES_NAMESPACE, ASSISTANT_PERMANENT_DELETES_KEY, DEFAULT_PERMANENT_DELETES_POLICY, PERMANENT_DELETE_TOOLS, type AssistantPermanentDeletesPolicy } from "../contracts/headless/assistant-permanent-deletes-policy.js";
export interface PermanentDeleteSettingsDeps {
  settingsRepo: SettingsRepoPort; getEffective: typeof getEffective; settingsReady: Promise<void>; workspaceId: string;
}
/** Owner chats inherit the admin's delete capabilities; the human card still gates every effect.
 * Non-owner callers retain the site's explicit grant, including fresh revocation checks.
 * @complexity O(13) local time/space plus owner lookup or one settings read. */
export async function readChatPermanentDeletesPolicy(
  required: PermanentDeleteSettingsDeps & { ownerPrincipalId: Promise<string>; principalId?: string },
  _optional = {},
): Promise<AssistantPermanentDeletesPolicy> {
  if (required.principalId && required.principalId === await required.ownerPrincipalId) {
    return { enabled: true, allowedToolIds: PERMANENT_DELETE_TOOLS.map(tool => tool.id) };
  }
  return readAssistantPermanentDeletesPolicy(required);
}
/** Fresh per run/call. Missing or invalid values deny; unavailable storage propagates.
 * @param required - The existing site ledger, effective-value resolver and definition readiness.
 * @returns A copied OFF policy for absent/malformed values, or the validated site grant.
 * @throws Storage/readiness failures propagate and cannot become a grant.
 * @example await readAssistantPermanentDeletesPolicy({ settingsRepo, getEffective, settingsReady, workspaceId });
 * @complexity O(13) time/space and one effective workspace-setting resolution. */
export async function readAssistantPermanentDeletesPolicy(required: PermanentDeleteSettingsDeps, _optional = {}): Promise<AssistantPermanentDeletesPolicy> {
  await required.settingsReady;
  const result = await required.getEffective({ repo: required.settingsRepo }, {
    namespace: ASSISTANT_PERMANENT_DELETES_NAMESPACE, key: ASSISTANT_PERMANENT_DELETES_KEY,
    scopeContext: { workspaceId: required.workspaceId },
  });
  const value = result?.value as Partial<AssistantPermanentDeletesPolicy> | null;
  const fallback = { ...DEFAULT_PERMANENT_DELETES_POLICY, allowedToolIds: [] };
  if (!value || typeof value.enabled !== "boolean" || !Array.isArray(value.allowedToolIds)) return fallback;
  if (value.allowedToolIds.length > PERMANENT_DELETE_TOOLS.length || new Set(value.allowedToolIds).size !== value.allowedToolIds.length ||
    value.allowedToolIds.some(id => !PERMANENT_DELETE_TOOLS.some(tool => tool.id === id))) {
    return { ...DEFAULT_PERMANENT_DELETES_POLICY, allowedToolIds: [] };
  }
  return { enabled: value.enabled, allowedToolIds: [...value.allowedToolIds] };
}
