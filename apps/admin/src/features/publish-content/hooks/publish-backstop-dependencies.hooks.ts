import { api, authenticatedAdminRequest, ApiError, WORKSPACE_ID } from "@/lib/api";
import type { PublishBackstopPort } from "./publish-backstop-port.hooks";

const base = `/workspaces/${encodeURIComponent(WORKSPACE_ID)}/publish-content`;
export const defaultPublishBackstopPort: PublishBackstopPort = {
  async status(_required = {}, _optional = {}) {
    try {
      return await authenticatedAdminRequest<{ allowed: boolean; installed: boolean }>({ path: `${base}/backstop/status`, method: "GET" });
    } catch (error) {
      // Older servers and accounts outside owner/built-in-admin keep the section hidden.
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return { allowed: false, installed: false };
      throw error;
    }
  },
  listPeers: (_required = {}, _optional = {}) => api.listPublishContentPeers(),
  gaps: (_required = {}, _optional = {}) => authenticatedAdminRequest({ path: `${base}/backstop/gaps`, method: "GET" }),
  plan: (required, _optional = {}) => authenticatedAdminRequest({ path: `${base}/backstop`, method: "POST", body: { ...required, action: "plan" } }),
  send: (required, _optional = {}) => authenticatedAdminRequest({ path: `${base}/backstop`, method: "POST", body: { ...required, action: "send" } }),
  run: ({ runId }, _optional = {}) => authenticatedAdminRequest({ path: `${base}/runs/${encodeURIComponent(runId)}/backstop`, method: "GET" }),
  undo: ({ runId }, _optional = {}) => authenticatedAdminRequest({ path: `${base}/runs/${encodeURIComponent(runId)}/undo-backstop`, method: "POST", body: {} }),
};
