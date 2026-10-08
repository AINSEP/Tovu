import { useCallback, useEffect, useState } from "react";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t } from "../themes-i18n";
import {
  freshPreviewUrl,
  reloadThemePreviews,
  subscribeThemePreviewRefresh,
  type ThemePreviewRefresh,
} from "../theme-preview-refresh";

/** Preview state is independent of source-buffer adoption: CSS-only saves must reload dirty editors too. */
export function useThemePreviewRefresh(
  { url, makeRevision = () => crypto.randomUUID() }: { url: string; makeRevision?: () => string },
  _optional: Record<string, never> = {},
) {
  const [frame, setFrame] = useState<ThemePreviewRefresh & { source?: string }>(() => ({
    revision: makeRevision(),
  }));
  useEffect(
    () =>
      subscribeThemePreviewRefresh({
        listener: (next) =>
          setFrame((current) => ({
            ...next,
            path: next.path ?? (current.source === url ? current.path : undefined),
            source: url,
          })),
      }),
    [url],
  );
  // The durable theme feed owns reloads; run-completion notifications only refresh editor data.
  return {
    path: frame.source === url ? frame.path : undefined,
    url: freshPreviewUrl({
      url,
      revision: frame.revision,
      path: frame.source === url ? frame.path : undefined,
    }),
    revision: frame.revision,
  };
}

export function useThemePreviewReloadButton(
  _required: Record<string, never> = {},
  { reload = reloadThemePreviews }: { reload?: () => Promise<void> } = {},
) {
  const locale = useAdminLocale();
  const [error, setError] = useState<string | null>(null);
  const onReload = useCallback(() => {
    setError(null);
    void reload().catch((error: unknown) =>
      setError(error instanceof Error ? error.message : "preview reload failed"),
    );
  }, [reload]);
  return { label: t({ locale: locale, key: "Reload preview" }), reload: onReload, error };
}

/** Keeps dirty content on the POST path; a tool's explicit navigation chooses a public GET. */
export function useThemePreviewFrame(
  {
    liveUrl,
    templateUrl,
    canShowLiveSite,
    makeRevision,
  }: { liveUrl: string; templateUrl: string; canShowLiveSite: boolean; makeRevision?: () => string },
  _optional: Record<string, never> = {},
) {
  const refreshed = useThemePreviewRefresh({ url: canShowLiveSite ? liveUrl : templateUrl, makeRevision });
  return {
    liveUrl: freshPreviewUrl({ url: liveUrl, revision: refreshed.revision, path: refreshed.path }),
    templateUrl: freshPreviewUrl({ url: templateUrl, revision: refreshed.revision }),
    revision: refreshed.revision,
    canShowLiveSite: canShowLiveSite || refreshed.path !== undefined,
  };
}
