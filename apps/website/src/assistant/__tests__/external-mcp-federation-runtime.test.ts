import assert from "node:assert/strict";
import test from "node:test";

import type { ToolDescriptor, ToolRegistration, ToolRegistry } from "@jini-ai/core";

import { createFederationRuntime } from "../external-mcp-federation-runtime.js";
import type { AttachFederatedMcpToolsParams, AttachFederatedToolsResult } from "../mcp-federation/bootstrap.js";
import { InMemoryMcpSession } from "../mcp-federation/adapter.memory.js";
import { FEDERATED_CONNECTION_DEFAULTS, type ResolvedFederatedConnection } from "../mcp-federation/config.js";
import type { FederatedMcpConnectionConfig, McpHttpLaunchSpec } from "../mcp-federation/ports.js";
import type { FederationDeps } from "../mcp-federation/registrations.js";

/**
 * @file `external-mcp-federation-runtime.ts` — the one federation runtime both the daemon (S3) and
 * BYOK (S5) will build from, per
 * `ADS-memory/.local-artifacts/design-byok-external-mcp-2026-09-24.md` §2.1 item 2 (S1). `attach` is
 * injected exactly the way `mcp-federation.bootstrap.test.ts` and `mcp-federation.reload.test.ts`
 * inject it, so every assertion here is about THIS module's own start/reload sequencing and cached
 * accounting, never about a real handshake — except the one test (below) that deliberately uses the
 * real `attachFederatedMcpTools` to prove the logger prefix this runtime threads through is
 * byte-identical to what the daemon printed before this file existed.
 */

const FEDERATION_DEPS: FederationDeps = {
  authorize: async () => ({ allowed: true, reason: "matched" }),
  workspaceId: "ws-federation-runtime",
};

function connection(connectionId: string): ResolvedFederatedConnection {
  const config: FederatedMcpConnectionConfig = {
    connectionId,
    label: connectionId,
    allowedToolNames: [],
    writeAllowedToolNames: [],
    connectTimeoutMs: FEDERATED_CONNECTION_DEFAULTS.connectTimeoutMs,
    callTimeoutMs: FEDERATED_CONNECTION_DEFAULTS.callTimeoutMs,
    maxResultBytes: FEDERATED_CONNECTION_DEFAULTS.maxResultBytes,
    maxTools: FEDERATED_CONNECTION_DEFAULTS.maxTools,
  };
  const launch: McpHttpLaunchSpec = { url: `https://example.invalid/${connectionId}`, headers: {} };
  return { config, launch };
}

function fakeRegistry(): ToolRegistry & { registered: ToolRegistration[] } {
  const registered: ToolRegistration[] = [];
  const descriptors: ToolDescriptor[] = [];
  return {
    registered,
    register(registration) {
      if (descriptors.some((d) => d.id === registration.descriptor.id)) {
        throw new Error(`ToolRegistry: tool "${registration.descriptor.id}" is already registered`);
      }
      registered.push(registration);
      descriptors.push(registration.descriptor);
    },
    has: (toolId: string) => descriptors.some((descriptor) => descriptor.id === toolId),
    list: () => descriptors,
  };
}

/** Deterministic pause point, matching `mcp-federation.reload.test.ts`'s own helper — no real timer,
 *  so ordering assertions are about the code under test, not about scheduling luck. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Admits every connection handed to it with an empty report — except `"x"`, which comes back with
 *  one `allowlistedButAbsent` drift item, so a reload that admits `"x"` is provably the reload that
 *  makes `refusalPrefix()` change. */
async function admitAllWithDriftOnX(params: AttachFederatedMcpToolsParams): Promise<AttachFederatedToolsResult> {
  const reports = (params.extraConnections ?? []).map((c) => ({
    connectionId: c.config.connectionId,
    report: {
      admitted: [],
      refused: [],
      allowlistedButAbsent: c.config.connectionId === "x" ? ["ghost_tool"] : [],
      writeAllowedButNotAllowlisted: [],
    },
    isPreset: false,
  }));
  return { registeredToolIds: [], sessions: [], reports };
}

test("reload() before start() never reads the roster and resolves an empty result", async () => {
  let resolveCalls = 0;
  const runtime = createFederationRuntime({
    registry: fakeRegistry(),
    deps: FEDERATION_DEPS,
    resolveConnections: async () => {
      resolveCalls += 1;
      return [];
    },
    log: "[test]",
  });

  const result = await runtime.reload();

  assert.deepEqual(result, { newlyAdmittedConnectionIds: [], reports: [] });
  assert.equal(resolveCalls, 0, "reload() must not read the roster when start() was never called");
});

test("start() called twice calls attach exactly once — single-flight and idempotent", async () => {
  let attachCalls = 0;
  const runtime = createFederationRuntime({
    registry: fakeRegistry(),
    deps: FEDERATION_DEPS,
    resolveConnections: async () => [],
    log: "[test]",
    attach: async (params) => {
      attachCalls += 1;
      return admitAllWithDriftOnX(params);
    },
  });

  await runtime.start();
  await runtime.start();

  assert.equal(attachCalls, 1);
  assert.equal(runtime.started, true);
});

test("start() awaits `after` before calling attach", async () => {
  const order: string[] = [];
  const afterGate = deferred<void>();

  const runtime = createFederationRuntime({
    registry: fakeRegistry(),
    deps: FEDERATION_DEPS,
    resolveConnections: async () => [],
    after: afterGate.promise.then(() => {
      order.push("after");
    }),
    log: "[test]",
    attach: async (params) => {
      order.push("attach");
      return admitAllWithDriftOnX(params);
    },
  });

  const startPromise = runtime.start();
  afterGate.resolve();
  await startPromise;

  assert.deepEqual(order, ["after", "attach"]);
});

test("a reload that admits a new connection calls onAdmitted once and recomputes refusalPrefix()", async () => {
  const registry = fakeRegistry();
  let onAdmittedCalls = 0;
  let lastResult: unknown;
  const roster: ResolvedFederatedConnection[] = [];

  const runtime = createFederationRuntime({
    registry,
    deps: FEDERATION_DEPS,
    resolveConnections: async () => [...roster],
    log: "[test]",
    onAdmitted: (result) => {
      onAdmittedCalls += 1;
      lastResult = result;
    },
    attach: admitAllWithDriftOnX,
  });

  await runtime.start();
  const prefixBeforeReload = runtime.refusalPrefix();
  assert.equal(prefixBeforeReload, "", "an empty boot roster reports nothing to withhold");

  roster.push(connection("x"));
  const result = await runtime.reload();

  assert.equal(onAdmittedCalls, 1);
  assert.deepEqual(lastResult, result);
  assert.deepEqual(result.newlyAdmittedConnectionIds, ["x"]);
  assert.notEqual(runtime.refusalPrefix(), prefixBeforeReload, "refusalPrefix() must be recomputed after a non-empty reload");
  assert.ok(runtime.refusalPrefix().includes("'ghost_tool'"), "the new report's drift item must be reflected in the recomputed prefix");
});

test("a no-op reload (nothing new in the roster) never calls onAdmitted", async () => {
  const runtime = createFederationRuntime({
    registry: fakeRegistry(),
    deps: FEDERATION_DEPS,
    resolveConnections: async () => [],
    log: "[test]",
    onAdmitted: () => {
      throw new Error("onAdmitted must not be called for a no-op reload");
    },
    attach: admitAllWithDriftOnX,
  });

  await runtime.start();
  const result = await runtime.reload();

  assert.deepEqual(result, { newlyAdmittedConnectionIds: [], reports: [] });
});

test("the logger prints the daemon's exact byte-identical line, prefixed with the caller's own log tag", async (t) => {
  const logLines: string[] = [];
  t.mock.method(console, "log", (...args: unknown[]) => {
    logLines.push(args.map(String).join(" "));
  });

  const runtime = createFederationRuntime({
    registry: fakeRegistry(),
    deps: FEDERATION_DEPS,
    resolveConnections: async () => [connection("x")],
    log: "[assistant-byok]",
    // No `attach` override — the real `attachFederatedMcpTools` runs, so this proves the runtime's
    // own logger wrapping, not a test double's wording.
    connect: async () => new InMemoryMcpSession({ tools: [] }),
  });

  await runtime.start();

  assert.ok(
    logLines.includes("[assistant-byok] mcp-federation: 'x' registered 0 federated tool(s): (none)"),
    `expected the exact log line; got: ${JSON.stringify(logLines)}`,
  );
});
