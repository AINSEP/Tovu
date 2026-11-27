import { afterEach, expect, test, vi } from "vitest";
import { EventType } from "@ag-ui/core";
import type { RunHandlers } from "@jini-ai/chat/core";
import { AG_UI_RUN_PATH, agUiRunClient } from "../assistant-transport-ag-ui";
import { flushMicrotasks, streamFromChunks } from "./assistant-transport.test-helpers";

vi.mock("../durable-run-subscription", () => ({ followDurableRun: vi.fn(), browserDurableSubscriptionPorts: vi.fn() }));

afterEach(() => { vi.unstubAllGlobals(); });

test.each(["detach", "acceptance"])("Stop before acceptance posts the owned message cancel before headers (%s wins)", async (winner) => {
  let releaseHeaders!: (response: Response) => void;
  let releaseCancel!: (response: Response) => void;
  const headers = new Promise<Response>((resolve) => { releaseHeaders = resolve; });
  const canceled = new Promise<Response>((resolve) => { releaseCancel = resolve; });
  const posts: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    posts.push({ url, init });
    return url === AG_UI_RUN_PATH ? headers : canceled;
  }));
  const detach = new AbortController();
  const cancel = new AbortController();
  const handlers = { onEvent: vi.fn(), onError: vi.fn(), onDone: vi.fn() } as unknown as RunHandlers;
  const bound = vi.fn();
  const pending = agUiRunClient.startAgUiRun({ input: { history: [{ id: "u1", role: "user", content: "hello" }],
    conversationId: "conv-pending", signal: detach.signal, cancelSignal: cancel.signal }, handlers,
    durable: { launch: { contextRef: {}, messageId: "msg-pending", conversationId: "conv-pending" }, bindRun: bound } }, {})
    .then((started) => started, () => undefined);
  await flushMicrotasks();
  cancel.abort();
  await flushMicrotasks();
  expect(posts.map((post) => post.url)).toEqual([AG_UI_RUN_PATH, "/api/runs/pending/cancel"]);
  expect(JSON.parse(String(posts[1]!.init?.body))).toEqual({ messageId: "msg-pending", conversationId: "conv-pending" });
  expect(posts[1]!.init).toMatchObject({ method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" } });
  expect(posts[1]!.init?.signal).toBeUndefined();
  if (winner === "detach") detach.abort();
  releaseHeaders(new Response(streamFromChunks([
    `data: ${JSON.stringify({ type: EventType.RUN_STARTED, threadId: "conv-pending", runId: "run-pending" })}\n\n`,
    `data: ${JSON.stringify({ type: EventType.RUN_FINISHED, threadId: "conv-pending", runId: "run-pending" })}\n\n`,
  ]), { status: 200 }));
  const started = await pending;
  if (winner === "acceptance") {
    expect(started).toEqual({ runId: "run-pending" });
    expect(bound).toHaveBeenCalledTimes(1);
    detach.abort();
  }
  const stopped = agUiRunClient.stopAgUiRun({ runId: "run-pending" }, {});
  releaseCancel(new Response("{}", { status: 200 }));
  await stopped;
  await flushMicrotasks();
  expect(posts.map((post) => post.url)).toEqual([AG_UI_RUN_PATH, "/api/runs/pending/cancel"]);
  expect(handlers.onError).not.toHaveBeenCalled();
});

test.each([204, 404, 503])("stops the accepted canonical run and handles cancel HTTP %s", async (status) => {
  const runId = `canonical/${status}`;
  const conversationId = `conversation-${status}`;
  const messageId = `message-${status}`;
  const startPath = "/api/admin/v1/assistant/ag-ui-run";
  const cancelPath = `/api/runs/canonical%2F${status}/cancel`;
  const stream = streamFromChunks([
    `data: ${JSON.stringify({ type: EventType.RUN_STARTED, threadId: conversationId, runId })}\n\n`,
    `data: ${JSON.stringify({ type: EventType.RUN_FINISHED, threadId: conversationId, runId })}\n\n`,
  ]);
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    if (input === startPath && init?.method === "POST") return new Response(stream, { headers: { "content-type": "text/event-stream" } });
    if (input === cancelPath && init?.method === "POST") return new Response(null, { status });
    return new Response(null, { status: 400 });
  });
  vi.stubGlobal("fetch", fetch);
  const detach = new AbortController();
  const handlers: RunHandlers = { onEvent: vi.fn(), onError: vi.fn(), onDone: vi.fn() };
  try {
    const started = await agUiRunClient.startAgUiRun({
      input: { history: [{ id: "question", role: "user", content: "Hello" }], conversationId, signal: detach.signal },
      handlers, durable: { launch: { contextRef: {}, conversationId, messageId }, bindRun: vi.fn() },
    }, {});
    expect(started).toEqual({ runId });

    const stopping = agUiRunClient.stopAgUiRun({ runId }, {});
    if (status === 503) await expect(stopping).rejects.toThrow("Stopping the assistant failed (HTTP 503).");
    else await expect(stopping).resolves.toBeUndefined();
    expect(fetch).toHaveBeenLastCalledWith(cancelPath, {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, messageId, conversationId }),
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    detach.abort();
  }
});
