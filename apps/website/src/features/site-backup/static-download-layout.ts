import path from "node:path";
import { exportUrlLocations, extractHtmlReferences, outputFileForUrl } from "@jini-ai/devops/static-export";
import { escapeHtml } from "#src/platform/html/escape";
import { downloadDocumentBase } from "../site-export/export-html-policy.js";
import { validateSharePath, sharePathAlias } from "./share-file-policy.js";
import type { StaticSiteCopy } from "./static-copy.js";

/** Download packaging only: the renderer's publish/commit/CLI paths remain authoritative. */
type Copy = Exclude<StaticSiteCopy, { reason: string }>;
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
  return file.content;
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

/** The site-slug prefix is branding, not part of the portable theme folder name. */
function themeFolder({ copy }: { copy: Copy }, _options = {}): string {
  const theme = copy.themeId ?? copy.metadata.theme;
  const prefix = (copy.siteSlug ?? "").split("-")[0] + "-";
  return theme.startsWith(prefix) && theme.length > prefix.length ? theme.slice(prefix.length) : theme;
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

/** Assign paths before rewriting, so references and files share one immutable mapping. */
function downloadPaths({ copy, theme, reached }: { copy: Copy; theme: string; reached: ReadonlySet<string> }, _options = {}): Map<string, string> {
  const paths = new Map<string, string>(), claimed = new Set<string>();
  for (const file of copy.files) {
    validateSharePath({ path: file.path });
    if (file.path.startsWith("m/")) {
      if (reached.has(file.path)) paths.set(file.path, mediaPath({ file: file.path, claimed }));
      continue;
    }
    const relative = file.path.startsWith("theme-assets/") ? themeAssetPath({ file: file.path }) : file.path;
    paths.set(file.path, file.path === "README.txt" ? file.path : `sites/${theme}/${relative}`);
  }
  return paths;
}

/** Map a local page or asset from its old location to a file-relative download URL.
 * Missing /m/ responses include private Library documents; never retain their URLs.
 */
function relocatedUrl({ value, file, target, paths, copy }: { value: string; file: string; target: string; paths: ReadonlyMap<string, string>; copy: Copy }, _options = {}): string {
  const url = localUrl({ value, file, publicOrigin: copy.publicOrigin });
  if (!url) return value;
  const source = url.pathname.slice(1);
  const page = source.replace(/\/$/, "");
  const destination = paths.get(source) ?? paths.get(outputFileForUrl({ url: url.pathname }, { contentRoute: true }));
  if (!destination && source.startsWith("m/")) return "";
  const themeRoot = `sites/${themeFolder({ copy })}`;
  const fallback = `${themeRoot}/${page || "index.html"}`;
  // Keep page paths explicit through the theme root, including links back to the current page.
  if (destination?.endsWith(".html")) return [path.posix.relative(path.posix.dirname(target), themeRoot),
    path.posix.relative(themeRoot, destination)].filter(Boolean).join("/") + url.search + url.hash;
  return path.posix.relative(path.posix.dirname(target), destination ?? fallback) + url.search + url.hash;
}

/**
 * Package an already-captured Tovu site for opening from disk. Pure: returns new paths/bytes,
 * leaving the capture and the publish/commit/CLI exporter layout untouched.
 * @param required The captured site, including its original URL and theme context.
 * @returns Download entries without the dated outer folder (the ZIP builder owns that folder).
 * @throws SiteShareRefusal when an original path is unsafe; archive-wide collisions are checked by the ZIP owner.
 * @complexity O(text bytes + references + collision retries), O(export bytes) memory; no I/O.
 * @example staticDownloadLayout({ copy });
 */
export function staticDownloadLayout({ copy }: { copy: Copy }, _options = {}): readonly File[] {
  const theme = themeFolder({ copy });
  const paths = downloadPaths({ copy, theme, reached: referencedFiles({ copy }) });
  const entries: File[] = [];
  for (const file of copy.files) {
    const target = paths.get(file.path);
    if (!target) continue;
    let content = rewriteFile({ file, rewrite: value => relocatedUrl({ value, file: file.path, target, paths, copy }) });
    if (file.path === "README.txt") content = Buffer.from(file.content.toString().replace("Open with any static web host (links start at the site root).",
      `To look at it: open "Open website.html".\nTo publish it by hand: upload sites/${theme}/ and media/ together, keeping them side by side.`));
    entries.push({ path: target, content });
  }
  const home = escapeHtml(`sites/${theme}/index.html`);
  entries.push({ path: "Open website.html", content: Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${home}"><title>Open website</title></head><body><a href="${home}">Open website</a></body></html>`) });
  return entries;
}
