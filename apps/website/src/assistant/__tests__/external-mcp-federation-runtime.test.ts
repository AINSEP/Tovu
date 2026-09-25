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
  return { registeredToolIds: [], sessions: [], reports, connectFailures: [] };
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

  assert.deepEqual(result, { newlyAdmittedConnectionIds: [], reports: [], connectFailures: [] });
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

  assert.deepEqual(result, { newlyAdmittedConnectionIds: [], reports: [], connectFailures: [] });
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

test("a reload merges its reports onto the boot pass's and never re-admits a boot connection", async () => {
  const roster: ResolvedFederatedConnection[] = [connection("a")];
  const runtime = createFederationRuntime({
    registry: fakeRegistry(),
    deps: FEDERATION_DEPS,
    resolveConnections: async () => [...roster],
    log: "[test]",
    attach: admitAllWithDriftOnX,
  });

  await runtime.start();
  roster.push(connection("x"));
  const result = await runtime.reload();

  assert.deepEqual(result.newlyAdmittedConnectionIds, ["x"], "the boot connection 'a' must seed the coordinator, not be re-admitted");
  assert.deepEqual(
    runtime.reports().map((entry) => entry.connectionId),
    ["a", "x"],
    "reports() must keep the boot pass's reports alongside the reload's",
  );
});

test("reload() called while start() is in flight waits for the boot pass before settling", async () => {
  const order: string[] = [];
  const afterGate = deferred<void>();
  const runtime = createFederationRuntime({
    registry: fakeRegistry(),
    deps: FEDERATION_DEPS,
    resolveConnections: async () => [],
    after: afterGate.promise,
    log: "[test]",
    attach: admitAllWithDriftOnX,
  });

  const startPromise = runtime.start().then(() => order.push("start"));
  const reloadPromise = runtime.reload().then(() => order.push("reload"));
  afterGate.resolve();
  await Promise.all([startPromise, reloadPromise]);

  assert.deepEqual(order, ["start", "reload"]);
});

test("the logger prefixes warnings with the caller's own log tag too", async (t) => {
  const warnLines: string[] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => {
    warnLines.push(args.map(String).join(" "));
  });
  t.mock.method(console, "log", () => {});

  const runtime = createFederationRuntime({
    registry: fakeRegistry(),
    deps: FEDERATION_DEPS,
    resolveConnections: async () => [connection("x")],
    log: "[assistant-byok]",
    connect: async () => {
      throw new Error("boom");
    },
  });

  await runtime.start();

  assert.ok(
    warnLines.includes("[assistant-byok] mcp-federation: 'x' failed, continuing without its tools — boom"),
    `expected the exact warn line; got: ${JSON.stringify(warnLines)}`,
  );
});

// ---------------------------------------------------------------------------
// connectFailures() (2026-09-24) — a connection that never reached admission must still be visible
// somewhere other than this process's own stderr; see `bootstrap.ts`'s `AttachFederatedToolsResult
// .connectFailures` and `agent-daemon-server.ts`'s merge into `GET /api/federation/admissions`'s
// `configFailures`.
// ---------------------------------------------------------------------------

test("a connect failure at boot is reported by connectFailures(), with reports() left untouched", async () => {
  const runtime = createFederationRuntime({
    registry: fakeRegistry(),
    deps: FEDERATION_DEPS,
    resolveConnections: async () => [connection("x")],
    log: "[test]",
    connect: async () => {
      throw new Error("connect timed out after 15000ms");
    },
  });

  await runtime.start();

  assert.deepEqual(runtime.connectFailures(), [{ connectionId: "x", reason: "connect timed out after 15000ms" }]);
  assert.deepEqual(runtime.reports(), [], "a connection that never reached admission must not gain a synthetic report entry");
});

/** Admits every connection EXCEPT those in `failIds`, which come back as a connect failure with a
 *  fixed reason — the connect-failure sibling of `admitAllWithDriftOnX` above. Needed (rather than
 *  the runtime's own `connect` override) because `connect` is a BOOT-pass-only seam — a reload pass
 *  never overrides it (`mcp-federation/reload.ts`'s `runOnePass`) — while `attach` applies to both. */
function attachFailing(failIds: ReadonlySet<string>) {
  return async (params: AttachFederatedMcpToolsParams): Promise<AttachFederatedToolsResult> => {
    const reports: AttachFederatedToolsResult["reports"] = [];
    const connectFailures: AttachFederatedToolsResult["connectFailures"] = [];
    for (const c of params.extraConnections ?? []) {
      if (failIds.has(c.config.connectionId)) {
        connectFailures.push({ connectionId: c.config.connectionId, reason: "boom" });
        continue;
      }
      params.registry.register({
        descriptor: { id: `mcp__${c.config.connectionId}__tool` },
        handler: async () => "ok",
        policy: { authorize: async () => "allow" as const },
      });
      reports.push({
        connectionId: c.config.connectionId,
        report: { admitted: [], refused: [], allowlistedButAbsent: [], writeAllowedButNotAllowlisted: [] },
        isPreset: false,
      });
    }
    return { registeredToolIds: reports.map((r) => `mcp__${r.connectionId}__tool`), sessions: [], reports, connectFailures };
  };
}

test("a reload's own connect failure is merged onto connectFailures() even though nothing was newly admitted", async () => {
  const roster: ResolvedFederatedConnection[] = [];
  const runtime = createFederationRuntime({
    registry: fakeRegistry(),
    deps: FEDERATION_DEPS,
    resolveConnections: async () => [...roster],
    log: "[test]",
    attach: attachFailing(new Set(["y"])),
  });

  await runtime.start();
  assert.deepEqual(runtime.connectFailures(), []);

  roster.push(connection("y"));
  const result = await runtime.reload();

  assert.deepEqual(result.newlyAdmittedConnectionIds, [], "a connection whose connect failed was never admitted");
  assert.deepEqual(result.connectFailures, [{ connectionId: "y", reason: "boom" }]);
  assert.deepEqual(runtime.connectFailures(), [{ connectionId: "y", reason: "boom" }], "the reload's own connect failure must be merged onto the live accessor");
});

test("a connection that failed at boot and then admits on a reload is no longer listed in connectFailures()", async () => {
  const failIds = new Set(["y"]);
  const runtime = createFederationRuntime({
    registry: fakeRegistry(),
    deps: FEDERATION_DEPS,
    resolveConnections: async () => [connection("y")],
    log: "[test]",
    attach: attachFailing(failIds),
  });

  await runtime.start();
  assert.deepEqual(runtime.connectFailures(), [{ connectionId: "y", reason: "boom" }]);

  failIds.delete("y");
  const result = await runtime.reload();

  assert.deepEqual(result.newlyAdmittedConnectionIds, ["y"]);
  // A stale entry would put "y" in BOTH `connections` and `configFailures` on the admissions wire
  // (documented as disjoint), and let the BYOK diagnosis blame a connect failure that no longer holds.
  assert.deepEqual(runtime.connectFailures(), [], "an admitted connection must not keep its old connect failure");
});

test("a connection that fails again on every reload is listed once, with its latest reason", async () => {
  const runtime = createFederationRuntime({
    registry: fakeRegistry(),
    deps: FEDERATION_DEPS,
    resolveConnections: async () => [connection("y")],
    log: "[test]",
    attach: attachFailing(new Set(["y"])),
  });

  await runtime.start();
  await runtime.reload();
  await runtime.reload();

  assert.deepEqual(runtime.connectFailures(), [{ connectionId: "y", reason: "boom" }], "repeated failures must replace, not accumulate");
});
