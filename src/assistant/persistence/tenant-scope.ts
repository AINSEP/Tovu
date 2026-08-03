import { createHash } from "node:crypto";

import { createChatHistoryStore } from "@jini-ai/sqlite";
import type { ChatHistoryStore } from "@jini-ai/chat/core";
import type { Database as SqliteDatabase } from "better-sqlite3";

/**
 * @file The single place a request handler may obtain chat history — and the only place that
 * decides *whose* history it is.
 *
 * Every read and write in `@jini-ai/sqlite`'s store is filtered by the scope it was constructed
 * with, so the isolation predicate is bound here once instead of being restated (and eventually
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
 * {@link hashSessionKey}.
 */

/** How long a visitor's chat history survives without activity. */
export const GUEST_CHAT_TTL_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Hashes a visitor's session key for storage.
 *
 * The cookie is a bearer credential: anyone holding it can read that visitor's transcripts. Stored
 * raw, a database dump, a stray log line, or a backup handed to a contractor becomes a set of live
 * session tokens. Hashed, the same leak yields values that cannot be replayed against the site.
 *
 * Plain SHA-256 rather than a password KDF, deliberately: the input is a high-entropy random token
 * we generate, not a user-chosen secret, so there is nothing for a slow hash to protect against —
 * and this runs on every request to the public assistant, where a deliberately slow hash would be
 * a self-inflicted denial of service.
 */
export function hashSessionKey(sessionKey: string): string {
  return createHash("sha256").update(sessionKey).digest("hex");
}

/** An authenticated staff member. History is retained until explicitly deleted. */
export interface AdminChatPrincipal {
  readonly kind: "user";
  readonly workspaceId: string;
  readonly userId: string;
}

/** An anonymous site visitor, identified only by the opaque token in their cookie. */
export interface GuestChatPrincipal {
  readonly kind: "guest";
  readonly workspaceId: string;
  /** The RAW cookie value. It is hashed here and never stored or logged in this form. */
  readonly sessionKey: string;
}

export type ChatPrincipal = AdminChatPrincipal | GuestChatPrincipal;

/**
 * What routes are handed instead of a database.
 *
 * Injected through `RouteDeps` so a handler's only path to chat history runs through a principal.
 * The raw `better-sqlite3` handle is closed over at composition time and never reaches a route,
 * which is what makes the unscoped query unwritable rather than merely discouraged.
 */
export type ChatStoreFactory = (principal: ChatPrincipal) => ChatHistoryStore;

/**
 * Returns chat history scoped to exactly one principal.
 *
 * There is no sibling function that returns an unscoped store, and that absence is the design.
 * Retention — the one operation that legitimately spans owners — lives in
 * `retention-sweep.ts` and talks to `@jini-ai/sqlite`'s maintenance factory directly, so it does
 * not need an escape hatch here.
 *
 * @param db Tovu's `content.db` handle. The Jini store writes through it and never opens a
 *   database of its own, which is what keeps this out of that package's `app.sqlite`.
 * @complexity O(1); the returned store's methods are single indexed queries.
 */
export function createTenantScopedChatStore(
  db: SqliteDatabase,
  principal: ChatPrincipal,
): ChatHistoryStore {
  return createChatHistoryStore(db, {
    scopeId: principal.workspaceId,
    ownerKind: principal.kind,
    ownerId:
      principal.kind === "user" ? principal.userId : hashSessionKey(principal.sessionKey),
  });
}

/**
 * When a new conversation for this principal should expire, or `undefined` for never.
 *
 * Admin history has no TTL: it is work product, and an assistant that quietly forgets what an
 * administrator did two days ago is worse than useless during an incident review. Guest history
 * expires because it is personal data belonging to someone who never created an account, and
 * keeping it indefinitely is a liability with no matching benefit.
 */
export function chatExpiryFor(principal: ChatPrincipal, now: number = Date.now()): number | undefined {
  return principal.kind === "guest" ? now + GUEST_CHAT_TTL_MS : undefined;
}
