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
}

export function FolderPathButton({ picking, onPick }: FolderPathButtonProps) {
  const t = useT();
  const label = t("Insert a folder path");
  return (
    <button type="button" className="jini-composer-attach tovu-composer-folder-path" onClick={onPick} disabled={picking}
      title={label} aria-label={label}>
      {/* 18px, not "+"'s 20px: the folder glyph fills more of its box, so this reads at the same weight. */}
      <RemixIcon name="folder-line" size={18} />
    </button>
  );
}
