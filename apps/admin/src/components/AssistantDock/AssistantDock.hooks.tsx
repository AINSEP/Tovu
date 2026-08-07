import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatPaneAgentSelection } from "@jini-ai/chat/react";
import { isTerminalRunStatus, type ChatMessage } from "@jini-ai/chat/core";
import { DEFAULT_PROVIDER_PRESETS, resolveSelectedPreset, type ExecutionConfig } from "@jini-ai/ui";

import { publishSettingsRefresh } from "../../lib/settings-refresh-bus";
import {
  DEFAULT_EXECUTION_CONFIG,
  EXECUTION_NAMESPACE,
  createExecutionPort,
  loadAdminExecutionCredential,
  loadExecutionConfig,
  saveExecutionConfig,
  selectedLocalCliModel,
} from "../../lib/execution-settings";

/**
 * @file `AssistantDock`'s state/effects layer, split out of `AssistantDock.tsx` (2026-08-06
 * extraction) so each hook's failure/race paths — a rejected config load, a discovery failure, a
 * mode-switch or model-pick write-back racing a late-resolving GET — are directly assertable with
 * `renderHook` against a mocked `execution-settings.ts`, rather than only reachable indirectly
 * through a full dock mount. Same split rationale as Jini's `ConfirmDialog.hooks.tsx`: the JSX in
 * `AssistantDock.tsx` stays a thin render of whatever these hooks return.
 *
 * `shouldPublishOnMessagesChange` and `resolveRunContext` below are not hooks — they are the pure
 * decision/derivation halves of two of `AssistantDock`'s own callbacks (`handleMessagesChange`'s
 * settings-refresh dedup, and the per-run `runContext` builder), pulled out for the same
 * directly-assertable-without-mounting reason. Each function's own doc comment explains why it, in
 * particular, is shaped this way; see `AssistantDock.tsx` for how each one is actually wired in.
 *
 * Unlike `AssistantDock`'s own `useChats` prop, none of the three hooks below is exposed as an
 * injectable seam on `AssistantDockProps` — they are consumed directly, the same way they were
 * before this split. Nothing in this brief called for adding new seams here, and the existing
 * component test already exercises the config-load/discovery/mode-switch/model-pick paths through
 * `renderHook` against these exports directly, which is the same coverage a seam would buy.
 */

export interface UseExecutionConfig {
  executionConfig: ExecutionConfig;
  /** Same object as `executionConfig`, mirrored into a ref — see the field's own doc below for why. */
  executionConfigRef: React.MutableRefObject<ExecutionConfig>;
  setExecutionConfig: React.Dispatch<React.SetStateAction<ExecutionConfig>>;
  handleExecutionModeChange: (mode: "local" | "api") => void;
  /**
   * Whether this admin has a BYOK credential saved server-side (2026-08-05) — `null` until the
   * initial GET settles, then `true`/`false`. See {@link AssistantDock}'s `apiModeAvailable` for why
   * this exists: `executionConfig.byok.apiKey` alone is no longer enough to answer "is BYOK
   * usable", because the key is write-only and empty on every fresh load even when one is stored.
   */
  hasStoredAdminKey: boolean | null;
  /**
   * True once the initial ledger GET (`loadExecutionConfig()`) has settled — resolved OR
   * rejected — false only during that first in-flight load. Added (2026-08-05) for
   * {@link useLocalCliSelection}'s one-time hydration: `executionConfig.localCli.agentId` starts
   * `null` in `DEFAULT_EXECUTION_CONFIG`, and a load that resolves to "nothing was ever saved"
   * ALSO leaves it `null` — those two states are indistinguishable from `executionConfig` alone,
   * so a separate "has the GET settled at all" signal is what lets that hook's hydration effect
   * fire exactly once instead of never (waiting on a non-null `agentId` that may never arrive) or
   * too early (before the load has had any chance to run).
   */
  configLoaded: boolean;
}

/**
 * Owns the runtime picker's Local CLI / API · BYOK state (ADR-049's picker, 2026-08-04 wiring) and
 * the mode-switch write-back. Split out of `AssistantDock` so the config-load failure path (the
 * `.catch()` below) and the mode-switch persistence path can be driven directly with `renderHook`
 * against a mocked `execution-settings.ts`, rather than only indirectly through a full dock mount.
 *
 * @returns `executionConfig` (the live value), `executionConfigRef` (read-fresh mirror for
 *   consumers that must not capture a stale closure), `setExecutionConfig`, and
 *   `handleExecutionModeChange` (persists a mode switch back through the ADR-028 chokepoint).
 * @example
 * const { executionConfig, handleExecutionModeChange } = useExecutionConfig();
 */
export function useExecutionConfig(): UseExecutionConfig {
  /**
   * Loaded once from `execution-settings.ts`'s ledger+localStorage-backed store — the SAME source
   * the Execution-mode settings tab reads/writes — so a mode chosen there is reflected here without
   * a page reload, and a mode picked directly from this dock persists back the same way.
   *
   * Held in a ref (kept in sync below) rather than read directly by the memoized `transport`: the
   * transport is built once (see its own comment) and reads this via `getExecutionConfig()` on every
   * `startRun` call, so a mode change mid-session takes effect on the NEXT message without forcing a
   * new transport instance — the same "read fresh, don't capture" pattern `runContext`'s
   * `frontendBindToken` already uses a few lines down.
   */
  const [executionConfig, setExecutionConfigState] = useState<ExecutionConfig>(DEFAULT_EXECUTION_CONFIG);
  const executionConfigRef = useRef(executionConfig);
  executionConfigRef.current = executionConfig;

  /**
   * True once THIS mount has made its own local write — a mode switch from
   * `handleExecutionModeChange` below, or (through the wrapped `setExecutionConfig` this hook
   * exposes) a BYOK model pick from `useByokRuntime`'s `handleByokModelChange`. Guards the
   * mount-load effect just below: without it, an operator who switches modes before the initial
   * `loadExecutionConfig()` resolves would see the switch silently revert. The load starts on
   * mount and reads whatever the server held BEFORE the switch's own `saveExecutionConfig` call;
   * if it resolves after the switch (a real race — both are ordinary network calls with no
   * ordering guarantee), applying it unconditionally overwrites the operator's just-made,
   * already-persisted choice with the stale pre-switch value. That leaves the UI showing a
   * different mode than the server holds — exactly the disagreement
   * `handleExecutionModeChange`'s own doc comment says the ADR-028 chokepoint exists to prevent.
   *
   * A ref, not state: flipping it must not itself trigger a render, and it needs to be readable
   * synchronously inside the functional `setExecutionConfigState` updater below.
   */
  const localWriteRef = useRef(false);

  /** Backs {@link UseExecutionConfig.configLoaded} — see that field's own doc. */
  const [configLoaded, setConfigLoaded] = useState(false);

  /**
   * The `Dispatch` this hook exposes — to its own `handleExecutionModeChange` below, and to
   * `useByokRuntime`'s `handleByokModelChange` (passed `executionConfig`/`setExecutionConfig` as
   * an input pair). Wraps the raw state setter so any update that actually changes the value
   * marks {@link localWriteRef}.
   *
   * Relies on the "return `previous` unchanged to bail out" convention every updater passed
   * through here already follows (`handleExecutionModeChange`'s and `handleByokModelChange`'s own
   * `if (previous.… === next) return previous;` guards) rather than re-deriving no-op-ness itself:
   * comparing the updater's result to `previous` by reference is enough to tell a genuine write
   * apart from a no-op, so an operator re-picking the mode/model already active does not
   * permanently block a legitimate mount-load from applying.
   *
   * Note: React 18 Strict Mode invokes a functional state updater twice to surface impure
   * updaters. Setting a boolean ref to `true` twice is idempotent, so that double-invoke is safe
   * here — it would only matter if the ref were toggled off anywhere, which it never is.
   */
  const setExecutionConfig = useCallback<React.Dispatch<React.SetStateAction<ExecutionConfig>>>((action) => {
    setExecutionConfigState((previous) => {
      const next = typeof action === "function"
        ? (action as (current: ExecutionConfig) => ExecutionConfig)(previous)
        : action;
      if (next !== previous) localWriteRef.current = true;
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadExecutionConfig()
      .then((config) => {
        // Goes through the raw setter, not the wrapped `setExecutionConfig` above: applying a
        // load must never itself count as a "local write" (see `localWriteRef`'s doc) — only an
        // operator action should. Skipped once a local write has landed — see that doc for why.
        if (!cancelled && !localWriteRef.current) setExecutionConfigState(config);
      })
      // The dock is mounted on EVERY admin route, so an unhandled rejection here is not a
      // localized failure — it fires on any page load where the settings read fails (server
      // down, a 5xx, a body without `data`). `DEFAULT_EXECUTION_CONFIG` is already this
      // state's initial value, so swallowing to a log leaves the picker on Local CLI rather
      // than blanking the dock. Same shape as `handleExecutionModeChange`'s save catch below.
      .catch((error: unknown) => {
        console.error("[AssistantDock] failed to load execution config", error);
      })
      // Runs regardless of resolve/reject — `configLoaded` means "the GET settled", not "it
      // succeeded"; a failed load still leaves `useLocalCliSelection` free to hydrate off
      // whatever `executionConfig` ends up holding (the `DEFAULT_EXECUTION_CONFIG` this state
      // already initialized to) rather than waiting forever for a load that already gave up.
      .finally(() => {
        if (!cancelled) setConfigLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Whether a BYOK credential is stored server-side for this admin — see {@link UseExecutionConfig.hasStoredAdminKey}'s
   * own doc for why `apiModeAvailable` cannot be answered from `executionConfig.byok.apiKey` alone
   * any more. Read-only and independent of the ledger load above: a failed GET here leaves this
   * `null`/`false` (picker reads as "not configured"), which is the same fail-soft posture the
   * ledger load's own `.catch` takes — never blocks the dock, only degrades one affordance.
   */
  const [hasStoredAdminKey, setHasStoredAdminKey] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadAdminExecutionCredential()
      .then((view) => {
        if (!cancelled) setHasStoredAdminKey(view.isSet);
      })
      .catch((error: unknown) => {
        console.error("[AssistantDock] failed to load stored BYOK credential state", error);
        if (!cancelled) setHasStoredAdminKey(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Persists a mode switch made from THIS dock's own picker back through the same
   * `saveExecutionConfig` chokepoint the Execution-mode settings tab uses (ADR-028's single write
   * chokepoint), so the two surfaces can never disagree about which mode is active. Functional
   * `setExecutionConfig` update (not `executionConfigRef.current`) to avoid a stale-closure write
   * racing a config the settings tab saved in another tab in the same instant.
   */
  const handleExecutionModeChange = useCallback((mode: "local" | "api") => {
    const nextMode: ExecutionConfig["mode"] = mode === "api" ? "byok" : "local-cli";
    setExecutionConfig((previous) => {
      if (previous.mode === nextMode) return previous;
      const next: ExecutionConfig = { ...previous, mode: nextMode };
      void saveExecutionConfig(next, previous).catch((error: unknown) => {
        console.error("[AssistantDock] failed to save execution mode", error);
      });
      return next;
    });
  }, []);

  return {
    executionConfig,
    executionConfigRef,
    setExecutionConfig,
    handleExecutionModeChange,
    hasStoredAdminKey,
    configLoaded,
  };
}

export interface UseByokRuntime {
  byokRuntime: {
    providerLabel?: string;
    iconId?: string;
    model: string;
    models: readonly { id: string; label: string }[];
  };
  handleByokModelChange: (model: string) => void;
}

/**
 * Owns the BYOK model-discovery state and the composer's write-back for a model chosen there. Split
 * out of `AssistantDock` so the discovery-failure path (models stay empty rather than throwing into
 * the composer) is directly assertable via `renderHook`.
 *
 * @param input.executionConfig - The live execution config; only `executionConfig.byok` and
 *   `executionConfig.mode` are read.
 * @param input.setExecutionConfig - The setter {@link useExecutionConfig} returns, so a model
 *   picked here writes back through the same state.
 * @returns `byokRuntime` (provider identity, model, and discovered options for the picker) and
 *   `handleByokModelChange`.
 * @example
 * const { byokRuntime, handleByokModelChange } = useByokRuntime({ executionConfig, setExecutionConfig });
 */
export function useByokRuntime(
  {
    executionConfig,
    setExecutionConfig,
  }: {
    executionConfig: ExecutionConfig;
    setExecutionConfig: React.Dispatch<React.SetStateAction<ExecutionConfig>>;
  },
): UseByokRuntime {
  /**
   * Models the saved BYOK credential can actually run — the same list `features/ai-assistant/AiAssistant.tsx`'s
   * and `features/settings/SettingsUi.tsx`'s Model fields show, discovered through the same
   * `createExecutionPort().listModels` call.
   *
   * Discovered here rather than passed down because the dock outlives any settings screen: a
   * picker whose options only existed while the settings tab was open would be empty in the case
   * that matters. Empty on failure, which downgrades the picker's model row to read-only text
   * rather than offering an empty dropdown.
   *
   * SAFE with respect to the keystroke-leak finding
   * (`ADS-memory/reports/findings/2026-08-04-byok-discovery-keystroke-key-leak.md`): the endpoint
   * here comes from SAVED config, which an operator committed with an explicit Save, never from a
   * field being typed into. There is no partial-hostname state for this effect to walk.
   */
  const executionPort = useRef(createExecutionPort());
  const [byokModels, setByokModels] = useState<readonly { id: string; label: string }[]>([]);
  const { apiKey: byokApiKey, baseUrl: byokBaseUrl, protocol: byokProtocol } = executionConfig.byok;

  useEffect(() => {
    if (executionConfig.mode !== "byok" || !byokApiKey.trim()) {
      setByokModels([]);
      return;
    }
    let cancelled = false;
    executionPort.current
      .listModels?.(executionConfig.byok)
      .then((models) => {
        if (!cancelled) setByokModels(models.map((id) => ({ id, label: id })));
      })
      // Silent: a failed discovery must not put an error in a chat composer. The visible
      // consequence is only that the model row stays a plain value instead of a picker.
      .catch(() => {
        if (!cancelled) setByokModels([]);
      });
    return () => {
      cancelled = true;
    };
    // Keyed on the credential and endpoint only — editing `model` must not re-ask the provider
    // which models exist, and would loop against the write-back below if it did.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionConfig.mode, byokApiKey, byokBaseUrl, byokProtocol]);

  /**
   * The provider identity, model, and option list the runtime picker shows while BYOK is active.
   *
   * `resolveSelectedPreset` rather than a protocol-to-name map: the same protocol backs several
   * presets (OpenRouter and Ollama are both `openai`-protocol gateways), so keying off `protocol`
   * alone would label a gateway with the wrong vendor's name. A hand-typed custom endpoint matches
   * no preset and correctly yields no label and no icon, which the picker renders as a generic mode
   * name and glyph rather than inventing a vendor.
   */
  const byokRuntime = useMemo(
    () => {
      const preset = resolveSelectedPreset(DEFAULT_PROVIDER_PRESETS, executionConfig.byok);
      const iconId = preset ? BYOK_PRESET_ICON_IDS[preset.id] : undefined;
      return {
        ...(preset ? { providerLabel: preset.title } : {}),
        ...(iconId ? { iconId } : {}),
        model: executionConfig.byok.model,
        models: byokModels,
      };
    },
    [executionConfig.byok, byokModels],
  );

  /**
   * Write-back for a model chosen in the composer's picker — the "stay in sync" half.
   *
   * Goes through `saveExecutionConfig`, the same ADR-028 chokepoint the settings screens and
   * {@link useExecutionConfig}'s `handleExecutionModeChange` use, so the composer and both settings
   * surfaces are three views of one stored value rather than three copies of it. `publishSettingsRefresh`
   * then tells an already-open settings tab to re-read, which is what stops it from sitting on the
   * model the operator just changed. Namespace-scoped so unrelated slices do not refetch.
   *
   * Functional update for the same stale-closure reason `handleExecutionModeChange` documents.
   */
  const handleByokModelChange = useCallback(
    (model: string) => {
      setExecutionConfig((previous) => {
        if (previous.byok.model === model) return previous;
        const next: ExecutionConfig = { ...previous, byok: { ...previous.byok, model } };
        void saveExecutionConfig(next, previous)
          .then(() => publishSettingsRefresh([EXECUTION_NAMESPACE]))
          .catch((error: unknown) => {
            console.error("[AssistantDock] failed to save BYOK model", error);
          });
        return next;
      });
    },
    [setExecutionConfig],
  );

  return { byokRuntime, handleByokModelChange };
}

/**
 * Brand mark for a BYOK provider, keyed by `ProviderPreset.id`, resolved against the artwork this
 * host actually ships in `src/public/agent-icons/`.
 *
 * Maps to CLI-agent icon ids because that is the asset set `AgentIcon` reads and the marks are the
 * vendors' own — `gemini.svg` is Google's logo whether a Gemini CLI or a Gemini API key is what
 * runs. A preset absent from this table (Azure OpenAI, OpenRouter, Ollama — no artwork on disk)
 * deliberately yields nothing, and the picker shows a generic API glyph. That is honest; pointing
 * `AgentIcon` at an id with no file would render a broken image or an unrelated initial-letter
 * badge, and inventing a nearby vendor's logo would be worse than showing none.
 *
 * Lives here, next to `useByokRuntime` (its only consumer), rather than in `AssistantDock.tsx`
 * where it previously sat — that component file no longer touches provider-icon resolution at all
 * once this hook owns it.
 */
const BYOK_PRESET_ICON_IDS: Readonly<Record<string, string>> = {
  anthropic: "claude",
  openai: "codex",
  "google-gemini": "gemini",
};

export interface UseLocalCliSelection {
  /** The Local CLI picker's current agent+model choice — fully controlled, fed straight into
   *  `<ChatPane selection={...}>` (see {@link AssistantDock}'s JSX). */
  localCliSelection: ChatPaneAgentSelection;
  handleLocalCliSelectionChange: (selection: ChatPaneAgentSelection) => void;
}

/**
 * Owns the Local CLI picker's agent+model choice as a fully controlled `ChatPane` selection,
 * persisted through the same ADR-028 `saveExecutionConfig` chokepoint `useByokRuntime`'s
 * `handleByokModelChange` already uses — so a pick here survives a reload the same way BYOK's
 * model and the mode switch already do (`executionConfig.localCli.agentId`/`.modelByAgentId`,
 * `execution-settings.ts`'s `loadExecutionConfig`/`selectedLocalCliModel` — real, persisted state
 * that nothing read the run-start path from until this hook existed, 2026-08-05).
 *
 * Split out of `AssistantDock` for the same reason `useByokRuntime` is: the hydration-once and
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
 * @param input.configLoaded - {@link UseExecutionConfig.configLoaded} — gates the one-time
 *   hydration below so it fires exactly once, after the ledger's first GET has settled, never
 *   before and never twice.
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
): UseLocalCliSelection {
  /**
   * Same hardcoded starting point the dock always used (`{ agentId: "claude" }`) before this hook
   * existed — now just the value shown for the brief window before the ledger's GET settles, or
   * permanently for an operator who has never picked anything.
   */
  const [localCliSelection, setLocalCliSelection] = useState<ChatPaneAgentSelection>({ agentId: "claude" });

  /**
   * Guards the one-time hydration effect below against the same two races `useExecutionConfig`'s
   * own `localWriteRef` documents for `executionConfig` itself: `hydratedRef` stops it from
   * re-applying on every later `executionConfig` change (it must apply the ledger's value at most
   * once, not resync on an unrelated BYOK/mode write); `touchedRef` stops it from silently
   * overwriting a selection the operator already picked with their own hand before the ledger's
   * GET happened to resolve — the load and a fast first pick are both in-flight/interactive with
   * no ordering guarantee between them.
   */
  const hydratedRef = useRef(false);
  const touchedRef = useRef(false);

  useEffect(() => {
    if (!configLoaded || hydratedRef.current || touchedRef.current) return;
    hydratedRef.current = true;
    const agentId = executionConfig.localCli.agentId ?? "claude";
    const model = selectedLocalCliModel(executionConfig);
    setLocalCliSelection({ agentId, ...(model ? { model } : {}) });
  }, [configLoaded, executionConfig]);

  /**
   * `ChatPane`'s `onSelectionChange` — fires only for a genuine change (`useChatPane`'s own dedup,
   * see this hook's own doc above). Updates the controlled value immediately, so the picker
   * reflects the pick without waiting on a round trip, and persists through the same ADR-028
   * chokepoint `handleByokModelChange` uses, so a Local CLI pick and a BYOK model pick can never
   * disagree about which write path is authoritative.
   *
   * Writes `selection.model ?? ""` for the picked agent specifically (not a conditional spread)
   * so reverting a model choice back to "default" persists that reversion — an omitted key would
   * leave a stale non-default value from an earlier pick sitting in the ledger for this agent,
   * silently un-reverting on the next reload.
   */
  const handleLocalCliSelectionChange = useCallback((selection: ChatPaneAgentSelection) => {
    touchedRef.current = true;
    setLocalCliSelection(selection);
    setExecutionConfig((previous) => {
      const nextAgentId = selection.agentId || null;
      const next: ExecutionConfig = {
        ...previous,
        localCli: {
          agentId: nextAgentId,
          modelByAgentId: nextAgentId
            ? { ...previous.localCli.modelByAgentId, [nextAgentId]: selection.model ?? "" }
            : previous.localCli.modelByAgentId,
        },
      };
      void saveExecutionConfig(next, previous)
        .then(() => publishSettingsRefresh([EXECUTION_NAMESPACE]))
        .catch((error: unknown) => {
          console.error("[AssistantDock] failed to save Local CLI selection", error);
        });
      return next;
    });
  }, [setExecutionConfig]);

  return { localCliSelection, handleLocalCliSelectionChange };
}

/**
 * Whether a completed run's messages-change delta should trigger `publishSettingsRefresh()`, and
 * what the next `settledRunMessageId` marker should be. Pulled out of `handleMessagesChange` so the
 * "fire once per finished run, not once per streaming delta" dedup logic is directly assertable
 * without a live `ChatPane`.
 *
 * Deliberately triggered by RUN COMPLETION rather than by inspecting the transcript for a settings
 * tool call. Matching tool names here would put a list of them in the admin shell, where it would
 * fall out of date the first time the catalog grows — and the whole cost of being wrong is a few
 * sub-millisecond SQLite reads per run. Ignorance is cheaper than coupling.
 *
 * @param input.messages - The full transcript as of this `onMessagesChange` event.
 * @param input.settledRunMessageId - The last message id already published for, or `null`.
 * @returns `publish` (whether to call `publishSettingsRefresh()` now) and `nextSettledRunMessageId`
 *   (what the caller's ref should hold next — unchanged when `publish` is `false`).
 * @example
 * const { publish, nextSettledRunMessageId } = shouldPublishOnMessagesChange({
 *   messages,
 *   settledRunMessageId: settledRunMessageId.current,
 * });
 */
export function shouldPublishOnMessagesChange(
  { messages, settledRunMessageId }: { messages: ChatMessage[]; settledRunMessageId: string | null },
): { publish: boolean; nextSettledRunMessageId: string | null } {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") {
    return { publish: false, nextSettledRunMessageId: settledRunMessageId };
  }
  if (!isTerminalRunStatus(last.runStatus) || settledRunMessageId === last.id) {
    return { publish: false, nextSettledRunMessageId: settledRunMessageId };
  }
  return { publish: true, nextSettledRunMessageId: last.id };
}

/**
 * Builds the per-call run context the daemon reads `frontendBindToken`/`model` out of
 * (`assistant-transport.ts`'s `contextRef` wiring). Omits each key entirely when absent, rather
 * than sending it as `undefined` or an empty string, matching the daemon's own "absent means
 * default" contract for both fields.
 *
 * `model` is forwarded opaque and unfiltered — including the `'default'` sentinel
 * (`DEFAULT_MODEL_OPTION.id`, `@jini-ai/agent-runtime`) that `ChatPane`'s own selection resolution
 * falls back to when nothing else is picked. Every agent def's `buildArgs` (and
 * `resolveModelForAgent`) already treats `'default'`/absent identically as "omit `--model`, defer
 * to the CLI's own config" — that is the one place this decision is made; duplicating the check
 * here would only be a second copy of it to keep in sync.
 *
 * @param input.bindToken - The current tab's page-control bind token, or `undefined` if unbound.
 * @param input.model - The Local CLI picker's live model selection, or `undefined` before a
 *   selection has resolved (e.g. no agents detected yet).
 * @returns The context object to merge into a run's `contextRef`.
 * @example
 * const context = resolveRunContext({ bindToken: agentBridge?.bindToken(), model: selection.model });
 */
export function resolveRunContext(
  { bindToken, model }: { bindToken: string | undefined; model?: string },
): { frontendBindToken?: string; model?: string } {
  return {
    ...(bindToken === undefined ? {} : { frontendBindToken: bindToken }),
    ...(typeof model === "string" && model.length > 0 ? { model } : {}),
  };
}
