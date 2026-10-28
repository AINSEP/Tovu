import { createPluginInstallAttachmentReader } from "#src/server/runtime/composition/plugin-install-attachment-reader";
import assert from "node:assert/strict";
import ts from "typescript";
import { createContributionRegistry, createToolRegistry, type ToolRegistry } from "@jini-ai/core";
import { buildAssistantToolRegistrations } from "#src/assistant/tool-registrations";
import { listToolCatalogEntries } from "#src/assistant/tool-catalog-query";
import { attachAssistantToolExtensions } from "#src/assistant/installed-extension-tools";
import { createSurfaceExchangeStore, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { installFirstPartyToolContributors } from "#src/server/runtime/composition/tool-catalog-manifest";
import { registerInstalledExtensionTools } from "#src/server/runtime/composition/installed-extension-tools";
import { buildExternalMcpFederationDeps } from "#src/assistant/external-mcp-connection-source";
import type { NewsletterRouteDeps } from "#src/server/inbound/admin-http/routes/newsletter/deps";
import { daemonFunction, daemonSource, daemonVariableStatement, evaluateDaemonStatements } from "./daemon-source.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createNativeApprovalMemory } from "#src/contracts/core/native-approval-memory";
import { createLiveRunTracker } from "#src/assistant/agent-session-preset";
import { readChatPermanentDeletesPolicy } from "#src/assistant/permanent-delete-settings";
import { createChatDeleteScope, ALL_CHAT_DELETE_TOOLS } from "#src/assistant/permanent-delete-tool-gate";
import { isChatToolAllowed } from "#src/contracts/headless/assistant-permanent-deletes-policy";
import { createAutomaticPluginRuns } from "#src/features/agent-plugins/automatic-agent-plugins";


/** Execute the real daemon's base construction and installed-extension seam. Federation is
 * constructed but never connected; listeners, frontend-only tools and CLI runs are outside this seam.
 * Lists through the daemon's own `visibleRegistry` (aec57932c), the model-visible view that hides
 * permanent deletes outside a granted `deleteScope.fresh()`, matching BYOK's exposed registry. */
export async function buildDaemonToolSurface(routeDeps: NewsletterRouteDeps): Promise<ToolRegistry> {
  // The daemon declares ONE module-level confirmation-card store that the registration loop, the run-scoped
  // guidance loader and `start()`'s installed-extension registrar all close over; the evaluated slices below
  // reach it only through these bindings, so each slice gets this same store (never a copy per slice).
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const first = daemonVariableStatement(daemonSource.statements, "contributions");
  const registrationLoop = daemonSource.statements.find((statement) => ts.isForOfStatement(statement) && statement.expression.getText(daemonSource) === "assistantRegistrations");
  assert.ok(registrationLoop, "daemon must register its assistantRegistrations");
  const { registry, visibleRegistry } = await evaluateDaemonStatements<{ registry: ToolRegistry; visibleRegistry: Pick<ToolRegistry, "list"> }>(daemonSource.statements.slice(daemonSource.statements.indexOf(first), daemonSource.statements.indexOf(registrationLoop) + 1), {
    routeDeps, createContributionRegistry, createToolRegistry, installFirstPartyToolContributors,
    loadDeployOpsRegistry: async () => undefined,
    createPluginInstallAttachmentReader, messageAttachmentRefsByRunId: new Map<string, readonly string[]>(),
    buildAssistantToolRegistrations, listToolCatalogEntries, createNativeApprovalMemory,
    liveRunTracker: createLiveRunTracker({}, {}),
    createChatDeleteScope, readChatPermanentDeletesPolicy, isChatToolAllowed, ALL_CHAT_DELETE_TOOLS,
    magicLinkPerEmailLimiter: { check: async () => ({ allowed: true }) },
    surfaceExchanges,
  }, "({ registry, visibleRegistry })");
  // Include the run-scoped guidance loader's real construction and registration too.
  const automaticPlugins = daemonVariableStatement(daemonSource.statements, "automaticPluginRuns");
  const automaticIndex = daemonSource.statements.indexOf(automaticPlugins);
  await evaluateDaemonStatements(daemonSource.statements.slice(automaticIndex, automaticIndex + 2), {
    registry, routeDeps, createAutomaticPluginRuns,
    surfaceExchanges,
  });
  const statements = daemonFunction("start").body!.statements;
  const extensions = daemonVariableStatement(statements, "extensions");
  const waitInstalled = statements.find((statement) => ts.isExpressionStatement(statement) && ts.isAwaitExpression(statement.expression) && statement.expression.expression.getText(daemonSource) === "extensions.installed");
  assert.ok(waitInstalled, "daemon must await installed extensions");
  let registrarSurfaces: AssistantSurfaceDeps | undefined;
  await evaluateDaemonStatements(statements.slice(statements.indexOf(extensions), statements.indexOf(waitInstalled) + 1), {
    registry, routeDeps, registerInstalledExtensionTools, surfaceExchanges,
    attachAssistantToolExtensions: (...args: Parameters<typeof attachAssistantToolExtensions>) => {
      registrarSurfaces = args[1].surfaces;
      return attachAssistantToolExtensions(...args);
    },
    federationDeps: buildExternalMcpFederationDeps({ authorize: routeDeps.authorize, workspaceId: routeDeps.workspaceId, repo: routeDeps.externalMcpServerRepo }),
    source: { resolve: async () => [] }, toolExtensions: undefined,
  });
  // An unused binding is silent in `new Function`, so prove the daemon's wiring really hands this store over.
  assert.equal(registrarSurfaces?.surfaceExchanges, surfaceExchanges, "daemon must pass its confirmation-card store to the extension registrar");
  return { ...registry, list: visibleRegistry.list };
}
