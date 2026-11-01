import assert from "node:assert/strict";
import test from "node:test";
import { createAssistantChatsModule } from "../assistant-chats.js";

test("the message PUT rejects invalid folder references before calling storage", async () => {
  let written = 0;
  let route: ((req: never, res: never, next: (error: unknown) => void) => unknown) | undefined;
  const app = new Proxy({}, { get: (_target, method) => (path: unknown, handler: typeof route) => {
    if (method === 'put' && path === '/api/assistant/chats/:id/messages/:messageId') route = handler;
    return app;
  } });
  createAssistantChatsModule({ workspaceId: 'ws', chatHistory: () => ({ appendMessage: async () => { written++; return null; } }) } as never,
    { finalizer: {} as never }).registerRoutes!(app as never);
  let status = 0;
  let respond!: () => void;
  const responded = new Promise<void>(resolve => { respond = resolve; });
  const response = { locals: { principal: { id: 'owner' } }, status(code: number) { status = code; return this; }, json() { respond(); return this; } };
  route!({ params: { id: 'c', messageId: 'm' }, body: { role: 'user', content: 'Inspect', folders: ['relative'] } } as never, response as never, error => { throw error; });
  await responded;
  assert.equal(status, 400);
  assert.equal(written, 0);
});
