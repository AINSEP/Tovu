/**
 * Tovu's implementation of `@jini-ai/chat-react`'s `ChatTransport` port (ADR-049).
 *
 * Binds it to the real `@jini-ai/http` run surface `src/server/modules/assistant.ts` mounts:
 * `POST /api/runs` to start, `GET /api/runs/:runId/events` (native `EventSource`, not a hand-rolled
 * SSE reader — the route supports the standard `id:`/`event:`/`data:` framing) to stream,
 * `GET /api/runs/:runId` for status, `POST /api/runs/:runId/cancel` to stop.
 *
 * Every SSE frame's `data` is a full `@jini-ai/protocol` `RunProtocolEvent` (`{kind, payload,
 * ...}`), not chat-core's own `AgentEvent` — chat-core's own module doc is explicit that this
 * reduction is a transport concern ("a host's transport adapter is responsible for reducing wire
 * deltas... into the persisted/renderable AgentEvent items"), so `translateRunAgentPayload` below
 * does that translation. `text_delta`/`thinking_delta` are forwarded as their own small `AgentEvent`
 * per delta (not accumulated here) — chat-core's own `ChatMessage.events` array is what
 * concatenates them into one growing message, so accumulating twice would double the text.
 */
import type { AgentEvent } from "@jini-ai/chat-core";
import type { ChatTransport, RunHandlers, StartRunInput } from "@jini-ai/chat-react";

const RUNS_URL = "/api/runs";

interface RunAgentPayload {
  readonly type: string;
  readonly [key: string]: unknown;
}

interface RunProtocolEventWire {
  readonly runId: string;
  readonly kind: "start" | "agent" | "stdout" | "stderr" | "error" | "end";
  readonly payload: unknown;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
}

/** Reduces one wire-level `RunAgentPayload` into zero or one renderable `AgentEvent`s. */
function translateRunAgentPayload(payload: RunAgentPayload): AgentEvent | null {
  switch (payload.type) {
    case "status":
      return { kind: "status", label: asString(payload.label), detail: payload.detail ? asString(payload.detail) : undefined };
    case "text_delta":
      return { kind: "text", text: asString(payload.delta) };
    case "thinking_delta":
      return { kind: "thinking", text: asString(payload.delta) };
    case "tool_use":
      return { kind: "tool_use", id: asString(payload.id), name: asString(payload.name), input: payload.input };
    case "tool_result":
      return {
        kind: "tool_result",
        toolUseId: asString(payload.toolUseId),
        content: asString(payload.content),
        isError: Boolean(payload.isError),
      };
    case "usage": {
      const usage = (payload.usage ?? {}) as Record<string, unknown>;
      return {
        kind: "usage",
        inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : undefined,
        outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : undefined,
        costUsd: typeof payload.costUsd === "number" ? payload.costUsd : undefined,
        durationMs: typeof payload.durationMs === "number" ? payload.durationMs : undefined,
      };
    }
    case "raw":
      return { kind: "raw", line: asString(payload.line) };
    // thinking_start/stage_start/stage_end/surface_request/surface_response/a2ui: no dedicated
    // chat-core variant. Routed through the `ext` escape hatch rather than dropped, so a future
    // renderer can opt in without a transport change.
    case "thinking_start":
      return null;
    default:
      return { kind: "ext", name: payload.type, data: payload };
  }
}

/** Pulls the newest user-authored text out of the history chat-react hands us. */
function latestUserPrompt(history: StartRunInput["history"]): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i];
    if (msg.role === "user" && msg.content) return msg.content;
  }
  return "";
}

/** `@jini-ai/protocol`'s `RunState` -> chat-core's flat `RunStatus` union (different spelling: `cancelled` vs `canceled`, `pending` vs `queued`). */
function toChatCoreRunStatus(state: string): "queued" | "running" | "succeeded" | "failed" | "canceled" | undefined {
  switch (state) {
    case "pending":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
      return "canceled";
    default:
      return undefined;
  }
}

/** `signal` is only available on the `startRun` path (`StartRunInput.signal`) — `reattachRun`'s
 * signature carries no abort signal at all, so a reattached subscription only ever ends via the
 * stream's own `end`/`error` frame. */
function subscribeToRun(runId: string, handlers: RunHandlers, signal?: AbortSignal): void {
  const source = new EventSource(`${RUNS_URL}/${encodeURIComponent(runId)}/events`);
  const collected: AgentEvent[] = [];
  let settled = false;

  const finish = () => {
    if (settled) return;
    settled = true;
    source.close();
    handlers.onDone(collected);
  };

  signal?.addEventListener("abort", () => {
    if (!settled) {
      settled = true;
      source.close();
    }
  });

  source.addEventListener("agent", (event) => {
    const frame = JSON.parse((event as MessageEvent<string>).data) as RunProtocolEventWire;
    const translated = translateRunAgentPayload(frame.payload as RunAgentPayload);
    if (translated) {
      collected.push(translated);
      handlers.onEvent(translated);
    }
  });

  source.addEventListener("stdout", (event) => {
    const frame = JSON.parse((event as MessageEvent<string>).data) as RunProtocolEventWire;
    const chunk = asString((frame.payload as { chunk?: unknown }).chunk);
    const translated: AgentEvent = { kind: "raw", line: chunk };
    collected.push(translated);
    handlers.onEvent(translated);
  });

  source.addEventListener("error", (event) => {
    const raw = (event as MessageEvent<string>).data;
    if (raw) {
      const frame = JSON.parse(raw) as RunProtocolEventWire;
      const message = asString((frame.payload as { message?: unknown }).message);
      handlers.onError(new Error(message || "agent run failed"));
      return;
    }
    // A bare EventSource connection error (no `data`, e.g. the server never responded) rather
    // than a run-level error frame.
    handlers.onError(new Error("assistant stream connection error"));
  });

  source.addEventListener("end", () => {
    finish();
  });
}

export function createTovuAssistantTransport(): ChatTransport {
  return {
    async startRun(input: StartRunInput, handlers: RunHandlers): Promise<{ runId: string }> {
      const prompt = latestUserPrompt(input.history);
      if (!prompt) throw new Error("no user message to send");

      const response = await fetch(RUNS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ contextRef: JSON.stringify({ prompt }), agentId: input.agentId }),
        signal: input.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`agent run failed to start (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
      }

      const { run } = (await response.json()) as { run: { id: string } };
      subscribeToRun(run.id, handlers, input.signal);
      return { runId: run.id };
    },

    async reattachRun(runId: string, handlers: RunHandlers): Promise<void> {
      subscribeToRun(runId, handlers);
    },

    async fetchRunStatus(runId: string) {
      const response = await fetch(`${RUNS_URL}/${encodeURIComponent(runId)}`, { credentials: "same-origin" });
      if (!response.ok) return null;
      const { run } = (await response.json()) as { run: { state: string } };
      return toChatCoreRunStatus(run.state) ?? null;
    },

    async stopRun(runId: string): Promise<void> {
      await fetch(`${RUNS_URL}/${encodeURIComponent(runId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ runId }),
      });
    },
  };
}

