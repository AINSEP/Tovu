import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { InMemoryEventBus, InMemoryOutbox } from "@jini-ai/infra/events/memory-bus";
import { createOutboxHostServices, processOutbox } from "../outbox-worker.js";

/**
 * @file Pins the bytes the site's outbox drains write to the console. The generic worker no longer
 * builds its own logger or timer; the host binding does, and an operator reading logs must see the
 * same lines at the same level as before that move.
 */

function captureConsole() {
  const calls = { info: mock.method(console, "info", () => {}), warn: mock.method(console, "warn", () => {}), error: mock.method(console, "error", () => {}), log: mock.method(console, "log", () => {}) };
  return { calls, restore: () => mock.restoreAll() };
}

test("a failed delivery writes the unprefixed worker line, its row meta, then the error class, through console.error only", async () => {
  const { calls, restore } = captureConsole();
  try {
    const outbox = new InMemoryOutbox();
    const bus = new InMemoryEventBus();
    await bus.subscribe({ eventName: "fail.event", handler: async () => { throw new Error("handler failed to execute"); } });
    await outbox.enqueue({ id: "evt-1", name: "fail.event", occurredAt: "2026-02-21T00:00:00.000Z", workspaceId: "workspace-1", payload: {} });

    await processOutbox({ outbox, bus, clock: { nowMs: () => Date.parse("2026-02-21T00:00:00.000Z") } });

    assert.equal(calls.error.mock.callCount(), 1);
    assert.deepEqual(calls.error.mock.calls[0]!.arguments, [
      '[outbox-worker] delivery of outbox event "fail.event" failed',
      { outboxId: "evt-1", attempt: 1, lastError: "Error" },
      "Error", // the failure itself is summarised by class only, never its message
    ]);
    for (const level of ["info", "warn", "log"] as const) assert.equal(calls[level].mock.callCount(), 0, `${level} stays silent`);
  } finally { restore(); }
});

test("the drain-failure line is written verbatim at error level with the failure as its second argument", () => {
  const { calls, restore } = captureConsole();
  try {
    const cause = new Error("database is locked");
    createOutboxHostServices({}).logger.error({ message: "[outbox-drainer] drain failed; retrying after the idle interval" }, { error: cause });
    assert.equal(calls.error.mock.callCount(), 1);
    const [line, summary] = calls.error.mock.calls[0]!.arguments;
    assert.equal(line, "[outbox-drainer] drain failed; retrying after the idle interval");
    assert.equal(summary, "Error", "the failure is summarised by class only, never its message");
  } finally { restore(); }
});

test("the host scheduler defers a zero-delay callback and cancels it without running it", async () => {
  const { scheduler } = createOutboxHostServices({});
  let ran = 0;
  const handle = scheduler.schedule({ delayMs: 0, callback: () => { ran += 1; } });
  assert.equal(ran, 0, "never synchronous");
  handle.cancel();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(ran, 0, "a cancelled timer never fires");
});
