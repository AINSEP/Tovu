import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { request } from "../../../lib/admin-http/request";
import { querySuffix } from "@jini-ai/core/admin-runtime";
import type { AdminObservabilityStatus, AdminServerLogs, AdminServerLogsQuery, AdminTelemetryTestResult } from "./observability-api.types";

/** The admin API calls of the observability feature. */
export const observabilityApi = {
  // Observability panel, Overview tab (`apps/website/src/server/inbound/admin-http/routes/system/
  // observability-status.ts`) — `system.read`-gated, same shape as `getDeploymentOverview` above.
  /** Whether `platform/observability`'s real OTel adapter is on right now, and under what service
   *  name — never the OTLP endpoint value itself. See {@link AdminObservabilityStatus}. */
  getObservabilityStatus: () =>
    request<AdminObservabilityStatus>({ path: `/workspaces/${WORKSPACE_ID}/system/observability-status` }),
  sendObservabilityTestError: () => request<AdminTelemetryTestResult>({ path: `/workspaces/${WORKSPACE_ID}/system/observability/test-error` }, { init: { method: "POST" } }),
  /** Owner-only filter over native CLI fallback entries in the existing audit store. */
  getToolGaps: () => request<{ entries: import('@jini-ai/daemon/tool-audit').ToolGapEntry[] }>({ path: `/workspaces/${WORKSPACE_ID}/system/tool-gaps` }),
  /** Recent captured server log lines (`routes/system/server-logs.ts`, `system.read`-gated) — the
   *  Observability "Recent errors" tab. */
  getServerLogs: (query: AdminServerLogsQuery = {}) => {
    const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
    const qs = params.toString();
    return request<AdminServerLogs>({ path: `/workspaces/${WORKSPACE_ID}/system/server-logs${querySuffix({ query: qs })}` });
  },
};
