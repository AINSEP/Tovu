import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createDaemonAttachmentUploader,
  type ChatPaneAgent,
  type ChatPaneAgentSelection,
  type ChatPaneRuntimeAccess,
  type ComposerDiscoveryOutcome,
  type ComposerDiscoverySelection,
  type FrontendSessionBridge,
  type I18nAdapter,
} from "@jini-ai/chat/react";
import { isTerminalRunStatus, type ChatMessage } from "@jini-ai/chat/core";
import { DEFAULT_PROVIDER_PRESETS, resolveSelectedPreset, type ExecutionConfig } from "@jini-ai/ui";

import { navigate } from "@/lib/router";
import { publishSettingsRefresh, subscribeToSettingsRefresh } from "@/lib/settings-refresh-bus";
import { publishContentRefresh } from "@/lib/content-refresh-bus";
import { createTovuAssistantTransport } from "@/lib/assistant-transport";
import { isAgUiTransportEnabled } from "@/lib/assistant-transport-ag-ui";
import { useWiredAssistantChats, type UseAssistantChats } from "@/hooks/use-assistant-chats.hooks";
import { useWiredAdminLocale } from "@/hooks/use-admin-locale.hooks";
import {
  DEFAULT_EXECUTION_CONFIG,
  EXECUTION_NAMESPACE,
  createExecutionPort,
  loadAdminExecutionCredential,
  loadExecutionConfig,
  saveExecutionConfig,
  selectedLocalCliModel,
} from "@/lib/execution-settings";
import {
  createBundledComposerCapabilitySource,
  emptyComposerCapabilityProjection,
  projectComposerCapabilities,
  resolveTovuComposerDiscoveryRoute,
  type ComposerCapabilityProjection,
} from "@/features/plugins/composer-capabilities";
import { ASSISTANT_DOCK_DICT, createChatI18nAdapter } from "../assistant-dock-i18n";

/**
 * @file `AssistantDock`'s state/effects layer, split out of `AssistantDock.tsx` (2026-08-06
 * extraction) so each hook's failure/race paths — a rejected config load, a discovery failure, a
 * mode-switch or model-pick write-back racing a late-resolving GET — are directly assertable with
 * `renderHook` against a mocked `execution-settings.ts`, rather than only reachable indirectly
 * through a full dock mount. Same split rationale as Jini's `ConfirmDialog.hooks.tsx`: the JSX in
 * `AssistantDock.tsx` stays a thin render of whatever these hooks return.
 *
 * `shouldPublishOnMessagesChange`, `resolveRunContext`, and `resolveComposerDiscoveryOutcome`
 * below are not hooks — they are the pure decision/derivation halves of three of `AssistantDock`'s
 * own callbacks (`handleMessagesChange`'s settings-refresh dedup, the per-run `runContext` builder,
 * and the composer discovery selection resolver), pulled out for the same
 * directly-assertable-without-mounting reason. Each function's own doc comment explains why it, in
 * particular, is shaped this way; see `AssistantDock.tsx` for how each one is actually wired in.
 * `resolveComposerDiscoveryOutcome` has an external consumer outside this folder
 * (`features/plugins/__tests__/agent-plugin-capability-adapter.unit.test.ts`), so per `INFO.md`'s
 * Components rule 2 it is re-exported by name from `AssistantDock.tsx` rather than living here
 * `.hooks.tsx`-only.
 *
 * Per `INFO.md`'s Components rule 3 (any hook touching the DOM, browser APIs, or IO is an
 * injectable prop, defaulted to the real hook), seven hooks below are exposed as injectable seams
 * on `AssistantDockProps` — the original four (`useExecutionConfig`, `useByokRuntime`,
 * `useLocalCliSelection`, `useComposerCapabilities`) plus three added in the 2026-08-18
 * inline-hook-extraction pass (`useAssistantTransport`, `useAttachmentUploader`,
 * `useRuntimeAccess` — each wraps a real network/service call: `createTovuAssistantTransport`,
 * `createDaemonAttachmentUploader`, and `fetch`-backed `listAgents`/`rescanAgents`/`daemonOnline`
 * respectively) — alongside `AssistantDock`'s own pre-existing `useChats` prop; see
 * `AssistantDock.tsx` for the wiring. (An earlier revision of this comment claimed none of the
 * three was seamed, on the reasoning that nothing in that day's brief called for it. That was stale
 * the moment rule 3 was applied here — corrected rather than left to mislead the next reader.)
 * `useComposerCapabilities` (2026-08-14) was the last of `AssistantDock.tsx`'s own raw
 * `useState`/`useEffect` pairs, moved here for the same reason. The existing component
 * test still exercises the config-load/discovery/mode-switch/model-pick paths through `renderHook`
 * against these exports directly for the hooks' OWN behavior; the seams exist so
 * `AssistantDock.tsx`'s own markup/wiring tests can fake them instead of driving the real ones.
 *
 * The remaining hooks added in the 2026-08-18 pass — `useChatI18n`, `useComposerDiscoverySelect`,
 * `useMessagesChangeHandler`, `useRunContext` — are pure derivations/local state with no I/O of
 * their own (their dependencies, e.g. `chats`/`publishSettingsRefresh`, are already wired
 * elsewhere), so per the same rule-3 reading they stay plain exports with no injectable seam; see
 * each hook's own doc comment for why.
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
   *
   * Re-reads on {@link subscribeToSettingsRefresh}, not just on mount. This dock mounts once at the
   * app shell and never remounts for the session (`AssistantDock.tsx`'s own header comment), so
   * without this a key saved, rotated, or cleared from a settings screen's OWN
   * `useAdminExecutionCredential` (a different, independently-mounted copy of the same server row —
   * see that hook's "Cross-mount staleness" doc) would leave this picker showing "not configured" (or
   * a stale "configured") for the rest of the session, not just briefly.
   */
  const [hasStoredAdminKey, setHasStoredAdminKey] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void loadAdminExecutionCredential()
        .then((view) => {
          if (!cancelled) setHasStoredAdminKey(view.isSet);
        })
        .catch((error: unknown) => {
          console.error("[AssistantDock] failed to load stored BYOK credential state", error);
          if (!cancelled) setHasStoredAdminKey(false);
        });
    };
    refresh();
    const unsubscribe = subscribeToSettingsRefresh((scope) => {
      if (scope && !scope.includes(EXECUTION_NAMESPACE)) return;
      refresh();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  /**
   * Persists a mode switch made from THIS dock's own picker back through the same
   * `saveExecutionConfig` chokepoint the Execution-mode settings tab uses (ADR-028's single write
   * chokepoint), so the two surfaces can never disagree about which mode is active. Functional
   * `setExecutionConfig` update (not `executionConfigRef.current`) to avoid a stale-closure write
   * racing a config the settings tab saved in another tab in the same instant.
   *
   * `publishSettingsRefresh([EXECUTION_NAMESPACE])` on save success — same cross-mount staleness
   * fix `handleByokModelChange` below already applies to a model pick, now applied here too so an
   * already-open settings tab (or another `AssistantDock` mount) re-reads instead of sitting on the
   * mode the operator just changed away from.
   */
  const handleExecutionModeChange = useCallback((mode: "local" | "api") => {
    const nextMode: ExecutionConfig["mode"] = mode === "api" ? "byok" : "local-cli";
    setExecutionConfig((previous) => {
      if (previous.mode === nextMode) return previous;
      const next: ExecutionConfig = { ...previous, mode: nextMode };
      void saveExecutionConfig(next, previous)
        .then(() => publishSettingsRefresh([EXECUTION_NAMESPACE]))
        .catch((error: unknown) => {
          console.error("[AssistantDock] failed to save execution mode", error);
        });
      return next;
    });
    // `setExecutionConfig` added: it's a `useCallback([], ...)`-wrapped setter (itself stable for
    // the component's lifetime, see its own declaration above), so listing it is a no-op that only
    // satisfies the linter — Part 2 triage fix, not a suppression.
  }, [setExecutionConfig]);

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

  // Keyed on the credential and endpoint only — editing `model` must not re-ask the provider
  // which models exist, and would loop against the write-back below if it did.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on credential/endpoint only; listing `model` would loop against the write-back below.
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

export interface UseComposerCapabilities {
  /** The composer's discovery catalog — see {@link useComposerCapabilities}'s own doc for what
   *  feeds it and why it starts empty. */
  composerCapabilities: ComposerCapabilityProjection;
}

/**
 * Projects the composer's discovery catalog (debate 2, "Composer slash commands") from the bundled,
 * compile-time source, and owns the one-shot mount effect that resolves it. Split out of
 * `AssistantDock` (2026-08-14 DI migration pass) for the same reason the three hooks above it were:
 * per `INFO.md`'s Components rule 3, any hook doing DOM/IO work gets an injectable seam on
 * `AssistantDockProps`, defaulted to this real implementation — see `AssistantDock.tsx` for the
 * wiring.
 *
 * `createToolCatalogComposerCapabilitySource()` (`tool-catalog-composer-source.ts`) is deliberately
 * NOT in the source list below — owner decision, 2026-08-21: the menu's job is to let a user point
 * the assistant at a Skill or Agent Plugin whose instructions it should follow, not to hand it a raw
 * tool name (the assistant already picks its own tools once it understands the goal). The ~25 live
 * tool rows that source contributed were also structurally inert — every capability it produces
 * carries no `resolve` (see its own module doc), so selecting one did nothing. The file and its
 * tests are kept, not deleted: it is a working reference implementation of a live async source and
 * this is a product call that may be revisited, not a dead-code removal. See that file's own doc for
 * the full reasoning.
 *
 * Starts empty rather than pre-seeded: the whole point of `ComposerCapabilitySource.list()` being a
 * `Promise` is that a source may genuinely need a round trip — true for
 * `createBundledComposerCapabilitySource` only by construction (compile-time data wrapped in a
 * resolved `Promise`) today, but the seam stays real for whatever source is added next. This hook
 * makes no assumption that resolution is instant, and a failed projection (a future live source's
 * fetch failing, or a duplicate-id contract violation) falls back to the empty catalog rather than
 * throwing — same "the failure is contained" posture `AssistantDock.tsx`'s own `fetchAgents()` uses
 * for its own `!response.ok` branch.
 *
 * @returns `composerCapabilities` — the resolved projection, or the empty one before it settles.
 * @example
 * const { composerCapabilities } = useComposerCapabilities();
 */
export function useComposerCapabilities(): UseComposerCapabilities {
  const [composerCapabilities, setComposerCapabilities] = useState<ComposerCapabilityProjection>(
    emptyComposerCapabilityProjection,
  );

  useEffect(() => {
    let cancelled = false;
    projectComposerCapabilities([createBundledComposerCapabilitySource()])
      .then((projection) => {
        if (!cancelled) setComposerCapabilities(projection);
      })
      .catch((error: unknown) => {
        console.error("[AssistantDock] composer capability projection failed", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { composerCapabilities };
}

/**
 * Builds the `I18nAdapter` `AssistantDock.tsx` passes to `<JiniChatProvider i18n={...}>` — a thin
 * memoized wrapper around `createChatI18nAdapter` (`assistant-dock-i18n.ts`), which does the actual
 * dictionary lookup and is already independently tested there. Extracted (2026-08-18) purely to get
 * the `useMemo` call itself out of the component body — no I/O, no seam: `locale` is the only input
 * and `createChatI18nAdapter` is a pure function of it.
 *
 * @param locale - `useWiredAdminLocale()`'s current value.
 * @returns The memoized adapter, stable for as long as `locale` does not change.
 * @example
 * const chatI18n = useChatI18n(locale);
 */
export interface UseSelectedAgentPlugins {
  /** Every currently-pinned Agent Plugin ref, in pin order — see {@link addPluginRef}. */
  readonly selectedPluginRefIds: readonly string[];
  /**
   * Pins one plugin ref as a removable chip. Deduplicated by id: pinning an already-pinned ref is
   * a no-op (selecting the same composer row twice must not produce two chips), matching the
   * de-dup posture `composer.attachments` gets for free from `@jini-ai/chat`'s own upload batching.
   */
  readonly addPluginRef: (pluginRefId: string) => void;
  /** Unpins one plugin ref — the chip's own remove-button handler. Removing an id that is not
   *  currently pinned is also a no-op. */
  readonly removePluginRef: (pluginRefId: string) => void;
}

/**
 * Owns which Agent Plugins the operator has pinned onto the composer as removable chips
 * (`composer-capabilities.ts`'s `pluginRefId` field, resolved into this state by
 * `resolveComposerDiscoveryOutcome`'s `addPluginRef` dep). Host-owned state, not part of
 * `@jini-ai/chat`'s own `useComposer()` attachment tray: a pinned plugin ref is a Tovu concept the
 * package does not know about, the same "package owns mechanism, host owns taxonomy" boundary
 * `composer-capabilities.ts`'s module doc states for `kind`.
 *
 * Deliberately NOT cleared on send, unlike `composer.attachments` (which `useChatPane`'s own
 * `composer.reset()` clears every turn): a pinned plugin stays in front of the agent for every
 * later turn in the same conversation until the operator removes its chip. There is no send-time
 * hook this dock can observe to clear it automatically either — `ChatPane`'s `runContext` prop is
 * called and its result captured BEFORE `composer.reset()` runs (`useChatPane.hooks.ts`'s
 * `sendPrompt`), and `onDiscoverySelect` only fires on a discovery selection, never on send — so
 * "clear after the turn that used it" was never a reachable design without a new seam Jini does
 * not expose today. Sticky-until-removed is the simplest behavior consistent with what IS
 * reachable, and matches a plain reading of "pin a plugin, use it for a while, then remove it."
 *
 * @returns `selectedPluginRefIds` (for rendering the chip tray and feeding `useRunContext`) plus
 *   `addPluginRef`/`removePluginRef` (the chip tray's add/remove handlers).
 * @example
 * const { selectedPluginRefIds, addPluginRef, removePluginRef } = useSelectedAgentPlugins();
 */
export function useSelectedAgentPlugins(): UseSelectedAgentPlugins {
  const [selectedPluginRefIds, setSelectedPluginRefIds] = useState<readonly string[]>([]);

  const addPluginRef = useCallback((pluginRefId: string) => {
    setSelectedPluginRefIds((previous) =>
      previous.includes(pluginRefId) ? previous : [...previous, pluginRefId],
    );
  }, []);

  const removePluginRef = useCallback((pluginRefId: string) => {
    setSelectedPluginRefIds((previous) => previous.filter((id) => id !== pluginRefId));
  }, []);

  return { selectedPluginRefIds, addPluginRef, removePluginRef };
}

export function useChatI18n(locale: string): I18nAdapter {
  return useMemo(() => createChatI18nAdapter(locale), [locale]);
}

/**
 * Builds the `ChatTransport` `AssistantDock.tsx` passes to both `<JiniChatProvider>` and
 * `<ChatPane>` directly. Injectable per `INFO.md`'s Components rule 3 (real I/O: every `startRun`
 * this transport drives is a network call) — defaulted to the real hook on `AssistantDockProps`.
 *
 * The transport holds no per-render state; rebuilding it each render would drop in-flight runs —
 * that is why this stays a `useMemo` with an empty-shaped dependency list (`executionConfigRef` is
 * a ref object, stable for the component's lifetime, so including it does not defeat the memo).
 * `getExecutionConfig` reads `executionConfigRef.current` fresh on every call instead of closing
 * over `executionConfig` by value, so a mode change mid-session takes effect on the NEXT message
 * without forcing a new transport instance.
 *
 * @param input.executionConfigRef - {@link UseExecutionConfig.executionConfigRef} — read fresh
 *   inside `getExecutionConfig`, never captured by value.
 * @returns The memoized transport instance.
 * @example
 * const transport = useAssistantTransport({ executionConfigRef });
 */
export function useAssistantTransport(
  { executionConfigRef }: { executionConfigRef: React.MutableRefObject<ExecutionConfig> },
): ReturnType<typeof createTovuAssistantTransport> {
  return useMemo(
    () =>
      createTovuAssistantTransport({
        getExecutionConfig: () => executionConfigRef.current,
        // ADR-059's AG-UI canary — off by default, flipped per-tab via `localStorage` (see
        // `isAgUiTransportEnabled`'s own doc). Read fresh per `startRun` call, same as
        // `getExecutionConfig` above.
        getAgUiEnabled: isAgUiTransportEnabled,
      }),
    [executionConfigRef],
  );
}

/**
 * Builds the `uploadAttachments` callback `AssistantDock.tsx` passes to `<ChatPane>`. Injectable
 * per `INFO.md`'s Components rule 3 (real I/O: every upload is a `fetch` to the daemon's own
 * `/api/attachments` route) — defaulted to the real hook on `AssistantDockProps`.
 *
 * `''` baseUrl: `createDaemonAttachmentUploader` builds `${baseUrl}/api/attachments`, so an empty
 * string resolves to the same bare `/api/attachments` relative path `AGENTS_URL`/the rescan route
 * below already use — same-origin, proxied by `src/server/modules/assistant.ts` to the agent
 * daemon, matching every other request this dock makes. Memoized for the same reason the transport
 * is: it owns internal per-uploader batch-quota state (`create-daemon-attachment-uploader.ts`'s
 * `batchUsage` map), so rebuilding it on every render would silently reset a turn's running quota
 * mid-upload.
 *
 * @returns The memoized uploader instance.
 * @example
 * const uploadAttachments = useAttachmentUploader();
 */
export function useAttachmentUploader(): ReturnType<typeof createDaemonAttachmentUploader> {
  return useMemo(() => createDaemonAttachmentUploader(""), []);
}

/**
 * Mirrors `lib/api.ts`'s `DEFAULT_REQUEST_TIMEOUT_MS` (60s). `listAgents`/`rescanAgents`/
 * `daemonOnline` below bypass that shared `request()` seam entirely — `/api/agents` is not under
 * `request()`'s `/api/admin/v1` base path — so without their own bound they can hang forever under
 * the same per-origin connection-pool exhaustion `api.ts`'s own `REQUEST_TIMEOUT_CODE` doc
 * describes (every open admin tab keeps one `EventSource` connection open forever; see
 * `lib/settings-events.ts`).
 */
const AGENTS_URL = "/api/agents";
const AGENTS_FETCH_TIMEOUT_MS = 60_000;

async function fetchAgents(): Promise<ChatPaneAgent[]> {
  const response = await fetch(AGENTS_URL, {
    credentials: "same-origin",
    signal: AbortSignal.timeout(AGENTS_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return [];
  const { agents } = (await response.json()) as { agents: ChatPaneAgent[] };
  return agents;
}

/**
 * In-flight `daemonOnline()` call, shared module-wide so overlapping callers reuse it instead of
 * each starting their own fetch.
 *
 * `@jini-ai/chat/react`'s `useChatPaneRuntimeInventory` polls `daemonOnline` on a bare
 * `window.setInterval` every 5s for as long as a dock is mounted (effectively a whole tab's
 * lifetime), and its own de-dup (`useLatestOperation`) only ignores a STALE RESULT — it never
 * aborts the underlying fetch. Under connection-pool exhaustion, a `fetch` that queues forever
 * previously meant a brand new permanently-stuck request was added on every single tick, an
 * unbounded leak for as long as the tab stayed open (see
 * `ADS-memory/reports/2026-08-17-vite-proxy-pool-saturation-investigation.md`). Reusing one
 * in-flight promise caps that cost at one connection, the same fixed cost the settings-events SSE
 * already holds, instead of growing without bound.
 */
let daemonOnlineInFlight: Promise<boolean> | null = null;

async function daemonOnline(): Promise<boolean> {
  if (daemonOnlineInFlight) return daemonOnlineInFlight;
  const attempt = (async () => {
    const response = await fetch(AGENTS_URL, {
      credentials: "same-origin",
      signal: AbortSignal.timeout(AGENTS_FETCH_TIMEOUT_MS),
    });
    return response.ok;
  })();
  daemonOnlineInFlight = attempt;
  try {
    return await attempt;
  } finally {
    if (daemonOnlineInFlight === attempt) daemonOnlineInFlight = null;
  }
}

/**
 * Builds the `runtimeAccess` object `AssistantDock.tsx` passes to `<ChatPane>` — the Local CLI
 * picker's agent list, rescan, and daemon-online poll. Injectable per `INFO.md`'s Components rule 3
 * (real I/O: all three members are `fetch`-backed) — defaulted to the real hook on
 * `AssistantDockProps`.
 *
 * `rescanAgents` falls back to `listAgents()` (a plain re-fetch of the same `/api/agents` GET)
 * whenever the rescan POST itself does not report success, rather than surfacing an error into the
 * picker — a rescan that could not confirm anything new still leaves the picker with whatever
 * agents are currently known, instead of going blank.
 *
 * @returns The memoized `{ listAgents, rescanAgents, daemonOnline }` object `ChatPane` reads.
 * @example
 * const runtimeAccess = useRuntimeAccess();
 */
export function useRuntimeAccess(): ChatPaneRuntimeAccess {
  return useMemo(
    () => ({
      listAgents: fetchAgents,
      rescanAgents: async () => {
        const response = await fetch(`${AGENTS_URL}/rescan`, {
          method: "POST",
          credentials: "same-origin",
          signal: AbortSignal.timeout(AGENTS_FETCH_TIMEOUT_MS),
        });
        if (!response.ok) return fetchAgents();
        const { agents } = (await response.json()) as { agents: ChatPaneAgent[] };
        return agents;
      },
      daemonOnline,
    }),
    [],
  );
}

export interface ResolveComposerDiscoveryOutcomeDeps {
  readonly capabilities: ComposerCapabilityProjection;
  readonly navigate: (path: string) => void;
  /** Structurally `@jini-ai/chat/react`'s `McpUiToolCallHandler` — the same instance registered
   * for MCP-UI surface rendering in `AssistantDock.tsx` (`mcpUiToolCaller`), reused rather than
   * re-instantiated. */
  readonly callAllowlistedTool: (call: { name: string; arguments: Record<string, unknown> }) => Promise<unknown> | unknown;
  /**
   * Pins a selected capability's `pluginRefId` (`composer-capabilities.ts`'s own doc on that
   * field) as a removable chip — {@link UseSelectedAgentPlugins.addPluginRef}. Optional so every
   * existing caller of this function (including `agent-plugin-capability-adapter.unit.test.ts`'s
   * fixtures, none of which project a `pluginRefId` capability) keeps compiling and passing
   * unchanged; a selection that resolves to a `pluginRefId` capability with this omitted is simply
   * a no-op rather than a crash, matching `resolveTovuComposerDiscoveryRoute`'s own "no route, no
   * effect" posture for an id nothing recognizes.
   */
  readonly addPluginRef?: (pluginRefId: string) => void;
}

/**
 * Resolves one composer selection into its effect — the host half of debate 2's projection
 * ("Composer slash commands"). Checks the existing client-local route first (`/mcp`'s settings
 * navigation, unchanged since before this projection existed), then falls through to a projected
 * capability's own {@link ComposerHostBinding} (see `composer-capabilities.ts`'s module doc for
 * what each binding kind means and why there are only two). Returns the `ComposerDiscoveryOutcome`
 * Jini's `Composer` applies to the draft, or `undefined` when nothing should change it — e.g. `/mcp`
 * navigating away, or an unresolvable item id (never true for a live selection, but not assumed).
 *
 * A free function rather than inline in the component: every dependency is explicit and injected,
 * so the resolution logic (including the `'allowlisted-tool-call'` branch, unreachable through any
 * bundled capability today) is provable without rendering `AssistantDock` at all.
 *
 * Has an external consumer outside this folder
 * (`features/plugins/__tests__/agent-plugin-capability-adapter.unit.test.ts`), so per `INFO.md`'s
 * Components rule 2 it is re-exported by name from `AssistantDock.tsx` — see that file.
 *
 * @complexity O(1) plus the cost of `callAllowlistedTool` when a tool-call binding is resolved.
 * @overallScore 100
 */
export async function resolveComposerDiscoveryOutcome(
  selection: ComposerDiscoverySelection,
  deps: ResolveComposerDiscoveryOutcomeDeps,
): Promise<ComposerDiscoveryOutcome | void> {
  const route = resolveTovuComposerDiscoveryRoute(selection.item.id);
  if (route) {
    deps.navigate(route);
    return;
  }

  const capability = deps.capabilities.byItemId.get(selection.item.id);

  // Pinning a plugin ref never leaves anything of its own in the draft — the chip IS the visible
  // effect, rendered by `AssistantDock.tsx`'s own `leadingAccessories` slot from
  // `useSelectedAgentPlugins` state, not by anything Jini's `Composer` applies. Checked before
  // `capability?.resolve` below: today's bundled catalog never sets both on the same capability,
  // but if a future one did, pinning the chip should not be skipped just because a `resolve`
  // binding also exists.
  //
  // `{ draft: "" }`, not a bare `return` (2026-08-23): the "+" menu and a plain (no-`command`)
  // slash selection both already clear the draft themselves, in `Composer.tsx`, via this
  // capability's own `insertText: ""` — this outcome was a no-op for those paths. But the
  // `command`-bearing slash path (`/ui-ux-design`, added the same day) is a `selectSlashItem`
  // branch that skips that same insertText-driven clear (see `composer-capabilities.ts`'s
  // `command` doc), so without this the literal typed `/ui-ux-design` would sit in the box after
  // pinning. Same "host explicitly clears it" pattern the `allowlisted-tool-call` branch below
  // already uses.
  if (capability?.pluginRefId) {
    deps.addPluginRef?.(capability.pluginRefId);
    return { draft: "" };
  }

  if (!capability?.resolve) return;

  const binding = capability.resolve(selection.argument);
  if (binding.kind === "compose-text") return { draft: binding.text };

  // 'allowlisted-tool-call': POSTs through the same session-authenticated, allowlist-gated route
  // MCP-UI surface confirmations already use. Rejects with `TOOL_NOT_ALLOWLISTED` (403) for any
  // tool id not on `MCP_UI_REDEEMABLE_TOOL_IDS`'s allowlist — true for every binding in the bundled
  // catalog today, since none is wired to this kind yet. The rejection propagates to the caller,
  // where Jini's `runComposerHostEffect` reports it and leaves the draft untouched.
  await Promise.resolve(deps.callAllowlistedTool({ name: binding.toolName, arguments: binding.params }));
  return { draft: "" };
}

/**
 * Wraps {@link resolveComposerDiscoveryOutcome} as the `onDiscoverySelect` callback
 * `AssistantDock.tsx` passes to `<ChatPane composerSlots={...}>`. Pure derivation/wiring, not I/O
 * of its own — `navigate` is a synchronous client-side route change (already a plain import, not a
 * seam anywhere else in this file), and `callAllowlistedTool` is supplied by the caller (the same
 * `mcpUiToolCaller` singleton registered for MCP-UI surfaces), so this hook has nothing of its own
 * to inject; no `INFO.md` rule-3 seam.
 *
 * @param input.composerCapabilities - {@link UseComposerCapabilities.composerCapabilities} — the
 *   live discovery-catalog projection.
 * @param input.callAllowlistedTool - {@link ResolveComposerDiscoveryOutcomeDeps.callAllowlistedTool}.
 * @param input.addPluginRef - {@link ResolveComposerDiscoveryOutcomeDeps.addPluginRef}.
 * @returns The memoized `onDiscoverySelect` callback.
 * @example
 * const handleComposerDiscoverySelect = useComposerDiscoverySelect({
 *   composerCapabilities,
 *   callAllowlistedTool: mcpUiToolCaller,
 *   addPluginRef,
 * });
 */
export function useComposerDiscoverySelect(
  { composerCapabilities, callAllowlistedTool, addPluginRef }: {
    composerCapabilities: ComposerCapabilityProjection;
    callAllowlistedTool: ResolveComposerDiscoveryOutcomeDeps["callAllowlistedTool"];
    addPluginRef?: ResolveComposerDiscoveryOutcomeDeps["addPluginRef"];
  },
): (selection: ComposerDiscoverySelection) => Promise<ComposerDiscoveryOutcome | void> {
  return useCallback(
    (selection: ComposerDiscoverySelection) =>
      resolveComposerDiscoveryOutcome(selection, {
        capabilities: composerCapabilities,
        navigate,
        callAllowlistedTool,
        addPluginRef,
      }),
    [composerCapabilities, callAllowlistedTool, addPluginRef],
  );
}

/**
 * Whether a completed run's messages-change delta should trigger the refresh announcements, and
 * what the next `settledRunMessageId` marker should be. Pulled out of `handleMessagesChange` so the
 * "fire once per finished run, not once per streaming delta" dedup logic is directly assertable
 * without a live `ChatPane`.
 *
 * Deliberately triggered by RUN COMPLETION rather than by inspecting the transcript for a settings
 * or content tool call. Matching tool names here would put a list of them in the admin shell, where
 * it would fall out of date the first time the catalog grows — and the whole cost of being wrong is
 * a few sub-millisecond SQLite reads per run. Ignorance is cheaper than coupling.
 *
 * @param input.messages - The full transcript as of this `onMessagesChange` event.
 * @param input.settledRunMessageId - The last message id already published for, or `null`.
 * @returns `publish` (whether to announce now) and `nextSettledRunMessageId`
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
 * Builds the `onMessagesChange` callback `AssistantDock.tsx` passes to `<ChatPane>`. Pure
 * state/wiring, not I/O of its own — `chats.onMessagesChange` and `publishSettingsRefresh` are
 * already-wired dependencies (the former injected via `useChats`, the latter the same bus singleton
 * {@link useExecutionConfig} already calls directly), so this hook has nothing of its own to inject;
 * no `INFO.md` rule-3 seam.
 *
 * Owns `settledRunMessageId` internally (a `useRef`, not exposed) — last assistant message id seen
 * in a terminal state, so a run's completion fires the settings refresh below exactly once.
 * `onMessagesChange` runs on every delta of a streaming reply, and the terminal message keeps
 * arriving in later calls after it settles.
 *
 * A finished run may have written a setting — `settings_set_ui_preference` is agent-callable — so
 * the mounted settings tabs re-read. Without this the write lands in `content.db` and the open tab
 * keeps rendering the value it fetched at mount, which reads as the tool having silently done
 * nothing.
 *
 * The identical thing was true of CONTENT until 2026-08-26, just with no bus to say it on:
 * `taxonomy_create_taxonomy` is agent-callable too, and the Categories & Tags screen sitting beside
 * this dock kept listing what it fetched at mount until the operator hit Ctrl-R. So this publisher
 * now announces on `lib/content-refresh-bus` as well. It is one trigger with two announcements, not
 * a second trigger — the dedup below still fires it exactly once per finished run, and neither bus
 * carries a payload, so widening what is announced cannot widen what any subscriber can read.
 *
 * Deliberately triggered by RUN COMPLETION rather than by inspecting the transcript for a settings
 * or taxonomy tool call — see {@link shouldPublishOnMessagesChange}'s own doc for why. `undefined`
 * scope (rather than a namespace or resource list) for the same reason: this publisher does not know
 * what changed, and saying so is more honest than guessing.
 *
 * @param input.chats - {@link UseAssistantChats} — only `.onMessagesChange` is read.
 * @returns The memoized `onMessagesChange` callback.
 * @example
 * const handleMessagesChange = useMessagesChangeHandler({ chats });
 */
export function useMessagesChangeHandler(
  { chats }: { chats: Pick<UseAssistantChats, "onMessagesChange"> },
): (messages: ChatMessage[]) => void {
  const settledRunMessageId = useRef<string | null>(null);

  return useCallback(
    (messages: ChatMessage[]) => {
      window.__tovuAssistantMessages = messages;
      // Persistence is selective, not per-delta — see `lib/assistant-chats.ts`'s
      // `persistableMessages` for why a streaming reply is written once rather than per token.
      chats.onMessagesChange(messages);

      const { publish, nextSettledRunMessageId } = shouldPublishOnMessagesChange({
        messages,
        settledRunMessageId: settledRunMessageId.current,
      });
      settledRunMessageId.current = nextSettledRunMessageId;
      if (publish) {
        publishSettingsRefresh();
        publishContentRefresh();
      }
    },
    [chats],
  );
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
 * @param input.pluginRefIds - {@link UseSelectedAgentPlugins.selectedPluginRefIds} — the
 *   composer's currently-pinned Agent Plugin chips.
 * @param input.conversationId - `chats.activeId` (`useChatsSeam`) — the same id already passed to
 *   `<ChatPane conversationId={...}>` for message persistence. Lets `agent-daemon-server.ts`'s
 *   `onStarted` key its per-conversation agent-CLI session lookup (`agent-session-resume.ts`,
 *   `RunEndPayload.sessionRef`'s round trip) — see that file's own doc. `undefined` before any
 *   conversation is active (e.g. `chats.activeId` is `null` right after "New chat").
 * @returns The context object to merge into a run's `contextRef`.
 * @example
 * const context = resolveRunContext({ bindToken: agentBridge?.bindToken(), model: selection.model, pluginRefIds, conversationId });
 */
export function resolveRunContext(
  { bindToken, model, pluginRefIds, conversationId }: {
    bindToken: string | undefined;
    model?: string;
    pluginRefIds?: readonly string[];
    conversationId?: string | null;
  },
): { frontendBindToken?: string; model?: string; pluginRefIds?: readonly string[]; conversationId?: string } {
  return {
    ...(bindToken === undefined ? {} : { frontendBindToken: bindToken }),
    ...(typeof model === "string" && model.length > 0 ? { model } : {}),
    // Omitted entirely when empty, same "absent means none" convention as the two fields above —
    // a run with no pinned plugin carries no key for it, matching `attachmentIds`'s own posture in
    // `assistant-transport.ts`'s `buildLocalCliContextRef`.
    ...(pluginRefIds && pluginRefIds.length > 0 ? { pluginRefIds } : {}),
    ...(typeof conversationId === "string" && conversationId.length > 0 ? { conversationId } : {}),
  };
}

/**
 * Builds the `runContext` callback `AssistantDock.tsx` passes to `<ChatPane>` — a thin memoized
 * wrapper around {@link resolveRunContext}. Pure derivation, not I/O of its own (`agentBridge` is
 * caller-owned, `model` is a plain string); no `INFO.md` rule-3 seam.
 *
 * A function, and the token read *inside* it via `agentBridge?.bindToken()`, because `EventSource`
 * reconnects on its own — a daemon restart, a sleeping laptop, an ordinary blip — and every reattach
 * mints a new session and a new token. Capturing the value once would keep sending a dead one, and
 * the only symptom would be the agent being told "no frontend is bound to this run" on every page
 * call, long after the reconnect that caused it.
 *
 * Depends on `agentBridge` identity rather than reading a ref: the bridge object is stable for the
 * tab's lifetime, so this rebuilds only when page control genuinely appears or goes away. Also
 * depends on `model` (not the whole `localCliSelection` object, which would rebuild on every
 * keystroke-equivalent picker interaction that leaves the model alone) so a run started right after
 * a model pick carries it — {@link useLocalCliSelection} owns the picker's live value, and this is
 * the one place that value needs to leave React state.
 *
 * @param input.agentBridge - This tab's page-control connection, or `null`/`undefined` if unbound.
 * @param input.model - {@link UseLocalCliSelection.localCliSelection}`.model`, the live picker
 *   value.
 * @param input.pluginRefIds - {@link UseSelectedAgentPlugins.selectedPluginRefIds}, read fresh on
 *   every rebuild — same "never captured, always the live value" posture as `model`, so pinning or
 *   removing a chip mid-session takes effect on the NEXT message without forcing a new callback
 *   identity mid-render.
 * @param input.conversationId - {@link resolveRunContext}'s own `conversationId` doc — forwarded
 *   straight through, same "rebuild when it changes" posture as `model`/`pluginRefIds`.
 * @returns The memoized `runContext` callback.
 * @example
 * const runContext = useRunContext({ agentBridge, model: localCliSelection.model, pluginRefIds: selectedPluginRefIds, conversationId: chats.activeId });
 */
export function useRunContext(
  { agentBridge, model, pluginRefIds, conversationId }: {
    agentBridge: FrontendSessionBridge | null | undefined;
    model?: string;
    pluginRefIds?: readonly string[];
    conversationId?: string | null;
  },
): () => { frontendBindToken?: string; model?: string; pluginRefIds?: readonly string[]; conversationId?: string } {
  return useMemo(
    () => () => resolveRunContext({ bindToken: agentBridge?.bindToken(), model, pluginRefIds, conversationId }),
    [agentBridge, model, pluginRefIds, conversationId],
  );
}

/**
 * @file Seam layer (2026-08-18, added after the inline-hook-extraction pass above, in response to
 * live review of that pass): one `use*Seam` wrapper per `INFO.md` rule-3 injectable prop on
 * `AssistantDockProps`, each fusing "pick the override or default the real hook" and "call it" into
 * a single call `AssistantDock.tsx` makes directly — `const { … } = useExecutionConfigSeam(props.useExecutionConfig)`
 * — rather than the two-step `const useXState = resolveXHook(props.useX); const { … } = useXState();`
 * the component previously did for each of the eight seamed hooks.
 *
 * Moving this here, not just shortening it in place, is the point: `INFO.md`'s own table says
 * `<Name>.tsx` holds "props interface + JSX, and nothing else" and `<Name>.hooks.tsx` holds "the
 * state, effects, refs, and DOM/IO logic, as named `use*` hooks" — the override-or-default decision
 * is part of a seamed hook's own contract, not a rendering concern, so it belongs here. The
 * `resolveXHook` functions this replaces existed as separately-scoped functions (not inline default
 * parameters, `SeeMore`'s `{ useClamp = useSeeMoreClamp }` idiom) specifically to keep ESLint's
 * cyclomatic-complexity rule from counting each seam's default against `AssistantDock`'s OWN
 * function body (see that function's own `@complexity` doc). A `use*Seam` wrapper preserves that
 * property for free: its `??` lives in the wrapper's body, not `AssistantDock`'s, so
 * `AssistantDock`'s measured complexity is unchanged by this pass (still 5 cyclomatic / 2 cognitive
 * — verify with `check-admin-complexity-drift.ts` after any further edit here).
 *
 * `AssistantDockProps` itself, its seam docs, and `resolveAgentBridge` (not hook-shaped — a plain
 * `override ?? null`, never a two-step resolve-then-call) are unaffected and stay in
 * `AssistantDock.tsx`; only the eight hook seams move (later joined by a ninth, folded into
 * `useAssistantDockChrome` — see its own doc below). External behavior is identical: same prop
 * names, same default-to-the-real-hook semantics, same "AssistantDock use*Injection" test coverage
 * (`components/__tests__/AssistantDock.unit.test.tsx`) — this is a pure internal relocation.
 */

export function useChatsSeam(override: (() => UseAssistantChats) | undefined): UseAssistantChats {
  return (override ?? useWiredAssistantChats)();
}

export interface AssistantDockChrome {
  /** The resolved locale string — {@link AssistantDockProps.useAdminLocale}'s override, or
   *  `useWiredAdminLocale`'s real fetched value. */
  locale: string;
  /** Translates this component's OWN pane chrome (eyebrow, title fallback, composer placeholder) —
   *  `ASSISTANT_DOCK_DICT[locale]?.[key] ?? key`, the same bounded-dictionary-with-passthrough
   *  shape every other `*-i18n.ts` file in this app uses. Recomputed each render (cheap: one
   *  object lookup), not memoized — matches this closure's pre-extraction behavior exactly. */
  t: (key: string) => string;
  /** The `I18nAdapter` `<JiniChatProvider i18n={...}>` takes — `@jini-ai/chat/react`'s OWN
   *  translation contract, covering the `ConversationList` switcher mounted in `header` below, a
   *  DIFFERENT (larger, package-owned) key set than `t` above. See {@link useChatI18n}. */
  chatI18n: I18nAdapter;
}

/**
 * Ninth seam, added on top of the original eight after live review: `useWiredAdminLocale()` was
 * still being called bare in `AssistantDock.tsx` — the one hook in the component touching real
 * DOM/IO (`port.loadLanguage()`'s fetch, `port.subscribeToSettingsRefresh`) that had NOT been given
 * an `INFO.md` rule-3 seam, unlike every other IO hook here. Consequence: every existing
 * `AssistantDock` test was making an unstubbed real fetch attempt for the locale on every render
 * (silently swallowed by `useAdminLocale`'s own `.catch(() => undefined)`, landing on
 * `DEFAULT_LOCALE`), and no test could drive `locale`/`chatI18n`/`t()` for any OTHER locale without
 * either stubbing `lib/settings-tabs` globally or asserting only ever the English default.
 *
 * Bundles `locale`, `t`, and `chatI18n` into one call — not three separate ones
 * (`useAdminLocaleSeam(...)`, an inline `t` closure, `useChatI18n(locale)`) — because all three
 * exist for exactly one shared purpose (translating this dock's own chrome) and were only ever
 * consumed together at the one call site in `AssistantDock.tsx`. A prior revision of this pass kept
 * them as three separate steps in the component body; that was redundant on inspection — three
 * statements standing in for what is really one derived value. `t` itself was also still inline in
 * the component before this consolidation (a plain closure, not a raw hook call, so it was outside
 * this pass's original "extract every inline hook" mandate on a literal reading — but leaving it
 * splintered from `locale`/`chatI18n`, its only two reasons to exist, made no sense once those two
 * were unified here).
 *
 * `useChatI18n` (above) is still its own export, composed internally rather than inlined — it keeps
 * its own direct, narrower tests (locale in, adapter out, no coupling to how `locale` was obtained),
 * and this hook's own tests can stay focused on the seam and the `t()` dictionary behavior.
 *
 * `useWiredAdminLocale` is not itself newly extracted here — it already existed as a properly split,
 * independently tested `useX(port)`/`useWiredX()` pair (`use-admin-locale.hooks.ts`,
 * `admin-locale-dependencies.hooks.ts`, `admin-locale-port.hooks.ts`, with its own
 * `use-admin-locale.hooks.test.ts`) called bare from ~40 files repo-wide by deliberate, documented
 * choice (`use-admin-locale.hooks.ts`'s own header: "converting every one of those call sites was
 * out of scope for this pass... once every remaining bare call site is converted to
 * `useWiredAdminLocale()`, this default can be dropped"). This seam does not touch that shared hook
 * or its ~39 other bare call sites — it only gives `AssistantDock` specifically the same
 * per-consumer prop override every other IO hook in this file already has, the same way `useChats`
 * (also a shared, externally-defined hook) already gets one without every OTHER `useAssistantChats`
 * call site needing to.
 *
 * @param useAdminLocaleOverride - {@link AssistantDockProps.useAdminLocale}. Defaults to the real
 *   `useWiredAdminLocale`.
 * @returns `{ locale, t, chatI18n }` — see {@link AssistantDockChrome}.
 * @example
 * const { locale, t, chatI18n } = useAssistantDockChrome(useAdminLocale);
 */
export function useAssistantDockChrome(useAdminLocaleOverride: (() => string) | undefined): AssistantDockChrome {
  const locale = (useAdminLocaleOverride ?? useWiredAdminLocale)();
  const t = (key: string): string => ASSISTANT_DOCK_DICT[locale]?.[key] ?? key;
  const chatI18n = useChatI18n(locale);
  return { locale, t, chatI18n };
}

export function useExecutionConfigSeam(override: typeof useExecutionConfig | undefined): UseExecutionConfig {
  return (override ?? useExecutionConfig)();
}

export function useByokRuntimeSeam(
  override: typeof useByokRuntime | undefined,
  input: {
    executionConfig: ExecutionConfig;
    setExecutionConfig: React.Dispatch<React.SetStateAction<ExecutionConfig>>;
  },
): UseByokRuntime {
  return (override ?? useByokRuntime)(input);
}

export function useLocalCliSelectionSeam(
  override: typeof useLocalCliSelection | undefined,
  input: {
    executionConfig: ExecutionConfig;
    setExecutionConfig: React.Dispatch<React.SetStateAction<ExecutionConfig>>;
    configLoaded: boolean;
  },
): UseLocalCliSelection {
  return (override ?? useLocalCliSelection)(input);
}

export function useComposerCapabilitiesSeam(
  override: typeof useComposerCapabilities | undefined,
): UseComposerCapabilities {
  return (override ?? useComposerCapabilities)();
}

export function useAssistantTransportSeam(
  override: typeof useAssistantTransport | undefined,
  input: { executionConfigRef: React.MutableRefObject<ExecutionConfig> },
): ReturnType<typeof createTovuAssistantTransport> {
  return (override ?? useAssistantTransport)(input);
}

export function useAttachmentUploaderSeam(
  override: typeof useAttachmentUploader | undefined,
): ReturnType<typeof createDaemonAttachmentUploader> {
  return (override ?? useAttachmentUploader)();
}

export function useRuntimeAccessSeam(override: typeof useRuntimeAccess | undefined): ChatPaneRuntimeAccess {
  return (override ?? useRuntimeAccess)();
}
