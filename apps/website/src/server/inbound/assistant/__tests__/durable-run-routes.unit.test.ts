import assert from "node:assert/strict";
import { test } from "node:test";
import type { Express, Request, Response, NextFunction } from "express";
import type { DurableRun, DurableRunStore } from "#src/assistant/durable-runs/ports";
import type { ChatRunLedger } from "#src/assistant/persistence/run-ledger";
import { registerDurableToolGuard, registerDurableRunStartRoute } from "../durable-run-routes.js";
import { UNKNOWN_MUTATION_ERROR } from "#src/assistant/durable-runs/continuation";

function router() {
  const routes = new Map<string, (req: Request, res: Response, next: NextFunction) => void>();
  const app = { post: (path: string, handler: (req: Request, res: Response, next: NextFunction) => void) => routes.set(path, handler) } as unknown as Express;
  return { app, routes };
}

function response() {
  let resolve!: () => void;
  const done = new Promise<void>((ready) => { resolve = ready; });
  const sent: { status: number; body: unknown }[] = [];
  let code = 200;
  const res = { status: (value: number) => { code = value; return res; }, json: (body: unknown) => { sent.push({ status: code, body }); resolve(); return res; } } as unknown as Response;
  return { res, sent, done };
}

test("the delegated route blocks an unknown identical mutation with exact structured error and allows read-only verification", async () => {
  for (const readOnly of [false, true]) {
    const h = router(); const out = response(); let executions = 0;
    const run = { message: { runStatus: "running" }, cancelReason: null } as DurableRun;
    const durable = { find: async () => run, guardTool: async () => "unknown" } as unknown as DurableRunStore;
    registerDurableToolGuard({ app: h.app, ledger: { durable } as ChatRunLedger, isReadOnly: () => readOnly, messageIdForAttempt: async () => "answer" }, {});
    const req = { body: { runId: "next", toolId: "custom_credential_make_request", input: { method: "POST", path: "/user/repos" } } } as Request;
    h.routes.get("/api/delegated-tool-calls")!(req, out.res, (() => { executions++; out.res.json({ verified: true }); }) as NextFunction);
    await out.done;
    assert.equal(executions, readOnly ? 1 : 0);
    assert.deepEqual(out.sent, readOnly ? [{ status: 200, body: { verified: true } }] : [{ status: 409, body: { error: { code: "TOOL_OUTCOME_UNKNOWN", message: UNKNOWN_MUTATION_ERROR } } }]);
  }
});

test("a stale delegated attempt is fenced even for a read-only tool and even after its message binding disappears", async () => {
  const h = router(); const out = response();
  const durable = { find: async () => null } as unknown as DurableRunStore;
  registerDurableToolGuard({ app: h.app, ledger: { durable } as ChatRunLedger, isReadOnly: () => true, messageIdForAttempt: async () => "deleted-answer" }, {});
  h.routes.get("/api/delegated-tool-calls")!({ body: { runId: "old", toolId: "read_state" } } as Request, out.res, (() => assert.fail("stale attempt executed")) as NextFunction);
  await out.done;
  assert.deepEqual(out.sent, [{ status: 409, body: { error: { code: "STALE_RUN_ATTEMPT", message: "This execution attempt no longer owns the answer." } } }]);
});

test("the mutation response is withheld until its completed result is durably recorded", { timeout: 2000 }, async () => {
  const h = router(); const out = response();
  const calls: unknown[] = [];
  let recording!: () => void;
  const recordingStarted = new Promise<void>((ready) => { recording = ready; });
  let release!: () => void;
  const committed = new Promise<void>((ready) => { release = ready; });
  const durable = { find: async () => ({ message: { runStatus: "running" }, cancelReason: null }), guardTool: async () => "allowed",
    completeTool: async (value: unknown) => { calls.push(value); recording(); await committed; },
  } as unknown as DurableRunStore;
  registerDurableToolGuard({ app: h.app, ledger: { durable } as ChatRunLedger, isReadOnly: () => false, messageIdForAttempt: async () => "answer" }, {});
  h.routes.get("/api/delegated-tool-calls")!({ body: { runId: "old", toolId: "create_repo", toolUseId: "repo", input: {} } } as Request, out.res,
    (() => out.res.json({ result: { status: "completed", output: { status: 201 } } })) as NextFunction);
  // Wait for the persistence port, not an assumed number of async guard microtasks. The
  // response must still be withheld after recording starts and until the commit completes.
  await recordingStarted;
  try {
    assert.deepEqual(out.sent, []);
    assert.deepEqual(calls, [{ runId: "old", toolUseId: "repo", content: '{"status":201}' }]);
  } finally { release(); }
  await out.done;
  assert.deepEqual(out.sent, [{ status: 200, body: { result: { status: "completed", output: { status: 201 } } } }]);
});

test("durable daemon starts use the accepted attempt id and never dispatch an unowned or canceled binding", async () => {
  for (const binding of [null, { cancelReason: "user-stop", message: { runStatus: "queued" } }]) {
    const h = router(); const out = response();
    const store = { find: async () => binding } as unknown as DurableRunStore;
    registerDurableRunStartRoute({ app: h.app, store, lifecycle: { start: async () => assert.fail("excluded binding spawned") } as never, onStarted: () => assert.fail("excluded binding started") }, {});
    h.routes.get("/api/runs")!({ body: { runId: "old" }, get: () => "admin" } as unknown as Request, out.res, (() => assert.fail("unexpected fallthrough")) as NextFunction);
    await out.done;
    assert.deepEqual(out.sent, [{ status: 409, body: { error: "This execution attempt no longer owns the answer.", code: "STALE_RUN_ATTEMPT" } }]);
  }
});

test("duplicate accepted POSTs keep the chosen attempt id and call the executor once", async () => {
  const h = router(); const calls: unknown[] = []; let starts = 0; let executions = 0;
  const run = { id: "chosen", state: "running" };
  const store = { find: async (required: unknown) => { calls.push(required); return { request: { agentId: "codex", contextRef: "saved-context" }, cancelReason: null, message: { runStatus: "queued" } }; } } as unknown as DurableRunStore;
  registerDurableRunStartRoute({ app: h.app, store, lifecycle: {
    start: async (required: unknown, optional: unknown) => { calls.push([required, optional]); return { run, started: ++starts === 1 }; }, get: async () => run,
  } as never, onStarted: async () => { executions++; } }, {});
  for (const started of [true, false]) {
    const out = response();
    h.routes.get("/api/runs")!({ body: { runId: "chosen" }, get: () => "admin" } as unknown as Request, out.res, (() => assert.fail("unexpected next")) as NextFunction);
    await out.done;
    assert.deepEqual(out.sent, [{ status: 201, body: { run, started } }]);
  }
  assert.equal(executions, 1);
  assert.deepEqual(calls, [
    { runId: "chosen", principalId: "admin" }, [{ contextRef: "saved-context" }, { contextRef: "saved-context", agentId: "codex", idempotencyKey: "chosen", runId: "chosen" }],
    { runId: "chosen", principalId: "admin" }, [{ contextRef: "saved-context" }, { contextRef: "saved-context", agentId: "codex", idempotencyKey: "chosen", runId: "chosen" }],
  ]);
});
