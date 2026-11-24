/**
 * @file The host's product copy and collaborators for the external MCP domain's model-facing tools,
 * bound once.
 *
 * The setup and diagnostics catalogs, their handlers and the admissions reader live in
 * `@jini-ai/mcp/external/*` and name no product; the settings-screen location, the host's own read
 * tool, the outbound-call rate-limit profile and the redacting failure log line are this host's, so they
 * are passed in here and every tool binding, composition caller and test reads the bound values from
 * this module.
 */
import type { ExternalMcpHostCopy } from "@jini-ai/mcp/external/external-mcp-host-copy";
import { createExternalMcpAgentToolCatalog } from "@jini-ai/mcp/external/agent-tools";
import { createExternalMcpOperationsToolCatalog, type ExternalMcpOperations } from "@jini-ai/mcp/external/operations-tools";
import { createServerAdmissionsReader } from "@jini-ai/mcp/federation/external-mcp-admissions";
import { createRateLimiter, OUTBOUND_CALL_PER_IP } from "#src/contracts/core/rate-limit/rate-limit";
import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
import { credentialText } from "@tovu/contracts/credential-copy";
import { connectMcpHttpSession } from "../../assistant/index.js";
import { createExternalMcpProbe } from "@jini-ai/mcp/federation/external-mcp-probe";
import type { ExternalMcpProbeSessionFactory } from "@jini-ai/mcp/federation/hosted";
import { createExternalMcpReauthRequiredError, externalMcpSettingsDeepLink } from "./external-mcp-oauth.js";
import { readEnabledExternalMcpConfigs } from "./external-mcp-store.js";
import type { ExternalMcpOAuthService } from "@jini-ai/integrations/api-connections/hosted-mcp";
import type { ExternalMcpToolDeps } from "./deps.js";

export const EXTERNAL_MCP_HOST_COPY: ExternalMcpHostCopy = {
  settingsLocation: "Settings → External MCP",
  listToolName: "content_read.external_mcp",
};

export const externalMcpAgentToolCatalog = createExternalMcpAgentToolCatalog({ copy: EXTERNAL_MCP_HOST_COPY });
export const externalMcpOperationsToolCatalog = createExternalMcpOperationsToolCatalog({ copy: EXTERNAL_MCP_HOST_COPY });

/** The copy and probe budget every `contributeExternalMcpOperationsTools` caller spreads into its services. */
export const externalMcpOperationsHost: Pick<ExternalMcpOperations, "copy" | "createProbeLimiter"> = {
  copy: EXTERNAL_MCP_HOST_COPY,
  createProbeLimiter: ({ clock }) => createRateLimiter({ profile: OUTBOUND_CALL_PER_IP, clock }),
};

export const readServerAdmissions = createServerAdmissionsReader({
  reportReadFailure: ({ error }) => console.error("external-mcp server admissions read failed", describeErrorForLog({ err: error })),
});

export type ExternalMcpProbeServiceDeps = Pick<ExternalMcpToolDeps, "workspaceId" | "clock" | "externalMcpServerRepo" | "siteAssistantSecretSealer"> & {
  /**
   * Optional: only consulted for a connection whose `authMode` is `"oauth"`.
   * `readEnabledExternalMcpConfigs`'s own `oauth` parameter is equally optional, for the same
   * reason — a deployment that has never wired an OAuth service can still probe a `none`/
   * `static_env` connection, so this route must not demand the service just to run at all.
   */
  readonly externalMcpOAuth?: ExternalMcpOAuthService;
  /** Defaults to the real hosted MCP client. See {@link ExternalMcpProbeSessionFactory}. */
  readonly connect?: ExternalMcpProbeSessionFactory;
};

/** The saved-server probe the admin route and assistant tools call: Tovu's store read, HTTP session identity,
 *  reauthorization error, settings link and credential copy, bound once. */
export const probeExternalMcpServer = createExternalMcpProbe<ExternalMcpProbeServiceDeps>({
  host: {
    readEnabledConfigs: ({ deps, workspaceId }) => readEnabledExternalMcpConfigs(
      { deps: { repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer, oauth: deps.externalMcpOAuth?.tokenResolver }, workspaceId }),
    connectHttpSession: connectMcpHttpSession,
    reauthRequired: createExternalMcpReauthRequiredError,
    // The 409's outward text is this host's copy: the reauthorization error class's own message.
    reauthResponseText: input => createExternalMcpReauthRequiredError(input).message,
    settingsDeepLink: externalMcpSettingsDeepLink,
    reauthCode: "EXTERNAL_MCP_REAUTH_REQUIRED",
    connectFailureText: credentialText,
  },
});
