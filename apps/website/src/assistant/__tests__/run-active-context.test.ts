import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import { createRunActiveContextStore } from "@jini-ai/daemon/http";
import { getActiveContextTool } from "@jini-ai/mcp";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { AGENT_DAEMON_TOKEN_ENV_VAR, requireAgentDaemonToken } from "../daemon-access.js";
import { ACTIVE_CONTEXT_PATH, registerRunActiveContextRoute } from "../run-active-context.js";
import type { RunPageContext } from "../run-page-context.js";

/**
 * @file `run-active-context.ts` — the agent daemon's `GET /api/active`, which `@jini-ai/mcp`'s
 * `get_active_context` tool (and its active resource) call. The daemon never served it, so every
 * call answered 404 (tool-gaps report gap #8). The route now answers from the admin screen each
 * live run was started from.
 */

const PAGE_EDITOR: RunPageContext = {
  path: "/pages/7b42dba9",
  section: "pages",
  view: "page-editor",
  entry: { kind: "page", id: "7b42dba9", title: "Landing sample", slug: "landing", status: "draft" },
};
test("MCP: get_active_context against the daemon route returns the run's screen instead of a 404", async (t) => {
  const token = "test-daemon-token";
  const store = createRunActiveContextStore({ now: () => 42 });
  store.record({ runId: "run-1", pageContext: PAGE_EDITOR });
  const app = express();
  app.use(requireAgentDaemonToken({ env: { [AGENT_DAEMON_TOKEN_ENV_VAR]: token } }, {}));
  registerRunActiveContextRoute({ app, store });
  const baseUrl = await startTestServer(app, t);

  const answer = await getActiveContextTool.handler({ args: {}, ctx: { baseUrl, fetchImpl: fetch, authHeaders: { Authorization: `Bearer ${token}` } } });

  assert.deepEqual(answer, {
    active: true,
    resourceRef: "7b42dba9",
    resourceName: "Landing sample",
    detail: "/pages/7b42dba9",
    ts: 42,
    ageMs: 0,
    pageContext: PAGE_EDITOR,
  });
  assert.equal(ACTIVE_CONTEXT_PATH, "/api/active");
});
