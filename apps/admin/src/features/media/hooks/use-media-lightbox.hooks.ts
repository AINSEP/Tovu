import { useEffect, useId, useRef } from "react";

import type { AdminMedia } from "@/lib/api";
import { isValidLightboxIndex, lightboxHasNext, lightboxHasPrev, resolveLightboxItem } from "../rules";

/**
 * @file Everything `MediaLightbox` does, so the component in `Media.tsx` is only markup.
 *
 * Extracted verbatim — same refs, same effect key, same guarded `showModal`/`close` calls, same
 * focus management. The doc comments below moved WITH the code they describe; several are
 * decision records (why this is keyed on `isOpen` and not `activeIndex`, the known video-controls
 * arrow-key limitation) and a comment separated from its code stops being read.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local
 * because nothing outside `features/media` needs it.
 */

export interface MediaLightboxHookProps {
  /** The full grid list, not just the open item — kept as the whole array (rather than the
   *  caller resolving `items[activeIndex]` itself) so this hook can compute prev/next
   *  boundaries for arrow-key nav from the same data its caller already has in scope. */
  items: AdminMedia[];
  /** Index into `items` that is open, or `null` when closed. An index rather than the item
   *  itself so navigating just moves this number — the caller (`Media()`) doesn't need a second
   *  piece of state to track "which one," and this hook doesn't need to search `items` to
   *  find "where am I" when deciding whether prev/next exist. */
  activeIndex: number | null;
  onNavigate: (index: number) => void;
  onClose: () => void;
}

export interface MediaLightboxController {
  titleId: string;
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  closeRef: React.RefObject<HTMLButtonElement | null>;
  item: AdminMedia | null;
  hasPrev: boolean;
  hasNext: boolean;
  handleNativeCancel: (e: React.SyntheticEvent<HTMLDialogElement>) => void;
  handleBackdropClick: (e: React.MouseEvent<HTMLDialogElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLDialogElement>) => void;
  goToPrev: () => void;
  goToNext: () => void;
}

/** `<dialog>` may not support `showModal()` in a test/older-browser environment — falls back to the
 *  `open` attribute directly. Guards against calling `showModal()` on an already-open dialog, which
 *  throws `InvalidStateError` in real browsers. Extracted out of the open/close effect below (was
 *  its most deeply-nested branch) so it can be driven directly against a real `HTMLDialogElement`
 *  without mounting `MediaLightbox`. */
export function openDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

/** The close-side mirror of {@link openDialog} — same fallback and already-closed guard. */
export function closeDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === "function") {
    if (dialog.open) dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

/**
 * The open/close effect's own body, extracted to a top-level function rather than left as the
 * nested closure `useEffect` originally held. That nesting — an `if/else` for open-vs-closed, each
 * branch itself calling into a guarded `if/else` for the fallback check — was this hook's most
 * expensive shape under cognitive complexity (each nesting level adds its own penalty on top of the
 * branch itself); the same branches read flat once `openDialog`/`closeDialog` carry their own
 * nested guard instead of it living inline here.
 *
 * @param triggerRef Written to (not just read) on open — this is where "which element opened the
 * dialog" gets captured, before focus moves into it.
 */
export function syncLightboxDialog(
  dialog: HTMLDialogElement,
  isOpen: boolean,
  triggerRef: React.RefObject<Element | null>,
  closeRef: React.RefObject<HTMLButtonElement | null>
): void {
  if (isOpen) {
    triggerRef.current = document.activeElement;
    openDialog(dialog);
    // Focus the close action, not whichever nav arrow happens to render first — a single-item
    // grid has no nav arrows at all, and the close button is the one control guaranteed to
    // exist regardless of position in the list, so it's a stable, always-available focus target
    // (same reasoning as `ConfirmDialog` explicitly choosing Cancel over letting the browser's
    // showModal() default land wherever it likes).
    closeRef.current?.focus();
  } else {
    closeDialog(dialog);
    if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
  }
}

/**
 * @complexity O(1) per open/close/navigate — one `showModal`/`close` call per open/close
 * transition, one array index bounds check per arrow-key or arrow-button press.
 */
export function useMediaLightbox(props: MediaLightboxHookProps): MediaLightboxController {
  const { items, activeIndex, onNavigate, onClose } = props;
  // See `ConfirmDialog`'s own `titleId` comment: `useId()` here is the standing rule for any
  // dialog heading id in this codebase, not a defense against a collision this specific shared
  // instance can actually hit today (only one `MediaLightbox` is ever mounted by `Media()`).
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Captured at the moment `activeIndex` flips from `null`, before focus moves into the dialog —
  // the element that had focus then is, by construction, whichever card's expand button opened
  // this lightbox. Restored on close, same mechanism as `ConfirmDialog.triggerRef`.
  const triggerRef = useRef<Element | null>(null);
  const isOpen = activeIndex !== null;
  const item = resolveLightboxItem(items, activeIndex);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    syncLightboxDialog(dialog, isOpen, triggerRef, closeRef);
    // Deliberately keyed on `isOpen`, not `activeIndex` — navigating to a different item while
    // already open changes `activeIndex` without an open/close transition, and re-running
    // `showModal()` on an already-open dialog would throw (`InvalidStateError`) in real browsers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function handleNativeCancel(e: React.SyntheticEvent<HTMLDialogElement>) {
    // Same reasoning as `ConfirmDialog.handleNativeCancel`: always prevented so the effect above
    // stays the single source of truth for open/closed, with Escape routed through `onClose` so
    // the caller's own state update is what actually calls `dialog.close()`.
    e.preventDefault();
    onClose();
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    // Same box-vs-content-box reasoning as `ConfirmDialog.handleBackdropClick`.
    if (e.target === dialogRef.current) onClose();
  }

  function goTo(nextIndex: number) {
    // Clamps rather than wrapping past either end — a "next" press on the last asset staying on
    // the last asset (not silently looping back to the first) is the less surprising default for
    // an operator navigating a specific set of uploads, not a slideshow.
    if (!isValidLightboxIndex(items, nextIndex)) return;
    onNavigate(nextIndex);
  }

  function goToPrev() {
    if (activeIndex === null) return;
    goTo(activeIndex - 1);
  }

  function goToNext() {
    if (activeIndex === null) return;
    goTo(activeIndex + 1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDialogElement>) {
    if (activeIndex === null) return;
    // Known limitation, not fixed here: when the currently-focused element is a `<video controls>`
    // (the "video" stage's own native control surface), a real browser's built-in seek behavior
    // for ArrowLeft/ArrowRight fires independently of this handler, so pressing an arrow key while
    // the video itself has focus both seeks the video AND navigates the lightbox. Narrowing this
    // would need knowing the active item's resolved preview stage, which is private state inside
    // `MediaPreview` (by design — see that component's own doc comment on why `Media()` doesn't
    // track content-type itself). Flagged rather than worked around silently.
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(activeIndex + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(activeIndex - 1);
    }
  }

  const hasPrev = lightboxHasPrev(activeIndex);
  const hasNext = lightboxHasNext(items, activeIndex);

  return { titleId, dialogRef, closeRef, item, hasPrev, hasNext, handleNativeCancel, handleBackdropClick, handleKeyDown, goToPrev, goToNext };
}
