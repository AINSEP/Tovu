import assert from "node:assert/strict";
import test from "node:test";

import { ensureAgentDaemonPortResolved, getAgentDaemonPortForSpawnEnv, getAgentDaemonUrl, refreshAgentDaemonPort } from "../agent-daemon-port.js";

// The resolver itself (explicit-origin precedence, self-allocation, the free-port probe) is
// covered in @jini-ai/sidecar's daemon-origin tests; this file proves the host's production wiring.

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

test("the first demand refreshes a missing daemon port and still prefers an explicit live origin", async () => {
  const { JINI_AGENT_DAEMON_URL: oldUrl, JINI_AGENT_DAEMON_PORT: oldPort } = process.env;
  try {
    delete process.env.JINI_AGENT_DAEMON_URL;
    delete process.env.JINI_AGENT_DAEMON_PORT;
    assert.equal(getAgentDaemonPortForSpawnEnv(), undefined);
    await refreshAgentDaemonPort();
    const selected = getAgentDaemonPortForSpawnEnv();
    assert.match(selected ?? "", /^\d+$/);
    assert.ok(Number(selected) >= 1 && Number(selected) <= 65535);
    assert.equal(getAgentDaemonUrl(), `http://127.0.0.1:${selected}`);

    process.env.JINI_AGENT_DAEMON_PORT = "65536";
    await assert.rejects(refreshAgentDaemonPort(), { message: "JINI_AGENT_DAEMON_PORT must be an integer from 1 to 65535" });
    process.env.JINI_AGENT_DAEMON_URL = "http://127.0.0.1:4509";
    await refreshAgentDaemonPort();
    assert.equal(getAgentDaemonUrl(), "http://127.0.0.1:4509");
    assert.equal(getAgentDaemonPortForSpawnEnv(), undefined);

    delete process.env.JINI_AGENT_DAEMON_URL;
    delete process.env.JINI_AGENT_DAEMON_PORT;
    assert.equal(getAgentDaemonPortForSpawnEnv(), selected, "the explicit override did not replace the cached self-chosen port");
  } finally {
    if (oldUrl === undefined) delete process.env.JINI_AGENT_DAEMON_URL;
    else process.env.JINI_AGENT_DAEMON_URL = oldUrl;
    if (oldPort === undefined) delete process.env.JINI_AGENT_DAEMON_PORT;
    else process.env.JINI_AGENT_DAEMON_PORT = oldPort;
  }
});
