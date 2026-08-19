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
 * `waitForAgentDaemon` itself is deliberately NOT covered here — it memoizes its own promise at
 * module scope by design ("the daemon boots once per webServer"), which makes repeated calls
 * within one test process return a stale cached result rather than exercising fresh state. This
 * function has no such memoization, so it is the right unit to pin directly.
 */

async function startStandInReadyz(body: unknown, status = 200): Promise<{ port: number; server: Server }> {
  const server = createServer((_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
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
