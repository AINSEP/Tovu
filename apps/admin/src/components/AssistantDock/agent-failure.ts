/** Compatibility copy of the proposed @jini-ai/chat/core failure API; see the Jini patch. */
import type { AgentEvent, ChatMessage, ChatTransport, RunHandlers } from "@jini-ai/chat/core";

export interface AgentFailureHint {
  readonly category: "auth" | "unsupported-client";
  /** Case-insensitive literal alternatives, scoped to this agent's own output. */
  readonly patterns: readonly string[];
  readonly hint: string;
  readonly suggestedAgentId?: string;
}

export interface FailureAgent {
  readonly id: string;
  readonly name: string;
  readonly available?: boolean;
  readonly failureHints?: readonly AgentFailureHint[];
}

export interface AgentFailure {
  readonly reason: string;
  readonly details: string;
  readonly agentId?: string;
}

export const AGENT_FAILURE_EVENT = "agent_failure";
export const GENERIC_AGENT_FAILURE = "The assistant could not continue this answer. Saved work is above.";

/** Strip CSI, OSC (including terminal hyperlinks) and remaining control characters first. */
export function redactAgentFailure({ text }: { text: string }, _optional = {}): string {
  return text
    .replace(/(?:\x1b\]|\x9d)[\s\S]*?(?:\x07|\x1b\\)/g, "")
    .replace(/[\x1b\x9b][[\]()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><~])/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "")
    .replace(/\b(?:AIza[\w-]+|AQ\.[\w.\/-]+|sk-[\w.-]+|gh[pousr]_[\w]+|github_pat_[\w]+|ya29\.[\w.-]+|eyJ[\w-]+\.[\w-]+(?:\.[\w-]+)?)/g, "[REDACTED]")
    .replace(/\b(Bearer\s+)[^\s"'<>]+/gi, "$1[REDACTED]")
    .replace(/((?:[\w-]*(?:api[ _-]?key|access[ _-]?token|refresh[ _-]?token|auth[ _-]?token|secret|password)|token)["']?\s*[:=]\s*["']?)([^\s"'&,;}]+)/gi, "$1[REDACTED]")
    .replace(/(Authorization\s*:\s*(?:Basic|Token)\s+)[^\s"'<>]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:key|api[_-]?key|token|access_token|refresh_token|code)=)[^\s"'&#]+/gi, "$1[REDACTED]")
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@");
}

const NOISE = /^(?:Warning:.*(?:256-color|color support)|YOLO mode is enabled|Code discovery:|Hook system message:|Ripgrep is not available|An unexpected critical error occurred:\s*$|Traceback \(most recent call last\):|\s*at\s|\s*File ")/i;
const STRUCTURE = /^(?:[{}\[\],]+|[a-z][\w]*:\s|\.\.\.)/;
const ERROR_LINE = /\b(?:[\w]*error|failed|failure|invalid|not valid|unauthorized|unauthenticated|denied|refused|exhausted|could not|not logged in|not authenticated|authentication required|no longer supported|missing.*key)\b/i;
const GENERIC = /^(?:Run failed — the agent process exited without answering|This turn failed\.?$|The assistant could not (?:continue|finish) this answer\. Saved work is above\.?$|Stopped\.?$)/i;

/** The last error sentence wins over trailing informational lines or an exception object dump. */
export function extractAgentFailure(
  { events, agentId }: { events: readonly AgentEvent[] | undefined; agentId?: string }, _optional = {},
): AgentFailure | null {
  const sources = (events ?? []).flatMap(event => {
    if (event.kind === "raw") return [event.line];
    if (event.kind === "ext" && event.name === "error" && event.data && typeof event.data === "object") {
      const { message } = event.data as { message?: unknown };
      return typeof message === "string" ? [message] : [];
    }
    if (event.kind === "status" && !GENERIC.test(event.label) && (event.code === "agent_error" || ERROR_LINE.test(event.label))) {
      return [[event.label, event.detail].filter(Boolean).join(" ")];
    }
    return [];
  });
  const details = redactAgentFailure({ text: sources.join("\n") }, {}).trim();
  const lines = details.split(/\r?\n/).map(line => line.trim()).filter(line => !NOISE.test(line))
    .filter(line => line && (!STRUCTURE.test(line) || /^(?:error|failure):/i.test(line)) && !GENERIC.test(line));
  const errors = lines.filter(line => ERROR_LINE.test(line));
  const reason = (errors[errors.length - 1] ?? lines[lines.length - 1])?.slice(0, 600);
  return reason ? { reason, details, ...(agentId ? { agentId } : {}) } : null;
}

export function matchAgentFailureHint(
  { failure, hints }: { failure: AgentFailure; hints: readonly AgentFailureHint[] }, _optional = {},
): AgentFailureHint | undefined {
  const text = `${failure.reason}\n${failure.details}`.toLowerCase();
  return hints.find(rule => rule.patterns.some(pattern => pattern.length > 0 && text.includes(pattern.toLowerCase())));
}

export function suggestedFailureAgent(
  { hint, agents }: { hint: AgentFailureHint | undefined; agents: readonly FailureAgent[] }, _optional = {},
): FailureAgent | undefined {
  return hint?.suggestedAgentId ? agents.find(agent => agent.id === hint.suggestedAgentId && agent.available === true) : undefined;
}

function safeEvent(event: AgentEvent): AgentEvent {
  if (event.kind === "raw") return { ...event, line: redactAgentFailure({ text: event.line }, {}) };
  if (event.kind === "status") return { ...event, label: redactAgentFailure({ text: event.label }, {}),
    ...(event.detail === undefined ? {} : { detail: redactAgentFailure({ text: event.detail }, {}) }) };
  return event;
}

export function projectAgentFailureMessage({ message }: { message: ChatMessage }, _optional = {}): ChatMessage {
  if (message.role !== "assistant") return message;
  const events = (message.events ?? []).filter(event => event.kind !== "ext" || event.name !== AGENT_FAILURE_EVENT);
  const failure = message.runStatus === "failed" ? extractAgentFailure({ events, ...(message.agentId ? { agentId: message.agentId } : {}) }, {}) : null;
  const fallback: AgentEvent[] = message.runStatus === "failed" && !failure &&
    !events.some(event => event.kind === "status" && event.label === GENERIC_AGENT_FAILURE)
    ? [{ kind: "status", code: "run_terminal", label: GENERIC_AGENT_FAILURE }] : [];
  return { ...message, events: [...events.map(safeEvent), ...(failure ? [failureEvent(failure)] : fallback)] };
}

function failureEvent(failure: AgentFailure): AgentEvent {
  return { kind: "ext", name: AGENT_FAILURE_EVENT, data: failure };
}

/** Wrap the existing transport; preserve optional checkpoint support and every lifecycle effect. */
export function withAgentFailureSurface({ transport }: { transport: ChatTransport }, _optional = {}): ChatTransport {
  function wrap(handlers: RunHandlers, agentId?: string): RunHandlers {
    let events: AgentEvent[] = [];
    let failed = false;
    let errorEvent: AgentEvent | undefined;
    function projected() {
      return projectAgentFailureMessage({ message: { id: "projection", role: "assistant", content: "",
        runStatus: failed ? "failed" : "succeeded", events, ...(agentId ? { agentId } : {}) } }, {}).events ?? [];
    }
    return {
      ...handlers,
      onEvent(event) { events.push(event); handlers.onEvent(safeEvent(event)); },
      ...(handlers.onCheckpoint ? { onCheckpoint(message: ChatMessage) {
        events = message.events ?? [];
        failed = message.runStatus === "failed";
        agentId = message.agentId ?? agentId;
        handlers.onCheckpoint?.(projectAgentFailureMessage({ message: { ...message, ...(agentId ? { agentId } : {}) } }, {}));
      } } : {}),
      onError(error) {
        failed = true;
        errorEvent = { kind: "status", code: "agent_error", label: error.message };
        events.push(errorEvent);
        const failure = extractAgentFailure({ events, ...(agentId ? { agentId } : {}) }, {});
        if (failure) handlers.onEvent(failureEvent(failure));
        handlers.onError(new Error(redactAgentFailure({ text: error.message }, {})));
      },
      onDone(finalEvents) {
        // The durable final event array is authoritative, not a replay of the collected prefix.
        if (finalEvents.length > 0) events = finalEvents;
        if (errorEvent && !events.some(event => event.kind === "status" && errorEvent?.kind === "status" && event.label === errorEvent.label)) {
          events = [...events, errorEvent];
        }
        handlers.onDone(projected());
      },
    };
  }
  return {
    ...transport,
    async startRun(input, handlers) {
      const sink = wrap(handlers, input.agentId);
      try { return await transport.startRun(input, sink); }
      catch (error) {
        const safe = new Error(redactAgentFailure({ text: error instanceof Error ? error.message : String(error) }, {}));
        sink.onError(safe);
        throw safe;
      }
    },
    async reattachRun(runId, handlers, options) {
      const sink = wrap(handlers);
      try { await transport.reattachRun(runId, sink, options); }
      catch (error) {
        const safe = new Error(redactAgentFailure({ text: error instanceof Error ? error.message : String(error) }, {}));
        sink.onError(safe);
        throw safe;
      }
    },
  };
}
