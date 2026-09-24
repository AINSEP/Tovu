import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import type { RunHandlers } from "@jini-ai/chat/react";

import { createTovuAssistantTransport, terminalOutcomeNotice } from "../assistant-transport";
import { FakeEventSource, resetFakeEventSource } from "./assistant-transport.test-helpers";

/**
 * @file Regression suite for the 2026-09-06 "chat just craps out" investigation
 * (`ADS-memory/reports/2026-09-06-chat-death-investigation.md`).
 *
 * Two defects, both in `subscribeToRun`, both of which made a dead run indistinguishable from a
 * successful one:
 *
 * 1. **No `"stderr"` listener.** `@jini-ai/daemon`'s `agent-executor.ts` emits the agent CLI's
 *    stderr as its own SSE event kind. `subscribeToRun` registered listeners for `agent`, `stdout`,
 *    `error` and `end` only, and an `EventSource` silently drops a named event nobody listens for —
 *    so every diagnostic a dying CLI printed crossed the wire and was discarded in the browser.
 * 2. **`end.status` ignored.** `finish()` is the ONLY event a terminal run emits; its
 *    `RunEndPayload` carries `status`/`code`/`signal`/`resumable`. The `end` listener read only
 *    `reason` — a field that exists on the BYOK path and not on `RunEndPayload` at all — so a run
 *    the daemon had already classified `failed` was reported through `onDone` as an ordinary
 *    completion and persisted to `chat.db` as `run_status='succeeded'` with empty content.
 *
 * The live evidence both assertions are modelled on: `sites/tovu-com/chat.db` holds two assistant
 * rows with `run_status='succeeded'`, zero content, zero events, and durations of 578 ms (`codex`)
 * and 552 ms (`claude`).
 */

function handlers(): RunHandlers & { events: AgentEvent[]; errors: Error[]; done: AgentEvent[] | null } {
  const events: AgentEvent[] = [];
  const errors: Error[] = [];
  let done: AgentEvent[] | null = null;
  return {
    events,
    errors,
    get done() {
      return done;
    },
    onEvent: (ev: AgentEvent) => events.push(ev),
    onError: (err: Error) => errors.push(err),
    onDone: (finalEvents: AgentEvent[]) => {
      done = finalEvents;
    },
  } as unknown as RunHandlers & { events: AgentEvent[]; errors: Error[]; done: AgentEvent[] | null };
}

const HISTORY: ChatMessage[] = [{ id: "1", role: "user", content: "where do I write an article?" }];

/** Wire shape of a daemon `end` frame — `RunProtocolEventWire` with a `RunEndPayload`. */
function endFrame(payload: Record<string, unknown>): string {
  return JSON.stringify({ runId: "run-1", kind: "end", payload });
}

beforeEach(() => {
  resetFakeEventSource();
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ run: { id: "run-1" } }) })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe("subscribeToRun — a run that dies without answering", () => {
  test("forwards the agent CLI's stderr instead of dropping it", async () => {
    const h = handlers();
    await createTovuAssistantTransport().startRun({ history: HISTORY } as never, h);
    const source = FakeEventSource.instances[0]!;

    source.emit(
      "stderr",
      JSON.stringify({ runId: "run-1", kind: "stderr", payload: { chunk: "codex: not logged in" } }),
    );

    expect(h.events).toEqual([{ kind: "raw", line: "codex: not logged in" }]);
  });

  test("a failed end frame surfaces the failure, and carries it into the persisted event log", async () => {
    const h = handlers();
    await createTovuAssistantTransport().startRun({ history: HISTORY } as never, h);
    const source = FakeEventSource.instances[0]!;

    // Exactly the wire traffic behind chat 80bb855d position 7: no agent frames at all, then a
    // terminal `end` the daemon has already classified as a failure.
    source.emit("end", endFrame({ status: "failed", code: 1, signal: null, resumable: false }));

    // Before this fix `done` was `[]` — a completely empty, "successful" turn.
    expect(h.done).not.toBeNull();
    expect(h.done).toHaveLength(1);
    expect(h.done![0]!.kind).toBe("status");
    expect((h.done![0] as { label: string }).label).toContain("Run failed");
    expect((h.done![0] as { detail: string }).detail).toContain("exit code 1");
  });

  test("a successful end frame still finishes with exactly the events the run produced", async () => {
    const h = handlers();
    await createTovuAssistantTransport().startRun({ history: HISTORY } as never, h);
    const source = FakeEventSource.instances[0]!;

    source.emit(
      "agent",
      JSON.stringify({ runId: "run-1", kind: "agent", payload: { type: "text_delta", delta: "hello" } }),
    );
    source.emit("end", endFrame({ status: "succeeded", code: 0, signal: null }));

    expect(h.done).toEqual([{ kind: "text", text: "hello" }]);
    expect(h.errors).toEqual([]);
  });
});

/**
 * 2026-09-24 live publish: an agent commit reloaded the dev API, which restarted the agent daemon.
 * The daemon forgot the run, the stream dropped with a bare connection error, and the chat stayed
 * "running" forever; Stop then POSTed `/cancel` and got 404. A run the daemon no longer knows must
 * end as failed with a plain sentence, and stopping it must not be an error.
 */
describe("a run the agent daemon forgot (daemon restarted mid-run)", () => {
  function routeFetch(statusFor: (url: string, init?: RequestInit) => number) {
    return vi.fn(async (url: string, init?: RequestInit) => {
      const status = statusFor(url, init);
      if (status === 404) return new Response("run not found", { status: 404 });
      return new Response(JSON.stringify({ run: { id: "run-1", state: "running" } }), { status });
    });
  }

  test("a bare stream drop whose run the daemon answers 404 for ends the run as failed with a plain message", async () => {
    vi.stubGlobal("fetch", routeFetch((url, init) => (init?.method === "POST" ? 200 : 404)));
    const h = handlers();
    await createTovuAssistantTransport().startRun({ history: HISTORY } as never, h);
    const source = FakeEventSource.instances[0]!;

    source.emit("error", "");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(h.errors.map((e) => e.message)).toEqual([
      "assistant stream connection error",
      "The assistant restarted while this answer was running, so it stopped. Send your message again to retry.",
    ]);
    expect(h.done).not.toBeNull();
    expect(source.closed).toBe(true);
  });

  test("a bare stream drop while the daemon still knows the run leaves it running (EventSource reconnects)", async () => {
    vi.stubGlobal("fetch", routeFetch(() => 200));
    const h = handlers();
    await createTovuAssistantTransport().startRun({ history: HISTORY } as never, h);
    const source = FakeEventSource.instances[0]!;

    source.emit("error", "");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(h.errors.map((e) => e.message)).toEqual(["assistant stream connection error"]);
    expect(h.done).toBeNull();
    expect(source.closed).toBe(false);
  });

  test("stopping a run the daemon answers 404 for resolves — there is nothing left to stop", async () => {
    vi.stubGlobal("fetch", routeFetch(() => 404));

    await expect(createTovuAssistantTransport().stopRun("run-1")).resolves.toBeUndefined();
  });
});
