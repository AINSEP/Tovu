import { useEffect, useMemo, useState } from "react";
import { filterSitemapEntries, parseSitemapXml, type SitemapUrlEntry } from "../rules";
import { defaultSitemapPort } from "./sitemap-dependencies.hooks";
import type { SitemapPort } from "./sitemap-port.hooks";

/**
 * @file `SitemapModal`'s own state — the fetch-once-per-open of `/sitemap.xml`, the parsed-vs-raw
 * view toggle, the filter box, and the Escape-to-close listener. Split out of the component the
 * same way `useMediaPickerDialog` is split from `MediaPickerDialog.tsx`: `SitemapModal.tsx` is
 * conditionally rendered by `Seo.tsx` only while open (never kept mounted-but-hidden), so mounting
 * this hook IS "the modal opened" — the same lifecycle `useMediaPickerDialog` relies on for its own
 * once-per-mount fetch and Escape listener.
 *
 * `port` is injected (see `sitemap-port.hooks.ts`) rather than importing `sitemap-dependencies
 * .hooks.ts`'s `defaultSitemapPort` directly, so a test can describe "the sitemap has these URLs"
 * or "the fetch fails with this message" via `createFakeSitemapPort` instead of stubbing global
 * `fetch`. `useWiredSitemapModal` below is the real-port half `SitemapModal.tsx` actually mounts.
 */

export type SitemapModalView = "table" | "raw";
/** `"disabled"` is a real, terminal state, not a stalled `"loading"`: with `sitemapEnabled` false the
 *  modal deliberately never fetches, so there is nothing in flight to be loading. Naming it keeps
 *  `SitemapModal.tsx`'s header honest — `sitemapModalTitle`/`SitemapModalHeaderActions` both key off
 *  `status === "ready"`, so a URL count and the raw/table toggle stay off a sitemap that is off. */
export type SitemapModalStatus = "disabled" | "loading" | "error" | "ready";

/** What {@link useSitemapModal} needs from its caller. An object rather than trailing positional
 *  parameters specifically so the `SitemapModal.tsx` `useModal` test seam forwards it whole: a
 *  positional `enabled` can be silently dropped by a shorter test double (TypeScript accepts a
 *  function of fewer parameters), which is exactly how the "this never fetches" claim below went
 *  untested while the fetch fired on every open. */
export interface SitemapModalInputs {
  /** `settings.sitemapEnabled` — when `false`, `/sitemap.xml` is never requested at all. */
  enabled: boolean;
  /** Called on the Escape-to-close path — see {@link useSitemapModal}. */
  onClose: () => void;
}

/** What {@link useSitemapModal} (and {@link useWiredSitemapModal}) hands back to
 *  `SitemapModal.tsx` — the modal's full render-time contract. */
export interface SitemapModalController {
  status: SitemapModalStatus;
  /** A describable failure message, set only while `status === "error"`. */
  error: string | null;
  /** The exact response text from `GET /sitemap.xml`, set only while `status === "ready"`. */
  xmlText: string;
  /** Every parsed `<url>` entry, unfiltered — `SitemapModal.tsx`'s header URL count reads this. */
  entries: SitemapUrlEntry[];
  /** `entries` narrowed by {@link filter}. */
  filteredEntries: SitemapUrlEntry[];
  filter: string;
  setFilter: (value: string) => void;
  view: SitemapModalView;
  setView: (view: SitemapModalView) => void;
  /** Re-runs the fetch — `SitemapModal.tsx`'s footer Regenerate button calls this after a
   *  successful regenerate, so the count/table/raw view all reflect the freshly rebuilt sitemap
   *  without the operator closing and reopening the modal. */
  refetch: () => void;
}

/**
 * Owns the sitemap-viewer modal's data and view state.
 *
 * @param port - Injected {@link SitemapPort} — see that file's own doc for why this is a separate
 *   port from `SeoPort`.
 * @param required - `enabled` (gates the fetch entirely) and `onClose` (called on the modal's
 *   Escape-to-close path; the click-to-close/footer Close button paths stay plain
 *   `onClick={onClose}` in the component, same split `useMediaPickerDialog` uses for its own Escape
 *   listener vs. its plain-`onClick` Cancel button). See {@link SitemapModalInputs}.
 * @returns The modal's full render-time contract — see {@link SitemapModalController}.
 */
export function useSitemapModal(port: SitemapPort, required: SitemapModalInputs): SitemapModalController {
  const { enabled, onClose } = required;
  const [status, setStatus] = useState<SitemapModalStatus>(enabled ? "loading" : "disabled");
  const [error, setError] = useState<string | null>(null);
  const [xmlText, setXmlText] = useState("");
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<SitemapModalView>("table");
  // Bumped by `refetch()` to re-run the fetch effect below without duplicating its body — the same
  // "dependency the effect reacts to, not a value the effect reads" shape a retry button commonly
  // uses when the thing being retried takes no arguments of its own.
  const [fetchToken, setFetchToken] = useState(0);

  useEffect(() => {
    // Branch INSIDE the effect, never around the hook call: `SitemapModal.tsx` reads `useModal`
    // unconditionally (Rules of Hooks), so "skip the fetch" has to be expressed here. Before this
    // guard existed the fetch fired on every open regardless of `sitemapEnabled`, and — worse than
    // the wasted request — a resolved response flipped `status` to `"ready"`, which put a URL count
    // in the header and a live raw/table toggle on a modal whose body reads "Sitemap is off."
    if (!enabled) {
      setStatus("disabled");
      setError(null);
      setXmlText("");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setError(null);
    port
      .fetchSitemapXml()
      .then((r) => {
        if (cancelled) return;
        setXmlText(r.text);
        setStatus("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load the sitemap");
        setStatus("error");
      });
    // `cancelled` guards against a stale response landing after a newer `refetch()` already
    // started — the same race-guard shape `use-page-editor.hooks.ts`'s own effects use elsewhere
    // in this admin for an unrelated fetch.
    return () => {
      cancelled = true;
    };
  }, [port, fetchToken, enabled]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  // Re-parsed only when the fetched text actually changes, not on every filter keystroke — a
  // filter-box re-render would otherwise re-run `DOMParser` over the whole document each time.
  const entries = useMemo(() => (status === "ready" ? parseSitemapXml(xmlText) : []), [status, xmlText]);
  const filteredEntries = useMemo(() => filterSitemapEntries(entries, filter), [entries, filter]);

  return {
    status,
    error,
    xmlText,
    entries,
    filteredEntries,
    filter,
    setFilter,
    view,
    setView,
    refetch: () => setFetchToken((prev) => prev + 1),
  };
}

/**
 * Binds the real `/sitemap.xml` fetch — see `sitemap-dependencies.hooks.ts`.
 *
 * The zero-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so `SitemapModal
 * .tsx` composes this and a test composes {@link useSitemapModal} with `createFakeSitemapPort`.
 *
 * @param required - Forwarded verbatim to {@link useSitemapModal}.
 */
export function useWiredSitemapModal(required: SitemapModalInputs): SitemapModalController {
  return useSitemapModal(defaultSitemapPort, required);
}
