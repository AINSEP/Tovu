import { readUserLayerObject, type SettingsRepoPort } from "@jini-ai/core/settings";
import { patchNativePermissionLayer } from "@jini-ai/agent-runtime/native-permissions";
import type { JsonValue } from "@jini-ai/core/primitives";
import { ASSISTANT_CLI_PERMISSIONS_KEY, ASSISTANT_SUBAGENTS_NAMESPACE, type AssistantCliPermissions } from "@tovu/contracts/assistant-subagents-policy";

/** Read the addressed owner layer, preserving fields the effective permission projection omits. */
export async function readCliPermissionLayer(required: {
  settingsRepo: SettingsRepoPort; workspaceId: string; principalId: string;
}, _optional = {}): Promise<{ raw: Record<string, JsonValue>; revisionSeq: number }> {
  return readUserLayerObject({ settingsRepo: required.settingsRepo, workspaceId: required.workspaceId, principalId: required.principalId,
    namespace: ASSISTANT_SUBAGENTS_NAMESPACE, key: ASSISTANT_CLI_PERMISSIONS_KEY,
    notReadyMessage: "Agent permission settings are not ready. Send again shortly." });
}

/** Merge the selected agent into the raw blob; defaults and other agent entries remain intact. */
export function patchCliPermissionLayer(required: {
  raw: Record<string, JsonValue>; defaults: AssistantCliPermissions; agentId?: string;
  capabilities?: Partial<AssistantCliPermissions["capabilities"]>; enabled?: boolean;
}, _optional = {}): Record<string, JsonValue> {
  // userMcpDefaultOn marks a site-level save made since personal MCP defaulted on (2026-11-10),
  // so its userMcp false is the owner's choice; older saves read false as unset.
  return patchNativePermissionLayer({ ...required, masterSaveFields: { userMcpDefaultOn: true } });
}
