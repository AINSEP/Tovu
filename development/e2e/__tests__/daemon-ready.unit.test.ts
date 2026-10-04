import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { isDaemonKnownFailed } from "../daemon-ready.js";

/**
 * @file Degraded-boot defect fix, e2e half — unit coverage for `daemon-ready.ts`'s new
 * `isDaemonKnownFailed`, the decision function `waitForAgentDaemon`'s poll loop now checks BEFORE
 * trusting a bare TCP connect (see that file's own module doc for why a connect alone is not
 * sufficient: a leaked port can still be squatted by an orphaned daemon from a previous run).
 *
 * The poll-loop test imports an isolated module instance so its memoized readiness promise cannot
 * reuse another test's result, and gives it a listening port whose boot is explicitly known failed.
 */

async function startStandInReadyz(body: unknown, status = 200): Promise<{ port: number; server: Server }> {
  const server = createServer((req, res) => {
    if (req.method !== "GET" || req.url !== "/readyz") {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(status, { "content-type": "application/json" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { port: (server.address() as AddressInfo).port, server };
}

test("isDaemonKnownFailed is true when /readyz reports assistantDaemonKnownFailed: true", async (t) => {
  const { port, server } = await startStandInReadyz({ ready: true, assistantDaemonKnownFailed: true });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  assert.equal(await isDaemonKnownFailed(port), true);
});

test("isDaemonKnownFailed is false when /readyz omits the field (the common, healthy case)", async (t) => {
  const { port, server } = await startStandInReadyz({ ready: true });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  assert.equal(await isDaemonKnownFailed(port), false);
});

test("isDaemonKnownFailed is false, not thrown, when the app port isn't answering yet — normal early in boot", async () => {
  // Nothing is listening on this port (chosen by binding to :0 above then closing immediately) —
  // this must resolve `false`, exactly like the caller's own ECONNREFUSED handling elsewhere in
  // this repo, not reject and abort the whole poll loop.
  const { port, server } = await startStandInReadyz({});
  await new Promise<void>((resolve) => server.close(() => resolve()));

  assert.equal(await isDaemonKnownFailed(port), false);
});

test("isDaemonKnownFailed is false for a truthy-but-not-literally-true value — no coercion", async (t) => {
  const { port, server } = await startStandInReadyz({ ready: true, assistantDaemonKnownFailed: "true" });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  assert.equal(await isDaemonKnownFailed(port), false);
});

test("isDaemonKnownFailed reads a known-failed flag from a 503 readiness response", async (t) => {
  const { port, server } = await startStandInReadyz({ ready: false, assistantDaemonKnownFailed: true }, 503);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  assert.equal(await isDaemonKnownFailed(port), true);
});

test("isDaemonKnownFailed tolerates a non-JSON readiness response", async (t) => {
  const { port, server } = await startStandInReadyz("not JSON", 503);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  assert.equal(await isDaemonKnownFailed(port), false);
});

test("waitForAgentDaemon rejects a known-failed boot even when its port accepts connections", async (t) => {
  const { port, server } = await startStandInReadyz({ assistantDaemonKnownFailed: true }, 503);
  const previousApi = process.env.E2E_API_PORT;
  const previousDaemon = process.env.E2E_AGENT_DAEMON_PORT;
  process.env.E2E_API_PORT = String(port);
  process.env.E2E_AGENT_DAEMON_PORT = String(port);
  t.after(async () => {
    if (previousApi === undefined) delete process.env.E2E_API_PORT;
    else process.env.E2E_API_PORT = previousApi;
    if (previousDaemon === undefined) delete process.env.E2E_AGENT_DAEMON_PORT;
    else process.env.E2E_AGENT_DAEMON_PORT = previousDaemon;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  // A fresh module owns its memoized readiness promise; sibling calls cannot satisfy this test.
  const moduleUrl = new URL("../daemon-ready.ts?known-failed-boot", import.meta.url);
  const { waitForAgentDaemon } = await import(moduleUrl.href);
  await assert.rejects(waitForAgentDaemon({ timeoutMs: 2_000, pollMs: 10 }), /KNOWN to have failed/);
});
