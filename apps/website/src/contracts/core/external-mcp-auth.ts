/**
 * @file Compatibility path for the external-MCP auth-mode readers. The canonical values moved to
 * `@jini-ai/mcp/federation/hosted` and the literal-union types to `@jini-ai/core/contracts/hosted-mcp`
 * (EXTRACT-S5 H1a; source blob 6418431c at c3801c833). Every old name keeps its identity and signature.
 */
export { EXTERNAL_MCP_AUTH_MODES, resolveExternalMcpAuthMode, externalMcpRecordHasStaticAccessToken, EXTERNAL_MCP_OAUTH_STATUSES, resolveExternalMcpOAuthStatus } from "@jini-ai/mcp/federation/hosted";
export type { ExternalMcpAuthMode, ExternalMcpOAuthStatus } from "@jini-ai/core/contracts/hosted-mcp";
