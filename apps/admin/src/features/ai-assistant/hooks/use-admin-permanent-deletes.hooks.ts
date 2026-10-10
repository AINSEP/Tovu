import type { useConfirmRequest } from "@jini-ai/admin/react";
import { assistantPermanentDeletesPort, ASSISTANT_PERMANENT_DELETES_NAMESPACE, PERMANENT_DELETE_TOOLS, PERMANENT_DELETE_DANGERS, type AssistantPermanentDeletesPort } from "@/lib/assistant-permanent-deletes";
import { useAssistantOwnerGrant } from "./use-assistant-owner-grant.hooks";
const settingsKey = ["admin-assistant", "permanent-deletes"] as const;
/** Checkbox changes autosave one complete selection through the same owner-grant ceremony.
 * Turning off preserves the selection; no checked tool grants anything while off.
 * @param required - Site API port and optional translation port.
 * @param optional - The existing Jini confirmation hook test seam.
 * @returns The master/checklist controller; failed writes keep server truth and expose API errors.
 * @example useAdminPermanentDeletes({ port });
 * @complexity O(13) time/space per selection, one audited request. */
export function useAdminPermanentDeletes(required: { port: AssistantPermanentDeletesPort; t?: (key: string) => string }, optional: { useConfirmation?: typeof useConfirmRequest } = {}) {
  const state = useAssistantOwnerGrant({ ...required, namespace: ASSISTANT_PERMANENT_DELETES_NAMESPACE, key: settingsKey,
    title: "Allow permanent deletes from chat?", dangers: PERMANENT_DELETE_DANGERS,
    confirmLabel: "Allow permanent deletes", failure: required.t?.("failed to save permanent delete access") ?? "failed to save permanent delete access",
  }, optional);
  const selected = state.settings?.allowedToolIds ?? [];
  const saveSelection = async (allowedToolIds: string[]) => {
    if (!state.settings?.enabled) return;
    await state.save({ settings: { enabled: true, allowedToolIds } });
  };
  return { ...state,
    groups: ["Content purges", "Settings deletes"].map(label => ({ label, tools: PERMANENT_DELETE_TOOLS.filter(tool => tool.group === label) })),
    setEnabled: async ({ enabled }: { enabled: boolean }, _options = {}) => {
      if (enabled === state.settings?.enabled) return;
      await state.save({ settings: { enabled, allowedToolIds: [...selected] } });
    },
    setTool: ({ toolId, checked }: { toolId: string; checked: boolean }, _options = {}) => saveSelection(checked ? [...new Set([...selected, toolId])] : selected.filter(id => id !== toolId)),
    selectAll: (_input: Record<string, never>, _options = {}) => saveSelection(PERMANENT_DELETE_TOOLS.map(tool => tool.id)),
    selectNone: (_input: Record<string, never>, _options = {}) => saveSelection([]),
  };
}
export function useWiredAdminPermanentDeletes(required: { t?: (key: string) => string }, _optional = {}) {
  return useAdminPermanentDeletes({ ...required, port: assistantPermanentDeletesPort });
}
