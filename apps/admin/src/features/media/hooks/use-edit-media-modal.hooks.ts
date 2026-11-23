import { openLightboxDialog, closeLightboxDialog } from "@jini-ai/ui/admin-widgets";
import { useEffect, useRef, type MouseEvent, type SyntheticEvent } from "react";

import { isDialogBackdropClick } from "../../../lib/dialog-backdrop-click";

/**
 * @file `EditMediaModal`'s native `<dialog>` lifecycle — the metadata edit form used to render as
 * a full-width `.card` pushing the grid down (`Media.tsx`'s own header comment has the history);
 * owner ask (2026-09-07): reach it from an eye icon on the card instead, as a modal. This hook owns
 * exactly the open/close/backdrop/Escape mechanics, same shape as `apps/admin/src/features/pages/ThemePageDetailsModal.hooks.tsx`'s
 * `useThemePageDetailsModal` and `AssistantDock/MessageOverflowModal.hooks.tsx` — copied rather than
 * imported, same reasoning those two give each other: a future media-specific tweak (e.g. warning
 * on unsaved changes before backdrop-dismiss) should never silently change an unrelated table's
 * modal, and vice versa.
 *
 * Only one instance is ever mounted — `Media.tsx`'s `MediaLibraryPanel` renders exactly one
 * `<EditMediaModal>`, toggling only its `item` prop as the selection changes (`editingId`/
 * `editingItem` in `use-media.hooks.ts`), the same "controlled, never conditionally unmounted"
 * shape `ConfirmDialog`/`MediaLightbox`/`ThemePageDetailsModal` all use. The actual form content
 * (`EditMediaPanel`) still gets a `key={item.id}` from its caller so switching the edit target
 * remounts it and reseeds its draft — this hook has no opinion on that; it only opens and closes
 * the `<dialog>` box around whatever is currently keyed inside it.
 */
export interface EditMediaModalController {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  /** Fires on the dialog's native `cancel` event (Escape). Prevented and routed through `onClose`
   *  rather than left to the browser's own close — the lifecycle effect below is the single source
   *  of truth for open/closed, driven by `open`. */
  handleNativeCancel: (e: SyntheticEvent<HTMLDialogElement>) => void;
  /** Closes only for a click on the backdrop: targeted at the `<dialog>` itself AND outside its box.
   *  The dialog's own padding is the dialog element too, so the target alone is not enough (B137). */
  handleBackdropClick: (e: MouseEvent<HTMLDialogElement>) => void;
}

/**
 * Owns `EditMediaModal`'s native `<dialog>` open/close lifecycle and its two dismiss paths
 * (Escape, backdrop click) — Save/Cancel stay plain `onClick` handlers inside `EditMediaPanel`
 * itself, since they need no dialog-level state.
 *
 * @param open - Whether the dialog should be showing (`editingItem !== null` at the call site).
 * @param onClose - Called on any dismiss path (Cancel, Save, backdrop click, Escape) — the caller
 *   clears `editingId` the same way it already did for the old inline panel's `onCancel`.
 * @returns `dialogRef` to attach to the `<dialog>` element, plus its `cancel`/backdrop-click
 *   handlers.
 * @complexity Time/space: O(1) per open/close transition — one `showModal`/`close` call, no other
 *   state.
 */
export function useEditMediaModal(open: boolean, onClose: () => void): EditMediaModalController {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) openLightboxDialog(dialog);
    else closeLightboxDialog(dialog);
  }, [open]);

  function handleNativeCancel(e: SyntheticEvent<HTMLDialogElement>) {
    e.preventDefault();
    onClose();
  }

  function handleBackdropClick(e: MouseEvent<HTMLDialogElement>) {
    if (isDialogBackdropClick({ dialog: dialogRef.current, event: e })) onClose();
  }

  return { dialogRef, handleNativeCancel, handleBackdropClick };
}
