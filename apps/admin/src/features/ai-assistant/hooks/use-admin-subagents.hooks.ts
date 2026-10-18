import type { useConfirmRequest } from "@jini-ai/admin/react";
import { assistantSubagentsPort, SUBAGENTS_NAMESPACE, SUBAGENT_DANGERS, type AssistantSubagentsPort } from "@/lib/assistant-subagents";
import { useAssistantOwnerGrant, useAssistantOwnerGrantSettings } from "./use-assistant-owner-grant.hooks";
import { ASSISTANT_CLI_CAPABILITIES, assistantCliPermissions, type AssistantCliCapability } from "@tovu/headless";
const settingsKey = ["admin-assistant", "subagents"] as const;
/** The panel and dock share the site-owner grant query. */
export function useAssistantSubagentsSettings(required: { port: AssistantSubagentsPort; mode: string; agentId: string | null }, _optional = {}) {
  const state = useAssistantOwnerGrantSettings({ ...required, namespace: SUBAGENTS_NAMESPACE, key: settingsKey });
  // A stale cached ON value cannot establish the current grant after a failed refresh.
  const tooltipKey = !state.loadError && required.mode === "local-cli" && required.agentId !== null &&
    (state.settings?.capabilities?.subagents ?? state.settings?.enabled)
    ? "This chat can use subagents" : null;
  return { ...state, tooltipKey };
}
/** Subagent-specific copy and boolean payload; the shared hook owns locking and errors. */
export function useAdminSubagents(required: { port: AssistantSubagentsPort; t?: (key: string) => string }, optional: { useConfirmation?: typeof useConfirmRequest } = {}) {
  const state = useAssistantOwnerGrant({ ...required, namespace: SUBAGENTS_NAMESPACE, key: settingsKey,
    title: "Enable Full CLI access?", dangers: SUBAGENT_DANGERS,
    confirmLabel: "Enable Full CLI access", failure: required.t?.("failed to save subagent access") ?? "failed to save subagent access",
  }, { ...optional, confirmEnable: false });
  return { ...state, setEnabled: async ({ enabled }: { enabled: boolean }, _options = {}) => {
    await state.save({ settings: assistantCliPermissions({ enabled }) });
  }, setCapability: async ({ key, enabled }: { key: AssistantCliCapability; enabled: boolean }, _options = {}) => {
    if (!state.settings) return;
    const current = assistantCliPermissions(state.settings);
    await state.save({ settings: { enabled: current.enabled, capabilities: { ...current.capabilities, [key]: enabled } } });
  } };
}

/** Thin host port for Jini's advanced settings dialog; panel and dock share the grant query. */
export function useDockAgentPermissions(required: { t: (key: string) => string; port?: AssistantSubagentsPort; openSettings?: () => void }, _optional = {}) {
  const state = useAdminSubagents({ ...required, port: required.port ?? assistantSubagentsPort });
  const permissions = assistantCliPermissions({ enabled: state.settings?.enabled ?? false, capabilities: state.settings?.capabilities });
  return { enabled: ASSISTANT_CLI_CAPABILITIES.every(({ key }) => permissions.capabilities[key]),
    // Hide the advanced entry until the server confirms the local-owner capability. Hosted and
    // non-owner chats retain the quick display menu without advertising unavailable permissions.
    onMoreSettings: state.settings?.canEdit && !state.loadError ? required.openSettings : undefined,
    // unavailableReason with canEdit = a local env lock: the server reads every switch OFF, so a
    // clickable switch would save and snap straight back. Lock it and show the reason instead.
    canEdit: !!state.settings?.canEdit && !state.settings.unavailableReason && !state.loadError, busy: state.busy,
    error: state.loadError ?? state.saveError,
    unavailableReason: state.settings?.unavailableReason,
    capabilities: ASSISTANT_CLI_CAPABILITIES.map(item => ({ ...item, label: required.t(item.label), description: required.t(item.description), enabled: permissions.capabilities[item.key] })),
    onChange: ({ key, enabled }: { key?: string; enabled: boolean }) => {
      if (key === undefined) void state.setEnabled({ enabled });
      else if (ASSISTANT_CLI_CAPABILITIES.some(item => item.key === key)) void state.setCapability({ key: key as AssistantCliCapability, enabled });
    },
  };
}
/** Production binding stays outside the injected policy hook. */
export function useWiredAdminSubagents(required: { t?: (key: string) => string }, _optional = {}) {
  return useAdminSubagents({ ...required, port: assistantSubagentsPort });
}
export function useWiredAssistantSubagentsSettings(required: { mode: string; agentId: string | null }, _optional = {}) {
  return useAssistantSubagentsSettings({ ...required, port: assistantSubagentsPort });
}
