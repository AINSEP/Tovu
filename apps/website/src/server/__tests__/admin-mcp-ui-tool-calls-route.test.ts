import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { A2UI_ACTIONS_PATH, AGENT_DAEMON_TOKEN_ENV_VAR, MCP_UI_TOOL_CALLS_PATH, RUN_PRINCIPAL_HEADER } from "../../assistant/index.js";
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

    const { createRouteDeps } = await import("../runtime/composition/app.js");
    const { createAssistantModule } = await import("../runtime/composition/modules/assistant.js");
    const { registerAuthRoutes } = await import("../inbound/admin-http/dev-auth.js");
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
    body: JSON.stringify({ toolName: "collections_execute_cleanup", params: {} }),
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

/**
 * Typed answers (prose from the chat composer, carried as `SURFACE_TYPED_ANSWER_PARAM`) name no
 * exchange — the human never saw one — so this hop resolves the target against its OWN
 * `byokSurfaceExchanges` before forwarding, exactly as the exchange-id branch already does. The two
 * tests below pin the fork: a locally-parked question is answered here, and anything this store does
 * not hold still reaches the daemon, which owns every Local-CLI run's exchanges.
 */
async function bootWithStore(t: import("node:test").TestContext) {
  const { origin } = { origin: process.env.JINI_AGENT_DAEMON_URL };
  assert.ok(origin, "the stand-in daemon must already be running");
  const { createRouteDeps } = await import("../runtime/composition/app.js");
  const { createAssistantModule } = await import("../runtime/composition/modules/assistant.js");
  const { registerAuthRoutes } = await import("../inbound/admin-http/dev-auth.js");
  const { createSurfaceExchangeStore } = await import("../../contracts/core/tool-surface-exchanges.js");

  const surfaceExchanges = createSurfaceExchangeStore();
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  createAssistantModule(deps, surfaceExchanges).registerRoutes(app);

  recorded = [];
  const baseUrl = await startTestServer(app, t);
  const cookie = await loginAsOwner(baseUrl);
  return { baseUrl, cookie, surfaceExchanges };
}

/** The session principal this proxy stamps outbound — read off a forwarded request rather than
 *  hardcoded, since only `getAuthedPrincipal` knows it. */
async function authedPrincipalId(baseUrl: string, cookie: string): Promise<string> {
  await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ toolName: "content_post_delete", params: {} }),
  });
  const forwarded = recorded.at(-1);
  assert.ok(forwarded, "the probe request must have reached the stand-in daemon");
  const principalId = forwarded.headers[RUN_PRINCIPAL_HEADER.toLowerCase()];
  assert.equal(typeof principalId, "string");
  return principalId as string;
}

test("a typed answer is delivered to a locally-parked exchange without a daemon round trip", async (t) => {
  const { baseUrl, cookie, surfaceExchanges } = await bootWithStore(t);
  const principalId = await authedPrincipalId(baseUrl, cookie);
  const exchange = surfaceExchanges.open(
    { toolId: "assistant_ask_choice", principalId },
    async () => undefined,
  );
  const waiting = exchange.receive();
  const forwardedBefore = recorded.length;

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      toolName: "assistant_ask_choice",
      params: { __typedAnswer: "take15-cut-v3 should be the video" },
    }),
  });

  const body = (await res.json()) as { delivered?: boolean };
  assert.equal(res.status, 202, JSON.stringify(body));
  assert.deepEqual(body, { delivered: true });
  assert.deepEqual(await waiting, {
    status: "received",
    params: { __typedAnswer: "take15-cut-v3 should be the video" },
  });
  assert.equal(recorded.length, forwardedBefore, "a locally-parked question must not cost a daemon round trip");
});

test("a typed answer this process holds no exchange for still reaches the daemon", async (t) => {
  const { baseUrl, cookie } = await bootWithStore(t);
  const forwardedBefore = recorded.length;

  await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ toolName: "assistant_ask_choice", params: { __typedAnswer: "deploy it" } }),
  });

  // The owner's own case: the parked call lives in the DAEMON, so refusing here would strand it.
  assert.equal(recorded.length, forwardedBefore + 1);
  assert.equal(recorded.at(-1)!.url, MCP_UI_TOOL_CALLS_PATH);
});

/**
 * A2UI in BYOK: `assistant_render_ui` holds its exchange in THIS process's store, so the browser's
 * renderer rejection must be delivered here. Forwarded to the daemon it got a 409, the tool's grace
 * period ran out, and it told the model a refused surface had rendered.
 */
test("BYOK: an A2UI renderer rejection reaches the locally-held render_ui exchange, with no daemon round trip", async (t) => {
  const { baseUrl, cookie, surfaceExchanges } = await bootWithStore(t);
  const principalId = await authedPrincipalId(baseUrl, cookie);
  const exchange = surfaceExchanges.open({ toolId: "assistant_render_ui", principalId, channel: "a2ui" }, async () => undefined);
  const waiting = exchange.receive();
  const forwardedBefore = recorded.length;

  const message = { version: "v1.0", error: { code: "VALIDATION_FAILED", surfaceId: exchange.id, path: "/components/0", message: "bad prop" } };
  const res = await fetch(`${baseUrl}${A2UI_ACTIONS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ exchangeId: exchange.id, message }),
  });

  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { delivered: true });
  assert.deepEqual(await waiting, { status: "received", params: { message } });
  assert.equal(recorded.length, forwardedBefore, "a locally-held surface must not be forwarded to the daemon");
});

test("BYOK: an A2UI post cannot answer or cancel a locally-held MCP-UI confirmation", async (t) => {
  const { baseUrl, cookie, surfaceExchanges } = await bootWithStore(t);
  const principalId = await authedPrincipalId(baseUrl, cookie);
  const exchange = surfaceExchanges.open({ toolId: "content_post_delete", principalId }, async () => undefined);
  const waiting = exchange.receive();

  const message = { version: "v1.0", error: { code: "VALIDATION_FAILED", surfaceId: exchange.id, path: "/", message: "x" } };
  const res = await fetch(`${baseUrl}${A2UI_ACTIONS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ exchangeId: exchange.id, message }),
  });

  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), {
    error: "that surface is no longer waiting for an answer",
    code: "SURFACE_NOT_PENDING",
    reason: "binding-mismatch",
  });
  assert.equal(await Promise.race([waiting, Promise.resolve("still-waiting" as const)]), "still-waiting");
});

test("BYOK: an A2UI post for an exchange this process does not hold still reaches the daemon", async (t) => {
  const { baseUrl, cookie } = await bootWithStore(t);
  const forwardedBefore = recorded.length;
  const message = { version: "v1.0", error: { code: "VALIDATION_FAILED", surfaceId: "daemon-ex", path: "/", message: "x" } };

  await fetch(`${baseUrl}${A2UI_ACTIONS_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ exchangeId: "daemon-ex", message }),
  });

  assert.equal(recorded.length, forwardedBefore + 1);
  assert.equal(recorded.at(-1)!.url, A2UI_ACTIONS_PATH);
});
