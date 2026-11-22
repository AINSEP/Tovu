import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { authenticatedAdminRequest } from "../../../lib/admin-http/request";
import type { AdminFormDefinition } from "./forms-api.types";

/** The admin API calls of the forms feature. */
export const formsApi = {
  // SPEC-010 Forms (Tier-1 sample plugin) — admin UI.
  listForms: () => authenticatedAdminRequest<{ data: AdminFormDefinition[] }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/forms` }),
};
