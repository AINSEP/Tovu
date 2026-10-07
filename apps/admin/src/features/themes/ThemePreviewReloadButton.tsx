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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-2L20 8M4 16l2.3 3A7 7 0 0 0 17.9 17" />
      </svg>
    </button>
  );
}

export function WiredThemePreviewReloadButton({ disabled }: { disabled?: boolean }) {
  const { label, reload, error } = useThemePreviewReloadButton();
  return (
    <>
      <ThemePreviewReloadButton label={label} reload={reload} disabled={disabled} />
      {error ? <span role="alert">{error}</span> : null}
    </>
  );
}
