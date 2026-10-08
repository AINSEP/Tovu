import assert from "node:assert/strict";
import test from "node:test";

import { askOnce, askThenReport, createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createSystemClock } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


// pb1/F6.2: cleanup belongs to the one-shot exchange helper, not only its confirmation caller.
// Counterexample: move send outside try/finally; rejection still propagates but a late answer wins.
test("BUG: a rejected one-shot emission closes routing and preserves the original failure", async (t) => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => "pb1-send-failure" }, defaultChannel: "mcp-ui" });
  const failure = new Error("surface delivery failed");
  const exchange = store.open({ binding: { toolId: "fixture", principalId: "owner" }, emit: async () => { throw failure; } });
  t.after(() => exchange.close({}));

  await assert.rejects(askOnce({ exchange, emission: { channel: "mcp-ui", payload: {} } }), (error) => error === failure);
  assert.deepEqual(store.deliver({ exchangeId: "pb1-send-failure", principalId: "owner", params: { decision: "confirm" } }, { toolId: "fixture" }), { ok: false, reason: "unknown-or-closed" });
  assert.equal(store.size(), 0);
  assert.deepEqual(await exchange.receive({}), { status: "abandoned" });
});


// The outcome reporter shares the same cleanup obligation as the one-shot helper.
// A rejected initial send must never leave a late confirm redeemable.
test("a rejected ask/report emission closes routing and preserves the original failure", async (t) => {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => "pb1-report-failure" }, defaultChannel: "mcp-ui" });
  const failure = new Error("surface delivery failed");
  const exchange = store.open({ binding: { toolId: "fixture", principalId: "owner" }, emit: async () => { throw failure; } });
  t.after(() => exchange.close({}));
  await assert.rejects(askThenReport({ exchange, confirmationEmission: { channel: "mcp-ui", payload: {} }, handle: async () => {
    assert.fail("the answer handler must not run when the form could not be sent");
  } }), (error) => error === failure);
  assert.deepEqual(store.deliver({ exchangeId: exchange.id, principalId: "owner", params: { decision: "confirm" } }, { toolId: "fixture" }), { ok: false, reason: "unknown-or-closed" });
  assert.equal(store.size(), 0);
});
