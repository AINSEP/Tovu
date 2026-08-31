import { useEffect, useRef, type MouseEvent, type SyntheticEvent } from "react";

/**
 * @file `MessageOverflowModal`'s `<dialog>` lifecycle — mirrors `ImagePreviewModal.hooks.tsx`'s
 * open/close/backdrop/Escape handling line for line (same native `<dialog>` foundation
 * `@jini-ai/admin/react`'s `ConfirmDialog` uses: real focus trapping, Escape-as-close, and a
 * backdrop, all courtesy of the browser's own top layer). Owned locally rather than importing that
 * file's hook directly — `ImagePreviewModal.tsx`'s own doc gives the same reasoning for why IT
 * doesn't reuse `ConfirmDialog`'s implementation despite the identical lifecycle shape: a future
 * image-specific tweak to that hook should never silently change an unrelated modal's behavior too.
 * No `-port.hooks.ts` pair, same reasoning as `ImagePreviewModal.hooks.tsx`: the only outside
 * dependency is the native `<dialog>` element's own synchronous `showModal`/`close`, nothing async
 * to fake a rejection for.
 */
function openDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
    return;
  }
  dialog.setAttribute("open", "");
}

function closeDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === "function") {
    if (dialog.open) dialog.close();
    return;
  }
  dialog.removeAttribute("open");
}

export interface MessageOverflowModalController {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  /** Fires on the dialog's native `cancel` event (Escape). Prevented and routed through `onClose`
   *  rather than left to the browser's own close — the lifecycle effect is the single source of
   *  truth for open/closed, driven by `open`. */
  handleNativeCancel: (e: SyntheticEvent<HTMLDialogElement>) => void;
  /** A `<dialog>`'s own box is sized to its content, not the viewport — a click landing on the
   *  `<dialog>` element itself (not one of its children) is a click on the backdrop area. */
  handleBackdropClick: (e: MouseEvent<HTMLDialogElement>) => void;
}

/**
 * Owns `MessageOverflowModal`'s native `<dialog>` open/close lifecycle and its two dismiss paths
 * (Escape, backdrop click) — the close button itself stays a plain `onClick={onClose}` in the
 * component, since it needs no state of its own.
 *
 * @param open - Whether the dialog should be showing.
 * @param onClose - Called on any dismiss path (close button, backdrop click, Escape).
 * @returns `dialogRef` to attach to the `<dialog>` element, plus its `cancel`/backdrop-click
 *   handlers.
 * @complexity Time/space: O(1) per open/close transition — one `showModal`/`close` call, no other
 *   state.
 */
export function useMessageOverflowModal(open: boolean, onClose: () => void): MessageOverflowModalController {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) openDialog(dialog);
    else closeDialog(dialog);
  }, [open]);

  function handleNativeCancel(e: SyntheticEvent<HTMLDialogElement>) {
    e.preventDefault();
    onClose();
  }

  function handleBackdropClick(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  return { dialogRef, handleNativeCancel, handleBackdropClick };
}
