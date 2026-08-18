# Tovu Theme Authoring Guide v2 — Invariant Structure (Target Design)

> ## STATUS — READ THIS BEFORE ANYTHING ELSE
>
> **This document describes a TARGET design that does not exist in the running system.**
>
> - No migration has run. No validator enforces anything in this document. No `render/` folder,
>   no `partials` manifest key, no `ai/` surface, no `AGENTS.md`-at-theme-root convention, no
>   `tests/cases.json` contract exists anywhere in `src/themes/` today.
> - All ~10 themes currently on disk (`src/themes/static/*`, `src/themes/templated/storefront`,
>   `src/themes/declarative/basic-declarative`) use the shape documented in **v1**
>   (`development/docs/themes/theme-authoring-guide.md`), not this one.
> - This is the settled output of a 3-round, multi-model design debate
>   (`ADS-memory/reports/swarm-consensus/runs/2026-08-17-tovu-theme-invariant-structure-consensus-report.md`),
>   corrected once against real shipped code (`ADR-020 §5`) after Round 2. It is frozen as a
>   design, not yet built.
> - **Every claim below is tagged one of three ways:**
>   - **`[REAL, path:line]`** — verified directly against code that exists in this repo today; the
>     citation is load-bearing, re-check the line number against current `HEAD` before trusting it
>     verbatim in a future session.
>   - **`[TARGET]`** — part of the settled design, not yet implemented. Nothing reads or writes
>     this shape today.
>   - **`[NOT YET IMPLEMENTED]`** — called out explicitly where a reader would otherwise assume
>     something exists because it's described in detail (`ai/`, the validator, `AGENTS.md`).
>
> If you are an agent about to write or edit an actual theme file in this repo right now, **read
> v1, not this document** — v1 describes what the loader, renderer, and validator actually do.
> Read this document only when: (a) you are implementing the migration/validator this design
> describes, or (b) you are deliberately authoring against the v2 shape ahead of the migration
> (not recommended — nothing will load it).
>
> **v1 pointer:** `development/docs/themes/theme-authoring-guide.md` — the system as it runs today.

---

## 1. Audience and how to use this document

Primary audience: an AI coding agent implementing the migration, the validator, or a theme
against this design. Secondary audience: a human doing the same. Structure follows from that:

- Headings are numbered (`§N`) and stable — cite them as `theme-authoring-guide-v2.md §N`.
- Every manifest field and folder rule is marked **REQUIRED**, **OPTIONAL**, or **FORBIDDEN** —
  never left to prose hedging.
- §15's read-vs-dead table is the single place to check "does anything actually consume this
  field" before relying on a manifest key having any runtime effect.
- §16 states rules in a form a validator implementation can lift directly.

## 2. Relationship to v1 and to the debate that produced this

v1 (`theme-authoring-guide.md`) is descriptive: it documents the loader/renderer/validator code
exactly as it behaves today, tier by tier, with `path:line` citations into `src/features/theme/`
and `src/server/http/site/`. This document is prescriptive: it is the folder/manifest shape a
future `tovu theme migrate` + `tovu theme validate` pair should converge every theme onto.

The debate that produced this design is fully traced in
`ADS-memory/reports/swarm-consensus/runs/2026-08-17-tovu-theme-invariant-structure-consensus-report.md`.
Two things from that report are corrected here rather than carried forward as originally voted,
because they were later found to contradict real shipped code (the report's own ⚠️ CORRECTION
banner and Round 3 Addendum, both dated 2026-08-17, cover this in full — read them if you want the
debate history, not just the resolved answer):

1. **There is no `framework` tier.** The debate's Round 1/2 vote (Decision 13 in its ledger) added
   a fifth `ThemeTier` value for component-framework themes. This was wrong: `ADR-020 §5`, shipped
   2026-08-12 (three days before the debate), had already solved this a different way — see §6.
2. **Build output is not banned from the theme folder.** The debate's Round 1/2 vote (Decision 5)
   held that build/`dist/` output must never live inside a theme's own author folder, any tier, no
   exceptions. Real shipped code does exactly this today for a `build.source: "compiled"` theme —
   see §6.

Everything else in the debate's Round 2 convergence (`render/`, `data-tovu-agent`, `partials`,
root `AGENTS.md`, structured license fields, `apiVersion`) is carried forward unchanged and is
**all `[TARGET]`** — none of it exists in code yet.

## 3. Full invariant folder tree — authored theme `[TARGET]`

```
<theme-id>/                        # folder name MUST equal theme.json "id"
├── theme.json                     # REQUIRED — manifest, schema v2. build.source: "authored" (or build omitted)
├── tokens.json                    # REQUIRED — default-mode design tokens
├── tokens.<mode>.json             # OPTIONAL — e.g. tokens.light.json
├── AGENTS.md                      # RECOMMENDED — dev-time coding-agent instructions [NOT YET IMPLEMENTED]
├── LICENSE                        # REQUIRED [NOT YET IMPLEMENTED — no theme on disk ships one today]
├── NOTICE.md                      # OPTIONAL — free-text provenance prose [REAL today, unchanged shape]
├── assets/
│   ├── previews/                  #   card.webp REQUIRED (marketplace thumbnail); gallery/ optional
│   └── images/ video/ audio/ fonts/ files/   # all OPTIONAL
├── screenshots/                   # OPTIONAL — real author-owned marketing images, distinct from
│                                   #   assets/previews/'s specific marketplace-card-thumbnail purpose
│                                   #   [REAL today, unchanged shape — every theme on disk ships one]
├── css/
│   ├── theme.css                  # REQUIRED — the only file the host loads automatically
│   └── vendor/                    #   OPTIONAL third-party CSS, one subfolder per library
├── render/                        # REQUIRED — everything the tier's renderer/adapter interprets
│   ├── pages/                     #   REQUIRED — route-level units (.html/.liquid/.hbs/.json)
│   ├── partials/                  #   theme-supplied embed implementations (nav, footer, ...)
│   └── layouts/                   #   OPTIONAL — page shells
├── scripts/                       # OPTIONAL; FORBIDDEN in tier "declarative"
│   └── vendor/<lib>/              #   pinned, licensed, never hand-edited
├── ai/                            # OPTIONAL — published-site agent surface [NOT YET IMPLEMENTED, §12]
│   ├── capabilities.json
│   ├── elements.json              #   catalog of data-tovu-agent handles + semantics
│   └── scoring.json
├── locales/                       # OPTIONAL i18n UI strings
├── tests/                         # [NOT YET IMPLEMENTED, §13]
│   ├── cases.json                 #   declarative test cases w/ render-settle contract
│   ├── fixtures/
│   └── golden/                    #   dom/ + visual/
└── package.json                   # framework-authoring convenience only — see §6, not a runtime tier
```

Note on `components/`: the debate's original recommendation reserved `render/components/` for a
"framework tier" that does not exist (§2, item 1). Dropped here rather than carried forward as
dead scaffolding.

## 4. Full invariant folder tree — compiled theme `[TARGET, layout matches REAL `build` semantics]`

```
<theme-id>/                        # same "id" rule as an authored theme
├── theme.json                     # build.source: "compiled", tier: "static" always [REAL — theme.ts:643-653]
├── AGENTS.md   LICENSE   NOTICE.md
├── <sourceDir>/                   # author-declared name (build.sourceDir), e.g. "authoring/"
│   │                              #   fully exempt from every folder-shape rule in this document —
│   │                              #   framework-native internal layout (its own package.json, src/,
│   │                              #   config files); Tovu never parses or serves this as "content"
├── assets/  css/  render/  scripts/  ai/  locales/  tests/
│                                  # ^ GENERATED, normalized into the exact same invariant shape as
│                                  #   an authored theme (§3) — read-only per-file, restored only as
│                                  #   one whole release, integrity-checked via build.artifactHashes
```

This tree's TOP HALF (`theme.json`, `sourceDir` semantics, `artifactHashes` integrity) is `[REAL]`
today — see §6 for citations. Its BOTTOM HALF (the generated tree using `render/`/`css/`/`scripts/`
instead of today's flat `pages/`/`css/`/`js/` at the theme root) is `[TARGET]` — today a compiled
theme's generated output uses the same flat layout as an authored `static` theme (§11).

## 5. `theme.json` schema v2 — field reference `[TARGET unless marked REAL]`

```jsonc
{
  "$schema": "https://tovu.dev/schemas/theme/v2/theme.schema.json",  // [TARGET]
  "apiVersion": 2,                                                    // [TARGET]
  "id": "basic", "name": "Basic", "version": "0.1.0",                 // [REAL — theme.ts:102-106]
  "tier": "static",                          // static | templated | declarative | code — [REAL, unchanged]
  "engine": { "name": "liquid", "version": "1" },  // [TARGET restructure — REAL today is a bare number, theme.ts:110]
  "compatibility": { "tovu": ">=1.0.0" },     // [TARGET]
  "description": "…",                         // [REAL — theme.ts:122]
  "author": "…",                              // [REAL, free-text string, not the structured object below — theme.ts:111-118]
  "license": { "spdx": "MIT", "file": "LICENSE" },        // [TARGET]
  "authors": [{ "name": "…", "url": "…" }],               // [TARGET — supersedes the REAL free-text `author`]
  "attributions": [{ "id": "motion", "name": "Motion", "version": "11.x", "license": "MIT",
                     "files": ["scripts/vendor/motion/**"], "licenseFile": "scripts/vendor/motion/LICENSE" }],  // [TARGET]
  "category": "marketing", "tags": ["saas"],  // [TARGET]
  "tokens": { "defaultMode": "dark", "modes": { "dark": "tokens.json", "light": "tokens.light.json" } },
                                               // [TARGET restructure — REAL today is two flat fields, theme.ts:190-207]
  "fonts": [{ "family": "Geist", "weights": [400,500], "files": ["assets/fonts/geist-var.woff2"] }],
                                               // [TARGET restructure — REAL today is `fonts: string[]` of raw Google Fonts specs, theme.ts:123-129]
  "renderer": { "adapter": "html@1", "pages": { "home": { "source": "render/pages/index.html" } } },  // [TARGET]
  "partials": {                                // [TARGET rename of REAL `slots`, theme.ts:216 — see §10]
    "nav":    { "source": "render/partials/nav.html", "inputs": { "current": { "type": "string" } } },
    "footer": { "source": "render/partials/footer.html", "variants": { "minimal": "render/partials/footer-minimal.html" } }
  },
  "regions": ["header", "footer"],             // [REAL, shape verified — theme.ts:130-140, see §9. NOT an object, a flat string[].]
  "scripts": { "entries": [{ "id": "main", "path": "scripts/main.js", "kind": "author" }] },  // [TARGET]
  "assets": { "previewGallery": [{ "src": "assets/previews/home.webp", "caption": "Home, dark" }] },  // [TARGET]
  "ai": { "dir": "ai" },                       // [TARGET, NOT YET IMPLEMENTED — see §12]
  "build": {                                   // [REAL — theme.ts:60-99, §6]
    "source": "compiled",
    "framework": "astro",                      // [REAL today ONLY accepts "react"|"vue"|"angular" — theme.ts:344-347. "astro" is TARGET-widened, see §6.]
    "sourceDir": "authoring",
    "builderVersion": "astro@5.13.2",
    "lockfileHash": "sha256:...",
    "artifactHashes": { "render/pages/index.html": "sha256:..." }  // path prefix is TARGET (render/) — REAL keys are flat paths (css/styles.css, pages/index.html)
  }
}
```

`partials.inputs` (a partial's declared input shape) is `[TARGET]` and unread by anything today —
see §15.

## 6. Build provenance (`build`) — a flag on `tier: "static"`, not a tier `[REAL]`

This is the one area of this document that is mostly already shipped. Read this section closely
before assuming anything here is aspirational.

- **`build` is optional metadata on an otherwise ordinary manifest, not a routing decision.**
  `ThemeBuildInfo` — `src/features/theme/theme.ts:60-99`. Absent (every theme on disk today) means
  `"authored"`: the working copy on disk IS the source, full per-file edit/reset/AI-write, exactly
  as every theme behaves today.
- **`source: "compiled"` REQUIRES `tier: "static"`, enforced in `loadTheme()`** —
  `src/features/theme/theme.ts:643-645` (`"theme.json build.source 'compiled' requires tier 'static'"`).
  There is no separate tier a compiled theme's runtime maps onto; a built theme IS a static theme
  whose output happens to have been produced by a framework build rather than typed by hand.
- **`sourceDir` is REQUIRED for a compiled theme** —
  `src/features/theme/theme.ts:647-648` (hard manifest error if absent). It names the author's
  pre-build source root, theme-relative. Everything under it, plus `theme.json` itself, stays
  per-file editable exactly like an authored theme
  (`resolveThemeFileWriteScope`, `src/features/theme/theme-files.ts:476-500`). Everything outside
  `sourceDir` is generated output: read-only from every per-file surface, restored only as one
  whole release (`restoreBuiltThemeGeneratedTree`, `src/features/theme/theme-files.ts:527-560`).
- **`artifactHashes` is REQUIRED (non-empty) for a compiled theme** —
  `src/features/theme/theme.ts:650-651`. It is not advisory: `checkBuiltThemeConformance`
  (`src/features/theme/build-conformance.ts:435-460`, wired at the `loadTheme()` call site,
  `theme.ts:682-693`) walks the ENTIRE generated tree and requires every real file to have a
  matching listed hash, every listed hash to resolve to a real file, and refuses any symlink
  outright (`walkGeneratedTree`, `build-conformance.ts:256-298`). A theme failing this gate loads
  `status: "invalid"` — never reaches a visitor. Byte ceilings: 16 MiB per file, 64 MiB total
  (`MAX_HASHED_FILE_BYTES`/`MAX_TOTAL_HASHED_BYTES`, `build-conformance.ts:199-200`).
- **Tovu never runs the build.** The gate above verifies bytes that already exist on disk; nothing
  in this codebase invokes a bundler. The author or publisher CI builds; the conformance gate is
  what lets Tovu trust the result without re-executing it.
- **`build.framework` is currently a closed 3-value union** — `"react" | "vue" | "angular"` only
  (`parseThemeBuildInfo`, `src/features/theme/theme.ts:344-347`). Anything else parses as
  `undefined` (silently dropped, not rejected). The debate's widened, open vocabulary (adding at
  minimum `svelte`, `astro`, `solid`, `qwik`, `web-components`) is `[TARGET]` — not yet in code.
  This field is purely descriptive either way: nothing in Tovu's request-time branches reads it
  (`theme.ts:71-73`'s own comment).
- **A framework label is not a support claim — verified, not assumed.**
  `src/features/theme/__tests__/astro-real-bundler-conformance.test.ts` runs a real, unmodified
  `astro build` through `checkBuiltThemeConformance` and gets exactly two failures: no stylesheet
  sentinel (Astro inlines component CSS into `<style>`, never emits the external stylesheet the
  gate requires — test lines 89-90, 107-113) and zero rewritable asset references (lines 114-117).
  The gate and normalizer are verified mainly against a real, constrained Angular build
  (`code-tier-asset-normalizer.ts`'s own header, lines 11-25, names the exact two Angular build
  flags required: `outputHashing: "none"` and `optimization.styles.inlineCritical: false`).
  `"framework": "astro"` in a manifest would mean "Astro produced this," never "any Astro build
  configuration is accepted." Do not imply broader framework support than this when writing about
  the `build` field elsewhere.
- **`code-tier-asset-normalizer.ts` has ZERO production callers today.** Verified:
  `grep -rn "normalizeBuildOutputDirectory" src/` matches only its own test file
  (`src/features/theme/__tests__/code-tier-asset-normalizer.test.ts`). The module's own file header
  says so explicitly (lines 90-105): no CLI entrypoint, no `package.json` script, no wiring from
  `theme.ts` or the install-time gate. It is real, tested code for relocating a flat framework
  build's `.css`/`.js`/`.mjs` (and their `.map` siblings) into Tovu's `css/`/`js/` asset-path
  contract and rewriting references — but nothing in the live request or install path invokes it.
- **The `build.sourceDir`-collides-with-a-reserved-directory gap is FIXED (2026-08-17), not open.**
  `isSourceDirGeneratedConflict` (`src/features/theme/theme-files.ts`) is enforced in `loadTheme()`
  (`src/features/theme/theme.ts:653`, inside the `build.source === "compiled"` manifest check): a
  `sourceDir` that names, nests inside, or is an ancestor of a reserved generated directory (e.g.
  `"preview"`) now fails the manifest at load, before any write-time gate is even reached. The
  per-write `isGeneratedThemePath` refusal (`explore.ts`, `marketplace.ts`) stays as a second,
  independent layer — see that function's own doc for why both exist. An earlier version of this
  document (and `explore.ts`'s own comment, since corrected) described this as still open; it
  was closed the same day, later in the session.
- **`sourceDir` is served over public HTTP today, by design.** `express.static(themeDir)` in
  `src/server/middleware/theme-static-assets.ts` (mount at `:62-74`) is unscoped to any subpath —
  it serves a theme's ENTIRE folder, `sourceDir` included. The module's own header (lines 8-61)
  documents this as a deliberate, already-hardened choice: `.liquid`/similar source files serve as
  `application/octet-stream`, not an executable MIME type, and every response carries
  `Content-Security-Policy: sandbox` + `X-Content-Type-Options: nosniff`
  (`themeAssetSecurityHeaders`, referenced at line 6).

## 7. Tier taxonomy — unchanged, 4 values `[REAL]`

`ThemeTier = "declarative" | "templated" | "handlebars" | "static" | "code"` —
`src/features/theme/theme.ts:35`. **`code` stays reserved and unbuilt** (no loader branch, no
renderer branch, no validator — v1 §2.5) and is a **different concept** from any framework-build
story: `code` would be trusted, signed-plugin JS executing server-side; a `build.source: "compiled"`
theme (§6) never executes anything server-side — its runtime IS the `static` tier. Do not conflate
them; the debate itself made and then caught this exact error in its own Round 1 (consensus report,
punch list item 1).

There is no fifth `framework`/`component` tier. See §2.

## 8. Embed markers — one attribute, `data-embed-config` `[REAL]`

**Correcting v1's own §6:** as of the 2026-08-11 "unified content marker" change (later than v1's
2026-08-10 write-up), the real mechanism is not three separate attributes. It is **one** HTML
attribute, `data-embed-config`, carrying a single-quoted JSON object whose `type` and `id` keys are
ordinary object keys, not attribute names:

```html
<div data-embed-config='{"type":"partial","id":"nav","current":"index"}'></div>
<nav  data-embed-config='{"type":"menu","id":"docs-nav","variant":"tree"}'>fallback content</nav>
```

Verified two ways:

1. The parser itself — `src/core/embeds/marker.ts`. The file header states the vocabulary
   explicitly (lines 18-25): *"`type` and `id` are ordinary keys, not separate attributes, so a new
   key never requires a new attribute name."* The regex that locates every marker,
   `MARKER_PATTERN`, matches exactly one `data-embed-config='...'` attribute per element
   (`marker.ts:108`).
2. Live theme files, current `HEAD` —
   `grep -n "data-embed" src/themes/static/basic/pages/index.html src/themes/static/basic/nav.html src/themes/static/basic/footer.html`
   shows every marker in the shipped `basic` theme using this exact one-attribute shape (e.g.
   `src/themes/static/basic/pages/index.html:12`:
   `<div data-embed-config='{"type":"partial","id":"nav","current":"index"}'></div>`).

Six `type` values exist in the codebase today; only `partial` resolves against theme-supplied
files. `menu`, `widget`, `media`, `post`, and the unified `content` type (v1 §6.4, §7.1)
all resolve against CMS-managed data via a repo lookup, not theme files. `MENU_MARKER_TYPE` and
`PARTIAL_MARKER_TYPE` are hoisted as named constants at `marker.ts:191-192` specifically because
these two are the only types the theme layer itself (not the generic widget/embed pipeline) owns
end to end.

**`form` is not in this vocabulary — deliberately removed 2026-08-10, not an omission.**
`resolver-service.ts`'s own doc comment on `HTML_EMBED_RESOLVERS` (`src/widgets/resolver-service.ts:747-754`)
states it directly: `form` never named a distinct capability — its resolver built a synthetic,
never-persisted `contact-form` widget view and routed it through the same path a real `contact-form`
WIDGET instance already used. Embedding a form today is `{"type":"widget","id":"<contact-form widget
entry id>"}`; `src/forms/` is untouched. An earlier version of this document listed `form` as live —
verify the vocabulary against `HTML_EMBED_RESOLVERS` (`resolver-service.ts:756-761`, currently
`widget`/`media`/`post`/`content`) plus `THEME_OWNED_MARKER_TYPES` (`menu`/`partial`) before relying
on this list in a future session, in case it moves again.

**`data-tovu-agent` (the theme-markup agent-handle attribute, distinct from admin's
`data-agent-element`) is `[TARGET, NOT YET IMPLEMENTED]`.** Verified: zero hits for
`data-tovu-agent` anywhere in `src/`. The admin-only `data-agent-element` convention is real but
lives exclusively under `src/features/pages/` (Page-authoring addressable-editing markup, v1
§6.6) — it has never been used in theme markup, and the debate's Decision 6 (adopt a distinct name
rather than reuse this one) has no code to point to yet either way.

## 9. `regions` — widget-placement region keys `[REAL, shape verified]`

The debate explicitly flagged that no participant had read `regions`'s real shape before agreeing
to preserve it "as-implemented" (consensus report, punch list item 1). Read directly for this
document:

**Shape: `regions?: string[]`** — a flat array of region-key strings (e.g. `["header", "footer"]`),
declared in `ThemeManifest` at `src/features/theme/theme.ts:130-140`, parsed from raw JSON at
`theme.ts:620` (`Array.isArray(raw.regions) ? raw.regions.map(String) : undefined`). It is **not**
an object/record shape — each entry is just a region's own name, nothing else.

**It is genuinely wired, not dead**, contrary to what "no live theme uses it" might suggest on its
own:

- `theme.manifest.regions` flows into `resolvePageWidgets` as `resolvedRegions` —
  `src/server/routes/site/pages.ts:164` (`resolvedRegions: theme.manifest.regions ?? []`), inside
  the widget-resolution phase documented at `pages.ts:146` ("SPEC-043/ADR-047 W-004 — resolves
  every widget placed in one of `theme.manifest.regions`").
- `resolvePageWidgets`'s own `resolvedRegions` parameter is consumed at
  `src/widgets/resolver-service.ts:72` (type) and `:180` (the resolution loop).
- A declarative-tier template references a region via `{"type": "region", "key": "footer"}`; a
  Liquid/Handlebars template via `{% render_block region: "footer" %}`; both resolve through
  `renderWidgetRegion()` — `src/server/http/site/render.ts:1579`, called from two call sites at
  `render.ts:1700` and `render.ts:1752`.

**No live theme declares this field today.** `grep -rln '"regions"' src/themes/` returns nothing.
The mechanism is real, tested (v1 §6.5 cites `theme.test.ts:186-226`), and exercised by nothing
currently shipping. Preserve this field's shape exactly as-is into schema v2 — it needs no rename
and no restructuring, only continued wiring.

## 10. `partials` (rename of `slots`) `[TARGET]`

Today's real field is `slots: Record<string, ThemeSlotDescriptor>` (`theme.ts:216-247`), consumed
by `resolveSlots()` and documented in full in v1 §3.1/§6.1. The debate's Decision 7 renames this
key to `partials` in schema v2 (flat, not nested under a `composition` wrapper — Codex's dissenting
proposal was not adopted; see the consensus report §"4/5, one holdout"). The per-entry shape
(`source`, a current-page opt-in, `variants`) is unchanged; only the manifest KEY renames. This has
not happened in code — every live `theme.json` still writes `slots`, and `loadTheme()` still only
parses `raw.slots` (`theme.ts:629`), not `raw.partials`.

Note the real field's honor-current-page flag is `honorsCurrentPage: boolean`
(`theme.ts:224-239`), not the string-typed `activeAttr` the debate's own ground truth (fed from an
earlier read of v1) assumed — `activeAttr` is accepted only as a legacy fallback spelling
(`theme.ts:230-238`, `373-375`). If you re-check this field against a checkout other than today's
`HEAD`, re-verify — this is exactly the kind of field whose precise shape has moved recently.

## 11. `render/` render-source folder `[TARGET]`

No theme on disk today has a `render/` folder. Every static theme keeps `pages/*.html` at its own
root alongside `css/`, `js/`, `nav.html`, `footer.html` — the flat layout v1 §4 documents in full.
A compiled theme's generated output (§4, §6) uses this same flat, non-`render/`-nested layout for
its `pages/`/`css/`/`js/` today; `build.artifactHashes` keys observed in real fixtures are flat
paths like `"css/styles.css"`, not `"render/pages/index.html"`-shaped ones.

The debate's rationale for `render/` (consensus report, disagreement A): `src/` is factually
accurate but practically dangerous (every framework ecosystem trains authors to treat `src/` as
"everything," colliding with `css/`/`scripts/`/`assets/` as deliberate top-level siblings);
`templates/` is simply false for static HTML and framework components. `render/`'s one rule
("everything the tier's renderer/adapter interprets lives here") is validator-checkable with no
ambiguity — but nothing checks it yet.

## 12. `ai/` — published-site agent surface `[NOT YET IMPLEMENTED]`

Zero implementation anywhere in this codebase. Verified: no hits for `capabilities.json`,
`elements.json`, or `scoring.json` anywhere under `src/`. No theme folder anywhere in this repo —
live, catalog, or marketplace fixture — has an `ai/` directory. This is not a stub or a partial
renderer (contrast §6's `code-tier-asset-normalizer.ts`, which is real code with zero callers); it
is a folder name and three filenames that exist only in the debate's proposal text and in this
document. Do not write code that reads or writes an `ai/` folder expecting existing scaffolding to
build on — there is none.

## 13. `AGENTS.md` (theme root) and `tests/` `[NOT YET IMPLEMENTED]`

Verified: `find src/themes -iname "AGENTS.md"` and `find src/themes -type d -iname "tests"` both
return nothing. No theme ships dev-time agent instructions or a `tests/cases.json` +
`fixtures/`/`golden/` contract. The render-settle event contract the debate proposed
(`{"event": "tovu:ready", "timeoutMs": ...}`, meant to fix `static/basic`'s own documented
mid-animation screenshot bug) is design text only — no test runner in this repo consumes it.

## 14. License / attribution / category / tags `[NOT YET IMPLEMENTED]`

Verified: `find src/themes -iname "LICENSE"` returns nothing — no theme ships a `LICENSE` file
today, structured or otherwise. `NOTICE.md` is the one REAL provenance mechanism in use today
(free-text prose, present on `basic`, `fuel`, `gracious-timing`, `portfolite`). `theme.json`'s real
`author?: string` field (`theme.ts:111-118`) is parsed and surfaced through the `theme_list`/
`theme_get` agent tools (`src/features/theme/tool-registrations.ts:118`), but nothing branches on
it, and it is a bare string, not the structured `authors`/`license`/`attributions` objects §5
proposes. `category`, `tags`, and `attributions` are parsed by nothing (`grep` for each across
`src/features/theme/` and `src/server/` returns zero non-test hits).

## 15. Read vs. dead vs. not-yet-implemented — the complete field table

| Field (schema v2 name) | Today's real equivalent | Status | Citation |
|---|---|---|---|
| `id`, `name`, `version` | same names | **REAL, read** | `theme.ts:610-613` |
| `tier` | same name, same 4 real values | **REAL, read** | `theme.ts:614`, `theme.ts:35` |
| `engine` (object) | `engine: number`, read but not branched on | **REAL field exists, TARGET restructure** | `theme.ts:110`, `theme.ts:615` |
| `description` | same name | **REAL, read** | `theme.ts:618` |
| `author` (string) | same name | **REAL, read + surfaced via agent tool** | `theme.ts:111-118`, `616`; `tool-registrations.ts:118` |
| `authors` (array of objects) | — | **TARGET, unread** | proposal only |
| `license`, `attributions` | — (only free-text `NOTICE.md` exists) | **TARGET, unread** | proposal only |
| `category`, `tags` | — | **TARGET, unread** | proposal only |
| `class` | `class?: "declarative"` declared in the TS interface | **DEAD — not even parsed from raw JSON** | `theme.ts:109`; absent from the `loadTheme()` manifest object at `610-630` |
| `build` | same name, same shape | **REAL, read + enforced (install-time gate)** | `theme.ts:60-99`, `617`, `640-693` |
| `build.framework` | closed union `react\|vue\|angular` | **REAL but narrower than TARGET's open vocabulary** | `theme.ts:344-347` |
| `fonts` (array of objects) | `fonts: string[]` (raw Google Fonts specs) | **REAL field exists, TARGET restructure** | `theme.ts:123-129`, `619` |
| `regions` | same name, same shape (`string[]`) | **REAL, wired, zero live consumer theme** | `theme.ts:130-140`, `620`; `pages.ts:164`; `resolver-service.ts:72,180`; `render.ts:1579,1700,1752` |
| `partials` | `slots` (different key, same per-entry shape) | **TARGET rename of a REAL field** | `theme.ts:216-247`, `629` — see §10 |
| `partials.<x>.inputs` | — | **TARGET, unread** | proposal only |
| `tokens` (nested object) | `modes: string[]` + `defaultMode: string`, both flat top-level | **REAL fields exist, TARGET restructure** | `theme.ts:190-207`, `627-628` |
| `templates` | `templates: string[]` (2026-08-11 unification, superseded `postTemplate`/`pageTemplate`) | **REAL, read + validated** | `theme.ts:161-189`, `626`; `validateTemplateDeclarations`, `theme.ts:511-536` |
| `apiVersion`, `$schema` | — | **TARGET, unread** | proposal only |
| `ai` | — | **NOT YET IMPLEMENTED anywhere** | see §12 |
| `assets.previewGallery` | — | **TARGET, unread** | proposal only |
| `scripts.entries` | — (real themes ship `js/*.js`, discovered by convention, not manifest-declared) | **TARGET, unread** | proposal only |
| `pages` (v1's own field) | — | **DEAD** (v1 §3.2) — `DiscoveredTheme.pages` comes from scanning `pages/` on disk, independent of this array | `theme.ts` (not parsed at all in v2's proposed shape either — carried as author documentation only if kept) |

## 16. Machine-checkable rules `[NOT YET IMPLEMENTED — no validator exists]`

Every rule below assumes a future `tovu theme validate` step. None of these are enforced today
except where noted "(already enforced)."

| Rule | Validator predicate (sketch) |
|---|---|
| A `declarative`-tier theme MUST NOT contain `scripts/` | `tier === "declarative" && exists("scripts/")` → reject |
| `build.source: "compiled"` REQUIRES `tier: "static"` | **(already enforced)** — `theme.ts:643-645` |
| `build.source: "compiled"` REQUIRES `build.sourceDir` (non-empty) | **(already enforced)** — `theme.ts:647-648` |
| `build.source: "compiled"` REQUIRES non-empty `build.artifactHashes` | **(already enforced)** — `theme.ts:650-651` |
| Every generated-tree file has a matching, correct `artifactHashes` entry; every listed hash resolves to a real file; no symlinks | **(already enforced)** — `checkBuiltThemeConformance`, `build-conformance.ts:435-460` |
| `build.sourceDir` MUST NOT equal or nest inside a reserved generated directory name (e.g. `preview`) | **(already enforced)** — `isSourceDirGeneratedConflict`, `theme.ts:653` |
| A theme-markup element MUST NOT carry `data-agent-element` (admin-only attribute) | `scan(html, /data-agent-element/) .length > 0` → reject |
| `id` in `theme.json` MUST equal the folder name | **(already enforced)** — `theme.ts:631` |
| A `templates` entry MUST resolve to a real `pages/<id>.html` with at least one `{"type":"content"}` marker | **(already enforced)** — `validateTemplateDeclarations`, `theme.ts:511-536` |
| `defaultMode` MUST be listed in `modes` | **(already enforced)** — `theme.ts:635-639` |
| Unknown top-level manifest fields REJECTED (fail-closed) | not enforced — `loadTheme()` silently drops any field it doesn't name (e.g. an unrecognized future key), it does not reject the manifest |

## 17. Minimal worked example per tier — illustrative TARGET shape

These are NOT runnable. No loader in this repo reads `render/`, `partials`, or `apiVersion` today.
They show the smallest complete file set schema v2 would require, for a future validator/migration
implementer to check their work against.

### 17.1 `static` tier (authored)

```
my-theme/
  theme.json
  tokens.json
  LICENSE
  css/theme.css
  render/
    pages/index.html
    partials/nav.html
    partials/footer.html
```

```jsonc
{
  "$schema": "https://tovu.dev/schemas/theme/v2/theme.schema.json",
  "apiVersion": 2,
  "id": "my-theme", "name": "My Theme", "version": "0.1.0",
  "tier": "static",
  "license": { "spdx": "MIT", "file": "LICENSE" },
  "tokens": { "defaultMode": "dark", "modes": { "dark": "tokens.json" } },
  "partials": {
    "nav":    { "source": "render/partials/nav.html" },
    "footer": { "source": "render/partials/footer.html" }
  }
}
```

### 17.2 `static` tier (compiled) — delta from 17.1

```
my-theme/
  theme.json                # build.source: "compiled"
  authoring/                # sourceDir — framework-native, e.g. an Astro project
    package.json
    src/...
  css/theme.css              # GENERATED — read-only
  render/pages/index.html    # GENERATED — read-only
```

```jsonc
{
  "id": "my-theme", "tier": "static",
  "build": {
    "source": "compiled", "framework": "astro", "sourceDir": "authoring",
    "artifactHashes": { "css/theme.css": "sha256:...", "render/pages/index.html": "sha256:..." }
  }
}
```

### 17.3 `templated` tier (LiquidJS)

```
storefront-2/
  theme.json
  tokens.json
  css/theme.css
  render/
    pages/home.liquid
    pages/entry.liquid
```

```jsonc
{ "id": "storefront-2", "tier": "templated", "engine": { "name": "liquid", "version": "1" } }
```

### 17.4 `declarative` tier

```
basic-declarative-2/
  theme.json
  tokens.json
  css/theme.css
  render/
    pages/home.json
    pages/entry.json
```

```jsonc
{ "id": "basic-declarative-2", "tier": "declarative" }
```

### 17.5 `code` tier

No worked example possible — `[NOT YET IMPLEMENTED]`, no loader branch, no renderer branch exists
for this tier at all (v1 §2.5). Do not build against it.

## 18. Gotchas

- **Do not read this document as describing today's runtime.** Every section header restates its
  status, but if you jump to a section mid-document (e.g. via a search result), re-check the tag
  before writing code or a claim based on it.
- **`regions` looking "unused" is not the same as "dead."** §9's real citation chain
  (`theme.ts` → `pages.ts` → `resolver-service.ts` → `render.ts`) is fully wired; it simply has no
  live theme content exercising it. Don't delete or "clean up" this field or its call sites on the
  assumption nothing depends on it.
- **`build.framework` accepting a value ≠ Tovu supporting that framework's output.** §6's Astro
  finding is the concrete proof: a real, default, unmodified `astro build` fails the install gate
  outright. A manifest can name any string as `framework` once the vocabulary widens (§6), but that
  says nothing about whether the conformance gate or normalizer actually accept that framework's
  real output today.
- **`slots`/`partials` naming collision risk if migrating by hand.** §10: today's field is `slots`
  with `honorsCurrentPage`/`variants` sub-keys; a naive migration script renaming just the top-level
  key without checking `activeAttr`-spelled legacy entries (`theme.ts:230-238`) will silently drop
  themes still using the pre-2026-08-10 spelling.
- **`ai/` and `code-tier-asset-normalizer.ts` are NOT the same kind of gap.** `ai/` is pure
  proposal text with zero code anywhere. The normalizer is real, tested code with zero callers.
  Don't describe them with the same language ("not implemented") — one needs to be built from
  scratch, the other needs to be wired up.
- **A theme id is unique per folder, not globally**, in both today's system and this design —
  `static/nordic` and `handlebars/nordic` can both exist and both claim id `nordic`;
  `duplicateThemeIds()` (`theme.ts:965-973`) surfaces this rather than silently resolving it. This
  document's folder rules do not change that invariant.

## 19. Open punch list — carried from the consensus report, not resolved by this document

1. ~~Fix the `build.sourceDir`-collides-with-a-reserved-directory-name gap~~ — **DONE, 2026-08-17.**
   `isSourceDirGeneratedConflict`, enforced in `loadTheme()` (`theme.ts:653`). See §6.
2. **Write the validator.** §16 states rules; nothing enforces the unshipped ones yet. Without it,
   this document is documentation, not a contract.
3. **Write `tovu theme migrate`** for the ~10 existing themes — mechanical (folder renames + one
   manifest rewrite pass) per every debate participant's assumption, but unverified against a real
   theme. Smoke-test against `static/basic` (the most complex real theme) before assuming it holds.
4. **Wire `code-tier-asset-normalizer.ts` into a real pipeline** — currently zero production
   callers (§6). Decide who invokes it (most likely a standalone CLI a theme author runs after
   their own framework build, consistent with "Tovu never runs the build").
5. **Confirm which real framework build configurations the normalizer/gate actually support**
   beyond the Angular spike (with its two required non-default flags) and the currently-FAILING
   default-Astro case, before advertising broader framework compatibility anywhere else in the
   docs.

## 20. Further reading

- `development/docs/themes/theme-authoring-guide.md` — v1, the system as it runs today. Read this
  first for any actual theme-authoring or debugging task.
- `ADS-memory/reports/swarm-consensus/runs/2026-08-17-tovu-theme-invariant-structure-consensus-report.md`
  — the full debate trace this document's design is drawn from, including the two corrections in
  §2 above and every rejected alternative with its reasoning.
- `src/features/theme/theme.ts`, `src/features/theme/build-conformance.ts`,
  `src/features/theme/theme-files.ts`, `src/features/theme/code-tier-asset-normalizer.ts`,
  `src/features/theme/marketplace.ts`, `src/core/embeds/marker.ts`,
  `src/server/middleware/theme-static-assets.ts` — the real source every `[REAL]` claim in this
  document cites. Re-check line numbers against current `HEAD` before trusting them verbatim.
