/**
 * @file Read-only public cover policy (featfallback, 2026-10-10).
 * Storage/editor semantics stay with featuredMediaId; this only selects public presentation data.
 * Kept host-side until Jini can publish a built CMS export without disrupting the live server.
 */
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { scanEmbedMarkers } from "@jini-ai/cms/widgets/markers";

export interface CoverImagePost {
  title: string;
  featuredMediaId?: string | null;
  bodyFormat: "doc" | "html";
  bodyJson: unknown;
  bodyHtml: string | null;
  kind?: "post" | "page";
  ext?: Record<string, unknown>;
}

export interface CoverMedia {
  /** Canonical id when a body reference was a slug; omitted for id-keyed render metadata. */
  id?: string;
  width: number | null;
  height: number | null;
  contentType: string | null;
}

export interface CoverImage {
  /** Zero-based TipTap image/media occurrence; repeated references remain separate occurrences. */
  bodyOccurrence?: number;
  mediaId?: string;
  /** Only populated when the caller explicitly allows an external HTTPS OG image. */
  url?: string;
  alt: string;
  width: number | null;
  height: number | null;
}

interface Candidate { mediaRef?: string; src?: string; alt?: string; bodyOccurrence?: number }
type HtmlNode = DefaultTreeAdapterMap["childNode"];
const INERT_ELEMENTS = new Set(["script", "style", "template", "noscript"]);

/** Stored JSON is untrusted; narrow objects before reading node/attribute fields. */
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A public rendition src can point back to a library id/slug; originals are never covers. */
function renditionRef(src: string): string | undefined {
  const match = /^\/m\/([^/]+)\/[^/]+\.v\d+\/[^/?#]+(?:[?#].*)?$/.exec(src);
  if (!match) return undefined;
  try { return decodeURIComponent(match[1]); } catch { return undefined; }
}

/** Preserve body alt and prefer an explicit library reference to a legacy src. */
function candidate(attrs: Record<string, unknown>): Candidate {
  const src = typeof attrs.src === "string" ? attrs.src.trim() : undefined;
  const mediaRef = typeof attrs.assetId === "string" ? attrs.assetId : src ? renditionRef(src) : undefined;
  return { mediaRef, src, alt: typeof attrs.alt === "string" ? attrs.alt : undefined };
}

/** Pre-order document traversal stays iterative because imported nesting is not bounded. */
function* docCandidates(root: unknown): Generator<Candidate> {
  const stack: unknown[] = [root];
  let occurrence = 0;
  while (stack.length) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
      continue;
    }
    if (!object(node)) continue;
    if ((node.type === "image" || node.type === "media") && object(node.attrs)) yield { ...candidate(node.attrs), bodyOccurrence: occurrence++ };
    if (Array.isArray(node.content)) stack.push(node.content);
  }
}

/** parse5 owns HTML semantics; the existing marker parser owns embed configuration.
 * Source offsets align each rendered element with its marker without re-parsing marker JSON.
 * Inert content and a media marker's authored fallback are not independent body images.
 */
function* htmlCandidates(html: string): Generator<Candidate> {
  const markers = new Map(scanEmbedMarkers({ html }).markers.map((marker) => [marker.index, marker]));
  const stack: HtmlNode[] = [...parseFragment(html, { sourceCodeLocationInfo: true }).childNodes].reverse();
  while (stack.length) {
    const node = stack.pop()!;
    if (!("tagName" in node) || INERT_ELEMENTS.has(node.tagName)) continue;
    const attrs = Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]));
    const marker = markers.get(node.sourceCodeLocation?.startOffset ?? -1);
    if (marker?.type === "media") {
      const ref = marker.id ?? marker.config.slug;
      if (typeof ref === "string") yield candidate({ assetId: ref, alt: marker.config.alt ?? attrs.alt });
      continue;
    }
    if (node.tagName === "img") yield candidate(attrs);
    for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push(node.childNodes[i]);
  }
}

/** Featured selection is final even if missing; only an unset slot enables the body fallback. */
function candidates(post: CoverImagePost): Iterable<Candidate> {
  if (post.featuredMediaId) return [{ mediaRef: post.featuredMediaId }];
  return post.bodyFormat === "html" ? htmlCandidates(post.bodyHtml ?? "") : docCandidates(post.bodyJson);
}

/** Strict external OG policy. Body rendering has a wider HTTP allowlist; social fallback does not.
 * Credentials and authenticated originals never become a public crawler URL. No fetch occurs.
 */
function externalHttps(src: string | undefined): string | null {
  if (!src || !/^https:\/\/[^\s]+$/i.test(src)) return null;
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (/\/workspaces\/[^/]+\/media\/[^/]+\/original\b/i.test(url.pathname)) return null;
    return src;
  } catch { return null; }
}

/** References needed by the cover policy, deduplicated before host metadata reads.
 * @example collectCoverMediaRefs({ post }, {})
 * @complexity O(n) document traversal and O(a) retained distinct refs; HTML also parses O(bytes).
 */
export function collectCoverMediaRefs({ post }: { post: CoverImagePost }, _optional: Record<string, never> = {}): string[] {
  const refs = new Set<string>();
  for (const image of candidates(post)) if (image.mediaRef) refs.add(image.mediaRef);
  return [...refs];
}

/** Select featured, else the first usable body image, else null, without mutating the post.
 * The host lookup excludes deleted/trashed assets and supplies canonical ids and known MIME.
 * Known non-images are skipped; unknown MIME follows the existing featured-image contract.
 * External body URLs require an explicit OG-only opt-in, never a card/hero permission.
 * @example resolveCoverImage({ post }, { mediaLookup: ({ ref }) => metadata.get(ref) ?? null })
 * @complexity O(n) traversal, O(n) worst-case stack/HTML tree; O(1) injected map reads per ref.
 */
export function resolveCoverImage(
  { post }: { post: CoverImagePost },
  optional: { mediaLookup: (required: { ref: string }) => CoverMedia | null; allowExternalHttps?: boolean },
): CoverImage | null {
  for (const image of candidates(post)) {
    const alt = image.alt?.trim() ? image.alt : post.title;
    if (image.mediaRef) {
      const media = optional.mediaLookup({ ref: image.mediaRef });
      if (!media || (media.contentType !== null && !media.contentType.startsWith("image/"))) continue;
      return { mediaId: media.id ?? image.mediaRef, alt, width: media.width, height: media.height, ...(image.bodyOccurrence !== undefined ? { bodyOccurrence: image.bodyOccurrence } : {}) };
    }
    if (!optional.allowExternalHttps) continue;
    const url = externalHttps(image.src);
    if (url) return { url, alt, width: null, height: null };
  }
  return null;
}

/** Project the body for public rendering and preview; storage and the editable document stay intact.
 * HTML posts are intentionally not hidden: this policy removes only a TipTap occurrence.
 * @complexity O(n) time/space, iterative so imported nesting cannot overflow the stack.
 */
export function projectPostBody(
  { post }: { post: CoverImagePost },
  optional: { mediaLookup: (required: { ref: string }) => CoverMedia | null; hasPublicTransform: boolean },
): unknown {
  const presentation = post.ext?.["post-presentation"];
  if (post.kind === "page" || post.bodyFormat !== "doc" || !optional.hasPublicTransform ||
      (object(presentation) && presentation.hideCoverImageInBody === false)) return post.bodyJson;
  const selected = resolveCoverImage({ post }, optional)?.bodyOccurrence;
  if (selected === undefined || !object(post.bodyJson)) return post.bodyJson;
  const output: unknown[] = [];
  const stack = [{ source: post.bodyJson as unknown, target: output }];
  let occurrence = 0;
  while (stack.length) {
    const { source, target } = stack.pop()!;
    if (Array.isArray(source)) {
      const copy: unknown[] = [];
      target.push(copy);
      for (let i = source.length - 1; i >= 0; i--) stack.push({ source: source[i], target: copy });
      continue;
    }
    if (!object(source)) { target.push(source); continue; }
    if ((source.type === "image" || source.type === "media") && object(source.attrs) && occurrence++ === selected) continue;
    const copy = { ...source };
    target.push(copy);
    if (!Array.isArray(source.content)) continue;
    const content: unknown[] = [];
    copy.content = content;
    for (let i = source.content.length - 1; i >= 0; i--) stack.push({ source: source.content[i], target: content });
  }
  return output[0];
}
