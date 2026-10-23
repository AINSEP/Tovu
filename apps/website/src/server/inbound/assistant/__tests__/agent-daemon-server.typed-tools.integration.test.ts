import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test, { type TestContext } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createToolRegistry, type ToolDescriptor, type ToolRegistration } from "@jini-ai/core";
import { buildMcpJsonServerEntry, createInMemoryEventLog, createRunLifecycle, createToolExecutor,
  type ExecutionDelegate, type McpJsonInjectionOptions } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute, toolCatalogDescribeRoute, type ToolCatalogQuery } from "@jini-ai/daemon/http";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { serve } from "@jini-ai/mcp/bin";
import { createRunScopedCredentials } from "../../../../assistant/daemon-access.js";
import { resolveMcpJsonInjection } from "../../../../assistant/mcp-injection.js";
import { createChatDeleteScope } from "../../../../assistant/permanent-delete-tool-gate.js";
import { createAssistantToolExecutor } from "../../../../assistant/tool-recovery-preset.js";
import { isChatToolAllowed, PERMANENT_DELETE_TOOLS,
  type AssistantPermanentDeletesPolicy } from "../../../../contracts/headless/assistant-permanent-deletes-policy.js";
import { daemonInitializer, evaluateDaemonExpression } from "./helpers/daemon-source.js";

/** Evaluate the host's real composition expressions without its database/listener/process boot.
 * Only the transport is replaced: the launch env, MCP stdio server, daemon routes, credential
 * resolver and executor stay real. A missing callback or a raw-registry callback breaks these tests.
 * Live Claude/Codex launch and loopback HTTP remain separate cloud acceptance checks. */
const schema = { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false };
const ordinaryId = "content.read";
const grantedPolicy: AssistantPermanentDeletesPolicy = { enabled: true, allowedToolIds: ["trash_purge_item"] };
const disabledPolicy: AssistantPermanentDeletesPolicy = { enabled: false, allowedToolIds: [] };

/** Connect the real SDK Client to serve's real StdioServerTransport through serializing streams.
 * The SDK owns framing and validation. Closing the client ends stdin, disposes the idle timer,
 * and lets serve settle; no child process or socket is created. */
function stdioPair() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const buffer = new ReadBuffer();
  const transport: Transport = {
    start: async () => {
      stdout.on("data", (chunk: Buffer) => {
        buffer.append(chunk);
        let message;
        while ((message = buffer.readMessage()) !== null) transport.onmessage?.(message);
      });
    },
    send: async (message) => { stdin.write(serializeMessage(message)); },
    close: async () => { stdin.end(); transport.onclose?.(); },
  };
  return { stdin, stdout, transport };
}

/** Build the actual host launch wiring over a controlled registry and fresh per-principal grants.
 * Registrations remain behind ToolExecutor; GET lookup is the socket-free catalog storage port.
 * Optional delegates exercise the kernel confirmation decisions, while the default uses Tovu's
 * complete executor stack (including its parked descriptor-confirmation behavior). */
function hostFixture({ descriptor = {}, delegate }: { descriptor?: Partial<ToolDescriptor>; delegate?: ExecutionDelegate } = {}) {
  const registry = createToolRegistry({});
  const policies = new Map<string, AssistantPermanentDeletesPolicy>();
  const principals = new Map<string, string>();
  const invocations: { principalId: string; runId: string; input: unknown }[] = [];
  let authorized = true;
  const registration = (id: string): ToolRegistration => ({
    descriptor: { id, description: `Operate ${id}`, inputSchema: schema, readOnly: true, ...descriptor },
    policy: { authorize: ({ principal, run }) => authorized && principals.get(run.id) === principal.id ? "allow" : "deny" },
    handler: async ({ principal, run, input }) => {
      const result = { principalId: principal.id, runId: run.id, input };
      invocations.push(result);
      return result;
    },
  });
  for (const id of [ordinaryId, "workspace_delete", "collections_execute_cleanup", ...PERMANENT_DELETE_TOOLS.map(tool => tool.id)]) {
    registry.register(registration(id));
  }
  const deleteScope = createChatDeleteScope({ readPolicy: async ({ principalId }) => policies.get(principalId ?? "") ?? disabledPolicy });
  const visibleRegistry = evaluateDaemonExpression<Pick<typeof registry, "list">>(daemonInitializer("visibleRegistry"), { registry, deleteScope, isChatToolAllowed });
  const runCredentials = createRunScopedCredentials({ principalOfLiveRun: ({ runId }) => principals.get(runId) });
  const bridgeInjection = evaluateDaemonExpression<McpJsonInjectionOptions>(daemonInitializer("bridgeInjection"), {
    registry, visibleRegistry, runCredentials, daemonUrl: "http://127.0.0.1:4419",
    resolveMcpJsonInjection: (url: string, mint: (runId: string) => string) => resolveMcpJsonInjection(url, mint,
      { execPath: process.execPath, electronVersion: undefined, env: {} }),
  });
  // Also execute the host's handoff to createAgentExecutor, so a disconnected bridge object
  // cannot satisfy this fixture merely because its initializer still exists in the source.
  const executorOptions = evaluateDaemonExpression<{ mcpJsonInjection: McpJsonInjectionOptions }>(daemonInitializer("agentExecutor"), {
    createAgentExecutor: (_required: unknown, optional: unknown) => optional,
    lifecycle: {}, getAgentDef: () => {}, resolveAgentLaunch: () => {}, assistantRuntime: {},
    bridgeInjection, assistantPromptAugmenter: {},
  });
  assert.equal(executorOptions.mcpJsonInjection, bridgeInjection);
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(),
    idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const toolExecutor = delegate ? createToolExecutor({ registry }, { delegate }) : createAssistantToolExecutor({ registry, surfaceExchanges });
  const catalog: ToolCatalogQuery = deleteScope.catalog({ catalog: {
    search: () => [],
    describe: ({ id }) => {
      const found = registry.list({}).find(tool => tool.id === id);
      return found ? { ...found, description: found.description ?? "", source: "test" } : null;
    },
  } });
  const requests: { path: string; principalId: string; body?: Record<string, unknown> }[] = [];
  /** Invoke the existing route specifications directly, retaining parsing, read-only checks,
   * principal resolution, cancellation and executor dispatch. Only HTTP framing is replaced. */
  const dispatchRequest = async ({ path, init, body, principalId }: {
    path: string; init: RequestInit; body: Record<string, unknown> | undefined; principalId: string;
  }) => {
    if (init.method === "GET") {
      const result = await toolCatalogDescribeRoute.handle({ input: { id: decodeURIComponent(path.slice("/api/tools/".length)) }, deps: { catalog } });
      return result.ok ? Response.json(result.value) : Response.json({ error: result.error }, { status: 404 });
    }
    assert.equal(path, "/api/delegated-tool-calls");
    const parsed = delegatedToolExecuteRoute.parse({ body, params: {}, query: {} });
    assert.ok(parsed.ok);
    const result = await delegatedToolExecuteRoute.handle({ input: parsed.value, deps: {
      lifecycle, toolExecutor, toolRegistry: registry, resolvePrincipal: () => ({ id: principalId }), onInternalError: () => {},
    } }, init.signal ? { signal: init.signal } : {});
    return result.ok ? Response.json(result.value) : Response.json({ error: result.error }, { status: 403 });
  };
  const fetchImpl: typeof fetch = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    const token = new Headers(init.headers).get("authorization")?.replace(/^Bearer /, "") ?? "";
    const caller = runCredentials.resolveCaller({ token });
    if (!caller) return Response.json({ error: { code: "UNAUTHORIZED", message: "run ended" } }, { status: 401 });
    const body: Record<string, unknown> | undefined = init.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ path, principalId: caller.principalId, ...(body ? { body } : {}) });
    if (body && body.runId !== caller.runId) return Response.json({ error: { code: "FORBIDDEN", message: "wrong run" } }, { status: 403 });
    return deleteScope.fresh({ principalId: caller.principalId,
      run: () => dispatchRequest({ path, init, body, principalId: caller.principalId }) });
  };
  return { registry, policies, principals, invocations, deleteScope, bridgeInjection, lifecycle, requests, fetchImpl,
    registration, deny: () => { authorized = false; } };
}

/** Run the host-selected entry through the public bridge entrypoint and a real MCP handshake.
 * Cleanup is registered before connect so handshake/assertion failures also close every stream. */
async function launch({ t, host, principalId, policy = disabledPolicy }: {
  t: TestContext; host: ReturnType<typeof hostFixture>; principalId: string; policy?: AssistantPermanentDeletesPolicy;
}) {
  const { run } = await host.lifecycle.start({ contextRef: principalId });
  host.principals.set(run.id, principalId);
  host.policies.set(principalId, policy);
  const entry = await host.deleteScope.fresh({ principalId, run: async () => buildMcpJsonServerEntry({ runId: run.id, options: host.bridgeInjection },
    { credential: await host.bridgeInjection.credential!({ runId: run.id }) }) });
  const pair = stdioPair();
  const client = new Client({ name: "tovu-host-test", version: "1" });
  const errors: string[] = [];
  const serving = serve({}, { env: entry.env, fetchImpl: host.fetchImpl, stdin: pair.stdin, stdout: pair.stdout,
    writeErr: ({ text }) => errors.push(text), exit: ({ code }) => { throw new Error(`bridge exited ${code}: ${errors.join("")}`); } });
  t.after(async () => {
    await client.close();
    pair.stdin.end();
    await serving;
    pair.stdout.destroy();
  });
  await Promise.race([client.connect(pair.transport), serving.then(() => { throw new Error("bridge stopped before handshake"); })]);
  assert.deepEqual(errors, []);
  const { tools } = await client.listTools();
  const typed = (id = ordinaryId) => {
    const tool = tools.find(tool => tool.annotations?.title === id);
    assert.ok(tool, `missing startup tool ${id}`);
    return tool;
  };
  return { client, run, entry, tools, typed };
}

test("host startup IDs reach a typed MCP call and the existing Tovu executor", { timeout: 5000 }, async t => {
  const host = hostFixture();
  const bridge = await launch({ t, host, principalId: "editor" });
  const tool = bridge.typed();
  assert.deepEqual(tool.inputSchema, schema);
  assert.match(tool.name, /^[A-Za-z_][A-Za-z0-9_]{0,63}$/);
  assert.equal(tool.annotations?.readOnlyHint, true);
  const result = await bridge.client.callTool({ name: tool.name, arguments: { id: "page-1" } });
  assert.equal(result.isError, undefined);
  assert.deepEqual(host.invocations, [{ principalId: "editor", runId: bridge.run.id, input: { id: "page-1" } }]);
  assert.match(JSON.stringify(result), /page-1/);
  assert.deepEqual(host.requests.find(request => request.body)?.body?.input, { id: "page-1" });
  assert.equal(host.requests.find(request => request.body)?.body?.requireReadOnly, true);
  const forged = await bridge.client.callTool({ name: tool.name, arguments: { id: "x", runId: "other-run" } });
  assert.equal(forged.isError, true);
  assert.equal(host.invocations.length, 1);
});

test("startup publication prioritizes late theme tools within the budget and preserves remaining catalog order", { timeout: 5000 }, async t => {
  const host = hostFixture();
  for (let i = 0; i < 64; i++) host.registry.register(host.registration(`unrelated_${i}`));
  const themeFileTools = ["theme_list_files", "theme_read_file", "theme_edit_file", "theme_write_file"];
  for (const id of themeFileTools) host.registry.register(host.registration(id));

  const bridge = await launch({ t, host, principalId: "editor" });
  const startupIds: string[] = JSON.parse(bridge.entry.env.JINI_STARTUP_TOOL_IDS!);
  const expectedIds = [...themeFileTools, ordinaryId, ...Array.from({ length: 64 }, (_, i) => `unrelated_${i}`)];
  assert.deepEqual(startupIds, expectedIds);
  assert.equal(new Set(startupIds).size, startupIds.length);
  const publishedIds = bridge.tools.flatMap(tool => typeof tool.annotations?.title === "string" && startupIds.includes(tool.annotations.title)
    ? [tool.annotations.title] : []);
  assert.deepEqual(publishedIds, expectedIds.slice(0, 64));
  for (const id of themeFileTools) assert.ok(bridge.typed(id));
  assert.ok(bridge.typed("unrelated_58"));
  assert.equal(bridge.tools.some(tool => tool.annotations?.title === "unrelated_59"), false);
  assert.equal(bridge.tools.some(tool => tool.annotations?.title === "unrelated_63"), false);
  for (const id of ["workspace_delete", "collections_execute_cleanup", ...PERMANENT_DELETE_TOOLS.map(tool => tool.id)]) {
    assert.equal(bridge.tools.some(tool => tool.annotations?.title === id), false, id);
  }

  const result = await bridge.client.callTool({ name: bridge.typed("theme_read_file").name, arguments: { id: "stylesheet" } });
  assert.equal(result.isError, undefined);
  assert.deepEqual(host.invocations, [{ principalId: "editor", runId: bridge.run.id, input: { id: "stylesheet" } }]);
});

test("startup discovery excludes forbidden and ungranted permanent deletes despite diagnostic IDs", { timeout: 5000 }, async t => {
  const host = hostFixture();
  const bridge = await launch({ t, host, principalId: "editor" });
  assert.deepEqual(JSON.parse(bridge.entry.env.JINI_STARTUP_TOOL_IDS!), [ordinaryId]);
  assert.ok(JSON.parse(bridge.entry.env.JINI_DIAGNOSTIC_TOOL_IDS!).includes("workspace_delete"));
  assert.deepEqual(bridge.tools.filter(tool => tool.annotations?.title === ordinaryId).map(tool => tool.annotations?.title), [ordinaryId]);
  for (const id of ["workspace_delete", "collections_execute_cleanup", ...PERMANENT_DELETE_TOOLS.map(tool => tool.id)]) {
    assert.equal(bridge.tools.some(tool => tool.annotations?.title === id), false, id);
    assert.equal(host.requests.some(request => request.path === `/api/tools/${id}`), false, id);
    const described = await bridge.client.callTool({ name: "describe_tool", arguments: { id } });
    assert.equal(described.isError, true, id);
  }
});

test("overlapping runs isolate grants, credentials and publication and read the live registry at launch", { timeout: 5000 }, async t => {
  const host = hostFixture();
  // Register after bridgeInjection is constructed: a boot-time ID array would omit this operation.
  host.registry.register(host.registration("late.read"));
  const [owner, editor] = await Promise.all([
    launch({ t, host, principalId: "owner", policy: grantedPolicy }),
    launch({ t, host, principalId: "editor" }),
  ]);
  assert.notEqual(owner.entry.env.JINI_DAEMON_TOKEN, editor.entry.env.JINI_DAEMON_TOKEN);
  assert.deepEqual(JSON.parse(owner.entry.env.JINI_STARTUP_TOOL_IDS!), [ordinaryId, "trash_purge_item", "late.read"]);
  assert.deepEqual(JSON.parse(editor.entry.env.JINI_STARTUP_TOOL_IDS!), [ordinaryId, "late.read"]);
  const hiddenName = owner.typed("trash_purge_item").name;
  assert.equal((await editor.client.callTool({ name: hiddenName, arguments: { id: "trash-1" } })).isError, true);
  await Promise.all([owner, editor].map(bridge => bridge.client.callTool({ name: bridge.typed("late.read").name, arguments: { id: "late" } })));
  assert.deepEqual(host.invocations.map(call => call.principalId).sort(), ["editor", "owner"]);
  assert.ok(host.invocations.every(call => host.principals.get(call.runId) === call.principalId));
  host.principals.delete(owner.run.id);
  assert.equal((await owner.client.callTool({ name: owner.typed().name, arguments: { id: "ended" } })).isError, true);
  assert.equal(host.invocations.length, 2);
});

test("typed and legacy calls recheck authorization after publication", { timeout: 5000 }, async t => {
  const host = hostFixture();
  const bridge = await launch({ t, host, principalId: "editor" });
  host.deny();
  const typed = await bridge.client.callTool({ name: bridge.typed().name, arguments: { id: "denied" } });
  const legacy = await bridge.client.callTool({ name: "execute_delegated_tool", arguments: { toolId: ordinaryId, input: { id: "denied" } } });
  assert.equal(typed.isError, true);
  assert.equal(legacy.isError, true);
  assert.deepEqual(host.invocations, []);
});

for (const decision of ["confirm", "deny"] as const) {
  test(`typed and legacy bridge ingress preserve the executor's ${decision} decision`, { timeout: 5000 }, async t => {
    let confirmations = 0;
    const host = hostFixture({ descriptor: { readOnly: false, requiresConfirmation: true }, delegate: {
      onConfirm: () => { confirmations += 1; return decision; },
    } });
    const bridge = await launch({ t, host, principalId: "editor" });
    assert.equal(bridge.typed().annotations?.readOnlyHint, false);
    const typed = await bridge.client.callTool({ name: bridge.typed().name, arguments: { id: "confirmed" } });
    const legacy = await bridge.client.callTool({ name: "execute_delegated_tool", arguments: { toolId: ordinaryId, input: { id: "confirmed" } } });
    assert.equal(typed.isError, decision === "deny" ? true : undefined);
    assert.equal(typed.isError, legacy.isError);
    assert.equal(confirmations, 2);
    assert.equal(host.invocations.length, decision === "confirm" ? 2 : 0);
    assert.ok(host.requests.filter(request => request.body).every(request => request.body?.requireReadOnly === undefined));
  });
}
