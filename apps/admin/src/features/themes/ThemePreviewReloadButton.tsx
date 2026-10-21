import { useThemePreviewReloadButton } from "./hooks/use-theme-preview-refresh.hooks";

export function ThemePreviewReloadButton({
  label,
  reload,
  disabled = false,
}: {
  label: string;
  reload: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="theme-explore-fullscreen-trigger"
      aria-label={label}
      title={label}
      onClick={reload}
      disabled={disabled}
    >
      {/* One circular arrow (Lucide `rotate-cw`, ISC). The two-arrow sync glyph it replaced read
          as unfamiliar (owner, 2026-10-10). */}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
      </svg>
    </button>
  );
}

/** `reloadPreviews` defaults (inside the hook) to the real every-preview reload; a test passes its own. */
export function WiredThemePreviewReloadButton({ disabled, reloadPreviews }: { disabled?: boolean; reloadPreviews?: () => Promise<void> }) {
  const { label, reload, error } = useThemePreviewReloadButton({}, reloadPreviews ? { reload: reloadPreviews } : {});
  return (
    <>
      <ThemePreviewReloadButton label={label} reload={reload} disabled={disabled} />
      {error ? <span role="alert">{error}</span> : null}
    </>
  );
}
