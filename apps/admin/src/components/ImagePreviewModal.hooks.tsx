import { useEffect, useRef, type MouseEvent, type SyntheticEvent } from "react";

/**
 * @file `ImagePreviewModal`'s `<dialog>` lifecycle — split out of the component so it can be
 * swapped for a fake via the `useModal` prop on `ImagePreviewModalProps`, the same
 * `<Name>.tsx`/`<Name>.hooks.tsx` split `ConfirmDialog`/`ConfirmDialog.hooks.tsx` uses in
 * `@jini-ai/admin`. No `-port.hooks.ts`/`-dependencies.hooks.ts` pair: the only outside dependency
 * is the native `<dialog>` element's own `showModal`/`close`, synchronous browser APIs with
 * nothing async to fake a rejection for — same reasoning `ChatFab.hooks.tsx`'s `useFabPosition`
 * gives for skipping a port.
 *
 * The open/close effect has no async work in it (no fetch, no timer), so there is no
 * cancelled-after-unmount race to guard against here — unlike `use-post-template-source.hooks.ts`'s
 * `useTemplateSource`, this effect needs no "disposed" flag at all, and none was added.
 */
/** `showModal()` when the browser supports it (idempotent — a no-op if already open); falls back
 *  to the bare `open` attribute for jsdom, which implements neither `showModal` nor `close`. Split
 *  out of the effect below (with {@link closeDialog}) so neither branch nests past one level —
 *  the un-split version tripped the 9/9 cognitive-complexity ceiling at a measured 15. */
function openDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
    return;
  }
  dialog.setAttribute("open", "");
}

/** The close half of {@link openDialog} — same fallback reasoning, mirrored. */
function closeDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === "function") {
    if (dialog.open) dialog.close();
    return;
  }
  dialog.removeAttribute("open");
}

export interface ImagePreviewModalController {
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
 * Owns `ImagePreviewModal`'s native `<dialog>` open/close lifecycle and its two dismiss paths
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
export function useImagePreviewModal(open: boolean, onClose: () => void): ImagePreviewModalController {
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
