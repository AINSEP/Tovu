import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolDescriptor, ToolRegistration, ToolRegistry } from "@jini-ai/core";

import { ForbiddenError } from "../../core/commands";
import { InMemoryMcpSession } from "../mcp-federation/adapter.memory";
import { attachFederatedMcpTools } from "../mcp-federation/bootstrap";
import { resolveSupabaseMcpConnection, SUPABASE_DEFAULT_ALLOWED_TOOLS, SUPABASE_MCP_PACKAGE } from "../mcp-federation/config";
import type { FederatedMcpConnectionConfig, RemoteToolDescriptor } from "../mcp-federation/ports";
import { buildFederatedMcpRegistrations, federateSession } from "../mcp-federation/registrations";
import { FEDERATED_ENTITY_TYPE, FEDERATED_TOOL_PERMISSION } from "../mcp-federation/trust";

/**
 * @file The federation wiring half: that an admitted remote tool becomes a real `ToolRegistration`,
 * that its handler runs Tovu's OWN authorization before anything crosses the network, that the
 * remote sees its own name rather than Tovu's namespaced id, that results come back inside the
 * untrusted envelope — plus the operator-facing config resolution and the fail-open bootstrap.
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
// Configuration (the site-owner-facing surface)
// ---------------------------------------------------------------------------

test("federation is off unless a site owner turns it on", () => {
  assert.equal(resolveSupabaseMcpConnection({}), null);
  assert.equal(resolveSupabaseMcpConnection({ TOVU_SUPABASE_MCP_ENABLED: "0" }), null);
  assert.equal(resolveSupabaseMcpConnection({ TOVU_SUPABASE_MCP_ENABLED: "false" }), null);
});

test("an enabled-but-incomplete configuration fails loudly instead of connecting to something broader", () => {
  assert.throws(
    () => resolveSupabaseMcpConnection({ TOVU_SUPABASE_MCP_ENABLED: "1" }),
    /requires a personal access token \(PAT\), not the project anon or service-role key/,
  );
  // project-ref is REQUIRED here though optional upstream, because omitting it upstream scopes the
  // PAT to the entire account.
  assert.throws(
    () => resolveSupabaseMcpConnection({ TOVU_SUPABASE_MCP_ENABLED: "1", TOVU_SUPABASE_MCP_ACCESS_TOKEN: "sbp_x" }),
    /TOVU_SUPABASE_MCP_PROJECT_REF/,
  );
  assert.throws(
    () =>
      resolveSupabaseMcpConnection({
        TOVU_SUPABASE_MCP_ENABLED: "1",
        TOVU_SUPABASE_MCP_ACCESS_TOKEN: "sbp_x",
        TOVU_SUPABASE_MCP_PROJECT_REF: "NOT A REF",
      }),
    /TOVU_SUPABASE_MCP_PROJECT_REF/,
  );
});

test("a valid configuration pins the package, forces --read-only, scopes to the project, and keeps the PAT out of argv", () => {
  const resolved = resolveSupabaseMcpConnection({
    TOVU_SUPABASE_MCP_ENABLED: "true",
    TOVU_SUPABASE_MCP_ACCESS_TOKEN: "sbp_secret_token",
    TOVU_SUPABASE_MCP_PROJECT_REF: "abcdefghijklmnop",
  });

  assert.ok(resolved);
  assert.equal(resolved.config.connectionId, "supabase");
  assert.deepEqual(resolved.config.allowedToolNames, SUPABASE_DEFAULT_ALLOWED_TOOLS);

  assert.equal(resolved.launch.command, "npx");
  assert.ok(resolved.launch.args.includes(SUPABASE_MCP_PACKAGE), "the package version must be pinned, not floating");
  assert.ok(resolved.launch.args.includes("--read-only"));
  assert.ok(resolved.launch.args.includes("--project-ref=abcdefghijklmnop"));

  // argv is world-readable via /proc/<pid>/cmdline and `ps`; the token must be in env only.
  assert.equal(resolved.launch.args.join(" ").includes("sbp_secret_token"), false);
  assert.deepEqual(resolved.launch.env, { SUPABASE_ACCESS_TOKEN: "sbp_secret_token" });
});

test("an operator can widen the allowlist explicitly, or empty it to disable every tool", () => {
  const base = {
    TOVU_SUPABASE_MCP_ENABLED: "1",
    TOVU_SUPABASE_MCP_ACCESS_TOKEN: "sbp_x",
    TOVU_SUPABASE_MCP_PROJECT_REF: "abcdefghijklmnop",
  };

  assert.deepEqual(resolveSupabaseMcpConnection({ ...base, TOVU_SUPABASE_MCP_ALLOWED_TOOLS: "list_tables, execute_sql" })?.config.allowedToolNames, [
    "list_tables",
    "execute_sql",
  ]);
  // Explicitly empty is distinguishable from unset, and means "nothing".
  assert.deepEqual(resolveSupabaseMcpConnection({ ...base, TOVU_SUPABASE_MCP_ALLOWED_TOOLS: "" })?.config.allowedToolNames, []);
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

test("an invalid-but-enabled configuration warns and continues rather than throwing out of boot", async () => {
  const registry = fakeRegistry();
  const { messages, logger } = collectingLogger();

  const result = await attachFederatedMcpTools({
    registry,
    deps: fakeDeps().deps,
    logger,
    env: { TOVU_SUPABASE_MCP_ENABLED: "1" },
  });

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
