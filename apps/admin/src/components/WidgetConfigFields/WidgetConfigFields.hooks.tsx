import { useEffect, useState } from "react";

import { isAbortError } from "../../lib/retry-unreachable";

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
 *
 * `useSocialLinksConfig` below is the same relocation for `SocialLinksConfigFields`'s own
 * `updateLink`/`removeLink`/`addLink` (admin TSX-logic-sweep, 2026-09-03) — pure array edits over
 * the `config.links` prop, previously defined inline in that component's body. Extracted verbatim:
 * same 20-link cap, same `{ ...props.config, links: next }` shape passed to `onChange`.
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
export interface SocialLink {
  platform: string;
  url: string;
}

/** `social-links`' own client-side cap (matches the widget's `configSchema` — see
 *  `WidgetConfigFields.tsx`'s file doc for the `SOCIAL_LINKS_REGISTRATION` source). */
const SOCIAL_LINKS_MAX = 20;

/**
 * `SocialLinksConfigFields`'s link-array editor: `links` parsed off `config.links` (an empty array
 * for anything not already shaped as `SocialLink[]`), plus the three mutators the component's rows
 * call. Each mutator computes the next `links` array and calls `onChange` with the whole config,
 * `links` replaced — `config` carries no other state this hook needs to preserve, so a full replace
 * is exactly as safe as a patch here and matches the pre-extraction inline functions verbatim.
 *
 * @param config - The widget's config object; `config.links` is read as `SocialLink[]` (or `[]`).
 * @param onChange - Called with the whole config, `links` replaced — never a partial patch.
 * @returns `links` plus `updateLink`/`removeLink`/`addLink`.
 * @complexity Time/space: O(links.length) per call — same as the array methods each wraps.
 */
export function useSocialLinksConfig(
  config: Record<string, unknown>,
  onChange: (config: Record<string, unknown>) => void,
): {
  links: SocialLink[];
  updateLink: (index: number, patch: Partial<SocialLink>) => void;
  removeLink: (index: number) => void;
  addLink: () => void;
} {
  const links: SocialLink[] = Array.isArray(config.links) ? (config.links as SocialLink[]) : [];

  function updateLink(index: number, patch: Partial<SocialLink>): void {
    const next = links.map((l, i) => (i === index ? { ...l, ...patch } : l));
    onChange({ ...config, links: next });
  }
  function removeLink(index: number): void {
    onChange({ ...config, links: links.filter((_, i) => i !== index) });
  }
  function addLink(): void {
    if (links.length >= SOCIAL_LINKS_MAX) return;
    onChange({ ...config, links: [...links, { platform: "", url: "" }] });
  }

  return { links, updateLink, removeLink, addLink };
}

export function useFetchedOptions<T>(fetchList: () => Promise<T[]>, errorFallback: string) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchList()
      .then((result) => setItems(result))
      .catch((e) => {
        // A page unload cancels an in-flight request with an AbortError (`lib/page-lifecycle.ts`),
        // not a real load failure — surfacing it would leave a stale error in this field if the
        // page is later restored from the back/forward cache with the dialog still mounted.
        if (isAbortError(e)) return;
        setError(e instanceof Error ? e.message : errorFallback);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { items, error };
}
