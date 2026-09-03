import { useRef } from "react";
import type { ExecutionConfig, ExecutionPort } from "@jini-ai/ui";

import {
  DEFAULT_EXECUTION_CONFIG,
  EXECUTION_NAMESPACE,
  createExecutionPort,
  loadExecutionConfig,
  reconcileExecutionConfigRefresh,
  saveExecutionConfig,
} from "@/lib/execution-settings";
import { useSettingsSlice, type SettingsSlice } from "@/hooks/use-settings-slice.hooks";

/**
 * @file State for `AdminExecutionMode` — the admin's own Local CLI / BYOK execution settings.
 *
 * Extracted verbatim. See `AdminExecutionMode`'s own doc comment in `AiAssistant.tsx` for why this
 * is a SECOND mount of `useSettingsSlice` over the same `core.execution` ledger namespace
 * `features/settings/SettingsUi.tsx` uses, and for the one option (`useStoredCredential`) the two
 * mounts must never disagree about — that option belongs to `VisitorCredentialForm`'s port, not
 * this one, which opts into `useAdminStoredCredential` instead: the admin's OWN stored key, never
 * the site's. `use-settings-ui.hooks.ts`'s port carries the identical option for the same reason.
 */

export interface AdminExecutionModeController {
  /** One port per mount, matching `SettingsUi.tsx`'s `useRef` usage — agent detection is memoised
   *  at module scope inside the adapter, so a second port here does not mean a second detection
   *  sweep. */
  port: React.MutableRefObject<ExecutionPort>;
  execution: SettingsSlice<ExecutionConfig>;
}

/**
 * `AdminExecutionMode`'s own Local CLI / BYOK slice — a second mount of `useSettingsSlice` over the
 * same `core.execution` ledger namespace `features/settings/SettingsUi.tsx` uses (see this file's
 * own header for why that duplication is intentional).
 *
 * No injectable port of its own: `useSettingsSlice`/`createExecutionPort` are the already-DI'd
 * layers underneath this hook, so there is nothing left here to wrap in a port — `AiAssistant.tsx`
 * takes this hook itself as its seam (`useAdminExecutionModeHook`, defaulted to this function).
 *
 * @returns The execution port ref and the `core.execution` settings slice `AdminExecutionMode` renders.
 * @complexity Time/space: O(1) — one slice mount, no iteration.
 */
export function useAdminExecutionMode(): AdminExecutionModeController {
  const port = useRef(
    createExecutionPort({
      // Opts model discovery and "Test connection" into the ADMIN'S OWN server-side credential — the
      // key this very screen configures, encrypted and write-only since 2026-08-05. Without it the
      // probes were sent with the empty browser field and the provider (correctly) answered "No API
      // key", so `ByokProviderForm` never reached `modelDiscovery.status === 'ok'` and rendered its
      // free-text Model input instead of the live picker it already contains.
      //
      // NOT `useStoredCredential` — that is the SITE's visitor key, a different row belonging to a
      // different subject, and opting into it here would silently probe the wrong credential. The two
      // flags are separate for exactly this reason; see `lib/execution-settings.ts`'s option docs.
      useAdminStoredCredential: true,
    }),
  );

  const execution = useSettingsSlice<ExecutionConfig>({
    load: loadExecutionConfig,
    save: saveExecutionConfig,
    namespaces: [EXECUTION_NAMESPACE],
    defaultValue: DEFAULT_EXECUTION_CONFIG,
    // Same hazard, same fix as `use-settings-ui.hooks.ts`'s mount of this slice — see
    // `reconcileExecutionConfigRefresh`'s own doc. This is the SECOND mount over the same ledger
    // namespace (this file's header), so it needs the identical option, not a copy.
    reconcileRefresh: reconcileExecutionConfigRefresh,
  });

  return { port, execution };
}
