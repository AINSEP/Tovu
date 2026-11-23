import { request } from "@/lib/admin-http/request";
import { createCollectionsApi } from "@jini-ai/admin/screens/collections/api/collections-api";

/**
 * @file The admin's collections binding: `@jini-ai/admin`'s collections API client, bound once to
 * this host's authenticated `request`. Every collections caller reads this singleton.
 */

/** The admin API calls of the collections feature, over this host's `request`. */
export const collectionsApi = createCollectionsApi({ request });
