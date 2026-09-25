import assert from "node:assert/strict";
import test from "node:test";

import type { ToolDescriptor, ToolRegistration, ToolRegistry } from "@jini-ai/core";

import { FEDERATED_CONNECTION_DEFAULTS, type ResolvedFederatedConnection } from "../mcp-federation/config.js";
import type {
  FederatedCallTarget,
  FederatedMcpConnectionConfig,
  McpHttpLaunchSpec,
  McpSessionPort,
  McpStdioChannel,
  McpStdioLaunchSpec,
} from "../mcp-federation/ports.js";
import { McpLaunchUnavailableError, type McpStdioLaunchResolver, type ResolvedStdioLaunch } from "../mcp-federation/stdio-launch-resolver.js";

/**
 * @file `bootstrap.ts`'s `defaultConnect` — the production session factory `attachFederatedMcpTools`
 * falls back to when no `connect` override is injected — must give the HOSTED (HTTP) transport
 * `callTimeoutMs` as its per-request bound, the same as the stdio arm 25 lines below it.
 *
 * `adapter.http.ts`'s `requestTimeoutMs` is not a handshake-only bound: `McpHttpSession.send` (via
 * `postWithTimeout`) applies it to EVERY request the session ever makes, `initialize` included but
 * not exclusively — `callTool` uses the exact same field. So whatever `defaultConnect` hands it
 * becomes the ceiling on every hosted federated tool call for the life of the connection, not just
 * the handshake. Handing it `connectTimeoutMs` (60s as of 2026-09-25, owner decision — was 15s)
 * instead of `callTimeoutMs` (30s) would therefore make `callTimeoutMs` dead configuration on this
 * transport regardless of which of the two is numerically larger — concretely, a `sync:true` poll
 * that legitimately takes ~45s would incorrectly succeed under this bug (bounded by 60s) instead of
 * correctly timing out at the configured 30s. The stdio arm gets this right:
 * `connectMcpStdioSession` is handed `callTimeoutMs` as its `requestTimeoutMs`, and
 * `connectTimeoutMs` bounds only the outer `spawn` race that has nothing to do with any one request.
 *
 * `defaultConnect` is private and not injectable (unlike `attachFederatedMcpTools`'s own `connect`
 * parameter, which every OTHER test in this subtree uses instead), so this exercises it the only way
 * available without a live remote: mock `adapter.http.ts`'s exported `connectMcpHttpSession` — the
 * one call `defaultConnect` makes — via `--experimental-test-module-mocks`, and assert what it was
 * constructed with. Same technique, same ordering requirement (the mock must be registered before
 * anything else in this process imports the module), as
 * `server/inbound/admin-http/routes/assistant/__tests__/test-agent-mock-module.test.ts`.
 */

const WORKSPACE_ID = "ws-timeouts";

const CONFIG: FederatedMcpConnectionConfig = {
  connectionId: "hosted-vendor",
  label: "Hosted Vendor",
  allowedToolNames: [],
  writeAllowedToolNames: [],
  connectTimeoutMs: FEDERATED_CONNECTION_DEFAULTS.connectTimeoutMs,
  callTimeoutMs: FEDERATED_CONNECTION_DEFAULTS.callTimeoutMs,
  maxResultBytes: FEDERATED_CONNECTION_DEFAULTS.maxResultBytes,
  maxTools: FEDERATED_CONNECTION_DEFAULTS.maxTools,
};

const HTTP_LAUNCH: McpHttpLaunchSpec = { url: "https://example.invalid/mcp", headers: {} };

const HTTP_CONNECTION: ResolvedFederatedConnection = { config: CONFIG, launch: HTTP_LAUNCH };

function fakeSession(): McpSessionPort {
  return {
    listTools: async () => [],
    callTool: async () => ({ content: [] }),
    close: async () => undefined,
  };
}

function fakeRegistry(): ToolRegistry & { registered: ToolRegistration[] } {
  const registered: ToolRegistration[] = [];
  const descriptors: ToolDescriptor[] = [];
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

test("defaultConnect hands the hosted transport callTimeoutMs as its per-request bound, matching the stdio arm — not connectTimeoutMs", async (t) => {
  const seenRequestTimeouts: number[] = [];

  // Loading the real module first and spreading it (rather than a bare `{ connectMcpHttpSession }`)
  // keeps `createFetchMcpHttpExchange` and every other export real for anything else in this process
  // that needs them — see the identical rationale in `test-agent-mock-module.test.ts`. This import is
  // also what makes the mock registration below the module's first-ever load in this process.
  const real = await import("../mcp-federation/adapter.http.js");
  t.mock.module("../mcp-federation/adapter.http.js", {
    namedExports: {
      ...real,
      connectMcpHttpSession: async (deps: { requestTimeoutMs: number }) => {
        seenRequestTimeouts.push(deps.requestTimeoutMs);
        return fakeSession();
      },
    },
  });

  const { attachFederatedMcpTools } = await import("../mcp-federation/bootstrap.js");

  const registry = fakeRegistry();
  const authorize = async () => ({ allowed: true, reason: "matched" });

  const result = await attachFederatedMcpTools({
    registry,
    deps: { authorize, workspaceId: WORKSPACE_ID },
    connections: [HTTP_CONNECTION],
    env: {},
  });

  assert.equal(seenRequestTimeouts.length, 1, "defaultConnect should call connectMcpHttpSession exactly once for one hosted connection");
  assert.equal(
    seenRequestTimeouts[0],
    CONFIG.callTimeoutMs,
    "the hosted transport's per-request bound must be callTimeoutMs (30s) — connectTimeoutMs (60s) must not be substituted for it, which would make callTimeoutMs dead configuration on this transport",
  );
  assert.equal(result.registeredToolIds.length, 0, "no tools were allowlisted on this fixture — this test is only about the timeout wiring");
});

test("attachFederatedMcpTools stamps preset connections with a preset origin, for external-mcp-revocation.ts's roster/preset split", async () => {
  const { attachFederatedMcpTools } = await import("../mcp-federation/bootstrap.js");
  const seenOrigins: (FederatedCallTarget["origin"] | undefined)[] = [];
  const config: FederatedMcpConnectionConfig = { ...CONFIG, allowedToolNames: ["ping"] };
  const registry = fakeRegistry();

  await attachFederatedMcpTools({
    registry,
    deps: {
      authorize: async () => ({ allowed: true, reason: "matched" }),
      workspaceId: WORKSPACE_ID,
      assertConnectionUsable: (_connectionId: string, call: FederatedCallTarget) => {
        seenOrigins.push(call.origin);
      },
    },
    connections: [{ config, launch: HTTP_LAUNCH }],
    connect: async () => ({
      listTools: async () => [{ name: "ping", inputSchema: { type: "object" } }],
      callTool: async () => ({ content: [] }),
      close: async () => undefined,
    }),
  });

  assert.equal(registry.registered.length, 1, "the fixture's one allowlisted tool should have registered");
  await registry.registered[0]?.handler({
    executionId: "exec-1",
    principal: { id: "p1" },
    run: { id: "run-1" },
    input: {},
    signal: new AbortController().signal,
  });

  assert.deepEqual(seenOrigins, [{ kind: "preset" }]);
});

// ---------------------------------------------------------------------------
// `createDefaultConnect` — S2 of the desktop-npx plan: `resolveFederationAttachInputs`'s default
// `connect` now runs every stdio launch through an injected `McpStdioLaunchResolver` BEFORE
// spawning anything. A resolver that throws `McpLaunchUnavailableError` (the desktop resolver's
// contract for "uvx"/"docker"/an unresolvable bare command, per `stdio-launch-resolver.ts`) must
// become this connection's own connect failure — logged and stepped over by the existing fail-open
// loop in `attachOneFederatedConnection`, exactly like a real spawn failure — and must never reach
// `spawnMcpStdioChannel` at all. `createDefaultConnect` is exported for exactly this: a fake
// `spawnChannel` lets this be asserted without a real child process.
// ---------------------------------------------------------------------------

function collectingLogger() {
  const messages: string[] = [];
  return { messages, logger: { info: (m: string) => messages.push(`info:${m}`), warn: (m: string) => messages.push(`warn:${m}`) } };
}

const UVX_UNAVAILABLE_MESSAGE =
  'This server needs "uvx" (from uv), which isn\'t installed on this computer. Tovu includes ' +
  "Node.js (node, npm, npx) but not uv. Install uv from https://docs.astral.sh/uv/ and restart Tovu.";

const UVX_LAUNCH: McpStdioLaunchSpec = { command: "uvx", args: ["some-package"], env: {} };

const UVX_CONFIG: FederatedMcpConnectionConfig = { ...CONFIG, connectionId: "uvx-vendor", allowedToolNames: [] };
const OK_CONFIG: FederatedMcpConnectionConfig = { ...CONFIG, connectionId: "ok-vendor", allowedToolNames: ["ping"] };

test("createDefaultConnect: a stdioLaunchResolver that throws McpLaunchUnavailableError prevents any spawn and is reported through logger.warn", async () => {
  const { attachFederatedMcpTools, createDefaultConnect } = await import("../mcp-federation/bootstrap.js");

  let spawnCalls = 0;
  const throwingResolver: McpStdioLaunchResolver = {
    resolve(): ResolvedStdioLaunch {
      throw new McpLaunchUnavailableError(UVX_UNAVAILABLE_MESSAGE);
    },
  };
  const fakeSpawnChannel = (): McpStdioChannel => {
    spawnCalls += 1;
    throw new Error("spawnChannel must not be called — the resolver must throw before any spawn");
  };
  const uvxConnect = createDefaultConnect(throwingResolver, fakeSpawnChannel);

  const okSession: McpSessionPort = {
    listTools: async () => [{ name: "ping", inputSchema: { type: "object", properties: {} } }],
    callTool: async () => ({ content: [] }),
    close: async () => undefined,
  };

  const { messages, logger } = collectingLogger();
  const registry = fakeRegistry();

  const result = await attachFederatedMcpTools({
    registry,
    deps: { authorize: async () => ({ allowed: true, reason: "matched" }), workspaceId: WORKSPACE_ID },
    connections: [
      { config: UVX_CONFIG, launch: UVX_LAUNCH },
      { config: OK_CONFIG, launch: HTTP_LAUNCH },
    ],
    logger,
    // A single dispatcher standing in for `resolveFederationAttachInputs`'s own default: the uvx
    // connection goes through the real `createDefaultConnect` + resolver + fake spawnChannel wiring
    // under test; the other connection just proves one connection's resolver failure does not stop
    // the loop from reaching the next one (the existing fail-open behaviour, unaffected by S2).
    connect: async (connection) => (connection.config.connectionId === UVX_CONFIG.connectionId ? uvxConnect(connection) : okSession),
  });

  assert.equal(spawnCalls, 0, "the resolver's throw must prevent any spawn from ever happening");
  assert.ok(
    messages.some((message) => message === `warn:mcp-federation: '${UVX_CONFIG.connectionId}' failed, continuing without its tools — ${UVX_UNAVAILABLE_MESSAGE}`),
    `expected logger.warn to receive the resolver's exact message; got ${JSON.stringify(messages)}`,
  );
  assert.equal(registry.registered.length, 1, "the other connection must still attach and register its tool");
  assert.deepEqual(result.registeredToolIds, ["mcp__ok-vendor__ping"]);
  // 2026-09-24: a connect failure used to be reported ONLY through `logger.warn` — invisible to
  // anything reading `attachFederatedMcpTools`'s own return value, which is what `GET
  // /api/federation/admissions` and its admin proxy actually serve. `connectFailures` is the fix:
  // the exact same reason `logger.warn` printed, now also on the result an operator-facing caller
  // can read.
  assert.deepEqual(result.connectFailures, [{ connectionId: UVX_CONFIG.connectionId, reason: UVX_UNAVAILABLE_MESSAGE }]);
  assert.deepEqual(
    result.reports.map((entry) => entry.connectionId),
    ["ok-vendor"],
    "the failed connection must still contribute no report entry — connectFailures is a SEPARATE list, not a synthetic report",
  );
});

test("a connect timeout produces a human-readable connectFailures entry with no report entry, for the connection admin admissions must surface", async () => {
  const { attachFederatedMcpTools } = await import("../mcp-federation/bootstrap.js");
  const registry = fakeRegistry();
  const timeoutMessage = "connect timed out after 15000ms";

  const result = await attachFederatedMcpTools({
    registry,
    deps: { authorize: async () => ({ allowed: true, reason: "matched" }), workspaceId: WORKSPACE_ID },
    connections: [{ config: { ...CONFIG, connectionId: "namecom" }, launch: HTTP_LAUNCH }],
    connect: async () => {
      throw new Error(timeoutMessage);
    },
  });

  assert.deepEqual(result.reports, []);
  assert.deepEqual(result.connectFailures, [{ connectionId: "namecom", reason: timeoutMessage }]);
});
