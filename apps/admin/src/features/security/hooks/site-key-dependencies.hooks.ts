import { api } from "@/lib/api";
import type { SiteKeyPort } from "./site-key-port.hooks";

/** The live implementation, as a module-level singleton — matches
 *  `defaultAccessTokensPort`'s own convention. Every method is a thin bind onto an existing
 *  `api.*` call. */
export const defaultSiteKeyPort: SiteKeyPort = {
  status: () => api.getSiteKeyStatus(),
  reveal: () => api.revealSiteKey(),
  generate: () => api.generateSiteKey(),
  importSiteKey: (siteKey) => api.importSiteKey({ siteKey }),
  previewStartFresh: () => api.previewSiteKeyStartFresh(),
  startFresh: (confirm) => api.startFreshSiteKey(confirm),
};
