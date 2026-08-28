import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventBus, InMemoryOutbox, processOutbox } from "../index.js";

test("processOutbox publishes pending events and marks delivered", async () => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const clock = { nowIso: () => "2026-02-21T00:00:00.000Z" };

  let handled = 0;
  await bus.subscribe("demo.event", async () => {
    handled += 1;
  });

  await outbox.enqueue({
    id: "evt-1",
    name: "demo.event",
    occurredAt: "2026-02-21T00:00:00.000Z",
    workspaceId: "workspace-1",
    payload: { ok: true },
  });

  const processed = await processOutbox({ outbox, bus, clock });
  assert.equal(processed, 1);
  assert.equal(handled, 1);
});
