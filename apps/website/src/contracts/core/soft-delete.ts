/**
 * @file The soft-delete ("in the trash") predicate for records carrying a `deletedAt` stamp.
 *
 * Moved here verbatim out of `features/post/post.ts` (which re-exports it, so every existing caller
 * is unchanged) because `platform/routing/routing.ts` needs the same rule, and `platform` importing
 * `features/post` for a null check was a `features/post <-> platform` module cycle. One predicate,
 * not a restated copy: routing's soft-delete rule must match the post store's exactly.
 */

/** True when a row is in the trash — the single predicate every trash-aware read applies. */
export function isTrashed(record: { readonly deletedAt?: string | null }): boolean {
  return record.deletedAt !== undefined && record.deletedAt !== null;
}
