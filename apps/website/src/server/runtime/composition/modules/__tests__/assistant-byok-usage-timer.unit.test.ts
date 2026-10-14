import assert from "node:assert/strict";
import test from "node:test";

import { createByokUsageTimer } from "../assistant-byok.js";

/**
 * @file `createByokUsageTimer` — gives BYOK usage events the `durationMs` the chat's "Done" line
 * needs. Provider adapters report tokens only, so without it a finished API-mode turn showed no line.
 */

test("each usage event gets the time since the previous one, so the turn's events sum to its elapsed time", () => {
  const clock = [1_500, 4_000, 9_000];
  const stamp = createByokUsageTimer({ startedAt: 1_000 }, { now: () => clock.shift()! });
  const durations = [stamp({ type: "usage", usage: null }), stamp({ type: "usage", usage: { promptTokenCount: 3 } }), stamp({ type: "usage", usage: null })]
    .map((event) => (event as { durationMs?: number }).durationMs);
  assert.deepEqual(durations, [500, 2_500, 5_000]);
  assert.equal(durations.reduce((a, b) => a! + b!, 0), 8_000);
});

test("non-usage events pass through untouched and do not move the mark", () => {
  const clock = [2_000];
  const stamp = createByokUsageTimer({ startedAt: 1_000 }, { now: () => clock.shift()! });
  const text = { type: "text_delta", delta: "hi" } as const;
  assert.equal(stamp(text), text);
  assert.deepEqual(stamp({ type: "usage", usage: { input_tokens: 1 } }), { type: "usage", usage: { input_tokens: 1 }, durationMs: 1_000 });
});

test("a clock that steps backwards never yields a negative duration", () => {
  const stamp = createByokUsageTimer({ startedAt: 5_000 }, { now: () => 4_000 });
  assert.deepEqual(stamp({ type: "usage", usage: null }), { type: "usage", usage: null, durationMs: 0 });
});
