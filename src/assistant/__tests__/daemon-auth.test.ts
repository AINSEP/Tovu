import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import {
  AGENT_DAEMON_TOKEN_ENV_VAR,
  DELEGATED_TOOL_CALLS_PATH,
  ensureAgentDaemonToken,
  requireAgentDaemonToken,
} from "../daemon-auth.js";

/**
 * @file Real-HTTP coverage for the agent daemon's caller gate (`assistant/daemon-auth.ts`).
 *
 * These assertions are made over a real listening socket rather than a fake `req`/`res` pair on
 * purpose: the specific hole being closed is "another process on this machine, connecting over
 * loopback, can drive the daemon". `@jini-ai/http-kit`'s own `registerApiBearerAuthMiddleware`
 * short-circuits for exactly that peer class before it reads the `Authorization` header, so a
 * fake-object unit test could not tell the two middlewares apart. Every request below genuinely
 * originates from `127.0.0.1`, which is what makes the 401/503 cases meaningful.
 *
 * `agent-daemon-server.ts` itself is a top-level side-effecting script (it opens a real port and a
 * real `content.db` connection on import), so the middleware lives in its own module and is
 * exercised here; `agent-daemon-server.ts` mounts precisely this factory as its first `app.use`.
 */

/** Mounts the gate ahead of a probe route that records whether it was ever reached. */
async function bootGatedServer(env: NodeJS.ProcessEnv, exemptPaths?: readonly string[]) {
  const app = express();
  let probeReached = 0;
  app.use(requireAgentDaemonToken({ env, exemptPaths }));
  app.use(express.json());
  const probe = (_req: express.Request, res: express.Response) => {
    probeReached += 1;
    res.status(201).json({ started: true });
  };
  app.post("/api/runs", probe);
  app.post(DELEGATED_TOOL_CALLS_PATH, probe);
  app.post(`${DELEGATED_TOOL_CALLS_PATH}/nested`, probe);

  const server: Server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    probeCount: () => probeReached,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const TOKEN = "a".repeat(64);

test("fails closed with 503 when the token env var is unset — never a silent pass-through", async (t) => {
  const harness = await bootGatedServer({});
  t.after(harness.close);

  const res = await fetch(`${harness.baseUrl}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contextRef: "{}" }),
  });

  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { code: string }).code, "AGENT_DAEMON_UNCONFIGURED");
  assert.equal(harness.probeCount(), 0, "an unconfigured daemon must not run the route handler");
});

test("fails closed with 503 when the token env var is set but empty", async (t) => {
  const harness = await bootGatedServer({ [AGENT_DAEMON_TOKEN_ENV_VAR]: "" });
  t.after(harness.close);

  const res = await fetch(`${harness.baseUrl}/api/runs`, { method: "POST" });

  assert.equal(res.status, 503);
  assert.equal(harness.probeCount(), 0);
});

test("401s a request carrying no Authorization header at all, even though the peer is 127.0.0.1", async (t) => {
  const harness = await bootGatedServer({ [AGENT_DAEMON_TOKEN_ENV_VAR]: TOKEN });
  t.after(harness.close);

  const res = await fetch(`${harness.baseUrl}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contextRef: "{}" }),
  });

  assert.equal(res.status, 401, "there is deliberately NO loopback exemption — this is the whole fix");
  assert.equal(((await res.json()) as { code: string }).code, "UNAUTHENTICATED");
  assert.equal(harness.probeCount(), 0);
});

test("401s a wrong token, and never parses the unauthenticated caller's body", async (t) => {
  const harness = await bootGatedServer({ [AGENT_DAEMON_TOKEN_ENV_VAR]: TOKEN });
  t.after(harness.close);

  const res = await fetch(`${harness.baseUrl}/api/runs`, {
    method: "POST",
    headers: { authorization: `Bearer ${"b".repeat(64)}`, "content-type": "application/json" },
    // Deliberately unparseable JSON: `express.json()` mounts AFTER the gate, so this must produce
    // the gate's own 401 rather than a body-parser 400 — proof of the mount order.
    body: "{not json at all",
  });

  assert.equal(res.status, 401);
  assert.equal(harness.probeCount(), 0);
});

test("401s tokens that are a prefix, a suffix, or a different length of the real one", async (t) => {
  const harness = await bootGatedServer({ [AGENT_DAEMON_TOKEN_ENV_VAR]: TOKEN });
  t.after(harness.close);

  for (const candidate of [TOKEN.slice(0, -1), `${TOKEN}a`, TOKEN.toUpperCase(), ""]) {
    const res = await fetch(`${harness.baseUrl}/api/runs`, {
      method: "POST",
      headers: { authorization: `Bearer ${candidate}` },
    });
    assert.equal(res.status, 401, `token "${candidate.slice(0, 8)}…" must be rejected`);
  }
  assert.equal(harness.probeCount(), 0);
});

test("401s a malformed Authorization header (wrong scheme, or a bare scheme with no token)", async (t) => {
  const harness = await bootGatedServer({ [AGENT_DAEMON_TOKEN_ENV_VAR]: TOKEN });
  t.after(harness.close);

  for (const header of [TOKEN, `Token ${TOKEN}`, "Bearer", "Bearer ", `Basic ${TOKEN}`]) {
    const res = await fetch(`${harness.baseUrl}/api/runs`, { method: "POST", headers: { authorization: header } });
    assert.equal(res.status, 401, `header "${header.slice(0, 12)}…" must be rejected`);
  }
  assert.equal(harness.probeCount(), 0);
});

test("passes an exact Bearer match through to the route handler", async (t) => {
  const harness = await bootGatedServer({ [AGENT_DAEMON_TOKEN_ENV_VAR]: TOKEN });
  t.after(harness.close);

  const res = await fetch(`${harness.baseUrl}/api/runs`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ contextRef: "{}" }),
  });

  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { started: true });
  assert.equal(harness.probeCount(), 1);
});

test("accepts the case-insensitive scheme spelling RFC 7235 permits, but not a case-shifted token", async (t) => {
  const harness = await bootGatedServer({ [AGENT_DAEMON_TOKEN_ENV_VAR]: TOKEN });
  t.after(harness.close);

  const res = await fetch(`${harness.baseUrl}/api/runs`, { method: "POST", headers: { authorization: `bearer ${TOKEN}` } });
  assert.equal(res.status, 201);
});

test("re-reads the env var per request — a token minted after the middleware was constructed still works", async (t) => {
  // This is why `agent-daemon-server.ts` can mount the gate at module scope: the daemon's module
  // graph is evaluated before anything could have injected a token into its env.
  const env: NodeJS.ProcessEnv = {};
  const harness = await bootGatedServer(env);
  t.after(harness.close);

  const before = await fetch(`${harness.baseUrl}/api/runs`, { method: "POST" });
  assert.equal(before.status, 503);

  env[AGENT_DAEMON_TOKEN_ENV_VAR] = TOKEN;

  const after = await fetch(`${harness.baseUrl}/api/runs`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal(after.status, 201);
});

test("no path is exempt by default — the middleware is a gate-everything primitive", async (t) => {
  const harness = await bootGatedServer({ [AGENT_DAEMON_TOKEN_ENV_VAR]: TOKEN });
  t.after(harness.close);

  const res = await fetch(`${harness.baseUrl}${DELEGATED_TOOL_CALLS_PATH}`, { method: "POST" });

  assert.equal(res.status, 401, "an exemption must be opted into at the mount site, never assumed");
  assert.equal(harness.probeCount(), 0);
});

test("an opted-in exempt path passes through without a token — the jini-mcp subprocess has none to send", async (t) => {
  const harness = await bootGatedServer({ [AGENT_DAEMON_TOKEN_ENV_VAR]: TOKEN }, [DELEGATED_TOOL_CALLS_PATH]);
  t.after(harness.close);

  const res = await fetch(`${harness.baseUrl}${DELEGATED_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId: "run-1", toolId: "collections_content_type_define" }),
  });

  assert.equal(res.status, 201);
  assert.equal(harness.probeCount(), 1);
});

test("an exemption does not leak to sibling routes, nor to paths merely prefixed by it", async (t) => {
  const harness = await bootGatedServer({ [AGENT_DAEMON_TOKEN_ENV_VAR]: TOKEN }, [DELEGATED_TOOL_CALLS_PATH]);
  t.after(harness.close);

  const runs = await fetch(`${harness.baseUrl}/api/runs`, { method: "POST" });
  assert.equal(runs.status, 401, "exempting one path must not widen the gate anywhere else");

  const nested = await fetch(`${harness.baseUrl}${DELEGATED_TOOL_CALLS_PATH}/nested`, { method: "POST" });
  assert.equal(nested.status, 401, "the match is exact equality, never a prefix");

  assert.equal(harness.probeCount(), 0);
});

test("an exempt path still works when the token env var is unset — it does not depend on the token at all", async (t) => {
  const harness = await bootGatedServer({}, [DELEGATED_TOOL_CALLS_PATH]);
  t.after(harness.close);

  const exempted = await fetch(`${harness.baseUrl}${DELEGATED_TOOL_CALLS_PATH}`, { method: "POST" });
  assert.equal(exempted.status, 201);

  const gated = await fetch(`${harness.baseUrl}/api/runs`, { method: "POST" });
  assert.equal(gated.status, 503, "every non-exempt route still fails closed");
});

test("ensureAgentDaemonToken mints a 64-char hex token when the env var is unset", () => {
  const env: NodeJS.ProcessEnv = {};
  const minted = ensureAgentDaemonToken(env);

  assert.match(minted, /^[0-9a-f]{64}$/, "32 random bytes, hex-encoded");
  assert.equal(env[AGENT_DAEMON_TOKEN_ENV_VAR], minted, "the token must land in the env the child will inherit");
});

test("ensureAgentDaemonToken is idempotent — a second call never rotates a token the daemon child may already hold", () => {
  const env: NodeJS.ProcessEnv = {};
  const first = ensureAgentDaemonToken(env);
  const second = ensureAgentDaemonToken(env);

  assert.equal(second, first);
  assert.equal(env[AGENT_DAEMON_TOKEN_ENV_VAR], first);
});

test("ensureAgentDaemonToken preserves an operator-supplied token and overwrites an empty one", () => {
  const operatorEnv: NodeJS.ProcessEnv = { [AGENT_DAEMON_TOKEN_ENV_VAR]: "operator-chosen-token" };
  assert.equal(ensureAgentDaemonToken(operatorEnv), "operator-chosen-token");

  const emptyEnv: NodeJS.ProcessEnv = { [AGENT_DAEMON_TOKEN_ENV_VAR]: "" };
  assert.match(ensureAgentDaemonToken(emptyEnv), /^[0-9a-f]{64}$/, "an empty value is a misconfiguration, not a token");
});

test("two mints are distinct — the token is random per boot, not a fixed constant", () => {
  assert.notEqual(ensureAgentDaemonToken({}), ensureAgentDaemonToken({}));
});
