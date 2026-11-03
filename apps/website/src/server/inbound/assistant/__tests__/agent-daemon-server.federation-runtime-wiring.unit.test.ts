import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { createAssistantByokModule } from "#src/server/runtime/composition/modules/assistant-byok";
import { captureDaemonRun, daemonSource } from "./helpers/daemon-source.js";

/** ADR-070 moves federation assembly, admissions and refusal diagnosis to the server owner.
 * The daemon retains prompt delivery and discovery over the site's principal-scoped descriptors.
 */
test("the daemon has no independent federation, installed-extension or consent controller", () => {
  const code = daemonSource.statements.map(statement => statement.getText(daemonSource)).join("\n");
  for (const owner of ["createExternalMcpOAuthService", "attachAssistantToolExtensions", "createAutomaticPluginRuns", "registerInstalledExtensionTools", "registerFederationReloadRoute"]) {
    assert.equal(code.includes(owner), false, owner);
  }
});

test("onStarted reads the site's federation refusal prefix afresh for each run", async () => {
  let prefix = "boot refusal";
  const siteTools = { start: async () => {}, preflight: async () => ({ prefix: "", refusalPrefix: prefix }), withRun: ({ fn }: { fn: () => unknown }) => fn(), finish() {} };
  const first = await captureDaemonRun({ prompt: "Inspect tools" }, { bindings: { siteTools } });
  assert.equal(first.prompt, "boot refusal\n\n<<SUBAGENT_DISPATCH>>\n\nInspect tools");
  prefix = "reload refusal";
  const second = await captureDaemonRun({ prompt: "Inspect tools" }, { bindings: { siteTools } });
  assert.equal(second.prompt, "reload refusal\n\n<<SUBAGENT_DISPATCH>>\n\nInspect tools");
});

test("the server executor diagnoses a refusal introduced after construction", async () => {
  const deps = createRouteDeps();
  const { toolSurface } = createAssistantByokModule(deps);
  await toolSurface.ready;
  assert.ok(toolSurface.federation);
  let reports: import("@jini-ai/mcp/federation").FederationAdmissionSnapshotEntry[] = [];
  Object.assign(toolSurface.federation, { reports: () => reports });
  const request = { principal: { id: "principal" }, run: { id: "run" }, toolId: "mcp__probe__lookup", input: {} };
  await assert.rejects(toolSurface.executor.execute(request), /unknown tool/);
  reports = [{ connectionId: "probe", report: { admitted: [], refused: [{ remoteName: "lookup", reason: "not-in-operator-allowlist" }], allowlistedButAbsent: [], writeAllowedButNotAllowlisted: [] } }];
  const result = await toolSurface.executor.execute(request);
  assert.equal(result.status, "failed");
  assert.equal(result.errorKind, "validation");
  assert.equal(result.error, 'tool "lookup" on external server "probe" was refused: the administrator has not allowed this tool for this connection. Fix: in Settings → External MCP, add it to "Allowed tools", then restart the assistant.');
});

test("a real federation reload makes native and newly admitted tools searchable and describable through existing daemon routes", async t => {
  const { createToolRegistry } = await import("@jini-ai/core");
  const { FEDERATED_CONNECTION_DEFAULTS } = await import("@jini-ai/mcp/federation");
  const { createFederationRuntime } = await import("#src/assistant/external-mcp-federation-runtime");
  const { InMemoryMcpSession } = await import("#src/assistant/mcp-federation/adapter.memory");
  const { createInMemoryToolAttemptAuditSink } = await import("#src/features/tool-audit/repo.memory");
  const { mountDaemonCatalog } = await import("./helpers/daemon-catalog.js");
  const registry = createToolRegistry({});
  registry.register({ descriptor: { id: "native_probe", description: "orbitarium lookup" }, handler: async () => "ok", policy: { authorize: () => "allow" } });
  const sink = createInMemoryToolAttemptAuditSink();
  const mounted = await mountDaemonCatalog(registry, sink);
  t.after(mounted.dispose);
  const roster: import("@jini-ai/mcp/federation").ResolvedFederatedConnection[] = [];
  const runtime = createFederationRuntime({
    registry, deps: { authorize: async () => ({ allowed: true, reason: "fixture" }), workspaceId: "ws-daemon-catalog" },
    resolveConnections: async () => [...roster], onAdmitted: mounted.onAdmitted, log: "[reload-test]",
    connect: async (connection) => {
      assert.equal(connection.config.connectionId, "probe");
      return new InMemoryMcpSession({ tools: [{ name: "lookup", description: "orbitarium lookup", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }] });
    },
  });
  await runtime.start();
  assert.equal((await mounted.request("/api/tools/:id", {}, { id: "mcp__probe__lookup" })).status, 404);
  roster.push({ config: { connectionId: "probe", label: "Probe", allowedToolNames: ["lookup"], writeAllowedToolNames: [], ...FEDERATED_CONNECTION_DEFAULTS }, launch: { url: "https://example.invalid/probe", headers: {} } });
  const result = await runtime.reload();
  assert.deepEqual(result.newlyAdmittedConnectionIds, ["probe"]);
  const search = await mounted.request("/api/tools/search", { q: "orbitarium" });
  assert.equal(search.status, 200);
  assert.deepEqual(search.body.hits.map((hit: { id: string }) => hit.id).sort(), ["mcp__probe__lookup", "native_probe"]);
  for (const id of ["native_probe", "mcp__probe__lookup"]) {
    const described = await mounted.request("/api/tools/:id", {}, { id });
    assert.equal(described.status, 200);
    assert.equal(described.body.id, id);
  }
  const searchRow = sink.events.findLast((event) => event.toolId === "search_tools");
  assert.ok(searchRow, "reload must retain the audit wrapper");
  assert.deepEqual(JSON.parse(String(searchRow.detail)).resultIds.slice().sort(), ["mcp__probe__lookup", "native_probe"]);
});
