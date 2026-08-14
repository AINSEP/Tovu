import { useRef } from "react";
import type { ExecutionConfig, ExecutionPort } from "@jini-ai/ui";

import {
  DEFAULT_EXECUTION_CONFIG,
  EXECUTION_NAMESPACE,
  createExecutionPort,
  loadExecutionConfig,
  reconcileExecutionConfigRefresh,
  saveExecutionConfig,
} from "../../../lib/execution-settings";
import { useSettingsSlice, type SettingsSlice } from "../../../hooks/use-settings-slice.hooks";

/**
 * @file State for `AdminExecutionMode` — the admin's own Local CLI / BYOK execution settings.
 *
 * Extracted verbatim. See `AdminExecutionMode`'s own doc comment in `AiAssistant.tsx` for why this
 * is a SECOND mount of `useSettingsSlice` over the same `core.execution` ledger namespace
 * `features/settings/SettingsUi.tsx` uses, and for the one option (`useStoredCredential`) the two
 * mounts must never disagree about — that option belongs to `VisitorCredentialForm`'s port, not
 * this one; this port is created with NO arguments, deliberately.
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
  const port = useRef(createExecutionPort());

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
