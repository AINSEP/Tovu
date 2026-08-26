import assert from "node:assert/strict";
import test from "node:test";

import type {
  ToolExecutionContext,
  ToolDescriptor,
  ToolRegistration,
  ToolRegistry,
} from "@jini-ai/core";

import { ForbiddenError } from "@jini-ai/cms/core";
import { InMemoryMcpSession } from "../mcp-federation/adapter.memory.js";
import { attachFederatedMcpTools } from "../mcp-federation/bootstrap.js";
import type { ResolvedFederatedConnection } from "../mcp-federation/config.js";
import type { FederatedMcpConnectionConfig, RemoteToolDescriptor } from "../mcp-federation/ports.js";
import {
  registerFederatedMcpPreset,
  resetFederatedMcpPresetsForTests,
} from "../mcp-federation/presets.js";
import { buildFederatedMcpRegistrations, federateSession } from "../mcp-federation/registrations.js";
import { FEDERATED_ENTITY_TYPE, FEDERATED_TOOL_PERMISSION } from "../mcp-federation/trust.js";

/**
 * @file The federation wiring half: that an admitted remote tool becomes a real `ToolRegistration`,
 * that its handler runs Tovu's OWN authorization before anything crosses the network, that the
 * remote sees its own name rather than Tovu's namespaced id, that results come back inside the
 * untrusted envelope — plus the preset-registry seam and the fail-open bootstrap.
 *
 * Vendor-blind by construction: nothing here imports a preset module. Where a preset is needed, the
 * test registers its own fake one through `presets.ts`, which is also the most direct check that the
 * seam works for a vendor core has never heard of. The real Supabase preset's own resolution is
 * covered by `src/features/plugins/supabase-mcp/__tests__/supabase-mcp-plugin.test.ts`.
 *
 * The `fakeDeps` here follows `tool-registrations.database-recovery.test.ts`'s technique exactly:
 * an `order` array recording every authorize call and every outbound tool call, so "authorized
 * BEFORE anything left the building" is a directly observable sequence rather than an inference.
 */

const WORKSPACE_ID = "ws-federation";
const PRINCIPAL_ID = "principal-under-test";

const OBJECT_SCHEMA = { type: "object", properties: { schemas: { type: "array" } }, additionalProperties: false } as const;

const CONFIG: FederatedMcpConnectionConfig = {
  connectionId: "supabase",
  label: "Supabase (project abcdefghijklmnop)",
  allowedToolNames: ["list_tables", "get_advisors"],
  connectTimeoutMs: 1_000,
  callTimeoutMs: 1_000,
  maxResultBytes: 4_096,
  maxTools: 8,
};

const REMOTE_TOOLS: RemoteToolDescriptor[] = [
  { name: "list_tables", description: "Lists all tables in the database.", inputSchema: OBJECT_SCHEMA, annotations: { readOnlyHint: true } },
  { name: "get_advisors", description: "Security and performance advisors.", inputSchema: OBJECT_SCHEMA },
  // Advertised but never allowlisted — the tool an operator did not ask for.
  { name: "execute_sql", description: "Runs arbitrary SQL.", inputSchema: OBJECT_SCHEMA, annotations: { readOnlyHint: true } },
];

function fakeDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const order: string[] = [];
  const authorizeCalls: Array<Record<string, unknown>> = [];

  const authorize = async (params: Record<string, unknown>) => {
    authorizeCalls.push(params);
    order.push("authorize");
    return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
  };

  return { deps: { authorize, workspaceId: WORKSPACE_ID }, order, authorizeCalls };
}

function toolContext(input: unknown): ToolExecutionContext {
  return {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  };
}

function sessionFor(order?: string[]): InMemoryMcpSession {
  return new InMemoryMcpSession({
    tools: REMOTE_TOOLS,
    onCall: (name, args) => {
      order?.push(`remote:${name}`);
      return { content: [{ type: "text", text: `rows for ${name} ${JSON.stringify(args)}` }] };
    },
  });
}

function registrationFor(registrations: ToolRegistration[], toolId: string): ToolRegistration {
  const found = registrations.find((registration) => registration.descriptor.id === toolId);
  assert.ok(found, `expected a registration for ${toolId}`);
  return found;
}

// ---------------------------------------------------------------------------
// Liveness gate — `FederationDeps.assertConnectionUsable`
//
// Nothing in `mcp-federation/` unregisters a federated tool, and it must not: `buildToolCatalogQuery`
// snapshots the registry into a one-shot FTS index, so a removed tool would stay discoverable while
// becoming unexecutable. The gate is what makes a dead connection refuse AT THE CALL with something
// a model can act on, instead of a transient-looking transport error it will retry forever.
// ---------------------------------------------------------------------------

test("with no gate configured, behaviour is exactly what it was before the gate existed", async () => {
  const order: string[] = [];
  const { deps } = fakeDeps();
  const { registrations } = await federateSession({ session: sessionFor(order), config: CONFIG, deps, nativeToolIds: new Set() });

  await registrationFor(registrations, "mcp__supabase__list_tables").handler(toolContext({}));

  assert.deepEqual(order, ["remote:list_tables"]);
});

test("a gate that refuses stops the call BEFORE anything crosses the network", async () => {
  const order: string[] = [];
  const base = fakeDeps();
  const deps = {
    ...base.deps,
    assertConnectionUsable: (connectionId: string) => {
      order.push(`gate:${connectionId}`);
      throw new Error("supabase is disconnected: its authorization expired. Do not retry this tool.");
    },
  };
  const { registrations } = await federateSession({ session: sessionFor(order), config: CONFIG, deps, nativeToolIds: new Set() });

  await assert.rejects(
    () => registrationFor(registrations, "mcp__supabase__list_tables").handler(toolContext({})),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "supabase is disconnected: its authorization expired. Do not retry this tool.",
  );

  // The gate ran, and nothing else did — no authorize, no outbound call.
  assert.deepEqual(order, ["gate:supabase"]);
  assert.deepEqual(base.order, []);
});

test("the gate runs BEFORE the permission check, so a disconnected server is not reported as a permission problem", async () => {
  const order: string[] = [];
  const base = fakeDeps({ allow: false });
  const deps = {
    ...base.deps,
    assertConnectionUsable: (connectionId: string) => {
      order.push(`gate:${connectionId}`);
      throw new Error("disconnected");
    },
  };
  const { registrations } = await federateSession({ session: sessionFor(), config: CONFIG, deps, nativeToolIds: new Set() });

  await assert.rejects(
    () => registrationFor(registrations, "mcp__supabase__list_tables").handler(toolContext({})),
    (error: unknown) => error instanceof Error && error.message === "disconnected",
  );
  assert.deepEqual(order, ["gate:supabase"]);
});

test("a gate that passes lets the call through unchanged, and is asked about THIS connection", async () => {
  const asked: string[] = [];
  const order: string[] = [];
  const base = fakeDeps();
  const deps = {
    ...base.deps,
    assertConnectionUsable: async (connectionId: string) => {
      asked.push(connectionId);
    },
  };
  const { registrations } = await federateSession({ session: sessionFor(order), config: CONFIG, deps, nativeToolIds: new Set() });

  await registrationFor(registrations, "mcp__supabase__list_tables").handler(toolContext({}));

  assert.deepEqual(asked, ["supabase"]);
  assert.deepEqual(order, ["remote:list_tables"]);
});

// ---------------------------------------------------------------------------
// Registration shape
// ---------------------------------------------------------------------------

test("only allowlisted remote tools become registrations, and their ids are namespaced", async () => {
  const { deps } = fakeDeps();
  const { registrations, report } = await federateSession({ session: sessionFor(), config: CONFIG, deps, nativeToolIds: new Set() });

  assert.deepEqual(
    registrations.map((registration) => registration.descriptor.id),
    ["mcp__supabase__list_tables", "mcp__supabase__get_advisors"],
  );
  assert.equal(report.refused.find((entry) => entry.remoteName === "execute_sql")?.reason, "not-in-operator-allowlist");
});

test("the published descriptor carries the remote's schema and a provenance-labelled description", async () => {
  const { deps } = fakeDeps();
  const { registrations } = await federateSession({ session: sessionFor(), config: CONFIG, deps, nativeToolIds: new Set() });

  const descriptor: ToolDescriptor = registrationFor(registrations, "mcp__supabase__list_tables").descriptor;
  assert.deepEqual(descriptor.inputSchema, OBJECT_SCHEMA);
  assert.ok(String(descriptor.description).startsWith("[EXTERNAL TOOL — provided by 'Supabase (project abcdefghijklmnop)'"));
  assert.ok(String(descriptor.description).includes("Lists all tables in the database."));
});

test("the ToolPolicy is a pass-through, because the handler is this tool's one authorization evaluator", async () => {
  const { deps } = fakeDeps();
  const { registrations } = await federateSession({ session: sessionFor(), config: CONFIG, deps, nativeToolIds: new Set() });

  for (const registration of registrations) {
    assert.equal(
      registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} }),
      "allow",
    );
  }
});

// ---------------------------------------------------------------------------
// Authorization — the ADR-021 §2 half
// ---------------------------------------------------------------------------

test("a federated call authorizes against Tovu's own evaluator BEFORE anything reaches the remote", async () => {
  const { deps, order, authorizeCalls } = fakeDeps();
  const session = sessionFor(order);
  const { registrations } = await federateSession({ session, config: CONFIG, deps, nativeToolIds: new Set() });

  await registrationFor(registrations, "mcp__supabase__list_tables").handler(toolContext({ schemas: ["public"] }));

  assert.deepEqual(order, ["authorize", "remote:list_tables"]);
  assert.deepEqual(authorizeCalls[0], {
    principalId: PRINCIPAL_ID,
    permission: FEDERATED_TOOL_PERMISSION,
    workspaceId: WORKSPACE_ID,
    entityType: FEDERATED_ENTITY_TYPE,
    entityId: "supabase",
  });
});

test("a denied principal gets ForbiddenError and the remote is never contacted at all", async () => {
  const { deps, order } = fakeDeps({ allow: false });
  const session = sessionFor(order);
  const { registrations } = await federateSession({ session, config: CONFIG, deps, nativeToolIds: new Set() });

  await assert.rejects(
    () => registrationFor(registrations, "mcp__supabase__list_tables").handler(toolContext({})),
    (error: unknown) => error instanceof ForbiddenError,
  );

  // The point of checking before the network call: a denied principal's arguments never leave Tovu.
  assert.deepEqual(order, ["authorize"]);
  assert.equal(session.calls.length, 0);
});

test("the federated permission is deliberately not the permission of whatever the remote tool resembles", () => {
  // A federated `list_tables` reads somebody else's database, so gating it on `database.read` —
  // Tovu's statement about THIS site's database — would be the confused-deputy error in permission
  // form. This asserts the choice so a future edit has to argue with it.
  assert.equal(FEDERATED_TOOL_PERMISSION, "admin.integrations.manage");
  assert.notEqual(FEDERATED_TOOL_PERMISSION, "database.read");
});

// ---------------------------------------------------------------------------
// The call itself
// ---------------------------------------------------------------------------

test("the remote receives its OWN tool name, never Tovu's namespaced id", async () => {
  const { deps } = fakeDeps();
  const session = sessionFor();
  const { registrations } = await federateSession({ session, config: CONFIG, deps, nativeToolIds: new Set() });

  await registrationFor(registrations, "mcp__supabase__list_tables").handler(toolContext({ schemas: ["public"] }));

  assert.deepEqual(session.calls, [{ name: "list_tables", arguments: { schemas: ["public"] } }]);
});

test("a federated result reaches the model inside the untrusted-data envelope, tagged with its provenance", async () => {
  const { deps } = fakeDeps();
  const { registrations } = await federateSession({ session: sessionFor(), config: CONFIG, deps, nativeToolIds: new Set() });

  const result = (await registrationFor(registrations, "mcp__supabase__list_tables").handler(toolContext({}))) as {
    federated: { connectionId: string; tool: string; remoteReportedError: boolean };
    untrusted: string;
  };

  assert.deepEqual(result.federated, { connectionId: "supabase", tool: "list_tables", remoteReportedError: false });
  assert.match(result.untrusted, /<untrusted-data-[0-9a-f-]{36}>/);
  assert.ok(result.untrusted.includes("UNTRUSTED third-party data"));
  assert.ok(result.untrusted.includes("rows for list_tables"));
});

test("a remote result claiming isError is reported as data rather than acted on", async () => {
  const { deps } = fakeDeps();
  const session = new InMemoryMcpSession({ tools: REMOTE_TOOLS, onCall: () => ({ content: "denied", isError: true }) });
  const { registrations } = await federateSession({ session, config: CONFIG, deps, nativeToolIds: new Set() });

  const result = (await registrationFor(registrations, "mcp__supabase__list_tables").handler(toolContext({}))) as {
    federated: { remoteReportedError: boolean };
  };

  assert.equal(result.federated.remoteReportedError, true);
});

test("an omitted input is sent as {}, and a non-object input is refused rather than coerced", async () => {
  const { deps } = fakeDeps();
  const session = sessionFor();
  const { registrations } = await federateSession({ session, config: CONFIG, deps, nativeToolIds: new Set() });
  const registration = registrationFor(registrations, "mcp__supabase__list_tables");

  await registration.handler(toolContext(undefined));
  assert.deepEqual(session.calls[0], { name: "list_tables", arguments: {} });

  await assert.rejects(() => registration.handler(toolContext("just a string")), /input must be an object/);
  await assert.rejects(() => registration.handler(toolContext([1, 2, 3])), /input must be an object/);
});

// ---------------------------------------------------------------------------
// R1 collision, at the registration layer
// ---------------------------------------------------------------------------

test("a federated id colliding with a natively-registered one refuses the whole connection", () => {
  assert.throws(
    () =>
      buildFederatedMcpRegistrations({
        tools: [{ name: "list_tables", inputSchema: OBJECT_SCHEMA }],
        session: sessionFor(),
        config: CONFIG,
        deps: fakeDeps().deps,
        // Simulates a future world where a native tool happens to be called this.
        nativeToolIds: new Set(["mcp__supabase__list_tables"]),
      }),
    /must never be able to shadow/,
  );
});

// ---------------------------------------------------------------------------
// The preset registry — the core/plugin seam
// ---------------------------------------------------------------------------

const FAKE_LAUNCH = { command: "unused", args: [] as string[], env: {} };

/** A vendor core has never heard of, resolved entirely through the public seam. */
function fakePreset(options: { presetId: string; resolve: (env: NodeJS.ProcessEnv) => ResolvedFederatedConnection | null }) {
  registerFederatedMcpPreset({ presetId: options.presetId, resolve: options.resolve });
}

test("a preset registered from outside core is resolved and connected without core knowing the vendor", async (t) => {
  t.after(resetFederatedMcpPresetsForTests);
  resetFederatedMcpPresetsForTests();

  const seenEnv: NodeJS.ProcessEnv[] = [];
  fakePreset({
    presetId: "acme",
    resolve: (env) => {
      seenEnv.push(env);
      return { config: { ...CONFIG, connectionId: "acme" }, launch: FAKE_LAUNCH };
    },
  });

  const registry = fakeRegistry(["database_get_health"]);
  const result = await attachFederatedMcpTools({
    registry,
    deps: fakeDeps().deps,
    logger: collectingLogger().logger,
    connect: async () => sessionFor(),
    env: { SOME_VENDOR_SETTING: "1" },
  });

  assert.deepEqual(result.registeredToolIds, ["mcp__acme__list_tables", "mcp__acme__get_advisors"]);
  // The env bag reaches the preset by injection, not by the preset reading `process.env` itself.
  assert.deepEqual(seenEnv, [{ SOME_VENDOR_SETTING: "1" }]);
});

test("a preset that declines contributes nothing, silently — 'not configured' is the default state", async (t) => {
  t.after(resetFederatedMcpPresetsForTests);
  resetFederatedMcpPresetsForTests();

  fakePreset({ presetId: "acme", resolve: () => null });

  const { messages, logger } = collectingLogger();
  const registry = fakeRegistry();
  const result = await attachFederatedMcpTools({ registry, deps: fakeDeps().deps, logger, env: {} });

  assert.deepEqual(result.registeredToolIds, []);
  assert.deepEqual(messages, [], "an unconfigured preset must not log every boot");
});

test("two presets both contribute, and one vendor's broken config does not disable the other's working one", async (t) => {
  t.after(resetFederatedMcpPresetsForTests);
  resetFederatedMcpPresetsForTests();

  fakePreset({
    presetId: "broken",
    resolve: () => {
      throw new Error("BROKEN_VENDOR_TOKEN is empty");
    },
  });
  fakePreset({ presetId: "working", resolve: () => ({ config: { ...CONFIG, connectionId: "working" }, launch: FAKE_LAUNCH }) });

  const { messages, logger } = collectingLogger();
  const registry = fakeRegistry();
  const result = await attachFederatedMcpTools({ registry, deps: fakeDeps().deps, logger, connect: async () => sessionFor(), env: {} });

  assert.deepEqual(result.registeredToolIds, ["mcp__working__list_tables", "mcp__working__get_advisors"]);
  assert.ok(messages.some((message) => message.includes("preset 'broken' configuration is invalid, continuing without federated tools")));
});

test("re-registering the same presetId replaces it, so a module imported twice cannot self-collide", async (t) => {
  t.after(resetFederatedMcpPresetsForTests);
  resetFederatedMcpPresetsForTests();

  // Two connections with the same `connectionId` would make R1's collision assertion drop the
  // second one for shadowing what is really itself.
  fakePreset({ presetId: "acme", resolve: () => ({ config: { ...CONFIG, connectionId: "acme" }, launch: FAKE_LAUNCH }) });
  fakePreset({ presetId: "acme", resolve: () => ({ config: { ...CONFIG, connectionId: "acme" }, launch: FAKE_LAUNCH }) });

  const { messages, logger } = collectingLogger();
  const registry = fakeRegistry();
  const result = await attachFederatedMcpTools({ registry, deps: fakeDeps().deps, logger, connect: async () => sessionFor(), env: {} });

  assert.deepEqual(result.registeredToolIds, ["mcp__acme__list_tables", "mcp__acme__get_advisors"]);
  assert.equal(
    messages.some((message) => message.includes("must never be able to shadow")),
    false,
  );
});

// ---------------------------------------------------------------------------
// Bootstrap — fail-open, because a third party must never break Tovu's boot
// ---------------------------------------------------------------------------

function fakeRegistry(seed: string[] = []): ToolRegistry & { registered: ToolRegistration[] } {
  const registered: ToolRegistration[] = [];
  const descriptors: ToolDescriptor[] = seed.map((id) => ({ id }));
  return {
    registered,
    register(registration) {
      registered.push(registration);
      descriptors.push(registration.descriptor);
    },
    has: (toolId: string) => descriptors.some((descriptor) => descriptor.id === toolId),
    list: () => descriptors,
  };
}

function collectingLogger() {
  const messages: string[] = [];
  return { messages, logger: { info: (m: string) => messages.push(`info:${m}`), warn: (m: string) => messages.push(`warn:${m}`) } };
}

test("with no configuration, the daemon boots exactly as it did before federation existed", async () => {
  const registry = fakeRegistry(["database_get_health"]);
  const result = await attachFederatedMcpTools({ registry, deps: fakeDeps().deps, env: {} });

  assert.deepEqual(result.registeredToolIds, []);
  assert.equal(registry.registered.length, 0);
});

test("a configured connection registers its admitted tools into the daemon's registry", async () => {
  const registry = fakeRegistry(["database_get_health"]);
  const { messages, logger } = collectingLogger();

  const result = await attachFederatedMcpTools({
    registry,
    deps: fakeDeps().deps,
    logger,
    connections: [{ config: CONFIG, launch: { command: "unused", args: [], env: {} } }],
    connect: async () => sessionFor(),
  });

  assert.deepEqual(result.registeredToolIds, ["mcp__supabase__list_tables", "mcp__supabase__get_advisors"]);
  assert.equal(registry.registered.length, 2);
  // Refusals are logged rather than swallowed, so an operator can see what the remote tried to expose.
  assert.ok(messages.some((message) => message.includes("refused remote tool 'execute_sql'")));
});

test("an unreachable or broken remote is stepped over — Tovu's own catalog is never held hostage", async () => {
  const registry = fakeRegistry(["database_get_health"]);
  const { messages, logger } = collectingLogger();

  const result = await attachFederatedMcpTools({
    registry,
    deps: fakeDeps().deps,
    logger,
    connections: [{ config: CONFIG, launch: { command: "unused", args: [], env: {} } }],
    connect: async () => {
      throw new Error("connect timed out after 15000ms");
    },
  });

  assert.deepEqual(result.registeredToolIds, []);
  assert.equal(registry.registered.length, 0);
  assert.ok(messages.some((message) => message.includes("failed, continuing without its tools")));
});

test("a remote that connects but cannot enumerate is stepped over, and its session is closed", async () => {
  const registry = fakeRegistry();
  const { logger } = collectingLogger();
  const session = new InMemoryMcpSession({
    tools: [],
    onListTools: async () => {
      throw new Error("remote returned JSON-RPC error -32000: invalid access token");
    },
  });

  const result = await attachFederatedMcpTools({
    registry,
    deps: fakeDeps().deps,
    logger,
    connections: [{ config: CONFIG, launch: { command: "unused", args: [], env: {} } }],
    connect: async () => session,
  });

  assert.deepEqual(result.registeredToolIds, []);
  assert.equal(session.closed, true, "a session that failed mid-setup must not leak its child process");
});

test("a remote that fails mid-setup AND whose own close() also rejects still resolves cleanly — cleanup failure is swallowed, not left to crash or unhandled-reject the boot", async () => {
  const registry = fakeRegistry();
  const { logger } = collectingLogger();
  const session = {
    listTools: async () => {
      throw new Error("remote returned JSON-RPC error -32000: invalid access token");
    },
    callTool: async () => {
      throw new Error("must not be called");
    },
    close: async () => {
      throw new Error("close failed too — the child process was already dead");
    },
  };

  const result = await attachFederatedMcpTools({
    registry,
    deps: fakeDeps().deps,
    logger,
    connections: [{ config: CONFIG, launch: { command: "unused", args: [], env: {} } }],
    connect: async () => session,
  });

  assert.deepEqual(result.registeredToolIds, []);
  assert.deepEqual(result.sessions, [], "a session that failed mid-setup is never returned as a live session to close again");
});

test("an invalid-but-enabled configuration warns and continues rather than throwing out of boot", async (t) => {
  t.after(resetFederatedMcpPresetsForTests);
  resetFederatedMcpPresetsForTests();

  // A preset THROWS (rather than returning null) exactly when the operator asked for a connection
  // and got the settings wrong — the one case that must be loud without being fatal.
  fakePreset({
    presetId: "acme",
    resolve: () => {
      throw new Error("ACME_MCP_ENABLED is set but ACME_MCP_TOKEN is empty");
    },
  });

  const registry = fakeRegistry();
  const { messages, logger } = collectingLogger();

  const result = await attachFederatedMcpTools({ registry, deps: fakeDeps().deps, logger, env: {} });

  assert.deepEqual(result.registeredToolIds, []);
  assert.ok(messages.some((message) => message.includes("configuration is invalid, continuing without federated tools")));
});

test("a remote whose id would collide with a native tool loses the whole connection, not just that tool", async () => {
  const registry = fakeRegistry(["mcp__supabase__list_tables"]);
  const { messages, logger } = collectingLogger();

  const result = await attachFederatedMcpTools({
    registry,
    deps: fakeDeps().deps,
    logger,
    connections: [{ config: CONFIG, launch: { command: "unused", args: [], env: {} } }],
    connect: async () => sessionFor(),
  });

  // Dropping the connection whole is the safe direction: "no federated tools" is always acceptable.
  assert.deepEqual(result.registeredToolIds, []);
  assert.equal(registry.registered.length, 0);
  assert.ok(messages.some((message) => message.includes("must never be able to shadow")));
});

// ---------------------------------------------------------------------------
// Bootstrap defaults — the production `logger`/`connect` a caller gets when it omits both
// ---------------------------------------------------------------------------

test("omitting `logger` uses the real console logger — info and warn both reach console.log/console.warn", async (t) => {
  const logLines: string[] = [];
  const warnLines: string[] = [];
  t.mock.method(console, "log", (...args: unknown[]) => {
    logLines.push(args.map(String).join(" "));
  });
  t.mock.method(console, "warn", (...args: unknown[]) => {
    warnLines.push(args.map(String).join(" "));
  });

  const registry = fakeRegistry(["database_get_health"]);
  const result = await attachFederatedMcpTools({
    registry,
    deps: fakeDeps().deps,
    // No `logger` — forces the production `consoleLogger` default.
    connections: [{ config: CONFIG, launch: { command: "unused", args: [], env: {} } }],
    connect: async () => sessionFor(),
  });

  assert.deepEqual(result.registeredToolIds, ["mcp__supabase__list_tables", "mcp__supabase__get_advisors"]);
  assert.ok(
    logLines.some((line) => line.includes("[agent-daemon]") && line.includes("registered 2 federated tool(s)")),
    `expected an info line through console.log; got: ${JSON.stringify(logLines)}`,
  );
  assert.ok(
    warnLines.some((line) => line.includes("[agent-daemon]") && line.includes("refused remote tool 'execute_sql'")),
    `expected a warn line through console.warn; got: ${JSON.stringify(warnLines)}`,
  );
});

// ---------------------------------------------------------------------------
// defaultConnect — the real production session factory: a genuine spawn + handshake, not a double.
// Exercises `spawnMcpStdioChannel`'s real child-process path too, not just the scripted channel
// seam every other test in this file (and adapter.stdio.ts's own tests) use.
// ---------------------------------------------------------------------------

/** A minimal, real MCP stdio server: answers `initialize` and `tools/list` (with zero tools),
 *  ignores everything else including the `notifications/initialized` notification. Just enough for
 *  `connectMcpStdioSession`'s handshake to complete against a REAL child process. */
const MINIMAL_MCP_SERVER_SCRIPT = `
process.stdin.setEncoding("utf8");
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    if (message.id === undefined) continue;
    if (message.method === "initialize") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-06-18", serverInfo: { name: "fixture", version: "1" } } }) + "\\n");
    } else if (message.method === "tools/list") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { tools: [] } }) + "\\n");
    }
  }
});
`;

/** A real child process that never answers anything — for exercising `defaultConnect`'s own
 *  connect-timeout race, as opposed to the adapter's per-request timeout. */
const NEVER_RESPONDS_SCRIPT = `setInterval(() => {}, 1000);`;

test("omitting `connect` uses the real defaultConnect — a genuine spawn + handshake against a real child process", async () => {
  const registry = fakeRegistry();
  const { messages, logger } = collectingLogger();

  const result = await attachFederatedMcpTools({
    registry,
    deps: fakeDeps().deps,
    logger,
    connections: [
      {
        config: { ...CONFIG, allowedToolNames: [] },
        launch: { command: process.execPath, args: ["-e", MINIMAL_MCP_SERVER_SCRIPT], env: {} },
      },
    ],
    // No `connect` — forces the production `defaultConnect`.
  });

  try {
    // The fixture advertises zero tools, so nothing is registered — the point of this test is that
    // the real spawn + JSON-RPC handshake completed at all, not the admission outcome.
    assert.deepEqual(result.registeredToolIds, []);
    assert.equal(
      messages.some((message) => message.includes("failed")),
      false,
      `a real handshake against a well-behaved server must not be reported as a failure; got: ${JSON.stringify(messages)}`,
    );
  } finally {
    // `attachFederatedMcpTools` hands live sessions back for the CALLER to close at shutdown (see
    // its own doc) — it never closes them itself. Leaving this open would leak the real child
    // process and its stdio pipes, which keeps the test runner's event loop alive indefinitely.
    await Promise.all(result.sessions.map((session) => session.close()));
  }
});

test("defaultConnect's own connect-timeout fires when the child never completes the handshake, and the child is killed", async () => {
  const registry = fakeRegistry();
  const { messages, logger } = collectingLogger();

  const result = await attachFederatedMcpTools({
    registry,
    deps: fakeDeps().deps,
    logger,
    connections: [
      {
        config: { ...CONFIG, connectTimeoutMs: 50 },
        launch: { command: process.execPath, args: ["-e", NEVER_RESPONDS_SCRIPT], env: {} },
      },
    ],
  });

  assert.deepEqual(result.registeredToolIds, []);
  assert.ok(
    messages.some((message) => message.includes("failed, continuing without its tools") && message.includes("connect timed out after 50ms")),
    `expected defaultConnect's own timeout message; got: ${JSON.stringify(messages)}`,
  );
});

test("defaultConnect: a launch command that does not exist fails the connection through the CHILD PROCESS's own error event, not a hang or an uncaught exception", async () => {
  const registry = fakeRegistry();
  const { messages, logger } = collectingLogger();

  const result = await attachFederatedMcpTools({
    registry,
    deps: fakeDeps().deps,
    logger,
    connections: [
      {
        config: CONFIG,
        launch: { command: "tovu-mcp-federation-test-nonexistent-binary-xyz", args: [], env: {} },
      },
    ],
  });

  assert.deepEqual(result.registeredToolIds, []);
  assert.ok(
    messages.some((message) => message.includes("failed, continuing without its tools") && message.includes("child process error")),
    `expected the spawn failure to be reported as a child process error, not silently swallowed or hung on; got: ${JSON.stringify(messages)}`,
  );
});

/** Same handshake as `MINIMAL_MCP_SERVER_SCRIPT`, plus writing to stderr before answering —
 *  `spawnMcpStdioChannel`'s own doc: "stderr is a diagnostic channel... consumed so the pipe cannot
 *  fill and deadlock the child." A server that emits diagnostic noise on stderr must not cause the
 *  handshake to fail, hang, or have that noise misinterpreted as protocol traffic. */
const SERVER_SCRIPT_WITH_STDERR_NOISE = `
process.stderr.write("some diagnostic banner the server prints on startup\\n");
${MINIMAL_MCP_SERVER_SCRIPT}
`;

test("defaultConnect: a real child writing to stderr does not fail, hang, or leak into the protocol stream", async () => {
  const registry = fakeRegistry();
  const { messages, logger } = collectingLogger();

  const result = await attachFederatedMcpTools({
    registry,
    deps: fakeDeps().deps,
    logger,
    connections: [
      {
        config: { ...CONFIG, allowedToolNames: [] },
        launch: { command: process.execPath, args: ["-e", SERVER_SCRIPT_WITH_STDERR_NOISE], env: {} },
      },
    ],
  });

  try {
    assert.deepEqual(result.registeredToolIds, []);
    assert.equal(
      messages.some((message) => message.includes("failed")),
      false,
      `stderr noise must not fail the handshake; got: ${JSON.stringify(messages)}`,
    );
  } finally {
    await Promise.all(result.sessions.map((session) => session.close()));
  }
});
