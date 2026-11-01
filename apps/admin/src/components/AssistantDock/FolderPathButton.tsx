import { useT } from "@jini-ai/chat/react";
import { RemixIcon } from "@jini-ai/ui";

/**
 * @file The composer's folder button, rendered right after "+" through `footerLeadingAccessory`. It
 * opens the OS folder dialog on this machine and inserts the chosen path (`useNativeFolderPicker`).
 * Reuses `.jini-composer-attach`, as Jini's own working-directory button does, so its size, hover and
 * focus match "+" exactly instead of approximating them.
 */
export interface FolderPathButtonProps {
  readonly picking: boolean;
  readonly onPick: () => void;
  /** True in a browser tab: the dialog opens on the computer running Tovu, which may not be in front
   *  of the owner. The desktop app's dialog opens in front of its own window, so it says nothing. */
  readonly remote?: boolean;
}

export function FolderPathButton({ picking, onPick, remote = false }: FolderPathButtonProps) {
  const t = useT();
  const label = t("Insert a folder path");
  // Owner bug 11-01: from a browser tab the click seemed to do nothing while a native dialog waited
  // on the server's screen. The note shows only while the dialog is open (cleared on pick or cancel).
  return (
    <span className="tovu-composer-folder-path-wrap">
      <button type="button" className="jini-composer-attach tovu-composer-folder-path" onClick={onPick} disabled={picking}
        title={label} aria-label={label}>
        {/* 18px, not "+"'s 20px: the folder glyph fills more of its box, so this reads at the same weight.
            The arrow points up (owner, 2026-10-30): the composer sits at the bottom of the page. */}
        <RemixIcon name="folder-upload-line" size={18} />
      </button>
      {picking && remote ? (
        <span className="jini-runtime-dropup tovu-composer-folder-status" role="status">
          {t("Folder window opened on the computer running Tovu")}
        </span>
      ) : null}
    </span>
  );
}
