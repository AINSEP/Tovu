import assert from "node:assert/strict";
import { it } from "node:test";

import type { ChatMessage } from "@jini-ai/chat/core";
import type { RunHandlers } from "@jini-ai/chat/react";
import type { AgentEvent } from "@jini-ai/core/contracts/site/chat-core";
import type { ToolConfirmationDirective } from "@jini-ai/core/contracts/site/client-directives";

import { createSiteAssistantTransport } from "../site-assistant-transport";
import { savePersistedState } from "../session-store";

/**
 * P6-T2.T browser half: an AG-UI visitor approval is a standard interrupt on the chat route, and
 * the answer is one resume POST to that same route. Kept apart from the React-importing transport
 * suite so it runs without a renderer.
 */

const CHALLENGE = "Ch4llengeNonce_abc-123";
const frame = (event: Record<string, unknown>) => `data: ${JSON.stringify(event)}\n\n`;
const text = (id: string, delta: string) =>
  frame({ type: "TEXT_MESSAGE_START", messageId: id, role: "assistant" })
  + frame({ type: "TEXT_MESSAGE_CONTENT", messageId: id, delta })
  + frame({ type: "TEXT_MESSAGE_END", messageId: id });

function sse(body: string): Response {
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

it("the live approval posts a resume to chat and keeps its nonce out of storage", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown> & { threadId: string; runId: string };
    calls.push({ url, body });
    if (calls.length === 1) {
      return sse(frame({ type: "RUN_STARTED", threadId: body.threadId, runId: body.runId })
        + text("m1", "Checking. ")
        + frame({ type: "RUN_FINISHED", threadId: body.threadId, runId: body.runId,
          outcome: { type: "interrupt", interrupts: [{ id: CHALLENGE, reason: "confirmation", message: "Open the page: Go to /docs" }] } }));
    }
    return sse(frame({ type: "RUN_STARTED", threadId: body.threadId, runId: body.runId })
      + text("m2", "Opened it.")
      + frame({ type: "RUN_FINISHED", threadId: body.threadId, runId: body.runId, result: { reason: "stop" } }));
  }) as typeof globalThis.fetch;

  const shown: (ToolConfirmationDirective | null)[] = [];
  const finished: { messages?: ChatMessage[] }[] = [];
  const frontend = { headers: async () => ({}), acceptBrowserInvocation: () => {}, finish: (args: { navigation: boolean; messages?: ChatMessage[] }) => { finished.push(args); } };
  const transport = createSiteAssistantTransport({}, { fetch, frontend, onToolConfirmation: ({ directive }) => { shown.push(directive); } });

  const events: AgentEvent[] = [];
  const errors: Error[] = [];
  let doneEvents: AgentEvent[] | undefined;
  let doneCount = 0;
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });
  const handlers: RunHandlers = {
    onEvent: (ev) => events.push(ev), onError: (err) => errors.push(err),
    onDone: (collected) => { doneCount += 1; doneEvents = collected; resolveDone(); },
  };
  const history: ChatMessage[] = [{ id: "u1", role: "user", content: "open the docs" }];
  await transport.startRun({ history, signal: new AbortController().signal }, handlers);

  for (let i = 0; i < 50 && shown.length === 0; i += 1) await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(shown, [{ kind: "tool_confirmation", challengeId: CHALLENGE, title: "Open the page", summary: "Go to /docs" }]);
  assert.equal(doneCount, 0, "the logical turn stays busy while the visitor decides");

  // A double click answers once: both clicks share the one resume POST.
  const answers = await Promise.all([
    transport.answerApproval({ challengeId: CHALLENGE, allow: true }),
    transport.answerApproval({ challengeId: CHALLENGE, allow: true }),
  ]);
  await done;
  assert.deepEqual(answers, [true, true]);
  assert.equal(calls.length, 2, "exactly one resume POST");
  assert.ok(calls.every((call) => call.url === "/api/site-assistant/chat"), "never POST to /confirm");
  const [start, resume] = calls as [typeof calls[number], typeof calls[number]];
  assert.equal(typeof resume.body.runId, "string");
  assert.notEqual(resume.body.runId, start.body.runId);
  assert.deepEqual(resume.body, {
    threadId: start.body.threadId, runId: resume.body.runId, parentRunId: start.body.runId,
    state: null, messages: [], tools: [], context: [],
    resume: [{ interruptId: CHALLENGE, status: "resolved", payload: "allow" }],
  });

  assert.deepEqual(errors, []);
  assert.equal(doneCount, 1, "settled once across both segments");
  assert.deepEqual(events, [{ kind: "text", text: "Checking. " }, { kind: "text", text: "Opened it." }]);
  assert.equal(shown.at(-1), null, "the card clears when the turn settles");
  assert.equal(await transport.answerApproval({ challengeId: CHALLENGE, allow: false }), false, "a settled approval cannot be answered again");
  assert.equal(calls.length, 2);

  // The host persists what the transport hands it; the nonce must reach none of it.
  // An in-memory SessionStore stands in for the tab's storage: the storage encapsulation guard keeps
  // real storage globals out of every file but session-store.ts, and the persisted bytes are the same.
  const saved = new Map<string, string>();
  const store = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); }, removeItem: (key: string) => { saved.delete(key); } };
  savePersistedState({ storage: store, state: { open: true, messages: finished.at(-1)?.messages ?? [] } });
  const persisted = JSON.stringify({ events, doneEvents, finished, session: [...saved] });
  assert.ok(persisted.includes("Opened it."), "the probe actually captured the transcript");
  assert.ok(!persisted.includes(CHALLENGE), "the challenge never enters events, history or storage");
  assert.ok(!persisted.includes("Open the page"), "the prompt text stays in the live card only");
});
