import { useEffect, useRef, useState, type MouseEvent, type RefObject, type SyntheticEvent } from "react";

/**
 * @file `ThemeExplore.tsx`'s fullscreen-preview `<dialog>` lifecycle, split out per the
 * `<Name>.tsx`/`<Name>.hooks.tsx` extraction pattern (`ImagePreviewModal.tsx`/
 * `ImagePreviewModal.hooks.tsx`, `App.tsx`/`App.hooks.tsx`). Mirrors `useImagePreviewModal` exactly
 * — same `showModal()`/`close()` with an `open`-attribute jsdom fallback, same Escape/backdrop
 * dismiss paths — `ThemeExplore.tsx`'s own comment already pointed to `ImagePreviewModal.tsx` as
 * this mechanism's origin before this extraction moved it out of the component body (admin
 * TSX-logic-sweep, 2026-09-05).
 *
 * `fullscreen`/`device` stay LOCAL to `ThemeExplore` rather than moving into
 * `useWiredThemeExplore`'s controller — that is an owner-ratified 2026-08-14 DI-migration ruling
 * (see `ThemeExplore.tsx`'s own "STAYS LOCAL" comment) about which HOOK owns this state, not about
 * which FILE it is defined in. This hook keeps `fullscreen` exactly as local as before; only its
 * definition moved out of the component body.
 */

/** Open/close the native `<dialog>` to match `fullscreen` — the same `showModal()`/`close()` with an
 *  `open`-attribute jsdom fallback `ImagePreviewModal.tsx` established. An early return once
 *  `dialog.open` already matches `fullscreen` replaces two separate nested "only call the native
 *  method if not already in that state" checks; behavior-preserving for the jsdom fallback branch
 *  too, since `setAttribute`/`removeAttribute` were already idempotent no-ops when already correct.
 *  @complexity O(1) — four independent branches, no iteration, no nesting deeper than one level. */
function syncFullscreenDialog(dialog: HTMLDialogElement | null, fullscreen: boolean): void {
  if (!dialog) return;
  if (fullscreen === dialog.open) return;
  const supportsNativeDialog = typeof dialog.showModal === "function" && typeof dialog.close === "function";
  if (fullscreen) {
    if (supportsNativeDialog) dialog.showModal();
    else dialog.setAttribute("open", "");
    return;
  }
  if (supportsNativeDialog) dialog.close();
  else dialog.removeAttribute("open");
}

export interface ThemeExploreFullscreenController {
  fullscreen: boolean;
  /** The trigger button's own `onClick={() => setFullscreen(true)}` stays in the component — a
   *  plain forward to a setter, not logic — so this is exposed rather than folded into a hook-owned
   *  `openFullscreen`. */
  setFullscreen: (value: boolean) => void;
  fullscreenTriggerRef: RefObject<HTMLButtonElement | null>;
  dialogRef: RefObject<HTMLDialogElement | null>;
  closeFullscreen: () => void;
  handleFullscreenCancel: (e: SyntheticEvent<HTMLDialogElement>) => void;
  handleFullscreenBackdropClick: (e: MouseEvent<HTMLDialogElement>) => void;
}

/**
 * Owns `ThemeExplore`'s fullscreen-preview `<dialog>` open/close lifecycle and its two dismiss
 * paths (Escape, backdrop click), plus returning focus to the trigger button on close — relocated
 * verbatim out of `ThemeExplore`'s own body (admin TSX-logic-sweep, 2026-09-05); no behavior
 * change, same `ThemeExplore.unit.test.tsx` DOM assertions (`aria-pressed`, the dialog's `open`
 * attribute, focus returning to the trigger) still exercise this through the real hook.
 *
 * @returns `fullscreen`/`setFullscreen`, the two refs to attach to the trigger button and the
 *   `<dialog>`, and the three handlers `ThemeExploreFullscreenDialog` takes as props.
 * @complexity Time/space: O(1) per open/close transition — one `showModal`/`close` call, no other
 *   state.
 */
export function useThemeExploreFullscreen(): ThemeExploreFullscreenController {
  const [fullscreen, setFullscreen] = useState(false);
  const fullscreenTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Same open/close lifecycle `ImagePreviewModal.tsx` established for a native `<dialog>` driven by
  // a boolean prop — see `syncFullscreenDialog`'s own doc comment for the mechanism.
  useEffect(() => {
    syncFullscreenDialog(dialogRef.current, fullscreen);
  }, [fullscreen]);

  function closeFullscreen() {
    setFullscreen(false);
    // `showModal()` restores focus to the previously-focused element in every current browser, but
    // that UA behavior isn't relied on elsewhere in this codebase (`ImagePreviewModal` doesn't
    // either) — explicit here because "focus returns to the trigger" is a hard requirement for this
    // control, not a nice-to-have, and jsdom's `<dialog>` doesn't implement the restoration at all.
    fullscreenTriggerRef.current?.focus();
  }

  function handleFullscreenCancel(e: SyntheticEvent<HTMLDialogElement>) {
    // Fires on Escape. Prevented and routed through `closeFullscreen` rather than left to the
    // browser's own close, so the `fullscreen` state stays the single source of truth the effect
    // above reads — same pattern `ImagePreviewModal.tsx` uses for the same reason.
    e.preventDefault();
    closeFullscreen();
  }

  function handleFullscreenBackdropClick(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) closeFullscreen();
  }

  return {
    fullscreen,
    setFullscreen,
    fullscreenTriggerRef,
    dialogRef,
    closeFullscreen,
    handleFullscreenCancel,
    handleFullscreenBackdropClick,
  };
}
