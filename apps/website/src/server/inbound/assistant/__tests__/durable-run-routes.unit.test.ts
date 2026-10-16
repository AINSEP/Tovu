import assert from "node:assert/strict";
import { test } from "node:test";
import type { Express, Request, Response, NextFunction } from "express";
import type { DurableRun, DurableRunStore } from "#src/assistant/durable-runs/ports";
import type { ChatRunLedger } from "#src/assistant/persistence/run-ledger";
import { registerCredentialRunIntake, registerDurableToolGuard, registerDurableRunStartRoute } from "../durable-run-routes.js";
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
    registerDurableToolGuard({ app: h.app, ledger: { durable } as ChatRunLedger, isRegistered: () => true, isReadOnly: () => readOnly, messageIdForAttempt: async () => "answer" }, {});
    const req = { body: { runId: "next", toolId: "custom_credential_make_request", input: { method: "POST", path: "/user/repos" } } } as Request;
    h.routes.get("/api/delegated-tool-calls")!(req, out.res, (() => { executions++; out.res.json({ verified: true }); }) as NextFunction);
    await out.done;
    assert.equal(executions, readOnly ? 1 : 0);
    assert.deepEqual(out.sent, readOnly ? [{ status: 200, body: { verified: true } }] : [{ status: 409, body: { error: { code: "TOOL_OUTCOME_UNKNOWN", message: UNKNOWN_MUTATION_ERROR } } }]);
  }
});

test("a read-only gateway call is never ledgered: the daemon runs it read-only or refuses it unexecuted", async () => {
  const h = router(); const out = response(); const ledgered: string[] = [];
  const run = { message: { runStatus: "running" }, cancelReason: null } as DurableRun;
  const durable = { find: async () => run,
    guardTool: async () => { ledgered.push("tool_use"); return "allowed"; },
    completeTool: async () => { ledgered.push("tool_result"); } } as unknown as DurableRunStore;
  registerDurableToolGuard({ app: h.app, ledger: { durable } as ChatRunLedger, isRegistered: () => true, isReadOnly: () => false, messageIdForAttempt: async () => "answer" }, {});
  const req = { body: { runId: "current", toolUseId: "u1", toolId: "content_read", input: { type: "menu" }, requireReadOnly: true } } as Request;
  h.routes.get("/api/delegated-tool-calls")!(req, out.res, (() => { out.res.json({ result: { status: "completed", output: {} } }); }) as NextFunction);
  await out.done;
  // A ledgered call the daemon then refused stayed an orphan and turned the advised retry into a 409.
  assert.deepEqual(ledgered, []);
  assert.deepEqual(out.sent, [{ status: 200, body: { result: { status: "completed", output: {} } } }]);
});

test("an unregistered tool id reaches the daemon without a 409 or any durable tool event", { timeout: 2000 }, async () => {
  for (const outcome of ["unknown", "allowed"] as const) {
    const h = router(); const out = response(); const ledgered: string[] = [];
    const durable = {
      find: async () => ({ message: { runStatus: "running" }, cancelReason: null }),
      guardTool: async () => { ledgered.push("tool_use"); return outcome; },
      completeTool: async () => { ledgered.push("tool_result"); },
    } as unknown as DurableRunStore;
    registerDurableToolGuard({ app: h.app, ledger: { durable } as ChatRunLedger,
      isRegistered: ({ toolId }) => { assert.equal(toolId, "content_read"); return false; },
      isReadOnly: () => false, messageIdForAttempt: async () => "answer" }, {});
    h.routes.get("/api/delegated-tool-calls")!({ body: { runId: "current", toolId: "content_read", toolUseId: "missing", input: { type: "menu" } } } as Request,
      out.res, (() => out.res.json({ result: { status: "completed", output: {} } })) as NextFunction);
    await out.done;
    assert.deepEqual(out.sent, [{ status: 200, body: { result: { status: "completed", output: {} } } }]);
    assert.deepEqual(ledgered, []);
  }
});

test("a stale delegated attempt is fenced even for a read-only tool and even after its message binding disappears", async () => {
  for (const requireReadOnly of [undefined, true]) {
    const h = router(); const out = response();
    const durable = { find: async () => null } as unknown as DurableRunStore;
    registerDurableToolGuard({ app: h.app, ledger: { durable } as ChatRunLedger, isRegistered: () => true, isReadOnly: () => true, messageIdForAttempt: async () => "deleted-answer" }, {});
    h.routes.get("/api/delegated-tool-calls")!({ body: { runId: "old", toolId: "read_state", requireReadOnly } } as Request, out.res, (() => assert.fail("stale attempt executed")) as NextFunction);
    await out.done;
    assert.deepEqual(out.sent, [{ status: 409, body: { error: { code: "STALE_RUN_ATTEMPT", message: "This execution attempt no longer owns the answer." } } }]);
  }
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
  registerDurableToolGuard({ app: h.app, ledger: { durable } as ChatRunLedger, isRegistered: () => true, isReadOnly: () => false, messageIdForAttempt: async () => "answer" }, {});
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

test('daemon intake sanitizes both bound and headless starts before lifecycle persistence', () => {
  for (const runId of [undefined, 'accepted']) {
    const h = router(); const out = response(); let forwarded = false;
    registerCredentialRunIntake({ app: h.app }, {});
    const secret = 'sk-' + 'A1b2C3d4E5f6G7h8I9j0';
    const body = { runId, contextRef: JSON.stringify({ prompt: `Use ${secret} please`, principalId: 'owner' }) };
    h.routes.get('/api/runs')!({ body } as Request, out.res, (() => { forwarded = true; }) as NextFunction);
    assert.equal(forwarded, true); assert.deepEqual(out.sent, []);
    assert.deepEqual(JSON.parse(body.contextRef), { prompt: 'Use [token removed] please', principalId: 'owner', secretRedacted: true });
    assert.equal(body.contextRef.includes(secret), false, 'raw credential reached lifecycle acceptance');
  }
});

test("credential intake passes absent bodies and non-string contextRef values through unchanged", () => {
  for (const body of [undefined, null, {}, { contextRef: null }, { contextRef: 42 }, { contextRef: { prompt: "hello" } }]) {
    const h = router(); const out = response(); const nextCalls: unknown[][] = [];
    const before = structuredClone(body);
    const req = { body } as Request;
    registerCredentialRunIntake({ app: h.app }, {});
    h.routes.get("/api/runs")!(req, out.res, ((...args: unknown[]) => nextCalls.push(args)) as NextFunction);
    assert.deepEqual(nextCalls, [[]]);
    assert.deepEqual(out.sent, []);
    assert.strictEqual(req.body, body);
    assert.deepEqual(req.body, before);
  }
});

test("credential intake rejects invalid JSON and non-object JSON with the exact 400", () => {
  for (const contextRef of ["{", "null", "[]", '"text"', "42"]) {
    const h = router(); const out = response(); const nextCalls: unknown[][] = [];
    registerCredentialRunIntake({ app: h.app }, {});
    h.routes.get("/api/runs")!({ body: { contextRef } } as Request, out.res, ((...args: unknown[]) => nextCalls.push(args)) as NextFunction);
    assert.deepEqual(out.sent, [{ status: 400, body: { error: "The run context must be a JSON object.", code: "VALIDATION_ERROR" } }]);
    assert.deepEqual(nextCalls, []);
  }
});

test("durable starts pass absent bodies and non-string runId values to the ordinary daemon route", () => {
  for (const body of [undefined, null, {}, { runId: null }, { runId: 42 }]) {
    const h = router(); const out = response(); const nextCalls: unknown[][] = []; const finds: unknown[] = [];
    const store = { find: async (required: unknown) => { finds.push(required); return null; } } as unknown as DurableRunStore;
    registerDurableRunStartRoute({ app: h.app, store, lifecycle: {} as never, onStarted: () => assert.fail("unbound start dispatched") }, {});
    h.routes.get("/api/runs")!({ body, get: () => "admin" } as unknown as Request, out.res, ((...args: unknown[]) => nextCalls.push(args)) as NextFunction);
    assert.deepEqual(nextCalls, [[]]);
    assert.deepEqual(out.sent, []);
    assert.deepEqual(finds, []);
  }
});

test("durable starts reject terminal and missing run statuses before dispatch", { timeout: 2000 }, async () => {
  for (const runStatus of ["completed", "failed", "cancelled", undefined, null, ""]) {
    const h = router(); const out = response(); const nextCalls: unknown[][] = [];
    const store = { find: async () => ({ cancelReason: null, message: { runStatus }, request: { contextRef: "saved" } }) } as unknown as DurableRunStore;
    registerDurableRunStartRoute({ app: h.app, store, lifecycle: { start: async () => assert.fail("terminal binding spawned") } as never,
      onStarted: () => assert.fail("terminal binding dispatched") }, {});
    h.routes.get("/api/runs")!({ body: { runId: "old" }, get: () => "admin" } as unknown as Request, out.res,
      ((...args: unknown[]) => nextCalls.push(args)) as NextFunction);
    await out.done;
    assert.deepEqual(out.sent, [{ status: 409, body: { error: "This execution attempt no longer owns the answer.", code: "STALE_RUN_ATTEMPT" } }]);
    assert.deepEqual(nextCalls, []);
  }
});

test("durable starts prefer a supplied string context and return the lifecycle's latest run", { timeout: 2000 }, async () => {
  const h = router(); const out = response(); const calls: unknown[] = []; const nextCalls: unknown[][] = [];
  const startedRun = { id: "chosen", state: "queued" }; const latestRun = { id: "chosen", state: "running" };
  const store = { find: async (required: unknown) => { calls.push(required); return {
    request: { agentId: "codex", contextRef: "saved-context" }, cancelReason: null, message: { runStatus: "running" },
  }; } } as unknown as DurableRunStore;
  const lifecycle = { start: async (required: unknown, optional: unknown) => { calls.push([required, optional]); return { run: startedRun, started: true }; },
    get: async (required: unknown) => { calls.push(required); return latestRun; } };
  registerDurableRunStartRoute({ app: h.app, store, lifecycle: lifecycle as never,
    onStarted: async (required) => { calls.push(required); } }, {});
  h.routes.get("/api/runs")!({ body: { runId: "chosen", contextRef: "provided-context", agentId: "untrusted-agent" }, get: () => "admin" } as unknown as Request,
    out.res, ((...args: unknown[]) => nextCalls.push(args)) as NextFunction);
  await out.done;
  const request = { contextRef: "provided-context", agentId: "codex", idempotencyKey: "chosen" };
  assert.deepEqual(calls, [{ runId: "chosen", principalId: "admin" }, [{ contextRef: "provided-context" }, { ...request, runId: "chosen" }],
    { request, run: startedRun, lifecycle }, { runId: "chosen" }]);
  assert.deepEqual(out.sent, [{ status: 201, body: { run: latestRun, started: true } }]);
  assert.deepEqual(nextCalls, []);
});

test("durable starts fall back to saved context, empty principal and the started run without dispatching duplicates", { timeout: 2000 }, async () => {
  for (const contextRef of [undefined, null, 42, { prompt: "ignored" }]) {
    const h = router(); const out = response(); const calls: unknown[] = []; const nextCalls: unknown[][] = [];
    const run = { id: "chosen", state: "running" };
    const store = { find: async (required: unknown) => { calls.push(required); return {
      request: { agentId: "claude", contextRef: "saved-context" }, cancelReason: null, message: { runStatus: "queued" },
    }; } } as unknown as DurableRunStore;
    registerDurableRunStartRoute({ app: h.app, store, lifecycle: {
      start: async (required: unknown, optional: unknown) => { calls.push([required, optional]); return { run, started: false }; }, get: async () => null,
    } as never, onStarted: () => assert.fail("duplicate was dispatched") }, {});
    h.routes.get("/api/runs")!({ body: { runId: "chosen", contextRef }, get: () => undefined } as unknown as Request,
      out.res, ((...args: unknown[]) => nextCalls.push(args)) as NextFunction);
    await out.done;
    assert.deepEqual(calls, [{ runId: "chosen", principalId: "" }, [{ contextRef: "saved-context" },
      { contextRef: "saved-context", agentId: "claude", idempotencyKey: "chosen", runId: "chosen" }]]);
    assert.deepEqual(out.sent, [{ status: 201, body: { run, started: false } }]);
    assert.deepEqual(nextCalls, []);
  }
});

test("durable start failures reach next(err) without sending a success", { timeout: 2000 }, async () => {
  for (const stage of ["find", "start", "onStarted", "get"]) {
    const h = router(); const out = response(); const failure = new Error(`${stage} unavailable`); const nextCalls: unknown[][] = [];
    let finish!: () => void; const done = new Promise<void>((resolve) => { finish = resolve; });
    const store = { find: async () => { if (stage === "find") throw failure;
      return { request: { contextRef: "saved" }, cancelReason: null, message: { runStatus: "running" } }; } } as unknown as DurableRunStore;
    registerDurableRunStartRoute({ app: h.app, store, lifecycle: {
      start: async () => { if (stage === "start") throw failure; return { run: { id: "chosen" }, started: true }; },
      get: async () => { if (stage === "get") throw failure; return null; },
    } as never, onStarted: async () => { if (stage === "onStarted") throw failure; } }, {});
    h.routes.get("/api/runs")!({ body: { runId: "chosen" }, get: () => "admin" } as unknown as Request, out.res,
      ((...args: unknown[]) => { nextCalls.push(args); finish(); }) as NextFunction);
    await done;
    assert.deepEqual(nextCalls, [[failure]]);
    assert.strictEqual(nextCalls[0]![0], failure);
    assert.deepEqual(out.sent, []);
  }
});

test("delegated calls pass absent bodies and either non-string id through before consulting registration", () => {
  for (const body of [undefined, null, {}, { runId: 42, toolId: "write" }, { runId: "chosen", toolId: 42 },
    { runId: null, toolId: "write" }, { runId: "chosen", toolId: null }]) {
    const h = router(); const out = response(); const nextCalls: unknown[][] = [];
    registerDurableToolGuard({ app: h.app, ledger: {} as ChatRunLedger, isRegistered: () => assert.fail("invalid ids reached registration"),
      isReadOnly: () => assert.fail("invalid ids reached classification"), messageIdForAttempt: async () => assert.fail("invalid ids reached binding lookup") }, {});
    h.routes.get("/api/delegated-tool-calls")!({ body } as Request, out.res, ((...args: unknown[]) => nextCalls.push(args)) as NextFunction);
    assert.deepEqual(nextCalls, [[]]);
    assert.deepEqual(out.sent, []);
  }
});

test("delegated calls without a durable store fall through without read-only or binding lookups", () => {
  const h = router(); const out = response(); const registrations: unknown[] = []; const nextCalls: unknown[][] = [];
  registerDurableToolGuard({ app: h.app, ledger: {} as ChatRunLedger,
    isRegistered: (required, optional) => { registrations.push([required, optional]); return true; },
    isReadOnly: () => assert.fail("storeless call was classified"), messageIdForAttempt: async () => assert.fail("storeless call looked up a binding") }, {});
  h.routes.get("/api/delegated-tool-calls")!({ body: { runId: "chosen", toolId: "write" } } as Request, out.res,
    ((...args: unknown[]) => nextCalls.push(args)) as NextFunction);
  assert.deepEqual(registrations, [[{ toolId: "write" }, {}]]);
  assert.deepEqual(nextCalls, [[]]);
  assert.deepEqual(out.sent, []);
});

test("only literal requireReadOnly true bypasses mutation guarding", { timeout: 2000 }, async () => {
  for (const requireReadOnly of [true, false, undefined, "true", 1, null]) {
    const h = router(); const out = response(); const classified: unknown[] = []; const nextCalls: unknown[][] = [];
    const durable = { find: async () => ({ cancelReason: null, message: { runStatus: "running" } }), guardTool: async () => "unknown" } as unknown as DurableRunStore;
    registerDurableToolGuard({ app: h.app, ledger: { durable } as ChatRunLedger, isRegistered: () => true,
      isReadOnly: (required, optional) => { classified.push([required, optional]); return false; }, messageIdForAttempt: async () => "answer" }, {});
    h.routes.get("/api/delegated-tool-calls")!({ body: { runId: "chosen", toolId: "write", requireReadOnly } } as Request, out.res,
      ((...args: unknown[]) => { nextCalls.push(args); out.res.json({ executed: true }); }) as NextFunction);
    await out.done;
    assert.deepEqual(classified, requireReadOnly === true ? [] : [[{ toolId: "write" }, {}]]);
    assert.deepEqual(out.sent, requireReadOnly === true ? [{ status: 200, body: { executed: true } }] :
      [{ status: 409, body: { error: { code: "TOOL_OUTCOME_UNKNOWN", message: UNKNOWN_MUTATION_ERROR } } }]);
    assert.deepEqual(nextCalls, requireReadOnly === true ? [[]] : []);
  }
});

test("registered read-only metadata skips both mutation guarding and completed-result capture", { timeout: 2000 }, async () => {
  const h = router(); const out = response(); const ledgered: string[] = [];
  const durable = { find: async () => ({ cancelReason: null, message: { runStatus: "running" } }),
    guardTool: async () => { ledgered.push("guard"); return "allowed"; }, completeTool: async () => { ledgered.push("complete"); } } as unknown as DurableRunStore;
  registerDurableToolGuard({ app: h.app, ledger: { durable } as ChatRunLedger, isRegistered: () => true, isReadOnly: () => true,
    messageIdForAttempt: async () => assert.fail("persisted run needs no binding fallback") }, {});
  h.routes.get("/api/delegated-tool-calls")!({ body: { runId: "chosen", toolId: "read", toolUseId: "u1", requireReadOnly: false } } as Request,
    out.res, (() => out.res.json({ result: { status: "completed", output: { verified: true } } })) as NextFunction);
  await out.done;
  assert.deepEqual(ledgered, []);
  assert.deepEqual(out.sent, [{ status: 200, body: { result: { status: "completed", output: { verified: true } } } }]);
});

test("a missing durable run without a chat binding retains the daemon's execution policy", { timeout: 2000 }, async () => {
  const h = router(); const out = response(); const calls: unknown[] = [];
  const durable = { find: async (required: unknown, optional: unknown) => { calls.push([required, optional]); return null; },
    guardTool: async () => assert.fail("headless call was guarded") } as unknown as DurableRunStore;
  registerDurableToolGuard({ app: h.app, ledger: { durable } as ChatRunLedger, isRegistered: () => true, isReadOnly: () => false,
    messageIdForAttempt: async (required, optional) => { calls.push([required, optional]); return null; } }, {});
  h.routes.get("/api/delegated-tool-calls")!({ body: { runId: "headless", toolId: "write" } } as Request, out.res,
    (() => out.res.json({ executed: true })) as NextFunction);
  await out.done;
  assert.deepEqual(calls, [[{ runId: "headless" }, {}], [{ runId: "headless" }, {}]]);
  assert.deepEqual(out.sent, [{ status: 200, body: { executed: true } }]);
});

test("canceled and inactive delegated attempts are fenced before mutation or read-only execution", { timeout: 2000 }, async () => {
  for (const binding of [{ cancelReason: "user-stop", message: { runStatus: "running" } },
    ...["completed", "failed", "cancelled", undefined, null, ""].map((runStatus) => ({ cancelReason: null, message: { runStatus } }))]) {
    for (const readOnly of [false, true]) {
      const h = router(); const out = response(); const nextCalls: unknown[][] = [];
      const durable = { find: async () => binding, guardTool: async () => "allowed" } as unknown as DurableRunStore;
      registerDurableToolGuard({ app: h.app, ledger: { durable } as ChatRunLedger, isRegistered: () => true, isReadOnly: () => readOnly,
        messageIdForAttempt: async () => assert.fail("existing run should not use binding fallback") }, {});
      h.routes.get("/api/delegated-tool-calls")!({ body: { runId: "old", toolId: "tool" } } as Request, out.res,
        ((...args: unknown[]) => nextCalls.push(args)) as NextFunction);
      await out.done;
      assert.deepEqual(out.sent, [{ status: 409, body: { error: { code: "STALE_RUN_ATTEMPT", message: "This execution attempt no longer owns the answer." } } }]);
      assert.deepEqual(nextCalls, []);
    }
  }
});

test("a stale guardTool outcome is reported as stale rather than an unknown mutation", { timeout: 2000 }, async () => {
  const h = router(); const out = response(); const nextCalls: unknown[][] = [];
  const durable = { find: async () => ({ cancelReason: null, message: { runStatus: "running" } }), guardTool: async () => "stale" } as unknown as DurableRunStore;
  registerDurableToolGuard({ app: h.app, ledger: { durable } as ChatRunLedger, isRegistered: () => true, isReadOnly: () => false, messageIdForAttempt: async () => "answer" }, {});
  h.routes.get("/api/delegated-tool-calls")!({ body: { runId: "chosen", toolId: "write" } } as Request, out.res,
    ((...args: unknown[]) => nextCalls.push(args)) as NextFunction);
  await out.done;
  assert.deepEqual(out.sent, [{ status: 409, body: { error: { code: "STALE_RUN_ATTEMPT", message: "This execution attempt no longer owns the answer." } } }]);
  assert.deepEqual(nextCalls, []);
});

test("mutations without a toolUseId are guarded but do not capture completed responses", { timeout: 2000 }, async () => {
  for (const toolUseId of [undefined, ""]) {
    const h = router(); const out = response(); const guarded: unknown[] = []; const completed: unknown[] = [];
    const durable = { find: async () => ({ cancelReason: null, message: { runStatus: "running" } }),
      guardTool: async (required: unknown, optional: unknown) => { guarded.push([required, optional]); return "allowed"; },
      completeTool: async (required: unknown) => { completed.push(required); } } as unknown as DurableRunStore;
    registerDurableToolGuard({ app: h.app, ledger: { durable } as ChatRunLedger, isRegistered: () => true, isReadOnly: () => false, messageIdForAttempt: async () => "answer" }, {});
    h.routes.get("/api/delegated-tool-calls")!({ body: { runId: "chosen", toolId: "write", toolUseId, input: { title: "hello" } } } as Request,
      out.res, (() => out.res.json({ result: { status: "completed", output: { saved: true } } })) as NextFunction);
    await out.done;
    assert.deepEqual(guarded, [[{ runId: "chosen", toolId: "write", toolUseId, input: { title: "hello" } }, {}]]);
    assert.deepEqual(completed, []);
    assert.deepEqual(out.sent, [{ status: 200, body: { result: { status: "completed", output: { saved: true } } } }]);
  }
});

test("captured responses pass non-completed and absent results through without persistence", { timeout: 2000 }, async () => {
  for (const reply of [null, {}, { error: { code: "NOT_FOUND" } }, { result: null }, { result: {} },
    { result: { status: "failed", output: { error: "denied" } } }, { result: { status: "pending" } }]) {
    const h = router(); const out = response(); const completed: unknown[] = [];
    const durable = { find: async () => ({ cancelReason: null, message: { runStatus: "running" } }), guardTool: async () => "allowed",
      completeTool: async (required: unknown) => { completed.push(required); } } as unknown as DurableRunStore;
    registerDurableToolGuard({ app: h.app, ledger: { durable } as ChatRunLedger, isRegistered: () => true, isReadOnly: () => false, messageIdForAttempt: async () => "answer" }, {});
    h.routes.get("/api/delegated-tool-calls")!({ body: { runId: "chosen", toolId: "write", toolUseId: "u1" } } as Request, out.res,
      (() => out.res.status(202).json(reply)) as NextFunction);
    await out.done;
    assert.deepEqual(completed, []);
    assert.deepEqual(out.sent, [{ status: 202, body: reply }]);
    assert.strictEqual(out.sent[0]!.body, reply);
  }
});

test("queued mutations persist completed outputs including the undefined-to-null fallback", { timeout: 2000 }, async () => {
  for (const output of [undefined, null, { saved: true }]) {
    const h = router(); const out = response(); const calls: unknown[] = [];
    const durable = { find: async () => ({ cancelReason: null, message: { runStatus: "queued" } }),
      guardTool: async (required: unknown, optional: unknown) => { calls.push(["guard", required, optional]); return "allowed"; },
      completeTool: async (required: unknown, optional: unknown) => { calls.push(["complete", required, optional]); } } as unknown as DurableRunStore;
    registerDurableToolGuard({ app: h.app, ledger: { durable } as ChatRunLedger, isRegistered: () => true, isReadOnly: () => false, messageIdForAttempt: async () => "answer" }, {});
    h.routes.get("/api/delegated-tool-calls")!({ body: { runId: "chosen", toolId: "write", toolUseId: "u1", input: { title: "hello" } } } as Request,
      out.res, (() => out.res.json({ result: { status: "completed", output } })) as NextFunction);
    await out.done;
    assert.deepEqual(calls, [["guard", { runId: "chosen", toolId: "write", toolUseId: "u1", input: { title: "hello" } }, {}],
      ["complete", { runId: "chosen", toolUseId: "u1", content: output == null ? "null" : '{"saved":true}' }, {}]]);
    assert.deepEqual(out.sent, [{ status: 200, body: { result: { status: "completed", output } } }]);
  }
});

test("completed-result persistence rejection returns 503 TOOL_OUTCOME_UNKNOWN without publishing success", { timeout: 2000 }, async () => {
  const h = router(); const out = response(); const completed: unknown[] = []; const nextCalls: unknown[][] = [];
  const durable = { find: async () => ({ cancelReason: null, message: { runStatus: "running" } }), guardTool: async () => "allowed",
    completeTool: async (required: unknown, optional: unknown) => { completed.push([required, optional]); throw new Error("store offline"); } } as unknown as DurableRunStore;
  registerDurableToolGuard({ app: h.app, ledger: { durable } as ChatRunLedger, isRegistered: () => true, isReadOnly: () => false, messageIdForAttempt: async () => "answer" }, {});
  h.routes.get("/api/delegated-tool-calls")!({ body: { runId: "chosen", toolId: "write", toolUseId: "u1" } } as Request, out.res,
    ((...args: unknown[]) => { nextCalls.push(args); out.res.json({ result: { status: "completed", output: { saved: true } } }); }) as NextFunction);
  await out.done;
  assert.deepEqual(completed, [[{ runId: "chosen", toolUseId: "u1", content: '{"saved":true}' }, {}]]);
  assert.deepEqual(out.sent, [{ status: 503, body: { error: { code: "TOOL_OUTCOME_UNKNOWN", message: UNKNOWN_MUTATION_ERROR } } }]);
  assert.deepEqual(nextCalls, [[]]);
});

test("delegated guard failures reach next(err) without execution or a response", { timeout: 2000 }, async () => {
  for (const stage of ["find", "messageIdForAttempt", "guardTool"]) {
    const h = router(); const out = response(); const failure = new Error(`${stage} offline`); const nextCalls: unknown[][] = [];
    let finish!: () => void; const done = new Promise<void>((resolve) => { finish = resolve; });
    const durable = { find: async () => { if (stage === "find") throw failure;
      return stage === "messageIdForAttempt" ? null : { cancelReason: null, message: { runStatus: "running" } }; },
      guardTool: async () => { throw failure; } } as unknown as DurableRunStore;
    registerDurableToolGuard({ app: h.app, ledger: { durable } as ChatRunLedger, isRegistered: () => true, isReadOnly: () => false,
      messageIdForAttempt: async () => { throw failure; } }, {});
    h.routes.get("/api/delegated-tool-calls")!({ body: { runId: "chosen", toolId: "write", toolUseId: "u1" } } as Request,
      out.res, ((...args: unknown[]) => { nextCalls.push(args); finish(); }) as NextFunction);
    await done;
    assert.deepEqual(nextCalls, [[failure]]);
    assert.strictEqual(nextCalls[0]![0], failure);
    assert.deepEqual(out.sent, []);
  }
});
