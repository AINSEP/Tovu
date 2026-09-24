import { useEffect, useState } from "react";

import type { ContentTypeFieldKind } from "../../lib/api";
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
 *
 * `useRecentEntriesConfig` (Collections plan A1, 2026-09-23) is `RecentEntriesConfigFields`'s own
 * config-mutation logic — Collection/Sort/Layout/Columns/Fields/Filter — plus the two hand-copies
 * (`COLLECTION_DISPLAYABLE_FIELD_KINDS`, `humanizeFieldName`) it and the component share, copied
 * from `apps/website/src/features/entries/public-list.ts` for the same reason `lib/api.ts`'s
 * `CONTENT_TYPE_FIELD_KINDS` is hand-copied: that module is server-only and cannot be imported
 * into this browser bundle.
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

/**
 * Field kinds the "Collection list" widget's Sort/Fields/Filter controls offer — mirrors
 * `apps/website/src/features/entries/public-list.ts`'s (unexported)
 * `DEFAULT_DISPLAYABLE_FIELD_KINDS`. Hand-copied on purpose, same precedent as `lib/api.ts`'s own
 * `CONTENT_TYPE_FIELD_KINDS` doc: this admin package cannot import that server-only website code.
 * `relation`/`json` fields are left out — C3's renderer doesn't show them by default either.
 */
export const COLLECTION_DISPLAYABLE_FIELD_KINDS: ReadonlySet<ContentTypeFieldKind> = new Set([
  "text",
  "integer",
  "real",
  "boolean",
  "datetime",
]);

/**
 * `apps/website/src/features/entries/public-list.ts`'s `humanizeFieldName`, hand-copied for the
 * same reason as {@link COLLECTION_DISPLAYABLE_FIELD_KINDS} — turns a declared field name
 * (`"docs_page"`, `"publishedAt"`) into a label (`"Docs page"`, `"Published at"`) for the
 * Fields/Sort/Filter controls.
 */
export function humanizeFieldName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[_-\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());

  if (words.length === 0) return "";
  const [first, ...rest] = words;
  const capitalizedFirst = first.charAt(0).toUpperCase() + first.slice(1);
  return rest.length > 0 ? `${capitalizedFirst} ${rest.join(" ")}` : capitalizedFirst;
}

/** A `where` value coerced from the filter row's raw text input, per the target field's kind —
 *  booleans and numbers travel as their real JS type (matches `CollectionWhereClause.value`'s
 *  `string | number | boolean` shape server-side), everything else stays a string. */
function coerceFilterValue(raw: string, kind: ContentTypeFieldKind | undefined): string | number | boolean {
  if (kind === "boolean") return raw === "true";
  if (kind === "integer" || kind === "real") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  return raw;
}

type Scalar = string | number | boolean;

function isScalar(value: unknown): value is Scalar {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function stringifyScalar(value: Scalar): string {
  if (typeof value !== "boolean") return String(value);
  return value ? "true" : "false";
}

/** The one `[field, value]` pair of a plain, single-key object, or `null` for anything else
 *  (missing, multi-key, an array, …) — split out so {@link readFilterClause} reads as one
 *  straight-line sequence of early returns instead of one compound condition. */
function singleEntry(value: unknown): [string, unknown] | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const keys = Object.keys(value as Record<string, unknown>);
  return keys.length === 1 ? [keys[0], (value as Record<string, unknown>)[keys[0]]] : null;
}

/** Reads the Collection list widget's single supported `where` clause (plan A1: "one filter row")
 *  back out of `config.where`, tolerating anything not shaped like `{ [field]: scalar }`. */
function readFilterClause(config: Record<string, unknown>): { field: string; value: string } | null {
  const entry = singleEntry(config.where);
  if (entry === null) return null;
  const [field, value] = entry;
  if (!isScalar(value)) return null;
  return { field, value: stringifyScalar(value) };
}

function stringConfigValue(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value : "";
}

function numberConfigValue(config: Record<string, unknown>, key: string): number | "" {
  const value = config[key];
  return typeof value === "number" ? value : "";
}

function stringArrayConfigValue(config: Record<string, unknown>, key: string): string[] {
  const value = config[key];
  return Array.isArray(value) ? (value as string[]) : [];
}

function resolveFilterField(draft: string | null, clause: { field: string } | null): string {
  if (draft !== null) return draft;
  return clause !== null ? clause.field : "";
}

/** The filter value box shows what the operator typed, not the coerced stored value: re-rendering
 *  the coerced value mid-typing ate keystrokes ("t" became `false`, "1." became `1`). */
function resolveFilterValue(draft: string | null, clause: { value: string } | null): string {
  if (draft !== null) return draft;
  return clause !== null ? clause.value : "";
}

/**
 * `RecentEntriesConfigFields`'s config-mutation logic (Collections plan A1) — everything the
 * Collection/Sort/Layout/Columns/Fields/Filter controls read and write, so the component itself
 * stays markup (this workspace's "no `.tsx` logic" rule). Unset controls are removed from
 * `config` entirely, never written as `""` (plan A1's own rule), so a never-touched widget config
 * still validates against `RECENT_ENTRIES_REGISTRATION`'s schema exactly as it did before this
 * pass. Choosing a new collection (or clearing it) drops `fields`/`where` too — both are authored
 * against the PREVIOUS collection's field names and mean nothing (or, worse, silently filter by a
 * same-named field on the new type) once the collection changes.
 *
 * The filter field name is also tracked in local `useState`: `config.where` only exists once a
 * value has been typed (an empty value is not a real filter, so it is never written), but the
 * operator picking a field before typing its value still needs that choice to stick across
 * re-renders — `config` alone can't hold "a field is chosen, no value yet".
 */
export function useRecentEntriesConfig(
  config: Record<string, unknown>,
  onChange: (config: Record<string, unknown>) => void,
) {
  const [filterFieldDraft, setFilterFieldDraft] = useState<string | null>(null);
  const [filterValueDraft, setFilterValueDraft] = useState<string | null>(null);

  const clause = readFilterClause(config);
  const collection = stringConfigValue(config, "collection");
  const sort = stringConfigValue(config, "sort");
  const layout = stringConfigValue(config, "layout");
  const columns = numberConfigValue(config, "columns");
  const fields = stringArrayConfigValue(config, "fields");
  const filterField = resolveFilterField(filterFieldDraft, clause);
  const filterValue = resolveFilterValue(filterValueDraft, clause);

  function patch(mutate: (next: Record<string, unknown>) => void): void {
    const next = { ...config };
    mutate(next);
    onChange(next);
  }

  function setCollection(value: string): void {
    setFilterFieldDraft(null);
    setFilterValueDraft(null);
    patch((next) => {
      if (value) next.collection = value;
      else delete next.collection;
      delete next.fields;
      delete next.where;
    });
  }

  function setSort(value: string): void {
    patch((next) => {
      if (value) next.sort = value;
      else delete next.sort;
    });
  }

  function setLayout(value: string): void {
    patch((next) => {
      if (value) next.layout = value;
      else delete next.layout;
      if (value !== "cards") delete next.columns;
    });
  }

  function setColumns(value: string): void {
    patch((next) => {
      if (value === "") delete next.columns;
      else next.columns = Number(value);
    });
  }

  function toggleField(name: string, checked: boolean): void {
    patch((next) => {
      const current = Array.isArray(next.fields) ? (next.fields as string[]) : [];
      const nextFields = checked ? [...current, name] : current.filter((f) => f !== name);
      if (nextFields.length > 0) next.fields = nextFields;
      else delete next.fields;
    });
  }

  function setFilterField(name: string): void {
    setFilterFieldDraft(name || null);
    setFilterValueDraft(null);
    patch((next) => {
      delete next.where;
    });
  }

  function setFilterValue(raw: string, kind: ContentTypeFieldKind | undefined): void {
    setFilterValueDraft(raw);
    patch((next) => {
      if (!filterField || raw === "") {
        delete next.where;
        return;
      }
      next.where = { [filterField]: coerceFilterValue(raw, kind) };
    });
  }

  return {
    collection,
    sort,
    layout,
    columns,
    fields,
    filterField,
    filterValue,
    setCollection,
    setSort,
    setLayout,
    setColumns,
    toggleField,
    setFilterField,
    setFilterValue,
  };
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
