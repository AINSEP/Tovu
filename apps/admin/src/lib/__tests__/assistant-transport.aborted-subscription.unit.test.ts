import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunHandlers } from "@jini-ai/chat/react";
import { createTovuAssistantTransport } from "../assistant-transport";
import { FakeEventSource, resetFakeEventSource } from "./assistant-transport.test-helpers";

beforeEach(() => {
  resetFakeEventSource();
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => vi.unstubAllGlobals());

function handlers(): RunHandlers {
  return { onEvent: vi.fn(), onError: vi.fn(), onDone: vi.fn() };
}

describe("abandoned run subscriptions", () => {
  it("does not open an SSE connection when reattachment was already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const callbacks = handlers();

    await createTovuAssistantTransport().reattachRun("run-1", callbacks, { signal: controller.signal });

    expect(FakeEventSource.instances).toEqual([]);
    expect(callbacks.onEvent).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onDone).not.toHaveBeenCalled();
  });

  it("does not open an SSE connection when cancellation precedes a late start response", async () => {
    let resolveBody!: (value: { run: { id: string } }) => void;
    const body = new Promise<{ run: { id: string } }>((resolve) => { resolveBody = resolve; });
    const json = vi.fn(() => body);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json })));
    const controller = new AbortController();
    const callbacks = handlers();
    const started = createTovuAssistantTransport().startRun({
      agentId: "claude-code",
      history: [{ id: "user-1", role: "user", content: "hello" }],
      signal: controller.signal,
    }, callbacks);
    await vi.waitFor(() => expect(json).toHaveBeenCalledTimes(1));

    controller.abort();
    resolveBody({ run: { id: "late-run" } });

    expect(await started).toEqual({ runId: "late-run" });
    expect(FakeEventSource.instances).toEqual([]);
    expect(callbacks.onEvent).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onDone).not.toHaveBeenCalled();
  });
});
