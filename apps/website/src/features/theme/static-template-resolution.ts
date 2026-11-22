import { markersOfType } from "@jini-ai/cms/widgets/markers";
import type { DiscoveredTheme } from "./theme.js";


/**
 * Outcome of {@link resolveTemplate}: either a usable template, or the diagnostic page. Name kept
 * singular ("Post") for historical/import-compatibility reasons — the type predates the 2026-08-11
 * unification and was already documented as shared/kind-agnostic before this change; renaming it
 * remains a pure rename with no behavior change and stays out of this pass's scope too.
 */
export type PostTemplateResolution =
  | { kind: "template"; pageId: string; html: string }
  | { kind: "diagnostic" };

/**
 * Legacy -> current filename map for the live `basic` theme's 2026-09-03 rename to a
 * `posts-*.html`/`pages-*.html` content-template naming convention (`blog-post.html` ->
 * `posts-default.html`, `blog-sidebar-template.html` -> `posts-sidebar.html`, `page-shell.html` ->
 * `pages-default.html` — the theme's own `theme.json` `templates` array carries only the new names
 * now). Keyed and valued by `theme.pages` id (no `.html`), matching {@link resolveTemplate}'s own
 * `pageId` convention.
 *
 * Consulted ONLY as a fallback inside {@link resolveTemplate}'s `resolveAgainstTheme`, after a direct
 * `theme.pages[pageId]` lookup already missed — never as a first choice, and never for any OTHER
 * theme's own naming (a theme that still ships `blog-post.html` resolves it directly, this map is
 * never reached). This is what keeps every row whose stored `template_choice` still names an OLD
 * filename (27 counted 2026-09-03) rendering byte-for-byte identically after the rename, on `basic`
 * AND on every one of the five other installed static themes that still ship the old names — a row's
 * stored choice is theme-relative but not theme-scoped (this function's own doc above), so it must
 * keep resolving correctly however the active theme later changes. Explicitly NOT paired with a
 * database backfill of those 27 rows: backfilling `template_choice` to the new name would make a row
 * MORE fragile on a future theme switch (a theme that still ships only the old name would no longer
 * match), not less — this alias map is the only direction that stays correct in both timelines.
 *
 * A COMPATIBILITY SHIM, not a permanent feature — the mapping only exists because exactly one of six
 * installed static themes has adopted the new convention so far. Remove an entry once every
 * currently-installed static theme (`sites/tovu-com/themes/static/*`) ships the RIGHT-hand filename
 * instead of the left, and no `posts`/`pages` row's `template_choice` still names the left-hand one —
 * check both before deleting a line, not just one.
 */
const LEGACY_TEMPLATE_FILENAME_ALIASES: Readonly<Record<string, string>> = {
  "blog-post": "posts-default",
  "blog-sidebar-template": "posts-sidebar",
  "page-shell": "pages-default",
};

/**
 * Decide which of a static theme's template pages a Post or Page renders through (2026-08-11
 * unification — collapses what were the separate `resolvePostTemplate`/`resolvePageTemplate`
 * specializations of this same tri-state engine into one function, now that both kinds resolve
 * against the SAME `theme.manifest.templates` array and the SAME `"content"` slot marker). Pure —
 * the caller owns the embed-resolution I/O that follows.
 *
 * `templateChoice` is a **tri-state**, and the difference between two of its values is the whole
 * point of this function (regression, 2026-08-09: 15 of 19 published posts served the diagnostic
 * page at HTTP 200 because the two were conflated):
 *
 * - `null`/`undefined` — *never chosen*. Migration `0028` added `template_choice` as an additive
 *   nullable column with no backfill, so every pre-feature row reads `null`, as does any row
 *   written by a path that doesn't know this field exists (seed script, agent tool, direct API or
 *   DB insert). That is the absence of a decision, not a decision, so it falls back to the theme's
 *   first-listed template — the same value the admin editor's picker already defaults an unset row
 *   to on load, which keeps what an author sees selected and what the public site renders in
 *   agreement. Making the *column default* the *safe* behavior is deliberate: it is what stops this
 *   bug reappearing on the next row created outside the editor.
 *
 *   For a `kind: "page"` row specifically, this fallback arm is never reached in practice —
 *   `isEligibleForTemplateBranch`'s Page rule (`pages.ts`) refuses to route a Page into this
 *   resolution at all unless `templateChoice` is already non-`null`/`undefined`. It stays here
 *   rather than being special-cased away because the tri-state is a property of the CHOICE, not of
 *   which kind of row is asking — a caller that ever legitimately wants "never chosen -> theme's
 *   first template" for a Page (none does today) gets correct behavior for free, and that asymmetry
 *   living in the ELIGIBILITY gate rather than in here is exactly what let it survive this merge:
 *   this function did not have to change to preserve it, only its caller's gating did.
 * - `""` — *explicitly opted out*, the admin picker's "No template chosen" option. A deliberate
 *   author action, and the one value no naive insert produces. For a `kind: "post"` row, keeps
 *   showing the diagnostic page, which is the designed product behavior ("not a silent fallback to
 *   generic rendering") — the ONLY value that reaches the diagnostic page without the theme first
 *   getting a say.
 *
 *   For a `kind: "page"` row, `""` means something else since the owner's 2026-09-23 ruling: a
 *   **bare page** ({@link isBarePageChoice}), serving the Page's own HTML with no theme chrome at
 *   all — not the diagnostic page above. `isPageTemplateChoiceEligible` (below) now refuses a
 *   Page's `""` in both body formats, so this function is never reached with `""` for a Page in
 *   practice; the arm above applies to a Post only.
 * - `"blog-post.html"` — an explicit choice. Rendered as-is when the ACTIVE theme can honor it,
 *   and otherwise treated exactly like the never-chosen case, for the reason below.
 *
 * A stored choice is **theme-relative but not theme-scoped**: it names a file in whatever theme was
 * active when an author picked it, and nothing on the row records which theme that was. Switching
 * the site's active theme therefore strands every explicit choice at once. Reading a stranded
 * choice as an opt-out would put every one of those rows back on the HTTP-200 diagnostic page —
 * the same outage as the `null` regression, reached by a routine admin action instead of a
 * migration, and unreachable by any backfill because the stored value is a real filename rather
 * than `null`. "This theme has no such template" is the absence of a decision *for this theme*, not
 * a decision, so it falls back. Only `""` is theme-independent enough to mean opt-out.
 *
 * A page that exists but ships no `"content"` slot counts as "cannot honor" for the same reason and
 * falls back too; the diagnostic page is reached only when the theme's own first template is also
 * unusable, since rendering a slotless template would silently drop the row's body.
 *
 * `theme.pages` is keyed by filename WITHOUT `.html` (`loadTheme`'s convention) while
 * `templateChoice`/`theme.manifest.templates` entries carry it; the `.replace` below is the one
 * place that naming mismatch is bridged. A `pageId` absent from `theme.pages` gets ONE more chance
 * against {@link LEGACY_TEMPLATE_FILENAME_ALIASES} before counting as "cannot honor" — see that
 * constant's own doc for why this, not a database backfill, is what keeps a stranded old-named choice
 * resolving correctly on `basic` after its 2026-09-03 rename.
 *
 * @complexity O(n) in the template's HTML length for the slot check, over at most two candidates;
 *   O(1) lookups otherwise.
 */
export function resolveTemplate(
  required: { theme: DiscoveredTheme; templateChoice: string | null | undefined },
  _optional: Record<string, never> = {}
): PostTemplateResolution {
  const { theme, templateChoice } = required;
  if (templateChoice === "") return { kind: "diagnostic" };

  const resolveAgainstTheme = ({ choice }: { choice: string | undefined }, _optional = {}): PostTemplateResolution | undefined => {
    if (choice === undefined || choice === "") return undefined;
    const requestedId = choice.replace(/\.html$/, "");
    const pageId = theme.pages[requestedId] !== undefined ? requestedId : (LEGACY_TEMPLATE_FILENAME_ALIASES[requestedId] ?? requestedId);
    const html = theme.pages[pageId];
    // "Ships a slot" is asked of the shared parser, never of a substring match. The literal
    // `data-embed-id="{{post}}"` this used to test for stopped existing the moment the themes moved
    // onto `data-embed-config` (2026-08-10), and because the miss is indistinguishable from "this
    // theme has no such template", EVERY post silently fell through to the diagnostic page at HTTP
    // 200 — the exact 2026-08-09 regression this function's own doc was written about, re-entered
    // through a different door. Asking `markersOfType` also means a template carrying a hardcoded
    // real id (or an already-spliced body) counts as having a slot, which it does.
    if (html === undefined || markersOfType({ html: html, type: "content" }).length === 0) return undefined;
    return { kind: "template", pageId, html };
  };

  return (
    resolveAgainstTheme({ choice: templateChoice ?? undefined }) ??
    resolveAgainstTheme({ choice: theme.manifest.templates?.[0] }) ?? { kind: "diagnostic" }
  );
}
