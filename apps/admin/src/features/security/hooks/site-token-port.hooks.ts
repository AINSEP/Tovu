import type { AdminGeneratedSiteToken, AdminRevealedSiteToken, AdminSiteTokenStatus } from "@/lib/api";

/**
 * @file What `useSiteToken` needs from the outside world, as an interface rather than a direct
 * `lib/api` import — same shape as `access-tokens-port.hooks.ts`/`other-credentials-port.hooks.ts`.
 * Three methods, no update/delete: this tab has no rotate/replace, by design (see
 * `SiteTokenTab.tsx`'s own header for why).
 */
export interface SiteTokenPort {
  status(): Promise<AdminSiteTokenStatus>;
  /** The raw key value, on demand — see `lib/api.ts`'s `revealSiteToken` doc. */
  reveal(): Promise<AdminRevealedSiteToken>;
  /** Throws (an `ApiError`) rather than resolving when a key is already active — see
   *  `lib/api.ts`'s `generateSiteToken` doc for the two markers this can throw with. */
  generate(): Promise<AdminGeneratedSiteToken>;
}
