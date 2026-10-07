import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import type { ChatTransport, RunHandlers } from "@jini-ai/chat/react";
import { useConversation } from "@jini-ai/chat/react";

import { createTovuAssistantTransport, terminalFailureError } from "../assistant-transport";
import { persistableMessages } from "../assistant-chats";
import { shouldPublishOnMessagesChange } from "../../components/AssistantDock/hooks/AssistantDock.hooks";
import { FakeEventSource, resetFakeEventSource } from "./assistant-transport.test-helpers";
import { durableRunBindings } from "../durable-run-subscription";
import { translateRunFrame } from "@tovu/assistant-run-events";

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
 * Since the 2026-10-06 durable-runs cut, the server finalizer/recovery coordinator owns persisted
 * daemon status. An attempt's failed end may start a continuation; it cannot fail the logical
 * answer in the browser. `/recover` returns the saved projection, and checkpoint-capable hooks
 * use that status/events to settle the pane. Legacy handlers still need error-before-done.
 *
 * WHY THE SECOND DESCRIBE BLOCK EXISTS. A callback alone cannot prove the pane settles or keeps
 * its diagnostic. Drive the REAL transport, subscription, useRunStream and useConversation over
 * the HTTP boundary with no mocks on the status path. The complementary real-SQL/finalizer tests
 * in website/server/__tests__/assistant-durable-finalizer.unit.test.ts prove that the NEW writer
 * commits these outcomes without any browser. Here the saved row must reach the UI intact; it is
 * no longer inferred from one attempt's end or written back by the browser.
 */

/** Wire shape of a daemon `end` frame — a `RunProtocolEventWire` carrying a `RunEndPayload`. */
function endFrame(payload: Record<string, unknown>): string {
  return JSON.stringify({ runId: "run-1", kind: "end", payload });
}

function collectingHandlers(): RunHandlers & { errors: Error[]; done: AgentEvent[] | null; order: string[] } {
  const errors: Error[] = [];
  let done: AgentEvent[] | null = null;
  const order: string[] = [];
  return {
    errors,
    order,
    get done() {
      return done;
    },
    onEvent: () => {},
    onError: (err: Error) => { order.push("error"); errors.push(err); },
    onDone: (finalEvents: AgentEvent[]) => {
      order.push("done"); done = finalEvents;
    },
  };
}

const HISTORY: ChatMessage[] = [{ id: "1", role: "user", content: "where do I write an article?" }];
let savedMessage: ChatMessage;
let recoverRequests: Array<{ url: string; messageId?: string }>;
const subscriptions: AbortController[] = [];

/** The finalizer uses this same translation before committing its projection. This fixture
 * models the HTTP boundary; real persistence is covered by the server companion suite. */
function saveTerminalProjection(payload: Record<string, unknown>, events: AgentEvent[] = []): void {
  const outcome = translateRunFrame("end", endFrame(payload));
  savedMessage = { ...savedMessage, runStatus: outcome.terminal!, endedAt: 123,
    events: [...events, ...outcome.events],
    content: events.flatMap((event) => event.kind === "text" ? [event.text] : []).join("") };
}

async function startWithHandlers(handlers: RunHandlers): Promise<void> {
  const abort = new AbortController();
  subscriptions.push(abort);
  await createTovuAssistantTransport().startRun({ history: HISTORY, signal: abort.signal }, handlers);
}

beforeEach(() => {
  vi.useFakeTimers();
  resetFakeEventSource();
  durableRunBindings.clear();
  savedMessage = { id: "answer", role: "assistant", content: "", runId: "run-1", runStatus: "running", events: [] };
  recoverRequests = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/runs" && init?.method === "POST") {
        const context = JSON.parse(JSON.parse(init.body as string).contextRef);
        savedMessage = { ...savedMessage, id: context.assistantMessageId ?? "answer" };
        return new Response(JSON.stringify({ run: { id: "run-1" }, messageId: savedMessage.id, conversationId: "chat" }));
      }
      if (url === "/api/runs/run-1/recover" && init?.method === "POST") {
        recoverRequests.push({ url, ...JSON.parse(init.body as string) });
        return new Response(JSON.stringify({ message: savedMessage }));
      }
      throw new Error(`Unexpected request: ${init?.method} ${url}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  subscriptions.splice(0).forEach((abort) => abort.abort());
  durableRunBindings.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

describe("subscribeToRun — saved terminal state owns settlement", () => {
  test("a failed end frame reads the saved failure and reports onError BEFORE settling legacy handlers", async () => {
    const h = collectingHandlers();
    await startWithHandlers(h);

    saveTerminalProjection({ status: "failed", code: 1, signal: null, resumable: false });

    FakeEventSource.instances[0]!.emit("end", endFrame({ status: "failed", code: 1, signal: null, resumable: false }));

    // An end only triggers recovery; the async saved row must arrive before either callback.
    // Legacy handlers need error-then-done so settlement preserves the failure status.
    expect(h.errors).toEqual([]);
    expect(h.done).toBeNull();
    await vi.waitFor(() => expect(h.done).not.toBeNull());
    expect(h.errors).toHaveLength(1);
    expect(h.errors[0]!.message).toContain("could not finish");
    expect(h.order).toEqual(["error", "done"]);
    expect(h.done).toEqual(savedMessage.events);
    expect(JSON.stringify(h.done)).toContain("exit code 1");
    expect(recoverRequests).toEqual([{ url: "/api/runs/run-1/recover", messageId: "answer" }]);
    // A duplicate end/late poll cannot report or finish the logical answer twice.
    FakeEventSource.instances[0]!.emit("end", endFrame({ status: "failed", code: 1 }));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.order).toEqual(["error", "done"]);
  });

  test("a canceled end frame settles without reporting an error", async () => {
    const h = collectingHandlers();
    await startWithHandlers(h);
    saveTerminalProjection({ status: "canceled", code: null, signal: "SIGTERM" });

    FakeEventSource.instances[0]!.emit("end", endFrame({ status: "canceled", code: null, signal: "SIGTERM" }));

    await vi.waitFor(() => expect(h.done).not.toBeNull());
    expect(h.errors).toEqual([]);
    expect(h.done).not.toBeNull();
  });

  test("a successful saved answer settles without an error or duplicated live text", async () => {
    const h = collectingHandlers();
    await startWithHandlers(h);
    const source = FakeEventSource.instances[0]!;

    source.emit("agent", JSON.stringify({ runId: "run-1", kind: "agent", payload: { type: "text_delta", delta: "hi" } }));
    saveTerminalProjection({ status: "succeeded", code: 0, signal: null }, [{ kind: "text", text: "hi" }]);
    source.emit("end", endFrame({ status: "succeeded", code: 0, signal: null }));

    await vi.waitFor(() => expect(h.done).not.toBeNull());
    expect(h.errors).toEqual([]);
    expect(h.done).toEqual([{ kind: "text", text: "hi" }]);
  });
});

/**
 * Drives one whole turn through the real `useConversation` + real transport and returns the
 * assistant projection exactly as the server's saved row should appear in the pane.
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
    saveTerminalProjection(endPayload);
    FakeEventSource.instances[0]!.emit("end", endFrame(endPayload));
  });

  const messages = result.current.messages;
  const assistant = messages.find((m) => m.role === "assistant")!;
  return { messages, assistant, isStreaming: result.current.isStreaming };
}

describe("what the server's saved outcome displays (real useConversation, no mocks on the status path)", () => {
  test("a server-persisted failed run reaches the pane as 'failed', not 'succeeded'", async () => {
    const { messages, assistant } = await runOneTurnEndingWith({
      status: "failed",
      code: 1,
      signal: null,
      resumable: false,
    });

    // THE assertion. Historically it was `"succeeded"` — the durable lie that made a chat
    // death indistinguishable from an empty but successful answer once the transcript was gone.
    // Asserted as the exact string rather than via `isTerminalRunStatus`, which is true of
    // `"succeeded"` too and would therefore have passed under the bug.
    expect(assistant.runStatus).toBe("failed");

    // Keep the terminal filtering contract, but the browser no longer owns the daemon write.
    const persisted = persistableMessages(messages);
    expect(persisted.map((m) => m.id)).toContain(assistant.id);
    expect(persisted.find((m) => m.id === assistant.id)!.runStatus).toBe("failed");
    expect(recoverRequests).toEqual([{ url: "/api/runs/run-1/recover", messageId: assistant.id }]);
  });

  test("the saved failure's own diagnostic survives checkpoint and completion, so the row explains itself", async () => {
    const { assistant } = await runOneTurnEndingWith({ status: "failed", code: 1, signal: null, resumable: false });

    // Checkpoint and onDone both carry saved events. Their merge must preserve exactly one
    // diagnostic, including the exit details, instead of erasing it or duplicating the notice.
    const labels = (assistant.events ?? []).map((ev) => (ev as { label?: string }).label ?? "");
    expect(labels.filter((label) => label.includes("Run failed"))).toHaveLength(1);
    expect(JSON.stringify(assistant.events)).toContain("exit code 1");
    expect(JSON.stringify(assistant.events)).toContain("signal none");
    expect(assistant.events).toEqual(savedMessage.events);
  });

  test("a server-persisted successful run still reaches the pane as 'succeeded'", async () => {
    const { assistant } = await runOneTurnEndingWith({ status: "succeeded", code: 0, signal: null });
    expect(assistant.runStatus).toBe("succeeded");
  });

  test("a server-persisted canceled run reaches the pane as 'canceled' and settles without failure", async () => {
    const { assistant, messages, isStreaming } = await runOneTurnEndingWith({ status: "canceled", code: null, signal: "SIGTERM" });
    expect(assistant.runStatus).not.toBe("failed");
    expect(assistant.runStatus).toBe("canceled");
    expect(isStreaming).toBe(false);
    expect(persistableMessages(messages).find((message) => message.id === assistant.id)?.runStatus).toBe("canceled");
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
    expect(shouldPublishOnMessagesChange({ messages, settledRunMessageId: assistant.id }).publish).toBe(false);
  });

  test("an attempt failure leaves the pane active until a later saved terminal checkpoint arrives", async () => {
    const transport = createTovuAssistantTransport();
    const { result } = renderHook(() => useConversation({ transport }));
    await act(async () => { await result.current.sendMessage("where do I write an article?"); });
    const partial: AgentEvent[] = [{ kind: "text", text: "Saved partial answer" }];
    savedMessage = { ...savedMessage, content: "Saved partial answer", events: partial };

    // A failed attempt is evidence for recovery, not a logical failure. The durable message
    // remains running, and no browser error may prematurely release the pane/dock.
    await act(async () => {
      FakeEventSource.instances[0]!.emit("end", endFrame({ status: "failed", code: 1, signal: null }));
    });
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.messages.at(-1)?.content).toBe("Saved partial answer");
    expect(shouldPublishOnMessagesChange({ messages: result.current.messages, settledRunMessageId: null }).publish).toBe(false);

    // When the server later exhausts recovery, even with no second SSE end, polling must settle
    // the same bubble, retain its work and one diagnostic, and release the composer.
    saveTerminalProjection({ status: "failed", code: 1, signal: null }, partial);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    const assistant = result.current.messages.at(-1)!;
    expect(assistant.id).toBe(savedMessage.id);
    expect(assistant.runStatus).toBe("failed");
    expect(assistant.content).toBe("Saved partial answer");
    expect(assistant.events).toEqual(savedMessage.events);
    expect(result.current.isStreaming).toBe(false);
    expect(shouldPublishOnMessagesChange({ messages: result.current.messages, settledRunMessageId: null }).publish).toBe(true);
  });
});
