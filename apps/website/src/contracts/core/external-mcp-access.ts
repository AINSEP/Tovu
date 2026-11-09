/** Compatibility path for the shared external-MCP access vocabulary and pure row projections. Canonical
 * values (and the one `ExternalMcpValidationError` class) live in `@jini-ai/mcp/federation/hosted`, types in
 * `@jini-ai/core/contracts/hosted-mcp` (EXTRACT-S5 H1a; source blob 4f6fc1ba at c3801c833). */
export type { ExternalMcpAccessSnapshot, ExternalMcpApprovedAccess } from "@jini-ai/core/contracts/hosted-mcp";
export { ExternalMcpValidationError, parseExternalMcpJsonArray, externalMcpAdmissionRevision, externalMcpAccessSnapshot, readExternalMcpToolGrants, validateExternalMcpToolNames } from "@jini-ai/mcp/federation/hosted";
