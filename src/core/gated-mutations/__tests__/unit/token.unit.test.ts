import assert from "node:assert/strict";
import test from "node:test";

import {
  ConfirmationTokenRecord,
  InMemoryTokenStore,
  TokenAlreadyRedeemedError,
  TokenExpiredError,
  expireToken,
  isRedeemable,
  mintToken,
  redeemToken,
} from "../../token";

/**
 * @file SPEC-016 C-005 / U-003 / INV-03 / INV-04 — the confirmation-token lifecycle.
 *
 * Assumed seam design (TDD-authored, consistent with implementation-outline.md's Contract Map
 * and state.spec.md §3's Action Catalog — Programmer may adjust internals but must preserve this
 * observable shape unless a `[CIC_DEVIATION]` is recorded):
 *
 * ```ts
 * export interface ConfirmationTokenRecord {
 *   confirmationToken: string;
 *   planHash: string;
 *   scopeId: string;
 *   confirmerPrincipalId: string;
 *   status: "minted" | "redeemed" | "expired";
 *   createdAt: string;   // ISO-8601 UTC
 *   expiresAt: string;   // ISO-8601 UTC, createdAt + 600s exact, no jitter (REQ-10)
 * }
 *
 * export interface TokenStorePort {
 *   save(record: ConfirmationTokenRecord): Promise<void>;
 *   findByToken(token: string): Promise<ConfirmationTokenRecord | null>;
 *   // U-003-B1: single atomic conditional transition — minted -> redeemed.
 *   // Must NOT be a separate read followed by a separate write.
 *   tryRedeem(params: { token: string; now: string }): Promise<{ redeemed: boolean; record: ConfirmationTokenRecord | null }>;
 *   // Test/observability seam used by gateway.unit.test.ts (INV-04) — total records ever saved.
 *   count(): Promise<number>;
 * }
 *
 * export function mintToken(required: { planId: string; planHash: string; scopeId: string;
 *   confirmerPrincipalId: string; now: string; ttlSeconds?: number }, optional?: {}): ConfirmationTokenRecord;
 *
 * export function isRedeemable(record: ConfirmationTokenRecord, now: string): boolean;
 *
 * export async function redeemToken(required: { store: TokenStorePort; token: string; now: string },
 *   optional?: {}): Promise<ConfirmationTokenRecord>; // throws TokenExpiredError / TokenAlreadyRedeemedError
 *
 * export async function expireToken(required: { store: TokenStorePort; token: string; now: string },
 *   optional?: {}): Promise<void>;
 * ```
 *
 * Certifies: exact 600s TTL with no jitter (AC-14); no un-redeeming (INV-03); an unknown/forged
 * token string is indistinguishable from an expired one (REQ-11, AC-35); and the single-use
 * redemption transition is atomic under concurrent callers (U-003-B1, INV-03).
 */

const NOW = "2026-07-15T00:00:00.000Z";
const TEN_MIN_LATER = "2026-07-15T00:10:00.000Z";
const TEN_MIN_ONE_SEC_LATER = "2026-07-15T00:10:01.000Z";

function baseMintParams(overrides: Partial<Parameters<typeof mintToken>[0]> = {}) {
  return {
    planId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    planHash: "sha256:" + "a".repeat(64),
    scopeId: "workspace-1",
    confirmerPrincipalId: "user-1",
    now: NOW,
    ...overrides,
  };
}

test("AC-14: mintToken sets expiresAt to exactly createdAt + 600 seconds, no jitter", () => {
  const record = mintToken(baseMintParams());
  assert.equal(record.createdAt, NOW);
  assert.equal(record.expiresAt, TEN_MIN_LATER);
  assert.equal(record.status, "minted");
});

test("AC-14: mintToken binds (planHash, scopeId, confirmerPrincipalId) exactly as given", () => {
  const params = baseMintParams();
  const record = mintToken(params);
  assert.equal(record.planHash, params.planHash);
  assert.equal(record.scopeId, params.scopeId);
  assert.equal(record.confirmerPrincipalId, params.confirmerPrincipalId);
});

test("behavior.spec.md §4: token redemption limit is exactly 1 — isRedeemable false once status !== 'minted'", () => {
  const minted = mintToken(baseMintParams());
  assert.equal(isRedeemable(minted, NOW), true);

  const redeemed: ConfirmationTokenRecord = { ...minted, status: "redeemed" };
  assert.equal(isRedeemable(redeemed, NOW), false);

  const expired: ConfirmationTokenRecord = { ...minted, status: "expired" };
  assert.equal(isRedeemable(expired, NOW), false);
});

test("EC (§7): execute() at exact TTL boundary — redeemable at expiresAt itself, not redeemable one second after", () => {
  const minted = mintToken(baseMintParams());
  assert.equal(isRedeemable(minted, TEN_MIN_LATER), true, "boundary instant itself must still be valid");
  assert.equal(isRedeemable(minted, TEN_MIN_ONE_SEC_LATER), false, "one second past the boundary must be expired");
});

test("INV-03: redeemToken on an already-redeemed token throws TokenAlreadyRedeemedError, never re-succeeds", async () => {
  const store = new InMemoryTokenStore();
  const minted = mintToken(baseMintParams());
  await store.save(minted);

  const first = await redeemToken({ store, token: minted.confirmationToken, now: NOW });
  assert.equal(first.status, "redeemed");

  await assert.rejects(
    redeemToken({ store, token: minted.confirmationToken, now: NOW }),
    (err: unknown) => {
      assert.ok(err instanceof TokenAlreadyRedeemedError);
      return true;
    }
  );
});

test("redeemToken on an expired token throws TokenExpiredError", async () => {
  const store = new InMemoryTokenStore();
  const minted = mintToken(baseMintParams());
  await store.save(minted);

  await assert.rejects(
    redeemToken({ store, token: minted.confirmationToken, now: TEN_MIN_ONE_SEC_LATER }),
    (err: unknown) => {
      assert.ok(err instanceof TokenExpiredError);
      return true;
    }
  );
});

test("REQ-11 / AC-35: redeemToken on a confirmationToken string never minted by this contract throws TokenExpiredError, never a distinct code", async () => {
  const store = new InMemoryTokenStore();

  await assert.rejects(
    redeemToken({ store, token: "forged-or-garbage-token-string", now: NOW }),
    (err: unknown) => {
      assert.ok(err instanceof TokenExpiredError, "an unrecognized token must be indistinguishable from an expired one");
      assert.ok(!(err instanceof TokenAlreadyRedeemedError));
      return true;
    }
  );
});

test("no un-redeeming: expireToken never transitions a redeemed token back toward mintable/expired-only-from-minted", async () => {
  const store = new InMemoryTokenStore();
  const minted = mintToken(baseMintParams());
  await store.save(minted);
  await redeemToken({ store, token: minted.confirmationToken, now: NOW });

  await expireToken({ store, token: minted.confirmationToken, now: TEN_MIN_ONE_SEC_LATER });
  const record = await store.findByToken(minted.confirmationToken);
  assert.equal(record?.status, "redeemed", "expireToken must never overwrite an already-redeemed token's status");
});

test("U-003-B1 / INV-03 (property): under N concurrent redemption attempts on one minted token, exactly one succeeds and N-1 fail with TokenAlreadyRedeemedError", async () => {
  for (const concurrency of [2, 5, 10]) {
    const store = new InMemoryTokenStore();
    const minted = mintToken(baseMintParams({ planId: `plan-${concurrency}` }));
    await store.save(minted);

    const attempts = Array.from({ length: concurrency }, () =>
      redeemToken({ store, token: minted.confirmationToken, now: NOW })
    );
    const settled = await Promise.allSettled(attempts);

    const succeeded = settled.filter((r) => r.status === "fulfilled");
    const failed = settled.filter((r) => r.status === "rejected");

    assert.equal(succeeded.length, 1, `expected exactly 1 success under ${concurrency}-way concurrent redemption`);
    assert.equal(failed.length, concurrency - 1);
    for (const failure of failed as PromiseRejectedResult[]) {
      assert.ok(
        failure.reason instanceof TokenAlreadyRedeemedError,
        "every losing concurrent redemption attempt must fail with TokenAlreadyRedeemedError, never silently succeed"
      );
    }
  }
});

test("TokenStorePort.tryRedeem itself reports which single caller performed the transition (contract test, C-005)", async () => {
  const store = new InMemoryTokenStore();
  const minted = mintToken(baseMintParams());
  await store.save(minted);

  const [a, b] = await Promise.all([
    store.tryRedeem({ token: minted.confirmationToken, now: NOW }),
    store.tryRedeem({ token: minted.confirmationToken, now: NOW }),
  ]);

  const redeemedCount = [a, b].filter((r) => r.redeemed).length;
  assert.equal(redeemedCount, 1, "tryRedeem must be a single atomic conditional operation, never letting two callers both win");
});
