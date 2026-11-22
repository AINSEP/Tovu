import { useEffect, useState } from "react";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";

import { describeApiError } from "@/lib/admin-http/request";
import type { SiteTransferPort } from "./site-transfer-dependencies.hooks";

import { type Translate } from '@jini-ai/core/text';
export const STATIC_EXPORT_OPTIONS_KEY = ["sites", "static-export-options"] as const;

/** The selection with `themeId` removed when it was chosen, or appended when it was not. */
function toggledSelection({ previous, themeId }: { previous: readonly string[] | null; themeId: string }, _options: Record<string, never> = {}): readonly string[] {
  if (previous?.includes(themeId)) return previous.filter(id => id !== themeId);
  return [...previous ?? [], themeId];
}

/** What the export controls show for the roster query: ready, still loading, or the reason it failed. */
function describeRosterStatus(
  { roster, selectedCount, t }: { roster: { data: unknown; error: unknown }; selectedCount: number; t: Translate }, _options: Record<string, never> = {},
) {
  return {
    staticExportReady: roster.data !== undefined && !roster.error && selectedCount > 0,
    staticOptionsLoading: roster.data === undefined && !roster.error,
    staticOptionsError: roster.error ? describeApiError({ e: roster.error, fallback: t("Couldn't load sites to export.") }) : null,
  };
}

/** Keep an ordered, deliberate selection across roster refreshes; removed IDs cannot be exported.
 * @complexity O(roster + selection) per render, one options request through the query owner.
 */
export function useStaticExportSelection({ port, t }: { port: SiteTransferPort; t: Translate }, _options?: Record<string, never>) {
  const roster = useFetchQuery({ key: [...STATIC_EXPORT_OPTIONS_KEY], fetch: () => port.staticExportOptions({}) });
  const [selection, setSelection] = useState<readonly string[] | null>(null);
  const themes = roster.data?.themes;
  const activeThemeId = roster.data?.activeThemeId;
  useEffect(() => {
    if (!themes) return;
    const installed = new Set(themes.map(theme => theme.themeId));
    setSelection(previous => previous === null
      ? themes.filter(theme => theme.themeId === activeThemeId).map(theme => theme.themeId)
      : previous.filter(id => installed.has(id)));
  }, [themes, roster.data?.activeThemeId]);
  const installed = new Set(themes?.map(theme => theme.themeId));
  const selectedThemeIds = (selection ?? []).filter(id => installed.has(id));
  return {
    staticThemes: themes,
    selectedThemeIds,
    ...describeRosterStatus({ roster, selectedCount: selectedThemeIds.length, t }),
    toggleStaticTheme: ({ themeId }: { themeId: string }, _options = {}) => {
      if (!installed.has(themeId)) return;
      setSelection(previous => toggledSelection({ previous, themeId }));
    },
    selectAllStaticThemes: ({ checked }: { checked: boolean }, _options = {}) => {
      if (checked && !themes) throw new Error("static export has no loaded sites to select");
      setSelection(checked && themes ? themes.map(theme => theme.themeId) : []);
    },
  };
}

export type StaticExportSelection = ReturnType<typeof useStaticExportSelection>;
