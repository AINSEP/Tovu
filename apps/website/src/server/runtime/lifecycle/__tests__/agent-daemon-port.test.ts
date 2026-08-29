import assert from "node:assert/strict";
import test from "node:test";

import { createAgentDaemonOriginResolver } from "../agent-daemon-port.js";

/**
 * @file Regression coverage for the daemon startup + port-scoping fix (2026-08-28 dispatch).
 *
 * Two defects, one fix: (1) `cli/commands/serve.ts` never started the agent daemon at all, and (2)
 * every boot that left `JINI_AGENT_DAEMON_URL`/`JINI_AGENT_DAEMON_PORT` unset converged on the same
 * fixed port 4319 — a real, observed cross-instance hazard where one Tovu process's assistant proxy
 * silently targeted an unrelated instance's daemon. This file exercises the resolver in isolation
 * (each test builds its own instance via `createAgentDaemonOriginResolver`, so no state leaks
 * between tests); the daemon-spawn wiring itself is exercised by
 * `server/runtime/lifecycle/__tests__/daemon-supervisor.test.ts` and the end-to-end proxy behavior
 * by `server/__tests__/assistant-proxy-routes.test.ts`.
 *
 * Determinism is not correctness here: the load-bearing assertion is the INVARIANT that the proxy's
 * `getUrl()` and the daemon child's own `getPortForSpawnEnv()` agree on the exact same port — not
 * merely that each produces *some* value.
 */

async function withEnv(overrides: Record<string, string | undefined>, run: () => void | Promise<void>): Promise<void> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) previous[key] = process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("with neither env var set, ensure() self-allocates a port that is NOT the old fixed default 4319", async () => {
  await withEnv({ JINI_AGENT_DAEMON_URL: undefined, JINI_AGENT_DAEMON_PORT: undefined }, async () => {
    const resolver = createAgentDaemonOriginResolver();
    await resolver.ensure();

    const port = resolver.getPortForSpawnEnv();
    assert.notEqual(port, undefined, "expected a self-allocated port, not the URL-only 'no port to manage' shape");
    assert.notEqual(port, "4319", "a self-allocated port must never coincide with the old shared fixed default");
  });
});

test("the proxy's resolved URL and the daemon child's spawn-env port agree on the SAME self-allocated port", async () => {
  await withEnv({ JINI_AGENT_DAEMON_URL: undefined, JINI_AGENT_DAEMON_PORT: undefined }, async () => {
    const resolver = createAgentDaemonOriginResolver();
    await resolver.ensure();

    const port = resolver.getPortForSpawnEnv();
    assert.equal(resolver.getUrl(), `http://127.0.0.1:${port}`, "proxy target and spawned daemon must bind to the identical port");
  });
});

test("getUrl() throws with an actionable message when read before ensure() resolves a self-allocated port", async () => {
  await withEnv({ JINI_AGENT_DAEMON_URL: undefined, JINI_AGENT_DAEMON_PORT: undefined }, () => {
    const resolver = createAgentDaemonOriginResolver();

    assert.throws(
      () => resolver.getUrl(),
      { message: "agent daemon origin requested before ensure() resolved a self-allocated port — call ensure() before createApp()" },
      "must fail fast rather than resolve to an undefined-derived URL",
    );
  });
});

test("an explicit JINI_AGENT_DAEMON_PORT still wins outright — no self-allocation, no probe needed", async () => {
  await withEnv({ JINI_AGENT_DAEMON_URL: undefined, JINI_AGENT_DAEMON_PORT: "6421" }, () => {
    const resolver = createAgentDaemonOriginResolver();

    assert.equal(resolver.getUrl(), "http://127.0.0.1:6421", "the explicit port must be honored without calling ensure()");
    assert.equal(resolver.getPortForSpawnEnv(), "6421");
  });
});

test("an explicit JINI_AGENT_DAEMON_URL wins outright over JINI_AGENT_DAEMON_PORT, and reports no port to manage", async () => {
  await withEnv({ JINI_AGENT_DAEMON_URL: "http://127.0.0.1:9999", JINI_AGENT_DAEMON_PORT: "6421" }, () => {
    const resolver = createAgentDaemonOriginResolver();

    assert.equal(resolver.getUrl(), "http://127.0.0.1:9999");
    assert.equal(resolver.getPortForSpawnEnv(), undefined, "a URL-only config has no separate port for this process to inject into the child's env");
  });
});

test("ensure() is idempotent — a second call does not re-allocate a different port", async () => {
  await withEnv({ JINI_AGENT_DAEMON_URL: undefined, JINI_AGENT_DAEMON_PORT: undefined }, async () => {
    const resolver = createAgentDaemonOriginResolver();
    await resolver.ensure();
    const first = resolver.getPortForSpawnEnv();
    await resolver.ensure();
    const second = resolver.getPortForSpawnEnv();

    assert.equal(first, second, "re-resolving must not hand out a second, different port mid-boot");
  });
});
