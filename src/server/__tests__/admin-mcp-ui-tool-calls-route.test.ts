import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { AGENT_DAEMON_TOKEN_ENV_VAR, MCP_UI_TOOL_CALLS_PATH, RUN_PRINCIPAL_HEADER } from "../../assistant/index.js";
import type { RouteDeps } from "../routes/types.js";
import { startTestServer, loginAsOwner } from "./helpers/http-test-server.js";

/**
 * @file Route-level tests for `server/modules/assistant.ts`'s MCP-UI confirmation redemption proxy
 * (`proxyMcpUiToolCall`, ADR-053 Decision 3) — the browser-facing half of the endpoint
 * `@jini-ai/chat`'s `createMcpUiToolCaller` posts to. Mirrors `assistant-proxy-routes.test.ts`'s
 * stand-in-daemon harness: a plain HTTP server records exactly what crosses the wire, so these
 * assert the proxy hop's own contract (session gate, allowlist, bearer/header forwarding) rather
 * than re-testing the daemon-side route (`mcp-ui-tool-calls-route.test.ts` already covers that).
 *
 * The dispatch's own security requirement — "reject any toolName not on an explicit allowlist" — is
 * asserted twice across the two test files on purpose: this file proves the browser-facing hop
 * refuses fast without ever reaching the daemon; `mcp-ui-tool-calls-route.test.ts` proves the
 * daemon-side hop refuses independently, since it is the one that can actually reach
 * `ToolExecutor.execute` and is not obligated to trust this proxy's own check.
 */

const TOKEN = "e".repeat(64);

interface RecordedRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

let recorded: RecordedRequest[] = [];

/** Stand-in agent daemon: records every inbound request, then answers as the real redemption route would. */
async function startStandInDaemon(): Promise<{ origin: string; server: Server }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      recorded.push({
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ deleted: true, cancelled: false }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, server };
}

let harnessPromise: Promise<{ buildApp: () => express.Express; daemon: Server }> | null = null;
function harness() {
  harnessPromise ??= (async () => {
    const { origin, server } = await startStandInDaemon();
    process.env.JINI_AGENT_DAEMON_URL = origin;
    process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = TOKEN;

    const { createRouteDeps } = await import("../app.js");
    const { createAssistantModule } = await import("../modules/assistant.js");
    const { registerAuthRoutes } = await import("../middleware/dev-auth.js");
    const { createSurfaceExchangeStore } = await import("../../contracts/core/tool-surface-exchanges.js");

    return {
      daemon: server,
      buildApp: () => {
        const deps: RouteDeps = createRouteDeps();
        const app = express();
        app.use(express.json());
        registerAuthRoutes(app, deps);
        // A fresh, empty store: none of this file's request bodies carry an exchangeId (top-level or
        // in `params`), so the new local-delivery branch never triggers and every request still
        // reaches the stand-in daemon exactly as before these tests were written.
        createAssistantModule(deps, createSurfaceExchangeStore()).registerRoutes(app);
        return app;
      },
    };
  })();
  return harnessPromise;
}

async function boot(t: import("node:test").TestContext) {
  const { buildApp } = await harness();
  recorded = [];
  const baseUrl = await startTestServer(buildApp(), t);
  const cookie = await loginAsOwner(baseUrl);
  return { baseUrl, cookie };
}

test.after(async () => {
  const built = await harnessPromise;
  if (built) await new Promise<void>((resolve) => built.daemon.close(() => resolve()));
});

test("requires an admin session — no cookie means 401 and the daemon is never called", async (t) => {
  const { baseUrl } = await boot(t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ toolName: "content_post_delete", params: {} }),
  });

  assert.equal(res.status, 401);
  assert.equal(recorded.length, 0);
});

test("SECURITY-CRITICAL: a non-allowlisted toolName is rejected before the daemon is ever called", async (t) => {
  const { baseUrl, cookie } = await boot(t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ toolName: "database_execute_migrate_forward", params: {} }),
  });

  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as { code: string }).code, "TOOL_NOT_ALLOWLISTED");
  assert.equal(recorded.length, 0, "this endpoint must never become a general tool-execution surface");
});

test("rejects a missing/empty toolName without reaching the daemon", async (t) => {
  const { baseUrl, cookie } = await boot(t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ params: {} }),
  });

  assert.equal(res.status, 400);
  assert.equal(recorded.length, 0);
});

test("forwards an allowlisted call to the daemon with the bearer token and the session principal", async (t) => {
  const { baseUrl, cookie } = await boot(t);
  const me = (await (await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } })).json()) as {
    user: { id: string };
  };

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ toolName: "content_post_delete", params: { id: "post-1", kind: "post", confirmationToken: "tok" } }),
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { deleted: true, cancelled: false }, "the daemon's body must be relayed verbatim");
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].url, MCP_UI_TOOL_CALLS_PATH);
  assert.equal(recorded[0].headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(recorded[0].headers[RUN_PRINCIPAL_HEADER], me.user.id);
  assert.deepEqual(JSON.parse(recorded[0].body), {
    toolName: "content_post_delete",
    params: { id: "post-1", kind: "post", confirmationToken: "tok" },
  });
});

test("a browser-supplied principal header is overwritten, never trusted", async (t) => {
  const { baseUrl, cookie } = await boot(t);
  const me = (await (await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } })).json()) as {
    user: { id: string };
  };

  await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: "principal-someone-else" },
    body: JSON.stringify({ toolName: "content_post_delete", params: {} }),
  });

  assert.equal(recorded[0].headers[RUN_PRINCIPAL_HEADER], me.user.id);
});
