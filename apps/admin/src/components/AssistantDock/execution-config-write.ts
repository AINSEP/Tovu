import type { Dispatch, SetStateAction } from "react";
import type { ChatPaneAgentSelection } from "@jini-ai/chat/react";
import type { ExecutionConfig } from "@jini-ai/ui";

import { EXECUTION_NAMESPACE, saveExecutionConfig } from "@/lib/execution-settings";
import { publishSettingsRefresh } from "@/lib/settings-refresh-bus";
import { isAbortError } from "@/lib/retry-unreachable";

/**
 * @file The dock pickers' one write path: apply a change to `executionConfig`, then save it — the
 * save OUTSIDE the state updater. The pickers used to call `saveExecutionConfig` inside their
 * `setExecutionConfig` updater, and StrictMode runs every updater twice, so each real pick wrote two
 * `setting_revisions` rows (2026-09-23).
 */

/** One applied change: the config it replaced and the one it produced. */
export interface ExecutionConfigWrite {
  previous: ExecutionConfig;
  next: ExecutionConfig;
}

/**
 * Applies `change` through `setExecutionConfig` and reports what it did, or `null` when `change`
 * returned `previous` unchanged (a re-pick of the active value: nothing to save).
 *
 * The updater only records its result, so running it twice is harmless. Reading that record right
 * after the call relies on `useExecutionConfig`'s `setExecutionConfig` running the updater
 * synchronously against the latest config (see its doc).
 */
export function applyExecutionConfigChange(
  setExecutionConfig: Dispatch<SetStateAction<ExecutionConfig>>,
  change: (previous: ExecutionConfig) => ExecutionConfig,
): ExecutionConfigWrite | null {
  let write: ExecutionConfigWrite | null = null;
  setExecutionConfig((previous) => {
    const next = change(previous);
    write = next === previous ? null : { previous, next };
    return next;
  });
  return write;
}

/**
 * Saves one applied change through the ADR-028 `saveExecutionConfig` chokepoint, then tells other
 * mounts (an open settings tab, another dock) to re-read. A failed save is logged, not thrown, and
 * the optimistic state is kept.
 *
 * @param failureLog - The `console.error` message for a failed save.
 */
export function persistExecutionConfigWrite(write: ExecutionConfigWrite, failureLog: string): void {
  void saveExecutionConfig(write.next, write.previous)
    .then(() => publishSettingsRefresh([EXECUTION_NAMESPACE]))
    .catch((error: unknown) => {
      if (isAbortError(error)) return;
      console.error(failureLog, error);
    });
}

/**
 * `previous` with the Local CLI pick applied: the picked agent, and its model as
 * `selection.model ?? ""` (not a conditional spread, so reverting to "default" persists the
 * reversion instead of leaving an earlier pick in the ledger).
 */
export function withLocalCliSelection(previous: ExecutionConfig, selection: ChatPaneAgentSelection): ExecutionConfig {
  const agentId = selection.agentId || null;
  return {
    ...previous,
    localCli: {
      agentId,
      modelByAgentId: agentId
        ? { ...previous.localCli.modelByAgentId, [agentId]: selection.model ?? "" }
        : previous.localCli.modelByAgentId,
    },
  };
}
