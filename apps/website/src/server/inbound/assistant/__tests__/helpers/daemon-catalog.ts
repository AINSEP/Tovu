import assert from "node:assert/strict";
import ts from "typescript";
import type { Principal, ToolRegistry } from "@jini-ai/core";
import { createToolCatalogFor, discoveryPrincipalResolver } from "#src/assistant/tool-catalog-principal-scope";
import { toolCatalogRoutes } from "@jini-ai/daemon/http";
import type { ServerRoute } from "@jini-ai/core/contracts/server";
import { daemonRouteHost } from "../../../../../platform/express/jini-routes.js";
import type { ToolAttemptAuditSink } from "@jini-ai/core/contracts/site/daemon-tool-audit";
import { createDaemonSiteTools } from "../../agent-daemon-site-tools.js";
import { statementsFor, evaluateDaemonStatements } from "./daemon-source.js";
import { createLocalSameOriginPolicy } from "@jini-ai/core/contracts/server";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";

type CatalogBody = { hits: { id: string }[]; id: string; description: string };

/** Mount the real daemon discovery statement over descriptor transport. A server admission is
 * observed at the next run's catalog refresh, while the mounted query object stays the same.
 * HTTP and federation startup are separate integration seams. Every request uses native run scope.
 * `principals` maps a bearer token to the live run principal it names (default: one full member);
 * a request sends `DEFAULT_TOKEN` unless it passes `token` (`null` sends no bearer at all).
 */
export const DEFAULT_TOKEN = "catalog-token";
export async function mountDaemonCatalog(registry: ToolRegistry, auditSink: ToolAttemptAuditSink, { principals = new Map<string, Principal>([[DEFAULT_TOKEN, { id: "catalog-member" }]]) }: { principals?: ReadonlyMap<string, Principal> } = {}) {
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
  const principalByRunId = new Map([...principals].map(([token, principal]) => [`run:${token}`, principal] as const));
  const runCredentials = { resolveCaller: ({ token }: { token: string }) => { const principal = principals.get(token); return principal ? { runId: `run:${token}`, principalId: principal.id } : undefined; } };
  const context = { originPolicy: createLocalSameOriginPolicy({ port: () => 7456, env: {}, config: { allowedOriginsEnvVar: "TOVU_ALLOWED_ORIGINS", webPortEnvVar: "TOVU_WEB_PORT", bindHostEnvVar: "TOVU_BIND_HOST" } }) };
  await evaluateDaemonStatements([mount], {
    siteTools: host, toolCatalogRoutes, createToolCatalogFor, discoveryPrincipalResolver, runCredentials, principalByRunId, app: {}, routeHost: daemonRouteHost({ context, parserLimitBytes: 1024 * 1024, errors: createRouteIncidentReporter().errors }),
    mountJiniRoutes: ({ routes }: { routes: readonly ServerRoute[] }) => { for (const route of routes) { assert.equal(handlers.has(route.path), false); handlers.set(route.path, route.handler); } },
  });
  return {
    onAdmitted(_result: unknown) { refresh = true; },
    dispose: () => host.finish({ runId }),
    async request(path: string, query: Record<string, string> = {}, params: Record<string, string> = {}, { token = DEFAULT_TOKEN }: { token?: string | null } = {}) {
      if (refresh) { await host.start({ runId, principalId: "catalog-member" }); refresh = false; }
      const handler = handlers.get(path);
      assert.ok(handler, `route ${path} must be mounted`);
      const url = new URL(path.replace(/:(\w+)/g, (_match, name: string) => encodeURIComponent(params[name] ?? "")), "http://localhost:7456");
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
      const response = await host.withRun({ runId, fn: () => handler({ request: new Request(url, { headers: { host: "localhost:7456", ...(token ? { authorization: `Bearer ${token}` } : {}) } }), params, locals: {} }) });
      return { status: response.status, body: await response.json() as CatalogBody };
    },
  };
}
