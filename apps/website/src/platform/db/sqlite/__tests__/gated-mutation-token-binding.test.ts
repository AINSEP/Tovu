import assert from "node:assert/strict";
import { test } from "node:test";

import type { ConfirmationTokenRecord } from "#src/contracts/core/gated-mutations/token";
import { recordingKernel } from "#src/__tests__/lane-su-pins/support/recording-kernel";
import { type InnerTokenStore, SqliteTokenStore } from "../gated-mutation-token-repo.sqlite.js";

/**
 * @file S5b binding test: Tovu's positional `save(record)` reaches the Jini store as `save({ record })` with the
 * very same record object; every other method passes its argument through unchanged.
 */

const record: ConfirmationTokenRecord = {
  confirmationToken: "ctok_1", planHash: "hash", scopeId: "scope", confirmerPrincipalId: "user",
  status: "minted", createdAt: "2026-11-18T00:00:00.000Z", expiresAt: "2026-11-18T00:10:00.000Z",
};

test("save hands the same record object to the Jini store as { record }; the other methods pass through", async () => {
  const calls: Array<[string, unknown]> = [];
  const inner: InnerTokenStore = {
    save: async (required) => { calls.push(["save", required]); },
    findByToken: async (required) => { calls.push(["findByToken", required]); return record; },
    tryRedeem: async (required) => { calls.push(["tryRedeem", required]); return { redeemed: true, record }; },
    expire: async (required) => { calls.push(["expire", required]); },
    count: async () => { calls.push(["count", undefined]); return 3; },
  };
  const store = new SqliteTokenStore({ store: recordingKernel().kernel }, { inner });
  await store.save(record);
  assert.equal(await store.count(), 3);
  assert.equal(await store.findByToken({ token: "ctok_1" }), record);
  assert.deepEqual(await store.tryRedeem({ token: "ctok_1", now: "n" }), { redeemed: true, record });
  await store.expire({ token: "ctok_1" });
  assert.equal((calls[0]?.[1] as { record: unknown }).record, record);
  assert.deepEqual(calls.slice(1), [["count", undefined], ["findByToken", { token: "ctok_1" }], ["tryRedeem", { token: "ctok_1", now: "n" }], ["expire", { token: "ctok_1" }]]);
});
