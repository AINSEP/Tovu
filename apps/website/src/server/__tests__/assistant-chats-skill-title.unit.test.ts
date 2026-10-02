import assert from "node:assert/strict";
import test from "node:test";
import type { Express, Request, Response, NextFunction } from "express";
import { createAssistantChatsModule } from "../runtime/composition/modules/assistant-chats.js";
import type { RouteDeps } from "../routes/types.js";
import type { AssistantRunFinalizer } from "../runtime/composition/modules/assistant-run-finalizer.js";

type Handler = (req: Request, res: Response, next: NextFunction) => void;
function harness() {
  const routes = new Map<string, Handler>();
  let title: string | null = null;
  const store = {
    create: async (input: { title?: string }) => ({ id: "c", title: input.title ?? null }),
    get: async () => ({ id: "c", title }),
    rename: async (_id: string, value: string) => { title = value; },
    appendMessage: async (_id: string, message: unknown) => message,
  };
  const app = { use() {}, ...Object.fromEntries(["get", "post", "put", "patch", "delete"].map(method => [method, (path: string, handler: Handler) => { routes.set(`${method} ${path}`, handler); }])) } as unknown as Express;
  const deps = { workspaceId: "ws", chatHistory: () => store, chatRunLedger: { reconcileInterrupted: async () => 0 } } as unknown as RouteDeps;
  createAssistantChatsModule(deps, { finalizer: { watch() {} } as unknown as AssistantRunFinalizer }).registerRoutes!(app);
  const invoke = (route: string, body: object) => new Promise<Record<string, any>>((resolve, reject) => {
    const res = { locals: { principal: { id: "owner" } }, status() { return this; }, json: resolve } as unknown as Response;
    routes.get(route)!({ body, params: { id: "c", messageId: "u" } } as unknown as Request, res, reject);
  });
  return { invoke, title: () => title };
}

test("skill-only create uses the installed skill's exact name", async () => {
  const h = harness();
  for (const name of ["ui-ux-design", "deployment"]) {
    const result = await h.invoke("post /api/assistant/chats", { firstMessage: name });
    assert.equal(result.conversation.title, name);
  }
});

test("skill-only first user message uses its name, while user prose still uses the normal title heuristic", async () => {
  const h = harness();
  await h.invoke("put /api/assistant/chats/:id/messages/:messageId", { role: "user", content: "incident-response", createdAt: 1 });
  assert.equal(h.title(), "incident-response");
  const prose = harness();
  await prose.invoke("put /api/assistant/chats/:id/messages/:messageId", { role: "user", content: "Redesign the menu", createdAt: 1 });
  assert.equal(prose.title(), "Redesign Menu");
});
