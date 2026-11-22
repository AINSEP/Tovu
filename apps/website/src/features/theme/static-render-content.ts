import { FEATURED_IMAGE_MARKER_TYPE, markersOfType, substituteMarkers, withAddedId, withInnerContent, withInnerContentFinal, type EmbedMarker } from "@jini-ai/cms/widgets/markers";
import { postAuthorForDisplay } from "@jini-ai/core/contracts/site/post-author";
import { escapeHtml } from "#src/platform/html/escape";


/** `true` for a marker carrying a NON-EMPTY string `slug` — an explicit reference to another entity.
 * An empty `slug` names nothing (every resolver stage treats `""` as absent, `html-embeds.ts`'s
 * `normalizeEmbedSlug`), so it must not block filling in the current entity's id. */
function hasAuthoredSlug(marker: EmbedMarker): boolean {
  const slug = marker.config.slug;
  return typeof slug === "string" && slug.length > 0;
}

/**
 * Fills the current entity's real id into every `{"type":"content"}` marker in `html` that carries NO
 * id — the unified-marker (2026-08-11) replacement for BOTH `injectPostEmbedId`'s `{{post}}` literal
 * substitution AND `injectPageContent`'s direct body-HTML splice.
 *
 * A theme-authored, id-less `{"type":"content"}` marker means "the entity the route already
 * resolved" (the unified-content-marker design doc's own wording) — the route layer (`pages.ts`)
 * knows that entity's real id by the time it calls this, so it fills it in here, BEFORE the embed
 * scanner/resolver ever sees the html. Everything downstream (the recursive `"html"`-format
 * pre-splice pass, `resolveHtmlPageEmbeds`'s registered `"content"` resolver, a later re-scan) then
 * sees an ORDINARY id-carrying marker — the same one an author gets by typing a real id directly —
 * with no "no id means current entity" special case anywhere else in the pipeline.
 *
 * A marker that ALREADY carries an id (an author's explicit reference to some OTHER entity) is left
 * completely untouched — this function only ever fills a gap, never overwrites an explicit choice.
 * The same rule applies to a marker carrying a `slug` instead of an `id` (S3, 2026-09-23 widget-attrs
 * plan): `{"type":"content","slug":"some-other-entity"}` is just as much an explicit reference to
 * some OTHER entity as an id-carrying marker is — filling in the CURRENT entity's id here would win
 * over that authored `slug` (`resolveContentTypeEmbeds`'s id-authoritative-when-present order) and
 * silently redirect the marker to the wrong row. Checking `marker.id === undefined` alone would miss
 * this — a slug-only marker also has no `id` yet, but for a completely different reason than "this
 * means the current entity".
 * The old `blog-post.html`/`page-shell.html` split (one marker type per kind) is gone: BOTH doc-format
 * Posts and Pages, and html-format Pages, use this exact same function now, since the row's
 * `bodyFormat` — not the marker's type — is what decides how the referenced content actually renders
 * (`resolveContentTypeEmbeds`, `resolver-service.ts`, and the recursive pre-splice in `pages.ts`).
 *
 * Marker-based (via {@link withAddedId}), not a literal string replace like the retired
 * `injectPostEmbedId` — that function could rely on `{{post}}` being authored as a specific literal
 * JSON value; here there is no literal token to search for (the marker's ABSENCE of an `id` key is
 * the whole signal), so filling the gap correctly for a marker carrying extra config keys (e.g. a
 * future `{"type":"content","variant":"..."}"`) needs the real parsed marker, not a substring match.
 *
 * @complexity O(n) over `html`'s length — one `substituteMarkers` scan-and-splice pass, the same cost
 * shape every other marker-substitution call in this codebase already pays.
 */
export function injectCurrentEntityContentId({ html, entityId }: { html: string; entityId: string }, _optional = {}): string {
  return substituteMarkers({ html: html, resolve: (marker) => {
    if (marker.type !== "content" || marker.id !== undefined || hasAuthoredSlug(marker)) return undefined;
    return withAddedId({ marker: marker, id: entityId });
  } });
}

/**
 * Substitutes a page-template's title placeholder with the rendered row's own real title —
 * {@link injectCurrentEntityContentId}'s sibling for the `<title>` tag, a string substitution rather
 * than a marker rewrite (same convention that function documents for filling in a marker's `id`).
 *
 * Matches the WHOLE `<title>...</title>` element the placeholder sits in, not a bare token search —
 * learned the hard way while authoring `page-shell.html`: that file's own explanatory HTML comment
 * mentions the placeholder as prose, and a bare-token `.replace()` matched THAT occurrence (the first
 * one in the file) instead of the real one in `<head>`, silently leaving the `<title>` tag unfilled.
 * Scoping the match to the full element makes an incidental mention elsewhere in the template (a
 * comment, authored copy) structurally unable to collide with the real slot.
 *
 * Runs for every kind now (2026-08-11 unification; previously Post-rendered pages accepted a fixed
 * title as a disclosed limitation and only Pages got this substitution) — `basic`'s own `posts-*.html`
 * templates (`blog-post.html` before the 2026-09-03 posts-* / pages-* rename) keep one fixed `<title>`
 * string with no placeholder, so calling this on a Post rendered through one is still a no-op,
 * unchanged; a Post rendered through `pages-default.html` (`page-shell.html` before that same rename)
 * now correctly gets its own title instead of a generic one, closing that disclosed gap for free.
 *
 * A template file authored without this exact `<title>...</title>` shape is simply unaffected —
 * `replace` is a no-op when the pattern isn't present.
 *
 * @complexity O(n) over `html`'s length — one string search-and-replace.
 */
export function injectPageTitle({ html, title }: { html: string; title: string }, _optional = {}): string {
  return html.replace(/<title>\{\{title\}\}<\/title>/, () => `<title>${escapeHtml({ text: title })}</title>`);
}

/**
 * The current post's featured image, already resolved by the route layer — the same
 * `{ url, alt, width, height }` the Liquid/Handlebars tiers read as `post.featuredImage`
 * (`render.ts`'s `featuredImageView`), so both tiers show the identical image and alt text.
 */
export interface StaticFeaturedImage {
  readonly url: string;
  readonly alt: string;
  readonly width: number | null;
  readonly height: number | null;
}

/** The `<img>` for a public cover. `width`/`height` reserve the box before the bytes arrive (no
 *  layout shift; the theme's CSS scales it with `height: auto`). Eager with high fetch priority, not
 *  lazy: it sits at the top of the post, so it is usually the page's largest paint. Cards opt into
 *  lazy loading; URL/alt escaping and optional dimensions stay identical across both surfaces.
 * @example renderCoverImageTag({ image }, { loading: "lazy" })
 * @complexity O(url + alt) for escaping; no I/O.
 */
export function renderCoverImageTag({ image }: { image: StaticFeaturedImage }, optional: { loading?: "lazy" } = {}): string {
  const width = image.width === null ? "" : ` width="${image.width}"`;
  const height = image.height === null ? "" : ` height="${image.height}"`;
  const priority = optional.loading === "lazy" ? ' loading="lazy"' : ' fetchpriority="high"';
  return `<img src="${escapeHtml({ text: image.url })}" alt="${escapeHtml({ text: image.alt })}"${width}${height} decoding="async"${priority}>`;
}

/**
 * Fills every `{"type":"featured-image"}` marker with the current post's featured image, or removes
 * the marker's WHOLE element when there is none. Deliberately the opposite of the "absent input,
 * absent effect" rule {@link injectMenuEmbeds}/{@link injectPostPreviewsEmbeds} follow: a menu's
 * fallback is real content worth keeping, but a featured-image wrapper with nothing in it is an empty
 * figure with margins. `null`/`undefined` both mean "no image" — every surface that is not rendering
 * a post with one (home, marketing pages, a page with none set) passes nothing.
 *
 * @complexity O(n) over `html`'s length — one `substituteMarkers` scan-and-splice pass.
 */
export function injectFeaturedImage({ html, image }: { html: string; image: StaticFeaturedImage | null | undefined }, _optional = {}): string {
  return substituteMarkers({ html: html, resolve: (marker) => {
    if (marker.type !== FEATURED_IMAGE_MARKER_TYPE) return undefined;
    return image ? withInnerContentFinal({ marker: marker, inner: renderCoverImageTag({ image }) }) : "";
  } });
}

/**
 * Fill author markers and the `{{author}}` shortcut with one escaped, visibility-gated credit.
 * A marker inside a content placeholder declares a byline for that content's header; fill it here
 * too for static previews, where the content itself has not yet been resolved.
 * @returns HTML with hidden marker elements removed and hidden tokens replaced with empty text.
 * @complexity O(n) time and output space in template length; no I/O or input mutation.
 */
export function injectPostAuthor(
  required: { html: string; post?: { author?: string | null; showAuthor?: boolean } },
  _optional: Record<string, never> = {},
): string {
  const author = required.post ? postAuthorForDisplay({ post: required.post }) : null;
  const credit = author ? `By ${escapeHtml({ text: author })}` : "";
  const resolveAuthor = (marker: EmbedMarker): string | undefined => {
    if (marker.type !== "post-author") return undefined;
    return credit ? withInnerContentFinal({ marker, inner: (marker.attrs.includes('data-post-author-separator=') ? " · " : "") + credit }) : "";
  };
  // Substitute tokens before markers so token-like text in a saved author stays literal data.
  const html = required.html.replaceAll("{{author}}", () => credit);
  return substituteMarkers({ html, resolve: (marker) => {
    if (marker.type !== "content") return resolveAuthor(marker);
    const inner = substituteMarkers({ html: marker.inner, resolve: resolveAuthor });
    return inner === marker.inner ? undefined : withInnerContent({ marker, inner });
  } });
}

/**
 * Select the current content header's byline. A nested author marker explicitly places it below
 * the title/date; a byline elsewhere in the expanded template owns its own placement, so the core
 * header contributes none. Otherwise every theme gets the same `post-author` span as fallback: a span,
 * not a paragraph, because the core header sets it inside the date's `.post-meta` line, where a theme's
 * `p` margins or font size would pull it out of that line's typography (2026-10-10).
 * A nested marker goes into that same line, so it is re-tagged as a `span` too, keeping its authored
 * attributes and inner content: themes author it as `<p class="post-author">`, and as a `<p>` it took
 * the theme's 18px body text beside the 13px muted date, off the date's baseline (2026-10-10).
 * Return marker markup for the final {@link injectPostAuthor} pass, which owns escaping and
 * hidden-credit removal. Deferring that pass also keeps token-like text in a saved author literal.
 * @complexity O(n) time and output space in template length; pure, with no I/O.
 */
export function postAuthorForContentHeader(
  required: { html: string; post: { id: string; slug: string } },
  _optional: Record<string, never> = {},
): string {
  const content = markersOfType({ html: required.html, type: "content" }).find(marker =>
    marker.id !== undefined ? marker.id === required.post.id : marker.config.slug === required.post.slug);
  const nestedAuthor = content && markersOfType({ html: content.inner, type: "post-author" })[0];
  if (nestedAuthor) return `<span${nestedAuthor.attrs}>${nestedAuthor.inner}</span>`;
  const tokenInHeader = content?.inner.includes("{{author}}") === true;
  if (!tokenInHeader && (required.html.includes("{{author}}") || markersOfType({ html: required.html, type: "post-author" }).length > 0)) return "";
  return `<span class="post-author" data-embed-config='{"type":"post-author"}'></span>`;
}
