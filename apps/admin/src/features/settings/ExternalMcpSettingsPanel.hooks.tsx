import { useCallback, useMemo } from "react";
import type { SourceConfigItem } from "@jini-ai/ui";

import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import type { Translate } from "@/lib/dictionary-translator";

import { grantWriteFieldValue, type SavedConnectionIntent } from "./external-mcp-admissions-rules";
import { t as tExternalMcp } from "./external-mcp-i18n";
import { buildExternalMcpCardHandles } from "./rules";

/**
 * @file `ExternalMcpSettingsPanel.tsx`'s own derived-value logic, split out per the
 * `<Name>.tsx`/`<Name>.hooks.tsx` pattern `TabBar.tsx`/`TabBar.hooks.tsx` establishes (admin
 * TSX-logic-sweep, 2026-09-05) — this repo's rule that a `.tsx` file carries no functions or derived
 * logic of its own.
 */

/** `ExternalMcpSettingsPanel`'s own per-card agent handles. Not `useMemo`'d: an O(n) pass (see
 *  `buildAgentListHandles`'s own `@complexity` doc, which `buildExternalMcpCardHandles` wraps) over
 *  one workspace's own configured external MCP servers — small and cheap enough next to the render
 *  it feeds that memoizing it was not judged worth the added indirection. That is a decision about
 *  memoization, separate from why this now lives outside the component body at all (the
 *  `.tsx` bodies carry no derived logic). */
export function resolveExternalMcpCardHandles(sources: readonly SourceConfigItem[]): string[] {
  return buildExternalMcpCardHandles(sources.map((source) => source.id));
}

/** Each card's saved intent, keyed by server id — the "saved" half of the saved-vs-live comparison
 *  the admissions banner states. Memoized because it is the dependency of a `useMemo` inside
 *  `useExternalMcpAdmissions`: rebuilding the object every render would make that memo useless.
 *
 *  `enabled` joined `allowedToolNames` here for ADM-001 (2026-09-07): the banner now reports a saved
 *  connection the daemon is not running, and without the toggle it would report every server the
 *  operator deliberately switched off as a fault. `SourceConfigItem.enabled` is optional in
 *  `@jini-ai/ui`'s type; `toItem` in `use-external-mcp.hooks.ts` always sets it from the stored
 *  record, so `?? true` only ever covers a source that came from somewhere else — and "on" is the
 *  right reading of a missing flag, since a card with no toggle state is not one the operator
 *  turned off. */
export function useSavedAllowedToolNamesById(sources: readonly SourceConfigItem[]): Record<string, SavedConnectionIntent> {
  return useMemo(() => {
    const byId: Record<string, SavedConnectionIntent> = {};
    for (const source of sources) {
      byId[source.id] = { allowedToolNames: source.fields["allowedToolNames"] ?? "", enabled: source.enabled ?? true };
    }
    return byId;
  }, [sources]);
}

/** Binds `external-mcp-i18n.ts`'s dictionary to the operator's locale. That dictionary is Tovu's
 *  own, separate from the `useT()` this tab uses for the chrome it inherits from `@jini-ai/ui` —
 *  the drift copy lives in the former because it was authored there (Phase 2C) alongside its 21
 *  translations. */
export function useExternalMcpDriftCopy(): Translate {
  const locale = useAdminLocale();
  return useCallback((key: string) => tExternalMcp(locale, key), [locale]);
}

/**
 * The banner's one-click fix, as the panel's `updateSource` patch.
 *
 * Written through the SAME port the card's own edit form uses, so `mergeSourceUpdate` fills in
 * every field this patch does not mention and `toWriteBody`'s omit-when-blank rules keep `env` and
 * `oauthClientSecret` from being wiped — the asymmetry `use-external-mcp.hooks.ts`'s header calls
 * the safe direction. Reaching for `api.saveExternalMcpServer` directly here would bypass both.
 *
 * @returns The patch, or `null` when the id names no configured card (nothing to write).
 */
export function buildAllowWritePatch(
  sources: readonly SourceConfigItem[],
  connectionId: string,
  remoteName: string,
): { fields: Record<string, string> } | null {
  const source = sources.find((candidate) => candidate.id === connectionId);
  if (!source) return null;
  return { fields: { writeAllowedToolNames: grantWriteFieldValue(source.fields["writeAllowedToolNames"], remoteName) } };
}
