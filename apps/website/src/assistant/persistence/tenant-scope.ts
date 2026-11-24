import { isDaemonRunId } from "#src/contracts/core/assistant-run-events";

import type { ChatHistoryStore } from "@jini-ai/chat/core";

import { createRunGuardedChatStore, hashSessionKey, type ChatPrincipal } from "@jini-ai/chat/store/runtime";
import { type ChatKernel, chatKernel } from "#src/platform/db/chat-kernel";
import type { SqliteConnectionSource } from "@jini-ai/db/kernel/sqlite";
import { createChatHistoryStore } from "./chat-history-store.js";
import { createChatRunLedger, type ChatRunLedger } from "./run-ledger.js";

/**
 * @file The single place a request handler may obtain chat history — and the only place that
 * decides *whose* history it is.
 *
 * Every read and write in the chat-history store (`chat-history-store.ts`) is filtered by the scope
 * it was constructed with, so the isolation predicate is bound here once instead of being restated (and eventually
 * forgotten) in each route. A handler receives an already-scoped {@link ChatHistoryStore} and
 * never holds the workspace, owner kind, and owner id together with a raw database handle, which
 * is what it would need to write `WHERE id = ?` by hand.
 *
 * This matters more than it looks. Across the design review, the failure every participant ranked
 * most likely was not a wrong line of code — it was a *missing* one: a new route ("export this
 * conversation", "share a transcript") that filters on the conversation id and omits the owner.
 * An omission does not read as wrong in review the way a bad permission string does, and it will
 * not fail any test that was not written to look for it. Making the unscoped form unobtainable is
 * the only mitigation that does not depend on everyone remembering.
 *
 * Guest sessions are keyed by a hash of their cookie, never the cookie itself — see
 * `hashSessionKey` in `@jini-ai/chat/store/runtime`, which also owns `ChatPrincipal`,
 * `ChatStoreFactory`, `chatExpiryFor` and `GUEST_CHAT_TTL_MS`.
 */

/* Server acceptance owns daemon rows, so presentation text cannot decide cancellation or recovery.
 * A lost browser stream still must not release a live execution's conversation slot. */

/**
 * Returns chat history scoped to exactly one principal.
 *
 * There is no sibling function that returns an unscoped store, and that absence is the design.
 * Retention — the one operation that legitimately spans owners — lives in its own module
 * (`chat-expiry-sweep.ts`), not an escape hatch here.
 *
 * @param required.db the chat kernel, or Tovu's open `chat.db` handle (`openChatDb`) whose kernel to use.
 *   The store writes through it and never opens a database of its own.
 * @param optional.ledger the run ledger; it must sit on the same kernel, so `appendMessage`'s write joins
 *   the ledger's transaction.
 * @complexity O(1); the returned store's methods are a few indexed queries each.
 */
export function createTenantScopedChatStore(
  { db, principal }: { db: ChatKernel | SqliteConnectionSource; principal: ChatPrincipal }, { ledger = createChatRunLedger({ store: db }) }: { ledger?: ChatRunLedger } = {},
): ChatHistoryStore {
  return createRunGuardedChatStore({
    isDaemonRunId: ({ runId }) => isDaemonRunId({ runId: runId }),
    store: createChatHistoryStore({ kernel: chatKernel({ store: db }), scope: {
      scopeId: principal.workspaceId, ownerKind: principal.kind,
      ownerId: principal.kind === "user" ? principal.userId : hashSessionKey({ sessionKey: principal.sessionKey }),
    } }),
    ledger,
  }, {});
}
