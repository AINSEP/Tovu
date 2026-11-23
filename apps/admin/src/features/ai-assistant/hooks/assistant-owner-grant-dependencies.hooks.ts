import { useConfirmRequest } from "@jini-ai/admin/react";
import type { OwnerGrantDependencies } from "@jini-ai/admin/screens/assistant-settings/use-assistant-owner-grant.hooks";
import { publishSettingsRefresh, subscribeToSettingsRefresh } from "@jini-ai/admin/shell/lib/settings-refresh-bus";
import { describeApiError } from "@/lib/admin-http/request";

/**
 * @file The host binding for the engine's owner-grant hook (Full CLI access and permanent deletes):
 * this admin's settings-refresh feed, its default confirmation hook and its shared error-to-copy rule
 * (an `ApiError` or `Error` shows its own message, else the grant's failure copy).
 */
export const assistantOwnerGrantDependencies: OwnerGrantDependencies = {
  useConfirmation: useConfirmRequest,
  refresh: { subscribe: subscribeToSettingsRefresh, publish: publishSettingsRefresh },
  describeError: ({ error, fallback }) => describeApiError({ e: error, fallback }),
};
