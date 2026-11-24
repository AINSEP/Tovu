import { useCollections, type CollectionsController } from "@jini-ai/admin/screens/collections/hooks/use-collections.hooks";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { lifecycleFailureMessage, t as translate } from "../collections-i18n";
import { collectionsHostKit, defaultCollectionsPort } from "../collections-host-ports";

/**
 * @file This host's binding of `@jini-ai/admin`'s `useCollections`: the real collections port, a
 * `COLLECTIONS_DICT`-bound translator, the collections host kit and the lifecycle-failure copy.
 */

/**
 * Binds the real `/api/.../content-types` client, the resolved `useAdminLocale()` value, and a
 * `COLLECTIONS_DICT`-bound translator — see
 * `collections-dependencies.hooks.ts`. The zero-argument-deps half of the `useX(dependencies)` /
 * `useWiredX()` pair, so `Collections.tsx` composes this and a test composes {@link useCollections}
 * with `createFakeCollectionsPort`.
 */
export function useWiredCollections(): CollectionsController {
  const locale = useAdminLocale();
  const t = ({ key }: { key: string }, _optional = {}): string => translate({ locale: locale, key: key });
  return useCollections({ port: defaultCollectionsPort, locale, t, kit: collectionsHostKit, lifecycleFailureMessage });
}
