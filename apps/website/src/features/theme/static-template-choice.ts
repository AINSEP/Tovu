import type { DiscoveredTheme } from "./theme.js";
import { resolveStaticTierPageShellFallback } from "./static-page-shell.js";


/**
 * Gates whether a `posts`-table record should even be routed into the template render branch
 * (`renderViaTemplate` in `apps/website/src/server/inbound/public-http/routes/site/pages.ts`) — a decision distinct from, and prior to,
 * {@link resolveTemplate}'s own tri-state resolution of WHICH template to use once inside that
 * branch.
 *
 * 2026-08-11 unification: collapses what were the separate `isEligibleForPostTemplateBranch`/
 * `isEligibleForPageTemplateBranch` gates into one function, now that both route to the SAME
 * `renderViaTemplate` using the SAME `theme.manifest.templates` array. The two gates existed
 * separately only because a Post-shaped and a Page-shaped template used to be structurally different
 * artifacts (different marker type, different manifest array) that needed different eligibility
 * arrays to check against; the unified `"content"` marker and single `templates` array removed that
 * split at the source, so keeping two near-identical functions here would just be the same
 * duplicated-logic risk `resolveTemplate`'s own doc already warns about.
 *
 * The BEHAVIORAL asymmetries the two old gates encoded are preserved exactly, not merged away —
 * losing either would silently reintroduce a live bug:
 *
 * - `kind: "post"` — eligible whenever the record is `doc`-format, `templateChoice` included.
 *   {@link resolveTemplate} treats `null`/`undefined` as "never chosen" and deliberately falls back
 *   to the theme's first-listed template (see that function's own doc): migration `0028` added
 *   `template_choice` as an additive nullable column with no backfill, so every pre-feature and
 *   externally-inserted Post reads `null`, and "no opinion yet" must render *something* sensible
 *   rather than a diagnostic page. Posts are always `doc`-format (CIC-3, `PostBodyFormat`'s own
 *   doc), so `bodyFormat` needs no separate check for this arm.
 * - `kind: "page"`, `bodyFormat: "doc"` — eligible ONLY when `templateChoice` is a real filename:
 *   not `null`/`undefined`, and — since the owner's 2026-09-23 bare-page ruling described in the next
 *   bullet — not `""` either. The "never chosen → theme's first template" fallback that is safe for
 *   Posts is wrong for Pages: no admin surface set `template_choice` on a `kind: "page"` row before
 *   the Pages template picker shipped, so a Page reading `null` means "an admin surface that didn't
 *   exist yet couldn't have set it", not "no opinion". Falling back would apply a Post-shaped
 *   template to a Page that never asked for one — the live bug this asymmetry fixes: `terms-of-
 *   service`, `privacy-policy`, `contact`, `team`, `faq` rendered under the theme's first template
 *   entry (observed as `<title>Blog post — Basic</title>` on Terms of Service) purely because
 *   `bodyFormat === "doc"` was once the only condition checked, with no `kind` check at all.
 *   `our-story` (`kind: "page"`, `bodyFormat: "doc"`, `templateChoice: "page-shell.html"`, the
 *   proof-of-concept demo row) keeps rendering through this branch under this rule, because its
 *   choice IS explicit.
 * - `kind: "page"`, `bodyFormat: "html"` — same explicit-choice requirement: `""` is ALSO ineligible
 *   here, identically to `null`/`undefined`. Before the owner's 2026-09-23 ruling this was a
 *   documented DIVERGENCE from the `doc`-format Page rule above: a doc-format Page's `""` used to be
 *   eligible (routing to `resolveTemplate`'s diagnostic-page arm, the same as a Post), while an
 *   `"html"`-format Page's `""` was already ineligible (matching `null`), because "no template" was
 *   that format's normal, fully-functional default and a stray dropdown selection shouldn't break an
 *   otherwise-working page. The ruling gave `""` a THIRD, Page-only meaning instead of resolving that
 *   divergence either way: a **bare page** ({@link isBarePageChoice}), serving the Page's own HTML
 *   with no theme chrome at all. A bare Page must never enter this template branch regardless of
 *   which body format it happens to be saved as, which is exactly what retires the divergence — both
 *   formats now agree, and `isPageTemplateChoiceEligible` below no longer even branches on
 *   `bodyFormat`.
 *
 *   CORRECTION (2026-09-02): "fully-functional" above was false for a `static`-tier active theme.
 *   The generic path this arm sends an untemplated `html` Page to (`renderSite`'s
 *   `renderDeclarativeTierBody` -> `fallbackSiteBody` -> `pageShell()`) is Tovu's own built-in demo
 *   chrome, correct for the `declarative`/`templated`/`handlebars` tiers (which have no other shell)
 *   but not a static theme's real document — no `data-theme`, no theme scripts/icons, no real
 *   nav/footer. Live: an agent-authored Page lost the active theme's chrome entirely. This gate's OWN
 *   behavior (never route an unchosen Page into the template branch) is UNCHANGED and stays correct —
 *   what was wrong is the assumption about what the fallback destination looked like. Fixed at that
 *   destination instead of here: see {@link resolveStaticTierPageShellFallback}, consulted by
 *   `renderTemplateBranchIfEligible` (`pages.ts`) only when this gate returns `false`.
 *
 * @complexity O(1) — field comparisons only, no I/O or iteration.
 */
/**
 * The `kind: "page"` half of {@link isEligibleForTemplateBranch} — split out purely to keep that
 * function's own branch count proportional to "which gate applies", not also this gate's own checks.
 *
 * Format-independent since the owner's 2026-09-23 bare-page ruling: `""` is ineligible in BOTH
 * `bodyFormat`s now (a bare Page, see {@link isBarePageChoice}), which retires the doc/html
 * divergence this function used to preserve verbatim — `bodyFormat` is accepted only because callers
 * pass whole records, and is no longer read. See the caller's own doc for the full history.
 */
function isPageTemplateChoiceEligible(post: { bodyFormat: "doc" | "html"; templateChoice?: string | null }): boolean {
  return post.templateChoice !== null && post.templateChoice !== undefined && post.templateChoice !== "";
}

/**
 * Identifies a **bare page** — the owner's 2026-09-23 ruling for `templateChoice: ""` on a
 * `kind: "page"` row: serve the Page's own HTML only, with no theme CSS/JS, header, or footer.
 *
 * Pure, and deliberately checked BEFORE any template-branch gate: `renderTemplateBranchIfEligible`
 * (`routes/site/pages.ts`) must call this first, ahead of the `theme === null` early return and
 * either template-branch gate, because a bare Page renders identically whether or not a theme is even
 * active. {@link isPageTemplateChoiceEligible} and {@link resolveStaticTierPageShellFallback}
 * separately also refuse a bare Page's `""` on their own — belt-and-suspenders, not this predicate's
 * job — so a caller that skips this check still cannot land a bare Page in the template branch or
 * under a static theme's page shell. This predicate exists for the caller that needs to route to the
 * SEPARATE bare-rendering path, not merely to exclude bare Pages from this one.
 *
 * A Post is excluded by construction (`post.kind === "page"`): a Post's `""` keeps its own, unrelated
 * meaning — the diagnostic page, see {@link resolveTemplate} — untouched by this ruling.
 *
 * @param post - The record being rendered. Only `kind` and `templateChoice` are read.
 * @returns `true` only for a `kind: "page"` row whose `templateChoice` is the empty string.
 * @complexity O(1) — two field comparisons, no I/O.
 */
export function isBarePageChoice(post: { kind: "post" | "page"; templateChoice?: string | null }): boolean {
  return post.kind === "page" && post.templateChoice === "";
}

export function isEligibleForTemplateBranch(
  required: {
    theme: DiscoveredTheme;
    post: { kind: "post" | "page"; bodyFormat: "doc" | "html"; templateChoice?: string | null };
  },
  _optional: Record<string, never> = {}
): boolean {
  const { theme, post } = required;
  if (theme.manifest.tier !== "static") return false;

  const templateCount = theme.manifest.templates?.length ?? 0;
  if (templateCount === 0) return false;

  if (post.kind === "post") return true;

  // kind === "page" — no "never chosen" fallback arm, ever (see this function's own doc for why).
  return isPageTemplateChoiceEligible(post);
}

/**
 * {@link resolveTemplateBranchChoice}'s outcome — WHICH template a record actually renders through,
 * once both the eligibility gate and the static-tier page-shell fallback have had their say.
 *
 * - `"as-chosen"` — {@link isEligibleForTemplateBranch} said yes; render the record's own
 *   `templateChoice` unchanged and let {@link resolveTemplate}'s tri-state do the rest.
 * - `"page-shell"` — ineligible, but {@link resolveStaticTierPageShellFallback} found the theme's
 *   canonical page shell. `templateChoice` is the filename to render UNDER, for this render only;
 *   the caller must apply it to a shallow clone and never write it back to the row.
 * - `"ineligible"` — neither applies. The public site falls through to its generic render for this.
 */
export type TemplateBranchChoice =
  | { kind: "as-chosen" }
  | { kind: "page-shell"; templateChoice: string }
  | { kind: "ineligible" };

/**
 * The single answer to "which template does this record render through" — {@link
 * isEligibleForTemplateBranch} and {@link resolveStaticTierPageShellFallback} composed in the one
 * order that is correct, so that no caller has to remember to consult both.
 *
 * Extracted 2026-09-16 from `renderTemplateBranchIfEligible` (`routes/site/pages.ts`), which was the
 * ONLY caller that ran both — the admin template-preview route (`routes/posts/template-preview.ts`)
 * called `renderViaTemplate` directly and so ran NEITHER. For a `kind: "page"`, `bodyFormat: "html"`
 * row with `templateChoice: null` (the state every agent-created and every freshly-saved Page starts
 * in, since no create path writes that column) the two paths therefore disagreed: the public site
 * resolved the page shell while the preview fell through `resolveTemplate`'s "never chosen" arm onto
 * `theme.manifest.templates[0]` — `posts-default.html` on the live `basic` theme. The operator's
 * preview pane showed a Page wearing a blog post's chrome and stylesheet while the public URL served
 * it correctly (owner-observed, `/admin/pages/say-hello`: "the css for the preview wasnt rendering
 * correctly").
 *
 * The fix is this function's EXISTENCE, not its contents: the logic is byte-for-byte what
 * `renderTemplateBranchIfEligible` already did, and the defect was that a second render entry point
 * could reach `renderViaTemplate` without passing through it. Any THIRD entry point must call this,
 * not the two underlying functions in sequence.
 *
 * Deliberately says nothing about what an `"ineligible"` caller should do — the public site has a
 * generic render path to fall to and the admin preview does not, and pretending one answer serves
 * both is how the two drifted apart in the first place.
 *
 * @param required.theme - The active theme, already resolved (never `null` here; a caller with no
 *   theme has nothing to render through and must short-circuit before calling).
 * @param required.post - The record being rendered. Only `kind`, `bodyFormat` and `templateChoice`
 *   are read; a shallow clone carrying a PENDING `templateChoice` (the admin preview's override) is
 *   an intended input, not a misuse.
 * @returns Which template branch applies, per {@link TemplateBranchChoice}.
 * @complexity O(n) in the candidate templates' HTML length for their `"content"` slot checks, over a
 *   small fixed number of candidates; O(1) otherwise. No I/O.
 */
export function resolveTemplateBranchChoice(
  required: {
    theme: DiscoveredTheme;
    post: { kind: "post" | "page"; bodyFormat: "doc" | "html"; templateChoice?: string | null };
  },
  _optional: Record<string, never> = {}
): TemplateBranchChoice {
  const { theme, post } = required;
  if (isEligibleForTemplateBranch({ theme, post })) return { kind: "as-chosen" };

  const pageShell = resolveStaticTierPageShellFallback({ theme, post });
  return pageShell !== undefined ? { kind: "page-shell", templateChoice: pageShell } : { kind: "ineligible" };
}
