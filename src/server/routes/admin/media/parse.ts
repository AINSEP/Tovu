/**
 * @file Shared request-body field parsing for the `media` admin routes.
 *
 * `upload.ts` and `update.ts` both read a handful of optional string fields (`alt`/`caption`/
 * `credit`, plus `title` on `update.ts`) off an untyped body with the same undefined-means-omitted
 * shape. Factored out once both needed it, rather than each carrying its own copy.
 */

/**
 * `undefined` means "field omitted, leave it alone"; only a genuinely-provided value gets
 * `String(...)`'d. There is no `null`-clear case here — neither route's underlying write-service
 * function gives these fields clear semantics, so a literal `null` is stringified to `"null"` same
 * as any other value.
 *
 * @complexity O(1).
 */
export function parseOptionalStringField(raw: unknown): string | undefined {
  return raw === undefined ? undefined : String(raw);
}
