import assert from "node:assert/strict";
import { test } from "node:test";

import { createServingFormPullTrigger, FORM_PULL_STOP_GRACE_MS, FORM_PULL_STOP_LATE_LINE } from "../form-pull-triggers.js";

/**
 * @file Shutdown of the serving app's automatic pulls: `stop` waits for a running pull and the
 * notification drain it started, but never longer than the grace, so a hung receiver cannot keep
 * the site store open past the shutdown bound.
 */

test("stop returns within the grace while a pull hangs, and logs one line", async (t) => {
  const warned: string[] = [];
  t.mock.method(console, "warn", (line: string) => { warned.push(line); });
  let started = 0;
  const trigger = createServingFormPullTrigger({ autoPull: { run: () => { started += 1; return new Promise<void>(() => undefined); }, drained: async () => undefined }, workspaceId: "ws" });
  trigger.pullNow();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started, 1);

  const before = Date.now();
  await trigger.stop();
  const waitedMs = Date.now() - before;

  assert.ok(waitedMs >= FORM_PULL_STOP_GRACE_MS - 20 && waitedMs < FORM_PULL_STOP_GRACE_MS + 500, `stop waited ${waitedMs} ms`);
  assert.deepEqual(warned, [FORM_PULL_STOP_LATE_LINE]);
});

test("stop waits for the notification drain a finished pull started, and no longer", async (t) => {
  const warned: string[] = [];
  t.mock.method(console, "warn", (line: string) => { warned.push(line); });
  const order: string[] = [];
  let finishDrain!: () => void;
  const drain = new Promise<void>((resolve) => { finishDrain = resolve; });
  const trigger = createServingFormPullTrigger({ autoPull: { run: async () => { order.push("pulled"); }, drained: async () => { await drain; order.push("drained"); } }, workspaceId: "ws" });
  trigger.pullNow();
  const stopped = trigger.stop().then(() => { order.push("stopped"); });
  setTimeout(finishDrain, 50);
  const before = Date.now();
  await stopped;
  assert.deepEqual(order, ["pulled", "drained", "stopped"]);
  assert.ok(Date.now() - before < FORM_PULL_STOP_GRACE_MS / 2, "stop returned when the drain settled, not at the grace");
  assert.deepEqual(warned, []);
});
