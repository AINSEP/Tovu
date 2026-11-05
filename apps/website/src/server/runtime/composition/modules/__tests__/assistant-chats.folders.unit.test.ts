import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough } from "node:stream";
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


test("history GET streams stored JSON without loading parsed messages", async () => {
  let route: ((req: never, res: never, next: (error: unknown) => void) => unknown) | undefined;
  const app = new Proxy({}, { get: (_target, method) => (path: unknown, handler: typeof route) => {
    if (method === 'get' && path === '/api/assistant/chats/:id/messages') route = handler;
    return app;
  } });
  let messagesRead = false;
  const chunks = ['{"messages":[', '{"id":"a","role":"assistant","content":"saved","events":', '[{"kind":"text","text":"saved"}]', '}]}'];
  createAssistantChatsModule({ workspaceId: 'ws', chatHistory: () => ({
    messagesJson: async ({ conversationId }: { conversationId: string }) => {
      assert.equal(conversationId, 'c');
      return (async function* () { yield* chunks; })();
    },
    messages: async () => { messagesRead = true; throw new Error('parsed history read'); },
  }) } as never, { finalizer: {} as never }).registerRoutes!(app as never);
  const response = Object.assign(new PassThrough({ highWaterMark: 1 }), {
    locals: { principal: { id: 'owner' } },
    type(value: string) { assert.equal(value, 'json'); return this; },
  });
  let text = '';
  const finished = new Promise<void>((resolve, reject) => { response.on('data', chunk => { text += chunk; }); response.on('end', resolve); response.on('error', reject); });
  route!({ params: { id: 'c' } } as never, response as never, error => { throw error; });
  await finished;
  assert.equal(text, chunks.join(''));
  assert.equal(messagesRead, false);
});

test("conversation DELETE requests metadata without unused events", async () => {
  let route: ((req: never, res: never, next: (error: unknown) => void) => unknown) | undefined;
  const app = new Proxy({}, { get: (_target, method) => (path: unknown, handler: typeof route) => {
    if (method === 'delete' && path === '/api/assistant/chats/:id') route = handler;
    return app;
  } });
  let options: unknown;
  createAssistantChatsModule({ workspaceId: 'ws', chatHistory: () => ({
    messages: async (_required: unknown, optional: unknown) => { options = optional; return []; },
    delete: async () => {},
  }) } as never, { finalizer: {} as never }).registerRoutes!(app as never);
  let finish!: () => void;
  const finished = new Promise<void>(resolve => { finish = resolve; });
  const response = { locals: { principal: { id: 'owner' } }, status(code: number) { assert.equal(code, 204); return this; }, end: finish };
  route!({ params: { id: 'c' } } as never, response as never, error => { throw error; });
  await finished;
  assert.deepEqual(options, { includeEvents: false });
});


test('unchanged history refresh never loads message rows or opens the history stream', async () => {
  let route!: (req: never, res: never, next: (error: unknown) => void) => unknown;
  const app = new Proxy({}, { get: (_target, method) => (path: unknown, handler: typeof route) => {
    if (method === 'get' && path === '/api/assistant/chats/:id/messages') route = handler;
    return app;
  } });
  createAssistantChatsModule({ workspaceId: 'ws', chatHistory: () => ({
    messagesVersion: async () => 'v1',
    messagesJson: async () => assert.fail('unchanged history must not read JSON'),
    messages: async () => assert.fail('unchanged history must not read messages'),
  }) } as never, { finalizer: {} as never }).registerRoutes!(app as never);
  let status = 200;
  const headers: Record<string, string> = {};
  await new Promise<void>((resolve, reject) => {
    const response = { locals: { principal: { id: 'owner' } },
      setHeader(key: string, value: string) { headers[key] = value; },
      status(code: number) { status = code; return response; },
      json(body: unknown) { assert.deepEqual(body, { unchanged: true }); resolve(); },
    };
    route({ params: { id: 'c' }, query: { ifVersion: '"v1"' } } as never, response as never, reject);
  });
  assert.equal(status, 200);
  assert.equal(headers.ETag, '"v1"');
});

test('an aborted raw history stream does not reach the server error handler', async () => {
  let route!: (req: never, res: never, next: (error: unknown) => void) => unknown;
  const app = new Proxy({}, { get: (_target, method) => (path: unknown, handler: typeof route) => {
    if (method === 'get' && path === '/api/assistant/chats/:id/messages') route = handler;
    return app;
  } });
  createAssistantChatsModule({ workspaceId: 'ws', chatHistory: () => ({
    messagesJson: async () => (async function* () { for (let i = 0; i < 100; i++) yield 'x'.repeat(1024); })(),
  }) } as never, { finalizer: {} as never }).registerRoutes!(app as never);
  const response = Object.assign(new PassThrough({ highWaterMark: 1 }), {
    locals: { principal: { id: 'owner' } }, type() { return this; },
  });
  const errors: unknown[] = [];
  const closed = new Promise<void>(resolve => response.once('close', resolve));
  response.once('data', () => response.destroy());
  route({ params: { id: 'c' } } as never, response as never, error => { errors.push(error); });
  await closed;
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(errors, []);
});


test('the explicit history version returns only a tiny unchanged body', async () => {
  let route!: (req: never, res: never, next: (error: unknown) => void) => unknown;
  const app = new Proxy({}, { get: (_target, method) => (path: unknown, handler: typeof route) => {
    if (method === 'get' && path === '/api/assistant/chats/:id/messages') route = handler;
    return app;
  } });
  createAssistantChatsModule({ workspaceId: 'ws', chatHistory: () => ({
    messagesVersion: async () => 'v1', messagesJson: async () => assert.fail('no history read'),
  }) } as never, { finalizer: {} as never }).registerRoutes!(app as never);
  const body = await new Promise<unknown>((resolve, reject) => {
    const response = { locals: { principal: { id: 'owner' } }, setHeader() {}, json: resolve };
    route({ params: { id: 'c' }, query: { ifVersion: '"v1"' } } as never, response as never, reject);
  });
  assert.deepEqual(body, { unchanged: true });
  assert.ok(JSON.stringify(body).length < 32);
});
