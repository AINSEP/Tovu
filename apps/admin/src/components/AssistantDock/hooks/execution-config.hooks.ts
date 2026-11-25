import { useCallback } from "react";
import { useCachedLoader, useInvalidate } from "@jini-ai/ui/fetch-query";
import { useAdminBootScope } from "@jini-ai/admin/shell/lib/admin-boot-scope";
import { subscribeToSettingsRefresh } from "@jini-ai/admin/shell/lib/settings-refresh-bus";
import { useExecutionConfig as useAdminExecutionConfig, useStoredAdminKey } from "@jini-ai/admin/shell/components/AssistantDock/hooks/execution-config.hooks";
import type { DockExecutionConfigPort, ExecutionWrite, UseExecutionConfig } from "@jini-ai/admin/shell/components/AssistantDock/hooks/execution-config.hooks";
import { useExecutionConfigLedger } from "@jini-ai/admin/shell/components/AssistantDock/hooks/execution-config-ledger.hooks";
import { retryWhileUnreachable } from "@/lib/retry-unreachable";
import { DEFAULT_EXECUTION_CONFIG, loadAdminExecutionCredential, loadExecutionConfig } from "@/lib/execution-settings";
import { EXECUTION_NAMESPACE } from "@jini-ai/admin/shell/lib/execution-settings-ledger";
import { applyExecutionConfigChange, persistExecutionConfigWrite } from "../execution-config-write";

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

const defaultDockExecutionConfigPort: DockExecutionConfigPort = {
  loadConfig: loadExecutionConfig,
  loadCredential: loadAdminExecutionCredential,
  now: Date.now,
};

function subscribeExecutionConfigRefresh(
  { revalidate }: { revalidate: () => void },
  _options: Record<string, never> = {},
): () => void {
  // Another window/desktop can save execution config while this dock stays mounted. Settings
  // already publishes this namespace on save; focus/visible also catch changes outside the tab.
  const onVisible = () => { if (document.visibilityState === "visible") revalidate(); };
  window.addEventListener("focus", revalidate);
  document.addEventListener("visibilitychange", onVisible);
  const unsubscribe = subscribeToSettingsRefresh((scope) => {
    if (!scope || scope.includes(EXECUTION_NAMESPACE)) {
      revalidate();
    }
  });
  return () => {
    window.removeEventListener("focus", revalidate);
    document.removeEventListener("visibilitychange", onVisible);
    unsubscribe();
  };
}

const ledgerIo = {
  retry: retryWhileUnreachable,
  subscribeRefresh: subscribeExecutionConfigRefresh,
  onLoadFailure: (error: unknown) => console.error("[AssistantDock] failed to load execution config", error),
};
const storedKeyIo = {
  retry: retryWhileUnreachable,
  subscribeRefresh: ({ revalidate }: { revalidate: () => void }) => subscribeToSettingsRefresh((scope) => {
    if (scope && !scope.includes(EXECUTION_NAMESPACE)) return;
    revalidate();
  }),
  onLoadFailure: (error: unknown) => console.error("[AssistantDock] failed to load stored BYOK credential state", error),
};

export function useExecutionConfig(
  _requiredArgs: Record<string, never> = {},
  { useBootScope = useAdminBootScope, useLoader = useCachedLoader, useInvalidator = useInvalidate, useLedger = useExecutionConfigLedger, useStoredKey = useStoredAdminKey, ...seams }: {
    useBootScope?: typeof useAdminBootScope;
    useLoader?: typeof useCachedLoader;
    useInvalidator?: typeof useInvalidate;
    useLedger?: typeof useExecutionConfigLedger;
    useStoredKey?: typeof useStoredAdminKey;
    port?: DockExecutionConfigPort;
    persistWrite?: typeof persistExecutionConfigWrite;
  } = {},
): UseExecutionConfig {
  // Non-hook seams default by spread, not `=`: same values without a branch apiece.
  const { port, persistWrite } = { port: defaultDockExecutionConfigPort, persistWrite: persistExecutionConfigWrite, ...seams };
  const persistMode = useCallback(({ write }: { write: ExecutionWrite }) =>
    persistWrite({ write, failureLog: "[AssistantDock] failed to save execution mode" }), [persistWrite]);
  return useAdminExecutionConfig({
    port, initialConfig: DEFAULT_EXECUTION_CONFIG, namespace: EXECUTION_NAMESPACE,
    useBootScopeHook: useBootScope, useCachedLoaderHook: useLoader, useInvalidateHook: useInvalidator,
    useLedgerHook: useLedger, useStoredKeyHook: useStoredKey, ledgerIo, storedKeyIo,
    applyChange: applyExecutionConfigChange, persistWrite: persistMode,
  });
}

export function useExecutionConfigSeam({ override }: { override: typeof useExecutionConfig | undefined }, _options: Record<string, never> = {}): UseExecutionConfig {
  return (override ?? useExecutionConfig)();
}

