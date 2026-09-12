/**
 * `ChatTransport` over Electron IPC — the renderer half of the fleet chat.
 *
 * The port is written for a streaming transport, and Electron's `invoke` is not one. The shape that
 * closes the gap is documented on the main-process side (`main/fleet-chat-ipc.ts`); what matters
 * here is the consequence: every run's events arrive on ONE shared push channel, tagged with a
 * subscription id this module minted. So this module owns a demultiplexer — one channel listener,
 * installed once, fanning out to per-subscription records — rather than a listener per run. A
 * listener per run is how a pane that remounts mid-conversation ends up rendering every token twice.
 *
 * It is also the reducer. `@jini-ai/chat` renders `AgentEvent`s and deliberately does not know about
 * `@jini-ai/protocol`'s wire vocabulary; reducing one to the other is the transport adapter's job by
 * that package's own contract, so `translateRunEvent` below is the only place the two vocabularies
 * meet.
 */
import { buildTranscript } from '@jini-ai/chat/core';
import type {
  AgentEvent,
  ChatRunStatus,
  ChatTransport,
  ReattachRunOptions,
  RunHandlers,
  StartRunInput,
  ToolResultMediaBlock,
} from '@jini-ai/chat/core';
import type { RunAgentPayload, RunProtocolEvent } from '@jini-ai/protocol';
import { runnerVerbForAgentToolName } from '../contracts/fleet-chat.js';
import type { RunnerChatEventMessage, RunnerChatRunState } from '../contracts/fleet-chat.js';
import type { RunnerInventoryBridge } from './runner-api.js';

interface SubscriptionRecord {
  readonly handlers: RunHandlers;
  readonly events: AgentEvent[];
  /**
   * Tool-use ids already rendered.
   *
   * `@jini-ai/protocol` states outright that run-event delivery is at-least-once and that the
   * client reducer deduplicates, so this is the reducer holding up its end — and it is not
   * theoretical: `@jini-ai/agent-runtime`'s Claude stream parser emits each `tool_use` twice
   * (once from the streaming `content_block_stop`, once again from the `assistant` wrapper, whose
   * `streamedToolUseIds` guard misses when the wrapper itself arrives twice). Verified live against
   * Claude Code 2.1.221: two distinct log cursors, identical `toolu_…` id.
   */
  readonly renderedToolUseIds: Set<string>;
  /** Agent-reported tool-use ids whose `tool_result` must be dropped too — see `translateAgentPayload`. */
  readonly mirroredToolUseIds: Set<string>;
  /** Set once the run is known. `stopRun`/`detach` need it; `startRun` learns it only after its invoke resolves. */
  runId: string | null;
  errored: boolean;
  settled: boolean;
  /** Resolves the `reattachRun` promise, which must stay pending for the life of the stream. */
  finish: (() => void) | null;
}

let nextSubscriptionSeq = 0;

function mintSubscriptionId(): string {
  nextSubscriptionSeq += 1;
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `sub-${nextSubscriptionSeq}-${random}`;
}

/** `@jini-ai/protocol` spells it `cancelled`; `@jini-ai/chat` spells it `canceled`. One L, one place. */
function toChatRunStatus(state: RunnerChatRunState): ChatRunStatus {
  switch (state) {
    case 'queued':
    case 'starting':
      return 'queued';
    case 'running':
      return 'running';
    case 'succeeded':
      return 'succeeded';
    case 'cancelled':
      return 'canceled';
    case 'failed':
      return 'failed';
  }
}

function isMediaBlock(value: unknown): value is ToolResultMediaBlock {
  if (typeof value !== 'object' || value === null) return false;
  const block = value as { type?: unknown; text?: unknown; mimeType?: unknown; data?: unknown };
  if (block.type === 'text') return typeof block.text === 'string';
  return block.type === 'image' && typeof block.mimeType === 'string' && typeof block.data === 'string';
}

function mediaBlocks(media: unknown): readonly ToolResultMediaBlock[] {
  return Array.isArray(media) ? media.filter(isMediaBlock) : [];
}

function translateStatus(payload: Extract<RunAgentPayload, { type: 'status' }>): AgentEvent | null {
  return { kind: 'status', label: payload.label, ...(payload.detail === undefined ? {} : { detail: payload.detail }) };
}

function translateTextDelta(payload: Extract<RunAgentPayload, { type: 'text_delta' }>): AgentEvent | null {
  return { kind: 'text', text: payload.delta };
}

function translateThinkingDelta(payload: Extract<RunAgentPayload, { type: 'thinking_delta' }>): AgentEvent | null {
  return { kind: 'thinking', text: payload.delta };
}

/** A bracket with no content of its own. */
function translateThinkingStart(): AgentEvent | null {
  return null;
}

/**
 * A `runner.*` call reaches the transcript TWICE by design: once as the agent's own view of the
 * MCP call it made, and once as the `DelegatedToolBridge`'s canonical record of executing it. The
 * bridge's is the one that matters — it is the pair the deny-by-default gate actually produced,
 * and it carries the real verb name rather than the client's MCP alias — so the agent's mirror is
 * dropped here, along with the `tool_result` that will follow it.
 */
function translateToolUse(payload: Extract<RunAgentPayload, { type: 'tool_use' }>, record: SubscriptionRecord): AgentEvent | null {
  if (runnerVerbForAgentToolName(payload.name) !== undefined) {
    record.mirroredToolUseIds.add(payload.id);
    return null;
  }
  if (record.renderedToolUseIds.has(payload.id)) return null;
  record.renderedToolUseIds.add(payload.id);
  return { kind: 'tool_use', id: payload.id, name: payload.name, input: payload.input };
}

/** An ephemeral live preview the port routes through its own handler rather than the persisted event list. */
function translateToolInputDelta(payload: Extract<RunAgentPayload, { type: 'tool_input_delta' }>, record: SubscriptionRecord): AgentEvent | null {
  record.handlers.onToolInputDelta?.(payload.id, payload.name, payload.delta);
  return null;
}

function translateToolResult(payload: Extract<RunAgentPayload, { type: 'tool_result' }>, record: SubscriptionRecord): AgentEvent | null {
  if (record.mirroredToolUseIds.has(payload.toolUseId)) return null;
  const blocks = mediaBlocks(payload.media);
  return {
    kind: 'tool_result',
    toolUseId: payload.toolUseId,
    content: payload.content,
    isError: payload.isError === true,
    // `media` is `unknown` on the wire by design (`@jini-ai/protocol` sits below every feature
    // package). `@jini-ai/chat` ports the same block vocabulary, so this narrows rather than
    // reinterprets — and drops anything that is not a recognised block instead of trusting it.
    ...(blocks.length === 0 ? {} : { media: blocks }),
  };
}

function translateUsage(payload: Extract<RunAgentPayload, { type: 'usage' }>): AgentEvent | null {
  return {
    kind: 'usage',
    ...(payload.usage?.input_tokens === undefined ? {} : { inputTokens: payload.usage.input_tokens }),
    ...(payload.usage?.output_tokens === undefined ? {} : { outputTokens: payload.usage.output_tokens }),
    ...(payload.costUsd === undefined ? {} : { costUsd: payload.costUsd }),
    ...(payload.durationMs === undefined ? {} : { durationMs: payload.durationMs }),
  };
}

function translateRaw(payload: Extract<RunAgentPayload, { type: 'raw' }>): AgentEvent | null {
  return { kind: 'raw', line: payload.line };
}

type PayloadTranslator = (payload: RunAgentPayload, record: SubscriptionRecord) => AgentEvent | null;

/**
 * One entry per named wire variant, keyed by `payload.type`. Anything not listed here — `stage_*`,
 * `surface_*`, `a2ui`, `mcp-ui`, and any future addition — falls through `translateAgentPayload`'s
 * `ext` escape hatch below rather than needing its own entry, so this table only grows when a
 * variant needs REAL handling, not for every wire addition.
 */
const payloadTranslators: Record<string, PayloadTranslator> = {
  status: translateStatus as PayloadTranslator,
  text_delta: translateTextDelta as PayloadTranslator,
  thinking_delta: translateThinkingDelta as PayloadTranslator,
  thinking_start: translateThinkingStart as PayloadTranslator,
  tool_use: translateToolUse as PayloadTranslator,
  tool_input_delta: translateToolInputDelta as PayloadTranslator,
  tool_result: translateToolResult as PayloadTranslator,
  usage: translateUsage as PayloadTranslator,
  raw: translateRaw as PayloadTranslator,
};

/**
 * Reduces one `agent` wire payload to the renderable event, or to a `onToolInputDelta` side effect.
 * Returning `null` means "nothing to render". Dispatch is a lookup against `payloadTranslators`
 * rather than a switch over ten variants — each variant's own logic lives in its own named
 * `translate*` function above, independently readable and independently low-complexity.
 */
function translateAgentPayload(payload: RunAgentPayload, record: SubscriptionRecord): AgentEvent | null {
  const translator = payloadTranslators[payload.type];
  if (translator === undefined) {
    // Every remaining variant is host-specific scaffolding no producer in this app emits. Carried
    // through the `ext` escape hatch rather than dropped, so a future producer shows up in the
    // transcript instead of vanishing.
    return { kind: 'ext', name: payload.type, data: payload };
  }
  return translator(payload, record);
}

function settle(record: SubscriptionRecord): void {
  if (record.settled) return;
  record.settled = true;
  record.handlers.onDone([...record.events]);
  record.finish?.();
}

/** `stdout`/`stderr` are the raw child bytes, which the driver emits *alongside* the parsed `agent`
 *  events purely for diagnostics; `start` carries nothing to render. Rendering any of them shows
 *  every token twice. */
const NOOP_RUN_EVENT_KINDS = new Set<RunProtocolEvent['kind']>(['start', 'stdout', 'stderr']);

function applyAgentEvent(record: SubscriptionRecord, payload: RunAgentPayload): void {
  const translated = translateAgentPayload(payload, record);
  if (translated === null) return;
  record.events.push(translated);
  record.handlers.onEvent(translated);
}

function applyRunEndEvent(record: SubscriptionRecord, event: Extract<RunProtocolEvent, { kind: 'end' }>): void {
  // A failed run that never emitted an `error` event still has to surface as an error, or the pane
  // shows a turn that simply stopped mid-sentence with no explanation.
  const failedSilently = event.payload.status === 'failed' && !record.errored;
  if (failedSilently) {
    record.errored = true;
    record.handlers.onError(new Error(exitDescription(event.payload.code, event.payload.signal ?? null)));
  }
  settle(record);
}

function applyRunEvent(record: SubscriptionRecord, event: RunProtocolEvent): void {
  if (record.settled) return;
  if (NOOP_RUN_EVENT_KINDS.has(event.kind)) return;
  switch (event.kind) {
    case 'agent':
      applyAgentEvent(record, event.payload);
      return;
    case 'error':
      record.errored = true;
      record.handlers.onError(new Error(event.payload.message));
      return;
    case 'end':
      applyRunEndEvent(record, event);
      return;
  }
}

function exitDescription(code: number | null, signal: string | null): string {
  if (signal !== null) return `The agent process was terminated by ${signal}.`;
  if (code !== null) return `The agent process exited with code ${code}.`;
  return 'The agent run failed before producing a result.';
}

export interface RunnerChatTransport extends ChatTransport {
  /**
   * Removes the shared run-event listener and detaches every live subscription in main.
   *
   * The owner must call this when the pane unmounts. Closing the pane is NOT the same event as the
   * window being destroyed — main cleans up after the latter on its own, but a pane that opens and
   * closes ten times would otherwise leave ten listeners on the run-event channel, each still
   * holding its own `Map` of dead subscriptions, and a turn left running would keep pushing into
   * all of them.
   */
  dispose(): void;
}

interface ChatStartPayload {
  subscriptionId: string;
  prompt: string;
  agentId: string;
  model?: string;
  reasoning?: string;
  attachmentPaths?: readonly string[];
}

function buildChatStartPayload(subscriptionId: string, agentId: string, input: StartRunInput): ChatStartPayload {
  return {
    subscriptionId,
    prompt: buildTranscript(input.history, { targetAgentId: agentId }),
    agentId,
    ...(input.context?.['model'] === undefined ? {} : { model: String(input.context['model']) }),
    ...(input.context?.['reasoning'] === undefined ? {} : { reasoning: String(input.context['reasoning']) }),
    // `StartRunInput.attachments` is `ChatPane`'s own record of this turn's staged `+` files
    // (`chat-attachments.ts` populated their `.path` when `uploadAttachments` ran) — only their
    // paths cross into main, which is the only part `runner-daemon.ts` forwards on to the agent.
    ...(input.attachments === undefined || input.attachments.length === 0
      ? {}
      : { attachmentPaths: input.attachments.map((attachment) => attachment.path) }),
  };
}

/**
 * The user may have hit stop while the start invoke was still in flight, in which case the abort
 * already fired against a run id nobody had yet. Honour it now that we have one. Takes `bridge`
 * explicitly rather than closing over the outer one, so this stays testable independent of
 * `createRunnerChatTransport`'s closure.
 */
function wireCancelSignal(bridge: RunnerInventoryBridge, cancelSignal: AbortSignal | undefined, runId: string): void {
  if (cancelSignal?.aborted === true) {
    void bridge.chatStop(runId).catch(() => {});
    return;
  }
  cancelSignal?.addEventListener('abort', () => void bridge.chatStop(runId).catch(() => {}), { once: true });
}

export function createRunnerChatTransport(bridge: RunnerInventoryBridge): RunnerChatTransport {
  const records = new Map<string, SubscriptionRecord>();

  // One listener per transport instance, installed at construction. `RunnerChatPane` memoizes the
  // transport, so this is one registration per pane lifetime, not per turn.
  const offChatEvent = bridge.onChatEvent((message: RunnerChatEventMessage) => {
    const record = records.get(message.subscriptionId);
    if (record === undefined) return;
    if (message.kind === 'event') {
      applyRunEvent(record, message.event);
      return;
    }
    if (message.kind === 'closed') {
      if (message.reason !== 'terminal' && !record.settled) {
        record.errored = true;
        record.handlers.onError(
          new Error(
            message.reason === 'unknown-run'
              ? 'Runner no longer has this run; send the message again.'
              : "Runner couldn't replay this run's history; send the message again.",
          ),
        );
      }
      settle(record);
      records.delete(message.subscriptionId);
    }
  });

  function open(handlers: RunHandlers): { subscriptionId: string; record: SubscriptionRecord } {
    const subscriptionId = mintSubscriptionId();
    const record: SubscriptionRecord = {
      handlers,
      events: [],
      renderedToolUseIds: new Set(),
      mirroredToolUseIds: new Set(),
      runId: null,
      errored: false,
      settled: false,
      finish: null,
    };
    records.set(subscriptionId, record);
    return { subscriptionId, record };
  }

  /** Detaches the browser side. The run keeps going in main — that is exactly `StartRunInput.signal`'s contract. */
  function detach(subscriptionId: string): void {
    if (!records.delete(subscriptionId)) return;
    void bridge.chatDetach(subscriptionId).catch(() => {
      // The renderer is already done with this subscription; a failed teardown invoke (window
      // closing, main already torn down) has no remedy and nothing left to report to.
    });
  }

  return {
    async startRun(input: StartRunInput, handlers: RunHandlers): Promise<{ runId: string }> {
      const agentId = input.agentId;
      if (agentId === undefined || agentId === '') {
        throw new Error('Choose an agent runtime before sending a message.');
      }

      // Registered BEFORE the invoke. Main attaches its subscription inside the `start` handler, so
      // the first events can be pushed while this promise is still in flight; without the record
      // already in place they would arrive with nowhere to go.
      const { subscriptionId, record } = open(handlers);
      input.signal.addEventListener('abort', () => detach(subscriptionId), { once: true });

      try {
        const { runId } = await bridge.chatStart(buildChatStartPayload(subscriptionId, agentId, input));
        record.runId = runId;
        wireCancelSignal(bridge, input.cancelSignal, runId);
        return { runId };
      } catch (error) {
        records.delete(subscriptionId);
        throw error;
      }
    },

    async reattachRun(runId: string, handlers: RunHandlers, options?: ReattachRunOptions): Promise<void> {
      const { subscriptionId, record } = open(handlers);
      record.runId = runId;

      // Resolves only when the stream ends — the same shape an SSE reader has, and what
      // `ReattachRunOptions.signal` exists to interrupt.
      const streamed = new Promise<void>((resolve) => {
        record.finish = resolve;
      });

      const abort = (): void => {
        detach(subscriptionId);
        record.finish?.();
      };
      if (options?.signal?.aborted === true) {
        records.delete(subscriptionId);
        return;
      }
      options?.signal?.addEventListener('abort', abort, { once: true });

      try {
        await bridge.chatReattach({ subscriptionId, runId });
      } catch (error) {
        records.delete(subscriptionId);
        throw error;
      }
      await streamed;
    },

    async fetchRunStatus(runId: string): Promise<ChatRunStatus | null> {
      const snapshot = await bridge.chatStatus(runId);
      return snapshot === null ? null : toChatRunStatus(snapshot.state);
    },

    async stopRun(runId: string): Promise<void> {
      await bridge.chatStop(runId);
    },

    dispose(): void {
      offChatEvent();
      for (const subscriptionId of [...records.keys()]) detach(subscriptionId);
    },
  };
}
