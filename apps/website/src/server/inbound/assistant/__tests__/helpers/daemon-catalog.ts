import assert from "node:assert/strict";
import ts from "typescript";
import type { ToolRegistry } from "@jini-ai/core";
import { registerToolCatalogRoutes } from "@jini-ai/daemon/http";
import type { ToolAttemptAuditSink } from "#src/features/tool-audit/types";
import { createDaemonSiteTools } from "../../agent-daemon-site-tools.js";
import { daemonStatements, daemonSource, evaluateDaemonStatements } from "./daemon-source.js";

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
  const statements = daemonStatements;
  const mount = statements.find(statement => ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) && statement.expression.expression.getText(daemonSource) === "registerToolCatalogRoutes");
  assert.ok(mount, "createSiteScope() must mount the remote catalog directly");
  const handlers = new Map<string, (request: unknown, response: unknown) => Promise<void>>();
  await evaluateDaemonStatements([mount], {
    siteTools: host, registerToolCatalogRoutes,
    app: { get: (path: string, handler: (request: unknown, response: unknown) => Promise<void>) => { assert.equal(handlers.has(path), false); handlers.set(path, handler); } },
    adapter: { allowedOriginsEnvVar: "TOVU_ALLOWED_ORIGINS", webPortEnvVar: "TOVU_WEB_PORT", bindHostEnvVar: "TOVU_BIND_HOST", resolvedPortRef: { current: 7456 }, env: {} },
  });
  return {
    onAdmitted(_result: unknown) { refresh = true; },
    dispose: () => host.finish({ runId }),
    async request(path: string, query: Record<string, string> = {}, params: Record<string, string> = {}) {
      if (refresh) { await host.start({ runId, principalId: "catalog-member" }); refresh = false; }
      const handler = handlers.get(path);
      assert.ok(handler, `route ${path} must be mounted`);
      let status: number | undefined;
      let body: unknown;
      const response = { status(value: number) { status = value; return this; }, json(value: unknown) { body = value; return this; } };
      await host.withRun({ runId, fn: () => handler({ method: "GET", headers: { host: "localhost:7456" }, get: (name: string) => name.toLowerCase() === "host" ? "localhost:7456" : undefined, body: {}, query, params }, response) });
      return { status, body: body as CatalogBody };
    },
  };
}
