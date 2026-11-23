import { useCallback, useEffect, useRef, useState } from "react";
import { resolveChatPaneSelection, type ChatPaneAgentSelection } from "@jini-ai/chat/react";
import { type ExecutionConfig } from "@jini-ai/ui";

import { readAgentsSnapshot } from "@/lib/assistant-agents-snapshot";
import { isSelectionNormalizationEcho } from "@jini-ai/admin/shell/components/AssistantDock/local-cli-selection-echo";
import { applyExecutionConfigChange, persistExecutionConfigWrite, withLocalCliSelection, localCliSelectionFromConfig } from "../execution-config-write";

type LocalCliPickerState = {
  localCliSelectionRef: React.MutableRefObject<ChatPaneAgentSelection>;
  touchedRef: React.MutableRefObject<boolean>;
  pickGeneration: React.MutableRefObject<number>;
  syncedSelection: React.MutableRefObject<string | null>;
  normalizationRef: React.MutableRefObject<{ key: string | null; selection: ChatPaneAgentSelection } | null>;
  persistRef: React.MutableRefObject<typeof persistExecutionConfigWrite>;
  setLocalCliSelection: React.Dispatch<React.SetStateAction<ChatPaneAgentSelection>>;
};

function applyLocalCliPickerChange(
  { selection, state, setExecutionConfig }: {
    selection: ChatPaneAgentSelection;
    state: LocalCliPickerState;
    setExecutionConfig: React.Dispatch<React.SetStateAction<ExecutionConfig>>;
  },
  _options: Record<string, never> = {},
): void {
  const { localCliSelectionRef, touchedRef, pickGeneration, syncedSelection, normalizationRef, persistRef, setLocalCliSelection } = state;
  // `ChatPane` echoing its own default-model fill-in on mount: show it, but it is not a pick —
  // saving it re-wrote the ledger on every page load, and marking `touchedRef` blocked hydration.
  if (isSelectionNormalizationEcho({ current: localCliSelectionRef.current, incoming: selection, agents: readAgentsSnapshot(), resolveChatPaneSelection })) {
    normalizationRef.current = { key: syncedSelection.current, selection };
    localCliSelectionRef.current = selection;
    setLocalCliSelection(selection);
    return;
  }
  normalizationRef.current = null;
  touchedRef.current = true;
  pickGeneration.current += 1;
  const generation = pickGeneration.current;
  localCliSelectionRef.current = selection;
  setLocalCliSelection(selection);
  const write = applyExecutionConfigChange({ setExecutionConfig, change: (previous) => withLocalCliSelection({ previous, selection }) });
  if (write) {
    void persistRef.current({ write, failureLog: "[AssistantDock] failed to save Local CLI selection" }).then((saved) => {
      if (saved && generation === pickGeneration.current) touchedRef.current = false;
    });
  }
}

export interface UseLocalCliSelection {
  /** The Local CLI picker's current agent+model choice — fully controlled, fed straight into
   *  `<ChatPane selection={...}>` (see {@link AssistantDock}'s JSX). */
  localCliSelection: ChatPaneAgentSelection;
  handleLocalCliSelectionChange: (selection: ChatPaneAgentSelection) => void;
  /** Saved selection at dispatch time, preserving a pending/failed local pick. */
  readLocalCliSelectionForSend?: (config: ExecutionConfig) => ChatPaneAgentSelection;
}

/**
 * Owns the Local CLI picker's agent, model and reasoning as a fully controlled `ChatPane` selection,
 * persisted through the same ADR-028 `saveExecutionConfig` chokepoint `useByokRuntime`'s
 * `handleByokModelChange` already uses — so a pick here survives a reload the same way BYOK's
 * model and the mode switch already do (`executionConfig.localCli.agentId`/`.modelByAgentId`/
 * `.reasoningByAgentId`,
 * `execution-settings.ts`'s `loadExecutionConfig`/`selectedLocalCliModel` — real, persisted state
 * that nothing read the run-start path from until this hook existed, 2026-08-05).
 *
 * Split out of `AssistantDock` for the same reason `useByokRuntime` is: the synchronization and
 * write-back paths are directly assertable via `renderHook`, without mounting a full dock or a
 * real `ChatPane`.
 *
 * `ChatPane` accepts `selection`/`onSelectionChange` as a genuinely controlled pair (confirmed in
 * `@jini-ai/chat`'s `useChatPane.hooks.ts`: `requestedSelection = options.selection ?? internalSelection`,
 * and its `setSelection`/`AgentRuntimePicker`-driven change handler always calls
 * `options.onSelectionChange` even when controlled) — chosen over the dock's previously-hardcoded
 * `initialSelection` prop because that prop is read exactly once, inside `useChatPane`'s own
 * `useState` initializer, at `ChatPane`'s first mount. The ledger load is an async GET
 * (`loadExecutionConfig`'s `api.getSettingsEffective` call) that resolves AFTER that first
 * render — a value hydrated from it into `initialSelection` would arrive too late to ever take
 * effect without a synthetic remount. A fully controlled `selection` has no such one-shot window:
 * it is read on every render, so the transition from the hardcoded default to the hydrated value
 * flows straight through like any other prop update.
 *
 * @param input.executionConfig - The live execution config; only `.localCli` is read.
 * @param input.setExecutionConfig - The setter {@link useExecutionConfig} returns, so a pick made
 *   here writes back through the same state (and the same `localWriteRef` race guard)
 *   `useByokRuntime` already shares it with.
 * @param input.configLoaded - {@link UseExecutionConfig.configLoaded} — gates initial hydration
 *   until the first ledger GET settles. Later reads synchronize unless a local save is pending.
 * @returns `localCliSelection` (the controlled value) and `handleLocalCliSelectionChange`
 *   (`ChatPane`'s `onSelectionChange`).
 * @example
 * const { localCliSelection, handleLocalCliSelectionChange } =
 *   useLocalCliSelection({ executionConfig, setExecutionConfig, configLoaded });
 */
export function useLocalCliSelection(
  { executionConfig, setExecutionConfig, configLoaded }: {
    executionConfig: ExecutionConfig;
    setExecutionConfig: React.Dispatch<React.SetStateAction<ExecutionConfig>>;
    configLoaded: boolean;
  },
  { persistWrite = persistExecutionConfigWrite }: { persistWrite?: typeof persistExecutionConfigWrite } = {},
): UseLocalCliSelection {
  /**
   * Same hardcoded starting point the dock always used (`{ agentId: "claude" }`) before this hook
   * existed — now just the value shown for the brief window before the ledger's GET settles, or
   * permanently for an operator who has never picked anything.
   */
  const [localCliSelection, setLocalCliSelection] = useState<ChatPaneAgentSelection>({ agentId: "claude" });
  /** Read-fresh mirror of `localCliSelection` for {@link isSelectionNormalizationEcho} in the
   *  change handler below, which must compare against the value `ChatPane` was actually given. */
  const localCliSelectionRef = useRef(localCliSelection);
  localCliSelectionRef.current = localCliSelection;

  /**
   * `touchedRef` stops a ledger GET from silently overwriting a selection the operator already
   * picked with their own hand: the load and a fast pick have no ordering guarantee. Previously
   * `hydratedRef` also blocked every later ledger read. Refreshes must now synchronize saved picks,
   * so only a pending/failed local save stays protected; a successful save unlocks external sync.
   * `pickGeneration` ensures an older save's completion cannot unlock a newer, unsaved pick.
   */
  const touchedRef = useRef(false);
  const pickGeneration = useRef(0);
  const syncedSelection = useRef<string | null>(null);
  const normalizationRef = useRef<{ key: string | null; selection: ChatPaneAgentSelection } | null>(null);
  const persistRef = useRef(persistWrite);
  persistRef.current = persistWrite;

  const readLocalCliSelectionForSend = useCallback((config: ExecutionConfig) => {
    if (touchedRef.current) return localCliSelectionRef.current;
    const saved = localCliSelectionFromConfig({ config });
    // Keep ChatPane's default-model normalization when the saved axes haven't changed. It is
    // display/runtime state, not a ledger edit (see isSelectionNormalizationEcho below).
    const normalized = normalizationRef.current;
    return normalized && JSON.stringify(saved) === normalized.key ? normalized.selection : saved;
  }, []);

  useEffect(() => {
    if (!configLoaded || touchedRef.current) return;
    const selection = readLocalCliSelectionForSend(executionConfig);
    syncedSelection.current = JSON.stringify(localCliSelectionFromConfig({ config: executionConfig }));
    localCliSelectionRef.current = selection;
    setLocalCliSelection(selection);
  }, [configLoaded, executionConfig.localCli, readLocalCliSelectionForSend]);

  /**
   * `ChatPane`'s `onSelectionChange` — fires for an operator pick AND for `ChatPane`'s own
   * normalization of the value passed in (see {@link isSelectionNormalizationEcho}; only the pick is
   * saved). Updates the controlled value immediately, so the picker
   * reflects the pick without waiting on a round trip, and persists through the same ADR-028
   * chokepoint `handleByokModelChange` uses, so a Local CLI pick and a BYOK model pick can never
   * disagree about which write path is authoritative.
   * See {@link withLocalCliSelection} for the exact config change.
   */
  const handleLocalCliSelectionChange = useCallback((selection: ChatPaneAgentSelection) => {
    applyLocalCliPickerChange({
      selection, state: { localCliSelectionRef, touchedRef, pickGeneration, syncedSelection, normalizationRef, persistRef, setLocalCliSelection }, setExecutionConfig,
    });
  }, [setExecutionConfig]);

  return { localCliSelection, handleLocalCliSelectionChange, readLocalCliSelectionForSend };
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

