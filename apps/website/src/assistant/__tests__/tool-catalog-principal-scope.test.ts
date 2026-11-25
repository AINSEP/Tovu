import assert from "node:assert/strict";
import test from "node:test";
import { createToolRegistry, type Principal } from "@jini-ai/core";
import { toolCatalogRoutes, type ToolCatalogQuery, type ToolCatalogSearchHit } from "@jini-ai/daemon/http";
import { createLocalSameOriginPolicy, type ServerRoute } from "@jini-ai/core/contracts/server";
import { daemonRouteHost } from "../../platform/express/jini-routes.js";
import { constrainPrincipalToReadOnlyTools } from "../read-only-tool-constraint.js";
import { createToolCatalogFor, discoveryPrincipalResolver } from "../tool-catalog-principal-scope.js";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";

/**
 * @file Per-principal discovery: a read-only principal's `/api/tools/search` and `/api/tools/:id`
 * never show or describe a write tool, a full principal sees both, in either request order.
 */
const HITS: readonly ToolCatalogSearchHit[] = ["site_read", "site_write"].map(id => ({ id, description: id, source: "test", score: 1 }));
const FULL: Principal = { id: "p-full" };
const READ_ONLY = constrainPrincipalToReadOnlyTools({ id: "p-reader" });
const TOKENS = new Map([["tok-full", "run-full"], ["tok-reader", "run-reader"]]);

function mount() {
  const registry = createToolRegistry({});
  for (const [id, readOnly] of [["site_read", true], ["site_write", false]] as const) {
    registry.register({ descriptor: { id, readOnly, inputSchema: { type: "object" } }, policy: { authorize: () => "allow" }, handler: async () => ({ ok: true }) });
  }
  const catalog: ToolCatalogQuery = {
    search: (_input, { limit = 10 } = {}) => HITS.slice(0, limit),
    describe: ({ id }) => HITS.find(hit => hit.id === id) ?? null,
  };
  const principalByRunId = new Map<string, Principal>([["run-full", FULL], ["run-reader", READ_ONLY]]);
  const runCredentials = { resolveCaller: ({ token }: { token: string }) => { const runId = TOKENS.get(token); return runId ? { runId, principalId: principalByRunId.get(runId)!.id } : undefined; } };
  const catalogFor = createToolCatalogFor({ catalog, registry, resolvePrincipal: discoveryPrincipalResolver({ runCredentials, principalByRunId }) });
  const context = { originPolicy: createLocalSameOriginPolicy({ port: () => 7456, env: {}, config: { allowedOriginsEnvVar: "TOVU_ALLOWED_ORIGINS", webPortEnvVar: "TOVU_WEB_PORT", bindHostEnvVar: "TOVU_BIND_HOST" } }) };
  const routes: readonly ServerRoute[] = toolCatalogRoutes({ deps: { catalog, catalogFor }, host: daemonRouteHost({ context, parserLimitBytes: 1024 * 1024, errors: createRouteIncidentReporter().errors }) });
  return async (token: string | undefined, path: string, params: Record<string, string> = {}) => {
    const route = routes.find(candidate => candidate.path === path);
    assert.ok(route, `route ${path} mounted`);
    const url = new URL(path.replace(/:(\w+)/g, (_m, name: string) => params[name] ?? ""), "http://localhost:7456");
    if (!params.id) url.searchParams.set("q", "probe");
    const headers: Record<string, string> = { host: "localhost:7456" };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await route.handler({ request: new Request(url, { headers }), params, locals: {} });
    return { status: response.status, body: await response.json() as { hits?: { id: string }[] } };
  };
}

test("search serves each principal its own tools, whichever asked first (no cross-principal leak)", async () => {
  for (const order of [["tok-full", "tok-reader", "tok-full", "tok-reader"], ["tok-reader", "tok-full", "tok-reader", "tok-full"]]) {
    const call = mount();
    for (const token of order) {
      const { status, body } = await call(token, "/api/tools/search");
      assert.equal(status, 200);
      assert.deepEqual(body.hits?.map(hit => hit.id), token === "tok-full" ? ["site_read", "site_write"] : ["site_read"], token);
    }
  }
});

test("describe of a write tool is 404 for a read-only principal, 200 for a full one, in both orders", async () => {
  for (const order of [["tok-full", "tok-reader"], ["tok-reader", "tok-full"]]) {
    const call = mount();
    for (const token of order) {
      const write = await call(token, "/api/tools/:id", { id: "site_write" });
      assert.equal(write.status, token === "tok-full" ? 200 : 404, `${token} describe write`);
      assert.equal((await call(token, "/api/tools/:id", { id: "site_read" })).status, 200, `${token} describe read`);
    }
  }
});

test("an unknown or missing bearer fails closed and never serves the unfiltered catalog", async () => {
  const call = mount();
  for (const token of [undefined, "tok-stranger"]) {
    const { status, body } = await call(token, "/api/tools/search");
    assert.equal(status, 500);
    assert.ok(!JSON.stringify(body).includes("site_write"));
  }
});
