import assert from "node:assert/strict";
import ts from "typescript";
import type { ToolRegistry } from "@jini-ai/core";
import { registerToolCatalogRoutes } from "@jini-ai/daemon/http";
import { buildToolCatalogQuery } from "#src/assistant/tool-catalog-query";
import { createLiveToolCatalogQuery, type LiveToolCatalogQuery } from "#src/assistant/tool-catalog-live-query";
import { withToolCatalogAudit, UNSCOPED_TOOL_CATALOG_ROUTE_RUN_ID, UNSCOPED_TOOL_CATALOG_ROUTE_PRINCIPAL_ID } from "#src/assistant/tool-catalog-audit";
import type { ToolAttemptAuditSink } from "#src/features/tool-audit/types";
import type { FederationReloadResult } from "@jini-ai/mcp/federation";
import { attachAssistantToolExtensions } from "#src/assistant/installed-extension-tools";
import { daemonFunction, daemonSource, daemonVariableStatement, evaluateDaemonExpression, evaluateDaemonStatements } from "./daemon-source.js";

/** Execute the daemon's catalog construction and mount, without executing start()'s listeners. */
export async function mountDaemonCatalog(registry: ToolRegistry, auditSink: ToolAttemptAuditSink) {
  const statements = daemonFunction("start").body!.statements;
  const initial = daemonVariableStatement(statements, "liveToolCatalog");
  const mount = statements.find((statement) => ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) && statement.expression.expression.getText(daemonSource) === "registerToolCatalogRoutes");
  assert.ok(mount, "start() must mount the tool catalog directly");
  const handlers = new Map<string, (request: unknown, response: unknown) => Promise<void>>();
  const live = await evaluateDaemonStatements<LiveToolCatalogQuery>(statements.slice(statements.indexOf(initial), statements.indexOf(mount) + 1), {
    registry, auditSink, buildToolCatalogQuery, createLiveToolCatalogQuery, withToolCatalogAudit,
    UNSCOPED_TOOL_CATALOG_ROUTE_RUN_ID, UNSCOPED_TOOL_CATALOG_ROUTE_PRINCIPAL_ID,
    routeDeps: { workspaceId: "ws-daemon-catalog" }, refreshSkillsCatalog: () => {},
    app: { get: (path: string, handler: typeof handlers extends Map<string, infer H> ? H : never) => {
      assert.equal(handlers.has(path), false, `duplicate route ${path}`);
      handlers.set(path, handler);
    } },
    adapter: { allowedOriginsEnvVar: "TOVU_ALLOWED_ORIGINS", webPortEnvVar: "TOVU_WEB_PORT", bindHostEnvVar: "TOVU_BIND_HOST", resolvedPortRef: { current: 7456 }, env: {} },
    registerToolCatalogRoutes,
  }, "liveToolCatalog");

  // Execute the actual attach initializer and capture the exact callback passed to its real
  // federation dependency. Only the unrelated installed-extension I/O is replaced.
  const extensions = daemonVariableStatement(statements, "extensions").declarationList.declarations[0].initializer!;
  let onAdmitted: ((result: FederationReloadResult) => void) | undefined;
  evaluateDaemonExpression(extensions, {
    attachAssistantToolExtensions: (...args: Parameters<typeof attachAssistantToolExtensions>) => {
      onAdmitted = args[1].federation.onAdmitted;
      return attachAssistantToolExtensions(...args);
    },
    registerInstalledExtensionTools: async () => {},
    federationDeps: { authorize: async () => ({ allowed: true, reason: "fixture" }), workspaceId: "ws-daemon-catalog" },
    source: { resolve: async () => [] },
    liveToolCatalog: live, registry, auditSink, buildToolCatalogQuery, withToolCatalogAudit,
    UNSCOPED_TOOL_CATALOG_ROUTE_RUN_ID, UNSCOPED_TOOL_CATALOG_ROUTE_PRINCIPAL_ID,
    routeDeps: { workspaceId: "ws-daemon-catalog" }, console: { log() {} },
  });
  assert.ok(onAdmitted, "daemon must pass onAdmitted to the real federation constructor");
  return {
    onAdmitted,
    async request(path: string, query: Record<string, string> = {}, params: Record<string, string> = {}) {
      const handler = handlers.get(path);
      assert.ok(handler, `route ${path} must be mounted`);
      let status: number | undefined;
      let body: any;
      const response = { status(value: number) { status = value; return this; }, json(value: unknown) { body = value; return this; } };
      await handler({ method: "GET", headers: { host: "localhost:7456" }, get: (name: string) => name.toLowerCase() === "host" ? "localhost:7456" : undefined, body: {}, query, params }, response);
      return { status, body };
    },
  };
}
