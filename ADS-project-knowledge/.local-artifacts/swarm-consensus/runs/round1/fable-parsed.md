# Fable — Round 1 (independent)

Recommends a three-tier, capability-gated theming system on one shared rendering contract:
- Tier 1 (default, marketplace-safe): keep the declarative JSON theme (manifest, tokens, block-tree, stylesheet) as canonical — serves non-devs, AI, "install from anyone."
- Tier 2 (designer): add LiquidJS templates as an optional layer inside the same theme folder, server-side data-only sandbox, dynamism via registered component ids + typed render context.
- Tier 3 (developer): "code themes are NOT themes — they are plugins": signed, permission-scoped TS modules registering components (incl. Framer Motion/GSAP) into the registry that Tier 1/2 reference by id. Safety boundary = distribution boundary (untrusted marketplace = data-only; trusted/signed = code via plugin plane). Every tier bottoms out in the same renderer + same ProseMirror→HTML pipeline.

Engine ranking (1–5): LiquidJS #1 (safety 5, AI 5), Declarative JSON block-trees #2 (safety 5, AI 5, TS 4 via Zod), Astro #3 (safety 1, dev-only), JSX/TSX #4 (Next = framework capture; raw renderToString saner), Handlebars #5 (proto-pollution CVE history), Nunjucks #6 (sandbox not a security boundary), Eta #7 (templates are JS), EJS #8 (do not use).

Best default: LiquidJS, layered on top of (not replacing) the JSON format — only mainstream TS engine whose design premise is "author is untrusted" (Shopify lineage), best AI target after raw JSON, interpreted not codegen, fuel/depth-limited.

Migration: every tier targets one render IR — (component id, validated props, children) + token CSS. v1 JSON blocks (define IR + Zod prop schemas + versioned manifest = load-bearing); v1.x Liquid tier resolved BEFORE the IR (Liquid tags emit IR nodes; free markup → sanitized raw-html node; JSON theme = degenerate Liquid); v2 open plugin plane to component registration (client-bundle budget). No renderer rewrite ever.

Top warnings: (1) never run untrusted JS server-side even "sandboxed" (vm2 dead, node vm not a boundary, isolated-vm = ops project); sanitize theme CSS too (external url()/@import exfiltration). (2) Don't collapse theme plane into plugin plane; motion = signed component plugins, themes only reference; ProseMirror JSON via fixed schema-validated node→component mapping. (3) Don't adopt Next/Astro as theme runtime (framework capture vs self-hosted portability) and don't invent a proprietary DSL (forfeits AI corpus familiarity); runtime schema validation (Zod + codegen'd .d.ts/JSON Schema) beats compile-time template typing.
