import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { request } from "../../../lib/admin-http/request";

/** The admin API calls of the providers feature. */
export const providersApi = {
  useProjectKey: ({ keyId, use }: { keyId: string; use: boolean }, _optional = {}) =>
    request<{ keyId: string; usedByThisSite: boolean; usedBy: string[]; appliesAt: "now" | "restart" | "failed"; message?: string }>({ path: `/workspaces/${WORKSPACE_ID}/project-keys/${encodeURIComponent(keyId)}/use` }, { init: { method: "PUT", body: JSON.stringify({ use }) } }),
};
