/** External MCP store and OAuth services for feature callers, without tool-registry wiring. */
export {
  ExternalMcpSecretStoreUnconfiguredError,
  ExternalMcpValidationError,
  listExternalMcpServerViews,
  readEnabledExternalMcpConfigs,
  resolveExternalMcpOAuthStatus,
  saveExternalMcpServer,
  openExternalMcpOAuthPayload,
} from "./external-mcp-store.js";
export type {
  ExternalMcpServerRecord,
  ExternalMcpServerRepoPort,
  ExternalMcpServerView,
  ExternalMcpStoreDeps,
  SaveExternalMcpOAuthInput,
  SaveExternalMcpServerInput,
} from "./external-mcp-store.js";
export type { DeviceAuthorizationStore, ExternalMcpOAuthService } from "./external-mcp-oauth.js";
export type { ConversationToolApprovalStore, ExternalMcpToolApprovalRecord, ExternalMcpToolApprovalRepoPort } from "./external-mcp-tool-approval-ports.js";
export { notifyExternalMcpRosterChanged } from "./external-mcp-roster-change.js";

export { withExtensionApprovalPolicy } from "./assistant-tool-approval-policy.js";
