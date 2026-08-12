import { useEffect, useState } from "react";
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
 * own type (`typeof useWiredMediaPickerDialog`). The Escape listener's effect still runs once at
 * mount (`[]`, `eslint-disable` intact below) and closes over whichever `onCancel` was passed at
 * that render — unchanged from the pre-split behavior, where the same effect closed over
 * `props.onCancel` captured at mount; making that a live dependency would be a behavior change,
 * out of scope here.
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

/**
 * Owns the dialog's own state on top of {@link useMediaPickerItems}: the Escape-to-cancel
 * listener and the single submit handler. Split out for the same reason `useWidgetPickerDialog`
 * is — a render-free unit to test the interaction logic against.
 */
export function useMediaPickerDialog(onSelect: (item: AdminMedia) => void, onCancel: () => void, deps: { port: MediaPickerPort }) {
  const { items, error } = useMediaPickerItems(deps.port);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { items, error, select: onSelect };
}

/**
 * Binds the real `/api/.../media` client — see `media-picker-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `MediaPickerDialog.tsx` composes this and a test composes {@link useMediaPickerDialog} with
 * `createFakeMediaPickerPort`.
 */
export function useWiredMediaPickerDialog(onSelect: (item: AdminMedia) => void, onCancel: () => void) {
  return useMediaPickerDialog(onSelect, onCancel, { port: defaultMediaPickerPort });
}
