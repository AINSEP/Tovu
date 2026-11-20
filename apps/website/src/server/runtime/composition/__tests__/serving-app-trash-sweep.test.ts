import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { TrashSweepReport } from "@jini-ai/cms/trash";

import { createRouteDeps } from "../app.js";
import { createServingApp } from "../serving-app.js";

test("a trash sweep pass traces trash.purge and returns the sweep result", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const deps = createRouteDeps();
  const report: TrashSweepReport = { claimed: 0, purged: 0, results: [] };
  const names: string[] = [];
  let tracedResult: unknown;
  deps.sweepTrash = async () => report;
  deps.tracker = {
    ...deps.tracker,
    async trace({ name, run }) {
      names.push(name);
      const result = await run({ setOutcome() {} });
      tracedResult = result;
      return result;
    },
  };
  const { webhookDeliveryWorker, outboxDrainer, trashSweeper } = createServingApp(deps);
  try {
    t.mock.timers.tick(0);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(names, ["trash.purge"]);
    assert.equal(tracedResult, report);
  } finally {
    await webhookDeliveryWorker.stop();
    await outboxDrainer.stop();
    await trashSweeper.stop({});
  }
});

test("a rejected trash sweep fails its trace and reaches the existing error callback", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const deps = createRouteDeps(), failure = new Error("sweep failed");
  const errors = t.mock.method(console, "error", () => {});
  const outcomes: Array<{ name: string; failed: boolean }> = [];
  deps.sweepTrash = async () => { throw failure; };
  deps.tracker = {
    ...deps.tracker,
    async trace({ name, run }) {
      try { const result = await run({ setOutcome() {} }); outcomes.push({ name, failed: false }); return result; }
      catch (error) { outcomes.push({ name, failed: true }); throw error; }
    },
  };
  const { webhookDeliveryWorker, outboxDrainer, trashSweeper } = createServingApp(deps);
  try {
    t.mock.timers.tick(0);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(outcomes, [{ name: "trash.purge", failed: true }]);
    const logged = errors.mock.calls.find((call) => String(call.arguments[0]).startsWith("[trash-sweeper]"));
    assert.ok(logged);
    assert.equal(logged.arguments[1], failure);
  } finally {
    await webhookDeliveryWorker.stop();
    await outboxDrainer.stop();
    await trashSweeper.stop({});
  }
});
