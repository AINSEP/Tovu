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
