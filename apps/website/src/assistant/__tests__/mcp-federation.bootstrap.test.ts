import assert from "node:assert/strict";
import test from "node:test";

import type { ToolDescriptor, ToolRegistration, ToolRegistry } from "@jini-ai/core";

import { FEDERATED_CONNECTION_DEFAULTS, type ResolvedFederatedConnection } from "../mcp-federation/config.js";
import type { FederatedMcpConnectionConfig, McpHttpLaunchSpec, McpSessionPort } from "../mcp-federation/ports.js";

/**
 * @file `bootstrap.ts`'s `defaultConnect` — the production session factory `attachFederatedMcpTools`
 * falls back to when no `connect` override is injected — must give the HOSTED (HTTP) transport
 * `callTimeoutMs` as its per-request bound, the same as the stdio arm 25 lines below it.
 *
 * `adapter.http.ts`'s `requestTimeoutMs` is not a handshake-only bound: `McpHttpSession.send` (via
 * `postWithTimeout`) applies it to EVERY request the session ever makes, `initialize` included but
 * not exclusively — `callTool` uses the exact same field. So whatever `defaultConnect` hands it
 * becomes the ceiling on every hosted federated tool call for the life of the connection, not just
 * the handshake. Handing it `connectTimeoutMs` (15s) therefore silently caps every hosted tool call
 * at 15s and makes `callTimeoutMs` (30s) dead configuration on this transport — concretely, a
 * `sync:true` poll that legitimately takes ~25s can never finish. The stdio arm gets this right:
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
    "the hosted transport's per-request bound must be callTimeoutMs (30s) — connectTimeoutMs (15s) silently caps every hosted tool call and makes callTimeoutMs dead configuration on this transport",
  );
  assert.equal(result.registeredToolIds.length, 0, "no tools were allowlisted on this fixture — this test is only about the timeout wiring");
});
