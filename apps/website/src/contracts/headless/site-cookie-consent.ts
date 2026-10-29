import type { ConsentState, RawContribution, RegionResolver } from '@jini-ai/cookie-consent';

/** The one switch's payload: present = this engine serves the site. */
export interface SiteCookieConsentDeps {
  /** This site's region readers (configured ingress plugin + legacy header); empty = strict. */
  regionResolvers: () => Promise<readonly RegionResolver[]>;
}
/** A same-origin plugin handler (the PostHog adapter's SDK, adapter module and collector). */
export interface ConsentPluginHttp {
  path: string;
  handle(required: { method: string; path: string; body: Uint8Array; contentType: string; analyticsLevel?: ConsentState['analyticsLevel'] }): Promise<{ status: number; body: string | Uint8Array; contentType?: string; cacheControl?: string }>;
}
export interface ConsentPluginContribution { adapter: RawContribution; http?: ConsentPluginHttp }
