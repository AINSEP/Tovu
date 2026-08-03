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
import { buildTranscript, latestUserPromptFromHistory } from "@jini-ai/chat/core";
import type { AgentEvent, ChatMessage } from "@jini-ai/chat/core";
import type { ChatTransport, RunHandlers, StartRunInput } from "@jini-ai/chat/react";

const RUNS_URL = "/api/runs";

/**
 * How many trailing messages of a conversation go to the agent.
 *
 * A cap rather than none: each turn cold-boots a fresh subprocess and pays for its whole input, so
 * an uncapped transcript makes every message in a long chat more expensive than the last. 40 is
 * roughly 20 exchanges — beyond what a working session usually needs to stay coherent, and far
 * short of where input cost starts to dominate. `buildTranscript` separately truncates any single
 * oversized message, so this bounds the number of turns, not their size.
 */
const MAX_TRANSCRIPT_TURNS = 40;

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
    // An MCP content block the daemon withheld from the tool result because it is for the HUMAN,
    // not the model (`@jini-ai/daemon`'s `delegated-tool-bridge.ts` → `tool-result-surfaces.ts`).
    // Explicit rather than left to `default` below because the shapes do not line up: the default
    // passes the WHOLE wire payload as `data`, but `@jini-ai/chat`'s `McpUiSurfaceCard` runs
    // `parseUIResource` over each event's `data` and that requires the bare `EmbeddedResource`
    // (`{type:'resource', resource:{uri,mimeType,text}}`). Handing it the envelope instead fails
    // the `type !== 'resource'` check and renders an empty frame — a silent no-op, which is the
    // worst possible failure for a confirmation dialog. Unwrapping here is what makes the two ends
    // meet. `name` must stay `"mcp-ui"` to match `MCP_UI_EXT_EVENT_NAME`.
    case "mcp-ui":
      return { kind: "ext", name: "mcp-ui", data: payload.resource };
    // thinking_start/stage_start/stage_end/surface_request/surface_response/a2ui: no dedicated
    // chat-core variant. Routed through the `ext` escape hatch rather than dropped, so a future
    // renderer can opt in without a transport change.
    case "thinking_start":
      return null;
    default:
      return { kind: "ext", name: payload.type, data: payload };
  }
}

/**
 * The prompt for one run: the whole conversation so far, not just the newest message.
 *
 * This used to send only the latest user turn, which is why the assistant appeared to have no
 * memory — ask it something, then ask a follow-up, and the second run had never seen the first.
 * That looked like a missing capability and was not: `ChatPane` hands the full history to every
 * `startRun`, and it was being discarded here, in the browser, before the request was even built.
 * Nothing server-side had to change.
 *
 * `buildTranscript` rather than a hand-rolled join, because flattening a transcript has more edges
 * than it first appears: it truncates any single oversized message, escapes `## user`/`## assistant`
 * inside message bodies so a user cannot forge a turn boundary by pasting one, summarizes persisted
 * artifacts instead of replaying them, and prepends a warning when prior-run telemetry shows the
 * context was already large. Every admin turn cold-boots a fresh CLI subprocess, so the transcript
 * IS the memory — and the same property makes an unbounded one expensive.
 *
 * Bounded deliberately: each run is billed, and an unbounded transcript grows the input cost of
 * every subsequent turn in a conversation that has no natural end. {@link MAX_TRANSCRIPT_TURNS}
 * keeps a long-running chat from silently becoming the most expensive thing in the product.
 */
function runPrompt(history: StartRunInput["history"]): string {
  const recent = history.slice(-MAX_TRANSCRIPT_TURNS);
  return buildTranscript(recent as ChatMessage[]);
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
      // Guard on the newest USER turn, not on the assembled transcript: a history containing only
      // assistant messages would still produce a non-empty transcript, and sending that as a
      // prompt asks the agent to reply to itself.
      if (!latestUserPromptFromHistory(input.history as ChatMessage[])) {
        throw new Error("no user message to send");
      }
      const prompt = runPrompt(input.history);

      /**
       * Which browser tab this run should be allowed to drive, from `ChatPane`'s `runContext`
       * prop (`AssistantDock.tsx` supplies it from the live `FrontendSessionBridge`).
       *
       * Read by name rather than spreading the whole `input.context` blob: `contextRef` is a
       * shared envelope that Tovu's proxy also writes `principalId` into
       * (`src/server/modules/assistant.ts`), and a spread would let any future `runContext` key
       * silently shadow it — an identity field being overwritten by a UI prop is not a failure
       * mode worth leaving open to save one line.
       *
       * Omitted entirely when absent, which is a normal state, not an error: the daemon treats a
       * run with no bind token as one with no screen to drive (`agent-daemon-server.ts`).
       */
      const frontendBindToken = input.context?.["frontendBindToken"];
      const contextRef: Record<string, unknown> = { prompt };
      if (typeof frontendBindToken === "string" && frontendBindToken.length > 0) {
        contextRef.frontendBindToken = frontendBindToken;
      }

      /**
       * Opaque `attachment:<uuid>` capability ids (`ChatAttachment.path` — never a real filesystem
       * path this early; see `@jini-ai/http-kit`'s `attachments.ts` trust-model doc), not the
       * attachments themselves — `contextRef` is the one channel `prompt`/`frontendBindToken`
       * already ride on to reach `agent-daemon-server.ts`'s `onStarted`, which is where these ids
       * get exchanged for real, re-validated paths via `AttachmentStore.claim()`. Nothing on this
       * side of the wire is trusted; the id is inert until the daemon claims it.
       *
       * Omitted entirely when there are none, same convention as `frontendBindToken` above — a run
       * with no attachments is the overwhelmingly common case and should not carry a key for it.
       */
      if (input.attachments && input.attachments.length > 0) {
        contextRef.attachmentIds = input.attachments.map((attachment) => attachment.path);
      }

      const response = await fetch(RUNS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ contextRef: JSON.stringify(contextRef), agentId: input.agentId }),
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

