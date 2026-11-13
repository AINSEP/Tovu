### tovu:apps/website/src/server/runtime/composition/modules/assistant-chats.ts
- **Over:** `createAssistantChatsModule` 152 · its `registerRoutes` 139 (file 193, under)
- **Phase:** now (label ?) · **Batch:** size-01
- **Tests:** `apps/website/src/server/__tests__/assistant-chats-routes.test.ts`, `.../__tests__/assistant-chats-skill-title.unit.test.ts`, `.../__tests__/assistant-chat-recovery.unit.test.ts`, `.../__tests__/assistant-run-finalizer.test.ts`. No test mocks this module.
- **Responsibility map** (inside `registerRoutes`):

| unit | statement anchor | job |
|---|---|---|
| A (stays) | `const reconciled = (options.recoverInterrupted ? …`, `options.onBootWork`, the two `app.use("/api/assistant/chats", …)` | boot repair gate + admin session |
| B | `function storeFor(res: Response) {` | per-requester chat store |
| C (stays) | `app.get("/api/assistant/chats", …`, `app.post("/api/assistant/chats", …`, `app.delete("/api/assistant/chats/:id", …` | list / create / delete (≤15 lines each) |
| D | `app.patch("/api/assistant/chats/:id", (req, res, next) => {` | rename/update a chat |
| E | `app.get("/api/assistant/chats/:id/messages", (req, res, next) => {` | read a chat's messages |
| F | `app.put("/api/assistant/chats/:id/messages/:messageId", (req, res, next) => {` | append/replace a message (+ first-message naming) |

- **Splits:** HELPERS at module level directly above `createAssistantChatsModule`:
  1. `chatStoreFor({ deps, res }: ChatStoreForInput)` ← `storeFor` body (keep its comment; return type = what it returns today). In `registerRoutes` keep `const storeFor = (res: Response) => chatStoreFor({ deps, res });` so the route bodies stay unchanged.
  2. `handleUpdateChat({ req, res, next, storeFor }: ChatRouteInput): void` ← D's handler body.
  3. `handleListChatMessages({ req, res, next, storeFor }: ChatRouteInput): void` ← E.
  4. `handlePutChatMessage({ req, res, next, storeFor }: ChatRouteInput): void` ← F.
  One shared input type `ChatRouteInput = { req: Request; res: Response; next: NextFunction; storeFor: (res: Response) => ReturnType<typeof chatStoreFor> }`. Registrations: `app.patch(PATH, (req, res, next) => handleUpdateChat({ req, res, next, storeFor }));` etc., same order. If a body uses `options`/`finalizer`, add them to that helper's input (check with the outline: D-F use only `storeFor` + module helpers).
- **Importers to update:** none.
- **After:** `registerRoutes` ~65; `createAssistantChatsModule` ~78; file ~210.
- **Risks / notes:** handlers are synchronous `(req, res, next)` that call `next(error)` — keep them synchronous (no `async`).
