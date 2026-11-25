import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { RunAgentInputSchema } from "@ag-ui/core/schemas";

import type { RunHandlers } from "@jini-ai/chat/react";
import type { AgentEvent } from "@jini-ai/core/contracts/site/chat-core";

import { createSiteAssistantTransport } from "../site-assistant-transport";

/**
 * AG-UI 1.0 conformance of the visitor surface, both directions: the official schema accepts the
 * request the transport sends, and the server's own recorded golden reply replays to one success.
 * The golden records the ids the server echoed from its test request, so the replay substitutes the
 * ids this transport sent; the bytes are otherwise exactly the server's.
 */
const GOLDEN = new URL("../../../website/src/server/__tests__/goldens/site-chat-stream.ag-ui.golden.json", import.meta.url);

it("the visitor request is an AG-UI 1.0 RunAgentInput and the recorded server reply replays to one success", async () => {
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, { body: string }>;
  let sent: unknown;
  const fetch = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    const ids = RunAgentInputSchema.parse(sent);
    const body = golden["plain reply"]!.body.replaceAll('"thread-1"', JSON.stringify(ids.threadId)).replaceAll('"run-1"', JSON.stringify(ids.runId));
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  }) as typeof globalThis.fetch;
  const events: AgentEvent[] = [];
  const errors: Error[] = [];
  let done = 0;
  let resolveDone!: () => void;
  const settled = new Promise<void>((resolve) => { resolveDone = resolve; });
  const handlers: RunHandlers = { onEvent: (ev) => events.push(ev), onError: (err) => errors.push(err), onDone: () => { done += 1; resolveDone(); } };
  const finishes: { navigation: boolean }[] = [];
  const transport = createSiteAssistantTransport({}, { fetch, frontend: { headers: async () => ({}), finish: (args) => { finishes.push(args); } } });
  await transport.startRun({ history: [
    { id: "u1", role: "user", content: "earlier question" },
    { id: "a1", role: "assistant", content: "earlier answer" },
    { id: "u2", role: "user", content: "hello" },
  ], signal: new AbortController().signal }, handlers);
  await settled;
  const input = RunAgentInputSchema.parse(sent);
  assert.deepEqual(input.messages.map((m) => [m.id, m.role, m.content]), [["u1", "user", "earlier question"], ["a1", "assistant", "earlier answer"], ["u2", "user", "hello"]]);
  // The schema normalizes `state` away; the wire itself carries an explicit null.
  assert.deepEqual([(sent as { state?: unknown }).state, input.tools, input.context], [null, [], []]);
  assert.equal(typeof (input.forwardedProps as { turnId?: unknown }).turnId, "string");
  assert.deepEqual(events, [{ kind: "text", text: "Hello from the site." }]);
  assert.deepEqual(errors, []);
  assert.equal(done, 1);
  assert.deepEqual(finishes.map((f) => f.navigation), [false]);
});
