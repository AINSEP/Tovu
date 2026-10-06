import { expect, test } from "vitest";
import { durableSubscriptionFixture } from "./durable-subscription.fixture";

/** n08: a connection interruption is not a terminal run error. A saved message can advance its
 * attempt after dev restart and preserve the answer independently of a browser connection. */
for (const state of ["running", "unreachable"] as const) {
  test(`restart with ${state} recovery preserves the logical answer until its saved completion`, async () => {
    const h = durableSubscriptionFixture();
    if (state === "running") h.save({ id: "answer", role: "assistant", content: "Partial", runId: "old", runStatus: "running", events: [{ kind: "text", text: "Partial" }] });
    h.opened[0]!.dropped(); await h.flush();
    expect(h.done).toEqual([]); expect(h.errors).toEqual([]);
    const content = "Partial\n\nContinued\n\nFinished answer";
    h.save({ id: "answer", role: "assistant", content, runId: "next", runStatus: "queued", events: [{ kind: "text", text: content }] });
    await h.tick();
    expect(h.opened.at(-1)!.runId).toBe("next");
    expect(h.opened.at(-1)!.cursor).toBe("");
    h.save({ id: "answer", role: "assistant", content, runId: "next", runStatus: "succeeded", events: [{ kind: "text", text: content }] });
    await h.tick(); await h.tick();
    expect(h.done).toEqual([[{ kind: "text", text: content }]]); expect(h.errors).toEqual([]); expect(h.timers.size).toBe(0);
  });
}
