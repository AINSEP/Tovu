import type {
  AdminGeneratedSiteKey,
  AdminImportedSiteKey,
  AdminRevealedSiteKey,
  AdminSiteKeyStartFreshPreview,
  AdminSiteKeyStatus,
  AdminStartedFreshSiteKey,
} from "@/lib/api";

/**
 * @file What `useSiteKey` needs from the outside world, as an interface rather than a direct
 * `lib/api` import — same shape as `access-tokens-port.hooks.ts`/`other-credentials-port.hooks.ts`.
 * No rotate/replace (see `SiteKeyTab.tsx`'s own header); the last three methods are the locked
 * site's recovery ("Paste your old site key", "Start fresh").
 */
export interface SiteKeyPort {
  status(): Promise<AdminSiteKeyStatus>;
  /** The raw key value, on demand — see `lib/api.ts`'s `revealSiteKey` doc. */
  reveal(): Promise<AdminRevealedSiteKey>;
  /** Throws (an `ApiError`) on a 409 refusal — see `lib/api.ts`'s `generateSiteKey` doc for the
   *  outcomes and codes. */
  generate(): Promise<AdminGeneratedSiteKey>;
  /** See `lib/api.ts`'s `importSiteKey`. Throws an `ApiError` on a refusal. */
  importSiteKey(siteKey: string): Promise<AdminImportedSiteKey>;
  previewStartFresh(): Promise<AdminSiteKeyStartFreshPreview>;
  /** See `lib/api.ts`'s `startFreshSiteKey`. Throws an `ApiError` on a refusal. */
  startFresh(confirm: string): Promise<AdminStartedFreshSiteKey>;
}
