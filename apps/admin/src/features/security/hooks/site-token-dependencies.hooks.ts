import { api } from "@/lib/api";
import type { SiteTokenPort } from "./site-token-port.hooks";

/** The live implementation, as a module-level singleton — matches
 *  `defaultAccessTokensPort`'s own convention. Every method is a thin bind onto an existing
 *  `api.*` call. */
export const defaultSiteTokenPort: SiteTokenPort = {
  status: () => api.getSiteTokenStatus(),
  reveal: () => api.revealSiteToken(),
  generate: () => api.generateSiteToken(),
};
