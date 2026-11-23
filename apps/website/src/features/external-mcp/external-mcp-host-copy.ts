/**
 * @file The host's product copy and collaborators for the external MCP domain's model-facing tools,
 * bound once.
 *
 * The setup and diagnostics catalogs, their handlers and the admissions reader live in
 * `@jini-ai/mcp/external/*` and name no product; the settings-screen location, the host's own read
 * tool, the outbound-call rate-limit profile and the redacting log formatter are this host's, so they
 * are passed in here and every tool binding, composition caller and test reads the bound values from
 * this module.
 */
import type { ExternalMcpHostCopy } from "@jini-ai/mcp/external/external-mcp-host-copy";
import { createExternalMcpAgentToolCatalog } from "@jini-ai/mcp/external/agent-tools";
import { createExternalMcpOperationsToolCatalog, type ExternalMcpOperations } from "@jini-ai/mcp/external/operations-tools";
import { createServerAdmissionsReader } from "@jini-ai/mcp/federation/external-mcp-admissions";
import { createRateLimiter, OUTBOUND_CALL_PER_IP } from "#src/contracts/core/rate-limit/rate-limit";
import { describeErrorForLog } from "#src/contracts/core/model-facing-tool-errors";

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

export const readServerAdmissions = createServerAdmissionsReader({ describeErrorForLog });
