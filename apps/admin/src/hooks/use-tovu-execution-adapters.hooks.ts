import { useCallback, useRef } from 'react';
import type { ExecutionConfig } from '@jini-ai/ui';
import type { ChatPaneAgent, ChatPaneAgentSelection, ChatPaneRuntimeAccess } from '@jini-ai/chat/react';
import type { UseExecutionConfig } from '@/components/AssistantDock/hooks/AssistantDock.hooks';
import { DEFAULT_EXECUTION_CONFIG } from '@/lib/execution-settings';
import { effectiveExecutionConfig } from '@/lib/tovu-execution-policy';
import { useTovuExecutionPolicy } from './use-tovu-execution-policy.hooks';

/** Adapters keep the CMS's saved slice separate from the effective UI mode. */
export function useTovuSettingsExecution(
  { config, onChange, locale }: { config: ExecutionConfig | null; onChange: (next: ExecutionConfig) => void; locale: string },
  { usePolicy = useTovuExecutionPolicy }: { usePolicy?: typeof useTovuExecutionPolicy } = {},
) {
  const policy = usePolicy({ config: config ?? DEFAULT_EXECUTION_CONFIG, locale });
  return {
    ...policy,
    onConfigChange: (next: ExecutionConfig) => onChange(policy.preserveChange(next)),
    unavailableReason: policy.allowed ? undefined : 'BYOK',
  };
}

const NO_LOCAL_AGENTS: readonly ChatPaneAgent[] = [];
const NO_LOCAL_RUNTIME: ChatPaneRuntimeAccess = {
  listAgents: async () => NO_LOCAL_AGENTS,
  rescanAgents: async () => NO_LOCAL_AGENTS,
  daemonOnline: async () => false,
};

/** Preserve the ledger controller; only its read model and unusable picker actions are projected.
 * The transport receives the effective ref, so a saved CLI cannot route a deployed turn to a daemon.
 * BYOK model writes still use the original setter, which retains saved mode and CLI configuration. */
export function useTovuDockExecution(
  { controller, locale }: { controller: UseExecutionConfig; locale: string },
  { usePolicy = useTovuExecutionPolicy }: { usePolicy?: typeof useTovuExecutionPolicy } = {},
) {
  const policy = usePolicy({ config: controller.executionConfig, locale });
  const effectiveRef = useRef(policy.config);
  effectiveRef.current = policy.config;
  const live = useRef({ controller, policy });
  live.current = { controller, policy };
  const readExecutionConfigForSend = useCallback(async () => {
    // A send during discovery must wait, otherwise local dev could wrongly use the pending BYOK
    // projection. Read directly from the settled promise rather than waiting for a React render.
    const allowed = await live.current.policy.readAllowedForSend();
    const { controller: source } = live.current;
    const saved = source.readExecutionConfigForSend
      ? await source.readExecutionConfigForSend() : source.executionConfigRef.current;
    const effective = effectiveExecutionConfig({ config: saved, allowed });
    effectiveRef.current = effective;
    return effective;
  }, []);
  const handleExecutionModeChange = useCallback((mode: 'local' | 'api') => {
    // There is no mode choice on deployed sites. Even an old failure-card callback must not
    // persist the effective BYOK fallback over the operator's saved Local CLI preference.
    if (live.current.policy.allowed) live.current.controller.handleExecutionModeChange(mode);
  }, []);
  return {
    ...controller,
    ...policy,
    executionConfig: policy.config,
    executionConfigRef: effectiveRef,
    readExecutionConfigForSend,
    handleExecutionModeChange,
    runtimeAccess: (port: ChatPaneRuntimeAccess) => policy.allowed ? port : NO_LOCAL_RUNTIME,
    agents: (agents: readonly ChatPaneAgent[] | undefined) => policy.allowed ? agents : NO_LOCAL_AGENTS,
    selectionChange: (change: (selection: ChatPaneAgentSelection) => void) =>
      (selection: ChatPaneAgentSelection) => { if (live.current.policy.allowed) change(selection); },
  };
}
