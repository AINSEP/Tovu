import { bindExternalMcpAdmissions, type ExternalMcpAdmissionsPort } from "@jini-ai/mcp/react/external-mcp/hooks/use-external-mcp-admissions.hooks";
import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
import { integrationsApi } from "@/features/integrations/integrations-host-ports";
import { aiAssistantApi } from "@/features/ai-assistant/api/ai-assistant-api";
import { authApi } from "@/features/auth/api/auth-api";
import { ApiError, API_UNREACHABLE_CODE, describeApiError, REQUEST_TIMEOUT_CODE } from "@/lib/admin-http/request";
import { useFetchMutation, useFetchQuery } from "@jini-ai/ui/fetch-query";
import { hasPermission } from "@jini-ai/ui/panel-kit";
import { admissionRestartHelps } from "@jini-ai/admin/screens/settings/external-mcp-tool-drift";
import { describeAdmissionDrift } from "@jini-ai/admin/screens/settings/external-mcp-connection-drift";
import { useExternalMcpDriftCopy } from "../ExternalMcpSettingsPanel.hooks";
import { EXTERNAL_MCP_DRIFT_COPY } from "@jini-ai/admin/screens/settings/external-mcp-drift-copy";

export const defaultExternalMcpAdmissionsPort: ExternalMcpAdmissionsPort = {
  getAdmissions: () => integrationsApi.getExternalMcpAdmissions(),
  me: () => authApi.me(),
  restartAssistantDaemon: () => aiAssistantApi.restartAssistantDaemon(),
};

export const { isAssistantStartingError, useExternalMcpAdmissions, useWiredExternalMcpAdmissions } = bindExternalMcpAdmissions({
  hooks: { useCopyHook: useExternalMcpDriftCopy, useFetchQuery, useFetchMutation },
  deps: {
    port: defaultExternalMcpAdmissionsPort, hasPermission, describeAdmissionDrift, admissionRestartHelps,
    driftCopy: EXTERNAL_MCP_DRIFT_COPY, describeApiError,
    isApiError: (error): error is ApiError => error instanceof ApiError,
    apiUnreachableCode: API_UNREACHABLE_CODE, requestTimeoutCode: REQUEST_TIMEOUT_CODE,
    setTimeout, clearTimeout,
    reportRestartFailure: (error) => console.error("[external-mcp] Could not handle the restart result", describeErrorForLog({ err: error })),
  },
});
