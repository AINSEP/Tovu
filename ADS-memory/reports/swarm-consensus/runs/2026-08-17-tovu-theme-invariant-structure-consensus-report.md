# Swarm Consensus Report: Tovu Invariant Theme Structure

**Mode:** debate, 2 rounds. **Date:** 2026-08-17. **Slug:** `tovu-theme-invariant-structure`.
**Question:** the one invariant top-level folder + `theme.json` manifest shape across all Tovu theme tiers (static, templated, declarative, and a future component-framework tier), detailed enough to actually build a theme from and to publish as both a human guide and an agent-readable spec.

Context packets: [Round 1](../context/CTX-tovu-theme-invariant-structure-2026-08-17.md), [Round 2](../context/CTX-tovu-theme-invariant-structure-ROUND2-2026-08-17.md).

---

## ⚠️ CORRECTION (post-report, 2026-08-17) — Decisions 5 and 13 below are WRONG, verified against shipped code

Neither round's ground truth included `ADR-020 §5` (shipped 2026-08-12, three days before this debate), which already answers the build/framework-tier question this report gets wrong. Found by an independent Opus 5 subagent review, verified directly against source before accepting:

- **Build provenance is a flag, not a tier.** `theme.json.build: { source: "authored" | "compiled", framework?, sourceDir?, builderVersion?, lockfileHash?, artifactHashes? }` (`src/features/theme/theme.ts:60-93`). `source: "compiled"` is **required to have `tier: "static"`** — enforced in `loadTheme()` (`theme.ts:640-650`). There is no separate `framework`/`component` tier and none is needed: a compiled theme's *runtime* is an ordinary static theme; `build` just records how its output was produced.
- **Tovu never rebuilds anything.** The shipped principle, quoted directly from the code: *"the author or publisher CI builds; Tovu never runs the build."* Trust comes from `artifactHashes` (sha256 per generated file, checked by `checkBuiltThemeConformance()` in `build-conformance.ts`) plus an install-time conformance gate — not a platform sandbox rebuild. This is the **opposite** of Decision 5 below ("no exceptions, any tier, platform always sandboxes-builds").
- **A compiled theme has a real `sourceDir`/generated-tree split**, not a pure-source-only folder: `build.sourceDir` (required for compiled themes) names the author's pre-build source root — everything under it stays per-file editable exactly like an authored theme; everything **outside** it is the generated output (the real `pages/`, `css/`, `js/` a framework's own build produced) and is read-only through per-file surfaces, restored only as one whole release. This directly contradicts the "a theme folder only ever holds source, build output never lives there" framing this whole debate assumed for the not-yet-built tier — for the tier that's actually shipped, build output living in the theme folder (outside `sourceDir`) is exactly the design.
- **Real supporting infrastructure already exists and was unknown to every debate participant:** `build-conformance.ts` (install-time gate: stylesheet sentinel, asset-path checks, `data-tovu-island` empty-content check, symlinks refused), `code-tier-asset-normalizer.ts` (relocates/rewrites a real framework build's output — e.g. verified against real Angular `ng build` and Astro output — into Tovu's asset-path conventions), and `marketplace.ts` (theme catalog, download, lineage — the "marketplace build pipeline" this report's punch list called out-of-scope is already built).
- **A separate, smaller finding:** `src/themes/static/basic/preview/` is real, git-committed, generated output living inside a first-party theme folder today — a working precedent this debate's "no exceptions, any tier" language didn't know about. This is a *different* mechanism from `build.source: "compiled"` (it's dev-tooling preview generation, not framework build provenance) and doesn't need the same resolution, but it's a second data point against an absolute "never" rule.
- **Also found unread/unimplemented in this report's own proposal, worth fixing in the next round rather than shipping silently:** `ai/` (zero implementation anywhere — `capabilities.json`/`elements.json`/`scoring.json` don't exist), and several new manifest fields (`attributions`, `category`, `tags`, `apiVersion`, `partials.inputs`, `assets.previewGallery`) that nothing reads yet — exactly the "unread field drifts" trap this report's own Synthesis section warns about for the old `pages` field.

**What still holds, unaffected:** `render/` as the render-source folder, root `AGENTS.md` separate from `ai/`, structured license/attribution fields, `partials` over `slots`, `apiVersion`/`$schema`, the two-artifact documentation split, and `data-tovu-agent` as a distinct (but not by itself sufficient — needs validator enforcement) attribute name.

A follow-up debate round (Codex + both Gemini peers, no added subagent) resolved Decisions 5 and 13. See the Round 3 Addendum at the end of this report.

---

## The Swarm

| Role | Participant | Model | Reasoning | CLI |
|---|---|---|---|---|
| Primary | Coordinator (this host session) | Claude Opus 5 | — | Claude Code |
| Peer | Gemini 3.7 Flash | `gemini-3.7-flash-high` | high | agy 1.1.13 |
| Peer | Gemini 3.1 Pro | `gemini-3.1-pro-high` | high | agy 1.1.13 |
| Peer | Codex | `gpt-5.6-sol` | xhigh | codex-cli 0.147.0 |
| Added subagent | Fable | `claude-fable-5` | — | in-host Agent tool |

Also independently consulted before this debate opened (solo, single-pass, not a voting participant in this run — its position was disclosed to the panel as a candidate to critique): Codex, `gpt-5.6-terra`, xhigh.

## Dispatch Diagnostics

- Both Codex and the Fable subagent had real, bounded repo file access (`-C /Users/la/Programming/Tovu`, and native in-host tool access respectively), scoped to `src/themes/**` + `src/assistant/site/capability-registry.ts` in Round 1, and the full Round 2 packet path directly in Round 2.
- **agy (both Gemini peers) failed silently on the first Round 1 attempt** — headless `--print` mode cannot grant its own file-read permission, so a `./PACKET.md` read was auto-denied, producing empty stdout with exit 0 (a known silent-failure shape). Fixed by inlining the full packet as plain text directly in the `--print` argument instead of asking agy to read a file; both peers then answered normally in both rounds. This transport lesson is already captured for future runs.
- All four peer dispatches completed cleanly on retry/second round — verified via ACK-line presence (`ACK_PACKET_RECEIVED ...`) and zero `error`/`turn.failed` events in the Codex JSONL stream.
- The Fable subagent went idle without proactively reporting its final answer at the end of both rounds; recovered both times with a direct follow-up message requesting the complete answer.
- `gpt-5.6-terra` and `gpt-5.6-sol` at `xhigh` were both smoke-tested on this exact host/codex-cli version (0.147.0) before real dispatch; both Gemini models were discriminatively smoke-tested (arithmetic + self-identification) before dispatch.
- **A real scope gap was found and corrected between rounds:** Round 1's file access excluded a genuine, highly-cited authoring guide (`development/docs/themes/theme-authoring-guide.md`) that materially changes the ground truth (real 5-value `ThemeTier`, wired `slots`/`modes`/`defaultMode`, a 6-type embed system, an unused `regions` field, a `theme_write_file` hot-reload tool). Its contents — and one specific wrong claim within it, corrected against the actual parser code — were fed to every participant at the start of Round 2.

## Individual Responses

Full text of every response is saved and linked; only positions are summarized here.

- **Primary (Coordinator):** [R1](PRIMARY-round1-frozen-2026-08-17.md) — proposed `templates/`, partial `dist/` exception. [R2](PRIMARY-round2-frozen-2026-08-17.md) — reversed both after peer arguments; adopted `render/`, unanimous no-`dist/`, sided with Codex on a distinct agent attribute name.
- **Fable:** [R1](FABLE-round1-2026-08-17.md) — proposed `src/`+interior, `data-agent-element` reuse, `partials` rename. [R2](FABLE-round2-2026-08-17.md) — reversed to `render/` and `data-tovu-agent`; held `partials` and root `AGENTS.md`, both strengthened by new ground truth.
- **Codex (gpt-5.6-sol, xhigh):** [R1](CODEX-round1-2026-08-17.md) — proposed `render/`, `data-tovu-agent`, `composition.partials`, root `AGENTS.md` from the start. [R2](CODEX-round2-2026-08-17.md) — held all four; corrected its own Round 1 error (`code` tier ≠ component-framework tier) after the new ground truth disclosed `code`'s real, narrower meaning.
- **Gemini 3.7 Flash:** [R1](FLASH37-round1-2026-08-17.md) — proposed `templates/`, `data-agent-element` reuse, kept `slots`. [R2](FLASH37-round2-2026-08-17.md) — reversed all three to `render/`, `data-tovu-agent`, `partials`; held root `AGENTS.md` (already agreed in R1).
- **Gemini 3.1 Pro:** [R1](PRO31-round1-2026-08-17.md) — proposed `src/`, `data-agent-element` reuse, kept `slots`, and uniquely put dev-time instructions *inside* `ai/`. [R2](PRO31-round2-2026-08-17.md) — reversed on all four points, the widest swing of any participant.

## Synthesis

### Unanimous (5/5, no dissent)

- `css/theme.css` — one required global stylesheet entry point, all tiers; additional files via `@import`.
- `scripts/` (optional; forbidden in `declarative`) with `scripts/vendor/<lib>/` (+ matching `css/vendor/`) for third-party code, each with its own license reference, distinct from first-party code.
- `dist/`/build output **never** lives inside a theme's own author folder, for any tier, no exceptions — the marketplace's future untrusted-third-party builds must come from a platform-managed, sandboxed build of `src`/`render` + `package.json`, never an author-supplied artifact.
- Structured `license`/`attribution(s)`/`category`/`tags` fields in `theme.json`, replacing free-text-only `NOTICE.md`/`author`-string provenance.
- Two documentation artifacts (a human guide, a machine-checkable spec/schema) generated from one shared source of truth — explicitly modeled on `development/docs/themes/theme-authoring-guide.md`'s own proven discipline (path:line citations, an explicit "read vs. dead" field table, a gotchas section, a minimal worked example per tier).
- A schema/API version field (`apiVersion`) to distinguish today's manifest shape from the new one during the owner-confirmed, deferred migration of the ~10 existing themes.
- `AGENTS.md` at theme root (not inside `ai/`) for dev-time coding-agent guidance; `tests/` (`cases.json` + `fixtures/` + `golden/`) as a sibling, with an explicit render-settle contract (`{"event": "tovu:ready", "timeoutMs": ...}`) to fix static/basic's own already-documented mid-animation screenshot bug.
- `regions` (widget-placement, already built and tested) and the wired `modes`/`defaultMode` fields must be preserved in the new schema, not silently dropped.
- The real embed mechanism is **one HTML attribute**, `data-embed-config`, holding a JSON object (`type`, `id`, plus params) — confirmed against the parser (`src/core/embeds/marker.ts:108`) and live files, not the authoring guide's own (incorrect) prose claim of three separate attributes. Six embed types exist today (`partial`, `menu`, `widget`, `form`, `media`, `post`); only `partial` resolves to theme-supplied files.

### 4/5, one holdout

- Manifest key: rename `slots` → **`partials`** (Fable, Flash, Pro, Coordinator) vs. Codex's `composition.partials` (same rename, extra nesting Codex didn't fully defend once Fable/Coordinator both noted `composition` has no second member to justify the wrapper). Recommend the flat `partials`.

### The four lettered disagreements — all resolved by Round 2

**A. Render-layer source folder name → `render/`, containing required `pages/` + `partials/`, optional `layouts/` and (framework-tier-only) `components/`.** Started 3-way split (Fable/Pro: `src/`; Codex/Coordinator: `render/`; Flash: `templates/`) — converged 5/5 on `render/` by Round 2. Winning argument: `src/` is factually true but practically dangerous — every modern framework ecosystem trains authors to treat `src/` as "everything," which directly collides with `css/`/`scripts/`/`assets/` living as deliberate top-level siblings; `templates/` is simply false for static HTML and framework components. `render/` has exactly one enforceable rule ("everything the tier's renderer/adapter interprets lives here") that a validator can check with no ambiguity.

**B. Theme-markup agent-handle attribute → `data-tovu-agent`, distinct from the admin's `data-agent-element`.** Started 3-2 (majority wanted to reuse the admin convention) — converged 5/5. Winning argument: admin `agentHandle()`/`data-agent-element` operates in a trusted, authenticated, single-tenant surface; theme markup is visitor-facing, multi-tenant, and will eventually come from untrusted marketplace authors. Reusing the exact attribute name invites a real "same attribute → same trust level" reasoning error across that boundary — concretely, Fable identified that admin-side preview surfaces could resolve `[data-agent-element]` selectors against untrusted theme-authored markup if the names collide. Shared handle *grammar* (validation logic, naming rules), distinct *namestrings*, near-zero cost.

**C. Manifest key `slots` → `partials`.** Started 2-2 — converged 4/5 (see above). Reinforced twice by new ground truth disclosed in Round 2: the `regions` field already occupies the "insertion point the host fills" concept, so keeping `slots` alongside `regions` would leave two fields whose names suggest the other's meaning; and of the real embed system's 6 types, only `partial` resolves to theme-supplied files, which is the strongest possible argument the manifest key should be named for exactly that.

**D. Dev-time agent guidance location → root `AGENTS.md`, separate from runtime `ai/`.** Started 4-1 (only Gemini 3.1 Pro argued for co-location inside `ai/`) — converged 5/5 when Pro conceded in Round 2. Winning argument: different audience (a coding agent that hasn't onboarded to Tovu yet vs. a visiting browser agent), different trust model (dev-time material is strippable at install; `ai/` may ship with the published theme), different lifecycle — and the new `theme_write_file` hot-reload fact is dev-workflow content with zero meaning to a site visitor, concrete proof the two don't belong in one folder.

## Decision Ledger

| # | Decision | Final answer | Agreement |
|---|---|---|---|
| 1 | Media folder | `assets/`, all media types, `assets/previews/` for marketplace cards | Owner-locked pre-debate; unanimous |
| 2 | CSS entry point | `css/theme.css` | 5/5 |
| 3 | Render-layer folder | `render/` (`pages/`, `partials/`, optional `layouts/`, `components/`) | 5/5 (started 3-way split) |
| 4 | Scripts folder | `scripts/` (forbidden in declarative) + `scripts/vendor/`, `css/vendor/` | 5/5 |
| 5 | Build output | ~~Never inside author folder, any tier~~ **WRONG, see correction above** | 5/5 — but contradicted by shipped `ADR-020 §5` |
| 6 | Agent-handle attribute | `data-tovu-agent` (theme markup) ≠ `data-agent-element` (admin-only) | 5/5 (started 3-2) |
| 7 | Manifest partials key | `partials` (flat) | 4/5 (Codex: `composition.partials`) |
| 8 | Dev-time agent guidance | Root `AGENTS.md` + `tests/`, separate from `ai/` | 5/5 (started 4-1) |
| 9 | License/attribution/category | Structured `theme.json` fields | 5/5 |
| 10 | Documentation | Two artifacts (human guide + machine spec), one schema source of truth | 5/5 |
| 11 | Schema versioning | `apiVersion` integer + optional `$schema` URI | 5/5 |
| 12 | `regions`, `modes`, `defaultMode` | Preserved in new schema exactly as implemented today | 5/5 |
| 13 | Tier taxonomy | ~~4 role values incl. new `framework` tier~~ **WRONG, see correction above — no `framework` tier; `build.source:"compiled"` on `tier:"static"` instead** | 5/5 — but contradicted by shipped `ADR-020 §5` |
| 14 | Embed mechanism | One attribute, `data-embed-config`, JSON blob; 6 types, only `partial` resolves to theme files | 5/5, verified against source, not the (partly wrong) authoring guide |

## Final Recommendation

Adopt the Round 2 converged shape as the working spec. It is unanimous or near-unanimous on every load-bearing point, was pressure-tested against real repo ground truth (not just abstract preference) across two independent-then-informed rounds, and every participant that changed a position did so citing a specific, falsifiable argument from another participant — the sign of a real update, not conformity.

```
<theme-id>/                      # folder name MUST equal theme.json "id"
├── theme.json                   # required — manifest, schema v2
├── tokens.json                  # required — default-mode design tokens
├── tokens.<mode>.json           # optional — e.g. tokens.light.json
├── AGENTS.md                    # recommended — dev-time coding-agent instructions
├── LICENSE                      # required
├── NOTICE.md                    # optional — free-text provenance prose
├── assets/
│   ├── previews/                #   card.webp REQUIRED (marketplace thumbnail); gallery/ optional
│   ├── images/  video/  audio/  fonts/  files/   # all optional
├── css/
│   ├── theme.css                # required — the only file the host loads automatically
│   └── vendor/                  #   optional third-party CSS
├── render/                      # required — everything the tier's renderer/adapter interprets
│   ├── pages/                   #   required — route-level units (.html/.liquid/.hbs/.json/.tsx/...)
│   ├── partials/                #   theme-supplied embed implementations (nav, footer, ...)
│   ├── layouts/                 #   optional — page shells
│   └── components/              #   framework tier only
├── scripts/                     # optional; FORBIDDEN in declarative tier
│   └── vendor/<lib>/            #   pinned, licensed, never hand-edited
├── ai/                          # optional — published-site agent surface; pure JSON, default-deny
│   ├── capabilities.json
│   ├── elements.json            #   catalog of data-tovu-agent handles + semantics
│   └── scoring.json
├── locales/                     # optional i18n UI strings
├── tests/
│   ├── cases.json               #   declarative test cases w/ settle contract
│   ├── fixtures/
│   └── golden/                  #   dom/ + visual/
└── package.json                 # framework tier only — dist/ NEVER exists here
```

```jsonc
{
  "$schema": "https://tovu.dev/schemas/theme/v2/theme.schema.json",
  "apiVersion": 2,
  "id": "basic", "name": "Basic", "version": "0.1.0",
  "tier": "static",                          // static | templated | declarative | framework
  "engine": { "name": "liquid", "version": "1" },  // required for templated+framework, forbidden otherwise
  "compatibility": { "tovu": ">=1.0.0" },
  "description": "…",
  "license": { "spdx": "MIT", "file": "LICENSE" },
  "authors": [{ "name": "…", "url": "…" }],
  "attributions": [{ "id": "motion", "name": "Motion", "version": "11.x", "license": "MIT",
                     "files": ["scripts/vendor/motion/**"], "licenseFile": "scripts/vendor/motion/LICENSE" }],
  "category": "marketing", "tags": ["saas"],
  "tokens": { "defaultMode": "dark", "modes": { "dark": "tokens.json", "light": "tokens.light.json" } },
  "fonts": [{ "family": "Geist", "weights": [400,500], "files": ["assets/fonts/geist-var.woff2"] }],
  "renderer": { "adapter": "html@1", "pages": { "home": { "source": "render/pages/index.html" } } },
  "partials": {
    "nav":    { "source": "render/partials/nav.html", "inputs": { "current": { "type": "string" } } },
    "footer": { "source": "render/partials/footer.html", "variants": { "minimal": "render/partials/footer-minimal.html" } }
  },
  "regions": { /* preserved AS-IS from the real implemented shape — see punch list */ },
  "scripts": { "entries": [{ "id": "main", "path": "scripts/main.js", "kind": "author" }] },
  "assets": { "previewGallery": [{ "src": "assets/previews/home.webp", "caption": "Home, dark" }] },
  "ai": { "dir": "ai" }
}
```

Markup carrier: theme HTML uses `data-tovu-agent="<handle>"` (never `data-agent-element`, which is validator-rejected in theme content); the invariant embed request is `{type, id, params}`, carried today as one `data-embed-config` JSON attribute, with declarative/framework tiers lowering to a native block node / `<TovuEmbed>` component respectively.

### Punch list before this becomes a shipped spec (not resolved by this debate, flagged by multiple participants)

1. **Read the real, implemented shape of `regions`** before freezing schema v2 — this debate was told it exists and is tested, but never shown its actual fields; every proposal above preserves it "as-is," which requires reading `src/features/theme/theme.ts` and the widget-placement code first.
2. **Do not conflate `code` (reserved, trusted signed-plugin JS) with the new `framework` tier** — Codex made this error in Round 1 and self-corrected in Round 2; the final tier enum keeps them as two distinct, non-overlapping concepts, one built-placeholder, one genuinely new.
3. **Write the validator, not just the schema** — every participant's proposal assumes a `tovu theme validate` step enforcing the boundary rules (no `dist/`, no `data-agent-element` in theme markup, no `scripts/` in declarative, unknown fields rejected). Without it, this is documentation, not a contract.
4. **A `tovu theme migrate` script** for the ~10 existing themes is explicitly deferred (owner's call) but every proposal assumes it's mechanical (folder renames + one manifest rewrite pass) — worth a smoke test on at least one real theme (`static/basic`, the most complex) before assuming that holds.
5. **The marketplace's sandboxed build pipeline** for the future `framework` tier (build untrusted third-party `render/` + `package.json`, emit to a platform-managed artifact store keyed by id/version/toolchain) is named as a requirement throughout but was explicitly out of scope to design in this debate.

## Debate Trace

**Round 1 (blind):** 3-way split on the render folder (`src/`×2, `render/`×2, `templates/`×1), 3-2 split favoring admin-attribute reuse, 2-2 split on `slots` vs `partials`, 4-1 favoring separate `AGENTS.md`. The Coordinator's own frozen Round 1 answer picked `templates/` and held a partial exception for local `dist/`.

**Between rounds:** the Coordinator discovered a real, previously-unread authoring guide, corrected one wrong claim inside it against the actual parser, and fed the expanded ground truth (5-value tier enum, wired manifest fields, 6-type embed system, `regions`, hot-reload tooling) to every participant.

**Round 2 (informed):** near-total convergence. The Coordinator reversed itself on the render-folder name and the `dist/` exception, moved by Codex's and Fable's arguments. Fable and Flash both flipped from `src/`/`templates/` to `render/`, and from admin-attribute-reuse to a distinct name. Gemini 3.1 Pro made the widest swing of any participant, reversing all four contested positions after conceding each specific counter-argument by name rather than generically. Codex held its Round 1 position on all four lettered points but caught and corrected its own tier-taxonomy error once the real `code`/`handlebars` ground truth was disclosed. No participant reversed a position without naming the specific argument that moved it — the Round-Disclosure Guard's falsifiability requirement held throughout.

**Between Round 2 and Round 3:** an independent Opus 5 subagent, asked specifically to find real problems before this got published, found that Decisions 5 and 13 were contradicted by `ADR-020 §5` — real, shipped code from three days before the debate started, which neither round's file scope (`src/themes/**`) covered (the real logic lives in the sibling `src/features/theme/` directory). Every claim was verified directly against source before being accepted — see the correction banner at the top of this report.

## Round 3 Addendum — Build/Tier Correction (Codex, Gemini 3.7 Flash, Gemini 3.1 Pro; no added subagent this round)

Full answers: [Codex](CODEX-round3-2026-08-17.md), [Flash](FLASH37-round3-2026-08-17.md), [Pro](PRO31-round3-2026-08-17.md), [Coordinator](PRIMARY-round3-frozen-2026-08-17.md).

**Unanimous, all 3 peers + Coordinator:**

- `build.source: "compiled"` stays permanently gated to `tier: "static"` — not an artificial constraint to relax later. Codex's framing is the most precise and is adopted: it's not that every framework build produces static output (Next/Nuxt/SvelteKit can emit SSR/edge runtimes) — it's that Tovu's "compiled" lifecycle class specifically only accepts builds reduced to Tovu's static runtime contract (prerendered HTML/CSS/JS/assets); an SSR/edge/server-module output does not qualify and is rejected, not silently accepted.
- The generated tree (everything outside `sourceDir` in a compiled theme) uses the exact same invariant shape (`render/`, `css/`, `scripts/`, `assets/`) as an authored theme — `code-tier-asset-normalizer.ts`'s job is exactly this relocation/rewrite. **Refinement from Codex, adopted:** "consumers never need to know whether a theme is authored or compiled" is true for *runtime* consumers (renderer, router, asset server, partial resolver) but false for *lifecycle* consumers (installer, integrity validator, editor, reset/restore, coding-agent tools) — those must know, because generated files are immutable while `sourceDir` and `theme.json` stay editable.
- `sourceDir` itself is fully exempt from every folder-shape rule internally (arbitrary author/framework-native layout — Tovu never parses or serves from it *by design*), but is boundary-constrained at the package level: must be a clean, contained, theme-relative path; disjoint from every reserved root (`render/`, `css/`, `scripts/`, `assets/`, `ai/`, `tests/`, `locales/`, `preview/`); subject to size/file-count/symlink rules.
- `build.framework` widens from the current closed `"react" | "vue" | "angular"` union to an open, validated vocabulary including at minimum `svelte`, `astro`, `solid`, `qwik`, `web-components` — purely descriptive metadata, never branched on for rendering/trust decisions.
- `build`'s shape carries forward into schema v2 with its field names unchanged (`source`, `framework`, `sourceDir`, `builderVersion`, `lockfileHash`, `artifactHashes`) — 2 of 3 peers (Codex, Flash) explicitly rank a rename/restructure (e.g. nesting hash fields under a new `integrity` key, Pro's proposal) as **not worth the migration churn** against real consumers (loader, marketplace, editor, agent tools, restore logic, tests). Recommendation: keep field names as-is, add v2 JSON Schema conditional validation (compiled requires `sourceDir`+non-empty `artifactHashes`; unrecognized `source` values must fail closed, not silently downgrade to "authored"; reject undeclared/symlinked files in the hash inventory).

**New real findings from this round, verified directly against source (not just peer claims) before being accepted:**

- **`sourceDir` is genuinely served over public HTTP today** — `src/server/middleware/theme-static-assets.ts` mounts `express.static(themeDir)` unscoped, serving a theme's entire folder including `sourceDir`. **Important correction to how Codex first framed this:** this is a known, deliberate, already-partially-hardened choice, not an overlooked gap — the middleware's own doc comment states the team already found and reasoned through this exact exposure, and closed an XSS-execution angle for it (`.liquid`/similar source files serve as `application/octet-stream`, not an executable MIME type). **One real, currently-open edge case remains, acknowledged in the code itself:** a `build.sourceDir` value can be set to the same name as a reserved generated directory (e.g. `"preview"`), which lets a write-time gate miss it and allows a PUT straight into what should be a protected generated path — flagged in `explore.ts` as "the deeper fix... not attempted here." Worth a real fix, not just documentation, before schema v2 ships.
- **The normalizer has zero production callers today** (Codex, verified) — `code-tier-asset-normalizer.ts` is real, tested code, but nothing in the live request path invokes it yet. Treat the compiled-theme story as real infrastructure with a partially-wired production path, not a fully end-to-end-proven feature — same caution this whole report already applies to `handlebars` and `regions`.
- **A framework label is not a support claim.** The real Astro conformance test proves *unmodified default Astro build output fails* the sentinel/asset-reference gate today — the normalizer is documented and verified primarily against constrained Angular output. `"framework": "astro"` in a manifest means "Astro produced this," not "any Astro build configuration is accepted." Say this plainly in the eventual spec rather than implying broad framework support that isn't proven yet.

## Corrected Final Recommendation (supersedes the folder tree and `theme.json` sketch above for anything build/tier-related)

```
<theme-id>/                        # authored theme — folder name MUST equal "id"
├── theme.json                     # build.source: "authored" (or build omitted)
├── AGENTS.md   LICENSE   NOTICE.md
├── assets/  css/  render/  scripts/  ai/  locales/  tests/

<theme-id>/                        # compiled theme — same "id" rule
├── theme.json                     # build.source: "compiled", tier: "static" always
├── AGENTS.md   LICENSE   NOTICE.md
├── <sourceDir>/                   # author-declared name, e.g. "authoring/" — fully exempt
│   │                              #   internal layout (framework-native: package.json, its own
│   │                              #   src/, config files, etc.) — Tovu never serves this as a
│   │                              #   "content" path or applies folder-shape rules to it
├── assets/  css/  render/  scripts/  ai/  locales/  tests/
│                                  # ^ GENERATED, normalized into the exact same invariant shape
│                                  #   as an authored theme — read-only per-file, restored only
│                                  #   as one whole release, integrity-checked via build.artifactHashes
```

```jsonc
// compiled theme.json delta (everything else identical to the authored sketch above)
"build": {
  "source": "compiled",
  "framework": "astro",                 // open vocabulary: react|vue|angular|svelte|astro|solid|qwik|web-components|...
  "sourceDir": "authoring",             // required; author-declared; fully exempt internal layout
  "builderVersion": "astro@5.13.2",     // descriptive only, never parsed
  "lockfileHash": "sha256:...",         // provenance only
  "artifactHashes": {                   // required, non-empty; sha256 per generated file, path-keyed
    "render/pages/index.html": "sha256:...",
    "css/theme.css": "sha256:...",
    "scripts/main.js": "sha256:..."
    // exhaustive over every file outside sourceDir except theme.json itself
  }
}
```

No `framework`/`component` tier exists. `tier` stays 4 values; `build` is orthogonal metadata layered on top, valid only when `tier: "static"`.

### Updated punch list (replaces items 2 and 5 from the original list above)

1. ~~Do not conflate `code` with the new `framework` tier~~ — moot, there is no `framework` tier.
2. **Fix the `sourceDir`-collides-with-a-reserved-directory-name gap** (`explore.ts`'s own flagged TODO) before schema v2 ships — a conformance rule forbidding `build.sourceDir` from naming any reserved/generated directory at install time.
3. ~~The marketplace's sandboxed build pipeline... was explicitly out of scope~~ — also moot: there is no platform-side build/sandbox to design. The real pipeline is author/CI builds → normalize → hash → publish; `marketplace.ts` already handles cataloging/download/lineage. What's still open: production wiring of `code-tier-asset-normalizer.ts` into that real pipeline (currently zero callers), and confirming which real framework build configurations (beyond the Angular spike and the currently-failing default-Astro case) the normalizer/conformance gate actually support before advertising broad framework compatibility.
