/**
 * A Tovu-shaped port for "run a coding-agent CLI turn", written in the
 * ports/adapters style ADR-006 requires. Deliberately expressed in Tovu's own
 * vocabulary so core never names a Jini type — the Jini adapter sits behind it.
 *
 * The event union here is the part @jini-ai/agent-runtime does NOT give us:
 * its handler is typed `(event: Record<string, unknown>) => void`, so field
 * names are unchecked at the boundary. These types were derived by observing a
 * real run (see findings in the integration report) and are the seam where
 * Tovu regains type safety.
 */

export type AgentTurnEvent =
  | { type: 'status'; label: string; model?: string; sessionId?: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: unknown; isError: boolean }
  | { type: 'turn_end'; stopReason: string }
  | { type: 'usage'; usage: unknown; costUsd: number; durationMs: number; stopReason: string };

export interface AgentTurnRequest {
  prompt: string;
  workingDir: string;
  model?: string;
}

export interface AgentTurnResult {
  exitCode: number | null;
  text: string;
  toolCalls: { name: string; input: unknown }[];
  costUsd: number | null;
}

export interface AgentRunnerPort {
  listAvailableAgents(): Promise<{ id: string; version: string | null; available: boolean }[]>;
  runTurn(req: AgentTurnRequest, onEvent: (e: AgentTurnEvent) => void): Promise<AgentTurnResult>;
}
