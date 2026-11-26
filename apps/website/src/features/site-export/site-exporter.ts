import { exportHostSite as runExport, selectDeclaredThemeScripts } from "@jini-ai/devops/static-export/site/site-exporter";
import type { ExportSiteRouteDeps as EngineRouteDeps } from "@jini-ai/devops/static-export/site/site-exporter";
import type { ExportReport } from "@tovu/contracts/export-report";
import type { SiteCookieConsentDeps } from "@jini-ai/core/contracts/headless/site-cookie-consent";
import type { RequestListener } from "node:http";
import { extractListingMoreHrefs, extractListingPageHrefs, listingJsonNextPath } from "@jini-ai/cms/listing";
import { trackFetch } from "@jini-ai/diagnostics/observability";
import type { ObservabilityPort } from "@jini-ai/core/contracts/observability";
import { resolveThemeLayout } from "@jini-ai/cms/themes/layout";
import type { RouteManifestDeps } from "./route-manifest.js";
import { publicPageSecurityHeaders } from "#src/features/theme/public-page-security-headers";
import { withoutNativeFormTools } from "#src/platform/html/published-webmcp-strip";
import { buildPreviewExportManifest } from "./theme-preview-manifest.js";
import { themePreviewExportSize } from "./theme-preview-report.js";
import type { SettingsRepoPort } from "@jini-ai/core/settings";
import { bindExportMediaUrls, type ExportMediaUrlHostDeps } from "./media-url-bindings.js";
import { exportHtml } from "@jini-ai/cms/html/site/export-html-policy";
import { EXPORT_PREFLIGHT_COPY } from "./export-preflight-copy.js";

export interface ExportSiteRouteDeps extends RouteManifestDeps, ExportMediaUrlHostDeps {
  readonly clock: { nowIso(): string };
  readonly settingsRepo?: SettingsRepoPort;
  readonly siteTitleReady?: Promise<void>;
  /** Mounted consent runtime assets are supplied by composition, without importing the server. */
  readonly cookieConsent?: SiteCookieConsentDeps;
  readonly createSiteApp: (optional?: { themeId?: string }) => RequestListener;
  /** Traces each loopback render/asset fetch as one outbound span (method, host/port, status —
   *  never the route path). `RouteDeps.observability`; the no-op port in hermetic roots. */
  readonly observability: ObservabilityPort;
}

export interface ExportSiteOptions {
  /** The same composition-root object `createApp`/`apps/website/src/server/runtime/composition/deps.ts` already build — the exporter
   *  boots the real app with this, exactly like `cli/commands/serve.ts` does. */
  routeDeps: ExportSiteRouteDeps;
  outputDir: string;
  /** By default, replace this export's files and keep unrelated files (removing files this process
   *  did not write is destructive — see `cli/commands/export.ts` for the `--clean` flag).
   *  Pass `true` to remove the directory's existing contents before writing. */
  clean?: boolean;
  /**
   * When set (e.g. `"/my-repo"` for a host that serves the site under a repository subpath), every root-relative reference this
   * exporter writes — HTML `href`/`src`/`srcset`/`poster`, `sitemap.xml`'s `<loc>`, `robots.txt`'s `Sitemap:` line, a
   * redirect stub's target — is rewritten to carry this prefix. Omitted/empty (the default) leaves
   * every byte this exporter writes IDENTICAL to a pre-`--base-path` export — proven by
   * `site-exporter.test.ts`'s own "unset is inert" regression test, not just asserted in this
   * comment.
   */
  basePath?: string;
  /** Destination URL supplied by this export request or deploy target; never saved as site identity. */
  publicUrl?: string;
  /** Request-local theme override for a selected static capture; never activates it. */
  themeId?: string;
  /** Portable static copies render one theme; deployment builds retain previews. */
  includeThemePreviews?: boolean;
}


export function exportSite({ routeDeps, ...options }: ExportSiteOptions, _options = {}): Promise<ExportReport> {
  return runExport({ ...options, routeDeps: { ...routeDeps, fetch: globalThis.fetch, trackFetch, preflightCopy: EXPORT_PREFLIGHT_COPY,
    buildPreviewExportManifest: ({ routeDeps: supplied }, optional) => buildPreviewExportManifest({ routeDeps: supplied as EngineRouteDeps & ExportSiteRouteDeps }, optional),
    bindExportMediaUrls: () => bindExportMediaUrls({ deps: routeDeps }),
    themeLayout: { resolve: ({ theme }) => ({ pagesDir: resolveThemeLayout({}, { apiVersion: theme.apiVersion as 2 | undefined }).pagesDir, assetUrlPrefix: `/theme-assets/${theme.id}/` }) },
    assetUrlPrefixes: ["/theme-assets/", "/agent-icons/", "/m/", "/api/agent-plugin-exports/v1/", "/_consent/"],
    declaredThemeAssets: ({ activeThemeId }) => selectDeclaredThemeScripts({ themes: routeDeps.themes, activeThemeId }),
    requestHeaders: { "x-tovu-static-export": "1" }, exportHtml, withoutNativeFormTools, publicPageSecurityHeaders,
    extractListingMoreHrefs, extractListingPageHrefs, listingJsonNextPath, themePreviewExportSize, reportInfo: message => console.info(message),
  } });
}
