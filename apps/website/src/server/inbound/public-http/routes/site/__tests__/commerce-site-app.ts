import express from "express";
import { createApp as createBaseApp } from "#src/server/runtime/composition/app";
import { registerProductRoutes, type CommerceSiteAdapterDeps } from "../products.js";
import { applySiteConsent } from "../../../middleware/site-consent.js";
import { applySiteCookieConsent } from "../../../middleware/site-cookie-consent.js";
export type CommerceSiteTestDeps = CommerceSiteAdapterDeps & NonNullable<Parameters<typeof createBaseApp>[0]>;
/** Opt-in test composition for the retained theme adapter. Production createApp stays off. */
export function createCommerceSiteTestApp(deps: CommerceSiteTestDeps, _optional: Record<string, never> = {}): express.Express {
  const app = express();
  // Product routes precede the base app's catch-all, so they need its consent gate here too.
  // Mount only on this adapter's paths; the base app gates every other public page itself.
  const consent = express();
  if (deps.cookieConsent) applySiteCookieConsent({ app: consent, deps, consent: deps.cookieConsent });
  else applySiteConsent({ app: consent, deps }, { trustedRegionHeader: deps.consentTrustedRegionHeader });
  app.use('/products', consent);
  registerProductRoutes(app, deps);
  app.use(createBaseApp(deps));
  return app;
}
