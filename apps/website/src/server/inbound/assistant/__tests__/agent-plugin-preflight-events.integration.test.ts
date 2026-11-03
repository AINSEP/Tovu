import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import ts from "typescript";
import { createInMemoryEventLog, createRunLifecycle } from "@jini-ai/daemon";
import { registerAgentPluginEvents } from "../agent-plugin-preflight-events.js";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { createRunScopedCredentials } from "#src/assistant/daemon-access";
import { daemonSource, evaluateDaemonStatements } from "./helpers/daemon-source.js";

test("server plugin consent reaches only its live owning daemon run", async t => {
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "{}" });
  const owners = new Map([[run.id, "member"]]);
  const app = express();
  const registration = daemonSource.statements.find(statement => ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)
    && statement.expression.expression.getText(daemonSource) === "registerAgentPluginEvents");
  assert.ok(registration, "the real daemon entry must mount its authenticated server plugin event adapter");
  await evaluateDaemonStatements([registration], { app, lifecycle,
    principalByRunId: { get: (runId: string) => { const id = owners.get(runId); return id ? { id } : undefined; } },
    registerAgentPluginEvents: (required: Parameters<typeof registerAgentPluginEvents>[0]) =>
      registerAgentPluginEvents(required, { env: { TOVU_AGENT_DAEMON_TOKEN: "server-secret" } }),
  });
  const baseUrl = await startTestServer(app, t);
  const post = (principalId: string, authenticated = true) => fetch(`${baseUrl}/internal/agent-plugin-events`, {
    method: "POST", headers: { "content-type": "application/json", ...(authenticated ? { authorization: "Bearer server-secret" } : {}) },
    body: JSON.stringify({ runId: run.id, principalId, payload: { type: "agent_plugins", conversationId: "chat", state: { decision: null, excluded: [] }, plugins: [] } }),
  });
  assert.equal((await post("member", false)).status, 401);
  assert.equal((await post("another-member")).status, 404);
  assert.equal((await post("member")).status, 202);
  const payloads: unknown[] = [];
  const subscription = await lifecycle.stream({ runId: run.id, onEvent: event => {
    if (event.kind === "agent") payloads.push(event.payload);
  } });
  if (subscription.kind === "ok") subscription.unsubscribe();
  assert.deepEqual(payloads, [{ type: "agent_plugins", conversationId: "chat", state: { decision: null, excluded: [] }, plugins: [] }]);
  const credentials = createRunScopedCredentials({ principalOfLiveRun: ({ runId }) => owners.get(runId) }, {});
  const credential = credentials.mint({ runId: run.id }, {});
  const refused = await fetch(`${baseUrl}/internal/agent-plugin-events`, { method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${credential}` }, body: "{invalid-json" });
  assert.equal(refused.status, 401, "a live CLI credential cannot inject server plugin events or reach the parser");
  owners.delete(run.id);
  assert.equal((await post("member")).status, 404);
  owners.set(run.id, "member");
  await lifecycle.finish({ runId: run.id, status: "succeeded", code: 0, signal: null, resumable: false });
  assert.equal((await post("member")).status, 404, "a retained owner record does not make a terminal run live");
});
