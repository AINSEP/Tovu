import { useExternalMcpToolPicker, type ExternalMcpToolPickerPort, type UseWiredExternalMcpToolPicker } from "@jini-ai/admin/screens/settings/hooks/use-external-mcp-tool-picker.hooks";
import type { ExternalMcpProbeErrors } from "@jini-ai/admin/screens/settings/external-mcp-tool-picker-rules";
import { useT } from "@jini-ai/admin/react/kit";
import { useToolPickerFilter, useToolRowHandles } from "@jini-ai/admin/screens/settings/ExternalMcpToolPicker.hooks";
import type { ExternalMcpToolPickerCollaborators } from "@jini-ai/admin/screens/settings/ExternalMcpToolPicker";
import { integrationsApi } from "@/features/integrations/integrations-host-ports";
import { ApiError, describeApiError } from "@/lib/admin-http/request";
import { EXTERNAL_MCP_PRODUCT_VARS } from "@/integrations/jini-admin/settings-external-mcp-copy";
import { useExternalMcpDriftCopy } from "../ExternalMcpSettingsPanel.hooks";

/** The host's request-error vocabulary handed to the generic probe-failure wording. */
const EXTERNAL_MCP_PROBE_ERRORS: ExternalMcpProbeErrors = { isApiError: (error): error is ApiError => error instanceof ApiError, describeApiError };

export const defaultExternalMcpToolPickerPort: ExternalMcpToolPickerPort = {
  probe: ({ serverId }, _options = {}) => integrationsApi.probeExternalMcpServer({ serverId }),
};

/** The zero-port half of the pair — what the component actually calls. Binds the picker's transport to this host's integrations route and request errors. */
export const useWiredExternalMcpToolPicker: UseWiredExternalMcpToolPicker = (deps) =>
  useExternalMcpToolPicker({ port: defaultExternalMcpToolPickerPort, errors: EXTERNAL_MCP_PROBE_ERRORS, ...deps });

/** Everything the Tools modal's picker needs from the host: hooks as required props, product vars as copy. */
export const EXTERNAL_MCP_PICKER_COLLABORATORS: ExternalMcpToolPickerCollaborators = {
  useExternalMcpDriftCopyHook: useExternalMcpDriftCopy,
  useTHook: useT,
  useWiredExternalMcpToolPickerHook: useWiredExternalMcpToolPicker,
  useToolRowHandlesHook: useToolRowHandles,
  useToolPickerFilterHook: useToolPickerFilter,
  productVars: EXTERNAL_MCP_PRODUCT_VARS,
};
