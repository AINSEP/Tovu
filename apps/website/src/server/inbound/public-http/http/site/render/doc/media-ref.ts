import type { JsonValue, JsonObject } from "@jini-ai/core/primitives";
import type { MediaAssetRenderMeta } from "../../render-context.js";
import { renderImageTag } from "./media-tags.js";
import type { DocNodeRenderDeps } from "./doc-render-contract.js";
import { mediaUrlKey } from "#src/features/media/public-path";

/** `assetId`/`transformName` become `/m/` URL path segments (`media-rendition.ts`), so — same
 * discipline `html-embeds.ts`'s `MAX_EMBED_ID_LENGTH` applies to its own author-supplied ids —
 * shape is checked before either value is trusted into a path: non-empty, bounded, and free of
 * `/`/whitespace so an author-authored ref can never smuggle an extra path segment. An id that
 * fails this is treated exactly like a name absent from `mediaTransformVersions`: safe
 * placeholder degrade, never a malformed URL. */
const MAX_MEDIA_REF_ID_LENGTH = 200;

const PLAUSIBLE_MEDIA_REF_ID_PATTERN = /^[^\s/]+$/;

export function isPlausibleMediaRefId({ value }: { value: string }, _optional = {}): boolean {
  return value.length > 0 && value.length <= MAX_MEDIA_REF_ID_LENGTH && PLAUSIBLE_MEDIA_REF_ID_PATTERN.test(value);
}

/** `value` when it is a string passing {@link isPlausibleMediaRefId}; `undefined` otherwise. */
export function plausibleMediaRefId({ value }: { value: JsonValue | undefined }, _optional = {}): string | undefined {
  return typeof value === "string" && isPlausibleMediaRefId({ value }) ? value : undefined;
}

/** The `assetId`/`transformName` pair a ref-shaped image node's `attrs` must carry, or `null` when
 *  either is absent or fails {@link isPlausibleMediaRefId}'s shape check — split out of
 *  {@link tryRenderRefImage} purely to keep that function's own branch count down; no behavior of
 *  its own beyond the two field reads plus the shape check. */
function resolveRefImageIds(attrs: JsonObject): { assetId: string; transformName: string } | null {
  const assetId = typeof attrs.assetId === "string" ? attrs.assetId : undefined;
  const transformName = typeof attrs.transformName === "string" ? attrs.transformName : undefined;
  if (!assetId || !transformName || !isPlausibleMediaRefId({ value: assetId }) || !isPlausibleMediaRefId({ value: transformName })) return null;
  return { assetId, transformName };
}

/** `mediaAssetMetadata`'s per-asset overrides, normalized to {@link renderImageTag}'s `null`-means-
 *  "not set" contract — same reasoning as {@link resolveRefImageIds}: pulled out only to keep
 *  {@link tryRenderRefImage}'s own branch count (three `??` fallbacks plus three `?.` reads all
 *  count as separate branches under this repo's complexity gate) from being counted against it. */
function resolveMediaAssetOverrides({ meta }: { meta: MediaAssetRenderMeta | undefined }, _optional = {}): Pick<
  Parameters<typeof renderImageTag>[0],
  "width" | "height" | "cssClass" | "htmlAttributes"
> {
  return {
    width: meta?.width ?? null,
    height: meta?.height ?? null,
    cssClass: meta?.cssClass ?? null,
    htmlAttributes: meta?.htmlAttributes ?? null,
  };
}

/**
 * The `media` node's per-instance style precedence (2026-09-11, owner-directed: "you may have one
 * image being used across multiple things, and you wanna control the CSS in a post … just in that
 * post" — per-POST override on top of the asset-level default {@link resolveMediaAssetOverrides}
 * already resolves). One field at a time: the NODE's own value wins whenever it is set (non-null,
 * non-empty), the ASSET's value otherwise. Decided per field, not all-or-nothing, so a node that
 * overrides only `cssClass` still inherits the asset's own `htmlAttributes` (and always its
 * width/height — this task threads only `cssClass`/`htmlAttributes` onto the node, never size).
 *
 * "Empty means unset" here mirrors every other optional string field in this file rather than
 * inventing a new convention: {@link renderImageTag}'s own `props.cssClass ? … : ""` check and
 * {@link resolveEmbedHtmlAttributes}'s `!raw` guard both already treat `""` the same as `null`.
 *
 * @complexity O(1).
 */
export function mediaNodeStyleOverride({ nodeValue, assetValue }: { nodeValue: string | null; assetValue: string | null }, _optional = {}): string | null {
  return nodeValue ? nodeValue : assetValue;
}

/**
 * Attempts the REF-node image path — `attrs.assetId`/`attrs.transformName` resolved against
 * `mediaTransformVersions`/`mediaAssetMetadata` (ADR-027 §4's frozen URL contract). Returns `null`
 * when the ref shape isn't present/plausible, or the transform name isn't yet resolvable.
 * {@link renderDocImage} then uses LEGACY `src` only when no assetId is present — see that
 * function's own doc for the full two-shape contract this implements one
 * half of, and for why an unresolved ref degrades to a placeholder rather than a malformed URL.
 *
 * `nodeStyleOverride` (2026-09-11): optional per-node `cssClass`/`htmlAttributes`, layered over the
 * resolved asset's own same-named fields via {@link mediaNodeStyleOverride} — see that function's
 * doc for the full precedence rule. Only {@link renderDocMedia} (the `media` node) ever passes this;
 * {@link renderDocImage} (the legacy `image` node, out of scope for per-node styling) always omits
 * it, so `image` renders byte-identical to before this parameter existed.
 */
export function tryRenderRefImage(
  { attrs, alt, deps }: { attrs: JsonObject; alt: string; deps: DocNodeRenderDeps }, { nodeStyleOverride }: { nodeStyleOverride?: { cssClass: string | null; htmlAttributes: string | null } } = {}
): string | null {
  const ids = resolveRefImageIds(attrs);
  if (!ids) return null;
  const version = deps.mediaTransformVersions.get(ids.transformName);
  if (version === undefined) return null;
  const meta = deps.mediaAssetMetadata.get(ids.assetId);
  const assetOverrides = resolveMediaAssetOverrides({ meta });
  const overrides = nodeStyleOverride
    ? {
        ...assetOverrides,
        cssClass: mediaNodeStyleOverride({ nodeValue: nodeStyleOverride.cssClass, assetValue: assetOverrides.cssClass }),
        htmlAttributes: mediaNodeStyleOverride({ nodeValue: nodeStyleOverride.htmlAttributes, assetValue: assetOverrides.htmlAttributes }),
      }
    : assetOverrides;
  const urlKey = mediaUrlKey({ id: ids.assetId, slug: meta?.slug ?? null });
  return renderImageTag({ urlKey, sha256: meta?.sha256, transformName: ids.transformName, version, alt, ...overrides });
}
