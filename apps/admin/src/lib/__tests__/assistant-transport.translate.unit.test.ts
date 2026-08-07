import { describe, expect, test } from "vitest";

import { parseUsageEvent, translateRunAgentPayload } from "../assistant-transport";

/**
 * @file The remaining `translateRunAgentPayload` branches — everything `assistant-transport.a2ui.test.ts`
 * (the `"a2ui"` and default branches) does not already cover.
 *
 * Per the coverage audit: this file's 5.3%-covered state was traced to the two on-disk test files
 * exercising only ONE branch of this function (`a2ui`) plus the module-doc-only default. Every wire
 * `payload.type` this function switches on gets its own case here, matched against the same
 * `AgentEvent` shapes `@jini-ai/chat/core` defines (`events.ts`).
 */

describe("translateRunAgentPayload — status", () => {
  test("carries label and detail through", () => {
    const translated = translateRunAgentPayload({ type: "status", label: "thinking", detail: "reading files" });
    expect(translated).toEqual({ kind: "status", label: "thinking", detail: "reading files" });
  });

  test("omits detail when the wire payload has none — undefined, not a stringified 'undefined'", () => {
    const translated = translateRunAgentPayload({ type: "status", label: "thinking" });
    expect(translated).toEqual({ kind: "status", label: "thinking", detail: undefined });
  });
});

describe("translateRunAgentPayload — text and thinking deltas", () => {
  test("text_delta becomes a 'text' AgentEvent carrying the delta verbatim", () => {
    expect(translateRunAgentPayload({ type: "text_delta", delta: "hello" })).toEqual({ kind: "text", text: "hello" });
  });

  test("thinking_delta becomes a 'thinking' AgentEvent, not conflated with text_delta", () => {
    expect(translateRunAgentPayload({ type: "thinking_delta", delta: "considering options" })).toEqual({
      kind: "thinking",
      text: "considering options",
    });
  });
});

describe("translateRunAgentPayload — tool lifecycle", () => {
  test("tool_use carries id, name, and the raw input value through untouched", () => {
    const input = { path: "/posts/1" };
    const translated = translateRunAgentPayload({ type: "tool_use", id: "t1", name: "open_post", input });
    expect(translated).toEqual({ kind: "tool_use", id: "t1", name: "open_post", input });
  });

  test("tool_result with isError:true reports failure, not silently swallowed", () => {
    const translated = translateRunAgentPayload({
      type: "tool_result",
      toolUseId: "t1",
      content: "404: post not found",
      isError: true,
    });
    expect(translated).toEqual({ kind: "tool_result", toolUseId: "t1", content: "404: post not found", isError: true });
  });

  test("tool_result with no isError field defaults to false, not undefined", () => {
    const translated = translateRunAgentPayload({ type: "tool_result", toolUseId: "t2", content: "ok" });
    expect(translated).toEqual({ kind: "tool_result", toolUseId: "t2", content: "ok", isError: false });
  });
});

describe("translateRunAgentPayload — usage", () => {
  test("numeric fields all present are passed through as numbers", () => {
    const translated = translateRunAgentPayload({
      type: "usage",
      usage: { input_tokens: 120, output_tokens: 45 },
      costUsd: 0.012,
      durationMs: 890,
    });
    expect(translated).toEqual({ kind: "usage", inputTokens: 120, outputTokens: 45, costUsd: 0.012, durationMs: 890 });
  });

  test("a missing usage object does not throw — every field falls back to undefined", () => {
    const translated = translateRunAgentPayload({ type: "usage" });
    expect(translated).toEqual({ kind: "usage", inputTokens: undefined, outputTokens: undefined, costUsd: undefined, durationMs: undefined });
  });

  test("non-numeric token/cost/duration fields are dropped rather than passed through as the wrong type", () => {
    const translated = translateRunAgentPayload({
      type: "usage",
      usage: { input_tokens: "120", output_tokens: null },
      costUsd: "0.01",
      durationMs: "890",
    });
    expect(translated).toEqual({ kind: "usage", inputTokens: undefined, outputTokens: undefined, costUsd: undefined, durationMs: undefined });
  });
});

/**
 * `parseUsageEvent` — pulled out of `translateRunAgentPayload`'s `"usage"` case (2026-08-06,
 * complexity pass, sixth pass; see its own doc — this is the case an independent audit traced the
 * switch's cognitive cost to). The describe block above already exercises it end to end through
 * `translateRunAgentPayload`; these call it directly, no switch dispatch involved.
 */
describe("parseUsageEvent", () => {
  test("numeric fields all present are passed through as numbers", () => {
    const event = parseUsageEvent({
      type: "usage",
      usage: { input_tokens: 120, output_tokens: 45 },
      costUsd: 0.012,
      durationMs: 890,
    });
    expect(event).toEqual({ kind: "usage", inputTokens: 120, outputTokens: 45, costUsd: 0.012, durationMs: 890 });
  });

  test("a missing usage object does not throw — every field falls back to undefined", () => {
    expect(parseUsageEvent({ type: "usage" })).toEqual({
      kind: "usage",
      inputTokens: undefined,
      outputTokens: undefined,
      costUsd: undefined,
      durationMs: undefined,
    });
  });

  test("non-numeric token/cost/duration fields are dropped rather than passed through as the wrong type", () => {
    const event = parseUsageEvent({
      type: "usage",
      usage: { input_tokens: "120", output_tokens: null },
      costUsd: "0.01",
      durationMs: "890",
    });
    expect(event).toEqual({ kind: "usage", inputTokens: undefined, outputTokens: undefined, costUsd: undefined, durationMs: undefined });
  });
});

describe("translateRunAgentPayload — raw and surface events", () => {
  test("raw carries the line through asString", () => {
    expect(translateRunAgentPayload({ type: "raw", line: "npm run build" })).toEqual({ kind: "raw", line: "npm run build" });
  });

  test("a non-string raw line is JSON-stringified rather than dropped", () => {
    expect(translateRunAgentPayload({ type: "raw", line: { code: 1 } })).toEqual({ kind: "raw", line: '{"code":1}' });
  });

  test("mcp-ui unwraps .resource, not the whole envelope — required by parseUIResource's bare-EmbeddedResource shape", () => {
    const resource = { type: "resource", resource: { uri: "ui://confirm", mimeType: "text/html", text: "<div/>" } };
    const translated = translateRunAgentPayload({ type: "mcp-ui", resource });
    expect(translated).toEqual({ kind: "ext", name: "mcp-ui", data: resource });
  });

  test("thinking_start is dropped (returns null) — no dedicated chat-core AgentEvent variant for it", () => {
    expect(translateRunAgentPayload({ type: "thinking_start" })).toBeNull();
  });
});
