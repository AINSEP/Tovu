import { createObservabilityApi } from "@jini-ai/admin/screens/observability/api/observability-api";
import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { request } from "../../../lib/admin-http/request";

// Observability panel, Overview tab (`apps/website/src/server/inbound/admin-http/routes/system/
// observability-status.ts`) — `system.read`-gated, same shape as `getDeploymentOverview` above.
// Now: the client is `@jini-ai/admin`'s `createObservabilityApi`, bound below.
/** `GET /system/server-logs` — mirrors `ServerLogsResult` in
 *  `apps/website/src/features/server-logs/read-server-logs.ts`. `capturing: false` means nothing is
 *  recording lines, so an empty list is not proof of no errors.
 * Now: the type is `ServerLogsResult` in `@jini-ai/core/contracts/site/platform-server-logs`, which
 * this client's `getServerLogs` returns.
 */
/** The admin API calls of the observability feature. Host binding: the observability client on this admin's authenticated request and workspace. */
export const observabilityApi = createObservabilityApi({ request, workspaceId: WORKSPACE_ID });
