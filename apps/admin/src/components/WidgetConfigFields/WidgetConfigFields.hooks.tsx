import { useEffect, useState } from "react";

/**
 * @file `WidgetConfigFields.tsx`'s data-fetching state, split out per the `@jini-ai/admin`
 * `<Name>.tsx`/`<Name>.hooks.tsx` extraction pattern (`ConfirmDialog.tsx`/`ConfirmDialog.hooks.tsx`
 * in that package).
 *
 * Unlike `Select`/`WidgetPickerDialog`, this component had no named hook to relocate before this
 * pass — `MenuConfigFields` and `ContactFormConfigFields` each carried their own inline
 * `useState`/`useEffect` pair (menus vs. forms), copy-pasted rather than shared. `useFetchedOptions`
 * below is a genuine extraction, not a relocation: it is the one hook both sub-components now call,
 * parameterized by the fetch call and the fallback error message, so the "start null, fetch once on
 * mount, describe a rejection" behavior is defined exactly once. The two call sites in
 * `WidgetConfigFields.tsx` still behave identically to the pre-extraction code — same fetch timing,
 * same error-message fallback logic — this only removes the duplication between them.
 */

/**
 * Fetches a list once on mount and exposes it alongside a describable error, for the two
 * `WidgetConfigFields.tsx` sub-components (`MenuConfigFields`, `ContactFormConfigFields`) whose
 * config field is a `<select>` over a server-side list.
 *
 * @param fetchList - Called once, on mount; its resolved array becomes `items`.
 * @param errorFallback - Used when the rejection is not an `Error` instance (mirrors the original
 *   inline `e instanceof Error ? e.message : "..."` each call site had before this extraction).
 * @returns `items` (`null` while the fetch is in flight, otherwise the loaded list) and `error` (a
 *   describable failure message, or `null`).
 * @example
 * const { items: menus, error } = useFetchedOptions(() => api.listMenus().then((r) => r.menus), "failed to load menus");
 */
export function useFetchedOptions<T>(fetchList: () => Promise<T[]>, errorFallback: string) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchList()
      .then((result) => setItems(result))
      .catch((e) => setError(e instanceof Error ? e.message : errorFallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { items, error };
}
