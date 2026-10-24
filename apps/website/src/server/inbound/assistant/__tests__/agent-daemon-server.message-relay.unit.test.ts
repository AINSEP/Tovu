import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import express from "express";
import { createDaemonAuthMiddleware, registerMessageRelayRoutes } from "@jini-ai/daemon/http";
import { bearerTokenFromHeader } from "@jini-ai/http-kit";
import { AGENT_DAEMON_TOKEN_ENV_VAR, createRunOwnerRegistry, requireAgentDaemonToken, requireRunOwnership } from "#src/assistant/daemon-access";
import { daemonSource, evaluateDaemonStatements } from "./helpers/daemon-source.js";

const CLAIM = "/api/runs/live-run/messages/claim";

/** Mount the actual production statements with real auth/relay handlers, without booting a site. */
async function harness(t: TestContext) {
  const app = express();
  const claims: unknown[] = [];
  const runCredentials = { resolveCaller: ({ token }: { token: string }) => token === "run-token"
    ? { runId: "live-run", principalId: "alice" } : undefined };
  const runOwners = createRunOwnerRegistry({}, {});
  runOwners.record({ runId: "live-run", principalId: "alice" }, {});
  runOwners.record({ runId: "other-run", principalId: "bob" }, {});
  // Read only top-level AST statements, preserving the real mount order and route middleware.
  const start = daemonSource.statements.findIndex(statement => statement.getText(daemonSource).startsWith('app.post("/api/runs/:runId/messages/claim",'));
  const end = daemonSource.statements.findIndex(statement => statement.getText(daemonSource).startsWith('app.use(express.json('));
  const ownership = daemonSource.statements.find(statement => statement.getText(daemonSource).startsWith('app.use("/api/runs/:runId", requireRunOwnership('));
  assert.ok(start >= 0 && end > start && ownership);
  const statements = [...daemonSource.statements.slice(start, end + 1), ownership];
  assert.equal(statements.length, 5, "claim auth and mount, global auth/parser, and ownership must all be exercised");
  await evaluateDaemonStatements(statements, {
    app, express, createDaemonAuthMiddleware, bearerTokenFromHeader, registerMessageRelayRoutes, runCredentials, runOwners,
    requireAgentDaemonToken: (input: Parameters<typeof requireAgentDaemonToken>[0], options: {}) => requireAgentDaemonToken({
      ...input, env: { [AGENT_DAEMON_TOKEN_ENV_VAR]: "proxy-token" },
    }, options),
    requireRunOwnership, lifecycle: { get: async () => ({ id: "existing-run" }) },
    agentExecutor: { claimUserMessages: (input: unknown) => {
      claims.push(input);
      return [{ id: "message-1", seq: 1, text: "keep going" }];
    } },
  });
  app.get("/api/runs/:runId", (_req, res) => res.json({ ok: true }));
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const request = (path = CLAIM, { token = "run-token" as string | null, method = "POST", body = '{"via":"check_messages"}' } = {}) => fetch(`http://127.0.0.1:${address.port}${path}`, {
    method, headers: { ...(token === null ? {} : { authorization: `Bearer ${token}` }), "content-type": "application/json", "x-tovu-principal-id": "bob" },
    ...(method === "GET" ? {} : { body }),
  });
  return { request, claims, runOwners };
}

test("the mounted relay accepts its live run credential without a proxy principal or ownership record", async t => {
  const h = await harness(t);
  h.runOwners.forget({ runId: "live-run" }, {});
  for (const via of ["tool-result", "check_messages"]) {
    const response = await h.request(CLAIM, { body: JSON.stringify({ via }) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { messages: [{ id: "message-1", seq: 1, text: "keep going" }] });
  }
  assert.deepEqual(h.claims, [{ runId: "live-run", via: "tool-result" }, { runId: "live-run", via: "check_messages" }]);
  assert.equal((await h.request("/api/runs/live-run", { method: "GET" })).status, 404, "normal reads retain ownership checks");
});

test("claim rejects missing, invalid and proxy credentials before parsing their bodies", async t => {
  const h = await harness(t);
  for (const token of [null, "", "invalid", "proxy-token"]) {
    assert.equal((await h.request(CLAIM, { token, body: "invalid JSON" })).status, 401);
  }
  assert.deepEqual(h.claims, []);
});

test("claim binds URL scope to the credential and refuses caller-selected scope", async t => {
  const h = await harness(t);
  assert.equal((await h.request("/api/runs/other-run/messages/claim")).status, 404);
  for (const body of [{ via: "check_messages", runId: "other-run" }, { via: "invalid" }]) {
    assert.equal((await h.request(CLAIM, { body: JSON.stringify(body) })).status, 400);
  }
  assert.deepEqual(h.claims, []);
});

test("relay access admits only the claim POST and preserves other run-route restrictions", async t => {
  const h = await harness(t);
  for (const [path, method] of [[CLAIM, "GET"], [CLAIM, "DELETE"], [`${CLAIM}/extra`, "POST"], ["/api/runs/live-run/messages", "POST"], ["/api/runs", "POST"]] as const) {
    assert.equal((await h.request(path, { method })).status, 403, `${method} ${path}`);
  }
  assert.equal((await h.request("/api/runs/other-run", { method: "GET" })).status, 404);
  assert.equal((await h.request("/api/runs/live-run", { method: "GET" })).status, 200);
  assert.deepEqual(h.claims, []);
});
