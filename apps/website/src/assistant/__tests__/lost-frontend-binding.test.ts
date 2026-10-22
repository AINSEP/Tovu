import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { createLostFrontendBindings, FrontendDisconnectedError, LOST_FRONTEND_BINDING_MESSAGE } from "../lost-frontend-binding.js";

/**
 * @file Certifies the clearer frontend-tool failure for a run whose tab bound with a token the
 * daemon no longer knows (the API — and so the daemon's in-memory session registry — restarted
 * under an open admin tab). Error texts are the EXACT upstream wordings from `@jini-ai/daemon`'s
 * `frontend-session-registry.ts` (`bindRunByToken` and `invoke`), so a change to either is caught
 * here rather than silently falling back to the bare message.
 */

const unknownTokenError = new Error('FrontendSessionRegistry: cannot bind run "run-1" — unknown or expired bind token');
const unboundError = new Error('no frontend is bound to run "run-1", so "admin.publish_content" cannot be executed');

function ctx(runId: string): ToolExecutionContext {
  return {
    executionId: "exec-1",
    principal: { id: "principal-1" },
    run: { id: runId },
    input: {},
    signal: new AbortController().signal,
  };
}

function registration(handler: ToolRegistration["handler"]): ToolRegistration {
  return {
    descriptor: { id: "admin.publish_content", description: "fake" },
    policy: { authorize: () => "allow" },
    handler,
  } as ToolRegistration;
}

test("a run whose bind token was unknown gets the reload message instead of the bare 'no frontend is bound'", async () => {
  const lost = createLostFrontendBindings();
  lost.noteBindError({ runId: "run-1", error: unknownTokenError });
  const wrapped = lost.wrap(registration(async () => { throw unboundError; }));

  await assert.rejects(wrapped.handler(ctx("run-1")), (err: Error) => {
    assert.equal(err.message, LOST_FRONTEND_BINDING_MESSAGE);
    assert.equal(err.cause, unboundError);
    return true;
  });
});

/** A run with no restart record whose tab is simply gone (closed, reloaded, socket dropped). */
function isDisconnected(err: unknown, cause: Error): boolean {
  assert.ok(err instanceof FrontendDisconnectedError);
  assert.equal(err.code, "frontend_disconnected");
  assert.equal(err.retryable, true);
  assert.match(err.message, /^frontend_disconnected \(retryable\): /, "the model only sees the message, so it carries the code");
  assert.match(err.message, /reload the admin page/i);
  assert.equal(err.cause, cause);
  return true;
}

test("another run's 'no frontend is bound' becomes a recoverable frontend_disconnected error naming the server-side alternative", async () => {
  const lost = createLostFrontendBindings();
  lost.noteBindError({ runId: "run-1", error: unknownTokenError });
  const wrapped = lost.wrap(registration(async () => { throw unboundError; }));

  await assert.rejects(wrapped.handler(ctx("run-2")), (err: Error) => {
    assert.match(err.message, /nothing was changed/);
    assert.match(err.message, /publish_content_publish/);
    return isDisconnected(err, unboundError);
  });
});

test("a tab that detaches mid-call is also frontend_disconnected, and says the outcome is unknown", async () => {
  const lost = createLostFrontendBindings();
  const detached = new Error('frontend session "s-1" detached before answering');
  const wrapped = lost.wrap(registration(async () => { throw detached; }));

  await assert.rejects(wrapped.handler(ctx("run-1")), (err: Error) => {
    assert.match(err.message, /outcome is unknown/);
    return isDisconnected(err, detached);
  });
});

test("a bind error that is not about the token is not recorded", async () => {
  const lost = createLostFrontendBindings();
  lost.noteBindError({ runId: "run-1", error: new SyntaxError("Unexpected token } in JSON") });
  const wrapped = lost.wrap(registration(async () => { throw unboundError; }));

  await assert.rejects(wrapped.handler(ctx("run-1")), (err: Error) => err.message !== LOST_FRONTEND_BINDING_MESSAGE && isDisconnected(err, unboundError));
});

test("other failures of a lost-binding run pass through unchanged, and success is untouched", async () => {
  const lost = createLostFrontendBindings();
  lost.noteBindError({ runId: "run-1", error: unknownTokenError });
  const other = new Error("capability timed out");
  const failing = lost.wrap(registration(async () => { throw other; }));
  const ok = lost.wrap(registration(async () => ({ done: true })));

  await assert.rejects(failing.handler(ctx("run-1")), (err: Error) => err === other);
  assert.deepEqual(await ok.handler(ctx("run-1")), { done: true });
});

test("the record is bounded: the oldest run is forgotten first", async () => {
  const lost = createLostFrontendBindings({ maxRuns: 2 });
  for (const runId of ["run-a", "run-b", "run-c"]) lost.noteBindError({ runId, error: unknownTokenError });
  const wrapped = lost.wrap(registration(async () => { throw unboundError; }));

  await assert.rejects(wrapped.handler(ctx("run-a")), (err: Error) => isDisconnected(err, unboundError));
  await assert.rejects(wrapped.handler(ctx("run-c")), (err: Error) => err.message === LOST_FRONTEND_BINDING_MESSAGE);
});

test("a non-Error rejection passes through untouched", async () => {
  const lost = createLostFrontendBindings();
  const wrapped = lost.wrap(registration(async () => { throw "plain string"; }));
  await assert.rejects(wrapped.handler(ctx("run-1")), (err: unknown) => err === "plain string");
});
