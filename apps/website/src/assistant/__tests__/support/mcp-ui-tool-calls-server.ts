import type { TestContext } from "node:test";

import express from "express";

import { RUN_PRINCIPAL_HEADER } from "../../daemon-access.js";
import { registerMcpUiToolCallsRoute, MCP_UI_TOOL_CALLS_PATH } from "../../mcp-ui-tool-calls-route.js";
import { startTestServer } from "../../../server/__tests__/helpers/http-test-server.js";

type McpUiToolCallsDeps = Parameters<typeof registerMcpUiToolCallsRoute>[0]["deps"];

/** What a browser (or the daemon proxy) sees back from one POST to the MCP-UI callback endpoint. */
export interface McpUiToolCallReply {
  status: number;
  body: unknown;
  /** Listeners still attached to the server's response object once it was fully read, for tests that
   *  pin that the route releases the `close` listener it attaches while a request is in flight. */
  closeListenersAfterReply: number;
}

/**
 * The production MCP-UI callback route, mounted on a real express app with `express.json()` exactly as
 * production and the wire pins do, served over real HTTP. Replaces the hand-built fake `{ post }` app that
 * captured the handler: the route is no longer a plain `app.post` registration, so only real transport
 * reaches it. Closes its server through `t` (via `startTestServer`).
 */
export async function startMcpUiToolCallsServer(
  required: { deps: McpUiToolCallsDeps; t: TestContext },
  _optional: Record<string, never> = {},
): Promise<{ post: (call: { body: unknown; principalId?: string }) => Promise<McpUiToolCallReply> }> {
  const app = express();
  const responses: express.Response[] = [];
  app.use((_req, res, next) => { responses.push(res); next(); });
  app.use(express.json());
  registerMcpUiToolCallsRoute({ app, deps: required.deps });
  const baseUrl = await startTestServer(app, required.t);
  return {
    post: async ({ body, principalId }) => {
      const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(principalId === undefined ? {} : { [RUN_PRINCIPAL_HEADER]: principalId }) },
        body: JSON.stringify(body),
      });
      const parsed: unknown = await res.json();
      // Let the server finish the response's own close bookkeeping before it is inspected.
      await new Promise((resolve) => setImmediate(resolve));
      return { status: res.status, body: parsed, closeListenersAfterReply: responses.at(-1)?.listenerCount("close") ?? 0 };
    },
  };
}
