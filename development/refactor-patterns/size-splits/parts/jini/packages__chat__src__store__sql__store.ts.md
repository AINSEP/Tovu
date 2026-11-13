### jini:packages/chat/src/store/sql/store.ts
- **Over:** `createSqlChatStore` 317 (file 486, close to the limit)
- **Phase:** now (JINI 317) · **Batch:** size-28
- **Tests:** `src/store/__tests__/sql-store.test.ts`, `src/store/__tests__/sql-cursor.test.ts`, `src/store/__tests__/folders.test.ts`, `src/store/__tests__/reopen.test.ts`, `src/store/__tests__/entries.cov-j2.test.ts`, `src/store/runtime/__tests__/chat-history-store.test.ts`, `src/store/runtime/__tests__/durable-run-store.reads.test.ts` (package `@jini-ai/chat`). No test mocks `sql/store.js`.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| P projections | module-level `MESSAGE_POSITION`, `CONVERSATION_UPDATED_AT`, `ordinalId`, `conversationLockKey`, `ConversationRow`, `MessageRow`, `toConversation`, `safeParse`, `parseJsonColumn`, `toMessage`, `agentFields`, `jsonFields`, `rawMessageMetadata`, `RawMessageRow`, `validatedEventsJson`, `messageJsonChunks`, `messageEventsColumn`, `runFields`, `HistoryRow`, `assertHistoryReadBounds`, `toHistoryMessage`, `updateOwnedMessageConflict`; in-factory `needle`, `midRunCount`, `ownedConversations`, `ownedMessages` | owner-scoped SQL projections and row → domain mapping |
| C conversations | `get`, store `list`, `create`, `rename`, `touch`, `delete` | conversation CRUD |
| M messages | `messages`, `writeMessage`, `nextPosition`, store `message`, `messagesVersion`, `messagesJson`, `appendMessage` | message reads/writes |
| G paging | store `history.list`, `history.read`, `pageConversations`, `pageMessages` | search, history tool and cursor pages |
| B boundary | scope/`run` setup + final `return { … atStoreBoundary … }` | error boundary (stays) |

- **Splits** (in order):
  1. NEW `store-projections.ts`. Job: owner-scoped SQL projections and the row → conversation/message mapping. It takes all of unit P's module-level declarations verbatim, with every comment, and all of them are exported. Three things change on the way:
     - `needle` and `midRunCount` become module-level consts. Their 5-line "Count embedded user messages in SQL…" comment goes with them.
     - `ownedConversations` becomes `export function ownedConversations({ db, scope }: OwnedConversationsInput)`.
     - `ownedMessages` becomes `export function ownedMessages({ db, scope, conversationId }: OwnedMessagesInput, { includeEvents = true }: { includeEvents?: boolean | "user" } = {})`.
     In both, `scopeId`/`ownerKind`/`ownerId` become `scope.scopeId`/`scope.ownerKind`/`scope.ownerId`, and `scope` is typed `ChatOwnerScope`. Return types are inferred.
  2. In `store.ts`, add these module-level declarations above `createSqlChatStore`:
     - `type ChatQueryRunner = <T>(body: (db: Kysely<ChatDatabase>) => T | Promise<T>) => Promise<T>;`
     - `interface ChatStoreContext<DB extends ChatDatabase> { kernel: StorageKernel<DB>; scope: ChatOwnerScope; run: ChatQueryRunner; clock: Clock }`
     - `async function nextMessagePosition({ run, conversationId }: NextMessagePositionInput): Promise<number>`, from `nextPosition`.
     - `function writeOwnedMessage<DB extends ChatDatabase>({ kernel, scope, run, clock, conversationId, message }: WriteOwnedMessageInput<DB>): Promise<ChatMessage | null>`, from `writeMessage`. Its two inner comments move with it.
     - `function createConversationOperations<DB extends ChatDatabase>({ kernel, scope, run, clock }: ChatStoreContext<DB>): Pick<ChatStore, "get" | "list" | "create" | "rename" | "touch" | "delete">`. The body starts with `const { scopeId, ownerKind, ownerId } = scope;`, then the `get` closure, then `return { list, get, create, rename, touch, delete }`. Those are the store literal's methods, verbatim. Declaring the return type keeps their parameters contextually typed.
     - `function createMessageOperations<DB extends ChatDatabase>({ kernel, scope, run, clock, redactionOptions }: CreateMessageOperationsInput<DB>): Pick<ChatStore, "messages" | "message" | "messagesVersion" | "messagesJson" | "appendMessage">`. It holds the `messages` closure plus the store methods `message`, `messagesVersion`, `messagesJson`, `appendMessage`. `writeMessage(conversationId, prepared.message)` becomes `writeOwnedMessage({ kernel, scope, run, clock, conversationId, message: prepared.message })`.
     - `function createPagingOperations<DB extends ChatDatabase>({ kernel, scope, run }: ChatStoreContext<DB>): Pick<ChatStore, "history" | "pageConversations" | "pageMessages">`, holding the store methods `history: { list, read }`, `pageConversations` and `pageMessages`, verbatim.
     Inside all the moved bodies, `ownedConversations(db)` becomes `ownedConversations({ db, scope })` and `ownedMessages(db, x[, opts])` becomes `ownedMessages({ db, scope, conversationId: x }[, opts])`.
  3. `createSqlChatStore` keeps `const scope`, `const { scopeId, ownerKind, ownerId }` (drop it if nothing uses it any more) and `const run` with its comment. Then it adds `const context = { kernel, scope, run, clock };` and `const store: ChatStore = { ...createPagingOperations(context), ...createConversationOperations(context), ...createMessageOperations({ ...context, redactionOptions }) };`. The final `return { … }` stays byte for byte.
- **Importers to update:** `src/store/runtime/durable-run-store.ts`: `toMessage` and `validatedEventsJson` now come from `../sql/store-projections.js`. If the durable-run-store split has already run, that import is in `durable-run-store-reads.ts` instead. `postgres/index.ts`, `pglite/index.ts`, `sqlite/index.ts` and `chat-history-store.test.ts` import only `createSqlChatStore` and stay as they are. Re-run `rg -n "sql/store" packages/chat/src` first.
- **After:** `createSqlChatStore` about 30 lines. `createConversationOperations` about 80, `createPagingOperations` about 75, `createMessageOperations` about 40, `writeOwnedMessage` about 50. store.ts about 330 counted lines, store-projections.ts about 200.
- **Risks / notes:** `midRunCount` is an immutable `sql` fragment built from a constant, so making it module-level doesn't change the SQL. Spreading the three operation objects into `store` produces the same set of keys, and the return wrapper calls `store.x`, so key order doesn't matter. `copyScope` returns a fresh copy, and that copy is what goes into `context.scope`. The existing `store.history!` / `store.message!` in the return wrapper are moved code, so they stay. This change is large and depends on typing (generic `DB`, contextual typing through `Pick`), so I recommend Opus/Fable execute it rather than Terra.
