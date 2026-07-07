# Swarm Consensus Report — Tovu Theming / Templating Architecture

- Mode: `debate` · Rounds run: 2 of max 4 · min_confidence 0.90 → **met** · Date: 2026-07-07
- Question: what setup serves all audiences, which template engine is best, + the related questions.

## The Swarm

| Role | Participant | Model | Proven |
|---|---|---|---|
| Primary | host | Opus 4.8 (`claude-opus-4-8`) | frozen first-pass, sealed until synthesis |
| Peer 1 | Fable subagent | `fable` | platform subagent |
| Peer 2 | Codex | `gpt-5.5` (reasoning xhigh) | smoke-proven `2026-07-07T230158Z` |
| Peer 3 | agy | Gemini 3.1 Pro (High) | smoke-proven `2026-07-07T230158Z` |

## Dispatch Diagnostics

- CLIs: claude 2.1.201 · gemini 0.47.0 (sunset — unused) · codex 0.140.0 · agy 1.0.16.
- Gemini voice routed via **agy** (gemini CLI unreliable on this host).
- R1 packet: `context/CTX-templating-debate-2026-07-07.md` (solution-neutral, Primary excluded).
- R2 packet: `context/CTX-templating-debate-2026-07-07-r2.md` (two forks + rebuttal format).
- Peer outputs: `runs/round1/{codex,agy,fable}*`, `runs/round2/{codex,agy}*` + Fable resume transcript.

## Individual Responses (Round 1, independent)

- **Codex gpt-5.5:** layered model; LiquidJS default for marketplace; keep JSON blocks as AI/non-dev schema compiling to one render model; Astro/JSX behind the plugin/trusted boundary; motion = CSS + signed plugins; don't expose raw TipTap AST to themes.
- **agy Gemini 3.1:** "strict logic-less server core + unrestricted client islands"; LiquidJS default; JS motion shipped to the client; multi-engine manifest (`engine: astro`) + WASM/isolate for advanced themes later; warned against inventing a homegrown JSON layout DSL; TipTap via `render_rich_text` helper.
- **Fable:** three-tier capability-gated system on one render IR — Tier 1 declarative JSON (canonical), Tier 2 LiquidJS designer layer, Tier 3 code = signed plugins (not themes); LiquidJS #1, JSON blocks #2; never run untrusted JS server-side (named vm2/vm/isolated-vm); don't adopt Next/Astro as runtime; runtime schema validation > compile-time template typing.

## Debate Trace (Round 2 — movement)

- **Fork A (keep JSON tier vs Liquid subsumes it):** → **A1 unanimous.** **agy moved** from its R1 "don't invent a homegrown JSON DSL" to explicit A1 ("keep JSON as typed data, à la Shopify OS 2.0"). Shared caveat from all three: JSON stays **data-only**; the instant it needs loops/conditionals/expressions, that is Liquid's job — never grow JSON into a control-flow DSL.
  - *Fable's falsifier (reconciles the fork):* if the JSON block-tree is just Liquid's **AST/IR serialized**, A1 and A2 collapse — make the **render IR the canonical on-disk artifact**, with the visual editor emitting IR and Liquid as sugar over it.
- **Fork B (theme-shipped client JS vs plugin-only):** → **B2 unanimous.** All three would allow B1 **only** behind hard isolation.
  - *Fable's decisive correction:* "the browser contains the blast radius" is **false for a CMS** — a theme renders in the **same origin** as the logged-in author/admin session, so theme JS can read cookies, hit the authenticated admin API, keylog the editor, and exfiltrate via beacons. B1 is safe **only** from a **separate, cookie-less, credential-isolated origin** (sandboxed iframe / distinct theme domain) **+ strict CSP with `connect-src 'none'`**. Absent that, B2.
- **Overall recommendation:** unchanged for all three across both rounds.

## Synthesis

Unanimous, high-confidence:
1. **Layered / multi-tier theming on one shared render contract** — not a single engine.
2. **LiquidJS is the single best default engine** for untrusted/marketplace themes (logic-less, interpreted-not-compiled, Shopify lineage, best AI target after raw JSON, TS-first, no eval).
3. **Never execute untrusted JS server-side** — reject EJS/Eta/Nunjucks/Astro/JSX for anything user-installable; self-sandboxing a JS engine (vm2/vm/isolated-vm) is a trap that breaks the "one portable folder" model.
4. **Keep the declarative JSON block tier (A1)** as the machine-verifiable, round-trippable AI/non-dev surface — data only, compiling to the same render IR as Liquid. Strong refinement: **make the render IR the canonical artifact**; JSON-editor and Liquid are both front-ends that serialize to it.
5. **Themes never ship code (B2)** — motion (GSAP/Framer) comes from signed, permission-scoped **plugin components** referenced by id (`animate="fade-up"`). Client-shipped theme JS is allowed **only** behind a separate credential-isolated origin + strict egress-blocking CSP.
6. **TipTap/ProseMirror renders server-side via one fixed, schema-validated node→component mapping** exposed as `{{ content | render_rich_text }}`; themes never parse the AST (all three raised this unprompted — it is the largest injection surface).
7. **Type safety:** compile-time template typing matters less than **runtime schema validation** (Zod/JSON-Schema for props/manifests + codegen'd `.d.ts`/JSON Schema of the render context for editor + AI tooling).
8. **Warned against:** untrusted server JS; blurring the theme/plugin planes ("just a little theme JS"); adopting **Next.js/Astro as the theme runtime** (framework capture of a self-hosted, one-folder product — Fable prefers raw `renderToString` over Next); inventing a Turing-complete proprietary DSL (forfeits AI-corpus familiarity).

## Decision Ledger

| # | Decision | Confidence |
|---|---|---|
| 1 | Multi-tier architecture, one render contract | Unanimous |
| 2 | LiquidJS = default engine (untrusted tier) | Unanimous |
| 3 | No untrusted server-side JS, ever | Unanimous |
| 4 | Keep JSON tier (A1), data-only → same IR | Unanimous (agy moved) |
| 5 | Themes never ship code (B2); motion via signed plugin components | Unanimous |
| 6 | Client theme-JS only behind separate cookieless origin + strict CSP | Unanimous (as the sole B1 exception) |
| 7 | TipTap via fixed server-side node→component mapping | Unanimous |
| 8 | Runtime schema validation > compile-time template typing | Unanimous |
| 9 | Prefer Astro/raw-JSX over Next.js if a code tier is built | Majority (Fable strong, agy neutral, Codex ranks Next last) |

## Final Recommendation

Ship the declarative JSON tier now (it exists); add **LiquidJS** as the Tier-2 designer engine over the **same render IR/component registry**; keep all executable code — including client motion — in the **signed plugin plane** (Tier 3), never in themes. Render TipTap through one fixed server-side mapping. Treat the render **IR as the canonical artifact** so JSON and Liquid never diverge. If/when a true "code theme" is offered, gate its client JS behind a **separate cookie-less origin + strict CSP**, not merely "it's client-side."
