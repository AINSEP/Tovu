import { toolMetadata } from '../../contracts/core/tool-metadata/server-logs.js';
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, ToolInputError, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolRegistration } from "@jini-ai/core";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import type { ToolContributor } from "#src/assistant/index";
import { ForbiddenError } from "@jini-ai/cms/core";
import { forbiddenRule, withModelFacingErrors } from "@jini-ai/core/model-facing-tool-errors";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import { serverLogsAgentToolCatalog } from "./agent-tools.js";
import { processServerLogSource } from "./process-source.js";
import { parseServerLogFilters, readServerLogs, ServerLogFilterError, type ServerLogSourcePort } from "./read-server-logs.js";

export interface ServerLogsToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  /** Defaults to this process's captured console buffer. */
  serverLogs?: ServerLogSourcePort;
}

export const serverLogsDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> readServerLogs over an in-memory buffer only; writes nothing.
  ["system_read_server_logs", "none"],
]);

/**
 * Builds `system_read_server_logs`, gated by the same `system.read` permission as the admin route.
 * @param deps - Site scope, authorization and the log source port.
 * @returns One read-only registration.
 * @throws {ToolInputError} For an unusable filter or denied system.read.
 * @complexity O(n) over buffered lines.
 */
export function buildServerLogsRegistrations(deps: ServerLogsToolDeps): ToolRegistration[] {
  return buildDomainRegistrations({ metadata: toolMetadata, domain: "system-server-logs", catalogModule: "features/server-logs/agent-tools.ts", catalog: indexCatalogById({ catalog: serverLogsAgentToolCatalog }), derivedRisk: serverLogsDerivedRisk, handlers: withModelFacingErrors({ handlers: {
    system_read_server_logs: async ctx => {
      const raw = requireInputRecord({ input: ctx.input });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "system.read" }, { entityType: "server-logs" });
      let filters;
      try {
        filters = parseServerLogFilters({ raw });
      } catch (err) {
        if (err instanceof ServerLogFilterError) throw new ToolInputError({ message: err.message });
        throw err;
      }
      return readServerLogs({ logs: deps.serverLogs ?? processServerLogSource }, filters);
    },
  }, rules: [forbiddenRule({ domainPrefix: "SERVER_LOGS", error: ForbiddenError })] }) });
}

/** Keeps the diagnostic under its own contributor domain. */
export function contributeServerLogsTools(): ToolContributor {
  return { domain: "system-server-logs", build: buildServerLogsRegistrations, risk: serverLogsDerivedRisk };
}
