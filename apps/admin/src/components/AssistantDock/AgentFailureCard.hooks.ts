import { createContext, useContext, useMemo, useRef, useState } from "react";
import type { ChatMessage, ChatTransport } from "@jini-ai/chat/core";
import type { ChatPaneAgentSelection, ChatPaneRuntimeAccess } from "@jini-ai/chat/react";
import { extractAgentFailure, matchAgentFailureHint, projectAgentFailureMessage, redactAgentFailure,
  suggestedFailureAgent, withAgentFailureSurface, type AgentFailure, type FailureAgent } from "./agent-failure";
import { localFailureHints } from "./agent-failure-hints";

export interface FailureSurfaceActions {
  readonly agents: readonly FailureAgent[];
  readonly switchAgent: (agentId: string) => void;
}
export const FailureSurfaceContext = createContext<FailureSurfaceActions>({ agents: [], switchAgent: () => undefined });

/** Capture the same live inventory the picker loads, never trust its persisted placeholder. */
export function useAgentFailureSurface({ transport, runtimeAccess, initialMessages, onSelectionChange, onExecutionModeChange }: {
  transport: ChatTransport; runtimeAccess: ChatPaneRuntimeAccess; initialMessages: ChatMessage[] | undefined;
  onSelectionChange: (selection: ChatPaneAgentSelection) => void; onExecutionModeChange: (mode: "local" | "api") => void;
}, _optional = {}) {
  const [agents, setAgents] = useState<readonly FailureAgent[]>([]);
  const inventoryGeneration = useRef(0);
  const access = useMemo<ChatPaneRuntimeAccess>(() => {
    async function capture(load: () => Promise<readonly FailureAgent[]>) {
      const generation = ++inventoryGeneration.current;
      const inventory = await load();
      if (generation === inventoryGeneration.current) setAgents(inventory);
      return inventory;
    }
    return { ...runtimeAccess,
      listAgents: () => capture(() => runtimeAccess.listAgents()),
      rescanAgents: () => capture(() => runtimeAccess.rescanAgents()),
    };
  }, [runtimeAccess]);
  const projectedTransport = useMemo(() => withAgentFailureSurface({ transport }, {}), [transport]);
  const messages = useMemo(() => initialMessages?.map(message => projectAgentFailureMessage({ message }, {})), [initialMessages]);
  const actions = useMemo<FailureSurfaceActions>(() => ({ agents, switchAgent(agentId) {
    if (!agents.some(agent => agent.id === agentId && agent.available === true)) return;
    onExecutionModeChange("local");
    // An agent change resets its model/effort, matching the picker's selection path.
    onSelectionChange({ agentId });
  } }), [agents, onSelectionChange, onExecutionModeChange]);
  return { transport: projectedTransport, runtimeAccess: access, initialMessages: messages, actions };
}

function failureData(value: unknown): AgentFailure | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<AgentFailure>;
  if (typeof data.reason !== "string" || typeof data.details !== "string") return null;
  // The renderer is also a boundary: persisted extension data need not have used our transport.
  return extractAgentFailure({ events: [{ kind: "raw", line: data.details || data.reason }],
    ...(typeof data.agentId === "string" ? { agentId: data.agentId } : {}) }, {});
}

export function useAgentFailureCard({ events, runStreaming, runSucceeded }: {
  events: readonly unknown[]; runStreaming: boolean; runSucceeded: boolean;
}, _optional = {}) {
  const { agents, switchAgent } = useContext(FailureSurfaceContext);
  const failure = failureData(events[events.length - 1]);
  if (runStreaming || runSucceeded || !failure) return null;
  const declaredHints = agents.find(agent => agent.id === failure.agentId)?.failureHints ?? [];
  const hint = matchAgentFailureHint({ failure, hints: [...declaredHints, ...localFailureHints({ agentId: failure.agentId }, {})] }, {});
  const alternative = suggestedFailureAgent({ hint, agents }, {});
  return { ...failure, hint: hint ? redactAgentFailure({ text: hint.hint }, {}) : undefined,
    switchLabel: alternative ? `Switch to ${redactAgentFailure({ text: alternative.name }, {})}` : undefined,
    switchAgent: alternative ? () => switchAgent(alternative.id) : undefined };
}
