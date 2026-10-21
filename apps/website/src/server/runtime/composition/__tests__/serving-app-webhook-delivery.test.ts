import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import { createRouteDeps } from "../app.js";
import { createServingApp } from "../serving-app.js";

/**
 * @file `createServingApp` starts the webhook delivery loop and returns it, so both serving boot
 * paths can stop it at shutdown (`serving-app-boot-wiring.unit.test.ts` pins that they do). What a
 * tick does is `webhook-delivery-worker.test.ts`'s subject; here only that the serving composition
 * built a working loop over its own deps. Also covers the trash sweeper's failure log line, the one
 * branch of this file no other suite reaches.
 */

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  for (let waited = 0; !condition() && waited < timeoutMs; waited += 10) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("createServingApp hands back a running webhook delivery loop on its own interval, and the trash sweeper logs a failed sweep", async (t) => {
  const deps = createRouteDeps();
  const errors = t.mock.method(console, "error", () => {});
  let claims = 0;
  const claimPending = deps.webhookDeliveryRepo.claimPending.bind(deps.webhookDeliveryRepo);
  deps.webhookDeliveryRepo.claimPending = async (required) => {
    claims += 1;
    return claimPending(required);
  };
  deps.sweepTrash = async () => { throw new Error("sweep failed"); };

  const { webhookDeliveryWorker, outboxDrainer, trashSweeper } = createServingApp(deps, { webhookDeliveryIntervalMs: 10, trashSweepIntervalMs: 10 });
  try {
    await waitFor(() => claims >= 1, 2_000);
    assert.ok(claims >= 1, "the loop never claimed: createServingApp did not start it on the injected interval");
    await webhookDeliveryWorker.tick();
    await waitFor(() => errors.mock.calls.some((call) => String(call.arguments[0]).startsWith("[trash-sweeper]")), 2_000);
    assert.ok(errors.mock.calls.some((call) => String(call.arguments[0]).startsWith("[trash-sweeper] sweep failed")));
    assert.ok(!errors.mock.calls.some((call) => String(call.arguments[0]).startsWith("[webhooks]")), "an empty queue logs nothing");
  } finally {
    await webhookDeliveryWorker.stop();
    await outboxDrainer.stop();
    await trashSweeper.stop({});
  }
  const afterStop = claims;
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(claims, afterStop, "no tick after stop");
});
