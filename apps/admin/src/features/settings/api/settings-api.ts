import type { SettingScope } from "@jini-ai/core/settings";
import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { authenticatedAdminRequest } from "../../../lib/admin-http/request";
import { type SettingResolvedValue, shareSettingsEffectiveRead } from "../../../lib/settings-effective-reads";
import type { SettingValueResponse } from "./settings-api.types";

/** The admin API calls of the settings feature. */
export const settingsApi = {
  // SPEC-007 Settings (core-only layered ledger) — Phase 6 UI.
  getSettingsEffective: ({ namespace }: { namespace: string }, options: { principalId?: string } = {}) => {
    const params = new URLSearchParams({ namespace });
    if (options.principalId) params.set("principalId", options.principalId);
    const path = `/workspaces/${WORKSPACE_ID}/settings/effective?${params.toString()}`;
    return shareSettingsEffectiveRead({ namespace, path, port: {
      read: () => authenticatedAdminRequest<{ data: SettingResolvedValue[] }>({ method: "GET", path }),
    } }, {});
  },
  setSetting: (
    input: { namespace: string; key: string; scope: SettingScope; valueJson: unknown },
    options: { principalId?: string } = {}
  ) =>
    authenticatedAdminRequest<SettingValueResponse>({ method: "PUT", path: `/workspaces/${WORKSPACE_ID}/settings/value`, body: { ...input, ...options } }),
};
