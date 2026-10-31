import { useEffect, useState } from "react";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { describeApiError } from "@/lib/api";
import type { SiteTransferPort } from "./site-transfer-dependencies.hooks";

export const STATIC_EXPORT_OPTIONS_KEY = ["sites", "static-export-options"] as const;

/** Keep an ordered, deliberate selection across roster refreshes; removed IDs cannot be exported.
 * @complexity O(roster + selection) per render, one options request through the query owner.
 */
export function useStaticExportSelection({ port, t }: { port: SiteTransferPort; t: Translate }, _options = {}) {
  const roster = useFetchQuery({ key: [...STATIC_EXPORT_OPTIONS_KEY], fetch: () => port.staticExportOptions({}) });
  const [selection, setSelection] = useState<readonly string[] | null>(null);
  const themes = roster.data?.themes;
  useEffect(() => {
    if (!themes) return;
    const installed = new Set(themes.map(theme => theme.themeId));
    setSelection(previous => previous === null
      ? themes.filter(theme => theme.themeId === roster.data!.activeThemeId).map(theme => theme.themeId)
      : previous.filter(id => installed.has(id)));
  }, [themes, roster.data?.activeThemeId]);
  const installed = new Set(themes?.map(theme => theme.themeId));
  const selectedThemeIds = (selection ?? []).filter(id => installed.has(id));
  return {
    staticThemes: themes,
    selectedThemeIds,
    staticExportReady: roster.data !== undefined && !roster.error && selectedThemeIds.length > 0,
    staticOptionsLoading: roster.data === undefined && !roster.error,
    staticOptionsError: roster.error ? describeApiError(roster.error, t("Couldn't load sites to export.")) : null,
    toggleStaticTheme: ({ themeId }: { themeId: string }, _options = {}) => {
      if (!installed.has(themeId)) return;
      setSelection(previous => (previous ?? []).includes(themeId) ? previous!.filter(id => id !== themeId) : [...previous ?? [], themeId]);
    },
    selectAllStaticThemes: ({ checked }: { checked: boolean }, _options = {}) => setSelection(checked ? themes!.map(theme => theme.themeId) : []),
  };
}

export type StaticExportSelection = ReturnType<typeof useStaticExportSelection>;
