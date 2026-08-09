import { useEffect, useState } from "react";
import { describeApiError, api, type AdminContentType, type AdminEntry } from "../../../lib/api";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../collections-i18n";

/**
 * @file Everything the collections entries LIST does, so `CollectionEntries.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error strings. Naming follows
 * `hooks/use-settings-slice.hooks.ts` and `hooks/use-dirty-guard.hooks.ts`: `use-<thing>.hooks.ts`.
 * Feature-local because nothing outside `features/collections` needs it; promote to `src/hooks/`
 * only when a second feature actually does.
 */

export interface CollectionEntriesController {
  contentType: AdminContentType | null | undefined;
  entries: AdminEntry[] | null;
  error: string | null;
}

export function useCollectionEntries(props: { contentTypeKey: string }): CollectionEntriesController {
  const locale = useAdminLocale();
  const [contentType, setContentType] = useState<AdminContentType | null | undefined>(undefined);
  const [entries, setEntries] = useState<AdminEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    Promise.all([api.listContentTypes(), api.listEntries({ type: props.contentTypeKey })])
      .then(([typesResult, entriesResult]) => {
        setContentType(typesResult.items.find((t) => t.key === props.contentTypeKey) ?? null);
        setEntries(entriesResult.items);
      })
      .catch((e) => setError(describeApiError(e, t(locale, "failed to load entries"))));
  }

  useEffect(load, [props.contentTypeKey]);

  return { contentType, entries, error };
}
