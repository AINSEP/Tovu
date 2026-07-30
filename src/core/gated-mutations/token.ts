import { randomUUID } from "node:crypto";

/**
 * @file SPEC-016 C-005 / U-003 / INV-03 / INV-04 — the confirmation-token lifecycle.
 *
 * Purpose:
 * A confirmation token is the single-use, time-boxed credential `gateway.ts`'s `confirm()` mints
 * and `execute()` redeems. Its own lifecycle (mint/redeem/expire) is decoupled from the gateway's
 * fixed check-sequence (ADR-041 §5, CIC U-001) so the atomic redemption transition (U-003-B1) has
 * one, directly-testable owner.
 *
 * How it relates to the project:
 * - `gateway.ts` composes this module's `mintToken`/`isRedeemable` and the `TokenStorePort`
 *   directly (it does not go through `redeemToken`'s throw-shaped wrapper — the gateway's own
 *   fixed check-sequence needs to distinguish FORBIDDEN from TOKEN_EXPIRED from
 *   TOKEN_ALREADY_REDEEMED at specific points, not `redeemToken`'s single collapsed contract).
 * - `InMemoryTokenStore` is the dev/test adapter; a durable SQLite-backed adapter is not required
 *   by this test slice (tokens are short-lived, in-process confirmation state).
 *
 * Architectural role:
 * Core primitive. No I/O beyond the injected `TokenStorePort`.
 */

export interface ConfirmationTokenRecord {
  confirmationToken: string;
  planHash: string;
  scopeId: string;
  confirmerPrincipalId: string;
  status: "minted" | "redeemed" | "expired";
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC, `createdAt` + `ttlSeconds` (default 600s) exact, no jitter (REQ-10). */
  expiresAt: string;
}

export interface TokenStorePort {
  save(record: ConfirmationTokenRecord): Promise<void>;
  findByToken(token: string): Promise<ConfirmationTokenRecord | null>;
  /**
   * U-003-B1: a single atomic conditional transition — `minted` -> `redeemed`, gated on
   * `isRedeemable`. Must never be a separate read followed by a separate write; implementations
   * must perform the check and the mutation without an intervening `await` so concurrent callers
   * (see `token.unit.test.ts`'s `Promise.all` cases) cannot interleave.
   */
  tryRedeem(params: { token: string; now: string }): Promise<{ redeemed: boolean; record: ConfirmationTokenRecord | null }>;
  /** Test/observability seam used by `gateway.unit.test.ts` (INV-04) — total records ever saved. */
  count(): Promise<number>;
}

/** Thrown when a token cannot be found, or is found but its TTL has passed (REQ-11: indistinguishable from "never issued"). */
export class TokenExpiredError extends Error {}

/** Thrown when a token was already redeemed once (INV-03: no un-redeeming, no double-spend). */
export class TokenAlreadyRedeemedError extends Error {}

const DEFAULT_TTL_SECONDS = 600;

/**
 * Mints a fresh, single-use confirmation token bound to `(planHash, scopeId,
 * confirmerPrincipalId)`, valid for exactly `ttlSeconds` (default 600s) from `now`, no jitter
 * (REQ-10/AC-14). Pure — the caller persists the returned record via `TokenStorePort.save`.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function mintToken(
  required: {
    planId: string;
    planHash: string;
    scopeId: string;
    confirmerPrincipalId: string;
    now: string;
    ttlSeconds?: number;
  },
  _optional: Record<string, never> = {}
): ConfirmationTokenRecord {
  const ttlSeconds = required.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const createdAt = required.now;
  const expiresAt = new Date(new Date(createdAt).getTime() + ttlSeconds * 1000).toISOString();

  return {
    confirmationToken: `ctok_${randomUUID()}`,
    planHash: required.planHash,
    scopeId: required.scopeId,
    confirmerPrincipalId: required.confirmerPrincipalId,
    status: "minted",
    createdAt,
    expiresAt,
  };
}

/**
 * Whether `record` may still be redeemed at instant `now` — `status==='minted'` and `now <=
 * expiresAt` (boundary inclusive).
 *
 * @complexity O(1), pure.
 * @overallScore 100
 */
export function isRedeemable(
  required: { record: ConfirmationTokenRecord; now: string },
  _optional: Record<string, never> = {}
): boolean {
  const { record, now } = required;
  if (record.status !== "minted") return false;
  return new Date(now).getTime() <= new Date(record.expiresAt).getTime();
}

/**
 * Redeems `token` via the store's atomic `tryRedeem`, translating the outcome into the specific
 * thrown error REQ-11/INV-03 require: an unrecognized token and a genuinely expired token both
 * throw `TokenExpiredError` (indistinguishable, REQ-11/AC-35); an already-redeemed token throws
 * `TokenAlreadyRedeemedError`.
 *
 * Not used by `gateway.ts`'s `execute()` directly — the gateway's own fixed check-sequence needs
 * to interleave this token-state check with its own authorize/actor-class/plan-hash checks in a
 * specific order (CIC U-001), so it calls `store.findByToken`/`isRedeemable`/`store.tryRedeem`
 * itself. This export is the standalone, directly-testable contract for the token lifecycle.
 *
 * @complexity O(1) plus one store round-trip.
 * @overallScore 100
 */
export async function redeemToken(
  required: { store: TokenStorePort; token: string; now: string },
  _optional: Record<string, never> = {}
): Promise<ConfirmationTokenRecord> {
  const { store, token, now } = required;
  const { redeemed, record } = await store.tryRedeem({ token, now });
  if (redeemed && record) return record;
  if (!record) throw new TokenExpiredError(`confirmation token was not found`);
  if (record.status === "redeemed") {
    throw new TokenAlreadyRedeemedError(`confirmation token has already been redeemed`);
  }
  throw new TokenExpiredError(`confirmation token has expired`);
}

/**
 * Marks `token` as `expired`. A no-op (never overwrites) when the token is already `redeemed` or
 * already `expired` — expiry can only ever move a token forward from `minted`, never un-redeem it.
 *
 * @complexity O(1) plus one store read and (at most) one store write.
 * @overallScore 100
 */
export async function expireToken(
  required: { store: TokenStorePort; token: string; now: string },
  _optional: Record<string, never> = {}
): Promise<void> {
  const { store, token } = required;
  const record = await store.findByToken(token);
  if (!record || record.status !== "minted") return;
  await store.save({ ...record, status: "expired" });
}

/**
 * In-process `TokenStorePort` adapter — confirmation tokens are short-lived, in-process state.
 * Every method is O(1) (`Map` get/set), pure I/O with no branching beyond `tryRedeem`'s guard.
 * @overallScore 100
 */
export class InMemoryTokenStore implements TokenStorePort {
  private readonly recordsByToken = new Map<string, ConfirmationTokenRecord>();

  async save(record: ConfirmationTokenRecord): Promise<void> {
    this.recordsByToken.set(record.confirmationToken, { ...record });
  }

  async findByToken(token: string): Promise<ConfirmationTokenRecord | null> {
    const record = this.recordsByToken.get(token);
    return record ? { ...record } : null;
  }

  /**
   * Synchronous body (no `await` before the read-check-write), so under `Promise.all` concurrent
   * callers on Node's single-threaded event loop this runs to completion atomically per call —
   * exactly the U-003-B1 guarantee this store must provide.
   */
  async tryRedeem(params: { token: string; now: string }): Promise<{ redeemed: boolean; record: ConfirmationTokenRecord | null }> {
    const record = this.recordsByToken.get(params.token);
    if (!record) return { redeemed: false, record: null };
    if (!isRedeemable({ record, now: params.now })) return { redeemed: false, record: { ...record } };

    const updated: ConfirmationTokenRecord = { ...record, status: "redeemed" };
    this.recordsByToken.set(params.token, updated);
    return { redeemed: true, record: { ...updated } };
  }

  async count(): Promise<number> {
    return this.recordsByToken.size;
  }
}
