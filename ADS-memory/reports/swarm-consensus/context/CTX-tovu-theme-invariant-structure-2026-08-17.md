# Swarm Consensus Context Packet

**Date:** 2026-08-17
**Slug:** tovu-theme-invariant-structure
**Project Type:** brownfield
**Question:** What is the ONE invariant top-level folder + `theme.json` manifest shape that should apply across every one of Tovu's theme rendering tiers — static, templated, declarative, and a planned (not yet built) component-framework tier covering React, Angular, Vue, Astro, Svelte, Solid, Qwik, and Web Components/Lit — while also making room for (a) a new, forward-looking `ai/` capability surface for the PUBLISHED site (agent/MCP-facing element handles, imperative-vs-declarative tool-call metadata, scoring hooks) and (b) a separate dev-time surface for AI CODING agents that convert/reconcile/maintain a theme's own source (agent instructions + a tests/fixtures folder)?

**Note on scope of "component-framework tier":** HTMX and Alpine.js are explicitly NOT part of this tier — they sprinkle behavior onto plain HTML with no component source and no build step, so they belong inside the existing `static`/`templated` tiers as a script include, not a new tier. Only frameworks that compile component source and require a real build step belong in the component-framework tier.
**Intended Consumers:** Primary model (Claude Opus 5, host) + peer CLIs (Gemini 3.7 Flash, Gemini 3.1 Pro, Codex GPT-5.6-sol, and an added Claude Fable subagent)

## Goal
Tovu is a website builder. Themes render via one of several tiers, and the owner wants to publish a public article series on "how to structure a Tovu theme." Before writing it, they need one folder/manifest shape that is genuinely invariant across all tiers — not a shape reverse-engineered from one tier and awkwardly bent to fit the others.

**This is not a sketch exercise.** The output needs to be detailed enough to actually DRIVE theme building — a human or an AI agent should be able to follow it step by step and produce a compliant theme in any of the 4 tiers, with no material gaps left to guess at. See "Documentation & Deliverable Requirements" below for the exact bar.

## Scope

**In scope for this round:**
- The invariant top-level folder shape (what folders exist, what they're named, what lives in each, per tier)
- The `theme.json` manifest shape (what fields exist, which are tier-specific vs universal)
- Where marketplace preview assets (screenshots, and later video/audio) live
- Where CSS and JS/script source lives, and how that generalizes to a future component-framework tier where the "script" essentially IS the render layer
- Whether build output (`dist/` or similar) ever belongs inside a theme's own author folder
- A new `ai/` folder concept for agent/MCP-facing theme capabilities (see "AI Capability Surface" below) — this is a NEW requirement from the owner, not yet built anywhere, and should be designed now as part of the invariant shape, not bolted on later

**Explicitly out of scope for this round (owner's call, do not design in depth — a one-paragraph forward-compatibility note is enough, not a full plan):**
- The concrete migration plan for the ~10 already-installed themes to whatever new shape is chosen. The owner confirmed migration WILL happen, just not now — so the chosen shape should not make migration structurally impossible, but do not spend the round designing the migration itself.
- The concrete sandbox/execution design for building untrusted third-party theme code in the marketplace. The owner confirmed this WILL be needed once the component-framework tier exists — so the chosen shape (specifically: where build output lives, and whether `dist/` belongs in an author folder) should account for "this folder may eventually be built from untrusted third-party source," but do not design the sandbox itself this round.

## Architecture Summary

Tovu's theme system has 3 tiers built today, in `src/themes/<tier>/<theme-id>/`, plus a 4th tier that is planned but has no folder yet:

- **static** — plain HTML/CSS/JS, no build step, every byte hand-editable.
- **templated** — Liquid templates.
- **declarative** — pure JSON block trees over a fixed component vocabulary; explicitly forbids raw HTML/JS.
- **component-framework** (React, Angular, Vue, Astro, Svelte, Solid, Qwik, Web Components/Lit) — NOT YET BUILT. Would need a compile/bundle step, unlike the other three, which are all explicitly build-free. HTMX/Alpine-style "sprinkle" libraries do NOT belong in this tier (see Question note above).

Today the three built tiers already disagree with each other on naming and shape — this is the actual problem the invariant structure needs to solve, not a hypothetical:

- `static/basic/theme.json`:
```json
{
  "id": "basic", "name": "Basic", "version": "0.1.0", "tier": "static",
  "description": "...", "modes": ["dark","light"], "defaultMode": "dark",
  "fonts": ["Geist:wght@400;500"],
  "pages": ["index","about","pricing"],
  "templates": ["blog-post.html","blog-sidebar-template.html","page-shell.html"],
  "slots": {
    "nav": { "source": "nav.html", "honorsCurrentPage": true },
    "footer": { "source": "footer.html", "variants": { "minimal": "footer-minimal.html" } }
  }
}
```
- `templated/fashion-modern/theme.json`: `{ id, name, version, tier: "templated", engine: 1, author, description, fonts }` — no `slots`.
- `declarative/basic-declarative/theme.json`: `{ id, name, version, tier: "declarative", description, fonts }` — no `slots`, no JS, no HTML allowed at all.
- `tokens.json` (+ `tokens.light.json` for a light-mode variant) exists in all 3 built tiers.
- `static/basic/` contains: `css/`, `js/`, `pages/` (raw html), `screenshots/`, `preview/`
- `templated/fashion-modern/` contains: `assets/`, `screenshots/`, `templates/` (liquid), `styles.css` (single file)
- `declarative/basic-declarative/` contains: `templates/` (json block trees), `styles.css`
- So today: `css/` folder vs `styles.css` single file are both "correct" depending on tier; media is called `assets/` in one tier and effectively untitled/absent in another; only `static` declares `slots` at all.

## Owner Decisions Already Locked (context, not up for debate)

1. Unify the media folder name to `assets/` everywhere. Assets means ANY media — images, video, audio, fonts, downloadable files — not just images.
2. Marketplace preview images (today scattered as `screenshots/`) move inside `assets/` — e.g. `assets/previews/` — because the real use case is showing a theme's look BEFORE someone downloads/installs it, in a marketplace-style browsing UI. Image previews are needed day one; video/audio preview PLAYBACK is explicitly deferred (encoding/moderation/bandwidth policy not needed yet), though the `assets/video/` and `assets/audio/` folders can still exist for themes that have that media.
3. The `theme.json` schema should be designed as ONE invariant, flexible shape now — the owner does not want an incremental "add a version field to patch over tier disagreement" approach. Panel should still feel free to recommend a schema-version field if there's a real forward-compatibility argument for it, but the design goal is "gets it right across all 4 tiers from day one," not "defer correctness to a future migration."

## AI Capability Surface (new this round — needs real design, not just acknowledgment)

The owner wants an `ai/` folder (name negotiable) inside each theme for **future AI-agent-facing capabilities and scoring metrics** — e.g. marking which rendered elements an AI agent/shopping-agent/browsing-agent may act on (WebMCP-style), describing available tool calls, distinguishing imperative vs declarative capability exposure, and hooks for scoring/evaluation metadata.

**What already exists in the codebase that's directly relevant precedent** (verified 2026-08-17, so the panel reasons from real code, not a blank slate):

1. **Admin-side agent operability (built, real, 28 call sites):** `apps/admin` has a helper `agentHandle()` (from `@jini-ai/agentic`) that emits a `data-agent-element="<handle>"` attribute on admin UI controls, letting an AI assistant operate the admin interface. Two layers: navigation (`page.navigate` allowlist built from panel metadata) and operation (`page.find_elements` / handle resolution only ever touches `[data-agent-element="<validated-handle>"]` — an agent can only touch what a component explicitly published). **This is an ADMIN-interface concern, not a published-site/theme concern** — it has never been applied to theme-rendered pages.
2. **Site-side capability registry (built, real):** `src/assistant/site/capability-registry.ts` is a default-deny registry of capabilities the site's own AI assistant may invoke (today: 3 read-only search/lookup + 3 page-action capabilities like `navigate_to_entry`). It is explicitly architected so that **a future WebMCP adapter, or an A2A agent surface, would be "a thin translator over `invoke()`"** requiring no change to the capability list itself — but that adapter does not exist yet. **WebMCP itself is NOT implemented anywhere in this codebase.**
3. **Nothing today lets a theme's own rendered markup declare which of ITS elements are agent-operable**, or expose MCP tool-call metadata, or carry scoring/eval hooks. This would be new ground, in the theme layer specifically (not the admin layer, not the site-assistant layer) — the panel is being asked to design it, informed by the two existing (different-layer) precedents above, not to assume it already exists.

## Additional Ground Truth (found while widening this packet, 2026-08-17)

- **A real slot/partial mechanism already exists, beyond bare `theme.json` `slots`.** `static/basic`'s pages reference nav/footer via a marker attribute, `data-embed-config='{"type":"partial","id":"nav"}'`, parsed by a shared parser (`substituteMarkers` at `src/core/embeds/marker`) — not a template-include directive, no executable code ships inside the theme. This attribute was itself consolidated from two older attributes (`data-tovu-slot`/`data-nav-current`) into one JSON-valued marker in a prior commit. This is the real, working precedent for how "slots" should generalize — richer than the `theme.json` `slots` field alone suggests.
- **The `static` tier is not fully wired into the real host renderer yet.** `static/basic/build-preview.mjs` says outright it is "a stand-in for Tovu's real `static`-tier theme loader (the `static` tier is not wired into `src/features/theme/theme.ts` yet)." Treat this as a maturity caveat, not a structural requirement — the invariant shape should not assume today's per-theme preview-generation script is a pattern to keep.
- **Themes vendor third-party JS rather than loading from a CDN, on purpose.** `static/basic/js/vendor/motion.js` (+ `js/vendor/LICENSE.md`) ships a real third-party animation library as a static file inside the theme, specifically so the theme stays fully self-hostable/offline-safe (a CDN `<script src>` would break that guarantee). This is a deliberate trust-model decision worth preserving in whatever `scripts/`/`src/` convention the panel proposes — consider whether vendored third-party code needs a distinguished location from first-party theme scripts.
- **No structured licensing/attribution/category fields exist anywhere.** `static/basic` has a long free-text `NOTICE.md` (provenance, what was changed, licensing-relevant notes) that nothing machine-reads. Only `templated/fashion-modern`'s `theme.json` has an `author` field, and it doubles as an ad-hoc redistribution notice in prose ("Converted for Tovu from 'Wearix' — a free Framer... export, free to redistribute"). No theme has a `category`/`tags` field for marketplace discovery (e.g. "e-commerce", "blog", "portfolio") even though at least one theme (`fashion-modern`) is explicitly built for one category.
- **Full current theme roster** (10 total, all pre-redesign — see File Access below): `static/basic`, `static/fuel`, `static/gracious-timing`, `static/portfolite`, `static/tailark-dusk`, `static/tailark-quartz-dark`, `static/tailark-quartz-libre`, `templated/fashion-modern`, `templated/storefront`, `declarative/basic-declarative`.

## Dev-Time Agent Support (new requirement from the owner, distinct from the runtime `ai/` capability surface above)

The `ai/` capability surface above is about AI agents visiting the PUBLISHED site (WebMCP, tool calls, element handles). This is a **separate** concern: AI CODING agents (e.g. Claude Code) doing conversion, reconciliation, or maintenance work ON a theme's own source — e.g. "convert this static theme to the React tier," "reconcile this theme's CSS with a new token scheme," "check this theme still renders correctly after an edit."

The owner wants, at minimum:
- **A `tests/` (or similar) folder** — fixtures/golden output a human or a coding agent can use to verify a theme still renders correctly after a change. No such convention exists in any theme today (verification today is ad hoc — see the `NOTICE.md` excerpt above describing manual `getBoundingClientRect()` checks and screenshot-timing workarounds during basic's own development).
- **Agent instructions** — theme-scoped guidance for a coding agent doing conversion/reconciliation work, analogous to a repo-root `AGENTS.md`/`CLAUDE.md` but scoped to just that theme (e.g. "this theme's tokens map to X," "do not hand-edit `pages/*.html`'s nav markup, it's generated," conversion notes/gotchas).

Panel should propose where these live (inside `ai/`, as siblings to it, or elsewhere) and what minimal shape they need — this is new ground, keep the proposal concrete but do not over-build a big spec for a folder that has zero adoption yet.

## Documentation & Deliverable Requirements (new, from the owner)

This is going to become real documentation, not just a decision record — the owner will drive actual theme-building (their own and third-party authors') off of whatever this converges on. The bar:

- **Highly detailed, to the level of actually building a theme from it.** Not "there's a `css/` folder" — which file(s) exactly, required vs optional, exact `theme.json` field names/types/defaults, what a minimal valid theme looks like per tier, what an invalid one looks like and why.
- **Both human-readable AND agent-readable.** Two different audiences will consume this: a person authoring a theme by hand, and an AI coding agent generating or converting one. Propose whether these should be ONE document serving both, or TWO separate documents (e.g. a human-facing prose guide + a machine-oriented spec/schema) — and if two, what belongs in each that doesn't belong in the other.
- This requirement applies to the FINAL synthesis (Round 2+), not this round's proposals in isolation — but shape your Round 1 proposal with this bar in mind, since a folder name choice that can't be documented precisely (e.g. an ambiguous "put render stuff here" folder) will be a real problem later, not just a style nitpick.

## File Access

Peers with repo file-read tools (Codex, the added Claude Fable subagent) MAY read the live repository at `/Users/la/Programming/Tovu` directly for more context, bounded to `src/themes/**` and `src/assistant/site/capability-registry.ts` — prefer this bounded set over open-ended repo exploration. Gemini/agy peers are given a staged, bounded copy of the same file set (binary assets like screenshots excluded) since `agy` cannot read outside its own working directory.

**Important framing for whichever peer reads the repo: `src/themes/*` as it exists today is OLD and is the exact thing being redesigned.** It is ground truth for what exists and what already disagrees across tiers (see Architecture Summary and Additional Ground Truth above) — it is explicitly NOT a target to preserve or a shape to formalize as-is. Do not anchor a proposal on "match what static/basic already does" without an actual justification; the whole point of this debate is that the tiers currently disagree with each other and a new, genuinely invariant shape is wanted.

## Relevant Files And Artifacts

| Path | Why it matters |
|---|---|
| `src/themes/static/basic/theme.json` | Most complete existing manifest — has `slots`, `modes`, `pages`, `templates` |
| `src/themes/templated/fashion-modern/theme.json` | Simpler manifest, no `slots`; folder has `assets/` + single `styles.css` |
| `src/themes/declarative/basic-declarative/theme.json` | Simplest manifest; folder has `templates/` (JSON block trees) + single `styles.css`; explicitly forbids HTML/JS |
| `src/assistant/site/capability-registry.ts` | Real precedent for a default-deny, adapter-agnostic AI capability surface (site-assistant layer, not theme layer) |
| `apps/admin` `agentHandle()` / `data-agent-element` (28 call sites) | Real precedent for per-element agent-operable tagging (admin layer, not theme layer) |

## Constraints

- No build step at all for 3 of the 4 tiers (static/templated/declarative) — the invariant shape must not force a build step onto tiers that are explicitly build-free.
- The component-framework tier does not exist yet — the shape must be designed FORWARD for it, not reverse-engineered from code that doesn't exist.
- Migration of ~10 existing installed themes will happen eventually (out of scope this round, see Scope) — avoid a shape that would make that migration structurally impossible.
- The marketplace will eventually build untrusted third-party theme source for the component-framework tier (out of scope this round, see Scope) — avoid a shape that assumes all theme code is first-party/trusted.

## Known Unknowns

- Whether `dist/`/build output should ever live inside a theme's own author folder, or must always be external/platform-managed.
- Whether `css/` (folder, current static-tier convention) or a single `styles.css`/`theme.css` (current templated/declarative-tier convention) should be the one invariant CSS entry point.
- What the render-layer source folder should be called (`templates/` today in 2 of 3 tiers, vs. an alternative like `src/`) given a future tier's "source" will be compiled component code, not static markup.
- What the `ai/` folder's internal shape should look like, and how (or whether) it should relate to the existing admin `agentHandle()` naming convention and the site capability-registry's future-WebMCP-adapter path.

## Source-of-Truth Inputs

| Source | Notes |
|---|---|
| Live repo read, 2026-08-17 | Folder listings and `theme.json` contents for all 3 built tiers, read directly, not from memory/notes |
| gpt-5.6-terra (Codex, xhigh) solo consultation, 2026-08-17 | Independent first opinion already gathered before this debate — presented below as ONE candidate proposal for the panel to critique, not as the Coordinator's position |
| `reference-admin-agent-element-tagging` (internal memory, verified 2026-08-15) | Source for the `agentHandle()`/`data-agent-element` admin precedent above |
| `src/assistant/site/capability-registry.ts` header comment | Source for the site capability-registry precedent above, read directly 2026-08-17 |

## Shared Prompt Payload

You are one independent participant in a structured debate about a real repository decision. Do not assume any other participant's answer, and do not assume the Coordinator (the host AI running this debate) has already picked an answer — it has not disclosed one, and won't until a later round.

**The question:** propose the single invariant top-level folder + `theme.json` manifest shape that should apply across ALL FOUR of Tovu's theme tiers (static, templated, declarative, and a not-yet-built component-framework/React-Angular tier) — even though the tiers necessarily differ in what format their "render source" takes (`.html` / `.liquid` / `.json` / `.tsx`).

Ground yourself in the real, current repo facts and the owner's locked decisions given above before proposing anything — do not invent theme.json fields or folder names that contradict what's documented above without saying explicitly that you're overriding it and why.

**One candidate proposal already surfaced (from a separate, independent Codex/gpt-5.6-terra consultation) — critique it, defend it, or refute it on its merits, but you are NOT required to agree with it and should propose your own answer if you think there's a stronger one:**

```
theme-id/
├── theme.json
├── tokens.json
├── tokens.light.json
├── assets/
│   ├── previews/   (card.webp required marketplace thumbnail + optional gallery)
│   ├── images/
│   ├── video/
│   └── audio/
├── css/
│   └── theme.css                 # single required stylesheet entry point
├── src/                          # ALL render-layer source, every tier
├── scripts/                      # optional supplementary browser scripts; declarative has none
└── locales/                      # optional theme-owned UI strings
```
This candidate also proposed: NO `dist/` ever lives inside a theme's own author folder, even for the component-framework tier; and an expanded `theme.json` with `renderer{sourceRoot,format,entry}`, `entrypoints{pages,styles,scripts,slots}`, `tokens{default,modes}`, `assets{preview}`, `locales`, `build{mode}` sections.

**Specifically address, with your own reasoning (not just agree/disagree):**

1. What should the render-layer source folder be called, and why — `templates/` (today's convention in 2 of 3 tiers), `src/` (the candidate's proposal), or something else?
2. `css/theme.css` vs a `css/` folder vs a root `styles.css` — pick one as the invariant, with reasoning.
3. Should there be a `scripts/`/`js/` folder distinct from the render-source folder? How should this concept generalize to a future component-framework tier where the component source arguably IS the interactive layer?
4. Does build output (`dist/` or equivalent) ever belong inside a theme's own author folder for the future component-framework tier — keeping in mind the marketplace will eventually need to build UNTRUSTED third-party theme source, not just first-party themes?
5. Design the `ai/` folder concept described above — what should live in it, and how (if at all) should it relate to the existing admin-layer `agentHandle()`/`data-agent-element` convention and the site-layer capability-registry's future-WebMCP-adapter path? This is genuinely new ground; a thin "just add a JSON file" answer is acceptable if you can defend why more structure isn't needed yet.
6. Repo ground truth shows a real, already-working slot/partial mechanism (`data-embed-config='{"type":"partial",...}'`, parsed by a shared marker parser) beyond bare `theme.json` `slots`. How should this generalize across all 4 tiers, including the future component-framework tier where "a partial" might be a component rather than an HTML fragment?
7. Should the invariant shape include structured `license`/`attribution`/`category` fields in `theme.json`, given at least one theme already encodes this ad hoc as prose (a `NOTICE.md` file, and an `author` field doubling as a redistribution notice)?
8. Should first-party theme scripts and vendored third-party scripts (e.g. a vendored animation library, kept local instead of CDN-loaded for self-hosting reasons) have distinguished locations, or is one `scripts/`/`src/` folder enough?
9. Design the dev-time agent support described above (a `tests/`/fixtures folder + theme-scoped agent instructions for AI coding agents doing conversion/reconciliation work) — where does it live relative to the runtime `ai/` folder, and what's the minimal useful shape?
10. Should the eventual human-facing guide and agent-facing spec be one document or two? What does each audience need that the other doesn't?
11. Is there a strong option, folder, or manifest field not mentioned above (by the owner, the candidate proposal, or this prompt) that you believe is missing? If yes, describe it and why it's needed.

Give a concrete folder tree and manifest sketch, not just prose — this is going to seed a real repository decision and a public article series, and the eventual output must be detailed enough to actually drive theme building (see Documentation & Deliverable Requirements above), so keep it buildable and precise, not high-level.
