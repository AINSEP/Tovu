import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from "node:assert/strict";
import test from "node:test";
import type { Express, Request, Response, NextFunction } from "express";
import { createAssistantChatsModule } from "../runtime/composition/modules/assistant-chats.js";
import type { RouteDeps } from "../routes/types.js";
import type { AssistantRunFinalizer } from "../runtime/composition/modules/run-finalizer/entry.js";
import { createTracker } from "@jini-ai/diagnostics/observability/node";

type Handler = (req: Request, res: Response, next: NextFunction) => void;
type SavedRow = { id: string; runId?: string; runStatus?: string };
function harness({ renameFails = false, saved = [] as SavedRow[] }: { renameFails?: boolean; saved?: SavedRow[] } = {}) {
  const routes = new Map<string, Handler>();
  let title: string | null = null;
  const calls: unknown[][] = [];
  const store = {
    create: async (input: { title?: string }) => ({ id: "c", title: input.title ?? null }),
    get: async () => ({ id: "c", title }),
    rename: async ({ title: value }: { id: string; title: string }) => { if (renameFails) throw new Error("disk full"); title = value; },
    appendMessage: async ({ message }: { conversationId: string; message: unknown }) => message,
    messages: async (...args: unknown[]) => { calls.push(["messages", ...args]); return saved; },
    delete: async (...args: unknown[]) => { calls.push(["delete", ...args]); },
  };
  const app = { use() {}, ...Object.fromEntries(["get", "post", "put", "patch", "delete"].map(method => [method, (path: string, handler: Handler) => { routes.set(`${method} ${path}`, handler); }])) } as unknown as Express;
  const deps = { workspaceId: "ws", tracker: createTracker({}), chatHistory: () => store, chatRunLedger: { reconcileInterrupted: async () => 0,
    durable: { head: async () => null, cancel: async (...args: unknown[]) => { calls.push(["cancel", ...args]); } } } } as unknown as RouteDeps;
  const finalizer = { watch() {}, recover: async (...args: unknown[]) => { calls.push(["recover", ...args]); } };
  createAssistantChatsModule(deps, { finalizer: finalizer as unknown as AssistantRunFinalizer }).registerRoutes!({ errors: createRouteIncidentReporter().errors, app });
  const invoke = (route: string, body: object) => new Promise<Record<string, any>>((resolve, reject) => {
    const res = { locals: { principal: { id: "owner" } }, status() { return this; }, json: resolve } as unknown as Response;
    routes.get(route)!({ body, params: { id: "c", messageId: "u" } } as unknown as Request, res, reject);
  });
  /** Resolves with the status a route ended with (`res.status(n).end()`). */
  const invokeEnd = (route: string) => new Promise<number>((resolve, reject) => {
    let status = 200;
    const res = { locals: { principal: { id: "owner" } }, status(code: number) { status = code; return this; }, end: () => resolve(status) } as unknown as Response;
    routes.get(route)!({ body: {}, params: { id: "c" } } as unknown as Request, res, reject);
  });
  return { invoke, invokeEnd, calls, title: () => title };
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
  assert.equal(prose.title(), "Redesign the menu");
});

test("a pasted secret is redacted from the auto title", async () => {
  const h = harness();
  // Built at runtime so no credential-shaped literal sits in the source.
  const pasted = ["sk", "fakefakefakefakefakefake"].join("-");
  await h.invoke("put /api/assistant/chats/:id/messages/:messageId", { role: "user", content: `Use this key ${pasted} for deploy`, createdAt: 1 });
  assert.ok(h.title(), "the chat still gets a title");
  assert.ok(!h.title()!.toLowerCase().includes(pasted), "the auto title must not contain the pasted secret");
});

test("a title that cannot be saved never fails the saved message; the chat stays untitled", async () => {
  const h = harness({ renameFails: true });
  const result = await h.invoke("put /api/assistant/chats/:id/messages/:messageId", { role: "user", content: "Redesign the menu", createdAt: 1 });
  assert.equal(result.message.content, "Redesign the menu", "the message is still answered as saved");
  assert.equal(h.title(), null);
});

test("deleting a chat cancels and recovers each queued or running turn first, then deletes it", async () => {
  const h = harness({ saved: [
    { id: "m-done", runId: "run-done", runStatus: "succeeded" },
    { id: "m-queued", runId: "run-q", runStatus: "queued" },
    { id: "m-plain" },
    { id: "m-running", runId: "run-r", runStatus: "running" },
    { id: "m-no-run", runStatus: "running" },
  ] });
  assert.equal(await h.invokeEnd("delete /api/assistant/chats/:id"), 204);
  assert.deepEqual(h.calls, [
    ["messages", { conversationId: "c" }, { includeEvents: false }],
    ["cancel", { runId: "run-q", reason: "conversation-deleted" }, {}],
    ["recover", { messageId: "m-queued", trigger: "browser" }, {}],
    ["cancel", { runId: "run-r", reason: "conversation-deleted" }, {}],
    ["recover", { messageId: "m-running", trigger: "browser" }, {}],
    ["delete", { id: "c" }],
  ]);
});
