import type { useConfirmRequest } from "@jini-ai/admin/react";
import { assistantSubagentsPort, SUBAGENTS_NAMESPACE, SUBAGENT_DANGERS, type AssistantSubagentsPort, type AssistantSubagentsSettings } from "@/lib/assistant-subagents";
import { useAssistantOwnerGrant, useAssistantOwnerGrantSettings } from "./use-assistant-owner-grant.hooks";
import { ASSISTANT_CLI_CAPABILITIES, type AssistantCliCapability } from "@tovu/headless";
import { assistantCliPermissions } from "../../../../../website/src/assistant/assistant-subagents-policy.js";
const settingsKey = ["admin-assistant", "subagents"] as const;
/** The panel and dock share the site-owner grant query. */
export function useAssistantSubagentsSettings(required: { port: AssistantSubagentsPort; mode: string; agentId: string | null }, _optional = {}) {
  const state = useAssistantOwnerGrantSettings({ ...required, namespace: SUBAGENTS_NAMESPACE, key: settingsKey });
  // A stale cached ON value cannot establish the current grant after a failed refresh.
  const localAgent = required.mode === "local-cli" && required.agentId !== null;
  const granted = state.settings?.capabilities?.subagents ?? state.settings?.enabled;
  const tooltipKey = !state.loadError && localAgent && granted ? "This chat can use subagents" : null;
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

type DockGrantState = { settings: AssistantSubagentsSettings | null; loadError: string | null };
/** Pure owner/lock split for the dock: who may open the advanced entry vs who may flip switches.
 * @param required - Server grant (null until loaded) and the last refresh error.
 * @returns `owner` (server-confirmed local owner, fresh read) and `canEdit` (owner without an env lock).
 * @complexity O(1). */
function dockGrantAccess(required: DockGrantState, _optional = {}) {
  const owner = !!required.settings?.canEdit && !required.loadError;
  // unavailableReason with canEdit = a local env lock: the server reads every switch OFF, so a
  // clickable switch would save and snap straight back. Lock it and show the reason instead.
  return { owner, canEdit: owner && !required.settings?.unavailableReason };
}
/** Pure capability rows for the dock dialog; the master reads ON only when every capability is ON.
 * @param required - Server grant (null until loaded: everything OFF) and the translation port.
 * @returns The derived master value and one translated row per CLI capability.
 * @complexity O(c) for the fixed capability list. */
function dockCapabilities(required: { settings: AssistantSubagentsSettings | null; t: (key: string) => string }, _optional = {}) {
  const permissions = assistantCliPermissions({ enabled: required.settings?.enabled ?? false, capabilities: required.settings?.capabilities });
  return { enabled: ASSISTANT_CLI_CAPABILITIES.every(({ key }) => permissions.capabilities[key]),
    capabilities: ASSISTANT_CLI_CAPABILITIES.map(item => ({ ...item, label: required.t(item.label), description: required.t(item.description), enabled: permissions.capabilities[item.key] })) };
}
/** Narrows the dialog's free-form key; unknown keys must never reach the grant write. */
function isCliCapability(key: string): key is AssistantCliCapability {
  return ASSISTANT_CLI_CAPABILITIES.some(item => item.key === key);
}
/** Thin host port for Jini's advanced settings dialog; panel and dock share the grant query. */
export function useDockAgentPermissions(required: { t: (key: string) => string; port?: AssistantSubagentsPort; openSettings?: () => void }, _optional = {}) {
  const state = useAdminSubagents({ ...required, port: required.port ?? assistantSubagentsPort });
  const access = dockGrantAccess(state);
  const view = dockCapabilities({ settings: state.settings, t: required.t });
  return { enabled: view.enabled,
    // Hide the advanced entry until the server confirms the local-owner capability. Hosted and
    // non-owner chats retain the quick display menu without advertising unavailable permissions.
    onMoreSettings: access.owner ? required.openSettings : undefined,
    canEdit: access.canEdit, busy: state.busy,
    error: state.loadError ?? state.saveError,
    unavailableReason: state.settings?.unavailableReason,
    capabilities: view.capabilities,
    onChange: ({ key, enabled }: { key?: string; enabled: boolean }) => {
      if (key === undefined) {
        void state.setEnabled({ enabled });
        return;
      }
      if (isCliCapability(key)) void state.setCapability({ key, enabled });
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
