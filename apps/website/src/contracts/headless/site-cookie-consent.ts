import type { ConsentState, DeclaredScript, RawContribution, RegionResolver } from '@jini-ai/cookie-consent';

/** The one switch's payload: present = this engine serves the site. */
export interface SiteCookieConsentDeps {
  /** Published construction snapshot only; missing/pending/failed policy keeps embeds inert. */
  embedConsentOff?: () => boolean;
  /** Refresh the construction-time published snapshot after an owner publication. */
  refresh?: () => Promise<void>;
  exportAssets?: () => Promise<readonly string[]>;
  /** This site's region readers (configured ingress plugin + legacy header); empty = strict. */
  regionResolvers: () => Promise<readonly RegionResolver[]>;
  /** Data-only modules from active plugins; the browser mounts them through the shared registry. */
  browserPlugins?: () => Promise<readonly RawContribution[]>;
  /** Active plugin declarations and explicit refusal diagnostics, shared with admin readiness. */
  scriptDeclarations?: () => Promise<{ scripts: readonly DeclaredScript[]; problems: readonly string[] }>;
}
/** A same-origin plugin handler (the PostHog adapter's SDK, adapter module and collector). */
export interface ConsentPluginHttp {
  path: string;
  handle(required: { method: string; path: string; body: Uint8Array; contentType: string; analyticsLevel?: ConsentState['analyticsLevel'] }): Promise<{ status: number; body: string | Uint8Array; contentType?: string; cacheControl?: string }>;
}
export interface ConsentPluginContribution { adapter: RawContribution; http?: ConsentPluginHttp }
