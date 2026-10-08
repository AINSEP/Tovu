import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


/**
 * @file Wiring proof for S3 of `ADS-memory/.local-artifacts/design-byok-external-mcp-2026-09-24.md`
 * (the daemon adopts the shared federation runtime). Reads the SOURCE of `agent-daemon-server.ts`
 * rather than importing it, same reason as `agent-daemon-server.tool-restriction-wiring.unit.test.ts`
 * next to this file (importing it opens a real SQLite connection and binds a real port).
 *
 * Each assertion guards one fact the runtime's own unit tests cannot see: that the daemon actually
 * reads the runtime for the prompt prefix and the refusal diagnosis, awaits the installed-extension
 * registration before the federation boot pass, and cannot reach `onAdmitted`'s `liveToolCatalog`
 * before that `const` exists (a reload route mounted above it would be a TDZ ReferenceError on the
 * first reload that admits something).
 */

const SOURCE = readFileSync(path.join(import.meta.dirname, "../agent-daemon-server.ts"), "utf8");

function indexOfOrFail(needle: string, from = 0): number {
  const index = SOURCE.indexOf(needle, from);
  assert.ok(index > -1, `anchor must still exist verbatim: ${needle}`);
  return index;
}

describe("agent-daemon-server.ts — federation runtime wiring (S3)", () => {
  test("every run's prompt carries the runtime's live refusal prefix", () => {
    assert.match(
      SOURCE,
      /prompt\s*=\s*assemblePromptWithPluginPrefix\(\s*prompt\s*,\s*toolExtensions\?\.federation\.refusalPrefix\(\)\s*\?\?\s*""\s*\)/,
    );
  });

  test("the refusal-diagnosis decorator reads the runtime's live reports", () => {
    const wrap = indexOfOrFail("const toolExecutor = withFederatedRefusalDiagnosis(");
    const body = SOURCE.slice(wrap, indexOfOrFail("\n);", wrap));
    assert.match(body, /\(\)\s*=>\s*toolExtensions\?\.federation\.reports\(\)\s*\?\?\s*\[\]/);
  });

  test("start() assigns toolExtensions, awaits installed extensions, then the federation boot pass", () => {
    const startFn = indexOfOrFail("async function start(): Promise<void> {");
    const assign = indexOfOrFail("toolExtensions = extensions;", startFn);
    const installed = indexOfOrFail("await extensions.installed;", startFn);
    const boot = indexOfOrFail("await extensions.federation.start();", startFn);
    const catalog = indexOfOrFail("const liveToolCatalog = createLiveToolCatalogQuery(", startFn);
    assert.ok(assign < boot, "toolExtensions must be assigned before the boot pass");
    assert.ok(installed < boot, "installed extensions must register before federation (disclosed order)");
    assert.ok(boot < catalog, "the FTS snapshot must be built after federation admitted its tools");
  });

  test("onAdmitted rebinds the live catalog, and no reload can reach it before liveToolCatalog exists", () => {
    const startFn = indexOfOrFail("async function start(): Promise<void> {");
    const onAdmitted = indexOfOrFail("onAdmitted: (result) => {", startFn);
    const rebind = indexOfOrFail("liveToolCatalog.rebind(", onAdmitted);
    assert.ok(rebind < indexOfOrFail("toolExtensions = extensions;", startFn), "the rebind must live inside onAdmitted");

    const catalog = indexOfOrFail("const liveToolCatalog = createLiveToolCatalogQuery(", startFn);
    const reloadRoute = indexOfOrFail("registerFederationReloadRoute(app, { reload: () => extensions.federation.reload() });", startFn);
    assert.ok(catalog < reloadRoute, "the reload route must be mounted after liveToolCatalog is declared (TDZ)");
  });

  test("extensions.federation.reload() has exactly two callers: the reload route and the agent-daemon-local roster-change listener (S6, 3cdf21c52)", () => {
    // A raw `.federation.reload(` occurrence count is not the right guard: S6 added a code comment
    // (right above the roster-change call) that itself mentions `extensions.federation.reload()` in
    // prose, so a naive count drifts from 1 to 3 without any new caller existing. Pin the exact two
    // call-site strings instead, then confirm no other real call site exists by stripping comment
    // lines before counting — a genuine new caller must still fail this test.
    indexOfOrFail("registerFederationReloadRoute(app, { reload: () => extensions.federation.reload() });");
    indexOfOrFail('onExternalMcpRosterChanged("agent-daemon-local", () => extensions.federation.reload());');

    const codeOnly = SOURCE.split("\n")
      .filter((line) => !/^\s*\/\//.test(line))
      .join("\n");
    const callSites = codeOnly.match(/\.federation\.reload\(\)/g) ?? [];
    assert.equal(
      callSites.length,
      2,
      "an unexpected new caller of extensions.federation.reload() was found; update this test's pinned set only after confirming the new call site is intended",
    );
  });

  test("the admissions route reads the runtime's reports and merges the source's config failures with the runtime's own connect failures", () => {
    assert.match(
      SOURCE,
      /registerFederationAdmissionsRoute\(app,\s*\{\s*reports:\s*\(\)\s*=>\s*extensions\.federation\.reports\(\),[\s\S]*?configFailures:\s*\(\)\s*=>\s*\[\.\.\.source\.failures\(\),\s*\.\.\.extensions\.federation\.connectFailures\(\)\],\s*\}\);/,
    );
  });
});

// F1.4/F2.4: execute the prompt caller against changing runtime state, not matching its spelling.
test("onStarted reads the federation refusal prefix afresh for each run", async () => {
  const { captureDaemonRun } = await import("./helpers/daemon-source.js");
  let prefix = "boot refusal";
  const toolExtensions = { federation: { refusalPrefix: () => prefix } };
  const first = await captureDaemonRun({ prompt: "Inspect tools" }, { bindings: { toolExtensions } });
  assert.equal(first.prompt, "boot refusal\n\n<<SUBAGENT_DISPATCH>>\n\nInspect tools");
  prefix = "reload refusal";
  const second = await captureDaemonRun({ prompt: "Inspect tools" }, { bindings: { toolExtensions } });
  assert.equal(second.prompt, "reload refusal\n\n<<SUBAGENT_DISPATCH>>\n\nInspect tools");
});

test("the daemon's composed executor diagnoses a refusal introduced after construction", async () => {
  const { daemonInitializer, evaluateDaemonExpression } = await import("./helpers/daemon-source.js");
  const { createToolRegistry } = await import("@jini-ai/core");
  const { createSurfaceExchangeStore } = await import("@jini-ai/daemon/surface-exchanges");
  const { createAssistantToolExecutor, withFederatedRefusalDiagnosis } = await import("#src/assistant/tool-recovery-preset");
  const { createInMemoryToolAttemptAuditSink } = await import("#src/features/tool-audit/repo.memory");
  let reports: import("@jini-ai/mcp/federation").FederationAdmissionSnapshotEntry[] = [];
  const executor = evaluateDaemonExpression<import("@jini-ai/daemon").ToolExecutor>(daemonInitializer("toolExecutor"), {
    createAssistantToolExecutor, withFederatedRefusalDiagnosis,
    registry: createToolRegistry({}), surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }),
    auditSink: createInMemoryToolAttemptAuditSink(), routeDeps: { workspaceId: "ws-live-refusal" },
    toolExtensions: { federation: { reports: () => reports } },
  });
  const request = { principal: { id: "principal" }, run: { id: "run" }, toolId: "mcp__probe__lookup", input: {} };
  await assert.rejects(executor.execute(request), /unknown tool/);
  reports = [{ connectionId: "probe", report: { admitted: [], refused: [{ remoteName: "lookup", reason: "not-in-operator-allowlist" }], allowlistedButAbsent: [], writeAllowedButNotAllowlisted: [] } }];
  const result = await executor.execute(request);
  assert.equal(result.status, "failed");
  assert.equal(result.errorKind, "validation");
  assert.equal(result.error, 'tool "lookup" on external server "probe" was refused: the administrator has not allowed this tool for this connection. Fix: in Settings → External MCP, add it to "Allowed tools", then restart the assistant.');
});

test("the daemon-mounted admissions handler reads live reports and both failure channels", async () => {
  const { default: ts } = await import("typescript");
  const { daemonFunction, daemonSource, evaluateDaemonStatements } = await import("./helpers/daemon-source.js");
  const { registerFederationAdmissionsRoute } = await import("../federation-admissions-route.js");
  const statement = daemonFunction("start").body!.statements.find((entry) => ts.isExpressionStatement(entry) && ts.isCallExpression(entry.expression) && entry.expression.expression.getText(daemonSource) === "registerFederationAdmissionsRoute");
  assert.ok(statement);
  let reports: unknown[] = [];
  let configFailures: unknown[] = [];
  let connectFailures: unknown[] = [];
  const handlers = new Map<string, (req: unknown, res: unknown) => void>();
  await evaluateDaemonStatements([statement], {
    registerFederationAdmissionsRoute,
    app: { get: (path: string, handler: (req: unknown, res: unknown) => void) => { assert.equal(handlers.has(path), false); handlers.set(path, handler); } },
    extensions: { federation: { reports: () => reports, connectFailures: () => connectFailures } },
    source: { failures: () => configFailures },
  });
  const handler = handlers.get("/api/federation/admissions");
  assert.ok(handler);
  function read() {
    let status: number | undefined;
    let body: unknown;
    handler!({}, { status(value: number) { status = value; return this; }, json(value: unknown) { body = value; } });
    assert.equal(status, 200);
    return body;
  }
  assert.deepEqual(read(), { connections: [], configFailures: [] });
  reports = [{ connectionId: "admitted-probe", isPreset: false, report: { admitted: ["lookup"], refused: [], allowlistedButAbsent: [], writeAllowedButNotAllowlisted: [] } }];
  configFailures = [{ connectionId: "sealed-probe", reason: "cannot decrypt" }];
  connectFailures = [{ connectionId: "offline-probe", reason: "connection refused" }];
  assert.deepEqual(read(), { connections: [{ connectionId: "admitted-probe", isPreset: false, report: { admitted: ["lookup"], refused: [], allowlistedButAbsent: [], writeAllowedButNotAllowlisted: [] } }], configFailures: [{ connectionId: "sealed-probe", reason: "cannot decrypt" }, { connectionId: "offline-probe", reason: "connection refused" }] });
});

test("a real federation reload makes native and newly admitted tools searchable and describable through existing daemon routes", async () => {
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
