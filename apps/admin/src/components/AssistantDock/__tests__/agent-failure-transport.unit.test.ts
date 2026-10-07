import { expect, it } from "vitest";
import type { AgentEvent, ChatMessage, ChatTransport, RunHandlers } from "@jini-ai/chat/core";
import fixture from "./fixtures/gemini-position-9";
import { AGENT_FAILURE_EVENT, GENERIC_AGENT_FAILURE, withAgentFailureSurface } from "../agent-failure";

function harness() {
  let handlers: RunHandlers | undefined;
  const transport: ChatTransport = {
    async startRun(_input, next) { handlers = next; return { runId: "run" }; },
    async reattachRun(_id, next) { handlers = next; },
    async stopRun() {}, async fetchRunStatus() { return "failed"; },
  };
  const seen: AgentEvent[] = [];
  const checkpoints: ChatMessage[] = [];
  const errors: string[] = [];
  const completed: AgentEvent[][] = [];
  const sink: RunHandlers = { onEvent: event => seen.push(event), onError: error => errors.push(error.message),
    onDone: events => completed.push(events), onToolInputDelta() {}, onCheckpoint: message => checkpoints.push(message) };
  return { transport: withAgentFailureSurface({ transport }, {}), seen, checkpoints, errors, completed, sink,
    emit: () => { if (!handlers) throw new Error("not connected"); return handlers; } };
}

it("projects live failed checkpoints and completion through the existing transport port", async () => {
  const h = harness();
  await h.transport.startRun({ history: [{ id: "user", role: "user", content: "hello" }], agentId: "gemini", signal: new AbortController().signal }, h.sink);
  const message: ChatMessage = { id: "nine", role: "assistant", content: "", agentId: "gemini", runStatus: "failed", events: fixture as AgentEvent[] };
  h.emit().onCheckpoint?.(message);
  h.emit().onDone(message.events ?? []);
  expect(h.checkpoints[0]?.events?.at(-1)?.kind).toBe("ext");
  expect(h.completed[0]?.at(-1)).toEqual(h.checkpoints[0]?.events?.at(-1));
  expect(h.errors).toEqual([]);
});

it("preserves checkpoint support on reattach and redacts the rendered checkpoint", async () => {
  const h = harness();
  await h.transport.reattachRun("run", h.sink);
  h.emit().onCheckpoint?.({ id: "message", role: "assistant", content: "", agentId: "other", runStatus: "failed",
    events: [{ kind: "raw", line: "Error: rejected sk-secret" }] });
  expect(h.checkpoints[0]?.events).toEqual([
    { kind: "raw", line: "Error: rejected [REDACTED]" },
    { kind: "ext", name: AGENT_FAILURE_EVENT, data: { reason: "Error: rejected [REDACTED]", details: "Error: rejected [REDACTED]", agentId: "other" } },
  ]);
});

it("supports non-checkpoint errors without losing stderr or completion", async () => {
  const h = harness();
  const { onCheckpoint: _checkpoint, ...sink } = h.sink;
  await h.transport.startRun({ history: [], agentId: "other", signal: new AbortController().signal }, sink);
  h.emit().onEvent({ kind: "raw", line: "Error: invalid token AQ.secret" });
  h.emit().onError(new Error(GENERIC_AGENT_FAILURE));
  h.emit().onDone([]);
  expect(h.seen[0]).toEqual({ kind: "raw", line: "Error: invalid token [REDACTED]" });
  expect(h.errors).toEqual(["The assistant could not continue this answer. Saved work is above."]);
  expect(h.completed[0]?.at(-1)).toEqual({ kind: "ext", name: AGENT_FAILURE_EVENT, data: {
    reason: "Error: invalid token [REDACTED]", details: "Error: invalid token [REDACTED]", agentId: "other" } });
});

it("retains a structured error when the completion only carries a generic status", async () => {
  const h = harness();
  await h.transport.startRun({ history: [], signal: new AbortController().signal }, h.sink);
  h.emit().onError(new Error("Error: API key not valid."));
  h.emit().onDone([{ kind: "status", label: GENERIC_AGENT_FAILURE }]);
  expect(h.completed[0]?.at(-1)).toEqual({ kind: "ext", name: AGENT_FAILURE_EVENT, data: {
    reason: "Error: API key not valid.", details: "Error: API key not valid." } });
});

it("redacts rejected starts before either handlers or the caller can render them", async () => {
  const h = harness();
  const transport = withAgentFailureSurface({ transport: { ...h.transport,
    async startRun() { throw new Error("Error: rejected Bearer opaque-secret"); } } }, {});
  await expect(transport.startRun({ history: [], signal: new AbortController().signal }, h.sink)).rejects.toThrow("Error: rejected Bearer [REDACTED]");
  expect(h.errors).toEqual(["Error: rejected Bearer [REDACTED]"]);
  expect(h.seen).toEqual([{ kind: "ext", name: AGENT_FAILURE_EVENT, data: {
    reason: "Error: rejected Bearer [REDACTED]", details: "Error: rejected Bearer [REDACTED]" } }]);
});
