import { randomBytes, timingSafeEqual } from "node:crypto";

import type { ISODateTime } from "@jini-ai/cms/core";

import { OAuthError } from "./errors.js";
import type { OAuthClock, OAuthRandomBytes } from "./ports.js";

/**
 * @file The in-flight `state` ledger for authorization-code flows — single-use, expiring, and BOUND
 * to the connection that issued it.
 *
 * These four properties are the ones `routes/connectors/composio-callback.ts` documents as the
 * reason its callback can be public at all, and they are reproduced here rather than reused because
 * Composio's pending map lives inside `ComposioConnectorProvider` and is keyed by *its* connector
 * model. What is reproduced is the security argument, not the code:
 *
 * - **24 random bytes**, minted by `node:crypto`. Guessing is infeasible, which is what lets the
 *   callback route authenticate on `state` instead of a cookie that a cross-site top-level
 *   redirect will never carry.
 * - **Single use.** `take` deletes on the first successful lookup, so a replayed callback fails.
 * - **Expiring**, and pruned on every access rather than by a timer — no background work, and an
 *   abandoned popup cannot leave a redeemable entry behind.
 * - **Bound to an owner.** A `state` minted for one connection cannot be redeemed against another,
 *   even by a caller who legitimately holds it.
 *
 * ## Why this is an async port, and why an in-memory implementation still lives here
 *
 * The port is `Promise`-returning even though this file's own `createPendingAuthorizationStore`
 * implementation does no I/O at all: the REAL adapter
 * (`platform/db/sqlite/oauth-pending-store.sqlite.ts`'s `createSqlitePendingAuthorizationStore`)
 * persists every entry to `content.db` and seals `codeVerifier` through the same ADR-058
 * sealer/keyring every other secret in that database goes through, and sealing is Promise-based
 * everywhere else in this codebase (`SecretSealerPort.seal`/`.open`). A synchronous port would have
 * to keep the two implementations' call shapes different, which is exactly the kind of asymmetry
 * that stays unnoticed until a caller written against the memory adapter breaks against the real one.
 *
 * This in-memory implementation is now the ADR-006 rule-of-two "second adapter" — used by tests and
 * by any composition root with no persistent `content.db` to attach a real store to — not the
 * production path. It used to BE the production path, and the reasoning that justified that (a
 * pending authorization is worthless after a restart, so durability buys nothing) was true but
 * incomplete: it answered "does this need to survive a RESTART" and never asked "does this need to
 * survive a different PROCESS reading it," which is the question that actually mattered. The start
 * of a browser-redirect handshake (`external_mcp_oauth_connect`, an assistant tool that runs inside
 * the agent daemon) and its completion (the public OAuth callback, an Express route on the main web
 * server) are ALREADY two separate OS processes today — not a hypothetical future multi-process web
 * tier — and an in-memory `Map` in either process was invisible to the other. That gap is what
 * `oauth-pending-store.sqlite.ts` closes; this file's own store remains correct for the callers that
 * still only need one process to see the whole handshake.
 */

/** Same width as the Composio flow's state — see this file's header. Exported so
 *  `oauth-pending-store.sqlite.ts` mints `state` at the identical width rather than restating the
 *  number. */
export const STATE_BYTES = 24;
/** Long enough for a human to complete a provider's consent screen including an MFA prompt, short
 *  enough that an abandoned attempt stops being redeemable while the operator is still at their desk.
 *  Exported for the same reason {@link STATE_BYTES} is. */
export const DEFAULT_TTL_MS = 10 * 60 * 1000;
/**
 * Hard ceiling on live entries.
 *
 * The start route is authenticated and rate-limited, so this is not the primary control; it is the
 * bound that makes the memory (or row) cost of this store knowable regardless. At the cap the OLDEST
 * entry is evicted rather than the new one refused: refusing would let anyone who can reach the
 * start route wedge the flow shut for every other admin, which is a worse failure than one stale
 * pending authorization losing its slot. Exported for the same reason {@link STATE_BYTES} is.
 */
export const DEFAULT_MAX_ENTRIES = 256;

/** One authorization request that has been started and not yet completed. */
export interface PendingAuthorization {
  readonly state: string;
  /**
   * Opaque binding key — the caller's own identity for "which thing is being authorized". External
   * MCP passes `${workspaceId}:${serverId}`. Compared on redemption; a mismatch is
   * `OAUTH_INVALID_STATE`, not a silent success against the wrong connection.
   */
  readonly ownerKey: string;
  readonly providerId: string;
  /** RFC 7636 verifier. Never leaves this process. */
  readonly codeVerifier: string;
  /**
   * The exact `redirect_uri` sent on the authorization request. Replayed verbatim on the token
   * exchange because RFC 6749 §4.1.3 requires the two to match, and because rebuilding it from the
   * callback request would let a forwarded `Host` header change what gets attested.
   */
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly createdAt: ISODateTime;
  readonly expiresAt: ISODateTime;
}

export interface PendingAuthorizationStore {
  /** Mints and records a pending authorization, returning it. `Promise`-returning because the real
   *  adapter seals `codeVerifier` — see this file's header. */
  put(input: Omit<PendingAuthorization, "state" | "createdAt" | "expiresAt">): Promise<PendingAuthorization>;
  /**
   * Redeems `state` for `ownerKey`, consuming it.
   *
   * @throws {OAuthError} `OAUTH_INVALID_STATE` when the state is unknown, expired, already used, or
   * bound to a different owner. One code for all four on purpose: distinguishing them would tell a
   * caller who guessed a state that it exists.
   */
  take(input: { state: string; ownerKey: string }): Promise<PendingAuthorization>;
  /** Live, unexpired entries. Exposed for tests and for an operational counter. */
  size(): Promise<number>;
}

export interface PendingAuthorizationStoreDeps {
  readonly clock: OAuthClock;
  readonly ttlMs?: number;
  readonly maxEntries?: number;
  /** Injected only so tests can pin `state`. Defaults to `node:crypto`'s CSPRNG. */
  readonly randomBytesFn?: OAuthRandomBytes;
}

/** Constant-time string comparison for the owner binding. Length is compared first because
 *  `timingSafeEqual` throws on a length mismatch; length is not the secret. Exported so
 *  `oauth-pending-store.sqlite.ts` enforces the identical owner-binding check against a DB row
 *  rather than restating (and risking drift from) the comparison. */
export function secureEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** The one error every "this state cannot be redeemed" case throws — unknown, expired, replayed, or
 *  wrong owner all look identical to the caller. Exported so the SQLite adapter raises the
 *  byte-identical error rather than a second message a caller would have to learn to recognize too. */
export function invalidState(): OAuthError {
  return new OAuthError("OAUTH_INVALID_STATE", "the authorization request could not be matched — it may have expired or already been used", {
    operatorAction: "Start the connection again from Settings → External MCP.",
  });
}

/**
 * Builds a pending-authorization store.
 *
 * @param deps.clock - Every expiry decision goes through this, so tests advance time instead of sleeping.
 * @returns The store. Never throws at construction.
 * @complexity `put` is amortized O(1) plus an O(n) prune bounded by `maxEntries`; `take` is O(1)
 *   plus the same prune. `n` is capped, so both are effectively constant.
 * @tradeoffs Pruning on access rather than on a timer keeps this module free of background work and
 *   of a shutdown hook, at the cost of holding expired entries until the next call. They are
 *   unredeemable the whole time, so the only cost is memory, and `maxEntries` bounds that.
 */
export function createPendingAuthorizationStore(deps: PendingAuthorizationStoreDeps): PendingAuthorizationStore {
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = deps.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const randomBytesFn = deps.randomBytesFn ?? ((n: number) => randomBytes(n));
  /** Insertion-ordered, which is what makes "evict the oldest" a first-key delete. */
  const pending = new Map<string, PendingAuthorization>();

  const pruneExpired = (nowMs: number): void => {
    for (const [state, entry] of pending) {
      if (Date.parse(entry.expiresAt) <= nowMs) pending.delete(state);
    }
  };

  return {
    async put(input) {
      const nowIso = deps.clock.nowIso();
      const nowMs = Date.parse(nowIso);
      pruneExpired(nowMs);
      while (pending.size >= maxEntries) {
        const oldest = pending.keys().next();
        if (oldest.done) break;
        pending.delete(oldest.value);
      }

      const entry: PendingAuthorization = {
        ...input,
        state: Buffer.from(randomBytesFn(STATE_BYTES)).toString("base64url"),
        createdAt: nowIso,
        expiresAt: new Date(nowMs + ttlMs).toISOString(),
      };
      pending.set(entry.state, entry);
      return entry;
    },

    async take(input) {
      const nowMs = Date.parse(deps.clock.nowIso());
      pruneExpired(nowMs);

      const entry = pending.get(input.state);
      if (!entry) throw invalidState();
      // Consumed BEFORE the owner check, not after: a caller who guesses a state and then fails the
      // binding must still burn it, or the binding check becomes an oracle they can retry against.
      pending.delete(input.state);
      if (!secureEquals(entry.ownerKey, input.ownerKey)) throw invalidState();
      return entry;
    },

    async size() {
      pruneExpired(Date.parse(deps.clock.nowIso()));
      return pending.size;
    },
  };
}
