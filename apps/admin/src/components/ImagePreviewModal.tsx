import { ImagePreviewModal as PackageImagePreviewModal, type ImagePreviewModalProps as PackageProps } from "@jini-ai/ui/admin-widgets";
import type { useImagePreviewModal } from "./ImagePreviewModal.hooks";

// Native-dialog rationale: Jini/packages/ui/src/features/admin-widgets/components/ImagePreviewModal.tsx.
export type ImagePreviewModalProps = Omit<PackageProps, "useModal"> & {
  useModal?: typeof useImagePreviewModal;
};

/** Retain the host's injectable positional hook; rendering and lifecycle belong to Jini.
 *
 * Pre-extraction host rationale (historical names below describe the original layout).
 * The shared implementation and its active lifecycle constraints now live in Jini; Tovu keeps
 * this provenance so the adapter does not erase policy, bug history or the reasons for thresholds.
 *
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
 *
 *  Injectable seam for the dialog's open/close lifecycle. Defaults to the real
 *  {@link useImagePreviewModal}; a test can pass a fake here to exercise `ImagePreviewModal`'s
 *  rendering without a real `<dialog>` lifecycle.
 *
 *  Publishes the close button as agent-addressable via `agentHandle()` (`@jini-ai/agentic`).
 *  Omit to leave it untagged — every existing render then stays byte-identical.
 *
 *  The close button's accessible name (aria-label, and the agent-handle label when `agentHandle`
 *  is set). Defaults to the raw English string — this component has no locale of its own (see
 *  `Themes.tsx`'s file header on `ImagePreviewModal`), so a caller with a translator passes its
 *  own `t("Close preview")` through here instead.
 */
export function ImagePreviewModal({ useModal, ...props }: ImagePreviewModalProps) {
  const useHostModal: PackageProps["useModal"] = useModal
    ? ({ open, onClose }) => useModal(open, onClose)
    : undefined;
  return <PackageImagePreviewModal {...props} useModal={useHostModal} />;
}
