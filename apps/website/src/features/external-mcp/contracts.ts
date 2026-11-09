export type { ExternalMcpAccessSnapshot } from "../../contracts/core/external-mcp-access.js";
/** External-MCP connection DTOs and ports; no assistant or service initialization. */
import type { CredentialTokenHint } from "../../contracts/core/credential-token.js";
import type { ExternalMcpServerView as CanonicalExternalMcpServerView } from "@jini-ai/core/contracts/hosted-mcp";
import type { ExternalMcpOAuthDeps as CanonicalExternalMcpOAuthDeps } from "@jini-ai/integrations/api-connections/hosted-mcp";

/** Canonical vocabulary values (EXTRACT-S5 H1a; source blob e2f1d908 at c3801c833). */
export { SUPPORTED_EXTERNAL_MCP_TRANSPORTS, EXTERNAL_MCP_OAUTH_GRANTS } from "@jini-ai/mcp/federation/hosted";
/** The one canonical record/repository/save/view/config closure; never copy these shapes here. */
export type {
  ExternalMcpTransport, ExternalMcpOAuthGrant, ExternalMcpServerRecord, ExternalMcpAccessUpdate, ExternalMcpServerRepoPort,
  ExternalMcpServerTarget, ExternalMcpServerConfig, ExternalMcpOAuthView, ExternalMcpStoreDeps, ExternalMcpOAuthTokenResolverPort,
  SaveExternalMcpOAuthInput, SaveExternalMcpServerInput, ExternalMcpSealedOAuthPayload, SealedExternalMcpOAuth,
  ExternalMcpAuthorizationStart, ExternalMcpDeviceStart, ExternalMcpConnectStart, ExternalMcpRevocationReason,
} from "@jini-ai/core/contracts/hosted-mcp";
/** Sign-in contracts; Tovu binds its own shared-owner storage and credential-hint shapes below. */
export type { DeviceAuthorizationStore, ExternalMcpOAuthService } from "@jini-ai/integrations/api-connections/hosted-mcp";

/** The admin read model with Tovu's credential-hint shape. */
export type ExternalMcpServerView = CanonicalExternalMcpServerView<CredentialTokenHint>;
/** Sign-in dependencies with Tovu's desktop shared-owner storage. */
export type ExternalMcpOAuthDeps = CanonicalExternalMcpOAuthDeps<import("./external-mcp-shared-oauth.js").SharedExternalMcpOwner>;
