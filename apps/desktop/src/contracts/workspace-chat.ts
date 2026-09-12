/**
 * Browser-safe contract for the LEFT-hand "Fleet chat" — Runner's operator agent.
 *
 * Mirrors `runtime-inventory.ts`/`project-registry.ts`: channel constants and DTOs only,
 * no logic. The one structural difference is that a chat turn STREAMS, and Electron's
 * `ipcRenderer.invoke` is strictly request/response — so this contract has two halves:
 *
 *   - **Invoke channels** (`start`/`reattach`/`detach`/`stop`/`status`), renderer → main.
 *   - **Push channels** (`event`/`navigate`), main → renderer via `webContents.send`.
 *
 * A renderer subscription is identified by a renderer-minted {@link WorkspaceChatStartInput.subscriptionId},
 * NOT by the run id, and the id is supplied on the way IN rather than handed back on the way out.
 * That ordering is load-bearing: main attaches its `RunLifecycle.stream()` subscription inside the
 * `start` handler, before the invoke resolves, so there is no window in which the run is live but
 * nobody is listening. It also means one run can carry several independent subscriptions (a reattach
 * after a pane remount) without either of them having to guess when the other detached.
 *
 * Run events cross as `@jini-ai/protocol`'s canonical `RunProtocolEvent` envelope — the same shape
 * an SSE transport would carry. Reducing those wire deltas into `@jini-ai/chat`'s renderable
 * `AgentEvent` vocabulary is the renderer transport's job, per that package's own transport-adapter
 * contract; main stays free of chat display types.
 */
import type { RunProtocolEvent } from '@jini-ai/protocol';
import { runnerToolNames } from './sections.js';

export const WORKSPACE_CHAT_CHANNELS = {
  /** invoke: begin a turn and attach a subscription to it in one round trip. */
  start: 'workspace:chat:start',
  /** invoke: attach a subscription to an already-running (or already-finished) run. */
  reattach: 'workspace:chat:reattach',
  /** invoke: drop a subscription. The run itself keeps going — see `WorkspaceChatTransport`. */
  detach: 'workspace:chat:detach',
  /** invoke: request cancellation of a run. */
  stop: 'workspace:chat:stop',
  /** invoke: one-shot status read for a run id. */
  status: 'workspace:chat:status',
  /** push (main → renderer): one `RunProtocolEvent` for one subscription. */
  event: 'workspace:chat:event',
  /** push (main → renderer): the `runner.navigate` tool moved the top nav. */
  navigate: 'workspace:chat:navigate',
} as const;

export interface WorkspaceChatStartInput {
  /** Renderer-minted. Scopes every pushed event back to the pane that asked for it. */
  subscriptionId: string;
  /** The already-flattened transcript sent to the agent CLI as this turn's prompt. */
  prompt: string;
  /** A `RunnerAgentSummary.id` from the runtime inventory. */
  agentId: string;
  model?: string;
  reasoning?: string;
  /** Absolute paths of this turn's staged `+` attachments (`chat-attachments.ts`). */
  attachmentPaths?: readonly string[];
}

export interface WorkspaceChatStartResult {
  runId: string;
}

export interface WorkspaceChatReattachInput {
  subscriptionId: string;
  runId: string;
  /**
   * Opaque `RunProtocolEvent.opaqueCursor` to resume after. Omitted or `null` replays the run's
   * whole retained history, which is what a fresh pane wants.
   */
  afterCursor?: string | null;
}

/** Why a subscription stopped receiving events, pushed as the final message on its channel. */
export type WorkspaceChatDetachReason =
  /** The run reached a terminal state. `end` was already delivered. */
  | 'terminal'
  /** The event log could not replay from the requested cursor — the renderer must restart the turn. */
  | 'replay-gap'
  /** The run id is unknown to this daemon (evicted, or never existed). */
  | 'unknown-run';

export type WorkspaceChatEventMessage =
  | { subscriptionId: string; kind: 'event'; event: RunProtocolEvent }
  | { subscriptionId: string; kind: 'closed'; reason: WorkspaceChatDetachReason };

/**
 * `@jini-ai/protocol`'s `RunState`, restated here so the renderer never has to import a
 * Node-flavoured package to read one string. Kept in that vocabulary rather than
 * `@jini-ai/chat`'s (`'canceled'`, one L) so the mapping happens once, in the transport.
 */
export type WorkspaceChatRunState = 'queued' | 'starting' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface WorkspaceChatRunSnapshot {
  runId: string;
  state: WorkspaceChatRunState;
}

/**
 * How a `runner.*` verb is spelled once it has crossed MCP into an agent's own tool namespace.
 *
 * MCP tool names are matched against `^[a-zA-Z0-9_-]{1,64}$` by every client that forwards them to
 * a model API, and `runner.project.list` has dots in it. Underscores are the standard substitution,
 * and the mapping is reversible because no allowlisted verb contains an underscore-vs-dot ambiguity.
 * Lives in the shared contract rather than in main because BOTH ends need it: main advertises these
 * names over the bridge, and the renderer has to recognise them coming back (see
 * {@link runnerVerbForAgentToolName}).
 */
export function mcpToolNameForVerb(verb: string): string {
  return verb.replace(/\./g, '_');
}

/**
 * Resolves an agent-reported tool name back to the `runner.*` verb it invoked, or `undefined` when
 * it is not one of ours.
 *
 * Accepts both the bare MCP name and a client-namespaced one (Claude Code reports
 * `mcp__jini__runner_project_list`), because the namespacing is the client's, not the server's, and
 * differs between clients.
 */
export function runnerVerbForAgentToolName(agentToolName: string): string | undefined {
  let bare = agentToolName;
  if (bare.startsWith('mcp__')) {
    const separator = bare.indexOf('__', 'mcp__'.length);
    if (separator === -1) return undefined;
    bare = bare.slice(separator + 2);
  }
  return runnerToolNames().find((verb) => mcpToolNameForVerb(verb) === bare);
}
