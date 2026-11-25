import { useCallback } from "react";
import { resolveChatPaneSelection } from "@jini-ai/chat/react";
import type { ExecutionConfig } from "@jini-ai/core/contracts/execution";
import { useLocalCliSelection as useAdminLocalCliSelection } from "@jini-ai/admin/shell/components/AssistantDock/hooks/local-cli-selection.hooks";
import type { UseLocalCliSelection } from "@jini-ai/admin/shell/components/AssistantDock/hooks/local-cli-selection.hooks";
import type { ExecutionWrite } from "@jini-ai/admin/shell/components/AssistantDock/hooks/execution-config.hooks";
import { readAgentsSnapshot } from "@/lib/shell-collaborators";
import { applyExecutionConfigChange, persistExecutionConfigWrite, withLocalCliSelection, localCliSelectionFromConfig } from "../execution-config-write";

export function useLocalCliSelection(
  { executionConfig, setExecutionConfig, configLoaded }: {
    executionConfig: ExecutionConfig;
    setExecutionConfig: React.Dispatch<React.SetStateAction<ExecutionConfig>>;
    configLoaded: boolean;
  },
  { persistWrite = persistExecutionConfigWrite }: { persistWrite?: typeof persistExecutionConfigWrite } = {},
): UseLocalCliSelection {
  const persistSelection = useCallback(({ write }: { write: ExecutionWrite }) =>
    persistWrite({ write, failureLog: "[AssistantDock] failed to save Local CLI selection" }), [persistWrite]);
  /**
   * Same hardcoded starting point the dock always used (`{ agentId: "claude" }`) before this hook
   * existed — now just the value shown for the brief window before the ledger's GET settles, or
   * permanently for an operator who has never picked anything.
   */
  return useAdminLocalCliSelection({
    executionConfig, setExecutionConfig, configLoaded, initialSelection: { agentId: "claude" },
    readAgentsSnapshot, resolveChatPaneSelection, readSavedSelection: localCliSelectionFromConfig,
    withSelection: withLocalCliSelection, applyChange: applyExecutionConfigChange, persistWrite: persistSelection,
  });
}

export function useLocalCliSelectionSeam(
  { override, input }: {
    override: typeof useLocalCliSelection | undefined;
    input: { executionConfig: ExecutionConfig; setExecutionConfig: React.Dispatch<React.SetStateAction<ExecutionConfig>>; configLoaded: boolean };
  },
  _options: Record<string, never> = {},
): UseLocalCliSelection {
  return (override ?? useLocalCliSelection)(input);
}

