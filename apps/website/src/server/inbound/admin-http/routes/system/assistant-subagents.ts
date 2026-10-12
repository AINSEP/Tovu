import { readAssistantSubagentsEnabled } from "#src/assistant/subagent-settings";
import { ASSISTANT_SUBAGENTS_NAMESPACE, ASSISTANT_SUBAGENTS_KEY, ASSISTANT_SUBAGENTS_WRITE_REASON } from "#src/contracts/headless/assistant-subagents-policy";
import { registerAssistantOwnerGrantRoutes, type AssistantOwnerGrantDeps } from "./assistant-owner-grant.js";
import type { Express } from "express";
/** Subagent boolean payload over the same owner/audit ceremony as permanent deletes, without consent.
 * @param required - App and site-bound ledger/identity ports; mounts GET/PUT without a separate store.
 * @example registerAdminAssistantSubagentsRoutes({ app, deps });
 * @complexity O(1) time/space plus the shared ledger writes; route adapters report errors. */
export function registerAdminAssistantSubagentsRoutes(required: { app: Express; deps: AssistantOwnerGrantDeps }, _optional = {}): void {
  registerAssistantOwnerGrantRoutes({ ...required,
    path: "/api/admin/v1/workspaces/:workspaceId/system/assistant-subagents",
    namespace: ASSISTANT_SUBAGENTS_NAMESPACE, key: ASSISTANT_SUBAGENTS_KEY,
    writeReason: ASSISTANT_SUBAGENTS_WRITE_REASON,
    validationError: "enabled must be a boolean.",
    read: async () => ({ enabled: await readAssistantSubagentsEnabled({ ...required.deps, settingsReady: required.deps.settingsUiTabsReady }, { readFailure: "throw" }) }),
    parse: body => ({ enabled: body.enabled as boolean }), value: settings => settings.enabled,
  }, { requireAcknowledgment: false });
}
