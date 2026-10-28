import { useT } from "@jini-ai/chat/react";
import { Icon } from "@jini-ai/ui";

/**
 * @file Shown when a folder was dropped on the chat but its OS path could not be read — a plain
 * browser tab never exposes one (only the desktop bridge, `window.tovuFiles`, can). The drop itself
 * was swallowed so the folder never uploads; this asks for the path as pasted text instead. Stays
 * until dismissed: the operator needs it while switching to Finder/Explorer to copy the path.
 */
export interface FolderDropPathHintProps {
  readonly onDismiss: () => void;
}

export function FolderDropPathHint({ onDismiss }: FolderDropPathHintProps) {
  const t = useT();
  return (
    <div className="tovu-folder-drop-notice tovu-folder-drop-notice--hint" role="status">
      <span className="tovu-folder-drop-notice__icon" aria-hidden="true">
        <Icon name="folder" size={14} />
      </span>
      <span className="tovu-folder-drop-notice__label">
        {t("Browsers can't share folder paths. Paste the path instead (Finder: ⌥⌘C, Explorer: Ctrl+Shift+C).")}
      </span>
      <button
        type="button"
        className="tovu-folder-drop-notice__dismiss"
        onClick={onDismiss}
        aria-label={t("Dismiss")}
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}
