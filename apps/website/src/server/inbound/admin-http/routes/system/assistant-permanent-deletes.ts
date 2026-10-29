import type { Express } from "express";
import { readAssistantPermanentDeletesPolicy } from "#src/assistant/permanent-delete-settings";
import { ASSISTANT_PERMANENT_DELETES_NAMESPACE, ASSISTANT_PERMANENT_DELETES_KEY, ASSISTANT_PERMANENT_DELETES_WRITE_REASON, PERMANENT_DELETE_TOOLS } from "#src/contracts/headless/assistant-permanent-deletes-policy";
import { rejectSettingsRequest } from "../settings/shared.js";
import { registerAssistantOwnerGrantRoutes, type AssistantOwnerGrantDeps } from "./assistant-owner-grant.js";
/** Mount this site's owner policy on the shared acknowledged/audited grant ceremony.
 * Reject the complete selection before any receipt or value write; never silently discard bad ids.
 * @param required - Express app and the existing site-bound settings/identity ports.
 * @returns Nothing; validation/permission errors are reported through the standard JSON route adapter.
 * @example registerAdminAssistantPermanentDeletesRoutes({ app, deps });
 * @complexity O(13) time/space per request plus ledger reads/writes. */
export function registerAdminAssistantPermanentDeletesRoutes(required: { app: Express; deps: AssistantOwnerGrantDeps }, _optional = {}): void {
  registerAssistantOwnerGrantRoutes({ ...required,
    path: "/api/admin/v1/workspaces/:workspaceId/system/assistant-permanent-deletes",
    namespace: ASSISTANT_PERMANENT_DELETES_NAMESPACE, key: ASSISTANT_PERMANENT_DELETES_KEY,
    writeReason: ASSISTANT_PERMANENT_DELETES_WRITE_REASON,
    validationError: "enabled must be a boolean; enabling permanent deletes requires riskAcknowledged: true.",
    read: () => readAssistantPermanentDeletesPolicy({ ...required.deps, settingsReady: required.deps.settingsUiTabsReady }),
    parse: body => {
      const validKeys = !Object.keys(body).some(key => !["enabled", "allowedToolIds", "riskAcknowledged"].includes(key));
      const validIds = Array.isArray(body.allowedToolIds) && body.allowedToolIds.length <= PERMANENT_DELETE_TOOLS.length
        && !body.allowedToolIds.some(id => !PERMANENT_DELETE_TOOLS.some(tool => tool.id === id));
      if (!validKeys || !validIds || new Set(body.allowedToolIds).size !== body.allowedToolIds.length) {
        rejectSettingsRequest({ status: 400, code: "VALIDATION_ERROR", error: "allowedToolIds must contain unique ids from the 13 supported permanent delete tools. Unknown and forbidden ids are rejected." });
      }
      return { enabled: body.enabled as boolean, allowedToolIds: [...body.allowedToolIds] as string[] };
    }, value: settings => ({ enabled: settings.enabled, allowedToolIds: settings.allowedToolIds }),
  });
}
