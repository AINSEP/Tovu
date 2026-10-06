import { describe, expect, test } from "vitest";
import { terminalOutcomeNotice } from "../assistant-transport";
import { durableSubscriptionFixture } from "./durable-subscription.fixture";

/** CLI stderr and terminal diagnoses must stay visible. Daemon end is attempt-level evidence;
 * it no longer permits a browser to write a logical run as succeeded or failed. */
function endFrame(payload: Record<string, unknown>): string {
  return JSON.stringify({ runId: "old", kind: "end", payload });
}

describe("terminalOutcomeNotice", () => {
  test("a failed end payload names the status and the real exit code", () => {
    const notice = terminalOutcomeNotice(endFrame({ status: "failed", code: 1, signal: null, resumable: false }));
    expect(notice).not.toBeNull();
    expect(notice!.kind).toBe("status");
    expect((notice as { label: string }).label).toContain("Run failed");
    expect((notice as { detail: string }).detail).toContain("exit code 1");
    expect((notice as { detail: string }).detail).toContain("resumable no");
  });

  test("a canceled end payload is labelled as a cancellation, not a failure", () => {
    const notice = terminalOutcomeNotice(endFrame({ status: "canceled", code: null, signal: "SIGTERM" }));
    expect((notice as { label: string }).label).toBe("Run canceled");
    expect((notice as { detail: string }).detail).toContain("signal SIGTERM");
  });

  test("a resumable failure says so, so the operator knows a retry can recover the session", () => {
    const notice = terminalOutcomeNotice(endFrame({ status: "failed", code: 2, signal: null, resumable: true }));
    expect((notice as { detail: string }).detail).toContain("resumable yes");
  });

  test("a succeeded run produces no extra event — a normal turn is unchanged", () => {
    expect(terminalOutcomeNotice(endFrame({ status: "succeeded", code: 0, signal: null }))).toBeNull();
  });

  test("an absent, malformed, or status-less payload never throws and never fabricates a failure", () => {
    expect(terminalOutcomeNotice(undefined)).toBeNull();
    expect(terminalOutcomeNotice("not json at all")).toBeNull();
    expect(terminalOutcomeNotice(endFrame({ code: 0 }))).toBeNull();
  });
});

test("legacy subscribers still receive stderr, but a failed attempt end never finalizes their message", async () => {
  const h = durableSubscriptionFixture({ checkpoint: false }, {});
  h.opened[0]!.frame("stderr", JSON.stringify({ payload: { chunk: "Not logged in" } }), "1");
  h.opened[0]!.frame("end", endFrame({ status: "failed", code: 1 }), "2");
  await h.flush();
  expect(h.events).toEqual([{ kind: "raw", line: "Not logged in" }]);
  expect(h.done).toEqual([]); expect(h.errors).toEqual([]);
  h.abort.abort();
});

test("a persisted failed answer completes once with its saved diagnosis and partial text", async () => {
  const h = durableSubscriptionFixture();
  const events = [{ kind: "text" as const, text: "Partial" }, { kind: "status" as const, label: "Not logged in. Saved work is above." }];
  h.save({ id: "answer", role: "assistant", content: "Partial", runId: "old", runStatus: "failed", events });
  await h.tick(); await h.tick();
  expect(h.done).toEqual([events]); expect(h.errors).toEqual([]);
});
