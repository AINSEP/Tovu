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
 * ## Why in-memory
 *
 * A pending authorization is worthless after a restart — the operator's popup is gone with it — so
 * durability would only preserve a redeemable secret past the point where anyone is waiting on it.
 * The cost is that the START and the CALLBACK must land on the same process. That is true today
 * (both are Express routes on the main web server; the agent daemon serves neither), and it is
 * stated here because a future multi-process web tier turns this file into a shared-store problem
 * rather than a subtle intermittent failure.
 */

/** Same width as the Composio flow's state — see this file's header. */
const STATE_BYTES = 24;
/** Long enough for a human to complete a provider's consent screen including an MFA prompt, short
 *  enough that an abandoned attempt stops being redeemable while the operator is still at their desk. */
const DEFAULT_TTL_MS = 10 * 60 * 1000;
/**
 * Hard ceiling on live entries.
 *
 * The start route is authenticated and rate-limited, so this is not the primary control; it is the
 * bound that makes the memory cost of this map knowable regardless. At the cap the OLDEST entry is
 * evicted rather than the new one refused: refusing would let anyone who can reach the start route
 * wedge the flow shut for every other admin, which is a worse failure than one stale pending
 * authorization losing its slot.
 */
const DEFAULT_MAX_ENTRIES = 256;

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
  /** Mints and records a pending authorization, returning it. */
  put(input: Omit<PendingAuthorization, "state" | "createdAt" | "expiresAt">): PendingAuthorization;
  /**
   * Redeems `state` for `ownerKey`, consuming it.
   *
   * @throws {OAuthError} `OAUTH_INVALID_STATE` when the state is unknown, expired, already used, or
   * bound to a different owner. One code for all four on purpose: distinguishing them would tell a
   * caller who guessed a state that it exists.
   */
  take(input: { state: string; ownerKey: string }): PendingAuthorization;
  /** Live, unexpired entries. Exposed for tests and for an operational counter. */
  size(): number;
}

export interface PendingAuthorizationStoreDeps {
  readonly clock: OAuthClock;
  readonly ttlMs?: number;
  readonly maxEntries?: number;
  /** Injected only so tests can pin `state`. Defaults to `node:crypto`'s CSPRNG. */
  readonly randomBytesFn?: OAuthRandomBytes;
}

/** Constant-time string comparison for the owner binding. Length is compared first because
 *  `timingSafeEqual` throws on a length mismatch; length is not the secret. */
function secureEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function invalidState(): OAuthError {
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
    put(input) {
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

    take(input) {
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

    size() {
      pruneExpired(Date.parse(deps.clock.nowIso()));
      return pending.size;
    },
  };
}
