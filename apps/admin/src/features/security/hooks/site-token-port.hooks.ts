import type {
  AdminGeneratedSiteToken,
  AdminImportedSiteToken,
  AdminRevealedSiteToken,
  AdminSiteTokenStartFreshPreview,
  AdminSiteTokenStatus,
  AdminStartedFreshSiteToken,
} from "@/lib/api";

/**
 * @file What `useSiteToken` needs from the outside world, as an interface rather than a direct
 * `lib/api` import — same shape as `access-tokens-port.hooks.ts`/`other-credentials-port.hooks.ts`.
 * No rotate/replace (see `SiteTokenTab.tsx`'s own header); the last three methods are the locked
 * site's recovery ("Paste your old token", "Start fresh").
 */
export interface SiteTokenPort {
  status(): Promise<AdminSiteTokenStatus>;
  /** The raw key value, on demand — see `lib/api.ts`'s `revealSiteToken` doc. */
  reveal(): Promise<AdminRevealedSiteToken>;
  /** Throws (an `ApiError`) on a 409 refusal — see `lib/api.ts`'s `generateSiteToken` doc for the
   *  outcomes and codes. */
  generate(): Promise<AdminGeneratedSiteToken>;
  /** See `lib/api.ts`'s `importSiteToken`. Throws an `ApiError` on a refusal. */
  importToken(token: string): Promise<AdminImportedSiteToken>;
  previewStartFresh(): Promise<AdminSiteTokenStartFreshPreview>;
  /** See `lib/api.ts`'s `startFreshSiteToken`. Throws an `ApiError` on a refusal. */
  startFresh(confirm: string): Promise<AdminStartedFreshSiteToken>;
}
