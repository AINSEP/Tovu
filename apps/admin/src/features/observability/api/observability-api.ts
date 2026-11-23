import { createObservabilityApi } from "@jini-ai/admin/screens/observability/api/observability-api";
import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { request } from "../../../lib/admin-http/request";

/** The admin API calls of the observability feature. Host binding: the observability client on this admin's authenticated request and workspace. */
export const observabilityApi = createObservabilityApi({ request, workspaceId: WORKSPACE_ID });
