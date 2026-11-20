import { ThemePreviewReloadControl } from "@jini-ai/admin/react";
import { useThemePreviewReloadButton } from "./hooks/use-theme-preview-refresh.hooks";

/** `reloadPreviews` defaults (inside the hook) to the real every-preview reload; a test passes its own. */
export function WiredThemePreviewReloadButton({ disabled, reloadPreviews,
  useThemePreviewReloadButtonHook = useThemePreviewReloadButton }: { disabled?: boolean; reloadPreviews?: () => Promise<void>;
  useThemePreviewReloadButtonHook?: typeof useThemePreviewReloadButton; }) {
  const { label, reload, error } = useThemePreviewReloadButtonHook({}, reloadPreviews ? { reload: reloadPreviews } : {});
  return (
    <>
      <ThemePreviewReloadControl className="theme-explore-fullscreen-trigger" label={label} reload={reload} disabled={disabled} />
      {error ? <span role="alert">{error}</span> : null}
    </>
  );
}
