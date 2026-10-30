import { mkdtemp, readdir, readFile, lstat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExportReport } from "../site-export/site-exporter.js";
import { shareFileStem } from "./share-service.js";

export interface StaticSiteMetadata {
  exportedAt: string;
  theme: string;
  routes: string[];
  failed: { routes: ExportReport["routes"]["failed"]; assets: ExportReport["assets"]["failed"] };
  skipped: { routes: ExportReport["skippedManifestEntries"]; assets: string[]; references: ExportReport["droppedReferences"] };
}
export type StaticSiteCopy = { metadata: StaticSiteMetadata; filename: string; files: readonly { path: string; content: Buffer }[] } | { reason: string };
export interface StaticSitePorts {
  render?: (required: { outputDir: string; clean: boolean }) => Promise<ExportReport>;
  context: () => Promise<{ name: string; slug: string; theme: string; timeZone?: string }>;
  now: () => Date;
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
    words: `${new Intl.DateTimeFormat("en-US", { timeZone: zone, dateStyle: "full", timeStyle: "long" }).format(date)} (${zone})` };
}

/** Lists every known gap, including assets a crawl could not discover. O(report entries). */
function exportedText({ name, words, metadata }: { name: string; words: string; metadata: StaticSiteMetadata }, _options = {}): Buffer {
  const { failed, skipped } = metadata;
  const sections = [
    ["Failed routes", failed.routes], ["Failed assets", failed.assets], ["Skipped routes", skipped.routes],
    ["Unreferenced theme assets", skipped.assets], ["Dropped references", skipped.references],
  ] as const;
  return Buffer.from([`Site: ${name}`, `Exported at: ${metadata.exportedAt}`, words, `Active theme: ${metadata.theme}`, `Rendered routes: ${metadata.routes.length}`,
    ...sections.flatMap(([label, entries]) => [`${label}: ${entries.length}`, ...entries.map(entry => JSON.stringify(entry))]), ""].join("\n"));
}

/** The report carries the exact bytes/layout written by the existing exporter. No second renderer. */
function reportFiles({ report }: { report: ExportReport }, _options = {}) {
  return [...report.routes.succeeded, ...report.assets.succeeded].map(file => ({ path: file.outputFile, content: Buffer.from(file.data) }));
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
async function renderCopy({ ports, outputDir }: { ports: StaticSitePorts; outputDir: string }, _options = {}) {
  try {
    const report = await ports.render!({ outputDir, clean: true });
    return { files: reportFiles({ report }), routes: report.routes.succeeded.map(route => route.path),
      failed: { routes: report.routes.failed, assets: report.assets.failed },
      skipped: { routes: report.skippedManifestEntries, assets: report.unreferencedThemeFiles, references: report.droppedReferences } };
  } catch (error) {
    return { files: await partialFiles({ outputDir }), routes: [],
      failed: { routes: [{ path: "(export)", kind: "export", reason: String(error) }], assets: [] },
      skipped: { routes: [], assets: [], references: [] } };
  }
}

/** Attach the stamp to a useful render; a 404 probe alone is not a renderable site. */
async function stampedCopy({ ports, outputDir }: { ports: StaticSitePorts; outputDir: string }, _options = {}): Promise<StaticSiteCopy> {
  const context = await ports.context();
  const stamp = exportStamp({ date: ports.now(), timeZone: context.timeZone });
  const rendered = await renderCopy({ ports, outputDir });
  if (!rendered.files.some(file => file.path !== "404.html" && /\.html$/i.test(file.path))) return { reason: rendered.failed.routes[0]?.reason ?? "The exporter produced no HTML pages." };
  const metadata: StaticSiteMetadata = { exportedAt: stamp.iso, theme: context.theme, routes: rendered.routes, failed: rendered.failed, skipped: rendered.skipped };
  const slug = shareFileStem({ name: context.slug });
  return { metadata, filename: `${slug}-static-${stamp.filename}.zip`, files: [...rendered.files, { path: "EXPORTED.txt", content: exportedText({ name: context.name, words: stamp.words, metadata }) }] };
}

/**
 * Captures a fresh static copy, deleting the isolated folder after success or failure.
 * Missing render support, render/cleanup errors or zero written pages cannot block a backup.
 * @complexity O(export bytes + report entries), buffered like the existing backup ZIP.
 */
export async function captureStaticSite(ports: StaticSitePorts, _options = {}): Promise<StaticSiteCopy> {
  if (!ports.render) return { reason: "Static exporter is unavailable in this context." };
  let outputDir: string | undefined;
  let copy: StaticSiteCopy;
  try {
    outputDir = await mkdtemp(path.join(tmpdir(), "tovu-static-copy-"));
    copy = await stampedCopy({ ports, outputDir });
  } catch (error) { copy = { reason: String(error) }; }
  try { if (outputDir) await rm(outputDir, { recursive: true, force: true }); }
  catch (error) { copy = { reason: `Static render cleanup failed: ${String(error)}` }; }
  return copy;
}
