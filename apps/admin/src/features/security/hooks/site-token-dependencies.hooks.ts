import { api, type AdminGeneratedSiteToken, type AdminRevealedSiteToken, type AdminSiteTokenStatus } from "@/lib/api";
import type { SiteTokenPort } from "./site-token-port.hooks";

/** The live implementation, as a module-level singleton — matches
 *  `defaultAccessTokensPort`'s own convention. Every method is a thin bind onto an existing
 *  `api.*` call. */
export const defaultSiteTokenPort: SiteTokenPort = {
  status: () => api.getSiteTokenStatus(),
  reveal: () => api.revealSiteToken(),
  generate: () => api.generateSiteToken(),
};

const INACTIVE_STATUS: AdminSiteTokenStatus = {
  active: false,
  source: "none",
  keyFilePath: "~/.tovu/integrations-root-key.hex",
  runtimeMode: "local",
};

/** An in-memory {@link SiteTokenPort} for tests. Each call defaults to a neutral, overridable
 *  stub — matches `createFakeAccessTokensPort`'s per-call override shape. */
export function createFakeSiteTokenPort(overrides: Partial<SiteTokenPort> = {}): SiteTokenPort {
  return {
    status: overrides.status ?? (() => Promise.resolve(INACTIVE_STATUS)),
    reveal:
      overrides.reveal ??
      (() => Promise.reject(new Error("reveal not stubbed for this test")) as unknown as Promise<AdminRevealedSiteToken>),
    generate:
      overrides.generate ??
      (() =>
        Promise.reject(new Error("generate not stubbed for this test")) as unknown as Promise<AdminGeneratedSiteToken>),
  };
}
