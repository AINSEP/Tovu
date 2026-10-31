import path from "node:path";
import { exportUrlLocations, extractHtmlReferences, outputFileForUrl } from "@jini-ai/devops/static-export";
import { escapeHtml } from "#src/platform/html/escape";
import { downloadDocumentBase } from "../site-export/export-html-policy.js";
import { validateSharePath, sharePathAlias } from "./share-file-policy.js";
import { allocateStaticExportThemes, type StaticExportTheme } from "./static-export-selection.js";
import { checkShareLimits } from "./share-policy.js";
import { readmeText, type StaticSiteMetadata } from "./static-copy.js";

/** Portable packaging consumes rendered files and real site/theme context, without backup metadata. */
export interface StaticDownloadCopy {
  files: readonly { path: string; content: Buffer }[];
  siteSlug?: string;
  themeId?: string;
  publicOrigin?: string;
  metadata?: Omit<StaticSiteMetadata, "exportedAt"> & { exportedAt?: string };
  readme?: { name: string; words?: string };
}
type Copy = StaticDownloadCopy;
type File = Copy["files"][number];
type RewriteUrl = (value: string) => string;
const LOCAL_ORIGIN = "https://static-copy.invalid";

/** Resolve local references against their original file; foreign URLs and fragments stay intact. */
function localUrl({ value, file, publicOrigin }: { value: string; file: string; publicOrigin?: string }, _options = {}): URL | undefined {
  if (!value || value.startsWith("#") || value.startsWith("//")) return undefined;
  try {
    const origin = publicOrigin ?? LOCAL_ORIGIN;
    const url = new URL(value, `${origin}/${file}`);
    return url.origin === origin ? url : undefined;
  } catch { return undefined; }
}

/** Reuse the exporter's candidate parser, including data URLs and descriptors. O(srcset bytes). */
function rewriteSrcset({ value, rewrite }: { value: string; rewrite: RewriteUrl }, _options = {}): string {
  // Ranges contain the original HTML spelling; protect the wrapper quote without double-escaping &amp;.
  const refs = extractHtmlReferences({ html: `<img srcset="${value.replaceAll('"', "&quot;")}">` });
  let cursor = 0;
  const parts: string[] = [];
  for (const { url } of refs) {
    const start = value.indexOf(url, cursor);
    if (start < 0) continue;
    parts.push(value.slice(cursor, start), rewrite(url));
    cursor = start + url.length;
  }
  return parts.join("") + value.slice(cursor);
}

/** Jini supplies linear CSS token ranges; only the URL inside each token changes. */
function rewriteCss({ body, rewrite }: { body: string; rewrite: RewriteUrl }, _options = {}): string {
  const parts: string[] = [];
  let cursor = 0;
  for (const { start, end } of exportUrlLocations({ body, contentType: "text/css" })) {
    const inner = body.slice(start + 4, end - 1).trim();
    const quote = /^["']/.test(inner) ? inner[0]! : "";
    const value = quote ? inner.slice(1, -1) : inner;
    parts.push(body.slice(cursor, start), `url(${quote}${rewrite(value)}${quote})`);
    cursor = end;
  }
  return parts.join("") + body.slice(cursor);
}

/** HTML edits use parser-backed source ranges, preserving theme scripts and surrounding bytes. */
function rewriteHtml({ body, rewrite }: { body: string; rewrite: RewriteUrl }, _options = {}): string {
  body = downloadDocumentBase({ html: body, rewrite });
  const parts: string[] = [];
  let cursor = 0;
  for (const { start, end, kind } of exportUrlLocations({ body, contentType: "text/html" })) {
    if (kind === "action") continue;
    const value = body.slice(start, end);
    const replacement = rewriteHtmlValue({ value, kind, rewrite });
    parts.push(body.slice(cursor, start), replacement);
    cursor = end;
  }
  return parts.join("") + body.slice(cursor);
}

/** Keep CSS and candidate-list grammar with their existing owners. */
function rewriteHtmlValue({ value, kind, rewrite }: { value: string; kind: string; rewrite: RewriteUrl }, _options = {}): string {
  if (kind === "css") return rewriteCss({ body: value, rewrite });
  if (kind === "srcset") return rewriteSrcset({ value, rewrite });
  return rewrite(value);
}

/** Rewrite manifest link fields structurally; malformed manifests retain their original bytes. */
function rewriteManifest({ body, rewrite }: { body: string; rewrite: RewriteUrl }, _options = {}): string {
  try {
    return JSON.stringify(JSON.parse(body), (key, value: unknown) =>
      typeof value === "string" && ["src", "href", "url", "start_url", "scope"].includes(key) ? rewrite(value) : value);
  } catch { return body; }
}

/** The same transform visits references during discovery and rewrites them after paths are assigned. */
function rewriteFile({ file, rewrite }: { file: File; rewrite: RewriteUrl }, _options = {}): Buffer {
  if (/\.html$/i.test(file.path)) return Buffer.from(rewriteHtml({ body: file.content.toString(), rewrite }));
  if (/\.css$/i.test(file.path)) return Buffer.from(rewriteCss({ body: file.content.toString(), rewrite }));
  if (/\.(?:webmanifest|json)$/i.test(file.path)) return Buffer.from(rewriteManifest({ body: file.content.toString(), rewrite }));
  if (file.path === "llms.txt") return Buffer.from(rewriteMarkdown({ body: file.content.toString(), rewrite }));
  return file.content;
}

/** Reuse Jini's generated Markdown ranges and the same relocation map as HTML assets.
 * @complexity O(body bytes + references), no effects.
 */
function rewriteMarkdown({ body, rewrite }: { body: string; rewrite: RewriteUrl }, _options = {}): string {
  const parts: string[] = [];
  let cursor = 0;
  for (const { start, end } of exportUrlLocations({ body, contentType: "text/markdown" })) {
    parts.push(body.slice(cursor, start), rewrite(body.slice(start, end)));
    cursor = end;
  }
  return parts.join("") + body.slice(cursor);
}

/** Static downloads alone supply permissive rules when the captured robots document is empty.
 * The exporter already enforces public-origin/Sitemap policy; retain configured bytes verbatim.
 */
function downloadRobots({ file, content }: { file: string; content: Buffer }, _options = {}): Buffer {
  return file === "robots.txt" && !content.toString().trim() ? Buffer.from("User-agent: *\nAllow: /\n") : content;
}

/** A partial render may lose the home page; the launcher still opens a delivered document. */
function downloadHome({ copy, paths, theme }: { copy: Copy; paths: ReadonlyMap<string, string>; theme: string }, _options = {}): string {
  const first = copy.files.find(file => file.path !== "404.html" && /\.html$/i.test(file.path));
  return paths.get("index.html") ?? paths.get(first?.path ?? "") ?? `sites/${theme}/index.html`;
}

/** Follow page references through stylesheets/manifests, retaining only reached public media.
 * @complexity O(text bytes + references), each file visited at most once; no I/O.
 */
function referencedFiles({ copy }: { copy: Copy }, _options = {}): Set<string> {
  const files = new Map(copy.files.map(file => [file.path, file]));
  const reached = new Set(copy.files.filter(file => /\.html$/i.test(file.path)).map(file => file.path));
  // Set iteration visits newly added entries: CSS imports and manifest icons share one bounded crawl.
  for (const name of reached) {
    const file = files.get(name);
    if (!file) continue;
    rewriteFile({ file, rewrite: value => {
      const url = localUrl({ value, file: name, publicOrigin: copy.publicOrigin });
      if (url && files.has(url.pathname.slice(1))) reached.add(url.pathname.slice(1));
      return value;
    } });
  }
  return reached;
}

/** Flatten public media independently of theme images; claim portable aliases for suffix allocation. */
function mediaPath({ file, claimed }: { file: string; claimed: Set<string> }, _options = {}): string {
  const slug = file.split("/")[1]!;
  const extension = path.posix.extname(file);
  let suffix = 1;
  let target = `media/${slug}${extension}`;
  while (claimed.has(sharePathAlias({ path: target }))) {
    suffix += 1;
    target = `media/${slug}-${suffix}${extension}`;
  }
  claimed.add(sharePathAlias({ path: target }));
  return target;
}

/** Repeated public URLs across themes use the first allocated media destination. */
function sharedMediaPath({ file, media, claimed }: { file: string; media: Map<string, string>; claimed: Set<string> }, _options = {}): string {
  const existing = media.get(file);
  if (existing) return existing;
  const target = mediaPath({ file, claimed });
  media.set(file, target);
  return target;
}

/** Theme assets keep meaningful subtrees while media-library assets live beside sites/. */
function themeAssetPath({ file }: { file: string }, _options = {}): string {
  const relative = file.replace(/^theme-assets\/[^/]+\//, "");
  if (/\.webmanifest$/i.test(relative)) return path.posix.basename(relative);
  if (/\.css$/i.test(relative)) return "css/" + relative.replace(/^(?:css|styles)\//, "");
  if (/\.(?:m?js|cjs)$/i.test(relative)) return "js/" + relative.replace(/^(?:js|scripts)\//, "");
  if (/\.(?:woff2?|ttf|otf|eot)$/i.test(relative)) return "fonts/" + path.posix.basename(relative);
  if (relative.startsWith("icons/")) return relative;
  if (/\.ico$/i.test(relative)) return "icons/" + path.posix.basename(relative);
  if (/\.(?:avif|webp|png|jpe?g|gif|svg|ico)$/i.test(relative)) return "images/" + relative.replace(/^(?:assets|images)\//, "");
  return relative;
}

/** Theme-owned files retain their own subtree; the single README stays at archive root. */
function themeDownloadPath({ file, theme }: { file: string; theme: string }, _options = {}): string {
  if (file === "README.txt") return file;
  const relative = file.startsWith("theme-assets/") ? themeAssetPath({ file }) : file;
  return `sites/${theme}/${relative}`;
}

/** Assign paths before rewriting, so references and files share one immutable mapping. */
function downloadPaths({ copy, theme, reached, media, claimed }: { copy: Copy; theme: string; reached: ReadonlySet<string>; media: Map<string, string>; claimed: Set<string> }, _options = {}): Map<string, string> {
  const paths = new Map<string, string>();
  for (const file of copy.files) {
    validateSharePath({ path: file.path });
    if (file.path.startsWith("m/")) {
      const target = reached.has(file.path) ? sharedMediaPath({ file: file.path, media, claimed }) : undefined;
      if (target) paths.set(file.path, target);
      continue;
    }
    paths.set(file.path, themeDownloadPath({ file: file.path, theme }));
  }
  return paths;
}

/** Map a local page or asset from its old location to a file-relative download URL.
 * Missing /m/ responses include private Library documents; never retain their URLs.
 */
function relocatedUrl({ value, file, target, paths, copy, theme }: { value: string; file: string; target: string; paths: ReadonlyMap<string, string>; copy: Copy; theme: string }, _options = {}): string {
  const url = localUrl({ value, file, publicOrigin: copy.publicOrigin });
  if (!url) return value;
  const source = url.pathname.slice(1);
  const page = source.replace(/\/$/, "");
  const destination = paths.get(source) ?? paths.get(outputFileForUrl({ url: url.pathname }, { contentRoute: true }));
  if (!destination && source.startsWith("m/")) return "";
  const themeRoot = `sites/${theme}`;
  const fallback = `${themeRoot}/${page || "index.html"}`;
  // Keep page paths explicit through the theme root, including links back to the current page.
  if (destination?.endsWith(".html")) return [path.posix.relative(path.posix.dirname(target), themeRoot),
    path.posix.relative(themeRoot, destination)].filter(Boolean).join("/") + url.search + url.hash;
  return path.posix.relative(path.posix.dirname(target), destination ?? fallback) + url.search + url.hash;
}

/**
 * Package an already-captured Tovu site for opening from disk. Pure: returns new paths/bytes,
 * leaving the capture and the publish/CLI exporter layout untouched.
 * @param required The captured site, including its original URL and theme context.
 * @returns Download entries without the dated outer folder (the ZIP builder owns that folder).
 * @throws SiteShareRefusal when an original path is unsafe; archive-wide collisions are checked by the ZIP owner.
 * @complexity O(text bytes + references + files² + collision retries), O(export bytes) memory; no I/O.
 * @example staticDownloadLayout({ copy });
 */
export function staticDownloadLayout({ copy, copies = [copy], activeThemeId, themes }: { copy: Copy; copies?: readonly Copy[]; activeThemeId?: string; themes?: readonly StaticExportTheme[] }, _options = {}): readonly File[] {
  const plans = downloadPlans({ copies, themes, siteSlug: copy.siteSlug ?? "" });
  const entries: File[] = [], deliveredMedia = new Set<string>();
  const sizes: { path: string; bytes: number }[] = [];
  let totalBytes = 0;
  // Track combined output incrementally after URL deduplication, before ZIP encoding.
  const add = (file: File) => {
    totalBytes += file.content.length;
    sizes.push({ path: file.path, bytes: file.content.length });
    checkShareLimits({ files: sizes, totalBytes });
    entries.push(file);
  };
  const readmes: string[] = [];
  for (const plan of plans) {
    const files = relocatedFiles({ ...plan, deliveredMedia });
    for (const file of files) add(file);
    readmes.push(...downloadReadme({ plan }));
  }
  const selected = plans.find(plan => plan.copy.themeId === activeThemeId) ?? plans[0]!;
  const home = escapeHtml(downloadHome(selected));
  add({ path: "Open website.html", content: Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${home}"><title>Open website</title></head><body><a href="${home}">Open website</a></body></html>`) });
  if (readmes.length) add({ path: "README.txt", content: Buffer.from(readmes.join("\n") + (copies.length > 1 ? `\nShared media: ${deliveredMedia.size} files in media/.\n` : "")) });
  return entries;
}

/** Dated downloads and deterministic commits share the same per-theme disclosures. */
function downloadReadme({ plan }: { plan: ReturnType<typeof downloadPlans>[number] }, _options = {}): string[] {
  if (!plan.copy.readme || !plan.copy.metadata) return [];
  return [readmeText({ ...plan.copy.readme, metadata: plan.copy.metadata,
    rendered: { files: [...plan.paths.values()].filter(name => name !== "README.txt").map(path => ({ path })), publicOrigin: plan.copy.publicOrigin } }, { downloadTheme: plan.theme }).toString()];
}

/** Assign every theme/media path before any rewrite; page maps remain capture-local. */
function downloadPlans({ copies, themes, siteSlug }: { copies: readonly Copy[]; themes?: readonly StaticExportTheme[]; siteSlug: string }, _options = {}) {
  const folders = new Map((themes ?? allocateStaticExportThemes({ themeIds: copies.map(item => item.themeId ?? item.metadata?.theme ?? "site"), siteSlug })).map(theme => [theme.themeId, theme.name]));
  const media = new Map<string, string>(), claimed = new Set<string>();
  return copies.map(item => {
    const theme = folders.get(item.themeId ?? item.metadata?.theme ?? "site")!;
    return { copy: item, theme, paths: downloadPaths({ copy: item, theme, reached: referencedFiles({ copy: item }), media, claimed }) };
  });
}

/** Relocate one theme's URLs against its own page map, sharing only public media URL identities.
 * @complexity O(capture bytes + references), no I/O; shared media membership is archive-wide.
 */
function relocatedFiles({ copy, theme, paths, deliveredMedia }: { copy: Copy; theme: string; paths: ReadonlyMap<string, string>; deliveredMedia: Set<string> }, _options = {}): File[] {
  const entries: File[] = [];
  for (const file of copy.files) {
    const target = paths.get(file.path);
    if (!target || file.path === "README.txt" || deliveredMedia.has(target)) continue;
    if (target.startsWith("media/")) {
      deliveredMedia.add(target);
    }
    const content = downloadRobots({ file: file.path, content: rewriteFile({ file, rewrite: value => relocatedUrl({ value, file: file.path, target, paths, copy, theme }) }) });
    entries.push({ path: target, content });
  }
  return entries;
}
