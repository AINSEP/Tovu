import { createPluginInstallAttachmentReader } from "#src/server/runtime/composition/plugin-install-attachment-reader";
import assert from "node:assert/strict";
import ts from "typescript";
import { createContributionRegistry, createToolRegistry, type ToolRegistry } from "@jini-ai/core";
import { buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import { listToolCatalogEntries } from "#src/assistant/tool-catalog-query";
import { attachAssistantToolExtensions } from "#src/assistant/installed-extension-tools";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { installFirstPartyToolContributors } from "#src/server/runtime/composition/tool-catalog-manifest";
import { registerInstalledExtensionTools } from "#src/server/runtime/composition/installed-extension-tools";
import { buildExternalMcpFederationDeps } from "#src/assistant/external-mcp-connection-source";
import type { NewsletterRouteDeps } from "#src/server/inbound/admin-http/routes/newsletter/deps";
import { daemonFunction, daemonSource, daemonVariableStatement, evaluateDaemonStatements } from "./daemon-source.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createNativeApprovalMemory } from "#src/contracts/core/native-approval-memory";
import { createLiveRunTracker } from "#src/assistant/agent-session-preset";


/** Execute the real daemon's base construction and installed-extension seam. Federation is
 * constructed but never connected; listeners, frontend-only tools and CLI runs are outside this seam. */
export async function buildDaemonToolSurface(routeDeps: NewsletterRouteDeps): Promise<ToolRegistry> {
  const first = daemonVariableStatement(daemonSource.statements, "contributions");
  const registrationLoop = daemonSource.statements.find((statement) => ts.isForOfStatement(statement) && statement.expression.getText(daemonSource) === "assistantRegistrations");
  assert.ok(registrationLoop, "daemon must register its assistantRegistrations");
  const registry = await evaluateDaemonStatements<ToolRegistry>(daemonSource.statements.slice(daemonSource.statements.indexOf(first), daemonSource.statements.indexOf(registrationLoop) + 1), {
    routeDeps, createContributionRegistry, createToolRegistry, installFirstPartyToolContributors,
    loadDeployOpsRegistry: async () => undefined,
    createPluginInstallAttachmentReader, messageAttachmentRefsByRunId: new Map<string, readonly string[]>(),
    buildAssistantToolRegistrations, listToolCatalogEntries, createNativeApprovalMemory,
    liveRunTracker: createLiveRunTracker({}, {}),
    magicLinkPerEmailLimiter: { check: async () => ({ allowed: true }) },
    surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }),
  }, "registry");
  const statements = daemonFunction("start").body!.statements;
  const extensions = daemonVariableStatement(statements, "extensions");
  const waitInstalled = statements.find((statement) => ts.isExpressionStatement(statement) && ts.isAwaitExpression(statement.expression) && statement.expression.expression.getText(daemonSource) === "extensions.installed");
  assert.ok(waitInstalled, "daemon must await installed extensions");
  await evaluateDaemonStatements(statements.slice(statements.indexOf(extensions), statements.indexOf(waitInstalled) + 1), {
    registry, routeDeps, registerInstalledExtensionTools, attachAssistantToolExtensions,
    federationDeps: buildExternalMcpFederationDeps({ authorize: routeDeps.authorize, workspaceId: routeDeps.workspaceId, repo: routeDeps.externalMcpServerRepo }),
    source: { resolve: async () => [] }, toolExtensions: undefined,
  });
  return registry;
}
