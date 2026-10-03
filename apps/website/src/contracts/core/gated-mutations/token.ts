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
 * - The canonical Jini gateway composes its token module's `mintToken`/`isRedeemable` and the `TokenStorePort`
 *   directly (it does not go through `redeemToken`'s throw-shaped wrapper — the gateway's own
 *   fixed check-sequence needs to distinguish FORBIDDEN from TOKEN_EXPIRED from
 *   TOKEN_ALREADY_REDEEMED at specific points, not `redeemToken`'s standalone lifecycle contract).
 * - The original test slice used short-lived, in-process tokens. SPEC-022 later required a durable
 *   production adapter; composition.ts retains the reasoning behind that correction.
 *
 * Architectural role:
 * Core primitive. No I/O beyond the injected `TokenStorePort`.
 *
 * Tovu retains ctok_ UUID tokens and the exact 600-second default. The generic lifecycle and
 * its rationale live in Jini/packages/core/src/gated-mutations/token.ts.
 *
 * Canonical lifecycle constraints:
 *
 * ISO-8601 UTC.
 *
 * ISO-8601 UTC, `createdAt` + `ttlSeconds` (default 600s) exact, no jitter (REQ-10).
 *
 * U-003-B1: a single atomic conditional transition — `minted` -> `redeemed`, gated on
 * `isRedeemable`. Must never be a separate read followed by a separate write; implementations
 * must perform the check and the mutation without an intervening `await` so concurrent callers
 * (see `token.unit.test.ts`'s `Promise.all` cases) cannot interleave.
 *
 * Test/observability seam used by `gateway.unit.test.ts` (INV-04) — total records ever saved.
 *
 * Synchronous body (no `await` before the read-check-write), so under `Promise.all` concurrent
 * callers on Node's single-threaded event loop this runs to completion atomically per call —
 * exactly the U-003-B1 guarantee this store must provide.
 *
 * Thrown when a token cannot be found, or is found but its TTL has passed (REQ-11: indistinguishable from "never issued").
 *
 * Thrown when a token was already redeemed once (INV-03: no un-redeeming, no double-spend).
 *
 * Whether `record` may still be redeemed at instant `now` — `status==='minted'` and `now <=
 * expiresAt` (boundary inclusive).
 *
 * @complexity O(1), pure.
 * @overallScore 100
 */
import { randomUUID } from "node:crypto";
// Lifecycle rationale: Jini/packages/core/src/gated-mutations/token.ts (SPEC-016 INV-03/INV-04).
import {
  InMemoryTokenStore as JiniTokenStore,
  mintToken as mintApprovalToken,
  redeemToken as redeemApprovalToken,
  expireToken as expireApprovalToken,
  type ConfirmationTokenRecord,
  type TokenStorePort as ApprovalTokenStore,
} from "@jini-ai/core/gated-mutations";

export { isRedeemable, TokenExpiredError, TokenAlreadyRedeemedError } from "@jini-ai/core/gated-mutations";
export type { ConfirmationTokenRecord } from "@jini-ai/core/gated-mutations";

/** Legacy host storage calls; expire must be an atomic minted -> expired transition. */
export interface TokenStorePort {
  /** Insert only; expiry/redemption must never overwrite a previously issued token via save. */
  save(record: ConfirmationTokenRecord): Promise<void>;
  findByToken(token: string): Promise<ConfirmationTokenRecord | null>;
  tryRedeem(required: { token: string; now: string }): Promise<{ redeemed: boolean; record: ConfirmationTokenRecord | null }>;
  count(): Promise<number>;
  expire(required: { token: string }): Promise<void>;
}

/** Bind storage without splitting its atomic transitions. O(1) plus storage I/O. */
export function adaptTokenStore(required: { store: TokenStorePort }): ApprovalTokenStore {
  const { store } = required;
  return {
    save: ({ record }) => store.save(record),
    findByToken: ({ token }) => store.findByToken(token),
    tryRedeem: request => store.tryRedeem(request),
    expire: async request => {
      if (typeof store.expire !== "function") throw new Error("atomic confirmation-token expiry is not configured");
      await store.expire(request);
    },
  };
}

/**
 * Mints a fresh, single-use confirmation token bound to `(planHash, scopeId,
 * confirmerPrincipalId)`, valid for exactly `ttlSeconds` (default 600s) from `now`, no jitter
 * (REQ-10/AC-14). Pure — the caller persists the returned record via `TokenStorePort.save`.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function mintToken(required: {
  planId: string; planHash: string; scopeId: string; confirmerPrincipalId: string; now: string; ttlSeconds?: number;
}, _optional: Record<string, never> = {}): ConfirmationTokenRecord {
  return mintApprovalToken({ ...required, ttlSeconds: required.ttlSeconds ?? 600, generateToken: () => `ctok_${randomUUID()}` });
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
export function redeemToken(required: { store: TokenStorePort; token: string; now: string }, _optional: Record<string, never> = {}): Promise<ConfirmationTokenRecord> {
  return redeemApprovalToken({ ...required, store: adaptTokenStore({ store: required.store }) });
}

/**
 * Marks `token` as `expired`. A no-op (never overwrites) when the token is already `redeemed` or
 * already `expired` — expiry can only ever move a token forward from `minted`, never un-redeem it.
 *
 * @complexity O(1) plus one atomic store transition.
 * @overallScore 100
 */
export function expireToken(required: { store: TokenStorePort; token: string; now: string }, _optional: Record<string, never> = {}): Promise<void> {
  return expireApprovalToken({ ...required, store: adaptTokenStore({ store: required.store }) });
}

/**
 * In-process `TokenStorePort` adapter — confirmation tokens are short-lived, in-process state.
 * Every method is O(1) (`Map` get/set), pure I/O with no branching beyond `tryRedeem`'s guard.
 * @overallScore 100
 * The canonical Jini store performs its conditional transition without an intervening await;
 * the Tovu storage adapter delegates that operation intact.
 */
export class InMemoryTokenStore implements TokenStorePort {
  private readonly store = new JiniTokenStore({});
  async save(record: ConfirmationTokenRecord): Promise<void> { await this.store.save({ record }); }
  async findByToken(token: string): Promise<ConfirmationTokenRecord | null> { return this.store.findByToken({ token }); }
  async tryRedeem(required: { token: string; now: string }): Promise<{ redeemed: boolean; record: ConfirmationTokenRecord | null }> { return this.store.tryRedeem(required); }
  async expire(required: { token: string }): Promise<void> { await this.store.expire(required); }
  async count(): Promise<number> { return this.store.count({}); }
}
