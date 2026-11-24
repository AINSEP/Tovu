import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { request } from "../../../lib/admin-http/request";
import type { AdminMember } from "@jini-ai/core/contracts/site/user-management-react";

/** The admin API calls of the members feature. */
export const membersApi = {
  listMembers: () =>
    request<{ members: AdminMember[] }>({ path: `/workspaces/${WORKSPACE_ID}/members` }),
  getMember: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{ member: AdminMember }>({ path: `/workspaces/${WORKSPACE_ID}/members/${encodeURIComponent(id)}` }),
  disableMember: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{ member: AdminMember }>({ path: `/workspaces/${WORKSPACE_ID}/members/${encodeURIComponent(id)}/disable` }, { init: {
      method: "POST",
    } }),
  requestMemberMagicLink: ({ email }: { email: string }, options: { redirectPath?: string } = {}) =>
    request<{ delivered: true }>({ path: `/workspaces/${WORKSPACE_ID}/members/request-magic-link` }, { init: {
      method: "POST",
      body: JSON.stringify({ email, redirectPath: options.redirectPath }),
    } }),
};
