import type { PublishScope } from "@tovu/publish-content-ui";

/**
 * @file `plan-publish-sections-2026-09-25.md` §2 S2 — the pure label rules behind the dialog's title,
 * its idle-state primary button, and (S3) each section list page's own "Publish <type>" button. Kept
 * here rather than inline in `PublishContentDialog.tsx`/`use-publish-content-confirm.hooks.ts` so
 * both read the SAME mapping instead of two copies drifting apart, and so the mapping can be unit
 * tested without mounting the dialog.
 *
 * The six keys are the registry's own publishable entity types (`ui/index.ts`'s contributors) —
 * Forms has no publish contributor and gets no section button, per plan §0.
 */
export const PUBLISH_SECTION_LABEL_KEYS: Record<string, string> = {
  page: "Publish pages",
  post: "Publish posts",
  media: "Publish media",
  menu: "Publish menus",
  redirect: "Publish redirects",
  "theme-files": "Publish themes",
};

/**
 * The English copy key for a scope's dialog title / idle-state primary label, resolved through the
 * screen's own `Translate` at the call site (this module knows nothing about locales).
 *
 * - No `scope` at all (or an `entityTypes` naming more than one type with no `entityKeys`) reads as
 *   publishing everything.
 * - `entityKeys` (non-empty) always wins and reads as a single-item publish, regardless of what
 *   `entityTypes` also carries — plan §1's "a per-row dialog is titled 'Publish item'".
 * - Exactly one `entityTypes` entry with no `entityKeys` reads as that section's own label.
 *
 * An empty `entityKeys` array is treated the same as an absent one, matching `PublishScope`'s own
 * contract (`ui/contract.ts`): emptiness is never a real selection here, only "nothing narrowed yet".
 *
 * @complexity O(1).
 */
export function publishScopeTitleKey(scope: PublishScope | undefined): string {
  if (scope?.entityKeys !== undefined && scope.entityKeys.length > 0) return "Publish item";
  if (scope?.entityTypes !== undefined && scope.entityTypes.length === 1) {
    return PUBLISH_SECTION_LABEL_KEYS[scope.entityTypes[0]] ?? "Publish all content";
  }
  return "Publish all content";
}
