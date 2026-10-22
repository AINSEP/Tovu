import assert from "node:assert/strict";
import test from "node:test";
import type { Express, Request, Response, NextFunction } from "express";
import type { RouteDeps } from "../routes/types.js";
import { createAssistantModule } from "../runtime/composition/modules/assistant.js";
import { assistantRunFinalizerFor } from "../runtime/composition/modules/assistant-run-finalizer.js";

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
  createAssistantModule(deps, {} as never).registerRoutes!(app);
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
  assistantRunFinalizerFor({ ledger: deps.chatRunLedger }, {}).recover = async (input: unknown) => { calls.push(["recover", input]); };
  createAssistantModule(deps, {} as never).registerRoutes!(app);
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
