import { useRef, useState } from "react";
import { useT } from "@jini-ai/chat/react";
import { Icon, RemixIcon, useDismissOnOutsideOrEscape } from "@jini-ai/ui";

/**
 * @file The composer's attached-folders button, after the folder button: the folders the agent may
 * read (and write into through the carded `fs_write_files`). One compact control (folder, count,
 * chevron) so the footer stays on one line (owner, 2026-10-30); it replaced a chip per folder that
 * pushed the model picker and send onto a second row. The hover tooltip lists every folder; a click
 * opens a list with × per folder, because tooltips do not exist on touch. Renders nothing at 0.
 */
export interface PickedFoldersButtonProps {
  readonly folders: readonly string[];
  readonly onRemove: (path: string) => void;
}

/** Both separators: Windows paths too. A trailing separator still yields the folder's own name. */
export function folderName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function PickedFoldersButton({ folders, onRemove }: PickedFoldersButtonProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useDismissOnOutsideOrEscape({ onDismiss: () => setOpen(false) }, { enabled: open, containerRef: rootRef });
  if (folders.length === 0) return null;
  const names = folders.map(folderName);
  const summary = t("Agent reads: {names}", { names: names.join(", ") });
  // Escape from inside the list hands focus back to the trigger instead of dropping it on <body>.
  const onKeyDown = (event: { key: string }) => { if (event.key === "Escape") triggerRef.current?.focus(); };
  // Removing the last folder unmounts this button; the composer input keeps keyboard users in place.
  const remove = (path: string) => {
    if (folders.length === 1) rootRef.current?.closest(".jini-composer")?.querySelector<HTMLElement>(".jini-composer-input")?.focus();
    onRemove(path);
  };
  return (
    <div ref={rootRef} className="tovu-picked-folders" onKeyDown={onKeyDown}>
      {/* `aria-haspopup="menu"` + `aria-expanded`: the dock's own Escape handler leaves the key to an
          open menu (`escape-owned-by-inner-layer.ts`), so Esc closes this list, not the whole dock. */}
      <button ref={triggerRef} type="button" className="jini-composer-attach tovu-picked-folders-trigger" title={summary}
        aria-label={summary} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((was) => !was)}>
        <RemixIcon name="folder-line" size={18} />
        <span className="tovu-picked-folders-count" aria-hidden="true">{folders.length}</span>
        <RemixIcon name="arrow-down-s-line" size={12} className="tovu-picked-folders-chevron" />
      </button>
      {open ? (
        <div className="jini-runtime-dropup tovu-picked-folders-menu" role="menu" aria-label={summary}>
          {folders.map((path, index) => (
            <div key={path} className="tovu-picked-folders-row">
              <RemixIcon name="folder-line" size={15} />
              <span className="tovu-picked-folders-name" title={path}>{names[index]}</span>
              <button type="button" role="menuitem" className="jini-attachment-remove" onClick={() => remove(path)}
                title={t("Stop using {name}", { name: names[index] })} aria-label={t("Stop using {name}", { name: names[index] })}>
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
