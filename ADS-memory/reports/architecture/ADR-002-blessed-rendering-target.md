# ADR-002: React Is the Blessed v1 Rendering Target; Contracts Stay Renderer-Agnostic

- Status: ACCEPTED — AMENDED by ADR-010 (themes are declarative by default;
  the "themes are trusted code" rationale below now applies only to the
  code-theme class. React remains core's rendering implementation.)
- Date: 2026-07-01
- Author: Claude Fable 5 / Leon Aburime (design session, `tovu-v1-design.md` §8 W1)

## Context

Tovu's theme layer sits on a headless content API, so the *platform* is already
framework-free. But templates must be written in *something*, and every successful
CMS theme ecosystem standardized on one template technology (WordPress → PHP,
Ghost → Handlebars, Shopify → Liquid). A "bring any framework" theme surface
fragments a young ecosystem into N tiny ones and gives theme authors no clear
target. Meanwhile the repo currently maintains two co-equal admin shells
(Next + Vue), paying double maintenance to insure against framework death.

## Decision

1. **The theme/admin contracts remain pure data, renderer-agnostic:** manifest,
   template IDs, template-hierarchy rules, slots/regions, design tokens
   (theme.json analog), settings schemas, admin surface descriptors. Nothing in
   `core` imports React.
2. **React (server-rendered, TSX templates) is the single blessed rendering
   target for v1 themes and plugin admin UI.** Reasons: largest author pool;
   the admin editor stack (TipTap) is React; block rendering shares one
   component registry across site and admin preview.
3. **Themes declare their renderer in their manifest** (`renderer: "react@1"`).
   The platform loads the renderer adapter a theme needs. Adding a second
   blessed renderer later (Vue, Astro, or a sandboxed template language) is
   *additive*: old themes keep working because their renderer adapter stays.
4. **The Vue shell is demoted from co-equal admin to a contract test** — it
   exists to prove descriptors stay framework-agnostic, not to ship features.

## Why not Handlebars/Liquid?

Declarative template languages exist to make *untrusted* themes safe (Shopify's
themes are tenant code on shared infra). Tovu's install model is WordPress-like
(self-hosted; themes are trusted code), so TSX's full-power authoring wins. If a
hosted marketplace later needs untrusted themes, add a "restricted theme" type
backed by a sandboxable template language as a second renderer — the manifest
`renderer` field already anticipates this.

## Consequences

- Switching frameworks later is not impossible — it is additive (new renderer
  adapter + new themes), and core/plugins/content are untouched. What you cannot
  do is render *one* theme with *many* frameworks; a theme targets its renderer.
- Plugin admin UI needs bundling rules: shared deps (react, react-dom, tiptap,
  icon lib) are externalized and provided by the shell at pinned major versions;
  plugin bundles are client components mounted in admin-shell slots; CSS is
  scoped (CSS modules or prefixed layer) — see ADR-004.
- The runtime-switchable "choose your renderer in admin" idea resolves to:
  choose your *theme* in admin; the theme brings its renderer requirement.
