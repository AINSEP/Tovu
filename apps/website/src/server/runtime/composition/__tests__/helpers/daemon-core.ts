import express from "express";
import type { TestContext } from "node:test";
import type { RouteDeps } from "#src/server/routes/types";
import { ensureToolExecToken } from "#src/assistant/daemon-access";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAgentDaemonCoreRoutes } from "../../modules/agent-daemon-core-rpc.js";
import { createAgentDaemonCoreDeps, type AgentDaemonCoreOptions } from "../../agent-daemon-core-deps.js";

/** Bind the real retained root to its real site authority without booting the daemon script. */
export async function coreForSite({ deps, t, env }: { deps: RouteDeps; t: TestContext; env: NodeJS.ProcessEnv }, options: AgentDaemonCoreOptions = {}) {
  const app = express();
  registerAgentDaemonCoreRoutes({ router: app, deps });
  const baseUrl = await startTestServer(app, t);
  const token = ensureToolExecToken({}, {});
  const core = await createAgentDaemonCoreDeps({ env: { ...env, TOVU_SITE_LISTENER_ORIGIN: baseUrl }, token }, options);
  // Teardown may already have stopped the HTTP owner; DB close still runs in finally.
  t.after(() => core.close().catch(() => {}));
  return core;
}
