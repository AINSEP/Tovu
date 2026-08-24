# Fable (claude-fable-5, added in-host subagent) — Round 2 answer

ACK_PACKET_RECEIVED tovu-theme-invariant-structure-round2 -- I received the packet and will work on it.

# Fable — Round 2 position

Headline: **I change my position on A and B, and hold on C and D.** A: `src/` → `render/`, moved by Codex's false-affordance argument (and an observation of my own that my Round 1 manifest already betrayed me on this). B: `data-agent-element` → `data-tovu-agent`, moved by the Coordinator's trust-boundary articulation plus a concrete collision surface neither side named. C: `partials` stays my answer, now *strengthened* by the newly disclosed `regions` field. D: root `AGENTS.md` stays my answer; I steelman Pro below and it still loses.

---

## A. Render-source folder name

**Current position: `render/`, with the required `pages/` + `partials/` interior carried over from my Round 1 proposal (plus `components/` permitted in the framework tier).** Changed from `src/`.

**Which argument moved me:** Codex's stray-file/false-affordance point — `src/` makes a promise this layout can't keep. In every ecosystem a framework author comes from, `src/` means "the umbrella for all my code," but here `css/`, `scripts/`, and `assets/` are deliberate top-level siblings. The name imports exactly the wrong muscle memory. What sealed it is noticing my own Round 1 answer already conceded the point without realizing it: my manifest's one tier-discriminated block was already named `render`, and my best argument for `src/` — "even static markup is input to a transform, nothing ships verbatim" — is the *definition of rendering*, not of "source." My argument was for `render/` all along; I just attached it to the wrong name. Folder `render/` + manifest block `render` + rule "everything the renderer interprets lives here" is one word meaning one thing — the same one-word-one-meaning discipline I demanded for slots/partials in my own #6.

**Steelman against `render/`:** nobody uses it. The framework tier is where third-party authors will actually live, and every scaffold, tutorial, and habit there says `src/`. Authors will recreate `src/` by reflex, and `render/` adds a Tovu-ism to learn. My response: the same reflex is precisely what would pollute `src/` with non-render files under option 2; a validator error saying "render-layer files live in render/" is cheap and instructive, while `src/`'s wrong expectations produce silent misplacement no validator can fully define; and `tovu theme create` scaffolding neutralizes most of the habit cost at zero marginal price.

**What would move me further:** evidence that framework-tier toolchains (Vite plugins, Angular CLI constraints, Qwik's optimizer) hard-assume a `src/` root in ways that cost real adapter complexity to remap. If the component-tier prototype hits that, `src/` (option 2) is the fallback and everything else in my proposal survives the rename untouched.

### Solution slate (Round-2 protocol, question A)

Ranking criteria: (1) validator-checkability of the folder's contract; (2) truthfulness of the name across all 4 tiers; (3) author-expectation fit, weighted toward the framework tier where third parties concentrate; (4) documentation precision for the article series; (5) migration cost from today's tree.

**Rank 1 — `render/` + required `pages/`/`partials/` interior (recommended).**
Contract: "every file the tier's renderer interprets lives here; nothing else does." Scores top on (1), (2), (4). Weakest on (3) — unfamiliar — mitigated by scaffolding and a precise validator message. Migration (5): identical cost to option 2 (both are a folder rename from today's `pages`/`templates`).
```
render/
├── pages/        # index.html | product.liquid | home.json | Home.tsx
├── partials/     # nav.html … Nav.tsx — the theme-supplied embed implementations
└── components/   # framework tier only: non-page, non-partial compiled units
```

**Rank 2 — `src/` + the same required interior.**
Wins (3) outright; loses (2) and (4): the name asserts "all source" while css/scripts/assets live outside it, so the article must spend paragraphs un-teaching what the name teaches. Acceptable fallback; everything else in this proposal is name-independent.

**Rank 3 — `templates/` + `pages/`/`layouts/`/`partials/` (Flash's).**
Fails (2) hard: static pages are complete documents, not templates; framework components are not templates. Flash's best point — "everything binds site data into DOM, hence template" — proves the files are *render source*, which is option 1's name, not this one. Its `layouts/` subdivision is worth keeping as an *optional* third interior folder for tiers that have shells (static/basic's `page-shell.html` today); I fold that into ranks 1 and 2 rather than treating it as unique to this option.

---

## B. Agent-handle attribute name in theme markup

**Current position: a distinct `data-tovu-agent` attribute for published-site theme markup; `data-agent-element` stays admin-only. Shared handle *grammar* (same validation code, exported once from `@jini-ai/agentic`), distinct *namestring*.** Changed from reuse.

**Which argument moved me:** the Coordinator's formulation — "same attribute, so same trust level" is a reasoning error the shared name actively invites across a real privilege boundary (trusted, authenticated, single-tenant admin vs. visitor-facing, multi-tenant, eventually untrusted-third-party markup). What converted me from "plausible concern" to "concede" is a concrete collision surface neither side spelled out: **the admin previews published pages.** The moment a theme-rendered page appears inside or adjacent to the admin surface (preview iframe, inline preview render), any admin-layer tooling that resolves `[data-agent-element="…"]` can now match handles *authored by an untrusted theme* — a confused-deputy shape where marketplace markup names itself into the admin's operable namespace. Distinct attribute names make that entire bug class unexpressible: no selector for one surface can ever match the other. Against that, the entire benefit of name reuse was one shared string constant — the resolver logic and grammar are shared either way. Near-zero cost, structural elimination of a vulnerability class. I was wrong; my Round 1 "one resolver serves both layers" underpriced the boundary.

**Steelman against my new position:** two attributes fragment the convention — future tooling (a WebMCP adapter, a browser extension, eval harnesses) must know both names, and a theme converted *from* admin-derived components could carry the wrong attribute silently. Response: the validator makes the wrong-attribute case a hard error in theme conformance (`data-agent-element` appearing in theme markup = reject, with a fix-it message), which is exactly the kind of mechanical rule my whole proposal is built on; and adapters already must know which surface they serve — the attribute name split makes that decision explicit instead of ambient.

**What would move me further:** nothing realistic moves me back to full reuse. What could refine the position: if the WebMCP adapter design lands on a per-surface handle *registry* keyed by origin+surface, the attribute name matters less — but even then the distinct name costs nothing and still blocks the preview-surface collision.

Concrete carrier per tier (unchanged from Round 1 except the name):
```html
<!-- static / templated: authored directly -->
<button data-tovu-agent="commerce.add-to-cart">Add to cart</button>
```
```json
// declarative: schema-owned property; renderer emits the attribute — raw HTML stays forbidden
{ "type": "button", "label": "Add to cart", "agentHandle": "commerce.add-to-cart" }
```
```tsx
// framework: host helper emits the validated attribute at build time
<Button {...siteAgentHandle("commerce.add-to-cart")}>Add to cart</Button>
```
`ai/elements.json` remains the semantic catalog (description, kind, pages); markup-without-manifest is inert, manifest-without-markup is a lint warning — default-deny preserved exactly as in Round 1.

---

## C. `slots` vs `partials` in the manifest

**Current position: rename to flat `partials`. Unchanged — and the Round 2 ground truth strengthens it from two directions.**

First, the original argument stands: "slot" collides with Vue/Svelte/Web-Component slots, which insert in the *opposite direction*, and the framework tier is precisely where that collision detonates. Flash and Pro kept `slots` mostly on continuity grounds; but the field is being renamed *inside an owner-confirmed migration* (`tovu theme migrate` rewrites every manifest anyway), so continuity buys one saved line in a migration script against a permanent vocabulary hazard in a public article series.

Second — new — the disclosed `regions` field makes keeping `slots` actively worse: **`regions` already occupies the "insertion point" concept** (places where the host may place widgets). If the schema ships with `slots` = "partial implementations the theme provides" *and* `regions` = "holes the host fills," it contains two fields where the natural reading of each is the other's meaning. The rename resolves the pair into two clean, opposite-direction words: **`partials` = named render units the theme supplies; `regions` = named openings the host fills.** No occurrence of the word "slot" anywhere in the schema, no collision with any framework's slot semantics.

Third, the 6-type embed disclosure confirms the *scope* of the field: of the six embed types (`partial`, `menu`, `widget`, `form`, `media`, `post`), only `partial` resolves to theme-supplied files — the other five resolve to host/CMS-owned content. So the manifest field registers *partial implementations specifically*, which is the strongest possible argument that its name should be `partials`, not a generic composition word. (This is also why I decline Codex's `composition.partials` nesting: there is no second member of `composition`, and the Coordinator's "unjustified structure for a single field" critique is correct.)

**Steelman against:** `slots` is wired and read on a live render path; renaming a functional field is riskier than renaming a dead one. Response: the risk is one mechanical key-rename inside a migration the owner has already committed to, guarded by the `apiVersion` gate (a v1 manifest with `slots` loads under v1 rules; a v2 manifest with `slots` fails validation with a precise message). **What would move me:** discovering that `regions` and `slots` are already coupled in the implementation in a way that makes the rename touch widget placement code — I haven't read `regions`' implementation (it was disclosed, not shown), so I flag that as the one check the synthesis should do before locking this.

---

## D. Dev-time agent guidance location

**Current position: `AGENTS.md` at theme root; `tests/` as a root sibling; neither lives inside `ai/`. Unchanged.**

Steelman of Pro's co-location argument first, honestly: "all machine-readable context in one place" is a real virtue — an agent that finds `ai/` gets runtime handles, tools, *and* its own working instructions in one directory, and the theme root stays less cluttered. It still loses on three grounds:

1. **Discovery bootstrap.** Root `AGENTS.md` is the cross-tool convention (Claude Code, Codex CLI, Cursor, Copilot) — a coding agent handed a theme folder finds it with *zero* Tovu knowledge. `ai/instructions.md` requires already knowing Tovu's layout — but the agent most in need of instructions is exactly the one converting a foreign theme that doesn't know Tovu yet. Co-location optimizes for the agent that already onboarded; the root file optimizes for the one that hasn't.
2. **Trust and lifecycle split.** `ai/` is published-surface metadata — shipped with the installed theme, potentially served to visiting agents. Instructions are dev-time and strippable at install. One folder with two lifecycles means the installer special-cases files *inside* a folder whose whole meaning is "runtime surface." That's the same category error as `dist/` in the author folder, in miniature.
3. **New ground truth cuts my way:** the `theme_write_file` hot-reload tool is the single most useful fact a theme's `AGENTS.md` can carry — "edit via `theme_write_file`; the loaded theme re-validates and hot-reloads per write; no restart; verify with `tovu theme test`." That is pure dev-workflow content with no conceivable meaning to a published-site visiting agent — concrete proof the two audiences don't share a folder.

**What would move me:** an industry shift of the AGENTS.md convention itself into a subdirectory standard. Not currently real.

---

## Round 2 final proposal (full, with new ground truth folded in)

Deltas from my Round 1 tree: `src/` → `render/` (with optional `layouts/` interior adopted from Flash), `css/vendor/` added (Codex, symmetric with `scripts/vendor/`), `ai/elements.json` uses `data-tovu-agent`, `regions` preserved in the manifest, `apiVersion` + optional `$schema` replace my bare `schema` int, `attributions[]` adopts Codex's richer per-item shape, tests adopt Codex's `settle` contract.

```
<theme-id>/                      # folder name MUST equal "id"
├── theme.json
├── tokens.json  /  tokens.<mode>.json
├── AGENTS.md                    # dev-time; strippable at install
├── NOTICE.md                    # optional prose; machine truth lives in theme.json
├── assets/                      # previews/ (card.webp REQUIRED) images/ video/ audio/ fonts/ files/
├── css/
│   ├── theme.css                # REQUIRED all tiers; only file the host loads; rest via @import
│   └── vendor/                  # optional third-party CSS, licensed like scripts/vendor
├── render/                      # REQUIRED — everything the tier's renderer interprets
│   ├── pages/                   #   required interior
│   ├── partials/                #   required interior (theme-supplied embed implementations)
│   ├── layouts/                 #   optional (page shells)
│   └── components/              #   framework tier only
├── scripts/                     # optional; FORBIDDEN in declarative; browser loads verbatim
│   └── vendor/<lib>/            #   pinned, licensed, never hand-edited
├── ai/                          # optional; published-site agent surface; pure JSON, default-deny
│   ├── capabilities.json  ├── elements.json  └── scoring.json
├── tests/
│   ├── cases.json  ├── fixtures/  └── golden/
└── package.json                 # framework tier only; dist/ NEVER exists here (unanimous)
```

Boundary rule, unchanged in substance, renamed: **browser loads it verbatim → `scripts/`; the tier's renderer/build interprets it → `render/`.**

```jsonc
{
  "$schema": "https://tovu.dev/schemas/theme/v2/theme.schema.json",   // editor tooling
  "apiVersion": 2,                          // runtime gate; v1-vs-v2 detection during the migration window
  "id": "basic", "name": "Basic", "version": "0.1.0",
  "tier": "static",                         // static | templated | declarative | framework
  "engine": { "name": "liquid", "version": "1" },   // REQUIRED templated+framework, FORBIDDEN otherwise
  "compatibility": { "tovu": ">=1.0.0" },   // optional; REQUIRED for framework tier
  "description": "…",
  "category": "marketing", "tags": ["saas"],
  "license": { "spdx": "MIT", "noticeFile": "NOTICE.md" },
  "authors": [{ "name": "…", "url": "…" }],
  "attributions": [{ "id": "motion", "name": "Motion", "version": "11.x", "license": "MIT",
                     "source": "https://motion.dev", "files": ["scripts/vendor/motion/**"],
                     "licenseFile": "scripts/vendor/motion/LICENSE" }],
  "provenance": { "convertedFrom": "Wearix (Framer export)", "notes": "…" },
  "tokens": { "defaultMode": "dark",
              "modes": { "dark": "tokens.json", "light": "tokens.light.json" } },
  "fonts": [{ "family": "Geist", "weights": [400,500], "files": ["assets/fonts/geist-var.woff2"] }],
  "render": { /* tier-discriminated; framework: { "toolchain": "vite", "node": ">=20" } */ },
  "partials": {                             // theme-SUPPLIED units (renamed from slots)
    "nav":    { "params": { "current": { "type": "string" } } },
    "footer": { "variants": { "minimal": "render/partials/footer-minimal.html" } }
  },
  "regions": { /* PRESERVED with its existing implemented shape — see note below */ },
  "scripts": { "entries": [
    { "id": "motion", "path": "scripts/vendor/motion/motion.js", "kind": "vendor", "attribution": "motion" },
    { "id": "main",   "path": "scripts/main.js", "kind": "author", "dependsOn": ["motion"] } ] },
  "assets": { "previewGallery": [{ "src": "assets/previews/home.webp", "caption": "Home, dark" }] },
  "ai": { "dir": "ai" }
}
```

**New-ground-truth incorporation, item by item:**

- **5-value `ThemeTier` → 4 role values + `engine`, with `code` explicitly reserved, not absorbed.** My Round 1 tier+engine split survives and sharpens: `handlebars` normalizes to `tier:"templated", engine:"handlebars"`. But **I push back on Codex's #11 normalization of `code` into the component tier** — the Round 2 disclosure says `code` means "trusted signed-plugin JS," which is a *trust model*, not a component framework; conflating them is exactly the mistake point 1 of the new ground truth warns against. My schema ships the 4-value enum and rejects `"code"` with a "reserved for a future trusted-plugin tier" error — no design for an unbuilt trust concept, no silent merge into `framework`.
- **`slots`/`modes`/`defaultMode` are wired** — consistent with my proposal: all three survive (as `partials` + `tokens.defaultMode`/`modes`); `pages` remains the one dead field and is dropped (discovery = files under `render/pages/`, which is already the real behavior).
- **The 6-type embed system upgrades my #6.** The invariant mechanism is the *embed request* — `{type, id, params}`, host-resolved — not a partial-only story. Cross-tier carriers, all six types: static/templated keep `data-embed-config` (one attribute, JSON blob — matching the parser at `src/core/embeds/marker.ts:108`, not the guide's wrong §6 prose); declarative gets an embed node `{ "type": "embed", "embed": { "type": "menu", "id": "main", "variant": "tree" } }`; framework gets one primitive, `<TovuEmbed type="partial" id="nav" current={page.id}/>`, with typed sugar (`<TovuPartial>`, `<TovuMenu>`) over it. Only the `partial` type resolves to theme files (`render/partials/`); the other five resolve to host/CMS content — which is the final nail for naming the manifest field `partials`.
- **`regions` is preserved, not redesigned.** It enters the v2 schema with its *existing implemented shape* — it's built and tested, and this debate has been shown its existence but not its implementation, so redesigning it here would be inference dressed as design. The article documents it (zero adopters is a documentation failure to fix, not a field to drop), and its concept slots cleanly opposite `partials` as argued in C. One synthesis to-do flagged: read its actual shape before freezing the v2 schema file.
- **`theme_write_file` hot-reload** lands in two places: the AGENTS.md template ("edit through `theme_write_file`; per-write re-validate + hot-reload; no restart; then `tovu theme test`") and the test-runner story — fast golden-diff loops against the live loaded theme. Adopting Codex's `settle` contract in `tests/cases.json` (`"settle": { "event": "tovu:ready", "timeoutMs": 3000 }`) — it fixes basic's real, already-documented mid-animation screenshot failure, so it's remediation, not speculation.
- **The guide's documentation discipline is the template for #10:** two artifacts, one source of truth, executed as — JSON Schema + validator (`tovu theme validate`) as the normative spec, and a human guide following the *proven in-repo pattern*: path:line citations, an explicit read-vs-dead field table (which under my no-dead-fields law should be a one-row table with zero dead rows), a gotchas section, a minimal worked example per tier. The validator additionally enforces Codex's hardening list (path traversal, absolute paths, escaping symlinks, unknown fields, undeclared entries, forbidden tier content, committed build output) — that list is what turns the tree from documentation into a contract, and I adopt it wholesale.

**Overall strongest argument against my full position** (required item 3, globally): the shape front-loads a lot of convention (`render/` interior roles, `data-tovu-agent`, `partials` rename, apiVersion gating) onto a system with ten themes and one maintainer — convention-heavy specs can die of ceremony before adoption. My response: every convention above is either enforced by the validator (so it costs authors an error message, not vigilance) or is a rename inside an already-committed migration; nothing requires ongoing discipline to stay true. **What would change my mind furthest** (item 4): real friction data from the first framework-tier theme build — if `render/` or the embed primitive fights the toolchain in practice, those are the two pieces I'd revisit first, and both are isolated renames/wrappers that don't cascade into the rest of the shape.
