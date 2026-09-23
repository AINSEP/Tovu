import { agentHandle } from "@jini-ai/agentic";

import { useImagePreviewModal } from "./ImagePreviewModal.hooks";

/**
 * @file A read-only image lightbox — click a thumbnail, see it at a real, readable size.
 *
 * Built on the native `<dialog>` element (`showModal()`/`close()`), the same foundation
 * `@jini-ai/admin/react`'s `ConfirmDialog` uses: real focus trapping, Escape-as-close, and a
 * backdrop, all courtesy of the browser's own top layer rather than a hand-rolled overlay `<div>` +
 * chosen `z-index`. Not built ON `ConfirmDialog` itself — that component's props are shaped for a
 * confirm/cancel action pair (title, body, two buttons) that this has neither of, just an image and
 * one close affordance — so this mirrors the same `<dialog>`-lifecycle pattern locally rather than
 * forcing image content through a confirm dialog's contract.
 *
 * The lifecycle (open/close effect, `onCancel` routing Escape through `onClose`,
 * `e.target === dialogRef.current` for backdrop clicks, a jsdom fallback since jsdom implements
 * neither `showModal` nor `close`) lives in `ImagePreviewModal.hooks.tsx`, split out the same way
 * `SeeMore`/`SeeMore.hooks.tsx` does: this file stays props-and-JSX only, and the `useModal` prop
 * below lets a test render this JSX against a fake hook.
 */
export interface ImagePreviewModalProps {
  open: boolean;
  src: string;
  alt: string;
  onClose: () => void;
  /** Injectable seam for the dialog's open/close lifecycle. Defaults to the real
   *  {@link useImagePreviewModal}; a test can pass a fake here to exercise `ImagePreviewModal`'s
   *  rendering without a real `<dialog>` lifecycle. */
  useModal?: typeof useImagePreviewModal;
  /** Publishes the close button as agent-addressable via `agentHandle()` (`@jini-ai/agentic`).
   *  Omit to leave it untagged — every existing render then stays byte-identical. */
  agentHandle?: string;
  /** The close button's accessible name (aria-label, and the agent-handle label when `agentHandle`
   *  is set). Defaults to the raw English string — this component has no locale of its own (see
   *  `Themes.tsx`'s file header on `ImagePreviewModal`), so a caller with a translator passes its
   *  own `t("Close preview")` through here instead. */
  closeLabel?: string;
}

export function ImagePreviewModal({
  open,
  src,
  alt,
  onClose,
  useModal = useImagePreviewModal,
  agentHandle: handle,
  closeLabel = "Close preview",
}: ImagePreviewModalProps) {
  const { dialogRef, handleNativeCancel, handleBackdropClick } = useModal(open, onClose);

  return (
    <dialog
      ref={dialogRef}
      className="image-preview-modal"
      aria-label={alt}
      onCancel={handleNativeCancel}
      onClick={handleBackdropClick}
    >
      <button
        type="button"
        className="image-preview-modal-close"
        onClick={onClose}
        aria-label={closeLabel}
        {...(handle ? agentHandle(handle, { role: "button", label: closeLabel }) : {})}
      >
        ×
      </button>
      <img src={src} alt={alt} />
    </dialog>
  );
}
