import { useExternalMcpAddForm as jiniUseExternalMcpAddForm, useExternalMcpDriftCopy as jiniUseExternalMcpDriftCopy } from "@jini-ai/mcp/react/external-mcp/ExternalMcpSettingsPanel.hooks";
import { useWiredSourceConfigAddForm, type SourceConfigDependencies, type SourceConfigItem } from "@jini-ai/ui";

import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";

import { t as tExternalMcp } from "@jini-ai/admin/screens/settings/external-mcp-i18n";
import {
  buildExternalMcpFieldSpecs,
  resolveExternalMcpEffectiveAuthMode,
  resolveExternalMcpEffectiveTransport,
} from "@jini-ai/admin/screens/settings/rules";

import { type Translate } from '@jini-ai/core/text';
/**
 * @file `ExternalMcpSettingsPanel.tsx`'s own derived-value logic, split out per the
 * `<Name>.tsx`/`<Name>.hooks.tsx` pattern `TabBar.tsx`/`TabBar.hooks.tsx` establishes (admin
 * TSX-logic-sweep, 2026-09-05) — this repo's rule that a `.tsx` file carries no functions or derived
 * logic of its own.
 */

/** Binds `external-mcp-i18n.ts`'s dictionary to the operator's locale. That dictionary is Tovu's
 *  own, separate from the `useT()` this tab uses for the chrome it inherits from `@jini-ai/ui` —
 *  the drift copy lives in the former because it was authored there (Phase 2C) alongside its 21
 *  translations. */
export function useExternalMcpDriftCopy(): Translate {
  return jiniUseExternalMcpDriftCopy({ useLocaleHook: useAdminLocale, translate: tExternalMcp });
}

/** Everything `ExternalMcpSettingsPanel` renders its "Add server" button and form from. */
export interface ExternalMcpAddFormController {
  /** Whether the add form is showing (the "Add server" button's `aria-expanded`). */
  formOpen: boolean;
  /** "Add server": opens a closed form, closes an open one (without discarding the draft). */
  toggleForm: () => void;
  /** Cancel: discards the draft, not just hides it — reopening must not resurrect a half-typed
   *  server (or a typed secret) the operator chose to abandon — then closes the form. */
  cancelForm: () => void;
  /** The field specs for the draft's last-known transport/auth mode — one render behind a change,
   *  per `ExternalMcpSettingsPanel.tsx`'s "two-pass reactive field-spec sync" header. */
  fieldSpecs: ReturnType<typeof buildExternalMcpFieldSpecs>;
  /** `@jini-ai/ui`'s add-form controller (values, validation, submit, reset), seeded from
   *  {@link fieldSpecs}. */
  addForm: ReturnType<typeof useWiredSourceConfigAddForm<SourceConfigItem>>;
}

/**
 * Owns `ExternalMcpSettingsPanel`'s "Add server" form: its open state, the draft, and the lagged
 * transport/auth-mode sync that keeps the form's field specs following the operator's own choices
 * (see `ExternalMcpSettingsPanel.tsx`'s "two-pass reactive field-spec sync" header for why the sync
 * is one render behind, by design).
 *
 * `fieldSpecs` is deliberately rebuilt every render (not `useMemo`'d), exactly as it was when this
 * lived in the component body — this move changes where the logic lives, not how often it runs.
 *
 * @param input.dependencies - The same source-config port the panel's list uses.
 * @param input.list - Receives a newly added server (`addSourceToList`), so the roster shows it
 *   without a reload.
 * @returns See {@link ExternalMcpAddFormController}.
 * @complexity O(1) per render beyond `buildExternalMcpFieldSpecs`'s fixed-size spec list.
 */
export function useExternalMcpAddForm(input: {
  dependencies: SourceConfigDependencies<SourceConfigItem>;
  list: { addSourceToList: (source: SourceConfigItem) => void };
}): ExternalMcpAddFormController {
  // Pre-select sensible defaults the instant the form opens, so the two `select` fields never show
  // Jini's placeholder "Select…" state for a choice Tovu already has a real default for (matching
  // the server's own default-to-stdio/static_env behavior — see `rules.ts`'s
  // `resolveExternalMcpEffective*`). Guarded on "still blank" so it only ever runs on a fresh draft.
  return jiniUseExternalMcpAddForm({ ...input, useDriftCopyHook: useExternalMcpDriftCopy, useSourceConfigAddFormHook: useWiredSourceConfigAddForm<SourceConfigItem>, buildFieldSpecs: buildExternalMcpFieldSpecs, resolveTransport: resolveExternalMcpEffectiveTransport, resolveAuthMode: resolveExternalMcpEffectiveAuthMode });
}
