import { resolveDefinitionRaw, type SettingsRepoPort } from "@jini-ai/core/settings";
import type { JsonValue } from "@jini-ai/core/primitives";
import { ASSISTANT_CLI_PERMISSIONS_KEY, ASSISTANT_SUBAGENTS_NAMESPACE, type AssistantCliPermissions } from "#src/contracts/headless/index";

/** Read the addressed owner layer, preserving fields the effective permission projection omits. */
export async function readCliPermissionLayer(required: {
  settingsRepo: SettingsRepoPort; workspaceId: string; principalId: string;
}, _optional = {}): Promise<{ raw: Record<string, JsonValue>; revisionSeq: number }> {
  const definition = await resolveDefinitionRaw({ repo: required.settingsRepo }, {
    namespace: ASSISTANT_SUBAGENTS_NAMESPACE, key: ASSISTANT_CLI_PERMISSIONS_KEY, workspaceId: required.workspaceId,
  });
  if (!definition) throw new Error("Agent permission settings are not ready. Send again shortly.");
  const row = await required.settingsRepo.getUserValue({ workspaceId: required.workspaceId, principalId: required.principalId, settingId: definition.settingId });
  const value = row?.state === "set" ? row.valueJson : null;
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return { raw, revisionSeq: row?.seq ?? 0 };
}

/** Merge the selected agent into the raw blob; defaults and other agent entries remain intact. */
export function patchCliPermissionLayer(required: {
  raw: Record<string, JsonValue>; defaults: AssistantCliPermissions; agentId?: string;
  capabilities?: Partial<AssistantCliPermissions["capabilities"]>; enabled?: boolean;
}, _optional = {}): Record<string, JsonValue> {
  const { raw, defaults, agentId, capabilities, enabled } = required;
  // userMcpDefaultOn marks a site-level save made since personal MCP defaulted on (2026-11-10),
  // so its userMcp false is the owner's choice; older saves read false as unset.
  if (!agentId) return { ...raw, enabled: defaults.enabled, capabilities: { ...defaults.capabilities }, userMcpDefaultOn: true };
  const byAgent = objectValue(raw.byAgent);
  const previous = objectValue(byAgent[agentId]);
  return { ...raw, enabled: raw.enabled ?? defaults.enabled, capabilities: raw.capabilities ?? { ...defaults.capabilities },
    byAgent: { ...byAgent, [agentId]: { ...previous, ...(enabled === undefined ? {} : { enabled }),
      capabilities: { ...objectValue(previous.capabilities), ...capabilities } } } };
}

function objectValue(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
