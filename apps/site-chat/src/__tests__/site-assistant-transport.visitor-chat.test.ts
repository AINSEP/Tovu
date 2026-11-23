import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ChatMessage } from "@jini-ai/chat/core";
import type { RunHandlers, StartRunInput } from "@jini-ai/chat/react";

import { TRUNCATED_REPLY_MESSAGE } from "../site-assistant-errors";
import { createSiteAssistantTransport } from "../site-assistant-transport";

/** VISITOR-CHAT (2026-11-23): cut-off replies, the answering model, and the first-prompt failure. */

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const sse = (...frames: string[]) => new Response(new ReadableStream<Uint8Array>({
  start(c) { for (const f of frames) c.enqueue(new TextEncoder().encode(f)); c.close(); },
}), { status: 200 });
const input = (text: string): StartRunInput => ({ history: [{ id: "u1", role: "user", content: text } as ChatMessage], signal: new AbortController().signal });

function run({ responses, onModel, onFailure, retryDelayMs = 0 }: {
  responses: Array<() => Response | Promise<Response>>; onModel?: (a: { model: string | null }) => void; onFailure?: (a: { prompt: string | null }) => void; retryDelayMs?: number;
}) {
  const errors: Error[] = []; const texts: string[] = []; let calls = 0;
  let resolveDone!: () => void; const done = new Promise<void>((r) => { resolveDone = r; });
  const transport = createSiteAssistantTransport({}, {
    fetch: (async () => { const next = responses[Math.min(calls, responses.length - 1)]!; calls += 1; return next(); }) as typeof fetch,
    retryDelayMs, ...(onModel ? { onModel } : {}), ...(onFailure ? { onFailure } : {}),
  });
  const handlers: RunHandlers = {
    onEvent: (e) => { if (e.kind === "text") texts.push(e.text); }, onError: (e) => errors.push(e), onDone: () => resolveDone(),
  };
  return { start: (text: string) => transport.startRun(input(text), handlers), done, errors, texts, calls: () => calls };
}

describe("cut-off replies", () => {
  it("keeps the partial text and tells the visitor, in plain words, that the answer was cut short", async () => {
    const r = run({ responses: [() => sse(frame("text", { delta: "Here is the complete list of the 11 posts" }), frame("end", { reason: "truncated" }))] });
    await r.start("list the posts"); await r.done;
    assert.deepEqual(r.texts, ["Here is the complete list of the 11 posts"]);
    assert.equal(r.errors.length, 1);
    assert.equal(r.errors[0]!.message, TRUNCATED_REPLY_MESSAGE);
    assert.doesNotMatch(r.errors[0]!.message, /^Couldn't get an answer/, "a partial answer is not 'no answer'");
  });

  it("a normal stop reports no error", async () => {
    const r = run({ responses: [() => sse(frame("text", { delta: "Done." }), frame("end", { reason: "stop" }))] });
    await r.start("hi"); await r.done;
    assert.deepEqual(r.errors, []);
  });
});

describe("answering model", () => {
  it("reports the model from the meta frame, and nothing for a missing or blank one", async () => {
    const seen: Array<string | null> = [];
    const ok = run({ onModel: ({ model }) => seen.push(model), responses: [() => sse(frame("text", { delta: "a" }), frame("meta", { model: "gemini-flash-latest" }), frame("end", { reason: "stop" }))] });
    await ok.start("hi"); await ok.done;
    assert.deepEqual(seen, [null, "gemini-flash-latest"], "cleared at run start, set by meta");

    const blank: Array<string | null> = [];
    const none = run({ onModel: ({ model }) => blank.push(model), responses: [() => sse(frame("meta", { model: "  " }), frame("text", { delta: "a" }), frame("end", { reason: "stop" }))] });
    await none.start("hi"); await none.done;
    assert.deepEqual(blank, [null], "a blank model is ignored, never shown");
  });
});

describe("first-prompt failure", () => {
  it("retries once, silently, when the request fails before any reply bytes arrive", async () => {
    const r = run({ responses: [() => { throw new TypeError("Failed to fetch"); }, () => sse(frame("text", { delta: "Hello" }), frame("end", { reason: "stop" }))] });
    await r.start("hi"); await r.done;
    assert.equal(r.calls(), 2);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.texts, ["Hello"]);
  });

  it("retries a 503 once, but never a 4xx", async () => {
    const down = () => new Response(JSON.stringify({ error: "down" }), { status: 503 });
    const a = run({ responses: [down, () => sse(frame("text", { delta: "ok" }), frame("end", { reason: "stop" }))] });
    await a.start("hi"); await a.done;
    assert.equal(a.calls(), 2); assert.deepEqual(a.errors, []);

    const b = run({ responses: [() => new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 })] });
    await b.start("hi"); await b.done;
    assert.equal(b.calls(), 1); assert.equal(b.errors.length, 1);
  });

  it("does not retry once reply frames have started (that would duplicate text)", async () => {
    const r = run({ responses: [() => sse(frame("text", { delta: "partial" }), frame("error", { message: "boom" }))] });
    await r.start("hi"); await r.done;
    assert.equal(r.calls(), 1);
    assert.equal(r.errors.length, 1);
  });

  it("after the single retry also fails, shows one plain error and reports the failed prompt for a retry button", async () => {
    const failures: Array<string | null> = [];
    const r = run({ onFailure: ({ prompt }) => failures.push(prompt), responses: [() => { throw new TypeError("Failed to fetch"); }] });
    await r.start("what is new?"); await r.done;
    assert.equal(r.calls(), 2, "exactly one retry, not a loop");
    assert.equal(r.errors.length, 1);
    assert.equal(r.errors[0]!.message, "Couldn't get an answer: couldn't reach the site. Try again.");
    assert.deepEqual(failures, [null, "what is new?"], "cleared at start, set on the final failure");
  });
});
