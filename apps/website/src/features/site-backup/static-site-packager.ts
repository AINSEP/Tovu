import type { StaticSitePackagerPort, StaticSitePackage, StaticSiteIdentity } from "../source-control/index.js";
import type { ExportReport } from "../site-export/index.js";
import { SiteShareRefusal } from "./share-policy.js";
import { claimArchivePaths } from "./share-zip.js";
import { prepareStaticReport } from "./static-copy.js";
import { LANDING_FILE } from "./static-download-landing.js";
import { staticDownloadLayout } from "./static-download-layout.js";

/**
 * @file Implements `source-control`'s `StaticSitePackagerPort`: the same portable static copy the
 * backup/share download builds, flattened into commit files. Lives beside the code it calls so
 * `source-control` never imports `site-backup`.
 */

function packageSite({ report, site }: { report: ExportReport; site: StaticSiteIdentity }, _options: Record<string, never> = {}): StaticSitePackage {
  try {
    const rendered = prepareStaticReport({ report });
    const files = staticDownloadLayout({ copy: { files: rendered.files, publicOrigin: rendered.publicOrigin, siteSlug: site.slug, themeId: site.themeId,
      metadata: { theme: site.theme, routes: rendered.routes, redirectFiles: rendered.redirectFiles, failed: rendered.failed, skipped: rendered.skipped },
      readme: { name: site.name } } }).map(file => ({ path: file.path, data: file.content }));
    claimArchivePaths({ entries: files }, { manifest: false });
    return { ok: true, files };
  } catch (error) {
    if (error instanceof SiteShareRefusal && /collision|aliases/i.test(error.message)) {
      return { ok: false, kind: "destination-collision", message: error.message };
    }
    throw error;
  }
}

/** Stateless and dependency-free: one instance serves every commit and preview. */
export function createStaticSitePackager(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): StaticSitePackagerPort {
  return { entryFile: LANDING_FILE, packageSite };
}
