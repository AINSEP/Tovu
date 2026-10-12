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
