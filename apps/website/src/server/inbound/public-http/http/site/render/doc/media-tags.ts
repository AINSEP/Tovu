import type { MarkerAttribute } from "@jini-ai/cms/widgets/markers";
import { mediaPublicPath } from "#src/features/media/public-path";
import { NO_MARKER_ATTRIBUTES, mediaAltAttrValue, mediaDimensionAttr, resolveEmbedHtmlAttributes, foldHtmlAttributesClass, mergeMediaClassAttr, attributeValueHtml, mergeMediaExtraAttributes, omitKey } from "./html-attributes.js";
import { escapeHtml } from "#src/platform/html/escape";

/** Names {@link renderImageTag} renders itself at a fixed position — kept out of
 *  {@link mergeMediaExtraAttributes}'s generic tail so none of them is ever emitted twice. */
const MEDIA_IMAGE_FIXED_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set(["class", "alt", "width", "height", "loading"]);

export function renderImageTag(props: {
  readonly sha256?: string;
  /** The `/m/...` path segment to serve this asset at — its slug when it has one, otherwise its id.
   *  Built by every caller via `mediaUrlKey` (readable-slugs S3); this function only templates
   *  whatever key it is handed, same as before this field was renamed from `assetId`. */
  readonly urlKey: string;
  readonly transformName: string;
  readonly version: number;
  readonly alt: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly cssClass: string | null;
  readonly htmlAttributes: string | null;
  readonly markerAttributes?: readonly MarkerAttribute[];
  /** Gallery responsive candidate uses the real resolved rendition, without inventing transforms. */
  readonly responsive?: boolean;
}): string {
  const src = mediaPublicPath({ key: props.urlKey, sha256: props.sha256, variant: { kind: "transform", name: props.transformName, version: props.version, ext: "jpg" } });
  const markerAttributes = props.markerAttributes ?? NO_MARKER_ATTRIBUTES;
  const altAttr = mediaAltAttrValue({ assetAlt: props.alt, markerAttributes });
  const widthAttr = mediaDimensionAttr({ name: "width", assetValue: props.width, markerAttributes });
  const heightAttr = mediaDimensionAttr({ name: "height", assetValue: props.height, markerAttributes });
  // `loading` is on the allowlist (an operator may legitimately want `loading="eager"`) but this
  // tag already hardcodes a `loading="lazy"` default below — the asset's own value, when present,
  // wins over the default, and a marker's own `loading` attribute (D3: author wins over asset) wins
  // over both, never a silently dropped or duplicated second `loading` attribute.
  const allExtra = resolveEmbedHtmlAttributes({ raw: props.htmlAttributes });
  // `class` is now an allowlisted name (S1, 2026-09-23 widget-attrs plan), same as `style`/`id` — it
  // is folded into the class attribute here rather than left to `mergeMediaExtraAttributes`'s
  // generic tail (which already excludes it via `MEDIA_IMAGE_FIXED_ATTRIBUTE_NAMES`, same reason
  // `mergeMediaClassAttr`'s own doc gives for the marker's `class`: an addition, never a second
  // `class="..."` attribute).
  const classAttr = foldHtmlAttributesClass({ classAttr: mergeMediaClassAttr({ assetClass: props.cssClass, markerAttributes }), extraClass: allExtra.class });
  const markerLoading = markerAttributes.find((attr) => attr.name === "loading");
  const loadingValue = markerLoading
    ? attributeValueHtml({ value: markerLoading.value ?? "lazy", source: "marker" })
    : attributeValueHtml({ value: allExtra.loading ?? "lazy", source: "asset" });
  const extraAttrs = mergeMediaExtraAttributes({ assetExtras: omitKey({ attributes: allExtra, key: "loading" }), markerAttributes, excludeNames: MEDIA_IMAGE_FIXED_ATTRIBUTE_NAMES });
  // The current media contract exposes one public rendition, not a width ladder. A real 1x
  // candidate avoids advertising nonexistent widths/transform routes; theme CSS sizes it fluidly.
  const srcset = props.responsive === true ? ` srcset="${escapeHtml({ text: src })} 1x"` : "";
  return `<img src="${escapeHtml({ text: src })}"${srcset} alt="${altAttr}"${widthAttr}${heightAttr}${classAttr}${extraAttrs} loading="${loadingValue}">`;
}

/**
 * Builds a real `<video>` tag for a resolved video media embed (video/embed capability,
 * 2026-08-24) — {@link renderImageTag}'s sibling, same optional-attribute-omission convention, but
 * points `src` at `/m/{assetId}/original` (`routes/site/media-rendition.ts`'s
 * `registerMediaOriginalVideoRoute`) instead of the versioned transform URL: video has no
 * transform/version to template in, since it bypasses the image-transform pipeline entirely (see
 * that route's own doc for why). `alt` becomes the tag's fallback text node, not an `alt`
 * attribute — `<video>` has no such attribute; a browser that can't play the element renders its
 * children instead, so this is the same information in the shape `<video>` actually supports.
 *
 * @complexity O(1).
 */
/** Names {@link renderVideoTag} renders itself at a fixed position (or, for `controls`, via its own
 *  boolean prop rather than a forwarded attribute at all) — kept out of
 *  {@link mergeMediaExtraAttributes}'s generic tail so none of them is ever emitted twice. `controls`
 *  is excluded unconditionally even though `EmbedOccurrence.elementAttributes` never actually carries
 *  a `"controls"`-named entry (`html-embeds.ts`'s `resolveMarkerControls`/`planMediaMarkerAttributes`
 *  strip it before this function ever sees `markerAttributes`) — this is defence-in-depth for the same
 *  reason {@link resolveEmbedHtmlAttributes} fails closed on a re-parse: never trust a single upstream
 *  guarantee alone for a rule this precise (a stray `controls="false"` reaching a browser as a literal
 *  attribute still shows controls, since it is a boolean-by-presence attribute). */
const MEDIA_VIDEO_FIXED_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set(["class", "alt", "width", "height", "controls"]);

// Mediawidget audio extends this existing player owner, retaining shared class/attribute
// precedence, controls and the canonical original-byte URL instead of copying a video lifecycle.
export function renderVideoTag(props: {
  readonly sha256?: string;
  readonly kind?: "video" | "audio";
  readonly contentType: string;
  /** Same `mediaUrlKey`-built `/m/...` key {@link renderImageTag}'s own `urlKey` documents —
   *  readable-slugs S3. */
  readonly urlKey: string;
  readonly alt: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly cssClass: string | null;
  readonly htmlAttributes: string | null;
  readonly markerAttributes?: readonly MarkerAttribute[];
  /** `EmbedOccurrence.controls` (owner decision, 2026-09-16): `false` only when the marker's own
   *  `controls` attribute resolves to off. Rendered as a bare `controls`/nothing — never a raw
   *  forwarded attribute of that name; see {@link MEDIA_VIDEO_FIXED_ATTRIBUTE_NAMES}'s own doc.
   *  Defaults to `true` (the pre-existing, only-ever behavior before this prop existed). */
  readonly controls?: boolean;
}): string {
  const tag = props.kind ?? "video";
  const src = mediaPublicPath({ key: props.urlKey, sha256: props.sha256, variant: { kind: "original", contentType: props.contentType } });
  const markerAttributes = props.markerAttributes ?? NO_MARKER_ATTRIBUTES;
  const controlsAttr = (props.controls ?? true) ? " controls" : "";
  const widthAttr = tag === "video" ? mediaDimensionAttr({ name: "width", assetValue: props.width, markerAttributes }) : "";
  const heightAttr = tag === "video" ? mediaDimensionAttr({ name: "height", assetValue: props.height, markerAttributes }) : "";
  const allExtra = resolveEmbedHtmlAttributes({ raw: props.htmlAttributes });
  // `class` is now an allowlisted name (S1, 2026-09-23 widget-attrs plan) — folded in here, same as
  // `renderImageTag`'s own identical fold, rather than left to `mergeMediaExtraAttributes`'s generic
  // tail (already excluded via `MEDIA_VIDEO_FIXED_ATTRIBUTE_NAMES`).
  const classAttr = foldHtmlAttributesClass({ classAttr: mergeMediaClassAttr({ assetClass: props.cssClass, markerAttributes }), extraClass: allExtra.class });
  // No hardcoded default here to collide with (unlike `renderImageTag`'s `loading`) — every
  // allowlisted asset attribute is emitted as-is, including boolean ones (`muted`, `loop`,
  // `autoplay`, `playsinline`), which the parser records as an empty-string value; HTML treats ANY
  // value (including `""`) on a boolean attribute as "true", so `muted=""` and bare `muted` are
  // equivalent. A marker's own boolean attribute keeps ITS OWN shape instead (a bare `autoplay`
  // renders as bare `autoplay`, never `autoplay=""`) — {@link mergeMediaExtraAttributes} preserves
  // that distinction rather than normalizing every boolean attribute to the asset path's convention.
  const extraAttrs = mergeMediaExtraAttributes({ assetExtras: allExtra, markerAttributes, excludeNames: MEDIA_VIDEO_FIXED_ATTRIBUTE_NAMES });
  // `alt` has no `<video>` attribute equivalent (see this function's own header doc) — a marker's
  // `alt` attribute (D3) replaces the fallback TEXT NODE instead, used verbatim as source text (never
  // re-escaped: this text node sits inside a page whose own body HTML is already unsanitized by
  // design — D6 — so a marker attribute's value carries no less trust here than it does anywhere else
  // on the same page).
  const markerAlt = markerAttributes.find((attr) => attr.name === "alt");
  let fallback: string;
  if (markerAlt) fallback = markerAlt.value ?? "";
  else fallback = props.alt ? escapeHtml({ text: props.alt }) : `Your browser does not support the ${tag} tag.`;
  return `<${tag} src="${escapeHtml({ text: src })}"${controlsAttr}${widthAttr}${heightAttr}${classAttr}${extraAttrs}>${fallback}</${tag}>`;
}
