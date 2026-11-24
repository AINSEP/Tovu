import { useCollectionEntries, type CollectionEntriesController } from "@jini-ai/admin/screens/collections/hooks/use-collection-entries.hooks";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translate } from "../collections-i18n";
import { collectionsHostKit, defaultCollectionEntriesPort } from "../collections-host-ports";

/**
 * @file This host's binding of `@jini-ai/admin`'s `useCollectionEntries`: the real entries port, a
 * `COLLECTIONS_DICT`-bound translator and the collections host kit.
 */

/**
 * Binds the real `/api/.../content-types`+`/entries` client, the resolved `useAdminLocale()`
 * value, and a `COLLECTIONS_DICT`-bound translator — see `collection-entries-dependencies.hooks.ts`.
 * The zero-argument-deps half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `CollectionEntries.tsx` composes this and a test composes {@link useCollectionEntries} with
 * `createFakeCollectionEntriesPort`.
 */
export function useWiredCollectionEntries(props: { contentTypeKey: string }): CollectionEntriesController {
  const locale = useAdminLocale();
  const t = ({ key }: { key: string }, _optional = {}): string => translate({ locale: locale, key: key });
  return useCollectionEntries({ ...props, port: defaultCollectionEntriesPort, locale, t, kit: collectionsHostKit });
}
