import { ThemePreviewReloadControl } from "@jini-ai/cms/themes/react";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { reloadThemePreviews } from "./theme-preview-refresh";
import { t } from "./themes-i18n";

/** `reloadPreviews` defaults to the real every-preview reload; a test passes its own. */
export function WiredThemePreviewReloadButton({
  disabled,
  reloadPreviews = reloadThemePreviews,
  useAdminLocaleHook = useAdminLocale,
}: {
  disabled?: boolean;
  reloadPreviews?: () => Promise<void>;
  useAdminLocaleHook?: typeof useAdminLocale;
}) {
  const locale = useAdminLocaleHook();
  return (
    <ThemePreviewReloadControl
      label={t({ locale, key: "Reload preview" })}
      failureLabel={t({ locale, key: "preview reload failed" })}
      reloadPreviews={reloadPreviews}
      disabled={disabled}
      icon={
        // One circular arrow (Lucide `rotate-cw`, ISC). The two-arrow sync glyph it replaced read
        // as unfamiliar (owner, 2026-10-10).
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      }
    />
  );
}
