/**
 * @file SPEC-047 — the starter document a Page is born with, and the region vocabulary the editor
 * and (later) the generation tools address it through.
 *
 * **Inner content only.** No `<html>`, `<head>`, nav, or footer: `server/http/site/render.ts`'s
 * "the theme is data" contract means the active theme's template owns the page chrome for every
 * entry, bespoke or not. A generated Page authors what sits inside the theme's content slot and
 * nothing else, which is what stops a bespoke page inventing its own navigation (SPEC-047 §8's
 * OQ-3 resolution).
 *
 * **Regions are `data-agent-element`, not a Tovu-specific attribute.** `@jini-ai/vibecoding/html`'s
 * `createHtmlRegionTarget` addresses parts by exactly this attribute (reusing `@jini-ai/agentic`'s
 * existing handle convention, where `region` is already a defined role), and treats the set of
 * handles present in the document as the allowlist of editable parts. So the handles below are not
 * decoration — they are the addressable surface, and `validate` refuses any candidate edit that
 * changes the handle multiset.
 *
 * This is the "pre-tagged skeleton" arm of the strategy comparison the owner asked for (both arms
 * to be built and compared): the model only ever fills regions that already exist, so every write
 * is covered by the allowlist-cannot-self-extend guard from the first turn. The competing arm — the
 * model authors the whole document and the regions are whatever it tagged — is not implemented
 * here.
 */

/** The `data-agent-element` handle for each region a starter Page ships with. */
export const PAGE_SKELETON_REGIONS = ["page-hero", "page-body", "page-cta"] as const;

export type PageSkeletonRegion = (typeof PAGE_SKELETON_REGIONS)[number];

/**
 * The seed document written when a Page is first converted to `body_format: "html"`.
 *
 * Styling references theme tokens as `var(--token, <literal>)` per D-3/REQ-8 — custom property with
 * a literal fallback, never a bare hex. The literals here are only the fallback leg; the real values
 * come from the active theme's `:root` emission, so a skeleton page already looks like the site
 * before a model has touched it.
 *
 * Deliberately readable and hand-editable: the operator sees this markup in the editor's HTML view
 * on a brand-new page, and it is the first thing that teaches them what a region is.
 */
export const DEFAULT_PAGE_SKELETON = `<section data-agent-element="page-hero" data-agent-role="region" class="page-hero">
  <h1>New page</h1>
  <p>Describe what you want in the assistant, and this page will be rebuilt around it.</p>
</section>

<section data-agent-element="page-body" data-agent-role="region" class="page-body">
  <p>This is the main content region.</p>
</section>

<section data-agent-element="page-cta" data-agent-role="region" class="page-cta">
  <p><a href="/contact">Get in touch</a></p>
</section>

<style>
  .page-hero { padding: 4rem 1.5rem; text-align: center; background: var(--surface-muted, #f6f5f3); }
  .page-hero h1 { font-family: var(--font-heading, inherit); color: var(--text-strong, #1b1b1b); margin: 0 0 .5rem; }
  .page-body { padding: 3rem 1.5rem; max-width: 46rem; margin: 0 auto; color: var(--text, #333); }
  .page-cta { padding: 3rem 1.5rem; text-align: center; }
  .page-cta a { color: var(--accent, #8a4b2a); font-weight: 600; }
</style>
`;
