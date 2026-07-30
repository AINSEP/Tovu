PACKET-ID: templating-debate-2026-07-07-r1

You are one of several independent expert reviewers evaluating the theming
architecture for a CMS product. Give an independent, opinionated recommendation.
Do not hedge into "it depends" without committing to a concrete answer. You have
not been told what anyone else thinks; reason from first principles.

## The product (facts, not preferences)
- "Tovu" — a self-hosted, own-your-content CMS. A whole site lives in one
  portable folder (SQLite today; Postgres/Supabase later). Server-rendered.
  Written in TypeScript on Node.
- Content is stored as structured rich-text documents — TipTap / ProseMirror
  JSON — in the database, and rendered to HTML at request time.
- Themes today are "declarative": a folder containing a JSON manifest, design
  tokens, JSON block-tree templates, and a stylesheet. The server renders them;
  no theme-supplied code executes. Interactivity comes only from a fixed
  registry of built-in components a template references by id. Three built-in
  themes exist.
- Plugins are a separate plane: prebuilt code modules with signed manifests and
  scoped permissions; they can add components/capabilities; they never run raw
  database migrations.

## The audiences the theming system must serve at once
1. Non-developers who just want to pick a good-looking theme and never see code.
2. Designers who want more layout control than a fixed set of blocks allows.
3. Developers who want to write real code and use JS libraries (e.g. Framer
   Motion, GSAP) for premium, animated sites.
4. An eventual marketplace where themes are authored by untrusted third parties
   and installed by ordinary users.
5. AI tools generating or editing themes on a user's behalf.

## Stated goals / tensions
- "Install a theme from anyone, safely" is a desired guarantee.
- Themes should be able to look premium — rich CSS, animation, motion.
- End-to-end TypeScript benefits are attractive.
- AI should be able to generate valid themes reliably.

## Questions — answer every one, concretely
1. What overall theming architecture lets this product serve all five audiences?
   Is one approach enough, or is a layered / multi-mode design warranted?
   Describe the setup you'd actually build.
2. Template engine: evaluate the realistic TypeScript-ecosystem options
   (include at least LiquidJS, Nunjucks, Handlebars, Eta, EJS, and component
   frameworks such as Astro / Next / JSX). Rank them FOR THIS PRODUCT and
   justify. Name the single best default, and say which audience each option
   suits.
3. Untrusted third-party themes: which of those options are safe to render on
   the server, and what sandboxing / validation posture is required to make the
   "install from anyone" guarantee real?
4. Premium & animated themes: how do you support heavy CSS and JS motion
   libraries (Framer Motion, GSAP) without breaking the safety model? Where
   should that capability live?
5. Content integration: how should the TipTap / ProseMirror JSON rich-text
   documents integrate with the template layer you recommend?
6. Type safety: how much does compile-time type-checking of the templates
   themselves matter for this product, and which options provide it?
7. Evolution: if the product ships the simplest safe option first, can it add
   more expressiveness later without a rewrite? Describe the migration path and
   its cost.
8. What would you explicitly warn this product AGAINST doing?

## Output format
- (a) One-paragraph recommended architecture.
- (b) A ranked engine table scoring each option on: TypeScript/type-safety,
  flexibility, safety for untrusted authors, AI-generatability, premium/animated
  sites, and maintenance.
- (c) The single best default engine + one-paragraph rationale.
- (d) Migration/evolution path.
- (e) Top 3 risks or warnings.

End your response with <<SWARM_END>> on its own line.
