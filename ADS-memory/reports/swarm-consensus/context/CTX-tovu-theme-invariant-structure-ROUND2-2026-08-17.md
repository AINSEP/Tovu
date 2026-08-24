# Round 2 — Informed Rebuttal Packet

Per the Debate Round-Disclosure Guard: this round discloses every participant's full Round 1 reasoning (not summarized) plus the Coordinator's own findings gathered since. Round 1 was blind; this round is fully informed. Read everyone's position before answering.

## New, load-bearing ground truth none of you had in Round 1

The Round 1 packet's file access was under-scoped — it granted `src/themes/**` + `capability-registry.ts` only, and missed a real, rigorous, already-existing authoring guide at `development/docs/themes/theme-authoring-guide.md`. Every Round 1 answer (including the Coordinator's own frozen one) was produced without it. Its relevant contents, since not everyone's transport can freely re-read a new path mid-debate:

1. **The real `ThemeTier` type has 5 values today, not the 3-built-plus-1-planned framing Round 1 used:** `"declarative" | "templated" | "handlebars" | "static" | "code"`. `handlebars` is **fully implemented and tested** (render pipeline, security allowlist, worker isolation) but has zero authored content — not a stub, a real unused capability. `code` is a documented-but-unbuilt placeholder for future **"trusted signed-plugin JS"** — this is explicitly NOT the same thing as a modern component-framework (React/Vue/etc.) tier; conflating the two would be a mistake. The still-unbuilt component-framework tier this whole debate has been designing for is a genuinely NEW 6th concept, not a renamed `code`.
2. **`theme.json`'s `slots`/`modes`/`defaultMode` fields are actually wired and read at render time** (not merely declared) — richer than Round 1's framing suggested. `pages` remains the one field written by every theme and read by nothing (this part Round 1 already had right).
3. **The real embed/marker system spans SIX types under one mechanism** — `partial`, `menu`, `widget`, `form`, `media`, `post` — of which "partial" (the whole subject of debate question #6) is only one. The marker syntax is confirmed, by reading the actual parser regex (`src/core/embeds/marker.ts:108`) AND live theme files directly (not just the guide's prose, which has one wrong claim on this exact point — see caveat below): **ONE HTML attribute**, `data-embed-config`, holding a JSON object with `type`/`id`/other params as keys — e.g. `data-embed-config='{"type":"partial","id":"nav","current":"signin"}'`. This matches what the Round 1 packet already told you; no correction needed to that part.
4. **A `regions` field for widget placement already exists** in `theme.json`, fully implemented and tested, with zero live themes using it. Whatever schema this debate converges on should not silently drop it.
5. **A `theme_write_file` agent tool already exists** and does single-theme hot-reload (re-validates and replaces a loaded theme's content after every write) without a full server restart — relevant to the dev-time agent-support design (question 9): a coding agent converting/reconciling a theme does not need to restart anything to see its own edits reflected.
6. **Caveat on the guide itself:** it is unusually rigorous (every claim cited to a `path:line`), but its §6 prose claim of a "unified 3-attribute vocabulary" (`data-embed-type`/`data-embed-id`/`data-embed-config` as three separate attributes) is WRONG — contradicted by the actual parser and by live files, both confirmed directly. Treat point 3 above (one attribute, JSON blob inside) as ground truth instead. This is stated so nobody re-derives the guide's own error independently.
7. **The guide's own documentation discipline** — two-table field split ("read vs. dead"), verified-not-inferred citations, an explicit gotchas section, a minimal worked example — is proof this documentation pattern already works well in this exact repo. Question 10's answer (human guide + machine spec) should be judged against whether it could plausibly follow this same discipline, not invented from a blank slate.

## Where you already agree (verify this holds, don't re-litigate for its own sake)

- `css/theme.css` as the single required CSS entry point — unanimous across all 5 participants (4 peers + Coordinator).
- `scripts/` (optional, forbidden in declarative) with a `scripts/vendor/<lib>/` split for third-party code, each with its own license reference — unanimous.
- `dist/`/build output NEVER lives inside a theme's own author folder, for any tier, no exceptions — unanimous. (The Coordinator held a partial exception in Round 1 and reversed it after reading the peer reasoning — see the Coordinator's full Round 2 text below for why.)
- Structured `license`/`attribution`/`category`/`tags` fields replacing free-text `NOTICE.md`-only provenance — unanimous.
- Two coordinated documentation artifacts (human guide + machine-checkable spec) generated from one shared source of truth, not hand-duplicated — unanimous.
- Some form of a schema/API version field (`apiVersion`, `schema`, `tovuCompat`, or similar) for forward compatibility during the eventual migration of the ~10 existing themes — unanimous, including the Coordinator, who explicitly changed its mind on this in Round 2.

## Where you genuinely disagree — resolve these, don't just restate your own Round 1 answer

**A. What is the render-layer source folder called?** Three different answers on the table: `src/` (Fable, Gemini 3.1 Pro), `render/` (Codex, and the Coordinator adopted this in Round 2), `templates/` (Gemini 3.7 Flash, subdivided into `pages/`/`layouts/`/`partials/`). Read all four full arguments below and either defend your Round 1 pick against the strongest counter-argument, or change your mind and say why.

**B. What attribute name does theme markup use to publish an agent-operable element handle?** Fable, Flash, and Gemini 3.1 Pro all say reuse the admin's exact `data-agent-element` convention. Codex and the Coordinator both independently argued for a *distinct* name (`data-tovu-agent`), specifically because the admin convention grants operability in a trusted, authenticated, single-tenant surface, while published theme markup is visitor-facing, multi-tenant, and will eventually come from untrusted third-party marketplace authors — reusing the exact attribute name risks someone reasoning "same attribute, same trust level" across a real privilege boundary. This is a 3-2 split with a real security argument on the minority side. Resolve it.

**C. Does the manifest key stay `slots`, or become `partials`?** Fable (`partials`) and Codex (`composition.partials`) want to rename it, arguing "slot" collides with Vue/Svelte/Web-Component slot semantics (which insert content in the opposite direction) and will confuse readers once the component-framework tier is real. Flash and Gemini 3.1 Pro both keep `slots` (just nested differently: `rendering.slots` / `entrypoints.slots`). Pick one, or propose a third option if you see a better one — but commit.

**D. Does dev-time agent guidance live separately from the runtime `ai/` folder, or inside it?** Fable, Codex, and Flash all argue for a **separate, root-level `AGENTS.md`** (industry convention, different trust model/audience/lifecycle than runtime capability metadata). Gemini 3.1 Pro explicitly disagrees and puts `ai/instructions.md` *inside* the `ai/` folder, arguing co-location keeps "all machine-readable context localized." This is a real, stated 3-1 disagreement, not an oversight — Pro should defend or concede it.

---

## Full Round 1 positions (verbatim)

### Coordinator (Claude Opus 5, Primary) — Round 1 frozen position

# Primary (Claude Opus 5, host) — Round 1 frozen position

Frozen before dispatching or reading any peer's Round 1 answer, per the Debate Round-Disclosure Guard.

## Proposed invariant structure

```
theme-id/
  theme.json                     # required manifest
  tokens.json                    # required design tokens
  tokens.<mode>.json             # optional per-mode override (e.g. tokens.light.json)
  NOTICE.md                      # optional human-prose provenance/license notes
  assets/
    previews/                    # required: >=1 card image; optional gallery; video/audio playback deferred
    images/  video/  audio/  fonts/   # optional, any media type
  css/
    theme.css                    # required single entry point; may @import siblings in css/
  templates/                     # render-layer source; format is tier-specific
  scripts/                       # optional first-party interactive JS/TS; declarative tier has none
    vendor/                      # optional vendored third-party libraries (not CDN-loaded), own LICENSE per package
  locales/                       # optional i18n UI strings
  ai/
    capabilities.json            # optional; RUNTIME agent/MCP-facing metadata for the published site
    AGENT.md                     # optional; DEV-TIME instructions for a coding agent maintaining/converting this theme
  tests/                         # optional; fixtures/golden output to verify correct rendering
  dist/                          # component-framework tier only; local dev build output (see reasoning)
```

## Reasoning, point by point

**`templates/`, not `src/`.** I disagree with the Terra candidate here. Two of the three tiers that exist today already call it `templates/` — keeping that name is less churn, not more. More importantly: `src/` is ambiguous the moment a theme also has `css/`, `scripts/`, and `assets/` as siblings — a developer's default expectation for `src/` (especially one coming from Next.js/SvelteKit/Astro, where `src/` is the umbrella for EVERYTHING including components, utils, styles) is "all my code lives here," which would be actively wrong in this shape. `templates/` is unambiguous: it's specifically the files that render into pages, nothing else. Since CSS and scripts already have their own homes, there is no compilation-vs-source case left for `src/` to win on.

**`css/theme.css`.** Agree with the Terra candidate. One guaranteed entry point, but inside a folder so it can grow (`css/tokens-overrides.css`, per-page splits) without ever needing a second top-level file.

**`scripts/`, not `js/`.** Agree with the Terra candidate, for a reason it didn't have access to: the real repo's `static/basic` theme vendors a third-party animation library locally (`js/vendor/motion.js`) instead of loading it from a CDN, specifically to keep the theme fully self-hostable. That's a real, deliberate policy worth a distinguished `scripts/vendor/` convention — first-party interactive code and vendored third-party code are different trust levels and probably need different treatment in tooling (e.g. a vendored file should never be hand-edited; that should be enforceable, not just documented).

**`dist/` — partial disagreement with the Terra candidate.** Terra says never inside the author folder. I think that's the wrong boundary. A LOCAL, gitignored `dist/` during a theme author's own dev/watch loop on the component-framework tier is normal and harmless — it's their own machine. The actual constraint the owner's untrusted-third-party-code concern requires is: the marketplace/production pipeline must NEVER trust an author-supplied `dist/` as the shipped artifact — it always rebuilds from source in a sandboxed builder it controls. The trust boundary is about who builds it and where, not whether the folder is allowed to exist at all.

**`ai/` split in two, plus a separate `tests/`.** The runtime capability surface (`capabilities.json` — WebMCP-style element/tool-call metadata for agents visiting the live site) and the dev-time surface (`AGENT.md` — instructions for a coding agent converting/maintaining the theme) are different audiences and shouldn't be conflated in one file. `tests/` (fixtures/golden output) is useful to a human AND a coding agent equally, so it gets its own top-level folder rather than being nested under `ai/`.

**Documentation split.** Two documents, generated from one shared source of truth rather than hand-duplicated (duplication drifts). Concretely: a JSON Schema for `theme.json` (machine-readable, validates real themes, IS the agent-facing spec) plus a prose authoring guide for humans (examples, rationale, screenshots) whose field-reference tables are generated FROM the schema's own `description`s — not maintained twice by hand.

**What I'm least sure of:** whether `templates/` truly survives contact with the component-framework tier once it's real — a Vue/Svelte theme's "render source" often IS its interactive logic (a `.vue` file has script+template+style in one file), which strains the "templates holds render-only, scripts holds interactivity" split I'm proposing. Flagging this now as the place I'd most expect a strong peer counter-argument to change my mind.


### Coordinator (Claude Opus 5, Primary) — Round 2 rebuttal (already frozen, informs but does not replace your own reasoning)

# Primary (Claude Opus 5, host) — Round 2 frozen rebuttal

Frozen after reading all 4 Round 1 peer positions and the real `development/docs/themes/theme-authoring-guide.md`, and BEFORE dispatching or reading any peer's Round 2 response, per the Debate Round-Disclosure Guard.

## Current position: changed, materially

My Round 1 answer proposed `templates/` over `src/`. I'm dropping that. All three peers independently converged on rejecting a bare, undifferentiated render folder — Fable fixed `src/` with a required `pages/`+`partials/` interior, Codex proposed `render/` specifically to avoid `src/`'s ambiguity with CSS/scripts/assets living alongside it, Flash and Pro (see their files) both leaned toward a structured render root too. My own reason for keeping `templates/` (avoid churn, 2 of 3 real tiers already use it) is weaker than the shared counter-argument: `templates/` is factually wrong for two of four tiers (static pages aren't templates in any meaningful sense, and component-tier files are components, not templates), and I don't have a good answer to that. **I'm adopting Codex's `render/` over Fable's `src/`** — Codex's reasoning is the more precise: `src/` will attract stray non-render files the moment a component-tier author reaches for habit (a `src/utils/` "obviously" belongs under `src` to anyone coming from a real framework), whereas `render/` has exactly one rule with no ambiguity: "everything `renderer.adapter` interprets lives here." Fable's interior fix (`pages/`+`partials/`) is still correct and I'm carrying it forward under the new name: `render/pages/` + `render/partials/`.

**New information that changes everything else, not just this repo's peers didn't have:** the real theme-authoring-guide.md, which none of the four peers saw (it wasn't in the bounded file set I gave them — a scope mistake on my part, corrected below). It proves:
- The real `ThemeTier` union is 5 values today (`declarative | templated | handlebars | static | code`), not the packet's 3-built-plus-1-planned framing. `handlebars` is fully built, zero content. `code` is an unbuilt placeholder for "trusted signed-plugin JS" — genuinely different from a modern component-framework tier (React/Vue/etc.), not a synonym for it.
- The manifest's `slots` field, and `modes`/`defaultMode`, are actually wired and read (not just declared) — richer than I told the panel.
- The real embed system spans 6 types (`partial`, `menu`, `widget`, `form`, `media`, `post`) under one mechanism, of which "partial" (what the whole `slots` debate has been about) is only one.
- A `regions` field for widget placement already exists, fully implemented, zero adopters.
- A `theme_write_file` agent tool already exists and does single-theme hot-reload without a server restart — relevant to the dev-time agent-support design (#9), since a conversion agent doesn't need to restart anything to see its edits take effect.
- The guide's own documentation *pattern* (two-table field split of "read vs. dead," verified-not-inferred citation discipline, an explicit gotchas section, a minimal worked example) is a proven template Codex's #10 and Fable's #10 answers should be evaluated against, not invented from scratch.
- One claim in the guide itself is wrong (§6's "three separate attributes" description of the marker syntax) — confirmed by reading the actual parser regex (`src/core/embeds/marker.ts:108`) and live files. The real, current, single-source-of-truth mechanism is ONE attribute, `data-embed-config`, a JSON blob carrying `type`/`id`/other params — which is what my ORIGINAL packet said, so no correction needed to what I told peers on this specific point, but it means Codex's "generalize the marker mechanism" reasoning is built on the *correct* current mechanism (it never saw the guide's incorrect description, and independently arrived at basically the right shape).

## My positions, item by item, updated

**1. Render source folder: `render/`, with `pages/` + `partials/` interior.** (Changed from `templates/` — see above.) `render/components/` for component-tier themes, as Codex proposed, is a good addition I'm adopting.

**2. CSS: `css/theme.css`.** Unchanged, unanimous across all 5 participants including me. Also adopting Codex's `css/vendor/` for third-party CSS, for the same reason as vendored JS (see #8).

**3. `scripts/`, with a mechanical boundary rule.** Adopting Fable's crisp rule almost verbatim: "if the browser loads it verbatim, it's `scripts/`; if the tier's build touches it, it's `render/`." This is better than my Round 1 phrasing because it's actually checkable by a validator, not just a guideline.

**4. `dist/`: never inside the author folder.** I'm reversing my Round 1 partial disagreement. I argued a local, gitignored dev-loop `dist/` was harmless. Fable's counter is the one I don't have a good answer to: "absence is the invariant" — three of four tiers have literally no concept of build output, so "a theme folder never contains build output," with zero exceptions, is the only version of the rule that's actually true across all four tiers, and it's also the only version simple enough to put in a validator with no tier-conditional carve-out. My "it's just the author's own machine" argument doesn't survive contact with the fact that the author's own machine is exactly the thing the marketplace eventually has to stop trusting. Codex's stronger framing — output lives in "a platform-managed, content-addressed workspace outside the theme source directory," keyed by (id, version, toolchain) — is the right mechanism for where the *real* build output goes.

**5. `ai/` folder.** Splitting from Fable/Codex on the attribute name. Fable says reuse `data-agent-element` (matching the admin convention exactly, one resolver serves both). Codex says use a distinct `data-tovu-agent` (prevent admin-operability and published-site privileges from being conflated). **I side with Codex here**, for a reason neither fully stated: the admin's `agentHandle()`/`data-agent-element` system grants an agent the ability to *operate controls in a trusted, authenticated, single-tenant admin surface*. A theme's published-site markup is visitor-facing, multi-tenant, and — per the packet's own out-of-scope note — will eventually come from *untrusted third-party authors*. Reusing the exact same attribute name across a trusted-admin-only mechanism and an untrusted-third-party-content mechanism is the kind of thing that looks convenient today and becomes a real confusion (or worse, an actual privilege-boundary bug from someone reasoning "it's the same attribute, so it's the same trust level") the moment the marketplace opens up. A shared *grammar* (handle naming rules, default-deny, explicit publication) is good; a shared *namestring* across two different trust boundaries is not. `data-tovu-agent` for theme markup, `data-agent-element` stays admin-only.

**6. Slots/partials naming and mechanism.** Converging with both Fable and Codex: rename `slots` → `partials` (Fable) or `composition.partials` (Codex) — I prefer the flatter `partials` (Fable's), since nothing else in the manifest needs a `composition` grouping and adding one now is unjustified structure for a single field. Generalizing the *mechanism* as "a logical request with an id + params, resolved by the host, carrier varies by tier" (both peers said versions of this) is correct and matches how the real, current `data-embed-config` mechanism already works for `partial` (one of six embed types, not a bespoke thing) — worth telling the panel explicitly, since none of them had the real embed-type enumeration.

**7. Structured `license`/`attribution`/`category`.** Unanimous, adopting the richer shape (Codex's `attributions` array with per-item file/license/source, closer to what an actual license audit needs than a single string).

**8. Vendored vs first-party scripts.** Unanimous. Adopting the `scripts/vendor/<lib>/` + manifest `kind: "vendor"` + `attribution` id shape (both Fable and Codex converged here almost exactly).

**9. Dev-time agent support.** Converging: `AGENTS.md` at theme root (not nested in `ai/`), `tests/` with `fixtures/` + `golden/`. New from Codex worth adopting: an explicit `settle` contract in test cases (event name + timeout) — this directly targets `static/basic`'s own documented real bug (screenshots caught mid-reveal-animation), so it's not speculative, it's fixing something that already happened once.

**10. Documentation split.** Converging on "two artifacts, one source of truth" (all three peers, me too). New, worth adding explicitly: the real theme-authoring-guide.md is proof this pattern already works in this exact repo — cite it as the template for tone/discipline (path:line citations, explicit "read vs dead" field tables, a gotchas section, a worked minimal example) rather than inventing new documentation conventions.

**11. Missing pieces.** Converging on an `apiVersion`/`schema` integer (all three peers now agree, including me — I'm satisfied this isn't "patching over disagreement," it's answering a real question the owner didn't originally ask about: how does a loader tell two different-shape `theme.json` files apart during the (owner-confirmed, deferred) migration window). New from the guide, not from any peer: the real `regions` field (widget placement) should be explicitly preserved in whatever schema ships — it's built, tested, and would be silently lost if the new schema drops any field it doesn't already know about.

## What I got wrong in Round 1, stated plainly

`templates/` over `src/`/`render/` — reversed above. My `dist/` partial-exception — reversed above. Both times, a peer's argument (not just volume of agreement) is what moved me: "absence is the invariant" for `dist/`, and the "src/ attracts stray files by habit" point for the render folder. Neither peer was arguing from more information than I had — they reasoned better from the same facts, which is exactly what Round 1 blind independence is supposed to surface.

## Correction owed to the panel in Round 2

The Round 1 packet under-scoped file access: it granted `src/themes/**` + `capability-registry.ts` only, missing the real theme-authoring-guide.md entirely. All four Round 1 answers were produced without it. Round 2 must supply its relevant contents directly (not just a path, since not every peer's transport can freely re-read arbitrary new paths mid-debate) so every participant reasons from the same, corrected ground truth this round.


### Fable (claude-fable-5, added subagent) — Round 1 position

# Fable (claude-fable-5, added in-host subagent) — Round 1 answer

Received via SendMessage after the subagent went idle without proactively reporting; recovered by nudging it for its final answer. Recorded verbatim below.

---

ACK_PACKET_RECEIVED tovu-theme-invariant-structure -- I received the packet and will work on it.

I read the packet, all three tier manifests, the folder listings, `src/themes/README.md`, and the capability-registry header. This is my complete Round 1 position.

---

# Position: convention fixes locations; the manifest says only what files cannot say

One principle drives everything below. The repo already proved that manifest fields which duplicate file-system truth become lies: `theme.json`'s `pages` array is written by every static theme and **read by nothing** (`src/themes/README.md` confirms page discovery reads the real files). So my invariant has two halves:

- **Folder layout is fixed by convention, identical names in every tier.** A tier may *omit* a folder only when the role genuinely doesn't exist there. A tier never *renames* a role.
- **`theme.json` contains only fields the host actually reads.** No documentary fields, ever. If the file system can express it (where pages live, whether a card preview exists), the manifest does not restate it.

## The invariant tree

```
<theme-id>/                      # folder name MUST equal theme.json "id" (existing rule, keep)
├── theme.json                   # REQUIRED — manifest, one invariant schema
├── tokens.json                  # REQUIRED — default-mode design tokens
├── tokens.<mode>.json           # optional — one per extra mode, declared in manifest
├── AGENTS.md                    # RECOMMENDED — dev-time coding-agent instructions (see #9)
├── NOTICE.md                    # optional — free-text legal/provenance prose (machine truth is in theme.json)
├── assets/                      # ALL media (owner-locked name)
│   ├── previews/                #   marketplace media; card.webp REQUIRED at this fixed path
│   ├── images/  video/  audio/  #   optional
│   ├── fonts/                   #   optional — self-hosted font files (see #11)
│   └── files/                   #   optional — downloadables
├── css/
│   └── theme.css                # REQUIRED all tiers — THE stylesheet entry; extra css files @imported from it
├── src/                         # REQUIRED — ALL render-layer source, every tier
│   ├── pages/                   #   page-level units: .html / .liquid / .json / .tsx per tier
│   └── partials/                #   named shared units: nav, footer… (id defaults to filename)
├── scripts/                     # optional — JS the browser loads AS-IS; FORBIDDEN in declarative tier
│   └── vendor/<lib>/            #   pinned third-party libs, LICENSE file each, never hand-edited
├── ai/                          # optional — published-site agent surface; pure data, default-deny
│   ├── capabilities.json
│   ├── elements.json
│   └── scoring.json
├── tests/                       # RECOMMENDED — dev-time verification
│   ├── fixtures/                #   sample content the renderer consumes (doubles as data-contract doc)
│   └── golden/                  #   expected rendered output per page
└── package.json                 # FRAMEWORK TIER ONLY — build deps; dist/ NEVER exists in this folder
```

Never present, any tier: `dist/`, generated preview output (today's `static/basic/preview/` — full generated page copies inside the author folder — is exactly the rot this bans; the packet itself flags `build-preview.mjs` as a stand-in not to keep), loose render files at theme root (today's `nav.html`/`footer.html` move to `src/partials/`).

## `theme.json` sketch

```jsonc
{
  "schema": 2,                              // int, REQUIRED — see #11 for why this earns its place
  "id": "basic",                            // REQUIRED, must match folder name
  "name": "Basic",                          // REQUIRED
  "version": "0.1.0",                       // REQUIRED, semver
  "tier": "static",                         // REQUIRED: "static" | "templated" | "declarative" | "framework"
  "engine": { "name": "liquid", "version": "1" },
                                            // REQUIRED for templated + framework; FORBIDDEN otherwise.
                                            // templated: liquid | handlebars.  framework: react | vue | svelte | …
  "description": "…",                       // REQUIRED
  "category": "marketing",                  // REQUIRED — controlled vocab for marketplace browsing
  "tags": ["saas", "blog"],                 // optional
  "license": { "spdx": "MIT", "noticeFile": "NOTICE.md" },   // REQUIRED ("custom" + file allowed)
  "authors": [{ "name": "…", "url": "…" }], // REQUIRED, ≥1
  "provenance": { "convertedFrom": "Wearix (Framer export)", "notes": "…" },  // optional, structured
  "tokens": {                               // REQUIRED
    "defaultMode": "dark",
    "modes": { "dark": "tokens.json", "light": "tokens.light.json" }
  },
  "fonts": [                                // optional — structured, self-hostable (see #11)
    { "family": "Geist", "weights": [400, 500], "files": ["assets/fonts/geist-var.woff2"] }
  ],
  "render": {                               // tier-discriminated; ONLY what convention can't express
    // static:      {} (nothing to say — src/pages/ + marker parser is the whole story)
    // templated:   {} (engine field above covers it)
    // declarative: {}
    // framework:   { "toolchain": "vite", "entry": "src/pages", "node": ">=20" }
  },
  "partials": {                             // optional — ONLY for partials needing more than filename-as-id
    "footer": { "variants": { "minimal": "src/partials/footer-minimal.html" } },
    "nav": { "params": { "current": { "type": "string" } } }
  },
  "scripts": {                              // REQUIRED iff scripts/ exists
    "entries": ["scripts/main.js"],
    "vendor": [{ "name": "motion", "version": "11.x", "license": "MIT", "path": "scripts/vendor/motion" }]
  },
  "assets": {                               // optional — card.webp is fixed-path convention, NOT listed here
    "previewGallery": [{ "src": "assets/previews/home.webp", "caption": "Home, dark" }]
  },
  "ai": { "dir": "ai" }                     // optional presence flag; contents in ai/*.json
}
```

Everything universal is top-level; the *only* tier-discriminated part is `render` (plus the `engine` requirement matrix). That is what makes this one schema, not four schemas in a trenchcoat.

---

## The 11 questions

**1. Render source folder: `src/`, with a mandatory invariant interior (`pages/` + `partials/`).**
`templates/` is wrong for two of four tiers: static pages are not templates, and framework components are not templates. `src/` is right in all four — and not merely by ecosystem familiarity: **even the static tier's markup is source, not served output**, because every static page passes through `substituteMarkers` (partial injection, menu rendering) before serving. Nothing ships verbatim in any tier, so "source" is literally true everywhere. The candidate's `src/` is correct but incomplete — a bare `src/` is exactly the ambiguous "put render stuff here" folder the documentation bar warns against. Fixing `src/pages/` (page-level units) and `src/partials/` (shared units) as required interior roles makes it documentable per tier: `.html` files, `.liquid` files, JSON block trees, or route components — same two roles, four formats. Framework tiers may add extra folders inside `src/` (`src/lib/` etc.); the two named roles are the invariant, not an exhaustive list. Astro already does literally `src/pages/`; React/Vue authors adapt trivially.

**2. CSS: `css/theme.css` as the single required entry, all four tiers.**
Root `styles.css` pollutes the root (which should stay manifest-and-docs-only, so it's scannable) and gives no room to split. A bare `css/` folder with no fixed entry forces the host to guess. `css/theme.css` gives both: one fixed path the host always loads, and a folder where authors split files via plain `@import` — which works build-free, so no build step is forced on the three build-free tiers. Filename choice (`theme.css` vs `styles.css`) is low-stakes; I pick `theme.css` because it names the role. The important part is the rule: **the host loads exactly `css/theme.css`; everything else must be reachable from it.** Framework tier: `css/theme.css` still exists, still required, and is where `tokens.json` values land as CSS custom properties — compiled component-scoped CSS is *additive* platform-built output, never a replacement. This preserves a real property: a theme's base look is inspectable without running any build.

**3. `scripts/`, distinct, with a crisp boundary rule.**
Yes, keep it separate from `src/`, with this invariant rule: **if the browser can load the file verbatim, it's `scripts/`; if it needs the tier's build, it's `src/`.** For the three build-free tiers, all behavior is `scripts/` by definition (declarative: forbidden entirely — its no-JS rule is a tier constraint the invariant respects by omission, not renaming). For the framework tier, interactive behavior lives in components (`src/`) and gets compiled; `scripts/` remains legal for genuinely build-free additions (an analytics-free enhancement snippet, an HTMX/Alpine sprinkle — which the packet correctly scopes as a script include, not a tier). The rule is mechanical, so it's documentable and agent-checkable. I rename today's `js/` → `scripts/` (matches candidate; "js" would misname a future `.mjs`/wasm-loader world and `scripts` names the role).

**4. `dist/` in the author folder: never, no exceptions.**
Three reasons, in strength order. (a) *Trust:* the marketplace will build untrusted third-party source. An author-shipped `dist/` is the classic supply-chain gap — reviewers read `src/`, browsers run `dist/`, and nothing ties them together. If output only ever comes from the platform's own sandboxed build of `src/` + `package.json`, keyed by (id, version, toolchain), that gap cannot exist. (b) *Invariance:* three of four tiers have no build; "a theme folder never contains build output" is the only version of this rule that is true in all four tiers. Absence is the invariant. (c) *Evidence already in-repo:* `static/basic/preview/` is generated output living in the author folder, and it's a full drifting copy of pages/css/js — the packet itself calls its generator a stand-in to discard. That's the failure mode, already happened, at tier 1 of 4.

**5. `ai/` design: data-only, default-deny, three files, one shared attribute convention.**
The theme *declares*; the host *enforces*. A theme can never grant itself capability — it publishes metadata that the host's registry (the `capability-registry.ts` pattern: default-deny, adapters as thin translators over `invoke()`) may choose to expose through a future WebMCP adapter. No `ai/` folder = nothing operable. This keeps the declarative tier's no-code rule intact and keeps untrusted marketplace themes safe, because `ai/` is pure JSON in every tier.

- `elements.json` — the catalog of agent-operable handles: `{ "handles": { "add-to-cart": { "description": "…", "kind": "action", "pages": ["product"] } } }`. **Reuse the admin convention exactly**: the markup carrier is the same `data-agent-element="<handle>"` attribute with the same handle grammar, so one resolver serves both layers. Per tier: static/templated write the attribute in markup; declarative blocks get an optional `agentElement` property the *renderer* emits as the attribute; framework components use the real `agentHandle()` helper at build time. The layers stay separate (admin registry vs theme manifest) — only the *convention* is shared.
- `capabilities.json` — tool-call-shaped intents: name, description written *for the agent*, JSON-Schema input, target handles, and `"kind": "declarative"` (host performs a known action via handles — navigation, form fill) vs `"imperative"` (requires a theme script to expose a function; only legal in tiers with `scripts/`, and host-gated).
- `scoring.json` — thin on purpose: named checkpoints mapping funnel steps to handles, for eval harnesses. Zero adoption exists; a JSON file that can grow beats a spec nobody uses.

Pre-empting one attack: yes, `elements.json` overlaps markup. It's not a duplicate source of truth, because markup attributes are per-page *instances* while `elements.json` carries the *semantics* (description, kind) markup can't hold — and the host validates agreement: a handle in markup but not the manifest is inert (matching the admin precedent: "an agent can only touch what a component explicitly published"), and manifest-without-markup is a lint warning.

**6. Partials: invariant ID namespace + manifest declaration; tier-specific carrier.**
The working `data-embed-config='{"type":"partial","id":"nav","current":"index"}'` marker is the right kernel: a *reference by ID with params*, resolved by the host — no include directive, no code in the theme. Generalize by keeping the contract's two halves invariant and letting only the carrier vary: static/templated keep the marker (already shared-parsed); declarative uses a native block node `{"type":"partial","id":"nav"}` — a JSON tree citizen, trivially; framework tier resolves partial IDs at build time to component imports — there, **a partial IS a component** (`src/partials/Nav.tsx`), referenced via a host-provided `<Partial id="nav" …/>` or codegen. Naming: I deliberately rename the manifest key `slots` → `partials`, because "slot" collides head-on with Vue/Svelte/Web-Component slots, which insert content in the *opposite direction* — a guaranteed confusion in the framework tier and in a public article. One word, one meaning: partial = named shared render unit under `src/partials/`. IDs default from filenames (`nav.html` → `nav`); the manifest `partials` block exists only for what filenames can't say (variants, params schemas — today's `honorsCurrentPage` becomes an ordinary declared `current` param).

**7. Structured `license`/`attribution`/`category`: yes, required.**
The evidence is already in the repo: `fashion-modern`'s `author` field is prose doing three jobs (name, provenance, redistribution notice), and `basic`'s `NOTICE.md` is machine-invisible. A marketplace cannot filter, and license-scan untrusted submissions, on prose. So: `license` (SPDX or `"custom"` + file ref) required; `authors` array required; `category` (controlled vocabulary) required — it's the marketplace's day-one browse axis and one theme is already category-built; `tags` optional; `provenance` optional but structured, which conversion agents also need for license compliance. `NOTICE.md` survives as optional prose — structured fields are the machine truth, not a replacement for legal text.

**8. Vendor scripts: distinguished, and listed in the manifest.**
`scripts/vendor/<lib>/` with each lib's LICENSE preserved — this formalizes what `js/vendor/motion.js` + `LICENSE.md` already does, and the self-hosting guarantee it encodes is worth keeping explicit. Two audiences need the distinction: the marketplace (license-scan untrusted themes via `scripts.vendor` manifest entries without parsing JS) and AI coding agents (rule: vendor files are pinned and never hand-edited — an agent must not "fix" minified vendored code during reconciliation). Framework tier: `package.json` *is* its vendor manifest; `scripts/vendor/` remains only for browser-loadable vendored files.

**9. Dev-time agent support: `AGENTS.md` at theme root + `tests/`; NOT inside `ai/`.**
Different audience, different lifecycle: `ai/` ships meaning to the *published site's* agents; dev support serves agents editing the *source*, and the installer may strip it from installed copies. `AGENTS.md` at theme root, because that's the cross-tool convention coding agents already look for — zero Tovu-specific discovery needed. One file, minimal contents: token-mapping notes, generated-vs-hand-editable files, conversion gotchas, how to run this theme's tests. `tests/fixtures/` holds sample content the renderer consumes — which quietly solves a second problem: **fixtures are the theme's data contract**, exactly what a conversion agent needs ("what shape does `product.liquid` expect"), currently buried in template header comments. `tests/golden/` holds expected rendered output per page. One host-provided runner (`tovu theme test <path>`) renders fixtures and diffs against golden — themes never ship their own runner scripts (the `build-preview.mjs` pattern dies here). That's the whole spec; it has zero adoption today, so anything bigger is over-build.

**10. Two artifacts, one source of truth.**
(a) A machine spec: a real JSON Schema for `theme.json` + a MUST/SHOULD conformance checklist with a per-tier required/forbidden matrix — shipped in-repo and *executed* by `tovu theme validate`, so the spec cannot rot. (b) A human guide (the article series): tutorial-ordered prose, worked examples, the *why* behind each rule, pitfalls, migration notes. The guide cites the schema and never hand-restates field tables (drift risk). What each needs that the other doesn't: humans need rationale and narrative; agents need exact types, per-tier matrices, deterministic file-location rules, and machine-checkable validity. Invalid-theme counterexamples belong in **both** — prose-explained for humans, encoded as failing validator fixtures for agents.

**11. Missing pieces — four, each grounded in a repo fact the packet under-weights:**

- **`tier` + `engine` must be split, and the repo already proves it.** `src/themes/README.md` shows a `handlebars/` tier folder (empty, but with a fully implemented render pipeline) sitting *beside* `templated/`, plus a declared-but-unimplemented `code` type. Handlebars-as-a-fifth-sibling breaks "four tiers" today, before the framework tier even lands with its *eight* frameworks. The fix is structural: `tier` is exactly four role values; `engine` names the concrete language/toolchain. Handlebars folds into `tier: "templated", engine: "handlebars"`; React/Vue/Svelte/etc. are engines of the single `framework` tier, not eight tiers. The on-disk `<tier>/<id>` parent folder becomes host storage detail — identity lives in the manifest.
- **A `schema` integer, with a real forward-compat argument, not a patch.** The owner rejected "add a version field to paper over disagreement" — this isn't that. Ten installed themes will migrate later (owner-confirmed), so for one window the loader will meet both shapes and must tell them apart mechanically; and a public article series freezes the shape in thousands of readers' heads, so any future change needs a precise loader-side error ("schema 1 theme; run tovu theme migrate") rather than heuristic sniffing. One integer buys that.
- **The no-dead-fields rule as an explicit schema law.** `pages` (written by every static theme, read by nothing) is the cautionary tale: dead fields actively mislead AI agents, which will faithfully maintain them, and they poison the article. Every field in the schema must name its host reader; my sketch drops `pages` entirely (discovery = files in `src/pages/`, already the real behavior).
- **Structured, self-hostable `fonts`.** Today's `"Geist:wght@400;500"` strings are a Google-Fonts CDN shape — which quietly violates the same self-hosting guarantee the theme system deliberately vendors `motion.js` to protect. Structured entries (`family`, `weights`, optional `files` pointing into `assets/fonts/`) make offline-safe the default and CDN the explicit exception.

Also endorsed from the candidate: the `tokens.modes` map (generalizes `tokens.light.json` to N modes with explicit file paths). On `locales/`: reserve the name, spec nothing — zero adoption, and speccing empty folders is how dead conventions start.

---

## Minimal valid theme per tier

| Tier | Minimal file set |
|---|---|
| static | `theme.json`, `tokens.json`, `css/theme.css`, `src/pages/index.html` |
| templated | same, but `src/pages/index.liquid` + `engine: {name:"liquid"|"handlebars"}` |
| declarative | same, but `src/pages/home.json`; `scripts/` forbidden |
| framework | same, but `src/pages/` components + `package.json` + `render.toolchain`; `dist/` still forbidden |

Invalid, and why: committed `dist/` or generated preview output (platform-owned; supply-chain gap) · `scripts/` in a declarative theme (tier's no-code rule) · `id` ≠ folder name (existing loader rule) · a manifest field no host code reads (schema law above) · `data-agent-element` handle absent from `ai/elements.json` (inert + lint warn, default-deny).

## On the candidate proposal

Agree: `assets/` + `previews/`, `src/` for render source, no `dist/` ever, single CSS entry `css/theme.css`, optional `scripts/`, tokens-modes map. Disagree: its `renderer{sourceRoot,format,entry}` + `entrypoints{pages,styles,scripts,slots}` blocks re-declare locations the folder invariant already fixes — two sources of truth, which is precisely how the repo got its dead `pages` field; and `build{mode}` belongs in the framework tier's own toolchain files, with the manifest pinning only `render.toolchain`. Its bare `src/` needs the `pages/`+`partials/` interior to meet the documentation bar. And it's silent on everything in my #5, #7, #8, #9, and #11 — which is most of what's genuinely new this round.

## Forward-compat notes (one paragraph each, per scope rules)

*Migration:* every move is a mechanical rename plus a manifest rewrite — `screenshots/`→`assets/previews/`, `js/`→`scripts/`, `pages/`→`src/pages/`, root `nav.html`/`footer*.html`→`src/partials/`, `styles.css`→`css/theme.css`, `slots`→`partials`, prose `author`→structured fields — scriptable as a `tovu theme migrate` over all 10 themes; nothing in the shape is structurally blocked.

*Untrusted builds:* because the author folder never contains output, `package.json` exists only in the framework tier, and vendor code is manifest-listed, the future sandbox has a closed contract — consume `src/` + `package.json`, emit to a platform-managed artifact store keyed by (id, version, toolchain) — with no author-controlled executable path into the served output of the three build-free tiers.


### Codex (gpt-5.6-sol, xhigh) — Round 1 position

# Codex (gpt-5.6-sol, xhigh) — Round 1 answer

Dispatched with real repo read access (`-C /Users/la/Programming/Tovu`), bounded to `src/themes/**` + `src/assistant/site/capability-registry.ts` per the packet. Recorded verbatim below (ACK line + full answer, diagnostics/thinking-aloud lines from the JSONL stream trimmed, final answer intact).

---

ACK_PACKET_RECEIVED tovu-theme-invariant-structure -- I received the packet and will work on it.

Codex(Peer Consensus): My independent Round 1 position is to adopt the candidate's broad direction—one manifest, `assets/`, `css/theme.css`, external build artifacts—but replace `src/` with a fixed `render/` contract and sharply separate published-site AI metadata from coding-agent support.

## Proposed invariant package

```text
theme-id/
├── theme.json                         # required
├── AGENTS.md                          # required; coding-agent instructions
├── LICENSE                            # required
├── NOTICE.md                          # optional provenance/change narrative
│
├── tokens/                            # required
│   ├── dark.json                      # filenames declared by theme.json
│   └── light.json
│
├── assets/                            # required
│   ├── previews/
│   │   ├── card.webp                  # required for marketplace distribution
│   │   └── gallery/                   # optional additional still images
│   ├── images/                        # optional
│   ├── fonts/                         # optional
│   ├── video/                         # optional; playback policy deferred
│   ├── audio/                         # optional; playback policy deferred
│   └── files/                         # optional downloads/documents
│
├── css/
│   ├── theme.css                      # required global stylesheet entry
│   └── vendor/                        # optional third-party CSS
│
├── render/                            # required; renderer-owned source only
│   ├── pages/                         # .html/.liquid/.json/.tsx, by adapter
│   ├── partials/                      # logical partial implementations
│   └── components/                    # normally component-tier only
│
├── scripts/                           # optional; static/templated only
│   ├── main.js                        # first-party scripts live at this level
│   ├── reveal.js
│   └── vendor/
│       └── motion/
│           ├── motion.js
│           └── LICENSE
│
├── locales/                           # optional
│   └── en.json
│
├── ai/                                # required; published-site agent surface
│   ├── capabilities.json              # required, even if empty/default-deny
│   └── evaluation.json                # optional scoring/evaluation metadata
│
├── tests/                             # required; development/conformance only
│   ├── cases.json
│   ├── fixtures/
│   ├── golden/
│   │   ├── dom/
│   │   └── visual/
│   └── ai/
│
├── package.json                       # component tier only
└── <supported lockfile>               # component tier only
```

Optional directories may be absent when unused; required files make the package discoverable without relying on empty directories.

## `theme.json` sketch

This is a valid-JSON static-tier example. Paths are theme-root-relative; the fixed roots themselves are not configurable.

```json
{
  "$schema": "https://tovu.dev/schemas/theme/v1/theme.schema.json",
  "apiVersion": 1,

  "id": "basic",
  "name": "Basic",
  "version": "1.0.0",
  "description": "A multi-page marketing theme.",
  "tier": "static",

  "compatibility": {
    "tovu": ">=1.0.0 <2.0.0"
  },

  "author": {
    "name": "Tovu",
    "url": "https://tovu.dev"
  },

  "license": {
    "expression": "MIT",
    "file": "LICENSE"
  },

  "attributions": [
    {
      "id": "motion",
      "name": "Motion",
      "version": "13.0.0",
      "license": "MIT",
      "source": "https://motion.dev",
      "files": ["scripts/vendor/motion/**"],
      "licenseFile": "scripts/vendor/motion/LICENSE"
    }
  ],

  "marketplace": {
    "categories": ["business", "marketing"],
    "tags": ["dark", "light", "multi-page"],
    "previews": {
      "card": "assets/previews/card.webp",
      "gallery": [
        "assets/previews/gallery/home-dark.webp",
        "assets/previews/gallery/home-light.webp"
      ]
    }
  },

  "renderer": {
    "adapter": "html@1",
    "entries": {
      "home": { "source": "render/pages/index.html" },
      "about": { "source": "render/pages/about.html" },
      "entry": { "source": "render/pages/blog-post.html" }
    }
  },

  "composition": {
    "partials": {
      "nav": {
        "source": "render/partials/nav.html",
        "inputs": { "current": { "type": "string", "required": false } }
      },
      "footer": {
        "source": "render/partials/footer.html",
        "variants": { "minimal": { "source": "render/partials/footer-minimal.html" } }
      }
    }
  },

  "tokens": {
    "default": "dark",
    "sets": { "dark": "tokens/dark.json", "light": "tokens/light.json" }
  },

  "fonts": [
    {
      "family": "Geist",
      "weight": "400 500",
      "source": { "kind": "asset", "path": "assets/fonts/geist-variable.woff2" }
    }
  ],

  "scripts": [
    { "id": "motion", "path": "scripts/vendor/motion/motion.js", "kind": "vendor", "load": "defer", "attribution": "motion", "entries": ["*"] },
    { "id": "main", "path": "scripts/main.js", "kind": "author", "load": "defer", "dependsOn": ["motion"], "entries": ["*"] }
  ],

  "locales": { "default": "en", "files": { "en": "locales/en.json" } },

  "build": { "mode": "none" }
}
```

Fixed conventions such as `css/theme.css`, `ai/capabilities.json`, `tests/cases.json`, and `AGENTS.md` should not be repeated in the manifest. Making them configurable would defeat the invariant layout and create drift.

The tier constraints should be:

| Tier | `renderer.adapter` | Render entries | Standalone `scripts/` | `build.mode` |
|---|---|---|---|---|
| static | `html@1` | `.html` | Allowed | `none` |
| templated | `liquid@1`, `handlebars@1` | Matching template format | Allowed | `none` |
| declarative | `tovu-blocks@1` | `.json` only | Forbidden | `none` |
| component | `react@1`, `angular@1`, etc. | Adapter-supported component files | Forbidden | `platform` |

HTMX and Alpine remain vendored or first-party browser scripts in static/templated themes. They do not imply `build.mode: "platform"`.

A component-tier entry can add an export without changing the enclosing shape:

```json
{
  "renderer": { "adapter": "react@1", "entries": { "home": { "source": "render/pages/Home.tsx", "export": "Home" } } },
  "scripts": [],
  "build": { "mode": "platform" }
}
```

No arbitrary `build.command` or author-selected output path should be accepted.

## 1. Render source folder

Use `render/`.

`templates/` incorrectly describes complete static pages, declarative block trees, and component modules. `src/` is too broad when CSS, assets, scripts, tests, and AI metadata deliberately live elsewhere; authors will reasonably assume all of those are "source."

`render/` has one precise rule: everything interpreted by `renderer.adapter` lives here. The adapter determines whether a source is HTML, Liquid, JSON, TSX, or another supported format. I would make this path fixed rather than preserving the candidate's configurable `renderer.sourceRoot`.

## 2. CSS invariant

Use `css/theme.css` as the one required global entrypoint.

The host loads only that file automatically. Authors may split CSS into additional files under `css/`, but `theme.css` must import them. This gives the simplicity of a single file and the scalability of a folder without loader-side discovery rules.

Component-local CSS may remain beside components under `render/`, because it participates in compilation. `css/theme.css` still owns global tokens, resets, typography, and shared theme-level styles.

## 3. Scripts versus render source

Keep a distinct optional `scripts/` folder for build-free browser JavaScript.

- Static and templated themes may use it.
- Declarative themes must reject it.
- Component themes must place interactivity in `render/` and compile it through the selected adapter. A component theme should not use `scripts/` as an escape hatch around the controlled build graph.
- HTMX/Alpine belong here for static/templated themes.

The manifest should declare load order, entry applicability, and dependencies. The host—not arbitrary HTML discovery—should determine which scripts execute.

## 4. Build output

Canonical `dist/`, `build/`, `.next/`, or equivalent output must never live in the author package.

Component builds should write to a platform-managed, content-addressed workspace outside the theme source directory. Source archives and compiled artifacts should be separate marketplace objects. That prevents stale source/output pairs and allows untrusted output to remain quarantined until validation.

Local tooling may cache externally, but `theme.json` must not expose an output-path or arbitrary shell-command field. `package.json` scripts should not become the marketplace execution contract; an allowlisted Tovu adapter should own the build invocation.

## 5. Published-site `ai/` surface

Keep the name `ai/`, but define it strictly as published-site agent metadata—not coding-agent guidance.

A minimal `ai/capabilities.json`:

```json
{
  "$schema": "https://tovu.dev/schemas/theme/v1/ai-capabilities.schema.json",
  "apiVersion": 1,
  "defaultPolicy": "deny",
  "handles": {
    "entry.card": { "description": "A published content card", "roles": ["link"], "operations": ["inspect", "activate"] }
  },
  "capabilities": {
    "entry.inspect": { "exposure": "declarative", "handles": ["entry.card"] },
    "entry.open": { "exposure": "imperative", "siteCapability": "navigate_to_entry", "handles": ["entry.card"] }
  }
}
```

Rendered markup would publish an exact handle:

```html
<a data-tovu-agent="entry.card" href="/example">Example</a>
```

The tiers express it differently but produce the same output contract:

- Static/Liquid: author the attribute directly or through a Tovu helper.
- Declarative: use a schema-owned `agentHandle` property; raw HTML remains forbidden.
- Component: use a Tovu helper/component that emits the validated attribute.

This should borrow the admin precedent's handle grammar, exact matching, and explicit publication model, but **not reuse `data-agent-element`**. A separate `data-tovu-agent` namespace prevents admin-operability and published-site privileges from being conflated.

Most importantly, a theme declaration never registers or authorizes executable tools. Imperative exposure is the intersection of: (1) the theme's declaration, (2) a real capability in the site capability registry, (3) that registry's caller authorization. A future WebMCP/A2A adapter remains a translator over the registry's `invoke()` path. An unlisted handle or capability is inert.

`ai/evaluation.json` should stay thin:

```json
{ "apiVersion": 1, "metrics": [{ "id": "entry-open-discoverability", "weight": 1, "cases": ["tests/ai/entry-open.json"] }] }
```

It declares scoring hooks; it does not execute code.

## 6. Slots and partials

Generalize the working marker mechanism as a logical embed request, not as an HTML-only syntax.

Rename the manifest's `slots` field to `composition.partials`. "Slot" usually means an insertion point, while the existing field actually registers theme-supplied partial implementations.

All tiers lower their author syntax to the same internal request: `{ "type": "partial", "id": "footer", "variant": "minimal", "current": "signup" }`.

Tier-specific authoring forms: static HTML uses the existing `data-embed-config`; templated uses a Tovu tag/helper or the same marker in emitted HTML; declarative uses an embed node in the block tree; component uses `<TovuPartial id="footer" variant="minimal" />`.

The manifest maps the logical ID and variant to an adapter-owned source. Component sources may add `"export": "Footer"`.

`honorsCurrentPage` should become an explicit input contract, as shown by `inputs.current`, rather than a special Boolean. Unknown partial IDs, variants, or undeclared inputs should fail conformance validation instead of silently becoming accidental runtime markup.

## 7. License, attribution, and category

Yes—these belong in structured fields: `author` (structured identity, not licensing prose), `license` (SPDX expression or LicenseRef + file), `attributions` (upstream designs, vendored libraries, affected paths, licenses, notice files), `marketplace.categories` (controlled discovery vocabulary), `marketplace.tags` (free-form secondary discovery terms), `NOTICE.md` (optional human narrative for conversion history and material changes). This deliberately replaces the current overloaded `author` string and machine-invisible licensing notes.

## 8. First-party versus vendored scripts

Distinguish them structurally and in the manifest: first-party (`scripts/*.js`), third-party (`scripts/vendor/<package>/...`), vendor license colocated with the vendored package, manifest entry with `kind: "vendor"` plus an `attribution` ID. One undifferentiated script folder makes license audits, vulnerability review, and upgrades unnecessarily difficult. Vendoring remains correct for Tovu's offline/self-hosted trust model; the distinction does not imply CDN loading. The same convention can apply to third-party CSS under `css/vendor/`.

## 9. Dev-time agent support

Keep it outside `ai/` — different consumers and trust models. `AGENTS.md` belongs at the theme root so coding tools naturally discover its theme-scoped instructions: renderer adapter and source format, generated/"do not edit directly" files, token mapping and mode rules, conversion/reconciliation notes, vendored dependency provenance, standard validation/render commands, animation or screenshot-settling requirements.

`tests/` should minimally contain a declarative `cases.json`, fixtures, and optional DOM/visual goldens, e.g.:

```json
{
  "apiVersion": 1,
  "cases": [{
    "id": "home-dark-desktop", "entry": "home", "tokenSet": "dark", "fixture": "fixtures/site.json",
    "viewport": { "width": 1440, "height": 900 },
    "settle": { "event": "tovu:ready", "timeoutMs": 3000 },
    "assert": { "noMissingEmbeds": true, "goldenDom": "golden/dom/home-dark.html", "goldenVisual": "golden/visual/home-dark.webp" }
  }]
}
```

The explicit settling contract addresses the real current failure mode where screenshots capture reveal animations halfway through. Build-free tiers should not need custom per-theme test executables; the platform runner consumes this file.

## 10. Documentation audiences

Produce two coordinated artifacts: (1) a human authoring guide — tutorials, rationale, worked themes per tier, accessibility guidance, troubleshooting, marketplace publishing; (2) a normative package specification — exact tree, field tables, defaults, schemas, cross-file invariants, adapter matrix, valid/invalid fixtures, machine-checkable conformance cases. The specification and JSON Schemas are authoritative; the guide links to them and may generate reference tables from the schemas, avoiding duplicated normative rules while keeping the human guide readable. Theme-local `AGENTS.md` supplements the global specification with facts unique to that particular theme.

## 11. Missing strong fields and taxonomy

Two required additions: `apiVersion` and `compatibility.tovu`. `theme.version` identifies a theme release; it cannot tell a loader which package contract the release uses or whether the theme supports the installed Tovu version. `apiVersion` is legitimate forward compatibility, not a patch for today's tier disagreement. `$schema` helps editors, while `apiVersion` drives runtime validation.

The live theme README also documents Handlebars as a separate loader tier and a declared-but-unimplemented `code` value. I would normalize that taxonomy now: Handlebars becomes `tier: "templated"` plus `renderer.adapter: "handlebars@1"`; the ambiguous `code` value becomes `tier: "component"` plus a concrete adapter such as `react@1`.

Finally, schema validation should reject path traversal, absolute paths, symlinks escaping the package, unknown manifest fields, undeclared renderer entries, mismatched file extensions, forbidden tier content, and committed build-output directories. That validation is what turns the proposed tree from documentation into an enforceable package contract.


### Gemini 3.7 Flash (gemini-3.7-flash-high) — Round 1 position

ACK_PACKET_RECEIVED tovu-theme-invariant-structure -- I received the packet and will work on it.

---

# Independent Consensus Proposal: Tovu Unified Theme Invariant Specification (TUTIS)

## Executive Summary & Architectural Philosophy

Tovu’s challenge is unifying three existing build-free tiers (`static`, `templated`, `declarative`) and one future build-required tier (`component-framework`), while establishing clean boundaries between **runtime client-side assets**, **published-site AI capabilities (WebMCP / agent handles)**, and **dev-time AI coding agent instructions**.

### Core Tenets of this Proposal:
1. **Strict Separation of Concerns:** Top-level directories must represent semantic responsibilities (`templates/`, `css/`, `assets/`, `scripts/`, `ai/`, `locales/`, `tests/`), not tier-specific implementation quirks.
2. **Zero-Build Parity for Tier 1–3, Isolated Compilation for Tier 4:** The authoring folder contains strictly author source code. Build artifacts (`dist/`, `.cache/`) are platform-managed and **never** exist in the theme author workspace.
3. **Dual AI Surface Separation:**
   - `ai/` = **Runtime / Published Site**: Semantic element handles, MCP tool manifests, and scoring/eval hooks.
   - `AGENTS.md` + `tests/` = **Dev-Time Maintenance**: Theme conversion rules, token mapping constraints, and golden rendering fixtures for AI coding agents.

---

## 1. Unified Invariant Folder Tree

The directory layout below is 100% invariant across all 4 tiers. Directories marked `[optional]` may be omitted if the theme does not utilize that feature, but when present, their internal structure and naming are strictly standardized.

```
<theme-id>/
├── theme.json                     # Canonical manifest (validated against JSON Schema)
├── tokens.json                    # Base design tokens (CSS variables / theme tokens)
├── tokens.<mode>.json             # [optional] Mode overrides (e.g. tokens.light.json, tokens.dark.json)
├── AGENTS.md                      # [optional] Dev-time AI coding agent instructions & conversion notes
│
├── assets/                        # Unified static media & marketplace assets
│   ├── previews/                  # Marketplace browsing previews
│   │   ├── card.webp              # [REQUIRED] 1200x800 primary marketplace card thumbnail
│   │   └── gallery/               # [optional] Additional screenshots/demos
│   │       ├── 01-home.webp
│   │       └── 02-mobile.webp
│   ├── images/                    # Theme runtime images / illustrations / icons
│   ├── fonts/                     # Self-hosted web fonts (.woff2)
│   ├── video/                     # [optional] Runtime video media
│   └── audio/                     # [optional] Runtime audio media
│
├── templates/                     # Structural render source (Invariant view root)
│   ├── pages/                     # Full page routes (e.g. index, about, pricing)
│   ├── layouts/                   # [optional] Page shells / wrapping layouts
│   └── partials/                  # Reusable components / slots (e.g. nav, footer, card)
│
├── css/                           # Stylesheet layer
│   ├── theme.css                  # [REQUIRED] Single invariant CSS entrypoint
│   └── vendor/                    # [optional] Vendored third-party stylesheets
│
├── scripts/                       # [optional] Runtime client browser scripts (Progressive enhancement)
│   ├── main.js                    # First-party client logic (theme toggles, drawers)
│   └── vendor/                    # Vendored third-party runtime JS (e.g., motion.js, lenis.js)
│       └── vendor-name.js
│
├── ai/                            # [optional] Published-site AI & WebMCP capabilities
│   ├── capabilities.json          # High-level AI surface configuration & tool access flags
│   ├── elements.json              # Mapping of data-agent-element handles to semantics & actions
│   ├── tools.json                 # Declarative MCP tool declarations exposed to browsing agents
│   └── scoring.json               # Evaluation metrics, conversion paths, and accessibility hooks
│
├── locales/                       # [optional] Theme-owned i18n localization strings
│   ├── en.json                    # Default locale
│   └── es.json
│
└── tests/                         # [optional] Dev-time validation & golden rendering fixtures
    ├── fixtures/                  # Mock page data, site configs, collection items
    │   └── site-context.json
    └── golden/                    # Expected DOM / HTML snapshots for agent reconciliation
        ├── index.snap.html
        └── nav.snap.html
```

---

## 2. Universal `theme.json` Specification

### Canonical JSON Schema Sketch

```json
{
  "$schema": "https://tovu.dev/schemas/v1/theme.json",
  "id": "modern-storefront",
  "name": "Modern Storefront",
  "version": "1.0.0",
  "tier": "templated",
  "description": "High-performance editorial e-commerce theme for Tovu.",
  "metadata": {
    "author": {
      "name": "Design Systems Lab",
      "url": "https://designsystems.lab",
      "email": "themes@designsystems.lab"
    },
    "license": "MIT",
    "attribution": [
      {
        "name": "Wearix Framer Template",
        "author": "Original Creator",
        "url": "https://example.com/wearix",
        "notes": "Converted for Tovu under free redistribution rights"
      }
    ],
    "category": "e-commerce",
    "tags": ["minimal", "fashion", "storefront", "editorial"],
    "repository": "https://github.com/tovu-themes/modern-storefront"
  },
  "compatibility": {
    "engine": "^1.0.0",
    "componentFramework": null
  },
  "styling": {
    "entry": "css/theme.css",
    "tokens": {
      "default": "tokens.json",
      "modes": {
        "light": "tokens.light.json",
        "dark": "tokens.dark.json"
      }
    },
    "fonts": [
      {
        "family": "Geist",
        "weights": [400, 500, 700],
        "source": "assets/fonts/Geist.woff2"
      }
    ]
  },
  "rendering": {
    "pages": {
      "index": "templates/pages/index.liquid",
      "about": "templates/pages/about.liquid",
      "pricing": "templates/pages/pricing.liquid"
    },
    "layouts": {
      "default": "templates/layouts/page-shell.liquid"
    },
    "slots": {
      "nav": {
        "source": "templates/partials/nav.liquid",
        "honorsCurrentPage": true
      },
      "footer": {
        "source": "templates/partials/footer.liquid",
        "variants": {
          "minimal": "templates/partials/footer-minimal.liquid"
        }
      }
    }
  },
  "scripts": {
    "entry": "scripts/main.js",
    "type": "module"
  },
  "ai": {
    "enabled": true,
    "handles": "ai/elements.json",
    "tools": "ai/tools.json",
    "scoring": "ai/scoring.json"
  },
  "i18n": {
    "defaultLocale": "en",
    "locales": ["en", "es"]
  }
}
```

---

## 3. Minimal Valid Manifests by Tier

### Tier 1: `static`
```json
{
  "$schema": "https://tovu.dev/schemas/v1/theme.json",
  "id": "basic-static",
  "name": "Basic Static",
  "version": "1.0.0",
  "tier": "static",
  "description": "Hand-crafted HTML/CSS static theme",
  "metadata": { "license": "MIT", "category": "portfolio" },
  "styling": { "entry": "css/theme.css" },
  "rendering": {
    "pages": {
      "index": "templates/pages/index.html",
      "about": "templates/pages/about.html"
    },
    "slots": {
      "nav": { "source": "templates/partials/nav.html" },
      "footer": { "source": "templates/partials/footer.html" }
    }
  }
}
```

### Tier 2: `templated`
```json
{
  "$schema": "https://tovu.dev/schemas/v1/theme.json",
  "id": "editorial-liquid",
  "name": "Editorial Liquid",
  "version": "1.0.0",
  "tier": "templated",
  "description": "Liquid-based blog theme",
  "metadata": { "license": "MIT", "category": "blog" },
  "styling": { "entry": "css/theme.css" },
  "rendering": {
    "pages": {
      "index": "templates/pages/index.liquid",
      "post": "templates/pages/post.liquid"
    },
    "slots": {
      "nav": { "source": "templates/partials/nav.liquid" }
    }
  }
}
```

### Tier 3: `declarative`
```json
{
  "$schema": "https://tovu.dev/schemas/v1/theme.json",
  "id": "secure-blocks",
  "name": "Secure Blocks",
  "version": "1.0.0",
  "tier": "declarative",
  "description": "Zero-JS, zero-raw-HTML declarative block theme",
  "metadata": { "license": "Apache-2.0", "category": "business" },
  "styling": { "entry": "css/theme.css" },
  "rendering": {
    "pages": {
      "index": "templates/pages/index.json",
      "contact": "templates/pages/contact.json"
    },
    "slots": {
      "nav": { "source": "templates/partials/nav.json" }
    }
  }
}
```

### Tier 4: `component-framework` (Future React / Vue / Astro / Svelte)
```json
{
  "$schema": "https://tovu.dev/schemas/v1/theme.json",
  "id": "react-saas",
  "name": "React SaaS",
  "version": "1.0.0",
  "tier": "component-framework",
  "description": "React-based dynamic application theme",
  "metadata": { "license": "MIT", "category": "saas" },
  "compatibility": {
    "engine": "^1.0.0",
    "componentFramework": {
      "framework": "react",
      "version": "^19.0.0"
    }
  },
  "styling": { "entry": "css/theme.css" },
  "rendering": {
    "pages": {
      "index": "templates/pages/index.tsx",
      "dashboard": "templates/pages/dashboard.tsx"
    },
    "slots": {
      "nav": { "source": "templates/partials/nav.tsx" },
      "footer": { "source": "templates/partials/footer.tsx" }
    }
  }
}
```

---

## 4. Comprehensive Responses to the 11 Debate Questions

### 1. Render-Layer Source Folder Name: `templates/` vs `src/`
* **Decision:** Standardize on **`templates/`** (subdivided into `pages/`, `layouts/`, `partials/`).
* **Reasoning:**
  - `templates/` is already the established pattern in 2 of the 3 existing tiers (`templated` and `declarative`).
  - Calling it `src/` introduces cognitive confusion: in the modern JavaScript ecosystem, developers expect `src/` to be the root containing everything (CSS, TS, utilities, assets, components). If `css/`, `scripts/`, and `assets/` remain top-level sibling directories, a top-level `src/` that only contains markup/components is a misnomer.
  - Tovu is a website builder. Across all four tiers—whether the view format is `.html` (static), `.liquid` (templated), `.json` (declarative AST), or `.tsx`/`.svelte`/`.astro` (component-framework)—what the author writes are **templates** that bind site context, CMS data, and layout slots into rendered DOM.
  - Subdividing into `templates/pages/` and `templates/partials/` gives an invariant structural home for full views vs reusable slots across every tier.

---

### 2. CSS Organization: `css/theme.css` vs `css/` Folder vs Root `styles.css`
* **Decision:** Standardize on **`css/theme.css`** as the single required invariant entrypoint inside a `css/` directory.
* **Reasoning:**
  - A root `styles.css` file pollutes the top-level directory and immediately breaks down when a theme author needs modular styling (e.g. `typography.css`, `tokens.css`, `components.css`, or vendored stylesheets).
  - A bare `css/` folder without an invariant entrypoint filename forces the Tovu runtime to guess file loading order or require complex globbing rules in `theme.json`.
  - `css/theme.css` provides a deterministic primary entrypoint. Theme authors can use `@import` or bundler imports to link to sibling files (`css/animations.css`, `css/vendor/reset.css`), keeping the top-level clean and uniform across all tiers.

---

### 3. Separation of `scripts/` vs Render-Source: Generalization to Component Frameworks
* **Decision:** Retain an optional top-level **`scripts/`** folder for standalone, non-component browser progressive enhancement.
* **Tier-by-Tier Generalization:**
  - **`static` & `templated`**: First-party progressive enhancement (theme toggles, mobile drawers) lives in `scripts/main.js`.
  - **`declarative`**: Strictly forbids executable scripts. If `scripts/` exists, linting/validation errors with `ERR_DECLARATIVE_SCRIPTS_FORBIDDEN`.
  - **`component-framework`**: Interactive component logic is compiled directly from the component source in `templates/` (e.g., `templates/pages/index.tsx`). However, the `scripts/` directory remains available for unbundled/isolated client scripts (e.g., standalone analytics bridges, third-party tracking scripts, or raw canvas animations) that should bypass component bundling. If none are needed, `scripts/` is simply omitted.

---

### 4. Build Output (`dist/`) in Author Folder & Marketplace Security
* **Decision:** Build output (`dist/`, `.cache/`, `build/`) must **NEVER** live inside the theme author’s repository/folder.
* **Reasoning:**
  - **Supply-Chain Security:** When third-party authors submit themes to the Tovu Marketplace, allowing pre-built `dist/` bundles creates a severe attack vector. A malicious actor could write benign-looking React source in `templates/` while shipping an obfuscated crypto-drainer or session stealer inside `dist/bundle.js`.
  - **Enforced Hermetic Sandboxing:** The platform build engine must compile untrusted component-framework source in an isolated, ephemeral sandbox container. The build artifact is generated platform-side and deployed to the CDN/edge runtime directly, never committed by the author.
  - **Source Purity & Invariance:** Tiers 1–3 are zero-build and completely transparent. Mandating that `dist/` is never an author artifact guarantees that `theme-id/` is strictly a pure *source repository* across all 4 tiers.

---

### 5. Published-Site `ai/` Capability Surface Design
* **Decision:** Introduce a structured `ai/` folder dedicated to **published-site agent operability, WebMCP tooling, and scoring**.
* **Folder Layout:**
  ```
  ai/
  ├── capabilities.json    # Feature flags & agent permissions (default-deny)
  ├── elements.json        # Published DOM handles & interaction semantics
  ├── tools.json           # Declarative MCP tool definitions for browsing agents
  └── scoring.json         # Evaluation metrics, conversion objectives, accessibility targets
  ```
* **Integration with Existing Codebase Precedents:**
  1. **Admin `agentHandle()` / `data-agent-element` Alignment:**
     Themes mark operable DOM elements using the exact attribute standard established in `apps/admin`: `data-agent-element="<handle>"`.
     `ai/elements.json` documents and types these handles for visiting agents:
     ```json
     {
       "commerce.add_to_cart": {
         "description": "Adds the current product to the cart",
         "role": "button",
         "affordance": "click",
         "requiredContext": ["product.id", "variant.id"]
       },
       "search.trigger": {
         "description": "Opens global search modal",
         "role": "button",
         "affordance": "click"
       }
     }
     ```
  2. **Site-Side Capability Registry Alignment (`src/assistant/site/capability-registry.ts`):**
     The theme’s `ai/tools.json` provides metadata to translate high-level browsing agent requests (WebMCP) into permitted capability invocations. The host runtime verifies every tool against the site’s default-deny registry:
     ```json
     {
       "tools": [
         {
           "name": "filter_products",
           "description": "Filters catalog by category and price range",
           "parameters": {
             "type": "object",
             "properties": {
               "category": { "type": "string" },
               "maxPrice": { "type": "number" }
             }
           },
           "execution": "declarative",
           "capabilityRef": "catalog_filter"
         }
       ]
     }
     ```
  3. **Scoring & Evaluation (`ai/scoring.json`):**
     Enables headless evaluation agents (and marketplace quality scanners) to grade how well an AI assistant or browsing agent can navigate and complete tasks (e.g., checkout completion, newsletter signup, search accuracy) within the theme.

---

### 6. Generalization of the Slot / Partial Mechanism Across All 4 Tiers
* **Precedent:** In the static tier, markers use `data-embed-config='{"type":"partial","id":"nav"}'`, parsed by `substituteMarkers` (`src/core/embeds/marker`).
* **Universal Model:** A "slot" is a contract declared in `theme.json` under `rendering.slots.<slotId>` with a default partial file located in `templates/partials/<slotId>.<ext>`.
* **Cross-Tier Implementation:**
  - **`static`**: HTML markup includes `data-embed-config='{"type":"partial","id":"nav"}'`. The Tovu compiler replaces this node with `templates/partials/nav.html`.
  - **`templated`**: Liquid templates write `{% slot 'nav' %}` or `{% render 'partials/nav' %}`, which Tovu’s Liquid tag handler resolves to `templates/partials/nav.liquid`.
  - **`declarative`**: JSON block trees reference `{ "type": "slot", "slotId": "nav" }`, resolved to `templates/partials/nav.json`.
  - **`component-framework`**: JSX/Svelte components import and render a standard SDK primitive `<Slot name="nav" fallback={<DefaultNav />} />`, resolving to `templates/partials/nav.tsx`.

---

### 7. Structured Metadata (`license`, `attribution`, `category`, `tags`) in `theme.json`
* **Decision:** Replace free-text `NOTICE.md` files and overloaded `author` strings with a strict, top-level `metadata` block in `theme.json`.
* **Field Definitions:**
  - `metadata.author`: Object containing `{ "name": "...", "url": "...", "email": "..." }`.
  - `metadata.license`: SPDX license identifier string (e.g., `"MIT"`, `"Apache-2.0"`, `"GPL-3.0"`, `"Proprietary"`).
  - `metadata.attribution`: Array of provenance records `{ "name", "author", "url", "notes" }` for legal tracking of converted/imported themes (e.g., Framer/Webflow conversions).
  - `metadata.category`: Canonical marketplace taxonomy string (e.g., `"e-commerce"`, `"blog"`, `"portfolio"`, `"saas"`, `"agency"`).
  - `metadata.tags`: Array of discovery keywords (`["dark-mode", "minimal", "editorial"]`).
* **Benefit:** Enables automated marketplace categorization, automated license compliance scanning, and machine-readable provenance.

---

### 8. First-Party vs Vendored Third-Party Scripts & Assets
* **Decision:** Standardize on dedicated `vendor/` subdirectories inside `scripts/` (`scripts/vendor/`) and `css/` (`css/vendor/`).
* **Reasoning:**
  - **Self-Hosting Guarantee:** Storing vendored libraries (e.g., `scripts/vendor/motion.js`) locally inside the theme guarantees offline-safe rendering and zero reliance on external CDNs.
  - **Tooling & Agent Boundary:** AI coding agents, linters, and formatters must be instructed to treat `*/vendor/**` as immutable/read-only code. Placing vendored files in dedicated subdirectories allows standard `.gitignore`, `.prettierignore`, and AI agent glob filters to exclude them automatically while keeping first-party `scripts/main.js` and `css/theme.css` clean.

---

### 9. Dev-Time Agent Support (`AGENTS.md` + `tests/`)
* **Decision:** Separate dev-time coding agent configuration from runtime site capabilities.
* **Layout & Responsibilities:**
  - **`AGENTS.md` (Theme Root):**
    - The universal industry convention for coding agents (Claude Code, Cursor, Copilot CLI, Gemini CLI).
    - Contains theme-specific rules: token mapping invariants, slot substitution constraints, instructions never to touch `scripts/vendor/`, and tier conversion instructions.
  - **`tests/` Directory:**
    - `tests/fixtures/site-context.json`: Standard mock data simulating Tovu site context (pages, site name, CMS collections, navigation tree).
    - `tests/golden/*.snap.html`: Golden DOM snapshot fixtures. When a coding agent converts a theme (e.g., from `static` to `templated` or `component-framework`), running the test harness renders the theme against the fixture and verifies that the output DOM matches the golden snapshot without regressions.

---

### 10. Documentation Strategy: Human Guide vs Agent Spec (One Document or Two?)
* **Decision:** Produce **TWO** distinct deliverables generated from a single shared JSON Schema source of truth.
* **Structure & Scope:**
  1. **`THEME_AUTHORING_GUIDE.md` (Human-Facing Tutorial & Handbook):**
     - Explains visual design workflows, token authoring philosophy, CSS best practices, step-by-step guides for each tier, screenshot creation guidelines, and troubleshooting.
     - Formatted with narrative explanations, visual diagrams, and practical examples.
  2. **`THEME_SPEC.json` / `THEME_SPEC.md` (Machine-Facing Formal Specification):**
     - Contains strict JSON Schema definitions, AST node structures, regex patterns, invariant exit codes, exact error definitions (`ERR_INVALID_SLOT_REF`, `ERR_DIST_FOLDER_PROHIBITED`), and deterministic conversion algorithms.
     - Optimized for zero ambiguity when ingested by AI coding agents.

---

### 11. Missing Fields & Enhancements Added to TUTIS

To make the invariant specification truly robust and future-proof, TUTIS adds five critical elements not explicitly addressed in the initial prompt or candidate proposal:

1. **Top-Level `$schema` URI:**
   Every `theme.json` must declare `"$schema": "https://tovu.dev/schemas/v1/theme.json"`. This provides instant IDE autocompletion, real-time linting, and automated validation in agent workflows.
2. **Strict `compatibility` Block:**
   ```json
   "compatibility": {
     "engine": "^1.0.0",
     "componentFramework": { "framework": "react", "version": "^19.0.0" }
   }
   ```
   Prevents version mismatch bugs across breaking engine updates and explicitly binds component-framework themes to their compiler requirements.
3. **Structured `styling.fonts` Array:**
   Moves typography from loose string arrays (e.g. `"Geist:wght@400;500"`) into structured objects mapping font families, weights, and local font asset paths (`assets/fonts/*.woff2`), enforcing complete offline-readiness.
4. **Structured `i18n` Locales Mapping:**
   Declares default and supported locales (`locales/en.json`, `locales/es.json`), ensuring internationalized themes work consistently across all 4 tiers.
5. **Standardized Preview Asset Contract:**
   Requires `assets/previews/card.webp` (1200x800) for marketplace cards, eliminating broken thumbnail renderings across the platform.

---

## 5. Summary Matrix: Invariant Structure Across All 4 Tiers

| Surface | Static | Templated | Declarative | Component-Framework |
| :--- | :--- | :--- | :--- | :--- |
| **`templates/` format** | `.html` | `.liquid` | `.json` (blocks) | `.tsx` / `.vue` / `.svelte` |
| **`css/theme.css`** | Required | Required | Required | Required |
| **`scripts/` allowed** | Yes (`.js`) | Yes (`.js`) | **No (Forbidden)** | Yes (Optional / unbundled) |
| **Build output (`dist/`)** | None | None | None | **Platform-managed only (Forbidden in repo)** |
| **`assets/` structure** | Invariant | Invariant | Invariant | Invariant |
| **`ai/` capabilities** | Supported | Supported | Supported | Supported |
| **`AGENTS.md` + `tests/`** | Supported | Supported | Supported | Supported |


### Gemini 3.1 Pro (gemini-3.1-pro-high) — Round 1 position

ACK_PACKET_RECEIVED tovu-theme-invariant-structure -- I received the packet and will work on it.

Here is my independent proposal for Tovu's invariant theme structure, designed to cleanly span the existing build-free tiers and the future component-framework tier, while rigorously defining the new AI capability surfaces.

### The Invariant Folder Tree

```text
theme-id/
├── theme.json
├── tokens.json
├── tokens.light.json
├── assets/
│   ├── previews/                 # Marketplace thumbnails (e.g., card.webp, gallery images)
│   ├── images/                   # Theme-used images
│   ├── video/                    # Theme-used video
│   └── audio/                    # Theme-used audio
├── css/
│   └── theme.css                 # The single required CSS entry point
├── src/                          # Render-layer source (HTML, Liquid, JSON trees, or Components)
├── scripts/                      # First-party supplementary browser scripts
│   └── vendor/                   # Vendored third-party libraries (e.g., motion.js)
├── ai/
│   ├── capabilities.json         # Runtime: WebMCP/tool-call capability declarations
│   ├── elements.json             # Runtime: Metadata/scoring for data-agent-element handles
│   └── instructions.md           # Dev-time: Instructions/gotchas for AI coding agents
├── tests/
│   └── fixtures/                 # Dev-time: Golden DOM snapshots or visual regression refs
└── locales/                      # Optional UI localization strings
```

### The Invariant `theme.json` Manifest Sketch

```json
{
  "$schema": "https://schemas.tovu.com/theme/v1.json",
  "tovuCompat": ">=1.4.0",
  "id": "theme-id",
  "name": "Theme Name",
  "version": "1.0.0",
  "tier": "static",
  
  "author": { "name": "Studio Tovu", "url": "https://tovu.com" },
  "license": "MIT",
  "category": "e-commerce",
  "tags": ["modern", "minimal", "dark-first"],
  "description": "A robust, invariant theme template.",
  
  "modes": ["dark", "light"],
  "defaultMode": "dark",
  "fonts": ["Geist:wght@400;500"],
  
  "entrypoints": {
    "pages": ["index", "about", "pricing", "blog-post"],
    "slots": {
      "nav": { "source": "nav", "honorsCurrentPage": true },
      "footer": { "source": "footer", "variants": { "minimal": "footer-minimal" } }
    }
  }
}
```

---

### Responses to the 11 Debate Points

**1. What should the render-layer source folder be called, and why?**
It must be **`src/`** (agreeing with the candidate). The name `templates/` fundamentally implies a string-replacement paradigm (HTML/Liquid). When Tovu introduces the component-framework tier (React/Svelte), the render layer will consist of functional components with distinct lifecycles, not templates. `src/` is the universal, framework-agnostic convention for "code that produces the output," effectively communicating that this folder is the heart of the theme regardless of tier.

**2. `css/theme.css` vs a `css/` folder vs a root `styles.css`?**
I propose **`css/theme.css`** as the invariant. A single root `styles.css` becomes unmanageable as themes grow in complexity. Providing a `css/` folder with `theme.css` as the strict entry point allows authors to organize their CSS into partials (e.g., `css/base.css`, `css/components/`) via standard `@import` rules in the build-free tiers, and provides a clear hook for future bundling in the component-framework tier. 

**3. Should there be a `scripts/` folder distinct from the render-source folder?**
Yes. In the `static`, `templated`, and `declarative` tiers, `scripts/` serves as the progressive-enhancement layer. By keeping it separate from `src/`, Tovu enforces the boundary between *what* is rendered and *how* it behaves. In the future component-framework tier, where component source *is* the interactive layer, the `scripts/` folder simply remains empty, or is reserved strictly for framework-agnostic globals (like analytics trackers or Web Worker registrations).

**4. Does build output (`dist/`) ever belong inside a theme's own author folder?**
**Absolutely never.** The marketplace will eventually build untrusted third-party theme source. If `dist/` lives in the author folder, a malicious author could commit benign `src/` files to pass human/AI audits, but commit a malicious bundle to `dist/`. The host platform must be the sole owner of the build process. Build artifacts should be written to a platform-managed cache (e.g., `.tovu/dist/` or external cloud storage) that is ignored by the theme's own version control.

**5. Design the `ai/` folder concept (Runtime capabilities):**
The `ai/` folder should formalize the contract between the theme and site-level AI agents.
* **`ai/elements.json`**: Acts as a dictionary for the `data-agent-element` handles emitted in the theme's markup. It provides semantic descriptions of what each handle does ("add-to-cart", "open-mobile-menu") and can include evaluation hooks (e.g., scoring weights for agent success metrics). This maps the theme's DOM directly to the agent's understanding.
* **`ai/capabilities.json`**: Defines declarative overrides or specific tool-call metadata that plug into the site's `capability-registry.ts`. If the site assistant needs to know how to execute `page.add_to_cart` specifically for this theme, this JSON file provides the schema and the required `data-agent-element` target.
This avoids polluting `theme.json` with dense, agent-specific schema logic and perfectly paves the way for the future WebMCP adapter to translate these JSON definitions into MCP tools.

**6. Generalizing the slot/partial mechanism:**
The invariant is the **logical Slot ID**, not the underlying file format. The `theme.json` defines the available slots (e.g., `nav`). 
* In `static`/`templated`, the theme uses the existing marker: `<div data-embed-config='{"type":"partial", "id":"nav"}'></div>`.
* In `declarative`, the JSON tree references it natively: `{ "type": "slot", "id": "nav" }`.
* In the `component-framework` tier, the host provides a native component wrapper: `<TovuSlot id="nav" />`.
The host renderer resolves the `id` against `theme.json` and injects the corresponding `src/` file, preserving the exact same architectural contract across all four tiers.

**7. Should the invariant shape include structured license/attribution/category fields?**
Yes. Relying on unstructured `NOTICE.md` files or prose within an `author` field breaks machine readability. `license`, `author` (as an object), `category`, and `tags` must be top-level fields in `theme.json`. This is critical for marketplace discovery, automated legal compliance checks, and rendering standardized attribution UI in the Tovu admin dashboard.

**8. First-party vs. third-party scripts:**
They must have distinguished locations: **`scripts/`** for first-party logic, and **`scripts/vendor/`** for self-hosted third-party libraries. This is a crucial trust-model distinction. When an AI coding agent or a platform security scanner reviews a theme, it needs to quickly exclude audited, immutable vendor libraries (like `motion.js`) from its analysis, focusing purely on the author's custom logic. 

**9. Design the dev-time agent support (fixtures & instructions):**
Dev-time support lives adjacent to the runtime AI configs to keep all machine-readable context localized.
* **`ai/instructions.md`**: A theme-scoped markdown file explicitly for coding agents (like Claude Code). It contains constraints ("Do not touch `src/nav.html`, it is dynamically regenerated"), token mapping philosophies, and migration notes.
* **`tests/fixtures/`**: Contains "golden" DOM snapshots or JSON state dumps. A coding agent reconciling a CSS update can use these fixtures to verify that the render output still perfectly matches the golden state, establishing a zero-regression baseline before committing.

**10. Should the human-facing guide and agent-facing spec be one document or two?**
They must be **two separate documents**.
* **The Human Guide**: Needs narrative, design philosophy, examples of "why" a tier behaves a certain way, and marketplace publishing tutorials.
* **The Agent Spec**: Needs a rigid JSON Schema definition, exact AST requirements for the declarative tier, an exhaustive list of constraints (e.g., "NEVER include `<script src>` in static html"), and edge-case behaviors. Combining them dilutes the strictness required by agents and overwhelms humans with schema technicalities.

**11. Is there a strong option missing?**
Yes. **`$schema`** and **`tovuCompat`**.
By requiring `"$schema": "https://schemas.tovu.com/theme/v1.json"` at the top of `theme.json`, you immediately empower AI coding agents and human IDEs with auto-complete, validation, and instantaneous understanding of the manifest structure without needing to read the documentation first.
Furthermore, a `tovuCompat` string (e.g., `">=1.4.0"`) is vital. As Tovu evolves the capability registry or introduces the component-framework tier, themes must be able to declare which version of the host platform they require, preventing catastrophic runtime failures during gradual migrations.


---

## What to do now

Give your Round 2 answer covering, explicitly:

1. **Current position** on each of the 4 lettered disagreements (A–D) above — state it plainly, don't bury it in prose.
2. **Whether your position changed** from Round 1, and specifically which other participant's argument (not just "the group") moved you, if any.
3. **The strongest argument against your current position** — steelman the side you disagree with.
4. **What evidence or assumption change would move you further.**
5. A final **ranked solution slate**: at least 2 real options for the render-folder-name question (A) specifically, since that's the widest split, with explicit ranking criteria, trade-offs per option, and a recommendation — this is the Solution Slate Protocol, required from Round 2 onward.
6. Incorporate the new ground truth above (5-value `ThemeTier`, wired `slots`/`modes`, 6-type embed system, `regions` field, `theme_write_file` hot-reload) into your final proposal where relevant — especially question 11 (missing pieces), which should now account for `regions`.

This is very likely the final round. Give your most complete, most defensible answer — back your leading recommendation with concrete sample code/pseudocode, not prose alone.
