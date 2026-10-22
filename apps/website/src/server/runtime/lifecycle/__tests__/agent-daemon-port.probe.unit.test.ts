import assert from "node:assert/strict";
import test from "node:test";

import { allocateFreePort, ensureAgentDaemonPortResolved, getAgentDaemonPortForSpawnEnv, getAgentDaemonUrl } from "../agent-daemon-port.js";

/** A hand-built probe socket: `listen` invokes its callback at once, `address`/`close` return the
 * scripted outcome. Lets the two failure arms of the real free-port probe run deterministically. */
function fakeProbe({ address, closeError }: { address: unknown; closeError?: Error }) {
  const events: string[] = [];
  const probe = {
    once: (event: string) => { events.push(`once:${event}`); return probe; },
    listen: (port: number, host: string, onListening: () => void) => { events.push(`listen:${port}:${host}`); onListening(); return probe; },
    address: () => address,
    close: (onClosed: (error?: Error) => void) => { events.push("close"); onClosed(closeError); return probe; },
  };
  return { events, createProbe: () => probe as never };
}

test("allocateFreePort resolves the port the OS-assigned address reports, after releasing the socket", async () => {
  const { events, createProbe } = fakeProbe({ address: { port: 45123, address: "127.0.0.1", family: "IPv4" } });
  assert.equal(await allocateFreePort({ createProbe }), 45123);
  assert.deepEqual(events, ["once:error", "listen:0:127.0.0.1", "close"]);
});

test("allocateFreePort rejects with the close error instead of handing out a port it could not release", async () => {
  const closeError = new Error("close failed");
  const { createProbe } = fakeProbe({ address: { port: 1 }, closeError });
  await assert.rejects(allocateFreePort({ createProbe }), closeError);
});

for (const address of [null, "/tmp/pipe.sock"]) {
  test(`allocateFreePort rejects when the listener reports no TCP address (${String(address)})`, async () => {
    const { createProbe } = fakeProbe({ address });
    await assert.rejects(allocateFreePort({ createProbe }), /agent daemon port allocation returned no usable address/);
  });
}

test("allocateFreePort's default probe binds a real ephemeral port", async () => {
  const port = await allocateFreePort();
  assert.equal(Number.isInteger(port) && port > 0 && port < 65536, true);
});

/** The module-level production resolver: with an explicit URL configured, ensure() never probes and
 * every reader returns the operator's origin (the URL form carries no port for the spawn env). */
test("production resolver honors JINI_AGENT_DAEMON_URL across ensure/getUrl/getPortForSpawnEnv", async () => {
  const previousUrl = process.env.JINI_AGENT_DAEMON_URL;
  process.env.JINI_AGENT_DAEMON_URL = "http://127.0.0.1:59999";
  try {
    await ensureAgentDaemonPortResolved();
    assert.equal(getAgentDaemonUrl(), "http://127.0.0.1:59999");
    assert.equal(getAgentDaemonPortForSpawnEnv(), undefined);
  } finally {
    if (previousUrl === undefined) delete process.env.JINI_AGENT_DAEMON_URL;
    else process.env.JINI_AGENT_DAEMON_URL = previousUrl;
  }
});
