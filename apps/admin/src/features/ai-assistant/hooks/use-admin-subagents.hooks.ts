import type { useConfirmRequest } from "@jini-ai/admin/react";
import { assistantSubagentsPort, SUBAGENTS_NAMESPACE, SUBAGENT_DANGERS, type AssistantSubagentsPort } from "@/lib/assistant-subagents";
import { useAssistantOwnerGrant, useAssistantOwnerGrantSettings } from "./use-assistant-owner-grant.hooks";
const settingsKey = ["admin-assistant", "subagents"] as const;
/** The panel and dock share the site-owner grant query. */
export function useAssistantSubagentsSettings(required: { port: AssistantSubagentsPort }, _optional = {}) {
  const state = useAssistantOwnerGrantSettings({ ...required, namespace: SUBAGENTS_NAMESPACE, key: settingsKey });
  // A stale cached ON value cannot establish the current grant after a failed refresh.
  const indicatorKey = state.loadError ? "Subagents: unknown" : state.settings?.enabled ? "Subagents: on" : null;
  return { ...state, indicatorKey };
}
/** Subagent-specific copy and boolean payload; the shared hook owns consent, locking and errors. */
export function useAdminSubagents(required: { port: AssistantSubagentsPort; t?: (key: string) => string }, optional: { useConfirmation?: typeof useConfirmRequest } = {}) {
  const state = useAssistantOwnerGrant({ ...required, namespace: SUBAGENTS_NAMESPACE, key: settingsKey,
    title: "Allow the assistant to spawn subagents?", dangers: SUBAGENT_DANGERS,
    confirmLabel: "Allow subagents", failure: required.t?.("failed to save subagent access") ?? "failed to save subagent access",
  }, optional);
  return { ...state, setEnabled: async ({ enabled }: { enabled: boolean }, _options = {}) => {
    if (enabled === state.settings?.enabled) return;
    await state.save({ settings: { enabled } });
  } };
}
/** Production binding stays outside the injected policy hook. */
export function useWiredAdminSubagents(required: { t?: (key: string) => string }, _optional = {}) {
  return useAdminSubagents({ ...required, port: assistantSubagentsPort });
}
export function useWiredAssistantSubagentsSettings(_required: Record<string, never>, _optional = {}) {
  return useAssistantSubagentsSettings({ port: assistantSubagentsPort });
}
