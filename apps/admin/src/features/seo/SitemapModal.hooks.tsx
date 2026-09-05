/**
 * @file `SitemapModal.tsx`'s one bit of sequencing that belongs to neither `useSitemapModal` nor
 * the outer `useSeo()` on its own — refetching the sitemap after a successful regenerate
 * (`SitemapModal.tsx`'s own file header already named this as the one thing living outside both
 * hooks). Kept as its own tiny hook, colocated with the component per the
 * `<Name>.tsx`/`<Name>.hooks.tsx` extraction pattern, rather than folded into
 * `use-sitemap-modal.hooks.ts` — that file's `SitemapModalController` is a public DI seam
 * (`SitemapModalProps.useModal`), and adding this sequencing to its signature would be a contract
 * change, not a relocation (2026-09-03 admin TSX-logic-sweep deferred exactly for this reason;
 * resolved here by giving the sequencing its own hook instead of extending that one).
 */

/**
 * @param onRegenerate - Resolves `true` on success, `false` on a caught failure (`useSeo`'s own
 *   `regenerateSitemap`) — only refetches on `true`, matching REQ 7 ("after a SUCCESSFUL
 *   regenerate it refetches"). A failed attempt leaves the currently-shown sitemap exactly as it
 *   was rather than re-fetching the same stale content.
 * @param refetch - `modal.refetch` from `useSitemapModal`.
 * @returns `handleRegenerate`, wired directly to the footer's Regenerate button.
 * @complexity O(1).
 */
export function useSitemapModalRegenerate(
  onRegenerate: () => Promise<boolean>,
  refetch: () => void
): { handleRegenerate: () => Promise<void> } {
  async function handleRegenerate() {
    const succeeded = await onRegenerate();
    if (succeeded) refetch();
  }
  return { handleRegenerate };
}
