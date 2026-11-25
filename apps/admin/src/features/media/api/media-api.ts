import { createMediaApi } from "@jini-ai/admin/screens/media/api/media-api";
import { request } from "../../../lib/admin-http/request";
import { siteUrl } from "../../../lib/site-url";

/**
 * @file The admin's media binding: `@jini-ai/admin`'s media API client, bound once to this host's
 * authenticated `request` and public-site `siteUrl`. Every media caller reads this singleton; the
 * credential/provider-map types live with the factory in `@jini-ai/admin/screens/media/api/media-api`.
 */

/** The admin API calls of the media feature, over this host's `request`. */
export const mediaApi = createMediaApi({ request, siteUrl });
