import assert from "node:assert/strict";
import ts from "typescript";
import type { ToolRegistry } from "@jini-ai/core";
import { toolCatalogRoutes } from "@jini-ai/daemon/http";
import type { ServerRoute } from "@jini-ai/core/contracts/server";
import { daemonRouteHost } from "../../../../runtime/composition/jini-routes.js";
import type { ToolAttemptAuditSink } from "@jini-ai/daemon/tool-audit";
import { createDaemonSiteTools } from "../../agent-daemon-site-tools.js";
import { statementsFor, evaluateDaemonStatements } from "./daemon-source.js";
import { createLocalSameOriginPolicy } from "@jini-ai/core/contracts/server";

type CatalogBody = { hits: { id: string }[]; id: string; description: string };

/** Mount the real daemon discovery statement over descriptor transport. A server admission is
 * observed at the next run's catalog refresh, while the mounted query object stays the same.
 * HTTP and federation startup are separate integration seams. Every request uses native run scope.
 */
export async function mountDaemonCatalog(registry: ToolRegistry, auditSink: ToolAttemptAuditSink) {
  const runId = "catalog-run";
  const host = createDaemonSiteTools({ baseUrl: "https://fixture.invalid", token: "fixture", localRegistry: { list: () => [] },
    contextFor: () => ({}), audit: { sink: auditSink, workspaceId: "ws-daemon-catalog" } }, {
    fetch: async () => Response.json({ tools: registry.list({}) }),
  });
  await host.start({ runId, principalId: "catalog-member" });
  let refresh = false;
  const statements = statementsFor("agent-daemon-scope-http.ts", "mountDiscoveryRoutes");
  const mount = statements.find(statement => ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) && statement.expression.expression.getText(statement.getSourceFile()) === "mountJiniRoutes" && statement.expression.getText(statement.getSourceFile()).includes("toolCatalogRoutes("));
  assert.ok(mount, "createSiteScope() must mount the remote catalog directly");
  const handlers = new Map<string, ServerRoute["handler"]>();
  const context = { originPolicy: createLocalSameOriginPolicy({ port: () => 7456, env: {}, config: { allowedOriginsEnvVar: "TOVU_ALLOWED_ORIGINS", webPortEnvVar: "TOVU_WEB_PORT", bindHostEnvVar: "TOVU_BIND_HOST" } }) };
  await evaluateDaemonStatements([mount], {
    siteTools: host, toolCatalogRoutes, app: {}, routeHost: daemonRouteHost({ context, parserLimitBytes: 1024 * 1024 }),
    mountJiniRoutes: ({ routes }: { routes: readonly ServerRoute[] }) => { for (const route of routes) { assert.equal(handlers.has(route.path), false); handlers.set(route.path, route.handler); } },
  });
  return {
    onAdmitted(_result: unknown) { refresh = true; },
    dispose: () => host.finish({ runId }),
    async request(path: string, query: Record<string, string> = {}, params: Record<string, string> = {}) {
      if (refresh) { await host.start({ runId, principalId: "catalog-member" }); refresh = false; }
      const handler = handlers.get(path);
      assert.ok(handler, `route ${path} must be mounted`);
      const url = new URL(path.replace(/:(\w+)/g, (_match, name: string) => encodeURIComponent(params[name] ?? "")), "http://localhost:7456");
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
      const response = await host.withRun({ runId, fn: () => handler({ request: new Request(url, { headers: { host: "localhost:7456" } }), params, locals: {} }) });
      return { status: response.status, body: await response.json() as CatalogBody };
    },
  };
}
