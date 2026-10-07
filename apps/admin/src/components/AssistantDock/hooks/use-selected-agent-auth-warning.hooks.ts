import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatPaneRuntimeAccess } from "@jini-ai/chat/react";
import type { DetectedAgent, ExecutionPort } from "@jini-ai/ui";
import { createExecutionPort } from "../../../lib/execution-settings";
import { selectedAgentWarning } from "../../../features/settings/ai-agent-presentation";

type AuthDetectionPort = Pick<ExecutionPort, "detectLocalAgents" | "rescanLocalAgents">;

/**
 * D-21(b): the dock's half of the Settings "AI agent" sign-in warning.
 *
 * The picker's own `/api/agents` inventory carries no authentication status, so this reads the same
 * detection Settings renders (`createExecutionPort`'s module-cached sweep — no extra process scan on
 * mount) and hands it to the already-tested `selectedAgentWarning`, which only warns on a CONFIRMED
 * missing sign-in, never on unknown, and never in BYOK mode.
 *
 * The returned `runtimeAccess` wraps the picker's Rescan so a sign-in done mid-session clears the
 * warning: the picker's own answer is returned untouched and unblocked, and the auth re-probe runs
 * beside it. A failed detection leaves no warning rather than inventing one.
 *
 * @param input.mode The persisted execution mode (`"local-cli"` | `"byok"`).
 * @param input.agentId The picker's selected agent; `useLocalCliSelection` already defaults it to Claude.
 * @param input.locale Admin locale for the warning copy.
 * @param input.runtimeAccess The picker's runtime access to wrap.
 * @param options.port Detection port; defaults to the shared Settings port.
 * @returns `{ warning, runtimeAccess }` — `warning` is null when nothing needs attention.
 * @complexity O(n) over the detected agents per settled scan.
 */
export function useSelectedAgentAuthWarning(
  { mode, agentId, locale, runtimeAccess }: {
    mode: string; agentId: string | null | undefined; locale: string; runtimeAccess: ChatPaneRuntimeAccess;
  },
  { port: injectedPort }: { port?: AuthDetectionPort } = {},
) {
  const [port] = useState<AuthDetectionPort>(() => injectedPort ?? createExecutionPort());
  const [agents, setAgents] = useState<readonly DetectedAgent[]>([]);
  const generation = useRef(0);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  const scanRef = useRef((request: () => Promise<readonly DetectedAgent[]>) => {
    const scan = ++generation.current;
    // Through a promise so a port that throws synchronously still lands in the no-warning branch.
    Promise.resolve().then(request).then(
      // A slow first detection must not overwrite a newer rescan's result.
      (next) => { if (live.current && scan === generation.current) setAgents(next); },
      () => { if (live.current && scan === generation.current) setAgents([]); },
    );
  });

  // Re-read on mode/agent change: cheap (module-cached), and Settings may have rescanned meanwhile.
  useEffect(() => {
    if (mode === "local-cli") scanRef.current(() => port.detectLocalAgents());
  }, [mode, agentId, port]);

  const wrappedAccess = useMemo<ChatPaneRuntimeAccess>(() => ({
    ...runtimeAccess,
    rescanAgents: () => {
      scanRef.current(() => port.rescanLocalAgents ? port.rescanLocalAgents() : port.detectLocalAgents());
      return runtimeAccess.rescanAgents();
    },
  }), [runtimeAccess, port]);

  return {
    warning: selectedAgentWarning({ mode, agentId: agentId ?? "claude", agents, locale }),
    runtimeAccess: wrappedAccess,
  };
}
