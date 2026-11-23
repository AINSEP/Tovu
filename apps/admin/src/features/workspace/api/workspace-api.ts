import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { authenticatedAdminRequest } from "../../../lib/admin-http/request";
import type { AdminWorkspaceResponse as AdminWorkspace } from "@jini-ai/core/contracts/site/cms-workspace";

/** The admin API calls of the workspace feature. */
export const workspaceApi = {
  // SPEC-044 (Workspace Administration). Note the path shape here differs from every call above:
  // `workspaces` IS the resource (no `/workspaces/${WORKSPACE_ID}/<sub-resource>` nesting) —
  // `/workspaces` (list/create) and `/workspaces/:id` (get/update/delete), matching api.spec.md.
  getWorkspace: () => authenticatedAdminRequest<{ workspace: AdminWorkspace }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}` }),
  updateWorkspace: (options: { name?: string; slug?: string } = {}) =>
    authenticatedAdminRequest<{ workspace: AdminWorkspace }>({ method: "PATCH", path: `/workspaces/${WORKSPACE_ID}`, body: options }),
};
