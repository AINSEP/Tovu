import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { createLostFrontendBindings, LOST_FRONTEND_BINDING_MESSAGE } from "../lost-frontend-binding.js";

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

test("another run's 'no frontend is bound' is left alone", async () => {
  const lost = createLostFrontendBindings();
  lost.noteBindError({ runId: "run-1", error: unknownTokenError });
  const wrapped = lost.wrap(registration(async () => { throw unboundError; }));

  await assert.rejects(wrapped.handler(ctx("run-2")), (err: Error) => err === unboundError);
});

test("a bind error that is not about the token is not recorded", async () => {
  const lost = createLostFrontendBindings();
  lost.noteBindError({ runId: "run-1", error: new SyntaxError("Unexpected token } in JSON") });
  const wrapped = lost.wrap(registration(async () => { throw unboundError; }));

  await assert.rejects(wrapped.handler(ctx("run-1")), (err: Error) => err === unboundError);
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

  await assert.rejects(wrapped.handler(ctx("run-a")), (err: Error) => err === unboundError);
  await assert.rejects(wrapped.handler(ctx("run-c")), (err: Error) => err.message === LOST_FRONTEND_BINDING_MESSAGE);
});
