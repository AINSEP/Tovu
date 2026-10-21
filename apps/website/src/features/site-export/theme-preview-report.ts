import { extractAssetUrls, extractCssUrls, type ExportReport } from "@jini-ai/devops/static-export";

export interface ThemePreviewExportSize {
  themeCount: number; htmlSizeMultiplier: number; sizeMultiplier: number; additionalPages: number;
}

/** Measured bytes relative to the normal routes and their assets, using the export owner's crawlers.
 * O(export bytes), with the same one CSS-hop boundary as the exporter. Shared assets count once. */
export function themePreviewExportSize({ report, themeCount }: { report: ExportReport; themeCount: number }, _options = {}): ThemePreviewExportSize {
  const main = report.routes.succeeded.filter(route => !route.path.startsWith("/_themes/"));
  const previews = report.routes.succeeded.filter(route => route.path.startsWith("/_themes/"));
  const mainHtml = main.filter(route => route.contentType?.includes("text/html"));
  const prefix = report.basePath ?? "";
  const prefixes = ["/theme-assets/", "/agent-icons/", "/m/"].map(path => prefix + path);
  const assets = new Set(main.flatMap(route => extractAssetUrls({ html: route.data, prefixes })).map(url => url.slice(prefix.length)));
  for (const asset of report.assets.succeeded) {
    if (!assets.has(asset.url) || !asset.contentType?.includes("text/css")) continue;
    for (const url of extractCssUrls({ css: asset.data.toString("utf8"), cssUrl: asset.url, prefixes: ["/theme-assets/", "/agent-icons/", "/m/"] })) assets.add(url);
  }
  const mainBytes = main.reduce((sum, route) => sum + Buffer.byteLength(route.data), 0)
    + report.assets.succeeded.filter(asset => assets.has(asset.url)).reduce((sum, asset) => sum + asset.data.byteLength, 0);
  const allBytes = report.routes.succeeded.reduce((sum, route) => sum + Buffer.byteLength(route.data), 0)
    + report.assets.succeeded.reduce((sum, asset) => sum + asset.data.byteLength, 0);
  const mainHtmlBytes = mainHtml.reduce((sum, route) => sum + Buffer.byteLength(route.data), 0);
  const previewBytes = previews.reduce((sum, route) => sum + Buffer.byteLength(route.data), 0);
  return { themeCount, additionalPages: previews.length,
    htmlSizeMultiplier: mainHtmlBytes === 0 ? 1 : (mainHtmlBytes + previewBytes) / mainHtmlBytes,
    sizeMultiplier: mainBytes === 0 ? 1 : allBytes / mainBytes };
}
