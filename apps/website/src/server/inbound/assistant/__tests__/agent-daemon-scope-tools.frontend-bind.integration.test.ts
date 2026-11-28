import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createInMemoryToolAttemptAuditSink } from "@jini-ai/diagnostics/tool-audit/repo.memory";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";

import { LOST_FRONTEND_BINDING_MESSAGE } from "#src/assistant/lost-frontend-binding";
import { createScopeToolRegistry } from "../agent-daemon-scope-tools.js";

/**
 * @file Which tab a run may drive is read from the run's own `contextRef` by the scope's frontend
 * control. Exercises the real `createScopeToolRegistry` assembly and its real `@jini-ai/daemon/http`
 * frontend control: a bind token the daemon does not know (the tab outlived a restart) is reported
 * once and turns the run's page tools into the "reload the admin page" refusal, while an envelope
 * that is not JSON is not a second error (onStarted already fails that run for being malformed).
 */

function scope() {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const assembled = createScopeToolRegistry({
    env: { TOVU_SITE_CALLBACK_ORIGIN: "http://127.0.0.1:9" }, siteToolToken: "tok-a",
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
