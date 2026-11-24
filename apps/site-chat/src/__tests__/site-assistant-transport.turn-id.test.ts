import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ChatMessage } from "@jini-ai/chat/core";
import type { RunHandlers } from "@jini-ai/chat/react";

import { createSiteAssistantTransport } from "../site-assistant-transport";

/**
 * Owner decision 11-23 ("visitor chat retry = message-ID dedupe"): every POST for one visitor
 * message carries ONE stable `turnId`, so the server (`visitor-turn-dedupe.ts`) can refuse an
 * automatic retry of a turn it already admitted instead of spending a second provider run.
 */

function endedStream(): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event: text\ndata: {"delta":"hi"}\n\nevent: end\ndata: {"reason":"stop"}\n\n'));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function recordingFetch() {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchChat = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return endedStream();
  }) as typeof fetch;
  return { bodies, fetchChat };
}

function runToCompletion(transport: ReturnType<typeof createSiteAssistantTransport>, history: ChatMessage[]): Promise<void> {
  return new Promise((resolve) => {
    const handlers: RunHandlers = { onEvent: () => {}, onError: () => {}, onDone: () => resolve() } as unknown as RunHandlers;
    void transport.startRun({ history, signal: new AbortController().signal }, handlers);
  });
}

const user = (id: string, content: string): ChatMessage => ({ id, role: "user", content }) as ChatMessage;

describe("site assistant transport — stable turn id", () => {
  it("sends the injected turn id in the POST body", async () => {
    const { bodies, fetchChat } = recordingFetch();
    const transport = createSiteAssistantTransport({}, { fetch: fetchChat, newTurnId: () => "turn-0000000001" });
    await runToCompletion(transport, [user("u1", "hello")]);
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0]!.turnId, "turn-0000000001");
    assert.equal(bodies[0]!.message, "hello");
  });

  it("a new user message gets a new turn id", async () => {
    const { bodies, fetchChat } = recordingFetch();
    let n = 0;
    const transport = createSiteAssistantTransport({}, { fetch: fetchChat, newTurnId: () => { n += 1; return `turn-${String(n).padStart(10, "0")}`; } });
    await runToCompletion(transport, [user("u1", "first")]);
    await runToCompletion(transport, [user("u1", "first"), { id: "a1", role: "assistant", content: "hi" } as ChatMessage, user("u2", "second")]);
    assert.deepEqual(bodies.map((b) => b.turnId), ["turn-0000000001", "turn-0000000002"]);
  });

  it("mints the turn id once per message, not once per POST", async () => {
    const { bodies, fetchChat } = recordingFetch();
    let minted = 0;
    const transport = createSiteAssistantTransport({}, { fetch: fetchChat, newTurnId: () => { minted += 1; return "turn-0000000001"; } });
    await runToCompletion(transport, [user("u1", "hello")]);
    assert.equal(minted, 1);
    assert.equal(bodies.length, 1);
  });

  it("defaults to a random UUID when no generator is injected", async () => {
    const { bodies, fetchChat } = recordingFetch();
    const transport = createSiteAssistantTransport({}, { fetch: fetchChat });
    await runToCompletion(transport, [user("u1", "hello")]);
    assert.match(String(bodies[0]!.turnId), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
