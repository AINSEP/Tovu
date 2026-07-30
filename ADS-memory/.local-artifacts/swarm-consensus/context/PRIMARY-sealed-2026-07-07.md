# Primary (Opus 4.8) — sealed first-pass — templating debate 2026-07-07

FROZEN before peer dispatch. Not shown to peers in Round 1. Not shown to the user until all peers report.

(a) **Architecture:** A layered/multi-mode design, NOT one engine. Three capability tiers keyed off `theme.json.tier`, all rendering over one shared component registry + one content seam: Declarative (data-only JSON block tree + tokens + sanitized CSS — the default, safe from anyone), Templated (a sandboxed template engine adding loops/conditionals/includes — designers), Code (real JS/components — developers, trusted). The tier is what onboarding and install-consent read from. One approach is insufficient because the five audiences span the full trust/power spectrum; forcing one answer either caps developers or endangers non-devs.

(b) Ranked default engine for the *templated* (untrusted-but-more-than-data) tier: **LiquidJS**. Reasoning: built for the untrusted-third-party-theme threat model (Shopify), TS-first, no eval/new Function, familiar, AI-generatable. Nunjucks rejected for untrusted authoring (its docs say it does not sandbox). Handlebars safe but logic-less→helper sprawl. Eta/EJS = embedded JS, internal-only. Astro/Next/JSX = the *code* tier (0/10 stranger-safety by design), not the default theme language.

(c) Best default = **LiquidJS** for Tier 2; **declarative JSON** remains the true default for most sites; Astro/Next = Tier 3 for developers.

(d) Migration: additive. Liquid renders over the SAME component registry (`{% render_block %}` == today's `component` node); TipTap body injects at `{{ content }}` (mark pre-sanitized HTML safe vs autoescape). Tier 1 themes are the trivial subset. Tier 1→2 is a renderer extension, not a rewrite (the ADR-002 seam). Tier 3 (Astro/Next build-time islands + CSP) is a later, separately-scoped milestone.

(e) Risks: (1) letting Astro/JSX become the *default* → kills the install-from-anyone moat + forces build steps on non-devs; (2) under-building the CSS/Liquid validation+isolation pipeline → the "safe" claim becomes false (pin LiquidJS ≥10.26.0, isolate render, allowlist tags/filters, lint-before-publish); (3) marketing a code theme as "safe" — never do it; consent must say "runs JS, trust the author."

Prediction: peers likely split — the "who writes the templates?" axis. Expect at least one to over-index on Astro/JSX (type safety + premium) and undervalue the untrusted-marketplace constraint; expect at least one to confirm LiquidJS-for-untrusted. Convergence point should be: engine choice follows trust boundary, and this product has multiple boundaries → multiple modes.
