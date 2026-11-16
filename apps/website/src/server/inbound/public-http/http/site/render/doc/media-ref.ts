import type { JsonValue } from "@jini-ai/core/primitives";

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
