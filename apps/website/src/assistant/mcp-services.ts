/** External MCP store and OAuth services for feature callers, without tool-registry wiring. */
export {
  ExternalMcpValidationError,
  resolveExternalMcpOAuthStatus,
  saveExternalMcpServer,
} from "./external-mcp-store.js";
export type {
  ExternalMcpServerRecord,
  ExternalMcpServerRepoPort,
  ExternalMcpStoreDeps,
} from "./external-mcp-store.js";
export type { ExternalMcpOAuthService } from "./external-mcp-oauth.js";
