PACKET-ID: templating-debate-2026-07-07-r2

This is Round 2 of a multi-reviewer architecture debate. In Round 1, independent
reviewers strongly agreed on the following — treat it as SETTLED, do not relitigate:
- A layered / multi-tier theming architecture, not one universal engine.
- LiquidJS is the default engine for untrusted/marketplace themes (logic-less,
  interpreted-not-compiled, Shopify lineage, best AI target after raw JSON).
- Never execute untrusted JavaScript on the server (reject EJS/Eta/Nunjucks/Astro/
  JSX for anything user-installable; sandboxing JS engines yourself is a trap).
- TipTap / ProseMirror content is rendered server-side by ONE fixed, schema-validated
  node→component mapping and exposed to themes via a single helper
  (`{{ content | render_rich_text }}`); themes never parse the AST.
- Astro / Next / JSX belong only in a trusted, signed developer tier.

Two disagreements remain. For EACH fork: commit to a position, give the strongest
argument FOR your side AND the strongest argument AGAINST it, and state what evidence
or change of assumption would move you. Be concrete; do not hedge.

### Fork A — Does the declarative JSON block tier stay, or does Liquid subsume it?
- Position A1: KEEP the JSON block-tree as a first-class, non-Turing-complete DATA
  format — the AI/non-developer authoring surface — compiling to the same internal
  render IR as Liquid. Two authoring formats, one renderer.
- Position A2: DO NOT grow the homegrown JSON format; make Liquid the single authoring
  language, because a proprietary JSON layout DSL invites AI hallucination and a
  maintenance/security burden you alone carry.

### Fork B — How is JavaScript motion (GSAP / Framer Motion) delivered for premium themes?
- Position B1: A marketplace theme MAY ship its own CLIENT-side JS bundle (executed only
  in the browser sandbox, never on the server). The theme is still "data + client
  assets"; the browser contains the blast radius.
- Position B2: Themes NEVER ship code, even client-side. All JS — including client motion
  — must come from a signed, permission-scoped plugin/component the theme only references
  by id. Client-shipped theme JS is still an XSS / data-exfiltration / defacement /
  supply-chain surface.

### Answer format
- Fork A: [A1 | A2 | other] — for (2-4 sentences) — against (2-4 sentences) — what would move you.
- Fork B: [B1 | B2 | other] — for (2-4 sentences) — against (2-4 sentences) — what would move you.
- One line: has your overall recommendation changed since Round 1, and why/why not?

End your response with <<SWARM_END>> on its own line.
