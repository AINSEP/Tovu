import { expect, test } from "vitest";
import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import { followDurableRun, type DurableSubscriptionPorts } from "../durable-run-subscription";
import { startQueuedDaemonRun } from "../queued-daemon-start";
import { withAcceptanceCancellation } from "../acceptance-cancellation";

function harness() {
  let saved: ChatMessage | null = null;
  let scheduled: (() => void) | undefined;
  const streams: Parameters<DurableSubscriptionPorts["stream"]>[0][] = [];
  const events: AgentEvent[] = [];
  const done: AgentEvent[][] = [];
  const errors: string[] = [];
  const checkpoints: ChatMessage[] = [];
  const reads: unknown[] = [];
  const ports: DurableSubscriptionPorts = {
    read: async (required) => { reads.push(required); return saved; },
    stream: (required) => { streams.push(required); return () => {}; },
    schedule: ({ work }) => { scheduled = work; return () => { scheduled = undefined; }; },
  };
  const abort = new AbortController();
  const stop = followDurableRun({ runId: "old", binding: { messageId: "answer", conversationId: "chat" }, signal: abort.signal, ports,
    handlers: { onEvent: (event) => events.push(event), onCheckpoint: (message) => checkpoints.push(message),
      onDone: (value) => done.push(value), onError: (error) => errors.push(error.message) },
  }, {});
  return { streams, events, done, errors, checkpoints, reads, stop, abort,
    save: (message: ChatMessage | null) => { saved = message; },
    async tick() { scheduled?.(); await Promise.resolve(); await Promise.resolve(); },
  };
}

test("404 or a lost connection never terminalizes the run or asks the user to resend", async () => {
  const h = harness();
  h.streams[0]!.dropped(); await Promise.resolve(); await Promise.resolve();
  expect(h.done).toEqual([]); expect(h.errors).toEqual([]); expect(h.events).toEqual([]);
  expect(h.reads).toEqual([{ runId: "old", messageId: "answer" }]);
  h.stop();
});

test("a daemon failed end waits for the durable row, follows a continuation, then finishes with saved partial text", async () => {
  const h = harness();
  const partial = "Repo created (private, `main`). Now the backup plan.";
  h.save({ id: "answer", role: "assistant", content: partial, runId: "next", runStatus: "queued", events: [{ kind: "text", text: partial }] });
  h.streams[0]!.frame("end", JSON.stringify({ kind: "end", payload: { status: "failed", code: 1 } }), "9");
  await Promise.resolve(); await Promise.resolve();
  expect(h.done).toEqual([]); expect(h.errors).toEqual([]);
  expect(h.streams.at(-1)!.runId).toBe("next"); expect(h.streams.at(-1)!.cursor).toBe("");
  const complete: AgentEvent[] = [{ kind: "text", text: partial + "\n\nContinued\n\nBackup complete." }];
  h.save({ id: "answer", role: "assistant", content: complete[0]!.kind === "text" ? complete[0]!.text : "", runId: "next", runStatus: "succeeded", events: complete });
  await h.tick();
  expect(h.done).toEqual([complete]); expect(h.errors).toEqual([]);
});

test("browser unmount aborts its subscription and does not cancel or finish the durable run", async () => {
  const h = harness(); h.abort.abort(); await h.tick();
  expect(h.reads).toEqual([]); expect(h.done).toEqual([]); expect(h.errors).toEqual([]);
});

test("a failed persisted row is completed with its saved events exactly once", async () => {
  const h = harness();
  const events: AgentEvent[] = [{ kind: "text", text: "Saved partial" }, { kind: "status", label: "Stopped. Saved work is above." }];
  h.save({ id: "answer", role: "assistant", content: "Saved partial", runStatus: "failed", runId: "old", events });
  await h.tick(); await h.tick();
  expect(h.done).toEqual([events]); expect(h.errors).toEqual([]);
});

test("a refused concurrent turn waits client-side with the same accepted message identity", async () => {
  const body = { assistantMessageId: "answer", prompt: "Back up" };
  const calls: unknown[] = [];
  let tries = 0;
  const response = await startQueuedDaemonRun({ body, ports: {
    post: async (required) => { calls.push(required); return ++tries === 1 ? new Response(JSON.stringify({ code: "CHAT_RUN_BUSY" }), { status: 409 }) : new Response('{"run":{"id":"next"}}', { status: 201 }); },
    wait: async () => { calls.push("wait"); },
  } }, {});
  expect(response.status).toBe(201); expect(calls).toEqual([{ body }, "wait", { body }]);
});

test("user Stop during client backoff prevents dispatch and needs no resend", async () => {
  const abort = new AbortController();
  let posts = 0;
  await expect(startQueuedDaemonRun({ body: {}, signal: abort.signal, ports: {
    post: async () => { posts++; return new Response('{"code":"CHAT_RUN_BUSY"}', { status: 409 }); }, wait: async () => { abort.abort(); },
  } }, {})).rejects.toThrow("The queued turn was stopped.");
  expect(posts).toBe(1);
});

test("Stop before a start response persists intent by message identity, including a lost response", async () => {
  const abort = new AbortController();
  const actions: string[] = [];
  await expect(withAcceptanceCancellation({ signal: abort.signal,
    start: async () => { actions.push("accepting"); abort.abort(); throw new Error("response lost"); },
    cancel: async () => { actions.push("persist-stop"); },
  }, {})).rejects.toThrow("response lost");
  expect(actions).toEqual(["accepting", "persist-stop", "persist-stop"]);
});
