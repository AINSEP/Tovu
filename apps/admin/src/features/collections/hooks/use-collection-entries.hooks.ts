import { useEffect, useState } from "react";
import { describeApiError, type AdminContentType, type AdminEntry } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { COLLECTIONS_DICT, t as translate } from "../collections-i18n";
import { defaultCollectionEntriesPort } from "./collection-entries-dependencies.hooks";
import type { CollectionEntriesPort } from "./collection-entries-port.hooks";

/**
 * @file Everything the collections entries LIST does, so `CollectionEntries.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error strings. Naming follows
 * `hooks/use-settings-slice.hooks.ts` and `hooks/use-dirty-guard.hooks.ts`: `use-<thing>.hooks.ts`.
 * Feature-local because nothing outside `features/collections` needs it; promote to `src/hooks/`
 * only when a second feature actually does.
 *
 * `port`/`locale` are injected — see `collection-entries-port.hooks.ts` — rather than reaching
 * `lib/api`/`useAdminLocale()` directly, so a test can describe the load outcome against
 * `createFakeCollectionEntriesPort` instead of stubbing global `fetch`. `useWiredCollectionEntries`
 * below is the pair `CollectionEntries.tsx` actually mounts.
 *
 * `t` (standing i18n rule, 2026-08-11 — see `use-collections.hooks.ts`'s identical note): injected
 * alongside `port`/`locale` so `CollectionEntries.tsx` sources its UI copy from this hook instead of
 * its own `useAdminLocale()`/`COLLECTIONS_DICT` import. `collections-i18n.ts`'s own `t(locale, key)`
 * — aliased `translate` here to avoid colliding with this file's bound `(key) => string` closure —
 * stays a direct, uninjected import for this hook's OWN error string (pure, takes `locale`
 * explicitly, not a host reach).
 */

export interface CollectionEntriesController {
  contentType: AdminContentType | null | undefined;
  entries: AdminEntry[] | null;
  error: string | null;
  /** Bound translator — `CollectionEntries.tsx`'s only source of UI copy; see this file's own
   *  header. */
  t: (key: string) => string;
}

export interface CollectionEntriesDependencies {
  port: CollectionEntriesPort;
  locale: string;
  t: (key: string) => string;
}

export function useCollectionEntries(
  props: { contentTypeKey: string },
  deps: CollectionEntriesDependencies
): CollectionEntriesController {
  const { port, locale, t } = deps;
  const [contentType, setContentType] = useState<AdminContentType | null | undefined>(undefined);
  const [entries, setEntries] = useState<AdminEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    Promise.all([port.listContentTypes(), port.listEntries({ type: props.contentTypeKey })])
      .then(([typesResult, entriesResult]) => {
        setContentType(typesResult.items.find((entry) => entry.key === props.contentTypeKey) ?? null);
        setEntries(entriesResult.items);
      })
      .catch((e) => setError(describeApiError(e, translate(locale, "failed to load entries"))));
  }

  // `port` is added — see `use-page-editor.hooks.ts`'s identical note: a function-scoped value
  // ESLint's exhaustive-deps rule can see, referentially stable in production, so this changes
  // nothing about when the effect re-runs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [props.contentTypeKey, port]);

  return { contentType, entries, error, t };
}

/**
 * Binds the real `/api/.../content-types`+`/entries` client, the resolved `useAdminLocale()`
 * value, and a `COLLECTIONS_DICT`-bound translator — see `collection-entries-dependencies.hooks.ts`.
 * The zero-argument-deps half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `CollectionEntries.tsx` composes this and a test composes {@link useCollectionEntries} with
 * `createFakeCollectionEntriesPort`.
 */
export function useWiredCollectionEntries(props: { contentTypeKey: string }): CollectionEntriesController {
  const locale = useAdminLocale();
  const t = (key: string): string => COLLECTIONS_DICT[locale]?.[key] ?? key;
  return useCollectionEntries(props, { port: defaultCollectionEntriesPort, locale, t });
}
