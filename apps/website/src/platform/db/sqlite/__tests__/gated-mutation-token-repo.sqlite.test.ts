import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "../content-db.js";
import { SqliteTokenStore } from "../gated-mutation-token-repo.sqlite.js";
import { mintToken } from "#src/contracts/core/gated-mutations/token";

/**
 * @file SPEC-022 durability fix — `SqliteTokenStore` coverage. Same lifecycle
 * `contracts/core/gated-mutations/__tests__/unit/token.unit.test.ts` already exercises against
 * `InMemoryTokenStore`, run here against the real SQLite adapter (`:memory:` db, same convention
 * `outbox-repo.contract.test.ts` uses) — the one this fix wires into `server/deps.ts`'s real
 * production composition root in place of `InMemoryTokenStore`.
 */

function makeStore(): SqliteTokenStore {
  return new SqliteTokenStore(openContentDb(":memory:"));
}

test("save() then findByToken() round-trips a minted record", async () => {
  const store = makeStore();
  const record = mintToken({
    planId: "plan-1",
    planHash: "hash-1",
    scopeId: "scope-1",
    confirmerPrincipalId: "user-1",
    now: "2026-08-31T00:00:00.000Z",
  });

  await store.save(record);
  const found = await store.findByToken(record.confirmationToken);

  assert.deepEqual(found, record);
});

test("findByToken() returns null for a token never saved", async () => {
  const store = makeStore();
  assert.equal(await store.findByToken("ctok_never-existed"), null);
});

test("tryRedeem() atomically transitions minted -> redeemed and reports the redeemed record", async () => {
  const store = makeStore();
  const record = mintToken({
    planId: "plan-1",
    planHash: "hash-1",
    scopeId: "scope-1",
    confirmerPrincipalId: "user-1",
    now: "2026-08-31T00:00:00.000Z",
  });
  await store.save(record);

  const result = await store.tryRedeem({ token: record.confirmationToken, now: "2026-08-31T00:01:00.000Z" });

  assert.equal(result.redeemed, true);
  assert.equal(result.record?.status, "redeemed");

  // Persisted, not just returned in-memory.
  const found = await store.findByToken(record.confirmationToken);
  assert.equal(found?.status, "redeemed");
});

test("tryRedeem() never double-redeems — the second call reports redeemed:false", async () => {
  const store = makeStore();
  const record = mintToken({
    planId: "plan-1",
    planHash: "hash-1",
    scopeId: "scope-1",
    confirmerPrincipalId: "user-1",
    now: "2026-08-31T00:00:00.000Z",
  });
  await store.save(record);

  const first = await store.tryRedeem({ token: record.confirmationToken, now: "2026-08-31T00:01:00.000Z" });
  assert.equal(first.redeemed, true);

  const second = await store.tryRedeem({ token: record.confirmationToken, now: "2026-08-31T00:02:00.000Z" });
  assert.equal(second.redeemed, false);
  assert.equal(second.record?.status, "redeemed", "the already-redeemed record is still returned, just not re-redeemed");
});

test("tryRedeem() concurrent callers on the same token: exactly one wins (INV-03 no double-spend)", async () => {
  const store = makeStore();
  const record = mintToken({
    planId: "plan-1",
    planHash: "hash-1",
    scopeId: "scope-1",
    confirmerPrincipalId: "user-1",
    now: "2026-08-31T00:00:00.000Z",
  });
  await store.save(record);

  const results = await Promise.all(
    Array.from({ length: 10 }, () => store.tryRedeem({ token: record.confirmationToken, now: "2026-08-31T00:01:00.000Z" }))
  );

  const redeemedCount = results.filter((r) => r.redeemed).length;
  assert.equal(redeemedCount, 1, "exactly one concurrent tryRedeem() call may win — this is the atomicity guarantee the transaction exists for");
});

test("tryRedeem() reports redeemed:false for an expired (past-TTL) token, without mutating it", async () => {
  const store = makeStore();
  const record = mintToken({
    planId: "plan-1",
    planHash: "hash-1",
    scopeId: "scope-1",
    confirmerPrincipalId: "user-1",
    now: "2026-08-31T00:00:00.000Z",
    ttlSeconds: 600,
  });
  await store.save(record);

  const result = await store.tryRedeem({ token: record.confirmationToken, now: "2026-08-31T00:20:00.000Z" });

  assert.equal(result.redeemed, false);
  assert.equal(result.record?.status, "minted", "an expired-but-unredeemed record's status is left alone — expiry is a separate, explicit step");
});

test("tryRedeem() reports redeemed:false and record:null for an unrecognized token", async () => {
  const store = makeStore();
  const result = await store.tryRedeem({ token: "ctok_never-existed", now: "2026-08-31T00:00:00.000Z" });
  assert.equal(result.redeemed, false);
  assert.equal(result.record, null);
});

test("save() upserts — expireToken()'s save-with-mutated-status call updates the existing row, not a duplicate", async () => {
  const store = makeStore();
  const record = mintToken({
    planId: "plan-1",
    planHash: "hash-1",
    scopeId: "scope-1",
    confirmerPrincipalId: "user-1",
    now: "2026-08-31T00:00:00.000Z",
  });
  await store.save(record);
  await store.save({ ...record, status: "expired" });

  const found = await store.findByToken(record.confirmationToken);
  assert.equal(found?.status, "expired");
  assert.equal(await store.count(), 1, "the upsert must not have created a second row");
});

test("count() reflects total records ever saved", async () => {
  const store = makeStore();
  assert.equal(await store.count(), 0);

  await store.save(mintToken({ planId: "p1", planHash: "h1", scopeId: "s1", confirmerPrincipalId: "u1", now: "2026-08-31T00:00:00.000Z" }));
  await store.save(mintToken({ planId: "p2", planHash: "h2", scopeId: "s2", confirmerPrincipalId: "u2", now: "2026-08-31T00:00:00.000Z" }));

  assert.equal(await store.count(), 2);
});
