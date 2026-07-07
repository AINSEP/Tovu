# ADR-020: Theme Capability Tiers — Declarative / Templated (LiquidJS) / Code, Chosen at Onboarding

- Status: ACCEPTED 2026-07-07 (extends ADR-010; relates to ADR-002, ADR-019, ADR-004, ADR-003, ADR-017, SPEC-004, SPEC-005)
- Date: 2026-07-07
- Author: Claude Opus 4.8 / Leon Aburime

## Context

ADR-010 established two theme classes at the ends of a spectrum: **declarative**
(default, no code, safe to install from anyone) and **code / trusted mode** (full
TSX, explicit trust acknowledgment, rare). ADR-019 then rejected a tempting third
option — a theme class that is *installed from a stranger yet runs arbitrary JS* —
because it would hand the least-vetted artifact the most dangerous capability.

Two real needs remain unmet by the two-end model:

1. **A middle is missing.** The declarative layer (JSON block tree + fixed component
   registry) covers common arrangement, but the first time a theme author wants a
   loop, a conditional, an include, or a filter the components don't provide, they
   fall straight off a cliff to "write a trusted TSX code theme." That gap is exactly
   what every mature CMS filled with a **template language** (Shopify/Liquid,
   Craft/Twig, Ghost/Handlebars). The owner surfaced this directly: *there is a reason
   other CMS products have a templating language.*

2. **Different users want different power, and should choose deliberately.** A
   non-developer just wants to pick a good-looking theme and never see a trade-off. A
   developer wants real logic — and, at the top end, JS/motion libraries and their own
   components. Today there is no on-ramp that routes each persona to the right
   capability level *and explains why the ceiling exists*. The owner asked for an
   onboarding flow that lets a user choose and understand the trade-offs.

The resolution is to stop treating ADR-010's two classes as a binary and instead name
the **spectrum** explicitly as three capability tiers, insert the missing middle with a
**sandboxed template engine that does not execute JS**, and make the tier a first-class,
validated property that drives both onboarding and install-time consent.

Engine selection for the middle tier was researched against the TypeScript-only
constraint (five independent advisories; three of five, and the two TS-specific ones,
converged on the same answer). See "Engine evaluation" below.

## Decision

Themes are classified into three **capability tiers**, declared in the manifest:

```jsonc
// theme.json
"tier": "declarative" | "templated" | "code"   // default: "declarative"
```

| Tier | Name | Author persona | Can express | Executes | Trust posture |
|---|---|---|---|---|---|
| 1 | **Declarative** (ADR-010 default) | Non-dev / AI | Tokens, JSON block tree, sanitized CSS (incl. CSS animation) | Nothing — pure data | **Install from anyone, unconditionally safe** |
| 2 | **Templated** (NEW — LiquidJS) | Designer / dev-lite | + loops, conditionals, includes, filters, layout inheritance | Sandboxed template logic, **no JS** (`eval`/`new Function` never used) | Safe **under the engine sandbox + isolation guardrails** below |
| 3 | **Code / trusted mode** (ADR-010 §2) | Developer | + real JS, framework components, motion libs, npm deps | Arbitrary in-process/build-time code | **Trusted** — explicit consent, "you are installing a dependency" |

### 1. Tier 2 engine: LiquidJS

**LiquidJS** is the official Tier-2 theme template language.

- It is purpose-built for *exactly this threat model* — third-party/marketplace theme
  authors editing templates that render on our server. Liquid is "safe, customer-facing,
  limited logic" by design.
- LiquidJS is **TypeScript-first** (strict mode, parses to an AST) and, critically,
  **does not use `eval` or `new Function`** — so Tier 2 is sandboxed *logic*, not JS
  execution. This is what keeps ADR-019's rejection of an "untrusted-runs-JS" theme
  intact: Liquid is not that class.
- Familiar to themers coming from Shopify / Jekyll / Eleventy — lowers the authoring
  barrier and is highly AI-generatable.

Rejected alternatives (see Engine evaluation): **Nunjucks** (its own docs warn it does
**not** sandbox and is unsafe for user-defined templates — disqualifying for an
untrusted theme layer); **Handlebars** (safe but logic-less; you rebuild a mini-Liquid
in helpers); **Eta / EJS** (embedded JS — code execution, wrong side of the boundary;
fine only for *internal, server-owned* templates like system emails); **TSX/React** as a
*theme* language (too much power for editable themes — that is Tier 3, not the default).

### 2. LiquidJS runs on the same component registry; TipTap content injects at one seam

Adopting Liquid does **not** discard the existing renderer's component registry — it sits
on top of it:

- **Layout & arrangement** → Liquid template (`layout.liquid`, `home.liquid`,
  `entry.liquid`, `blocks/*.liquid`).
- **Components / interactivity** → still resolved by id against the core/plugin
  **component registry** (ADR-010 rule, current `render.ts` `COMPONENTS` map). Liquid
  references them by name — `{% render_block block %}` / an island tag — which is the
  *same mechanism* as today's JSON `{ "type": "component", "id": … }` node. Today's
  declarative `component` nodes and tomorrow's Liquid island tags are two front-ends
  over one registry.
- **Content** → the TipTap/ProseMirror `bodyJson` is rendered to sanitized HTML by the
  existing `renderDocNode`, then injected into the theme via `{{ content }}` (marked
  safe so Liquid's autoescape does not double-escape our already-sanitized output — the
  standard Jekyll/Eleventy `{{ content }}` pattern). TipTap (content, admin) and Liquid
  (arrangement, render) have near-zero coupling; that is *why* they compose well.

Consequence: Tier 1 → Tier 2 is a **renderer extension, not a data-model rewrite**;
Tier-1 themes are the trivial subset (a Liquid template whose body is just the block
tree). This is the seam ADR-002 reserved.

### 3. Tier-2 security guardrails (mandatory; extends SPEC-004 REQ-06 / drift C6)

LiquidJS is software, not magic — a 2026 advisory (GHSA-gf2q-c269-pqgc) allowed RCE
below **10.26.0**. Tier 2 therefore ships with, at minimum:

- **Pin LiquidJS ≥ 10.26.0** + dependency scanning in CI.
- **Isolated rendering** — separate process/worker with CPU **timeout** and **memory**
  limits, and **restricted filesystem access** (no arbitrary reads).
- **Allowlisted tags & filters** only; **no arbitrary plugin-provided filters in public
  themes** (plugin filters are a Tier-3/trusted surface).
- **Template lint/validation before publish**, mirroring the CSS positive-allowlist
  posture already required for Tier 1 (REQ-06). The validation pipeline (drift finding
  **C6**) is hereby scoped to cover **both** CSS sanitization (Tier 1) and Liquid
  template validation + render isolation (Tier 2).

### 4. Onboarding chooses the tier; the manifest drives install-time consent

- **Setup asks intent.** "Building a site" → curated **Tier-1** themes only, zero
  trade-offs surfaced. "I'm a developer" → unlocks **Tier 2/3** behind a short
  trade-off explainer (why the ceiling exists) and explicit consent. The explainer
  reuses the `/how-themes-work` content already authored.
- **The catalog badges every theme with its tier** and a trust indicator. Installing a
  **Tier-3 (code)** theme shows a "this runs JavaScript on your site" consent step —
  the same consent pattern ADR-019 defined for theme-bundle plugin permissions.
- Default tier is `declarative`; a theme omitting `tier` is Tier 1.

### 5. Relationship to ADR-019 and "dev wants JS"

The developer's desire to "use JS" is **Tier 3 (ADR-010 trusted mode)** — not a new
untrusted-JS class. ADR-019's rejection stands unchanged: a theme installed from a
stranger never runs arbitrary JS. Tier 2 (Liquid) adds *logic without JS*; Tier 3 adds
*JS with trust*. Theme **bundles** (ADR-019) remain the preferred way for any tier to
obtain interactivity from the plugin plane.

### 6. Tier-3 consent honesty (decided constraint; clarification added 2026-07-07, same-day as acceptance)

Tier 3's protection model is **trust + provenance, not a sandbox** — the safeguard is
that the user vouches for the author, exactly like installing a plugin or npm package.
Two rules are decided now even though the execution-isolation mechanism is deferred:

- **Never present a code theme as "safe."** The install consent must say, in plain
  language: *"This is a code theme — it runs JavaScript on your site. Only install it
  from an author you trust."* Same consent surface as ADR-019 plugin permissions.
- **Bound the blast radius even under trust.** Tier-3 JS is intended to run as
  **client-side islands under a strict CSP** (same-origin, no arbitrary exfiltration),
  *not* as in-process server code. Client islands cannot directly reach the database or
  filesystem; worst case is bounded client-side mischief. Raw server-side theme
  execution is explicitly out of scope and would need its own ADR. This is the honest
  meaning of "unprotected": reduced, trust-based protection with a fenced blast radius —
  not a safe-from-strangers guarantee.

## Consequences

- **Fills the CMS gap without knifing the moat.** Themers get Shopify/Liquid-grade
  expressiveness; "install any theme from a stranger safely" survives at Tier 1 and,
  under the §3 guardrails, holds practically at Tier 2.
- **The pivot is incremental and reversible per tier.** The costly, hard-to-walk-back
  thing was never the code — it is the *security promise*, and that is now decided one
  tier at a time rather than in a single bet.
- **New surface to build:** the LiquidJS renderer over the component registry, the
  isolated render sandbox (§3), the `theme.json.tier` field + validator, tier-aware
  catalog/consent UI, and the onboarding intent flow. Sequencing: Tier 2 renderer +
  C6-extended validation before any Tier-2 theme ships; Tier 3 isolation is a later
  milestone.
- **Tier 3 is named but not fully scoped here.** Safe execution of developer JS
  (build-time compiled islands + runtime CSP, or server isolate/worker execution) is
  the biggest security lift and is deferred to its own ADR when a concrete need lands;
  ADR-010 §2 already authorizes the *existence* of code themes, so nothing is blocked.
- **Touches ADR-017.** The three-pane editor's Template pane becomes tier-aware: a
  Liquid editor at Tier 2, the trusted-code pane at Tier 3.
- **Does not relax any security rule.** ADR-003 (plugins never run DDL), ADR-004
  (signed artifacts/provenance), and the plugin permission model all apply unchanged.

## Engine evaluation (TypeScript-only)

| Engine | Verdict | Rationale |
|---|---|---|
| **LiquidJS** | ✅ Adopt (Tier 2) | Designed for untrusted third-party themes; TS-first; no `eval`/`new Function`; familiar; AI-friendly. |
| Nunjucks | ❌ Reject for public themes | Powerful (inheritance/macros) but docs explicitly state it does **not** sandbox and is unsafe for user-defined templates; maintenance mode; thin types. |
| Handlebars | 🟡 Not the theme language | Safest (logic-less) but too constrained for expressive themes → helper sprawl. Fine for emails/simple sections. |
| Eta / EJS | 🟡 Internal only | Embedded JS = arbitrary code; acceptable only for server-owned templates (system emails, generators), never public themes. |
| TSX / React | = Tier 3 | The developer/code tier, not the default editable theme language. |

## Follow-ups

- **New spec slice:** *Theme capability tiers + LiquidJS Tier-2 renderer + isolated
  render sandbox + tier-aware onboarding/consent* (owner: Leon Aburime; pairs with
  SPEC-004 and SPEC-005; extends the C6 validation work).
- On owner ACCEPT, record a forward-looking Open Question pointer in SPEC-004 (e.g.
  OQ-07) and re-hash; no v1 requirement changes until the slice is specced.
- Separate future ADR for **Tier-3 code-theme isolation** (execution sandbox / CSP /
  build pipeline) when scheduled.

## Amendment — 2026-07-07 (swarm-debate refinements)

A 4-voice Swarm Consensus `debate` (Primary = Opus 4.8; peers = Fable subagent, Codex
`gpt-5.5` xhigh, agy Gemini 3.1 Pro) independently evaluated the theming architecture
from a solution-neutral prompt. It **reproduced this ADR's tier model unprompted** —
layered tiers, LiquidJS default, code-as-trusted-plugins, no untrusted server JS — and
converged in two rounds (unanimous). Full record:
`reports/swarm-consensus/runs/2026-07-07T2330Z-templating-consensus-report.md`. It
surfaced one correction and two refinements to fold in:

1. **CORRECTION to §6 (important).** §6 said Tier-3 JS runs as "client-side islands under
   a strict CSP (**same-origin**)… worst case is bounded client-side mischief." That is
   **wrong for a CMS.** A theme renders in the **same origin as the logged-in
   admin/author session**, so same-origin theme JS can read session cookies/localStorage,
   call the authenticated admin API, keylog the editor, and exfiltrate via image beacons —
   none of which a "no DB/filesystem access" framing stops. The person we must protect is
   the site *owner* previewing/editing in-origin. **Revised rule:** a theme may ship its
   own client JS **only** from a **separate, cookie-less, credential-isolated origin**
   (sandboxed iframe or a distinct theme domain) **plus a strict CSP with
   `connect-src 'none'`** (no network egress). Absent that origin isolation, Tier-3 motion
   comes from **signed plugin components** referenced by id (e.g. `animate="fade-up"`),
   and themes ship **no code** — the debate's unanimous "B2" default. "Client-side" is
   *not* by itself a safety boundary here.

2. **Render IR is the canonical artifact (refines §2).** Make the internal render IR —
   `(registered component id, validated props, children)` + token CSS — the canonical
   on-disk contract. The declarative JSON block-editor and the Tier-2 Liquid templates are
   both **front-ends that serialize to that IR** (Liquid tags emit IR nodes; free markup →
   sanitized `raw-html` node). This kills format divergence, makes the visual editor
   losslessly round-trippable, and makes the Tier-1→Tier-2 migration provably additive. A
   JSON theme is then a degenerate case of the IR; keep JSON **data-only** — the moment it
   would need loops/conditionals/expressions, that is Liquid's job (never grow JSON into a
   control-flow DSL).

3. **Prefer Astro / raw-JSX over Next.js for the Tier-3 code path.** Peers were lukewarm
   on **Next specifically** — "framework capture" of a self-hosted, one-folder product
   (build steps, version churn, hydration weight); Fable preferred raw `renderToString`,
   Codex ranked Next last, agy neutral. Astro's build-time-islands model fits the
   export-to-binary story better. Not a hard exclusion, but Astro is the better default if
   a code tier is built.

Also reinforced (already implied by this ADR): **TipTap/ProseMirror content must render
server-side through one fixed, schema-validated node→component mapping** exposed as
`{{ content | render_rich_text }}`; themes never parse the AST (it is the largest
injection surface). And **runtime schema validation** (Zod/JSON-Schema for props +
manifests, codegen'd `.d.ts`/JSON-Schema of the render context) matters more than
compile-time template typing for this product.

The Tier-3 isolation ADR (see Follow-ups) should specify the separate-origin + CSP model
above as its baseline, not a same-origin island.
