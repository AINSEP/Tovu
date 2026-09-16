import { useEffect, useRef, useState, type RefObject } from "react";
import { describeApiError, type AdminMedia } from "../../lib/api";
import { defaultMediaPickerPort } from "./media-picker-dependencies.hooks";
import type { MediaPickerPort } from "./media-picker-port.hooks";

/**
 * @file `MediaPickerDialog`'s data-fetch and Escape-to-cancel state, split out of the component so
 * it can be swapped for a fake via the `useDialog` prop on `MediaPickerDialogProps` — see that
 * prop's doc comment in `MediaPickerDialog.tsx`. Same split `ConfirmDialog`/`ConfirmDialog.hooks.tsx`
 * uses in `@jini-ai/admin`.
 *
 * `useMediaPickerDialog` takes `onSelect`/`onCancel` as two positional callbacks rather than the
 * whole `MediaPickerDialogProps` object — mirrors `useConfirmDialog`'s primitives-in shape there,
 * and avoids a type-only import cycle back into `MediaPickerDialog.tsx` for the `useDialog` prop's
 * own type (`typeof useWiredMediaPickerDialog`). The Escape listener's effect now lists `onCancel`
 * as a dependency (2026-08-21 lint pass) and rebinds whenever its identity changes — every real
 * caller passes a fresh arrow per render, so the listener is torn down and re-added on those
 * renders; the `document.removeEventListener`/`addEventListener` pair in the same synchronous
 * effect run keeps that rebind unobservable (no double-fire, no dropped Escape). This closes the
 * stale-closure gap the old mount-once `[]` had — a caller could previously escape-cancel into a
 * `onCancel` captured from an earlier render.
 *
 * `port` is injected (see `media-picker-port.hooks.ts`) rather than reaching for `lib/api`'s `api`
 * directly, so a test can describe "these items are available" against `createFakeMediaPickerPort`
 * instead of stubbing global `fetch`/spying on `api.listMedia`. `describeApiError` stays a direct
 * import — pure, no host boundary.
 */

/**
 * Fetches the workspace's active media once per mount — mirrors `useExistingInstances`'s exact
 * shape (`null` while loading, a describable `error` string on failure).
 *
 * @param port - Injected `MediaPickerPort` — see `media-picker-port.hooks.ts`.
 * @returns `items` (`null` while the fetch is in flight, otherwise the loaded, active-only list)
 *   and `error` (a describable failure message, or `null`).
 */
export function useMediaPickerItems(port: MediaPickerPort) {
  const [items, setItems] = useState<AdminMedia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    port
      .listMedia()
      .then((r) => setItems(r.media.filter((m) => m.status === "active")))
      .catch((e) => setError(describeApiError(e, "failed to load media")));
  }, [port]);
  return { items, error };
}

/** Binds the real `/api/.../media` client — see `media-picker-dependencies.hooks.ts`. The
 *  zero-argument half of the `useX(dependencies)` / `useWiredX()` pair for
 *  {@link useMediaPickerItems}; not composed by any component directly (only through
 *  {@link useWiredMediaPickerDialog} below), but given its own wired pair since the existing test
 *  file exercises it directly. */
export function useWiredMediaPickerItems() {
  return useMediaPickerItems(defaultMediaPickerPort);
}

/** What {@link useMediaPickerDialog} (and {@link useWiredMediaPickerDialog}) hands back to
 *  `MediaPickerDialog.tsx` — the dialog's full render-time contract. */
export interface MediaPickerDialogController {
  items: AdminMedia[] | null;
  error: string | null;
  select: (item: AdminMedia) => void;
  /** Synchronous URL builder for a thumbnail's `<img src>`, forwarded straight from the injected
   *  {@link MediaPickerPort} — see that port's own `mediaOriginalUrl` doc for why a pure URL
   *  template still crosses this seam rather than staying a direct `lib/api` import in the
   *  component. */
  mediaOriginalUrl: (id: string) => string;
  /** Attach to the Cancel button — see {@link useMediaPickerDialog}'s own focus-management doc
   *  comment. Always present regardless of loading/error/empty/populated state, same reasoning
   *  `useMediaLightbox`'s `closeRef` gives for its own always-available focus target. */
  cancelRef: RefObject<HTMLButtonElement | null>;
}

/**
 * Owns the dialog's own state on top of {@link useMediaPickerItems}: the Escape-to-cancel
 * listener, focus management, and the single submit handler. Split out for the same reason
 * `useWidgetPickerDialog` is — a render-free unit to test the interaction logic against.
 *
 * Focus management (2026-09-16 fix — no dialog wrapper or focus/blur handling existed at all
 * before this): on mount, captures whatever had focus and moves focus onto Cancel (a stable
 * target present regardless of loading/error/empty/populated state); on unmount, restores focus
 * to what was captured. Without this, closing left focus on `<body>` — a keyboard/screen-reader
 * user was dropped to the top of the page instead of back at the control that opened the dialog.
 *
 * @param onSelect - Called with the chosen item when a thumbnail is clicked.
 * @param onCancel - Called on Escape, backdrop click, or the Cancel button.
 * @param deps - Injected dependencies; `deps.port` is the {@link MediaPickerPort} this dialog reads
 *   its media list and thumbnail URLs through.
 * @returns The dialog's full render-time contract — see {@link MediaPickerDialogController}.
 */
export function useMediaPickerDialog(
  onSelect: (item: AdminMedia) => void,
  onCancel: () => void,
  deps: { port: MediaPickerPort }
): MediaPickerDialogController {
  const { items, error } = useMediaPickerItems(deps.port);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  // Captured at mount, before focus moves onto Cancel below — the element that had focus then is,
  // by construction, whatever opened this dialog (e.g. the Posts/Pages editor's "Insert from Media
  // Library" toolbar button). Restored on unmount. This component is only ever rendered while the
  // dialog is open (the caller conditionally mounts it, per `MediaPickerDialog.tsx`'s own doc
  // comment), so mount/unmount IS the open/close transition — same technique `ConfirmDialog`
  // (`@jini-ai/admin`) and this app's own `useMediaLightbox` use for an always-mounted native
  // `<dialog>`'s `showModal()`/`close()` pair, adapted here to a conditionally-mounted div dialog.
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    triggerRef.current = document.activeElement;
    cancelRef.current?.focus();
    return () => {
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel]);

  return { items, error, select: onSelect, mediaOriginalUrl: deps.port.mediaOriginalUrl, cancelRef };
}

/**
 * Binds the real `/api/.../media` client — see `media-picker-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `MediaPickerDialog.tsx` composes this and a test composes {@link useMediaPickerDialog} with
 * `createFakeMediaPickerPort`.
 *
 * @param onSelect - Forwarded to {@link useMediaPickerDialog}.
 * @param onCancel - Forwarded to {@link useMediaPickerDialog}.
 * @returns The dialog's full render-time contract — see {@link MediaPickerDialogController}.
 */
export function useWiredMediaPickerDialog(onSelect: (item: AdminMedia) => void, onCancel: () => void): MediaPickerDialogController {
  return useMediaPickerDialog(onSelect, onCancel, { port: defaultMediaPickerPort });
}
