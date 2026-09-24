import { DEFAULT_ALLOWED_MIME_TYPES, MediaValidationError, sniffContentType } from "@jini-ai/cms/media";

/**
 * @file Decides an uploaded file's content type from its bytes, not the client's declaration.
 *
 * `uploadMedia` checks only the client-declared `contentType` string against
 * `DEFAULT_ALLOWED_MIME_TYPES`, so SVG or HTML declared as `image/png` used to be stored. This sniffs
 * the magic bytes and requires the result to be on that same allowlist — the one server-side source
 * of truth the admin picker, post editor and URL importer lists mirror.
 */

/**
 * The content type to store for an upload: the sniffed type when it is an allowed media type.
 *
 * - Declared type not allowed → returned unchanged, so `uploadMedia` rejects it with its own message.
 * - Bytes sniff to anything outside the allowlist (SVG, HTML, unrecognized) → rejected.
 * - Bytes are a different ALLOWED type than declared (a PNG named `.jpg`) → the sniffed type, so the
 *   record says what the file really is instead of refusing an ordinary mislabeled image.
 *
 * @throws MediaValidationError `the file's content (<sniffed>) is not an allowed media type`.
 * @complexity O(1) — the sniffer reads a fixed-size prefix.
 */
export function resolveUploadContentType(input: { bytes: Uint8Array; declaredContentType: string }): string {
  if (!DEFAULT_ALLOWED_MIME_TYPES.has(input.declaredContentType)) return input.declaredContentType;
  const sniffed = sniffContentType(input.bytes);
  if (!DEFAULT_ALLOWED_MIME_TYPES.has(sniffed)) {
    throw new MediaValidationError(`the file's content (${sniffed}) is not an allowed media type`);
  }
  return sniffed;
}
