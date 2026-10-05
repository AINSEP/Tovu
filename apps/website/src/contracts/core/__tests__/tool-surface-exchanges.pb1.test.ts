import assert from "node:assert/strict";
import test from "node:test";

import { askOnce, createSurfaceExchangeStore } from "../tool-surface-exchanges.js";

// pb1/F6.2: cleanup belongs to the one-shot exchange helper, not only its confirmation caller.
// Counterexample: move send outside try/finally; rejection still propagates but a late answer wins.
test("BUG: a rejected one-shot emission closes routing and preserves the original failure", async (t) => {
  const store = createSurfaceExchangeStore({ newExchangeId: () => "pb1-send-failure" });
  const failure = new Error("surface delivery failed");
  const exchange = store.open({ toolId: "fixture", principalId: "owner" }, async () => { throw failure; });
  t.after(() => exchange.close());

  await assert.rejects(askOnce(exchange, { channel: "mcp-ui", payload: {} }), (error) => error === failure);
  assert.deepEqual(store.deliver({
    exchangeId: "pb1-send-failure", toolId: "fixture", principalId: "owner", params: { decision: "confirm" },
  }), { ok: false, reason: "unknown-or-closed" });
  assert.equal(store.size(), 0);
  assert.deepEqual(await exchange.receive(), { status: "abandoned" });
});
