import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import { createRouteDeps } from "../app.js";
import { createServingApp } from "../serving-app.js";

/**
 * @file `createServingApp` schedules the pre-bound due-bindings DNS sweep on its own interval and
 * hands back the handle both serving boot paths stop (`serving-app-boot-wiring.unit.test.ts` pins
 * that). The hermetic root pre-binds none, so tests run no DNS sweep unless one is injected.
 */

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  for (let waited = 0; !condition() && waited < timeoutMs; waited += 10) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("createServingApp runs an injected due-bindings sweep on the injected interval and stops it", async () => {
  const deps = createRouteDeps();
  assert.equal(deps.verifyDueDomainBindings, undefined, "the hermetic root has no sweep");
  const limits: number[] = [];
  deps.verifyDueDomainBindings = async ({ limit }) => { limits.push(limit); return []; };
  const { domainBindingSweeper, webhookDeliveryWorker, outboxDrainer, trashSweeper } = createServingApp(deps, { domainBindingSweepIntervalMs: 10 });
  try {
    await waitFor(() => limits.length >= 1, 2_000);
    assert.equal(limits[0], 10);
  } finally {
    await domainBindingSweeper.stop();
    await webhookDeliveryWorker.stop();
    await outboxDrainer.stop();
    await trashSweeper.stop({});
  }
  const afterStop = limits.length;
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(limits.length, afterStop, "no sweep after stop");
});

test("a due-bindings pass traces domain.bindings.sweep once", async () => {
  const deps = createRouteDeps(), names: string[] = [], limits: number[] = [];
  deps.verifyDueDomainBindings = async ({ limit }) => { limits.push(limit); return []; };
  deps.tracker = {
    ...deps.tracker,
    async trace({ name, run }) { names.push(name); return run({ setOutcome() {} }); },
  };
  const { domainBindingSweeper, webhookDeliveryWorker, outboxDrainer, trashSweeper } = createServingApp(deps);
  try {
    await domainBindingSweeper.tick();
    assert.deepEqual(names, ["domain.bindings.sweep"]);
    assert.deepEqual(limits, [10]);
  } finally {
    await domainBindingSweeper.stop();
    await webhookDeliveryWorker.stop();
    await outboxDrainer.stop();
    await trashSweeper.stop({});
  }
});

test("an absent due-bindings sweep retains the idle handle without a trace", async () => {
  const deps = createRouteDeps(), names: string[] = [];
  assert.equal(deps.verifyDueDomainBindings, undefined);
  deps.tracker = {
    ...deps.tracker,
    async trace({ name, run }) { names.push(name); return run({ setOutcome() {} }); },
  };
  const { domainBindingSweeper, webhookDeliveryWorker, outboxDrainer, trashSweeper } = createServingApp(deps, { domainBindingSweepIntervalMs: 0 });
  try {
    await domainBindingSweeper.tick();
    assert.deepEqual(names, []);
  } finally {
    await domainBindingSweeper.stop();
    await webhookDeliveryWorker.stop();
    await outboxDrainer.stop();
    await trashSweeper.stop({});
  }
});
