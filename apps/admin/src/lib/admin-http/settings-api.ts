import type { SettingScope } from "@jini-ai/core/settings";
import type { SettingValueResponse } from "@jini-ai/admin/core";
import { WORKSPACE_ID } from "./config";
import { authenticatedAdminRequest } from "./request";
import { type SettingResolvedValue, shareSettingsEffectiveRead } from "../settings-effective-reads";

const BLANK_NAMESPACE_MESSAGE = "Cannot read settings without a namespace. Pass the settings group to read, for example \"core.language\".";

/** The admin API calls of the settings feature. */
export const settingsApi = {
  // SPEC-007 Settings (core-only layered ledger) — Phase 6 UI.
  getSettingsEffective: ({ namespace }: { namespace: string }, options: { principalId?: string } = {}) => {
    // The server answers a blank namespace with a bare 400 that names no caller; refuse it here, where
    // the stack still points at whoever passed it. Rejected (not thrown) so `.catch` chains still work.
    if (namespace.trim() === "") return Promise.reject(new TypeError(BLANK_NAMESPACE_MESSAGE));
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
