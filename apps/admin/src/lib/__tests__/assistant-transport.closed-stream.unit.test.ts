import { expect, test } from "vitest";
import { durableSubscriptionFixture } from "./durable-subscription.fixture";

/**
 * 2026-10-05: "List the secrets on my Fly app tovu." finished ("Done · 10s · $0.3651") but the chat
 * kept "Still working…" with Stop active for over a minute. The dev API restarts (and takes the
 * daemon with it) on every watched file edit; while the daemon boots, the API answers the stream's
 * reconnect with 502/503. A browser `EventSource` that gets a non-200 answer closes for good
 * (`readyState` CLOSED) and fires one bare `error`. The status lookup then saw the same 5xx, which
 * is not a 404, so nothing settled the turn and nothing ever reconnected.
 */
// The server projection now owns completion. These DI regressions retain the closed-stream
// and cursor guarantees while removing the old browser terminalization fallback.
test("a closed stream reopens at its cursor only after the saved message confirms its attempt", async () => {
  const h = durableSubscriptionFixture();
  h.opened[0]!.frame("agent", JSON.stringify({ payload: { type: "text_delta", delta: "Your Fly app has 3 secrets." } }), "cur-7");
  h.opened[0]!.dropped(); await h.flush();
  expect(h.done).toEqual([]);
  expect(h.opened).toHaveLength(1);
  h.save({ id: "answer", role: "assistant", content: "Your Fly app has 3 secrets.", runId: "old", runStatus: "running" });
  await h.tick();
  expect(h.opened.map(({ runId, cursor }) => ({ runId, cursor }))).toEqual([{ runId: "old", cursor: "" }, { runId: "old", cursor: "cur-7" }]);
  h.abort.abort(); expect(h.timers.size).toBe(0);
});

test("unreachable recovery keeps one polling timer and unmount releases it", async () => {
  const h = durableSubscriptionFixture();
  h.opened[0]!.dropped(); await h.flush();
  for (let i = 0; i < 4; i++) { await h.tick(); expect(h.timers.size).toBe(1); }
  expect(h.errors).toEqual([]); expect(h.done).toEqual([]);
  h.abort.abort(); expect(h.timers.size).toBe(0);
});

test("conversation deletion stops subscription without inventing a terminal message", async () => {
  const h = durableSubscriptionFixture(); h.save("gone"); await h.tick();
  expect(h.done).toEqual([]); expect(h.errors).toEqual([]); expect(h.timers.size).toBe(0);
  expect(h.closed).toEqual([0]);
});
