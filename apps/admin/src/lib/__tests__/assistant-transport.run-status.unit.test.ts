import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import type { ChatTransport, RunHandlers } from "@jini-ai/chat/react";
import { useConversation } from "@jini-ai/chat/react";

import { createTovuAssistantTransport, terminalFailureError } from "../assistant-transport";
import { persistableMessages } from "../assistant-chats";
import { shouldPublishOnMessagesChange } from "../../components/AssistantDock/hooks/AssistantDock.hooks";
import { FakeEventSource, resetFakeEventSource } from "./assistant-transport.test-helpers";

/**
 * @file What a dead chat run WRITES DOWN — the durable half of the 2026-09-06 chat-death
 * investigation, ruled in on 2026-09-07.
 *
 * `f682eff2` fixed the two TRANSPORT causes (an unlistened `stderr` event; an `end` listener that
 * read `reason`, a field `RunEndPayload` does not have). It deliberately stopped short of changing
 * what gets persisted, and said so in `assistant-transport.ts`'s own comment: routing a daemon
 * `end` frame's `status: "failed"` through `handlers.onError` "would flip the persisted
 * `run_status` to `failed`, which is a behavior change to what the product writes down and is out
 * of scope until the owner signs off."
 *
 * That is the change this suite certifies. The durable record was LYING — a run that produced
 * nothing was stored as `run_status='succeeded'` with empty content, which is why diagnosing chat
 * deaths needed a live transcript and burned multiple sessions. Live evidence, read-only, on
 * 2026-09-07: `sites/tovu-com/chat.db` holds 2 `ai_chat_messages` rows with `run_status='succeeded'`
 * and empty content out of 61 total.
 *
 * WHY THE SECOND DESCRIBE BLOCK EXISTS. Asserting `handlers.onError` fires proves the transport
 * calls a callback; it does NOT prove the persisted status changes, because nothing in
 * `assistant-transport.ts` computes `runStatus` at all. Three pieces of code Tovu does not own
 * decide that: `useRunStream` (`onError` -> `status: 'error'`, and — load-bearing — an `onDone`
 * arriving AFTER it keeps `'error'` rather than overwriting with `'done'`), `useConversation`
 * (`'error'` -> `runStatus: 'failed'`), and `isTerminalRunStatus` (`'failed'` is terminal, so
 * `persistableMessages` keeps the row instead of discarding it as still-streaming). So these tests
 * drive the REAL `useConversation` over the REAL transport with no `vi.mock` of anything on that
 * path, and assert the exact string that reaches `PUT /api/assistant/chats/:id/messages/:messageId`
 * — the value the SQLite column takes verbatim (`@jini-ai/sqlite`'s `chat-history/store.ts`
 * upserts `runStatus` with no whitelist; Tovu's route validates only `role`).
 */

/** Wire shape of a daemon `end` frame — a `RunProtocolEventWire` carrying a `RunEndPayload`. */
function endFrame(payload: Record<string, unknown>): string {
  return JSON.stringify({ runId: "run-1", kind: "end", payload });
}

function collectingHandlers(): RunHandlers & { errors: Error[]; done: AgentEvent[] | null } {
  const errors: Error[] = [];
  let done: AgentEvent[] | null = null;
  return {
    errors,
    get done() {
      return done;
    },
    onEvent: () => {},
    onError: (err: Error) => errors.push(err),
    onDone: (finalEvents: AgentEvent[]) => {
      done = finalEvents;
    },
  } as unknown as RunHandlers & { errors: Error[]; done: AgentEvent[] | null };
}

const HISTORY: ChatMessage[] = [{ id: "1", role: "user", content: "where do I write an article?" }];

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

describe("terminalFailureError", () => {
  test("a failed end payload yields a reportable Error naming the exit code and signal", () => {
    const error = terminalFailureError(endFrame({ status: "failed", code: 1, signal: null, resumable: false }));
    expect(error).toBeInstanceOf(Error);
    expect(error!.message).toContain("exit code 1");
    expect(error!.message).toContain("signal none");
  });

  test("a canceled end payload is NOT a failure — a stop the operator asked for must not read as one", () => {
    expect(terminalFailureError(endFrame({ status: "canceled", code: null, signal: "SIGTERM" }))).toBeNull();
  });

  test("a succeeded end payload yields no error", () => {
    expect(terminalFailureError(endFrame({ status: "succeeded", code: 0, signal: null }))).toBeNull();
  });

  test("an absent, malformed, or status-less payload never fabricates a failure", () => {
    expect(terminalFailureError(undefined)).toBeNull();
    expect(terminalFailureError("not json at all")).toBeNull();
    expect(terminalFailureError(endFrame({ code: 0 }))).toBeNull();
  });
});

describe("subscribeToRun — a daemon-classified failure reaches onError", () => {
  test("a failed end frame reports the failure through onError BEFORE settling the run", async () => {
    const h = collectingHandlers();
    await createTovuAssistantTransport().startRun({ history: HISTORY } as never, h);

    FakeEventSource.instances[0]!.emit("end", endFrame({ status: "failed", code: 1, signal: null, resumable: false }));

    // Order is load-bearing, not incidental: `useRunStream`'s `onDone` keeps a prior `'error'`
    // status but an `onError` arriving after `onDone` would still land, so the ONLY ordering that
    // both marks the run failed and preserves the collected events is error-then-done.
    expect(h.errors).toHaveLength(1);
    expect(h.errors[0]!.message).toContain("exit code 1");
    expect(h.done).not.toBeNull();
  });

  test("a canceled end frame settles without reporting an error", async () => {
    const h = collectingHandlers();
    await createTovuAssistantTransport().startRun({ history: HISTORY } as never, h);

    FakeEventSource.instances[0]!.emit("end", endFrame({ status: "canceled", code: null, signal: "SIGTERM" }));

    expect(h.errors).toEqual([]);
    expect(h.done).not.toBeNull();
  });

  test("a successful end frame reports no error — a normal turn is byte-identical to before", async () => {
    const h = collectingHandlers();
    await createTovuAssistantTransport().startRun({ history: HISTORY } as never, h);
    const source = FakeEventSource.instances[0]!;

    source.emit("agent", JSON.stringify({ runId: "run-1", kind: "agent", payload: { type: "text_delta", delta: "hi" } }));
    source.emit("end", endFrame({ status: "succeeded", code: 0, signal: null }));

    expect(h.errors).toEqual([]);
    expect(h.done).toEqual([{ kind: "text", text: "hi" }]);
  });
});

/**
 * Drives one whole turn through the real `useConversation` + real transport and returns the
 * assistant message exactly as `saveMessage` would serialize it.
 *
 * `transport` is built once outside the render callback on purpose: `useRunStream` closes over it
 * in `start`'s dependency list, and rebuilding it per render would swap the transport out from
 * under an in-flight run — the same reason `AssistantDock.tsx` memoizes it in production.
 */
async function runOneTurnEndingWith(endPayload: Record<string, unknown>): Promise<{
  messages: ChatMessage[];
  assistant: ChatMessage;
  isStreaming: boolean;
}> {
  const transport: ChatTransport = createTovuAssistantTransport();
  const { result } = renderHook(() => useConversation({ transport }));

  await act(async () => {
    await result.current.sendMessage("where do I write an article?");
  });

  await act(async () => {
    FakeEventSource.instances[0]!.emit("end", endFrame(endPayload));
  });

  const messages = result.current.messages;
  const assistant = messages.find((m) => m.role === "assistant")!;
  return { messages, assistant, isStreaming: result.current.isStreaming };
}

describe("what a dead run writes down (real useConversation, no mocks on the status path)", () => {
  test("a run the daemon classified as failed is persisted as run_status='failed', not 'succeeded'", async () => {
    const { messages, assistant } = await runOneTurnEndingWith({
      status: "failed",
      code: 1,
      signal: null,
      resumable: false,
    });

    // THE assertion. Before this change it was `"succeeded"` — the durable lie that made a chat
    // death indistinguishable from an empty but successful answer once the transcript was gone.
    // Asserted as the exact string rather than via `isTerminalRunStatus`, which is true of
    // `"succeeded"` too and would therefore have passed under the bug.
    expect(assistant.runStatus).toBe("failed");

    // And it actually reaches the writer: `persistableMessages` is what `AssistantDock` filters
    // the transcript through before `saveMessage` PUTs each row.
    const persisted = persistableMessages(messages);
    expect(persisted.map((m) => m.id)).toContain(assistant.id);
    expect(persisted.find((m) => m.id === assistant.id)!.runStatus).toBe("failed");
  });

  test("the failure's own diagnostic survives into the persisted event log, so the row explains itself", async () => {
    const { assistant } = await runOneTurnEndingWith({ status: "failed", code: 1, signal: null, resumable: false });

    // `useRunStream.onDone` runs after `onError` and overwrites `events` with the collected list,
    // so marking the run failed must not cost the operator the reason it failed.
    const labels = (assistant.events ?? []).map((ev) => (ev as { label?: string }).label ?? "");
    expect(labels.some((label) => label.includes("Run failed"))).toBe(true);
  });

  test("a successful run is still persisted as 'succeeded' — the change is not a blanket downgrade", async () => {
    const { assistant } = await runOneTurnEndingWith({ status: "succeeded", code: 0, signal: null });
    expect(assistant.runStatus).toBe("succeeded");
  });

  test("a canceled run is persisted as 'succeeded' today and must not silently become 'failed'", async () => {
    const { assistant } = await runOneTurnEndingWith({ status: "canceled", code: null, signal: "SIGTERM" });
    expect(assistant.runStatus).not.toBe("failed");
  });

  /**
   * The failure this change could plausibly have traded the wrong record FOR: if `failed` were not
   * already terminal, a failed run would settle nothing and the dock would spin forever waiting.
   * Asserted against the two real consumers rather than against `isTerminalRunStatus` directly —
   * a `failed` that is terminal in the predicate but mishandled by a caller would still hang, and
   * the predicate alone cannot show that.
   */
  test("a failed run settles the pane and the dock — no wrong record traded for a stuck UI", async () => {
    const { messages, assistant, isStreaming } = await runOneTurnEndingWith({
      status: "failed",
      code: 1,
      signal: null,
      resumable: false,
    });

    // `useConversation.isStreaming` is what `ChatPane` reads to keep the composer disabled and the
    // streaming indicator up.
    expect(isStreaming).toBe(false);

    // `AssistantDock.hooks.tsx`'s real settlement gate — the settings/content refresh buses fire
    // exactly once per finished run, and a run that never counts as finished never releases them.
    expect(shouldPublishOnMessagesChange({ messages, settledRunMessageId: null })).toEqual({
      publish: true,
      nextSettledRunMessageId: assistant.id,
    });
  });
});
