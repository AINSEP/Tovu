import assert from "node:assert/strict";
import test from "node:test";
import { createToolRegistry, type Principal, type RunRef } from "@jini-ai/core";
import { toolCatalogRoutes } from "@jini-ai/daemon/http";
import { createLocalSameOriginPolicy, type ServerRoute } from "@jini-ai/core/contracts/server";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createInMemoryToolAttemptAuditSink } from "@jini-ai/diagnostics/tool-audit/repo.memory";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";
import { daemonRouteHost } from "../../platform/express/jini-routes.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";
import { constrainPrincipalToReadOnlyTools, withReadOnlyToolConstraint } from "../read-only-tool-constraint.js";
import { createAssistantToolExecutor } from "../tool-recovery-preset.js";
import { createToolCatalogFor, discoveryPrincipalResolver } from "../tool-catalog-principal-scope.js";
import { testToolReporter } from "#src/assistant/__tests__/helpers/tool-reporter";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";

/**
 * @file Two-sided conformance (todos: the Strapi-suite test): a read-only principal cannot SEE a
 * write tool and cannot INVOKE it either. One registry feeds both seams, so the two halves cannot
 * drift apart: the real catalog search/describe routes (`catalogFor` scoped per request) and the
 * real Tovu tool executor stack (the read-only gate sits innermost, under every decorator). Hiding
 * a tool from discovery is not a permission; the second half is the one that protects the data.
 */
const FULL: Principal = { id: "p-full" };
const READ_ONLY = constrainPrincipalToReadOnlyTools({ id: "p-reader" });
const RUN: RunRef = { id: "run-conformance" } as RunRef;

function build() {
  const writes: unknown[] = [];
  const registry = createToolRegistry({});
  registry.register({
    descriptor: { id: "notes_list", description: "List saved notes", readOnly: true, inputSchema: { type: "object", properties: {} } },
    policy: { authorize: () => "allow" },
    handler: async () => ({ notes: [] }),
  });
  registry.register({
    descriptor: { id: "notes_wipe", description: "Delete every saved note", inputSchema: { type: "object", properties: {} } },
    policy: { authorize: () => "allow" },
    handler: async (ctx) => { writes.push(ctx.input); return { wiped: true }; },
  });
  const catalog = buildToolCatalogQuery(registry);
  const principalByRunId = new Map<string, Principal>([["run-full", FULL], ["run-reader", READ_ONLY]]);
  const runCredentials = { resolveCaller: ({ token }: { token: string }) => {
    const runId = token === "tok-full" ? "run-full" : token === "tok-reader" ? "run-reader" : undefined;
    return runId ? { runId, principalId: principalByRunId.get(runId)!.id } : undefined;
  } };
  const catalogFor = createToolCatalogFor({ catalog, registry, resolvePrincipal: discoveryPrincipalResolver({ runCredentials, principalByRunId }) });
  const context = { originPolicy: createLocalSameOriginPolicy({ port: () => 7456, env: {}, config: { allowedOriginsEnvVar: "TOVU_ALLOWED_ORIGINS", webPortEnvVar: "TOVU_WEB_PORT", bindHostEnvVar: "TOVU_BIND_HOST" } }) };
  const routes: readonly ServerRoute[] = toolCatalogRoutes({ deps: { catalog, catalogFor }, host: daemonRouteHost({ context, parserLimitBytes: 1024 * 1024, errors: createRouteIncidentReporter().errors }) });
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  // The production composition (agent-daemon-scope-tools.ts): the read-only gate wraps the assistant
  // stack outermost, so it holds for every tool id no matter which decorator dispatches it.
  const assistantExecutor = createAssistantToolExecutor({ reporter: testToolReporter(), registry, surfaceExchanges, toolAttemptAudit: { sink: createInMemoryToolAttemptAuditSink(), workspaceId: "ws-conformance" } }, {});
  const executor = withReadOnlyToolConstraint({ inner: assistantExecutor, deps: { registry } });
  const discover = async (token: string, path: string, params: Record<string, string> = {}) => {
    const route = routes.find(candidate => candidate.path === path);
    assert.ok(route, `route ${path} mounted`);
    const url = new URL(path.replace(/:(\w+)/g, (_m, name: string) => params[name] ?? ""), "http://localhost:7456");
    if (!params.id) url.searchParams.set("q", "notes");
    const response = await route.handler({ request: new Request(url, { headers: { host: "localhost:7456", authorization: `Bearer ${token}` } }), params, locals: {} });
    return { status: response.status, body: await response.json() as { hits?: { id: string }[] } };
  };
  return { writes, discover, executor };
}

test("a read-only principal cannot see write tools and cannot invoke them (the full principal can do both)", async () => {
  const { writes, discover, executor } = build();

  // Premise: the tool genuinely exists and the full principal can see and run it, so a pass below
  // is the read-only gate working and not an empty catalog or a broken handler.
  const fullSearch = await discover("tok-full", "/api/tools/search");
  assert.deepEqual(fullSearch.body.hits?.map(hit => hit.id).sort(), ["notes_list", "notes_wipe"]);
  assert.equal((await discover("tok-full", "/api/tools/:id", { id: "notes_wipe" })).status, 200);

  // Half one: discovery. The write tool is absent from search and 404s on describe.
  const readerSearch = await discover("tok-reader", "/api/tools/search");
  assert.equal(readerSearch.status, 200);
  assert.deepEqual(readerSearch.body.hits?.map(hit => hit.id), ["notes_list"]);
  assert.equal((await discover("tok-reader", "/api/tools/:id", { id: "notes_wipe" })).status, 404);

  // Half two: execution. Naming the hidden tool anyway is refused at the executor, and the
  // handler never ran. A principal that guesses the id gets nothing from knowing it.
  const refused = await executor.execute({ principal: READ_ONLY, run: RUN, toolId: "notes_wipe", input: {} });
  assert.notEqual(refused.status, "completed", "a read-only principal must not complete a write tool");
  assert.match(String(refused.error), /read-only/);
  assert.deepEqual(writes, [], "the write handler must not have run for the read-only principal");
  assert.equal((await executor.execute({ principal: READ_ONLY, run: RUN, toolId: "notes_list", input: {} })).status, "completed");

  const allowed = await executor.execute({ principal: FULL, run: RUN, toolId: "notes_wipe", input: {} });
  assert.equal(allowed.status, "completed");
  assert.equal(writes.length, 1, "the full principal's write really ran, so the refusal above was the gate");
});
