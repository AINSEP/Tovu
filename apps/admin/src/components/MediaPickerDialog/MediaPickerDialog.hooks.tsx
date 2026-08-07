import { useEffect, useState } from "react";
import { api, describeApiError, type AdminMedia } from "../../lib/api";

/**
 * @file `MediaPickerDialog`'s data-fetch and Escape-to-cancel state, split out of the component so
 * it can be swapped for a fake via the `useDialog` prop on `MediaPickerDialogProps` — see that
 * prop's doc comment in `MediaPickerDialog.tsx`. Same split `ConfirmDialog`/`ConfirmDialog.hooks.tsx`
 * uses in `@jini-ai/admin`.
 *
 * `useMediaPickerDialog` takes `onSelect`/`onCancel` as two positional callbacks rather than the
 * whole `MediaPickerDialogProps` object — mirrors `useConfirmDialog`'s primitives-in shape there,
 * and avoids a type-only import cycle back into `MediaPickerDialog.tsx` for the `useDialog` prop's
 * own type (`typeof useMediaPickerDialog`). The Escape listener's effect still runs once at mount
 * (`[]`, `eslint-disable` intact below) and closes over whichever `onCancel` was passed at that
 * render — unchanged from the pre-split behavior, where the same effect closed over `props.onCancel`
 * captured at mount; making that a live dependency would be a behavior change, out of scope here.
 */

/**
 * Fetches the workspace's active media once per mount — mirrors `useExistingInstances`'s exact
 * shape (`null` while loading, a describable `error` string on failure).
 *
 * @returns `items` (`null` while the fetch is in flight, otherwise the loaded, active-only list)
 *   and `error` (a describable failure message, or `null`).
 */
export function useMediaPickerItems() {
  const [items, setItems] = useState<AdminMedia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .listMedia()
      .then((r) => setItems(r.media.filter((m) => m.status === "active")))
      .catch((e) => setError(describeApiError(e, "failed to load media")));
  }, []);
  return { items, error };
}

/**
 * Owns the dialog's own state on top of {@link useMediaPickerItems}: the Escape-to-cancel
 * listener and the single submit handler. Split out for the same reason `useWidgetPickerDialog`
 * is — a render-free unit to test the interaction logic against.
 */
export function useMediaPickerDialog(onSelect: (item: AdminMedia) => void, onCancel: () => void) {
  const { items, error } = useMediaPickerItems();

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
