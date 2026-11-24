import assert from "node:assert/strict";
import test from "node:test";

import { ensureAgentDaemonPortResolved, getAgentDaemonPortForSpawnEnv, getAgentDaemonUrl } from "../agent-daemon-port.js";

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
