import { act, cleanup, renderHook } from "@testing-library/react";
import { useConversation } from "@jini-ai/chat/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { persistableMessages } from "../assistant-chats";
import { createTovuAssistantTransport } from "../assistant-transport";
import { FakeEventSource, resetFakeEventSource } from "./assistant-transport.test-helpers";

/** n08: a connection interruption is not a terminal run error. Exercise the real status consumer. */
beforeEach(() => {
  resetFakeEventSource();
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function frame(kind: string, payload: unknown): string {
  return JSON.stringify({ runId: "run-1", kind, payload });
}

for (const lookup of ["running", "unreachable"] as const) {
  test(`a stream reconnect with a ${lookup} status lookup saves the later completed answer as succeeded`, async () => {
    let lookupStarted!: () => void;
    const started = new Promise<void>((resolve) => { lookupStarted = resolve; });
    let releaseLookup!: () => void;
    const release = new Promise<void>((resolve) => { releaseLookup = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/runs" && init?.method === "POST") {
        return new Response(JSON.stringify({ run: { id: "run-1" } }));
      }
      if (url === "/api/runs/run-1" && !init?.method) {
        lookupStarted();
        await release;
        if (lookup === "unreachable") throw new TypeError("API restarting");
        return new Response(JSON.stringify({ run: { state: "running" } }));
      }
      throw new Error(`unexpected fetch: ${init?.method ?? "GET"} ${url}`);
    }));
    const transport = createTovuAssistantTransport();
    const { result } = renderHook(() => useConversation({ transport }));
    await act(async () => { await result.current.sendMessage("Answer this"); });
    const source = FakeEventSource.instances[0]!;
    try {
      await act(async () => {
        source.emit("agent", frame("agent", { type: "text_delta", delta: "Finished answer" }));
        source.emit("error", "");
        await started;
        releaseLookup();
      });
      const inFlight = result.current.messages.find((message) => message.role === "assistant")!;
      const duringReconnect = {
        status: inFlight.runStatus,
        streaming: result.current.isStreaming,
        persistableIds: persistableMessages(result.current.messages).map((message) => message.id),
      };

      await act(async () => { source.emit("end", frame("end", { status: "succeeded", code: 0 })); });
      const saved = persistableMessages(result.current.messages).find((message) => message.id === inFlight.id)!;
      expect(saved.runStatus).toBe("succeeded");
      expect(saved.content).toBe("Finished answer");
      expect(saved.events).toEqual([{ kind: "text", text: "Finished answer" }]);
      expect(duringReconnect.status).toBe("running");
      expect(duringReconnect.streaming).toBe(true);
      expect(duringReconnect.persistableIds).not.toContain(inFlight.id);
      expect(result.current.isStreaming).toBe(false);
      expect(source.closed).toBe(true);
    } finally {
      releaseLookup();
    }
  });
}
