import assert from "node:assert/strict";
import test from "node:test";
import type { Express, Request, Response, NextFunction } from "express";
import type { RouteDeps } from "../routes/types.js";
import { createAssistantModule } from "../runtime/composition/modules/assistant.js";
import { assistantRunFinalizerFor } from "../runtime/composition/modules/run-finalizer/shared.js";
import { RUN_SLOT_BUSY, RunSlotBusyError } from "@jini-ai/chat/store/runtime";

test("checkpoint GET follows the saved message without recovery and denies other owners/workspaces", async () => {
  const routes = new Map<string, (req: Request, res: Response, next: NextFunction) => void>();
  const app = { use: () => app, post: () => app, delete: () => app,
    get: (path: string, handler: (req: Request, res: Response, next: NextFunction) => void) => { routes.set(path, handler); return app; },
  } as unknown as Express;
  const loads: unknown[] = [];
  const message = { id: "answer", role: "assistant", content: "Saved work", runId: "replacement", runStatus: "running" };
  const run = { messageId: "answer", conversationId: "chat", principalId: "owner", workspaceId: "ws", message };
  const deps = { workspaceId: "ws", siteStoragePaths: { chatAttachmentsDir: "/unused" }, chatRunLedger: { durable: { load: async (input: unknown) => { loads.push(input); return run; } } } } as unknown as RouteDeps;
  let recoveries = 0;
  assistantRunFinalizerFor({ ledger: deps.chatRunLedger }, {}).recover = async () => { recoveries++; throw new Error("GET called recovery"); };
  createAssistantModule({ routeDeps: deps, byokSurfaceExchanges: {} as never }).registerRoutes!({ app });
  for (const [principalId, workspaceId, status] of [["owner", "ws", 200], ["owner", "other", 404], ["other", "ws", 404]] as const) {
    Object.assign(run, { principalId, workspaceId });
    let code = 200;
    const result = await new Promise<unknown>((resolve, reject) => {
      const res = { locals: { principal: { id: "owner" } }, status: (value: number) => { code = value; return res; }, json: resolve } as unknown as Response;
      routes.get("/api/runs/:runId/checkpoint")!({ method: "GET", params: { runId: "old" }, query: { messageId: "answer" } } as unknown as Request, res, reject);
    });
    assert.equal(code, status); assert.deepEqual(result, status === 200 ? { message, conversationId: "chat" } : { error: "not found" });
  }
  assert.equal(recoveries, 0); assert.deepEqual(loads, [{ messageId: "answer" }, { messageId: "answer" }, { messageId: "answer" }]);
});

/** POST /recover: only the owning principal in this workspace triggers a browser recovery, the
 * answer is the row as saved AFTER recovery, and a run located by id (no messageId) works too. */
test("recover POST runs the finalizer for an owned run and answers the post-recovery row", async () => {
  const posts = new Map<string, (req: Request, res: Response, next: NextFunction) => void>();
  const app = { use: () => app, get: () => app, delete: () => app,
    post: (path: string, handler: (req: Request, res: Response, next: NextFunction) => void) => { posts.set(path, handler); return app; },
  } as unknown as Express;
  const saved = { id: "answer", role: "assistant", content: "Recovered", runId: "run-1", runStatus: "succeeded" };
  const run = { messageId: "answer", runId: "run-1", conversationId: "chat", principalId: "owner", workspaceId: "ws", message: { ...saved, content: "" } };
  let afterRecovery: unknown = { ...run, message: saved };
  const calls: unknown[] = [];
  const durable = {
    load: async (input: unknown) => { calls.push(["load", input]); return calls.some((call) => (call as unknown[])[0] === "recover") ? afterRecovery : run; },
    find: async (input: unknown) => { calls.push(["find", input]); return run; },
  };
  const deps = { workspaceId: "ws", siteStoragePaths: { chatAttachmentsDir: "/unused" }, chatRunLedger: { durable } } as unknown as RouteDeps;
  assistantRunFinalizerFor({ ledger: deps.chatRunLedger }, {}).recover = async (input: unknown) => { calls.push(["recover", input]); return "finalized"; };
  createAssistantModule({ routeDeps: deps, byokSurfaceExchanges: {} as never }).registerRoutes!({ app });
  const post = (req: Record<string, unknown>, principal = "owner") => new Promise<{ code: number; body: unknown }>((resolve, reject) => {
    let code = 200;
    const res = { locals: { principal: { id: principal } }, status: (value: number) => { code = value; return res; }, json: (body: unknown) => resolve({ code, body }) } as unknown as Response;
    posts.get("/api/runs/:runId/recover")!({ method: "POST", params: { runId: "run-1" }, ...req } as unknown as Request, res, reject);
  });

  assert.deepEqual(await post({ body: { messageId: "answer" } }), { code: 200, body: { message: saved, conversationId: "chat" } });
  assert.deepEqual(calls, [["load", { messageId: "answer" }], ["recover", { messageId: "answer", trigger: "browser" }], ["load", { messageId: "answer" }]]);

  calls.length = 0;
  assert.deepEqual(await post({ body: undefined }, "intruder"), { code: 404, body: { error: "not found" } });
  assert.deepEqual(calls, [["find", { runId: "run-1", principalId: "intruder" }]], "a run another principal owns is never recovered");

  calls.length = 0;
  afterRecovery = null;
  assert.deepEqual(await post({ body: {} }), { code: 404, body: { error: "not found" } });
  assert.deepEqual(calls.map((call) => (call as unknown[])[0]), ["find", "recover", "load"]);
});


test('unchanged checkpoint uses the scoped raw poll and returns an empty 304 without JSON parsing', async t => {
  let handler!: (req: Request, res: Response, next: NextFunction) => void;
  const app = { use: () => app, post: () => app, delete: () => app,
    get: (path: string, route: typeof handler) => { if (path === '/api/runs/:runId/checkpoint') handler = route; return app; },
  } as unknown as Express;
  const calls: unknown[] = [];
  const deps = { workspaceId: 'ws', siteStoragePaths: { chatAttachmentsDir: '/unused' }, chatRunLedger: { durable: {
    poll: async (input: unknown, options: unknown) => { calls.push([input, options]); return { cursor: 'boot:10:1' }; },
    head: () => assert.fail('poll must never read the parsed head'),
  } } } as unknown as RouteDeps;
  createAssistantModule({ routeDeps: deps, byokSurfaceExchanges: {} as never }).registerRoutes!({ app });
  const parse = t.mock.method(JSON, 'parse');
  let status = 200;
  const chunks: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const res = { locals: { principal: { id: 'owner' } }, setHeader() {}, status(value: number) { status = value; return res; },
      write(value: string) { chunks.push(value); }, end(value?: string) { if (value) chunks.push(value); resolve(); },
      json() { assert.fail('unchanged poll must not serialize a message'); },
    };
    handler({ method: 'GET', params: { runId: 'old' }, query: { messageId: 'answer' }, get: () => '"boot:10:1"' } as unknown as Request, res as unknown as Response, reject);
  });
  assert.equal(status, 304);
  assert.equal(chunks.join('').length, 0);
  assert.equal(parse.mock.callCount(), 0);
  assert.deepEqual(calls, [[{ messageId: 'answer', principalId: 'owner', workspaceId: 'ws' }, { cursor: 'boot:10:1' }]]);
});

/** Drives one GET of the checkpoint route through a minimal Express-shaped response that records
 * every header, status and written chunk. */
async function pollCheckpoint(handler: (req: Request, res: Response, next: NextFunction) => void, ifNoneMatch: string | undefined) {
  const headers: Record<string, string> = {};
  const chunks: string[] = [];
  let status = 200; let type: string | undefined; let json: unknown;
  await new Promise<void>((resolve, reject) => {
    const res = { locals: { principal: { id: 'owner' } }, setHeader(name: string, value: string) { headers[name] = value; },
      status(value: number) { status = value; return res; }, type(value: string) { type = value; return res; },
      write(value: string) { chunks.push(value); }, end(value?: string) { if (value) chunks.push(value); resolve(); },
      json(value: unknown) { json = value; resolve(); },
    };
    handler({ method: 'GET', params: { runId: 'old' }, query: { messageId: 'answer' }, get: (name: string) => name === 'If-None-Match' ? ifNoneMatch : undefined } as unknown as Request,
      res as unknown as Response, reject);
  });
  return { status, headers, type, body: chunks.join(''), json };
}

test('a changed checkpoint streams the saved message JSON verbatim under its new ETag; a malformed or absent ETag polls from the start; an unowned poll is 404', async () => {
  let handler!: (req: Request, res: Response, next: NextFunction) => void;
  const app = { use: () => app, post: () => app, delete: () => app,
    get: (path: string, route: typeof handler) => { if (path === '/api/runs/:runId/checkpoint') handler = route; return app; },
  } as unknown as Express;
  const options: unknown[] = [];
  const answers: Array<{ cursor: string; conversationId: string; messageJson: string } | null> = [
    { cursor: 'boot:11:2', conversationId: 'chat', messageJson: '{"id":"answer","content":"Saved work"}' },
    { cursor: 'boot:12:1', conversationId: 'chat', messageJson: '{"id":"answer","content":"More"}' },
    null,
  ];
  const deps = { workspaceId: 'ws', siteStoragePaths: { chatAttachmentsDir: '/unused' }, chatRunLedger: { durable: {
    poll: async (_input: unknown, option: unknown) => { options.push(option); return answers.shift() ?? null; },
  } } } as unknown as RouteDeps;
  createAssistantModule({ routeDeps: deps, byokSurfaceExchanges: {} as never }).registerRoutes!({ app });

  const changed = await pollCheckpoint(handler, undefined);
  assert.equal(changed.status, 200);
  assert.equal(changed.type, 'json');
  assert.deepEqual(changed.headers, { ETag: '"boot:11:2"', 'Cache-Control': 'private, no-store' });
  assert.equal(changed.body, '{"conversationId":"chat","message":{"id":"answer","content":"Saved work"}}');
  assert.deepEqual(JSON.parse(changed.body), { conversationId: 'chat', message: { id: 'answer', content: 'Saved work' } });

  const malformed = await pollCheckpoint(handler, 'W/"not a cursor!"');
  assert.equal(malformed.headers.ETag, '"boot:12:1"');

  const missing = await pollCheckpoint(handler, '"boot:12:1"');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.json, { error: 'not found' });
  assert.deepEqual(options, [{}, {}, { cursor: 'boot:12:1' }], 'only a well-formed quoted cursor is handed to the store');
});

/** POST /api/runs with a conversation + assistant message id is accepted into the durable ledger
 * here (201/404) instead of being forwarded; a busy chat slot is a 409 and anything else reaches
 * Express's error handler. */
test('a durable run start answers 201 with the accepted run, 404 when the ledger declines, 409 on a busy slot, and other failures reach next', async () => {
  let start!: (req: Request, res: Response, next: NextFunction) => void;
  const app = { use: () => app, get: () => app, delete: () => app,
    post: (path: string, route: typeof start) => { if (path === '/api/runs') start = route; return app; },
  } as unknown as Express;
  const accepted: Array<{ request: { agentId?: string; contextRef: string }; principalId: string; workspaceId: string; conversationId: string; messageId: string }> = [];
  const outcomes: Array<'run' | null | Error> = ['run', 'run', null, new RunSlotBusyError(), new Error('ledger offline')];
  const durable = {
    accept: async (input: { request: { agentId?: string; contextRef: string }; principalId: string; workspaceId: string; conversationId: string; messageId: string; runId: string }) => {
      accepted.push({ request: input.request, principalId: input.principalId, workspaceId: input.workspaceId, conversationId: input.conversationId, messageId: input.messageId });
      const outcome = outcomes.shift();
      if (outcome instanceof Error) throw outcome;
      if (outcome === null) return null;
      // A run already past `queued` is never relaunched, so no daemon is contacted here.
      return { runId: 'run-7', messageId: input.messageId, conversationId: input.conversationId, principalId: input.principalId, workspaceId: 'ws',
        request: input.request, recoveryCount: 0, cancelReason: null, message: { id: input.messageId, role: 'assistant', content: '', runStatus: 'running' } };
    },
  };
  const captures: unknown[] = [];
  const deps = { workspaceId: 'ws', siteStoragePaths: { chatAttachmentsDir: '/unused' }, chatRunLedger: { durable },
    tracker: { capture: (...args: unknown[]) => { captures.push(args); }, error: () => {} } } as unknown as RouteDeps;
  const watched: unknown[] = [];
  assistantRunFinalizerFor({ ledger: deps.chatRunLedger }, {}).watch = (input: unknown) => { watched.push(input); };
  createAssistantModule({ routeDeps: deps, byokSurfaceExchanges: {} as never }).registerRoutes!({ app });
  const send = (body: Record<string, unknown>) => new Promise<{ code: number; body?: unknown; error?: unknown }>((resolve) => {
    let code = 200;
    const res = { locals: { principal: { id: 'owner' } }, status: (value: number) => { code = value; return res; }, json: (value: unknown) => resolve({ code, body: value }) } as unknown as Response;
    start({ method: 'POST', body } as unknown as Request, res, (error?: unknown) => resolve({ code, error }));
  });
  const contextRef = JSON.stringify({ conversationId: 'chat', assistantMessageId: 'answer', prompt: 'hi', routine: { routineId: 'forged' } });

  assert.deepEqual(await send({ contextRef, agentId: 'claude' }), { code: 201, body: { run: { id: 'run-7' }, messageId: 'answer', conversationId: 'chat' } });
  assert.deepEqual(accepted[0]!.request.agentId, 'claude');
  assert.deepEqual(JSON.parse(accepted[0]!.request.contextRef), { conversationId: 'chat', assistantMessageId: 'answer', prompt: 'hi', principalId: 'owner' },
    'the browser routine marker is stripped and the session principal is stamped');
  assert.deepEqual([accepted[0]!.principalId, accepted[0]!.workspaceId, accepted[0]!.conversationId, accepted[0]!.messageId], ['owner', 'ws', 'chat', 'answer']);
  assert.deepEqual(watched, [{ principalId: 'owner', conversationId: 'chat', message: { id: 'answer', role: 'assistant', content: '', runStatus: 'running' } }],
    'the accepted run is attached to the finalizer');

  assert.deepEqual(await send({ contextRef }), { code: 201, body: { run: { id: 'run-7' }, messageId: 'answer', conversationId: 'chat' } });
  assert.equal('agentId' in accepted[1]!.request, false, 'a missing agentId is not forwarded');

  assert.deepEqual(await send({ contextRef, agentId: 'claude' }), { code: 404, body: { error: 'not found' } });
  assert.deepEqual(await send({ contextRef, agentId: 'claude' }), { code: 409, body: { error: RUN_SLOT_BUSY, code: 'CHAT_RUN_BUSY' } });
  const failed = await send({ contextRef, agentId: 'claude' });
  assert.equal((failed.error as Error).message, 'ledger offline');
  assert.equal(failed.body, undefined);
  assert.equal(accepted.length, 5);
});
