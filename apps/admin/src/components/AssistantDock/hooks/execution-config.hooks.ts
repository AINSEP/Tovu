import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ExecutionConfig } from "@jini-ai/ui";

import { useCachedLoader, useInvalidate } from "@jini-ai/ui/fetch-query";
import { useAdminBootScope } from "@/lib/admin-boot-scope";
import type { CachedLoader } from "@jini-ai/core/fetch";
import { subscribeToSettingsRefresh } from "@/lib/settings-refresh-bus";
import { isAbortError, retryWhileUnreachable } from "@/lib/retry-unreachable";
import { EXECUTION_NAMESPACE, loadAdminExecutionCredential, loadExecutionConfig } from "@/lib/execution-settings";
import { applyExecutionConfigChange, persistExecutionConfigWrite } from "../execution-config-write";
import { useExecutionConfigLedger } from "./execution-config-ledger.hooks";

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
 * `resolveComposerDiscoveryOutcome` is reached through `AssistantDock.tsx` rather than here
 * `.hooks.tsx`-only: per `INFO.md`'s Components rule 2 it is re-exported by name from the component
 * file, and that is the path its own suite
 * (`../__tests__/resolve-composer-discovery-outcome.unit.test.ts`) imports.
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
   * {@link useLocalCliSelection}'s initial hydration: `executionConfig.localCli.agentId` starts
   * `null` in `DEFAULT_EXECUTION_CONFIG`, and a load that resolves to "nothing was ever saved"
   * ALSO leaves it `null` — those two states are indistinguishable from `executionConfig` alone,
   * so a separate "has the GET settled at all" signal is what lets that hook's hydration effect
   * fire after the first read instead of never (waiting on a non-null `agentId` that may never arrive) or
   * too early (before the load has had any chance to run).
   */
  configLoaded: boolean;
  /** Await the current refresh, or re-read a Local CLI config older than five seconds. */
  readExecutionConfigForSend?: () => Promise<ExecutionConfig>;
}

/** IO seam for the dock's existing ledger and credential adapters; tests provide fakes. */
export interface DockExecutionConfigPort {
  loadConfig: typeof loadExecutionConfig;
  loadCredential: () => Promise<{ isSet: boolean }>;
  now: () => number;
}

const defaultDockExecutionConfigPort: DockExecutionConfigPort = {
  loadConfig: loadExecutionConfig,
  loadCredential: loadAdminExecutionCredential,
  now: Date.now,
};

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
function useStoredAdminKey(
  { credentialLoader, invalidate, credentialKey }: {
    credentialLoader: CachedLoader<{ isSet: boolean }>;
    invalidate: ReturnType<typeof useInvalidate>;
    credentialKey: string[];
  },
  _options: Record<string, never> = {},
): boolean | null {
  const [hasStoredAdminKey, setHasStoredAdminKey] = useState<boolean | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    // Same restart-survival and cancellation handling as the ledger load above; `hasStoredAdminKey`
    // stays `null` (unknown) while retrying rather than claiming "not configured".
    const refresh = () => {
      void retryWhileUnreachable({ load: () => credentialLoader.load(), signal: controller.signal })
        .then((view) => {
          if (!controller.signal.aborted) setHasStoredAdminKey(view.isSet);
        })
        .catch((error: unknown) => {
          if (isAbortError({ error })) return;
          console.error("[AssistantDock] failed to load stored BYOK credential state", error);
          if (!controller.signal.aborted) setHasStoredAdminKey(false);
        });
    };
    refresh();
    const unsubscribe = subscribeToSettingsRefresh((scope) => {
      if (scope && !scope.includes(EXECUTION_NAMESPACE)) return;
      invalidate({ key: credentialKey });
      refresh();
    });
    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [credentialLoader, invalidate, credentialKey]);
  return hasStoredAdminKey;
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
 * @param options.port - Ledger/credential IO; defaults to the existing host adapters.
 * @param options.persistWrite - Write seam for component tests; defaults to the shared dock writer.
 * @example
 * const { executionConfig, handleExecutionModeChange } = useExecutionConfig();
 */
export function useExecutionConfig(
  _requiredArgs: Record<string, never> = {},
  { port = defaultDockExecutionConfigPort, persistWrite = persistExecutionConfigWrite, useBootScope = useAdminBootScope, useLoader = useCachedLoader, useInvalidator = useInvalidate, useLedger = useExecutionConfigLedger, useStoredKey = useStoredAdminKey }: {
    useBootScope?: typeof useAdminBootScope;
    useLoader?: typeof useCachedLoader;
    useInvalidator?: typeof useInvalidate;
    useLedger?: typeof useExecutionConfigLedger;
    useStoredKey?: typeof useStoredAdminKey;
    port?: DockExecutionConfigPort;
    persistWrite?: typeof persistExecutionConfigWrite;
  } = {},
): UseExecutionConfig {
  const io = useRef(port);
  io.current = port;
  const { queryScope } = useBootScope();
  const configKey = useMemo(() => ["settings", EXECUTION_NAMESPACE, queryScope, "dock"], [queryScope]);
  const credentialKey = useMemo(() => ["admin-execution-credential", queryScope, "presence"], [queryScope]);
  const loadConfig = useCallback(async () => ({ config: await io.current.loadConfig(), loadedAt: io.current.now() }), []);
  const loadCredential = useCallback(() => io.current.loadCredential(), []);
  // The provider retains reads across StrictMode replay and ordinary dock remounts. Explicit
  // refreshes revoke them; focus/pre-send reads keep the existing five-second freshness bound.
  const configLoader = useLoader({ key: configKey, fetch: loadConfig }, { staleTime: Infinity });
  const credentialLoader = useLoader({ key: credentialKey, fetch: loadCredential }, { staleTime: Infinity });
  const invalidate = useInvalidator();
  const { executionConfig, executionConfigRef, setExecutionConfig, configLoaded, readExecutionConfigForSend } = useLedger({ io, configLoader, invalidate, configKey });
  const hasStoredAdminKey = useStoredKey({ credentialLoader, invalidate, credentialKey });

  /**
   * Persists a mode switch made from THIS dock's own picker back through the same
   * `saveExecutionConfig` chokepoint the Execution-mode settings tab uses (ADR-028's single write
   * chokepoint), so the two surfaces can never disagree about which mode is active.
   *
   * `publishSettingsRefresh([EXECUTION_NAMESPACE])` on save success — same cross-mount staleness
   * fix `handleByokModelChange` below already applies to a model pick, now applied here too so an
   * already-open settings tab (or another `AssistantDock` mount) re-reads instead of sitting on the
   * mode the operator just changed away from.
   */
  const handleExecutionModeChange = useCallback((mode: "local" | "api") => {
    const nextMode: ExecutionConfig["mode"] = mode === "api" ? "byok" : "local-cli";
    const write = applyExecutionConfigChange({ setExecutionConfig, change: (previous) =>
      previous.mode === nextMode ? previous : { ...previous, mode: nextMode } });
    if (write) persistWrite({ write, failureLog: "[AssistantDock] failed to save execution mode" });
    // `setExecutionConfig` added: it's a `useCallback([], ...)`-wrapped setter (itself stable for
    // the component's lifetime, see its own declaration above), so listing it is a no-op that only
    // satisfies the linter — Part 2 triage fix, not a suppression.
  }, [setExecutionConfig, persistWrite]);

  return {
    executionConfig,
    executionConfigRef,
    setExecutionConfig,
    handleExecutionModeChange,
    hasStoredAdminKey,
    configLoaded,
    readExecutionConfigForSend,
  };
}

export function useExecutionConfigSeam({ override }: { override: typeof useExecutionConfig | undefined }, _options: Record<string, never> = {}): UseExecutionConfig {
  return (override ?? useExecutionConfig)();
}

