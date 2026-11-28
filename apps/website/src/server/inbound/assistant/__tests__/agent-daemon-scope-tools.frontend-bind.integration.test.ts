import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createInMemoryToolAttemptAuditSink } from "@jini-ai/diagnostics/tool-audit/repo.memory";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";

import { LOST_FRONTEND_BINDING_MESSAGE } from "#src/assistant/lost-frontend-binding";
import { createScopeToolRegistry } from "../agent-daemon-scope-tools.js";
import express from "express";
import { RUN_PRINCIPAL_HEADER } from "#src/assistant/daemon-access";
import { daemonRouteHost, mountJiniRoutes } from "#src/platform/express/jini-routes";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import { startTestServer } from "../../../__tests__/helpers/http-test-server.js";

/**
 * @file Which tab a run may drive is read from the run's own `contextRef` by the scope's frontend
 * control. Exercises the real `createScopeToolRegistry` assembly and its real `@jini-ai/daemon/http`
 * frontend control: a bind token the daemon does not know (the tab outlived a restart) is reported
 * once and turns the run's page tools into the "reload the admin page" refusal, while an envelope
 * that is not JSON is not a second error (onStarted already fails that run for being malformed).
 */

function scope(env: NodeJS.ProcessEnv = { TOVU_SITE_CALLBACK_ORIGIN: "http://127.0.0.1:9" }) {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const assembled = createScopeToolRegistry({
    env, siteToolToken: "tok-a",
    routeDeps: { toolAttemptAuditSink: createInMemoryToolAttemptAuditSink(), workspaceId: "ws-bind" },
    surfaceExchanges,
    readSnapshot: () => { throw new Error("chat settings are not read by a bind"); },
    contextFor: () => { throw new Error("site context is not read by a bind"); },
    execute: async () => { throw new Error("page approval is not executed by a bind"); },
  });
  return { ...assembled, executor: createToolExecutor({ registry: assembled.registry }) };
}

async function startedRun() {
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "ctx-bind" });
  return { lifecycle, run };
}

function captureConsoleErrors(t: { mock: { method: typeof test.mock.method } }) {
  const lines: string[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { lines.push(args.map(String).join(" ")); });
  return lines;
}

test("a bind token the daemon does not know is reported for that run and its page tools ask for an admin reload", async t => {
  const errors = captureConsoleErrors(t);
  const { frontendControl, executor } = scope();
  const { lifecycle, run } = await startedRun();
  frontendControl.bindOnStarted({ request: { contextRef: JSON.stringify({ principalId: "owner", frontendBindToken: "tok-stale" }) }, run, lifecycle });
  assert.equal(errors.length, 1);
  assert.match(errors[0] ?? "", new RegExp(`^\\[agent-daemon\\] run ${run.id}: could not bind to a frontend surface Error: .*unknown or expired bind token`));
  const result = await executor.execute({ principal: { id: "owner" }, run: { id: run.id }, toolId: "page.scroll_to", input: { handle: "top" } });
  assert.equal(result.status, "failed");
  assert.equal(result.status === "failed" ? result.error : undefined, LOST_FRONTEND_BINDING_MESSAGE);
});

test("a contextRef that is not JSON binds no tab and reports no bind error", async t => {
  const errors = captureConsoleErrors(t);
  const { frontendControl, executor } = scope();
  const { lifecycle, run } = await startedRun();
  frontendControl.bindOnStarted({ request: { contextRef: "{not json" }, run, lifecycle });
  assert.deepEqual(errors, []);
  const result = await executor.execute({ principal: { id: "owner" }, run: { id: run.id }, toolId: "page.scroll_to", input: { handle: "top" } });
  // An unbound run gets the recoverable "no tab connected" error, never the restart reload message.
  assert.equal(result.status, "failed");
  assert.match(result.status === "failed" ? result.error ?? "" : "", /^frontend_disconnected \(retryable\): no admin tab is connected to this run/);
});

test("a tab's frontend stream is owned by the forwarded admin principal and tab; another admin cannot answer on it", async t => {
  const { frontendControl } = scope();
  const app = express();
  app.use(express.json());
  const host = daemonRouteHost({ context: { originPolicy: { isSameOrigin: () => true } }, parserLimitBytes: 1024 * 1024, errors: createRouteIncidentReporter().errors });
  mountJiniRoutes({ app, routes: frontendControl.routes({ host }) });
  const base = await startTestServer(app, t);
  const streamUrl = `${base}/api/frontend-sessions/stream?capability=page.scroll_to`;

  const anonymous = await fetch(streamUrl, { headers: { "x-frontend-tab-id": "tab-1" } });
  assert.equal(anonymous.status, 403);
  assert.equal(await anonymous.text(), "Forbidden");

  const controller = new AbortController();
  t.after(() => controller.abort());
  const stream = await fetch(streamUrl, { headers: { [RUN_PRINCIPAL_HEADER]: "admin-a", "x-frontend-tab-id": "tab-1" }, signal: controller.signal });
  assert.equal(stream.status, 200);
  const reader = stream.body!.getReader();
  let text = "";
  while (!text.includes("\n\n")) text += new TextDecoder().decode((await reader.read()).value);
  const attached = JSON.parse(text.slice("data: ".length, text.indexOf("\n\n"))) as { type: string; sessionId: string; bindToken: string };
  assert.equal(attached.type, "attached");

  const answer = (principal: string) => fetch(`${base}/api/frontend-sessions/${attached.sessionId}/responses`, { method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: principal, "x-frontend-tab-id": "tab-1", "x-frontend-bind-token": attached.bindToken },
    body: JSON.stringify({ invocationId: "inv-none", ok: true, result: {} }) });
  const intruder = await answer("admin-b");
  assert.equal(intruder.status, 403);
  assert.equal(await intruder.text(), "Forbidden");
  const owner = await answer("admin-a");
  assert.equal(owner.status, 200, "the owning admin passes the owner gate");
  assert.deepEqual(await owner.json(), { settled: false }, "no invocation is pending, so nothing settles");
});

// Mutations: drop the listener-origin fallback; replace the empty fallback with a default host.
test("site discovery uses the listener origin when no callback origin is set, and with neither the assembly fails fast on the empty site URL", async t => {
  const seen: string[] = [];
  const site = express();
  site.get("/internal/tool-catalog", (req, res) => { seen.push(`${req.headers.authorization} ${req.url}`); res.json({ tools: [] }); });
  const base = await startTestServer(site, t);
  const viaListener = scope({ TOVU_SITE_LISTENER_ORIGIN: base });
  await viaListener.siteTools.start({ runId: "run-listener", principalId: "owner" });
  assert.deepEqual(seen, ["Bearer tok-a /internal/tool-catalog?runId=run-listener&principalId=owner"]);

  // The empty fallback is not a usable origin: the site tool executor rejects it while the scope is assembled.
  assert.throws(() => scope({}), { name: "TypeError", code: "ERR_INVALID_URL", input: "/internal/tool-executions", base: "" });
  assert.equal(seen.length, 1);
});
