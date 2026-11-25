import { extractPlainTextFromHtml } from "@jini-ai/cms/seo";
import { exportUrlLocations, extractHtmlReferences, outputFileForUrl } from "@jini-ai/devops/static-export";
import { captureStaticSite as captureJiniStaticSite, prepareStaticReport as prepareJiniStaticReport, type StaticCopyHost, type StaticSitePorts } from "@jini-ai/devops/backup/site/static-copy";
import { staticDownloadLayout as jiniStaticDownloadLayout, type StaticDownloadHost } from "@jini-ai/devops/backup/site/static-download-layout";
import { downloadHtmlSourceEdits } from "./download-html-source-edits.js";
import { sharePathAlias } from "@jini-ai/devops/backup/site/share-file-policy";
import { validateSharePath } from "./share-file-policy.js";
import { checkShareLimits } from "./share-policy.js";
import { shareFileStem } from "@jini-ai/devops/backup/site/share-service";
import { allocateStaticExportThemes } from "./static-export-selection.js";
import { siteTempRoot, SITE_TEMP_PREFIXES, type OwnedTempRootScope } from "#src/platform/temp/site-temp-roots";
import { staticLandingPage } from "./static-download-landing.js";

/** @file Binds Jini's static copy and portable layout to this host's parse5 edits, share path policy and limits, theme-folder allocator, landing-page template, file-stem rule and scratch-folder name. */

/** Host values of the portable layout: Tovu's share path policy and limits, the parse5-backed HTML helpers and the byte-pinned landing template. */
export const STATIC_DOWNLOAD_HOST: StaticDownloadHost = {
  sourceEdits: downloadHtmlSourceEdits, validateSharePath, sharePathAlias, allocateThemes: allocateStaticExportThemes,
  checkShareLimits, extractPlainText: extractPlainTextFromHtml, renderLanding: staticLandingPage,
  exportUrlLocations, extractHtmlReferences, outputFileForUrl,
};
const STATIC_COPY_HOST: StaticCopyHost = { sourceEdits: downloadHtmlSourceEdits, fileStem: shareFileStem, tempPrefix: "tovu-static-copy-" };

/** Jini's portable layout with this host's policy bound. */
export function staticDownloadLayout(required: Omit<Parameters<typeof jiniStaticDownloadLayout>[0], "host">, _options = {}): ReturnType<typeof jiniStaticDownloadLayout> {
  return jiniStaticDownloadLayout({ ...required, host: STATIC_DOWNLOAD_HOST });
}

/** Jini's report preparation with this host's source edits bound. */
export function prepareStaticReport(required: Omit<Parameters<typeof prepareJiniStaticReport>[0], "sourceEdits">, _options = {}): ReturnType<typeof prepareJiniStaticReport> {
  return prepareJiniStaticReport({ ...required, sourceEdits: downloadHtmlSourceEdits });
}

/** Jini's static capture with this host's source edits, file-stem rule and scratch-folder name bound. */
export function captureStaticSite(ports: StaticSitePorts, { themeId, publicUrl, tempRoot = siteTempRoot({ prefix: SITE_TEMP_PREFIXES.staticCopy }) }: { themeId?: string; publicUrl?: string; tempRoot?: OwnedTempRootScope } = {}): ReturnType<typeof captureJiniStaticSite> {
  // P11: the render folder is an owned, locked temp root the daily tidy recognises and never removes mid-read.
  return captureJiniStaticSite({ ports, host: STATIC_COPY_HOST }, { themeId, publicUrl, tempRoot });
}
