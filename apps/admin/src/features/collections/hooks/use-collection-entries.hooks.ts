import { useEffect, useState } from "react";
import { describeApiError, type AdminContentType, type AdminEntry } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../collections-i18n";
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
 */

export interface CollectionEntriesController {
  contentType: AdminContentType | null | undefined;
  entries: AdminEntry[] | null;
  error: string | null;
}

export interface CollectionEntriesDependencies {
  port: CollectionEntriesPort;
  locale: string;
}

export function useCollectionEntries(
  props: { contentTypeKey: string },
  deps: CollectionEntriesDependencies
): CollectionEntriesController {
  const { port, locale } = deps;
  const [contentType, setContentType] = useState<AdminContentType | null | undefined>(undefined);
  const [entries, setEntries] = useState<AdminEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    Promise.all([port.listContentTypes(), port.listEntries({ type: props.contentTypeKey })])
      .then(([typesResult, entriesResult]) => {
        setContentType(typesResult.items.find((t) => t.key === props.contentTypeKey) ?? null);
        setEntries(entriesResult.items);
      })
      .catch((e) => setError(describeApiError(e, t(locale, "failed to load entries"))));
  }

  // `port` is added — see `use-page-editor.hooks.ts`'s identical note: a function-scoped value
  // ESLint's exhaustive-deps rule can see, referentially stable in production, so this changes
  // nothing about when the effect re-runs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [props.contentTypeKey, port]);

  return { contentType, entries, error };
}

/**
 * Binds the real `/api/.../content-types`+`/entries` client and the resolved `useAdminLocale()`
 * value — see `collection-entries-dependencies.hooks.ts`. The zero-argument-deps half of the
 * `useX(dependencies)` / `useWiredX()` pair, so `CollectionEntries.tsx` composes this and a test
 * composes {@link useCollectionEntries} with `createFakeCollectionEntriesPort`.
 */
export function useWiredCollectionEntries(props: { contentTypeKey: string }): CollectionEntriesController {
  const locale = useAdminLocale();
  return useCollectionEntries(props, { port: defaultCollectionEntriesPort, locale });
}
