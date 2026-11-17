import { sitesApi } from "@/features/sites/api/sites-api";
import type { SiteKeyPort } from "./site-key-port.hooks";

/** The live implementation, as a module-level singleton — matches
 *  `defaultAccessTokensPort`'s own convention. Every method is a thin bind onto an existing
 *  `api.*` call. */
export const defaultSiteKeyPort: SiteKeyPort = {
  status: () => sitesApi.getSiteKeyStatus(),
  reveal: () => sitesApi.revealSiteKey(),
  generate: () => sitesApi.generateSiteKey(),
  importSiteKey: ({ siteKey }, _optional = {}) => sitesApi.importSiteKey({ siteKey }),
  previewStartFresh: () => sitesApi.previewSiteKeyStartFresh(),
  startFresh: ({ confirm }, _optional = {}) => sitesApi.startFreshSiteKey({ confirm }),
};
