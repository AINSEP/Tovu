import { useEffect, useMemo, useRef, useState } from 'react';
import type { DetectedAgent, ExecutionConfig, ExecutionPort } from '@jini-ai/ui';
import { createAgentPresentationPort, isDesktopAdmin, localCliScopeCopy, selectedAgentWarning } from '../ai-agent-presentation';

/** Observe the same detection that renders Settings cards, including rescans and selection changes. */
export function useAiAgentPresentation(
  { port, config, locale }: { port: ExecutionPort; config: ExecutionConfig | null; locale: string },
  { desktop = isDesktopAdmin({}) }: { desktop?: boolean } = {},
) {
  const [agents, setAgents] = useState<readonly DetectedAgent[]>([]);
  const live = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  const presentationPort = useMemo(() => createAgentPresentationPort({
    port,
    // Detection can finish after navigating away; no state should be written to an unmounted tab.
    onAgents: (next) => { if (live.current) setAgents((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next); },
  }), [port]);
  return {
    port: presentationPort,
    scopeCopy: localCliScopeCopy({ desktop }),
    // The dock's useLocalCliSelection defaults an unset ledger selection to Claude. Warn about
    // that same effective choice here, including a fresh desktop install with no saved agent id.
    warning: selectedAgentWarning({ mode: config?.mode ?? '', agentId: config?.localCli.agentId ?? 'claude', agents, locale }),
  };
}
