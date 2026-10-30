/**
 * @file Read-only public cover policy (featfallback, 2026-10-10).
 * Storage/editor semantics stay with featuredMediaId; this only selects public presentation data.
 * Kept host-side until Jini can publish a built CMS export without disrupting the live server.
 */
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { scanEmbedMarkers, type EmbedMarker } from "@jini-ai/cms/widgets/markers";

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

/** TipTap image/media nodes with an attrs object are the only body cover occurrences. */
function isMediaNode(node: Record<string, unknown>): node is Record<string, unknown> & { attrs: Record<string, unknown> } {
  return (node.type === "image" || node.type === "media") && object(node.attrs);
}

/** Pushes children last-to-first so popping the stack visits them in document order. */
function pushReversed<T, U>(stack: U[], items: readonly T[], wrap: (item: T) => U): void {
  for (let i = items.length - 1; i >= 0; i--) stack.push(wrap(items[i]!));
}

/** A public rendition src can point back to a library id/slug; originals are never covers. */
function renditionRef(src: string): string | undefined {
  const match = /^\/m\/([^/]+)\/[^/]+\.v\d+\/[^/?#]+(?:[?#].*)?$/.exec(src);
  const encoded = match?.[1];
  if (encoded === undefined) return undefined;
  try { return decodeURIComponent(encoded); } catch { return undefined; }
}

/** Preserve body alt and prefer an explicit library reference to a legacy src. */
function candidate(attrs: Record<string, unknown>): Candidate {
  const src = typeof attrs.src === "string" ? attrs.src.trim() : undefined;
  let mediaRef = typeof attrs.assetId === "string" ? attrs.assetId : undefined;
  if (mediaRef === undefined && src) mediaRef = renditionRef(src);
  return { mediaRef, src, alt: typeof attrs.alt === "string" ? attrs.alt : undefined };
}

function queueDocContent({ node, stack }: { node: Record<string, unknown>; stack: unknown[] }, _optional: Record<string, never> = {}): void {
  if (Array.isArray(node.content)) stack.push(node.content);
}

/** Pre-order document traversal stays iterative because imported nesting is not bounded. */
function* docCandidates(root: unknown): Generator<Candidate> {
  const stack: unknown[] = [root];
  let occurrence = 0;
  while (stack.length) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      pushReversed(stack, node, item => item);
      continue;
    }
    if (object(node)) {
      if (isMediaNode(node)) {
        yield { ...candidate(node.attrs), bodyOccurrence: occurrence };
        occurrence += 1;
      }
      queueDocContent({ node, stack });
    }
  }
}

/** A media marker's library ref (id, else slug) with its alt, preferring the marker's own alt. */
function markerCandidate(marker: EmbedMarker, attrs: Record<string, string>): Candidate | undefined {
  const ref = marker.id ?? marker.config.slug;
  return typeof ref === "string" ? candidate({ assetId: ref, alt: marker.config.alt ?? attrs.alt }) : undefined;
}

function* htmlElementCandidates(
  { node, markers, stack }: { node: DefaultTreeAdapterMap["element"]; markers: ReadonlyMap<number, EmbedMarker>; stack: HtmlNode[] },
  _optional: Record<string, never> = {},
): Generator<Candidate> {
  const attrs = Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]));
  const marker = markers.get(node.sourceCodeLocation?.startOffset ?? -1);
  if (marker?.type === "media") {
    const image = markerCandidate(marker, attrs);
    if (image) yield image;
  } else {
    if (node.tagName === "img") yield candidate(attrs);
    pushReversed(stack, node.childNodes, child => child);
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
    yield* htmlElementCandidates({ node, markers, stack });
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

/** Known non-images are skipped; unknown MIME (null) follows the featured-image contract. */
function isCoverMedia(media: CoverMedia | null): media is CoverMedia {
  return media !== null && (media.contentType === null || media.contentType.startsWith("image/"));
}

/** The cover for one candidate, or null when it is unusable under the current options. */
function candidateCover(
  { image, alt }: { image: Candidate; alt: string },
  optional: { mediaLookup: (required: { ref: string }) => CoverMedia | null; allowExternalHttps?: boolean },
): CoverImage | null {
  if (image.mediaRef) {
    const media = optional.mediaLookup({ ref: image.mediaRef });
    if (!isCoverMedia(media)) return null;
    return { mediaId: media.id ?? image.mediaRef, alt, width: media.width, height: media.height, ...(image.bodyOccurrence !== undefined ? { bodyOccurrence: image.bodyOccurrence } : {}) };
  }
  if (!optional.allowExternalHttps) return null;
  const url = externalHttps(image.src);
  return url ? { url, alt, width: null, height: null } : null;
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
    const cover = candidateCover({ image, alt: image.alt?.trim() ? image.alt : post.title }, optional);
    if (cover) return cover;
  }
  return null;
}

/** Pages, HTML bodies, hosts without the public transform, and an explicit
 * hideCoverImageInBody: false all render the stored body as-is.
 */
function keepsStoredBody(post: CoverImagePost, hasPublicTransform: boolean): boolean {
  const presentation = post.ext?.["post-presentation"];
  if (post.kind === "page" || post.bodyFormat !== "doc" || !hasPublicTransform) return true;
  return object(presentation) && presentation.hideCoverImageInBody === false;
}

type BodyCopyFrame = { source: unknown; target: unknown[] };

/** Copy one body frame; the returned count preserves media occurrence ordering. */
function copyBodyFrame(
  { source, target, stack, selected, occurrence }: BodyCopyFrame & { stack: BodyCopyFrame[]; selected: number; occurrence: number },
  _optional: Record<string, never> = {},
): number {
  if (Array.isArray(source)) {
    const copy: unknown[] = [];
    target.push(copy);
    pushReversed(stack, source, item => ({ source: item, target: copy }));
    return occurrence;
  }
  if (!object(source)) { target.push(source); return occurrence; }
  if (isMediaNode(source)) {
    const current = occurrence;
    occurrence += 1;
    if (current === selected) return occurrence;
  }
  const copy = { ...source };
  target.push(copy);
  if (Array.isArray(source.content)) {
    const content: unknown[] = [];
    copy.content = content;
    pushReversed(stack, source.content, item => ({ source: item, target: content }));
  }
  return occurrence;
}

/** Copies the document without the selected image/media occurrence; the input is never mutated.
 * @complexity O(n) time/space, iterative so imported nesting cannot overflow the stack.
 */
function withoutOccurrence({ body, selected }: { body: Record<string, unknown>; selected: number }): unknown {
  const output: unknown[] = [];
  const stack: BodyCopyFrame[] = [{ source: body, target: output }];
  let occurrence = 0;
  while (stack.length) occurrence = copyBodyFrame({ ...stack.pop()!, stack, selected, occurrence });
  return output[0];
}

/** Project the body for public rendering and preview; storage and the editable document stay intact.
 * HTML posts are intentionally not hidden: this policy removes only a TipTap occurrence.
 * @complexity O(n) time/space, iterative so imported nesting cannot overflow the stack.
 */
export function projectPostBody(
  { post }: { post: CoverImagePost },
  optional: { mediaLookup: (required: { ref: string }) => CoverMedia | null; hasPublicTransform: boolean },
): unknown {
  if (keepsStoredBody(post, optional.hasPublicTransform)) return post.bodyJson;
  const selected = resolveCoverImage({ post }, optional)?.bodyOccurrence;
  if (selected === undefined || !object(post.bodyJson)) return post.bodyJson;
  return withoutOccurrence({ body: post.bodyJson, selected });
}
