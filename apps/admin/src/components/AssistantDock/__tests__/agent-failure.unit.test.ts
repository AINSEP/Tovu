import { describe, expect, it } from "vitest";
import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import fixture from "./fixtures/gemini-position-9";
import { AGENT_FAILURE_EVENT, extractAgentFailure, GENERIC_AGENT_FAILURE, matchAgentFailureHint,
  projectAgentFailureMessage, redactAgentFailure, suggestedFailureAgent } from "../agent-failure";
import { GEMINI_INELIGIBLE_HINT, localFailureHints } from "../agent-failure-hints";

export const GEMINI_REASON = "IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals. To continue using Gemini, please migrate to the Antigravity suite of products: https://antigravity.google";
const events = fixture as AgentEvent[];

describe("agent failure reasons", () => {
  it("extracts the exact last IneligibleTierError sentence from position 9", () => {
    const failure = extractAgentFailure({ events, agentId: "gemini" }, {});
    expect(failure?.reason).toBe(GEMINI_REASON);
    expect(failure?.details).toBe(events.filter(event => event.kind === "raw").map(event => event.line).join("\n").trim());
    expect(failure?.agentId).toBe("gemini");
  });

  it("removes ANSI, stack frames and startup noise from the reason", () => {
    expect(extractAgentFailure({ events: [{ kind: "raw", line:
      `Warning: 256-color support not detected.\nYOLO mode is enabled.\n\u001b[31m${GEMINI_REASON}\u001b[0m\n    at run (file:///agent.js:1:2)\nHook system message: setup\n` }] }, {})?.reason).toBe(GEMINI_REASON);
  });

  it("supports other agents and structured error/status events", () => {
    expect(extractAgentFailure({ agentId: "aider", events: [{ kind: "status", label: "AuthenticationError: Incorrect API key provided." }] }, {})?.reason)
      .toBe("AuthenticationError: Incorrect API key provided.");
    expect(extractAgentFailure({ events: [{ kind: "raw", line: "error: process denied permission\n    at run (main.js:1:2)" }] }, {})?.reason)
      .toBe("error: process denied permission");
    expect(extractAgentFailure({ events: [{ kind: "ext", name: "error", data: { message: "Resource exhausted" } }] }, {})?.reason)
      .toBe("Resource exhausted");
    expect(extractAgentFailure({ events: [{ kind: "status", code: "agent_error", label: "Process terminated unexpectedly" }] }, {})?.reason)
      .toBe("Process terminated unexpectedly");
    expect(extractAgentFailure({ events: [{ kind: "status", label: "The assistant could not start: CLI executable missing." }] }, {})?.reason)
      .toBe("The assistant could not start: CLI executable missing.");
    expect(extractAgentFailure({ events: [{ kind: "status", label: "API key not valid. Please pass a valid API key." }] }, {})?.reason)
      .toBe("API key not valid. Please pass a valid API key.");
  });

  it("redacts keys, bearer credentials, assignments, JWTs and credential URLs exactly", () => {
    const text = "AIzaFakeGoogleKey123 AQ.fakeOAuthCode sk-proj-fakeSecret ghp_fakeSecret ya29.fakeToken eyJfake.payload.signature Bearer opaque-token API_KEY=plain-secret access_token: 'another-secret' https://user:password@example.com";
    expect(redactAgentFailure({ text }, {})).toBe("[REDACTED] [REDACTED] [REDACTED] [REDACTED] [REDACTED] [REDACTED] Bearer [REDACTED] API_KEY=[REDACTED] access_token: '[REDACTED]' https://[REDACTED]@example.com");
    expect(redactAgentFailure({ text: "\u001b]8;;https://hidden.example\u0007Error: sk-secret\u001b]8;;\u0007" }, {})).toBe("Error: [REDACTED]");
    expect(redactAgentFailure({ text: "https://example.com?key=hidden&code=hidden Authorization: Basic hidden" }, {}))
      .toBe("https://example.com?key=[REDACTED]&code=[REDACTED] Authorization: Basic [REDACTED]");
  });

  it("keeps today's exact generic message when there is no stderr", () => {
    const message: ChatMessage = { id: "empty", role: "assistant", content: "", runStatus: "failed",
      events: [{ kind: "status", label: GENERIC_AGENT_FAILURE }] };
    expect(extractAgentFailure({ events: message.events }, {})).toBeNull();
    expect(projectAgentFailureMessage({ message }, {}).events).toEqual([{ kind: "status", label: "The assistant could not continue this answer. Saved work is above." }]);
    expect(extractAgentFailure({ events: [{ kind: "raw", line: "YOLO mode is enabled.\nWarning: 256-color support not detected." }] }, {})).toBeNull();
    expect(projectAgentFailureMessage({ message: { ...message, events: [] } }, {}).events)
      .toEqual([{ kind: "status", code: "run_terminal", label: "The assistant could not continue this answer. Saved work is above." }]);
  });

  it("projects only failed turns and keeps projection idempotent", () => {
    const message: ChatMessage = { id: "nine", role: "assistant", content: "saved work", agentId: "gemini", runStatus: "failed", events };
    const projected = projectAgentFailureMessage({ message }, {});
    expect(projected.events?.at(-1)).toEqual({ kind: "ext", name: AGENT_FAILURE_EVENT, data: {
      reason: GEMINI_REASON, agentId: "gemini", details: events.filter(event => event.kind === "raw").map(event => event.line).join("\n").trim() } });
    expect(projectAgentFailureMessage({ message: projected }, {})).toEqual(projected);
    for (const runStatus of ["running", "succeeded", "canceled"] as const) {
      expect(projectAgentFailureMessage({ message: { ...message, runStatus } }, {}).events?.some(event => event.kind === "ext" && event.name === AGENT_FAILURE_EVENT)).toBe(false);
    }
  });

  it("matches only the gemini compatibility hint and requires installed alternatives", () => {
    const failure = { reason: GEMINI_REASON, details: "", agentId: "gemini" };
    const hint = matchAgentFailureHint({ failure, hints: localFailureHints({ agentId: "gemini" }, {}) }, {});
    expect(hint?.hint).toBe("Google ended free sign-in for Gemini CLI. Switch to Antigravity, or set Gemini CLI to use an API key.");
    expect(hint?.suggestedAgentId).toBe("antigravity");
    expect(localFailureHints({ agentId: "aider" }, {})).toEqual([]);
    expect(matchAgentFailureHint({ failure: { reason: "network error", details: "" }, hints: [GEMINI_INELIGIBLE_HINT] }, {})).toBeUndefined();
    for (const available of [false, undefined]) {
      expect(suggestedFailureAgent({ hint, agents: [{ id: "antigravity", name: "Antigravity", available }] }, {})).toBeUndefined();
    }
    expect(suggestedFailureAgent({ hint, agents: [{ id: "antigravity", name: "Antigravity", available: true }] }, {})?.id).toBe("antigravity");
  });
});
