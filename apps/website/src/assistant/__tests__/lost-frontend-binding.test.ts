import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { createLostFrontendBindings, FrontendDisconnectedError } from "@jini-ai/daemon/http";

import { ADMIN_TAB_LOST_FRONTEND_MESSAGES, LOST_FRONTEND_BINDING_MESSAGE } from "../lost-frontend-binding.js";

/**
 * @file Certifies Tovu's admin-tab copy for the lost-frontend-binding rewrap. The mechanics
 * (token bookkeeping, matching the daemon's exact wording, pass-through) are certified in Jini's
 * `packages/daemon/src/http/__tests__/lost-frontend-binding.test.ts`; this file pins only what the
 * admin copy promises the agent: the reload message, "nothing was changed" plus the server-side
 * alternative for an unbound tab, and "outcome is unknown" for a tab that detached mid-call.
 */

const unknownTokenError = new Error('FrontendSessionRegistry: cannot bind run "run-1" — unknown or expired bind token');
const unboundError = new Error('no frontend is bound to run "run-1", so "admin.publish_content" cannot be executed');

function ctx(runId: string): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: "principal-1" }, run: { id: runId }, input: {}, signal: new AbortController().signal };
}

function registration(handler: ToolRegistration["handler"]): ToolRegistration {
  return { descriptor: { id: "admin.publish_content", description: "fake" }, policy: { authorize: () => "allow" }, handler } as ToolRegistration;
}

function isDisconnected(err: unknown, cause: Error): boolean {
  assert.ok(err instanceof FrontendDisconnectedError);
  assert.match(err.message, /^frontend_disconnected \(retryable\): /, "the model only sees the message, so it carries the code");
  assert.match(err.message, /reload the admin page/i);
  assert.equal(err.cause, cause);
  return true;
}

test("a run whose bind token was unknown gets the admin reload message", async () => {
  const lost = createLostFrontendBindings({ messages: ADMIN_TAB_LOST_FRONTEND_MESSAGES });
  lost.noteBindError({ runId: "run-1", error: unknownTokenError });
  const wrapped = lost.wrap({ registration: registration(async () => { throw unboundError; }) });

  await assert.rejects(wrapped.handler(ctx("run-1")), (err: Error) => err.message === LOST_FRONTEND_BINDING_MESSAGE && err.cause === unboundError);
});

test("another run's 'no frontend is bound' names the server-side alternative and says nothing changed", async () => {
  const lost = createLostFrontendBindings({ messages: ADMIN_TAB_LOST_FRONTEND_MESSAGES });
  const wrapped = lost.wrap({ registration: registration(async () => { throw unboundError; }) });

  await assert.rejects(wrapped.handler(ctx("run-2")), (err: Error) => {
    assert.match(err.message, /nothing was changed/);
    assert.match(err.message, /publish_content_publish/);
    return isDisconnected(err, unboundError);
  });
});

test("a tab that detaches mid-call says the outcome is unknown", async () => {
  const lost = createLostFrontendBindings({ messages: ADMIN_TAB_LOST_FRONTEND_MESSAGES });
  const detached = new Error('frontend session "s-1" detached before answering');
  const wrapped = lost.wrap({ registration: registration(async () => { throw detached; }) });

  await assert.rejects(wrapped.handler(ctx("run-1")), (err: Error) => {
    assert.match(err.message, /outcome is unknown/);
    return isDisconnected(err, detached);
  });
});
