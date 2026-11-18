import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";

import { recordingKernel } from "#src/__tests__/lane-su-pins/support/recording-kernel";
import { mintToken, redeemToken, TokenAlreadyRedeemedError, TokenExpiredError } from "#src/contracts/core/gated-mutations/token";
import type { ContentKernel } from "../../content-kernel.js";
import { SqliteTokenStore } from "../../sqlite/gated-mutation-token-repo.sqlite.js";

/**
 * @file S5b T0: the confirmation-token store's behaviour on the unmoved code, before `SqlTokenStore` moves to
 * Jini `@jini-ai/db/gated-mutations`. Each test names the one-line mutation of `gated-mutation-token-repo.ts`
 * that turns it red. Real SQLite kernel (the recorder from the lane-su pins). The plan / scope / confirmer
 * binding is checked by the core gateway service, not here; `redeemToken` of `token.ts` checks only
 * redeemability, so no plan-mismatch refusal is pinned at this layer.
 */

const NOW = "2026-11-18T00:00:00.000Z";
const LATER = "2026-11-18T00:01:00.000Z";
const record = () => mintToken({ planId: "plan-1", planHash: "hash-1", scopeId: "scope-1", confirmerPrincipalId: "user-1", now: NOW });

/** The recorder plus begin/commit/statement events, so the lock's place in the transaction is visible. */
function eventKernel(base: ContentKernel): { kernel: ContentKernel; events: string[] } {
  const events: string[] = [];
  const kernel: ContentKernel = {
    ...base,
    transaction: async (fn) => { events.push("begin"); const result = await base.transaction(fn); events.push("commit"); return result; },
    lockKey: async (key) => { events.push(`lock:${key}`); await base.lockKey(key); },
    run: (fn) => { events.push("run"); return base.run(fn); },
  };
  return { kernel, events };
}

test("concurrent tryRedeem calls: exactly one redeems and the stored status is redeemed", async () => {
  const store = new SqliteTokenStore({ store: recordingKernel().kernel });
  const minted = record();
  await store.save(minted);
  const results = await Promise.all(Array.from({ length: 8 }, () => store.tryRedeem({ token: minted.confirmationToken, now: LATER })));
  assert.equal(results.filter((r) => r.redeemed).length, 1);
  assert.equal((await store.findByToken({ token: minted.confirmationToken }))?.status, "redeemed");
});

test("tryRedeem takes the per-token lock inside the transaction, before the read and the write", async () => {
  const wrapped = eventKernel(recordingKernel().kernel);
  const store = new SqliteTokenStore({ store: wrapped.kernel });
  const minted = record();
  await store.save(minted);
  wrapped.events.length = 0;
  await store.tryRedeem({ token: minted.confirmationToken, now: LATER });
  assert.deepEqual(wrapped.events, ["begin", `lock:gated_mutation_tokens:${minted.confirmationToken}`, "run", "run", "commit"]);
});

test("a skipped status update is reported as not redeemed, never as redeemed", async () => {
  const { kernel } = recordingKernel();
  const store = new SqliteTokenStore({ store: kernel });
  const minted = record();
  await store.save(minted);
  await kernel.execute(sql`CREATE TRIGGER skip_token_redemption BEFORE UPDATE ON gated_mutation_tokens BEGIN SELECT RAISE(IGNORE); END`);
  assert.deepEqual(await store.tryRedeem({ token: minted.confirmationToken, now: LATER }), { redeemed: false, record: minted });
  assert.equal((await store.findByToken({ token: minted.confirmationToken }))?.status, "minted");
});

test("the redeeming write is conditioned on the status it read: a token expired in between is not redeemed", async () => {
  const { kernel } = recordingKernel();
  let runs = 0;
  const racing: ContentKernel = {
    ...kernel,
    run: async (fn) => {
      runs += 1;
      if (runs === 2) await kernel.execute(sql`UPDATE gated_mutation_tokens SET status = 'expired'`);
      return kernel.run(fn);
    },
  };
  const store = new SqliteTokenStore({ store: racing });
  const minted = record();
  await store.save(minted);
  runs = 0;
  assert.deepEqual(await store.tryRedeem({ token: minted.confirmationToken, now: LATER }), { redeemed: false, record: minted });
  assert.equal((await store.findByToken({ token: minted.confirmationToken }))?.status, "expired");
});

test("unknown, past-TTL and already-expired tokens are refused with today's record (null for unknown)", async () => {
  const store = new SqliteTokenStore({ store: recordingKernel().kernel });
  const minted = record();
  const expiring = { ...record(), confirmationToken: "ctok_expiring" };
  await store.save(minted);
  await store.save(expiring);
  await store.expire({ token: expiring.confirmationToken });
  assert.deepEqual(await store.tryRedeem({ token: "ctok_unknown", now: LATER }), { redeemed: false, record: null });
  assert.deepEqual(await store.tryRedeem({ token: minted.confirmationToken, now: "2027-01-01T00:00:00.000Z" }), { redeemed: false, record: minted });
  assert.deepEqual(await store.tryRedeem({ token: expiring.confirmationToken, now: LATER }), { redeemed: false, record: { ...expiring, status: "expired" } });
});

test("save then findByToken round-trips the plan, scope, confirmer and expiry the service checks", async () => {
  const store = new SqliteTokenStore({ store: recordingKernel().kernel });
  const minted = record();
  await store.save(minted);
  const found = await store.findByToken({ token: minted.confirmationToken });
  assert.equal(found?.planHash, "hash-1");
  assert.equal(found?.scopeId, "scope-1");
  assert.equal(found?.confirmerPrincipalId, "user-1");
  assert.equal(found?.expiresAt, minted.expiresAt);
  assert.deepEqual(found, minted);
});

test("Tovu's redeemToken over the SQL store: first redeem returns the record, a second says already redeemed, an unknown token says expired", async () => {
  const store = new SqliteTokenStore({ store: recordingKernel().kernel });
  const minted = record();
  await store.save(minted);
  assert.deepEqual(await redeemToken({ store, token: minted.confirmationToken, now: LATER }), { ...minted, status: "redeemed" });
  await assert.rejects(redeemToken({ store, token: minted.confirmationToken, now: LATER }), TokenAlreadyRedeemedError);
  await assert.rejects(redeemToken({ store, token: "ctok_unknown", now: LATER }), TokenExpiredError);
});
