import { useAdminPermanentDeletes, type PermanentDeletesPolicy } from "@jini-ai/admin/screens/assistant-settings/use-admin-permanent-deletes.hooks";
import { assistantPermanentDeletesPort, ASSISTANT_PERMANENT_DELETES_NAMESPACE, PERMANENT_DELETE_TOOLS, PERMANENT_DELETE_DANGERS } from "@/lib/assistant-permanent-deletes";
import { assistantOwnerGrantDependencies } from "./assistant-owner-grant-dependencies.hooks";

/**
 * @file The host binding for the engine's permanent-deletes grant: this admin's policy (the 13
 * deletable tools, their two groups, the consent copy and danger list) and its site API port.
 */
export const adminPermanentDeletesPolicy: PermanentDeletesPolicy = {
  namespace: ASSISTANT_PERMANENT_DELETES_NAMESPACE, key: ["admin-assistant", "permanent-deletes"],
  tools: PERMANENT_DELETE_TOOLS, groupLabels: ["Content purges", "Settings deletes"],
  title: "Allow permanent deletes from chat?", dangers: PERMANENT_DELETE_DANGERS,
  confirmLabel: "Allow permanent deletes", failure: "failed to save permanent delete access",
};

export function useWiredAdminPermanentDeletes(required: { t?: (key: string) => string }, _optional = {}) {
  return useAdminPermanentDeletes({ ...required, ...assistantOwnerGrantDependencies, ...adminPermanentDeletesPolicy, port: assistantPermanentDeletesPort });
}
