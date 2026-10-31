import { mkdtemp, readdir, readFile, lstat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExportReport } from "../site-export/site-exporter.js";
import { shareFileStem } from "./share-service.js";
import { downloadForms } from "../site-export/export-html-policy.js";

export interface StaticSiteMetadata {
  exportedAt: string;
  theme: string;
  routes: string[];
  failed: { routes: ExportReport["routes"]["failed"]; assets: ExportReport["assets"]["failed"] };
  skipped: { routes: ExportReport["skippedManifestEntries"]; assets: string[]; references: ExportReport["droppedReferences"] };
  /** Generated redirects are delivered, but are not pages/posts in the README count. */
  redirectFiles?: readonly string[];
}
export type StaticSiteCopy = { metadata: StaticSiteMetadata; filename: string; siteSlug?: string; themeId?: string; publicOrigin?: string; readme?: { name: string; words: string }; files: readonly { path: string; content: Buffer }[] } | { reason: string };
export interface StaticSitePorts {
  render?: (required: { outputDir: string; clean: boolean; themeId?: string }) => Promise<ExportReport>;
  context: () => Promise<{ name: string; slug: string; theme: string; themeId?: string; timeZone?: string }>;
  now: () => Date;
  /** Installed, valid themes only; copied once at static job start. */
  themes?: () => readonly { themeId: string; title: string }[];
}

/** Static copies are informational only. Import never restores their files or trusts their metadata. */
export function isStaticSitePath({ path: name }: { path: string }, _options = {}): boolean {
  return name === "static_site" || name.startsWith("static_site/");
}

/** One instant in the site's zone, with an explicit ISO offset and a named, human-readable zone. */
function exportStamp({ date, timeZone }: { date: Date; timeZone?: string }, _options = {}) {
  const zone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "longOffset" }).formatToParts(date);
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const day = `${fields.year}-${fields.month}-${fields.day}`;
  const offset = fields.timeZoneName === "GMT" ? "+00:00" : fields.timeZoneName!.replace("GMT", "");
  return { iso: `${day}T${fields.hour}:${fields.minute}:${fields.second}${offset}`, filename: `${day}-${fields.hour}${fields.minute}`,
    words: `${new Intl.DateTimeFormat("en-US", { timeZone: zone, dateStyle: "full" }).format(date)} at ${new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date)}` };
}

/** Plain-language gaps are limited to things that could not render or need a server.
 * The full machine diagnostics, including assets a crawl could not discover, stay in capture metadata.
 * @complexity O(report entries + exported file count).
 */
export function readmeText({ name, words, metadata, rendered }: { name: string; words?: string; metadata: Omit<StaticSiteMetadata, "exportedAt"> & { exportedAt?: string }; rendered: { files: readonly { path: string }[]; publicOrigin?: string } }, { downloadTheme }: { downloadTheme?: string } = {}): Buffer {
  const formNotes = [...new Set(metadata.skipped.references.map(reference => `${serverFeatureName({ url: reference.url })} on ${reference.page}.`))];
  const redirects = new Set(metadata.redirectFiles?.map(file => downloadTheme === undefined ? file : `sites/${downloadTheme}/${file}`));
  const { pages, images, videos } = copyCounts({ files: rendered.files.filter(file => !redirects.has(file.path)) });
  const lines = [`${name} — static copy`, ...(words === undefined ? [] : [`Exported: ${words} (${metadata.exportedAt})`]), `Theme: ${metadata.theme}`,
    `Contains: ${pages} pages and posts, ${images} ${images === 1 ? "image" : "images"}, ${videos} ${videos === 1 ? "video" : "videos"}.`,
    ...(downloadTheme === undefined ? ["Open with any static web host (links start at the site root)."] : [
      'To look at it: extract the ZIP, then double-click "Open website.html".',
      `To publish it by hand: upload sites/${downloadTheme}/ and media/ together, keeping them side by side.`,
      "Page, asset, social images and llms.txt links are relative to their containing files; external links keep their URLs.",
    ]),
    ...formNotes.map(note => `Needs a server (does not work in this copy): ${note}`),
    ...metadata.failed.routes.map(item => `Not included: Page ${item.path} could not be rendered.`),
    ...metadata.failed.assets.map(item => failedAssetNote({ url: item.url }))];
  if (!rendered.publicOrigin) lines.push("No public domain is set, so sitemap.xml was left out.",
    "The Sitemap line in robots.txt was removed and feed.xml was left out because both need absolute public URLs.",
    downloadTheme === undefined ? "Canonical and og:url metadata and JSON-LD url/@id values were removed; social images and llms.txt links use paths starting at the site root."
      : "Canonical and og:url metadata and JSON-LD url/@id values were removed.");
  return Buffer.from([...lines, ""].join("\n"));
}

/** A denied media response can be a private Library document; its identifier must not reach README. */
function failedAssetNote({ url }: { url: string }, _options = {}): string {
  if (url.startsWith("/m/")) return "Not included: A media file could not be copied.";
  return `Not included: File ${url} could not be copied.`;
}

/** Server-only links and removed form actions share the same per-page README disclosure. */
function serverFeatureName({ url }: { url: string }, _options = {}): string {
  if (url === "/signin") return "Sign in";
  return url.startsWith("/forms/contact/") ? "Contact form" : "Form";
}

/** Count delivered HTML pages (excluding the error document) and image/video files. */
function copyCounts({ files }: { files: readonly { path: string }[] }, _options = {}) {
  return { pages: files.filter(file => !["404.html", "Open website.html"].includes(path.posix.basename(file.path)) && /\.html$/i.test(file.path)).length,
    images: files.filter(file => /\.(?:avif|webp|png|jpe?g|gif|svg|ico)$/i.test(file.path)).length,
    videos: files.filter(file => /\.(?:mp4|webm|mov|m4v|ogv)$/i.test(file.path)).length };
}

/** Only downloadable copies disable backend forms; the normal exporter retains publish receivers. */
function downloadableFiles({ files, publicOrigin, pages }: { files: { path: string; content: Buffer }[]; publicOrigin?: string; pages: ReadonlyMap<string, string> }, _options = {}) {
  const references: ExportReport["droppedReferences"] = [];
  const rewritten = files.map(file => {
    if (!/\.html$/i.test(file.path)) return file;
    const page = pages.get(file.path) ?? "/" + file.path.replace(/(?:\/)?index\.html$/, "");
    const result = downloadForms({ html: file.content.toString(), page, publicOrigin });
    references.push(...result.removed, ...result.serverLinks);
    return { ...file, content: Buffer.from(result.html) };
  });
  return { files: rewritten, references };
}

/** The report carries the exact bytes/layout written by the existing exporter. No second renderer. */
function reportFiles({ report }: { report: ExportReport }, _options = {}) {
  return [...report.routes.succeeded, ...report.assets.succeeded].map(file => ({ path: file.outputFile.replaceAll("\\", "/"), content: Buffer.from(file.data) }));
}

/** Prepare report bytes and disclosures once for downloadable ZIPs and repository commits.
 * The publisher and CLI keep the renderer's original forms and layout.
 * @complexity O(export bytes + report entries), no effects.
 */
export function prepareStaticReport({ report }: { report: ExportReport }, _options = {}): Pick<StaticSiteMetadata, "routes" | "redirectFiles" | "failed" | "skipped"> & { files: { path: string; content: Buffer }[]; publicOrigin?: string } {
  const downloads = downloadableFiles({ files: reportFiles({ report }), publicOrigin: report.publicOrigin,
    pages: new Map(report.routes.succeeded.map(route => [route.outputFile, route.path])) });
  return { files: downloads.files, publicOrigin: report.publicOrigin, routes: report.routes.succeeded.map(route => route.path),
    redirectFiles: report.routes.succeeded.filter(route => route.kind === "redirect").map(route => route.outputFile),
    failed: { routes: report.routes.failed, assets: report.assets.failed },
    skipped: { routes: report.skippedManifestEntries, assets: report.unreferencedThemeFiles, references: downloads.references } };
}

/** Retain already-written files if the exporter throws before it can return a report. Never follow links. */
async function partialFiles({ outputDir }: { outputDir: string }, _options = {}) {
  const files: { path: string; content: Buffer }[] = [];
  for (const name of await readdir(outputDir, { recursive: true })) {
    const target = path.join(outputDir, name);
    if ((await lstat(target)).isFile()) files.push({ path: name.split(path.sep).join("/"), content: await readFile(target) });
  }
  return files;
}

/** Render through the injected owner. A thrown render becomes a disclosed failure, retaining partial output. */
async function renderCopy({ ports, outputDir, themeId }: { ports: StaticSitePorts; outputDir: string; themeId?: string }, _options = {}) {
  try {
    const report = await ports.render!({ outputDir, clean: true, ...(themeId === undefined ? {} : { themeId }) });
    return prepareStaticReport({ report });
  } catch (error) {
    const downloads = downloadableFiles({ files: await partialFiles({ outputDir }), pages: new Map() });
    return { files: downloads.files, publicOrigin: undefined, routes: [], redirectFiles: [],
      failed: { routes: [{ path: "(export)", kind: "export", reason: String(error) }], assets: [] },
      skipped: { routes: [], assets: [], references: downloads.references } };
  }
}

/** Attach the stamp to a useful render; a 404 probe alone is not a renderable site. */
async function stampedCopy({ ports, outputDir, themeId }: { ports: StaticSitePorts; outputDir: string; themeId?: string }, _options = {}): Promise<StaticSiteCopy> {
  const context = await ports.context();
  const stamp = exportStamp({ date: ports.now(), timeZone: context.timeZone });
  const rendered = await renderCopy({ ports, outputDir, themeId });
  if (!rendered.files.some(file => file.path !== "404.html" && /\.html$/i.test(file.path))) return { reason: rendered.failed.routes[0]?.reason ?? "The exporter produced no HTML pages." };
  const metadata: StaticSiteMetadata = { exportedAt: stamp.iso, theme: context.theme, routes: rendered.routes, failed: rendered.failed, skipped: rendered.skipped, redirectFiles: rendered.redirectFiles };
  const slug = shareFileStem({ name: context.name });
  return { metadata, filename: `${slug}-static-${stamp.filename}.zip`, siteSlug: context.slug, themeId: context.themeId ?? context.theme, publicOrigin: rendered.publicOrigin, readme: { name: context.name, words: stamp.words },
    files: [...rendered.files, { path: "README.txt", content: readmeText({ name: context.name, words: stamp.words, metadata, rendered }) }] };
}

/**
 * Captures a fresh static copy, deleting the isolated folder after success or failure.
 * Missing render support, render/cleanup errors or zero written pages cannot block a backup.
 * @complexity O(export bytes + report entries), buffered like the existing backup ZIP.
 */
export async function captureStaticSite(ports: StaticSitePorts, { themeId }: { themeId?: string } = {}): Promise<StaticSiteCopy> {
  if (!ports.render) return { reason: "Static exporter is unavailable in this context." };
  let outputDir: string | undefined;
  let copy: StaticSiteCopy;
  try {
    outputDir = await mkdtemp(path.join(tmpdir(), "tovu-static-copy-"));
    copy = await stampedCopy({ ports, outputDir, themeId });
  } catch (error) { copy = { reason: String(error) }; }
  try { if (outputDir) await rm(outputDir, { recursive: true, force: true }); }
  catch (error) { copy = { reason: `Static render cleanup failed: ${String(error)}` }; }
  return copy;
}
