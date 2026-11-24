/** External-MCP host bindings of the canonical generic contracts; no assistant or service initialization.
 * Every other external-MCP type is imported from its owner (`@jini-ai/core/contracts/hosted-mcp`,
 * `@jini-ai/integrations/api-connections/hosted-mcp`, `@jini-ai/mcp/federation/hosted`); never re-export them here. */
import type { CredentialTokenHint } from "@jini-ai/platform/secrets/credential-token";
import type { ExternalMcpServerView as CanonicalExternalMcpServerView } from "@jini-ai/core/contracts/hosted-mcp";
import type { ExternalMcpOAuthDeps as CanonicalExternalMcpOAuthDeps, SharedExternalMcpOwner } from "@jini-ai/integrations/api-connections/hosted-mcp";

/** The admin read model with Tovu's credential-hint shape. */
export type ExternalMcpServerView = CanonicalExternalMcpServerView<CredentialTokenHint>;
/** Sign-in dependencies with Tovu's desktop shared-owner storage. */
export type ExternalMcpOAuthDeps = CanonicalExternalMcpOAuthDeps<SharedExternalMcpOwner>;
