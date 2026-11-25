import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { listMedia } from "#src/features/media/index";
import { resolveMediaPublicUrls } from "#src/features/media/public-urls";
import { mediaListRoute } from "@jini-ai/cms/admin-http/routes/media/list";
import { resolveContentTypes } from "@jini-ai/cms/media/site/content-type-resolution";
import { resolveMediaByteSizes } from "@jini-ai/cms/admin-http/routes/media/byte-size";
import type { MediaRouteRegistrar } from "./deps.js";

/**
 * GET the workspace's media library: the Jini `mediaListRoute` spec behind the admin ports, with
 * this host's media repo and its three batch lookups injected. `media.read` is a direct decision and
 * a missing session is deferred to `authorize`, so an invalid `?kind=` still answers its 400 first.
 */
export const registerAdminMediaListRoute: MediaRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  mountAdminJsonRoute({ errors,
    app,
    spec: mediaListRoute,
    deps: {
      workspaceId: deps.workspaceId,
      authorize: deps.authorize,
      listMedia: async (input) => (await listMedia({ deps: { mediaRepo: deps.mediaRepo }, input })).media,
      resolveContentTypes: ({ media }) => resolveContentTypes({ deps, media }),
      resolvePublicUrls: ({ media }) => resolveMediaPublicUrls({ deps, assets: media }),
      resolveByteSizes: ({ media }) => resolveMediaByteSizes({ deps, media }),
    },
  }, {
    authorization: "direct",
    deferMissingPrincipal: true,
    failure: { operation: "routes/media/list", code: "INTERNAL_ERROR", message: "The media library could not be loaded." },
  });
};
