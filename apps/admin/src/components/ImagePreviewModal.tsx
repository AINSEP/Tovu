import { useEffect, useRef, type MouseEvent, type SyntheticEvent } from "react";

/**
 * @file A read-only image lightbox — click a thumbnail, see it at a real, readable size.
 *
 * Built on the native `<dialog>` element (`showModal()`/`close()`), the same foundation
 * `@jini-ai/admin/react`'s `ConfirmDialog` uses: real focus trapping, Escape-as-close, and a
 * backdrop, all courtesy of the browser's own top layer rather than a hand-rolled overlay `<div>` +
 * chosen `z-index`. Not built ON `ConfirmDialog` itself — that component's props are shaped for a
 * confirm/cancel action pair (title, body, two buttons) that this has neither of, just an image and
 * one close affordance — so this mirrors the same `<dialog>`-lifecycle pattern locally (open/close
 * effect, `onCancel` routing Escape through `onClose`, `e.target === dialogRef.current` for backdrop
 * clicks, a jsdom fallback since jsdom implements neither `showModal` nor `close`) rather than
 * forcing image content through a confirm dialog's contract.
 */
export interface ImagePreviewModalProps {
  open: boolean;
  src: string;
  alt: string;
  onClose: () => void;
}

/**
 * @complexity O(1) per open/close transition — one `showModal`/`close` call, no other state.
 */
export function ImagePreviewModal({ open, src, alt, onClose }: ImagePreviewModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (typeof dialog.showModal === "function") {
        if (!dialog.open) dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    } else {
      if (typeof dialog.close === "function") {
        if (dialog.open) dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [open]);

  function handleNativeCancel(e: SyntheticEvent<HTMLDialogElement>) {
    // Fires on Escape. Prevented and routed through `onClose` rather than left to the browser's own
    // close — the effect above is the single source of truth for open/closed, driven by `open`.
    e.preventDefault();
    onClose();
  }

  function handleBackdropClick(e: MouseEvent<HTMLDialogElement>) {
    // A `<dialog>`'s own box is sized to its content, not the viewport — a click landing on the
    // `<dialog>` element itself (not one of its children) is a click on the backdrop area.
    if (e.target === dialogRef.current) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="image-preview-modal"
      aria-label={alt}
      onCancel={handleNativeCancel}
      onClick={handleBackdropClick}
    >
      <button type="button" className="image-preview-modal-close" onClick={onClose} aria-label="Close preview">
        ×
      </button>
      <img src={src} alt={alt} />
    </dialog>
  );
}
