import { useEffect, useState } from "react";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translateThemes } from "../themes-i18n";
import { defaultThemesPort } from "./themes-dependencies.hooks";
import type { ThemesPort } from "./themes-port.hooks";

/** Resolve a bare /themes/explore before mounting the file editor. An empty detail ID would
 * request the registry route (/themes/), whose response has no files array to map.
 */
export function useThemeExploreTheme(
  { themeId }: { themeId: string },
  { port = defaultThemesPort }: { port?: Pick<ThemesPort, "getPresentation"> } = {},
) {
  const [fallback, setFallback] = useState<{ themeId: string | null; error: string | null } | null>(null);
  useEffect(() => {
    if (themeId) {
      setFallback(null);
      return;
    }
    let cancelled = false;
    setFallback(null);
    port.getPresentation().then(({ settings }) => {
      if (!cancelled) setFallback({ themeId: settings.activeThemeId || null, error: null });
    }).catch((error: unknown) => {
      if (!cancelled) setFallback({ themeId: null, error: error instanceof Error ? error.message : "failed to load themes" });
    });
    return () => { cancelled = true; };
  }, [themeId, port]);

  return {
    themeId: themeId || fallback?.themeId || null,
    loading: !themeId && fallback === null,
    error: themeId ? null : fallback?.error ?? null,
  };
}

export function useWiredThemeExploreTheme(
  required: { themeId: string },
  optional: { port?: Pick<ThemesPort, "getPresentation"> } = {},
) {
  const locale = useAdminLocale();
  return { ...useThemeExploreTheme(required, optional), t: (key: string) => translateThemes({ locale: locale, key: key }) };
}
