# Tovu Theme Authoring Guide v2 — Invariant Structure

> **Superseded 2026-09-24 by [`themes-guide.md`](themes-guide.md)**, the one source of truth for
> themes. This file is kept as internal history: its line citations and status tags may be stale,
> and parts of it describe the old v1 layout (`pages/`, `css/styles.css`, `js/`) or proposals that
> never shipped. Read the new guide first.


> ## STATUS — READ THIS BEFORE ANYTHING ELSE (corrected 2026-09-10)
>
> **Most of this design shipped the day after this document was written, and this banner did not
> keep up.** This document was created 2026-08-17 as a frozen, not-yet-built target design. Starting
> the very next day, 2026-08-18, five same-day milestones landed nearly the whole thing:
>
> - **Milestone 2** (`a69632b5`) — a real validator, `validateThemePackage`
>   (`apps/website/src/features/theme/validation/validate-theme-package.ts`), wired to both
>   `tovu theme validate <dir> --profile author|publish|install` (`cli/commands/theme/validate.ts`)
>   **and** the marketplace install path (`marketplace.ts:265`, `profile: "install"`) — a downloaded
>   theme is validated before it is ever copied onto disk.
> - **Milestone 3** — the `render/`-nested v2 folder layout (`render/pages/`, `render/partials/`,
>   `css/theme.css`, `scripts/`) is real, `apiVersion`-driven, and load-bearing — see §11 — and
>   `tovu theme migrate` (`26f19bf6`, `migration/migrate-theme.ts`) is a real, wired CLI that has
>   already migrated every built-in static theme plus `basic-declarative` onto it.
> - **Milestone 4** (`4af12853`) — `code-tier-asset-normalizer.ts` has a real caller:
>   `tovu theme normalize-build <dir> --primary-stylesheet <file>` (`cli/commands/theme/normalize-build.ts`).
> - **Milestone 5** — the generated `index.html` portability snapshot (§3) shipped the same day.
>
> **What is still genuinely unimplemented, verified 2026-09-10:** the `slots`→`partials` manifest key
> rename (§10), the `engine`/`tokens` object restructures (§5), `license`/`authors`/`attributions`/
> `category`/`tags`/`renderer`/`compatibility`/`assets.previewGallery`/`scripts.entries` (§5, §15), the
> `ai/` agent surface (§12), `AGENTS.md`-at-theme-root and `tests/cases.json` (§13), and shipped `LICENSE`
> files (§14). The validator (Milestone 2) actively polices this boundary: for an `apiVersion: 2`
> manifest it flags every one of these still-unread fields with a `v2-*-unimplemented` finding — a
> warning under `--profile author`, a hard error under `install`/`publish` — so "the validator accepts
> it" does not mean "the runtime honors it." See §16.
>
> **Every claim below is tagged one of three ways:**
>   - **`[REAL, path:line]`** — verified directly against code that exists in this repo today; the
>     citation is load-bearing, re-check the line number against current `HEAD` before trusting it
>     verbatim in a future session. Every real theme.json path/line citation in this document predates
>     the 2026-08-28 `src/` → `apps/website/src/` rename (`708e81b2`) — read `src/...` citations below as
>     `apps/website/src/...`; only line numbers move release to release, the prefix moved once, repo-wide.
>   - **`[TARGET]`** — part of the settled design, still genuinely not implemented. Nothing reads or
>     writes this shape today.
>   - **`[NOT YET IMPLEMENTED]`** — called out explicitly where a reader would otherwise assume
>     something exists because it's described in detail (`ai/`, `AGENTS.md`, `tests/`).
>
> If you are an agent about to write or edit an actual theme file in this repo right now: for the
> `static`/`templated`/`declarative`/`handlebars` folder layout (`render/pages/`, `render/partials/`,
> `css/theme.css`, `scripts/`) and `apiVersion: 2`, THIS document is now the accurate one — every
> built-in theme uses this shape. For the manifest FIELD shapes in §5 (`engine`, `tokens`, `partials`,
> `license`, etc.), v1's flat fields are still what the loader reads — see each field's own tag below
> before authoring against either shape.
>
> **v1 pointer:** `development/docs/themes/theme-authoring-guide.md` — descriptive of the loader's field
> parsing; its own path citations have a different, unrelated staleness problem (see §22).

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
root `AGENTS.md`, structured license fields, `apiVersion`) is carried forward unchanged, but **is no
longer uniformly `[TARGET]`** — corrected 2026-09-10. `render/` and `apiVersion` shipped 2026-08-18
(§11) and are load-bearing on every built-in theme; `data-tovu-agent`, root `AGENTS.md`, and structured
license fields are still genuinely unimplemented; `partials` (the `slots` rename) is still unread by the
loader but is now schema-checked and unimplemented-flagged by the validator (§10, §16). Check each
field's own tag rather than treating this list as one bucket.

## 3. Full invariant folder tree — authored theme `[REAL for static/templated/declarative/handlebars folder shape; TARGET for AGENTS.md/LICENSE/ai/tests contents]`

**Corrected 2026-09-10:** `render/pages/`, `render/partials/`, `css/theme.css`, and `scripts/` (renamed
from `js/`) are real, `apiVersion`-driven paths — `theme-layout.ts`'s `V2_LAYOUT`, selected whenever
`theme.json` declares `apiVersion: 2` (every built-in theme does; §11). `render`, `ai`, `tests`,
`AGENTS.md`, `LICENSE`, `package.json`, and the generated `index.html` are all members of the
validator's own approved-root allowlist (`validation/structure.ts`'s `V2_APPROVED_ROOTS`) — but
"approved to exist" is not "populated": no theme on disk ships `ai/`, `tests/`, `AGENTS.md`, or
`LICENSE` today (§12–§14 unchanged).

```
<theme-id>/                        # folder name MUST equal theme.json "id"
├── theme.json                     # REQUIRED — manifest, schema v2. build.source: "authored" (or build omitted)
├── index.html                     # GENERATED, OPTIONAL, static-tier only — portability-backup snapshot
│                                   #   of the home page (real nav/footer partials spliced in, dynamic
│                                   #   menu/post/content markers placeholdered); never hand-authored,
│                                   #   regenerated via `tovu theme generate-index <dir>` — same
│                                   #   generated/read-only framing as `preview/` below, one file
│                                   #   instead of a directory [REAL — static-portability-index.ts]
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
today — see §6 for citations. The BOTTOM HALF's status is **more real than originally stated, but still
unverified end-to-end** (corrected 2026-09-10): `build-conformance.ts`'s per-page checks
(`checkStylesheetSentinel`, `checkAssetPaths`) are themselves `apiVersion`-aware and expect
`../scripts/` (not `../js/`) for a v2 compiled theme — so the code CAN check a `render/`-nested compiled
output. But `validateThemePackage`'s v2-strict path explicitly does NOT run this conformance check at
all yet (`validate-theme-package.ts`'s own header: "that checker's own file-discovery still scans v1's
flat `pages/`/`css/`/`js/` layout"), and no theme on disk anywhere declares `build.source: "compiled"`,
so nothing exercises this combination for real. Treat the bottom half as "partially wired, never
run" rather than either fully `[REAL]` or fully `[TARGET]`.

## 5. `theme.json` schema v2 — field reference `[TARGET unless marked REAL]`

```jsonc
{
  "$schema": "https://tovu.dev/schemas/theme/v2/theme.schema.json",  // [TARGET — present on every shipped manifest, still unread]
  "apiVersion": 2,                                    // [REAL, read AND consumed — theme.ts:792, theme-layout.ts;
                                                        //   2026-09-10 correction, was marked TARGET]
  "id": "basic", "name": "Basic", "version": "0.1.0",                 // [REAL — theme.ts:786-791]
  "tier": "static",                          // static | templated | declarative | code — [REAL, unchanged]
  "engine": { "name": "liquid", "version": "1" },  // [TARGET restructure, STILL — theme.ts:794 only accepts a bare
                                                    //   number and silently drops an object to the `1` default;
                                                    //   `storefront`'s real, shipped theme.json ships this exact
                                                    //   object shape today and it is silently discarded, not an error]
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
- **`code-tier-asset-normalizer.ts` now has its one designed caller (corrected 2026-09-10, was "ZERO
  production callers").** Milestone 4 (2026-08-18, `4af12853`) shipped
  `tovu theme normalize-build <dir> --primary-stylesheet <file> [--pages <a,b>] [--json]`
  (`apps/website/src/cli/commands/theme/normalize-build.ts`, wired into `cli/program.ts`), a real,
  registered CLI subcommand that calls `normalizeBuildOutputDirectory` directly. This matches the
  design this document's own §19 punch list (item 4) predicted: "most likely a standalone CLI a theme
  author runs locally... after their own framework build." It is still never invoked automatically by
  Tovu itself (no theme install/publish path calls it) — that remains correct and is the intended
  design, not a gap: "Tovu never runs the build" (above). What changed is that the module is no longer
  dead code with only a test exercising it.
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

1. The parser itself — `src/contracts/core/embeds/marker.ts`. The file header states the vocabulary
   explicitly (lines 18-25): *"`type` and `id` are ordinary keys, not separate attributes, so a new
   key never requires a new attribute name."* The regex that locates every marker,
   `MARKER_PATTERN`, matches exactly one `data-embed-config='...'` attribute per element
   (`marker.ts:108`).
2. Live theme files, current `HEAD` —
   `grep -n "data-embed" content/themes/static/basic/pages/index.html content/themes/static/basic/nav.html content/themes/static/basic/footer.html`
   shows every marker in the shipped `basic` theme using this exact one-attribute shape (e.g.
   `content/themes/static/basic/pages/index.html:12`:
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

**No live theme declares this field today.** `grep -rln '"regions"' content/themes/` returns nothing.
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

## 11. `render/` render-source folder `[REAL — corrected 2026-09-10, was TARGET]`

**This section's original claim is now false.** `render/` shipped 2026-08-18 (Milestone 3) and is the
folder every built-in theme uses today, verified directly on disk and in the loader:

- `resolveThemeLayout(apiVersion)` (`apps/website/src/features/theme/theme-layout.ts`) is the one
  `apiVersion`-aware map: `apiVersion: 2` gets `pagesDir: "render/pages"`, `partialsDir: "render/partials"`,
  `scriptsDir: "scripts"`, `stylesheetFilename: "theme.css"`; anything else (including absent) gets v1's
  flat `pages/`, theme-root partials, `js/`, `styles.css`. `loadStaticTierAssets` (`theme.ts:752-775`)
  calls this to decide where to actually read pages/partials from — this is not cosmetic, a v2 theme's
  nav/footer/pages genuinely will not load from the v1 paths and vice versa.
- Non-static tiers get the same treatment independently: `loadTemplateSources` (`theme.ts:1026`) picks
  `render/pages` over `templates/` for `templated`/`declarative`/`handlebars` themes the same way.
- Every built-in static theme (`basic`, `basic-2`, `tailark-dusk`, `tailark-quartz-dark`,
  `tailark-quartz-libre` — verified on disk, `content/themes/static/*` and
  `sites/tovu-com/themes/static/*`), plus `declarative/basic-declarative` and both `templated/*` themes,
  ships `apiVersion: 2` and a real `render/` folder (`render/pages/`, plus `render/partials/` for the
  static ones) with NO flat `pages/`/root-partial files left behind — confirmed by direct directory
  listing, not inferred from the manifest alone.
- `tovu theme migrate` (`apps/website/src/features/theme/migration/migrate-theme.ts`, Milestone 3,
  `26f19bf6`) is the real, wired tool that performs this migration: stage → validate (both the
  Milestone-2 structural validator AND a real `loadTheme()` call) → atomic replace, with the pre-migration
  copy kept as a `backupDir`. `planV2Migration` (`migration/theme-migration-plan.ts:277-282`) has a plan
  for every tier except `code` (which has no runtime at all, §7).

What is genuinely still `[TARGET]`: the debate's validator-checkability claim now has a real,
partial answer rather than none — `validation/structure.ts`'s `checkApprovedRoots` enforces "everything
lives under one of `render`, `css`, `scripts`, `ai`, `tests`, …" as an allowlist of top-level root
names, but does not yet enforce the finer rule "everything the tier's renderer/adapter interprets lives
under `render/`" for files inside other approved roots.

## 12. `ai/` — published-site agent surface `[NOT YET IMPLEMENTED]`

Zero implementation anywhere in this codebase, reverified 2026-09-10: no hits for `capabilities.json`,
`elements.json`, or `scoring.json` anywhere under `apps/website/src/`. No theme folder anywhere in this
repo — live, catalog, or marketplace fixture — has an `ai/` directory, though `ai` is now an approved
(not required) root name in the validator's structure check (§3, §16). This is not a stub or a partial
implementation (contrast §6's `code-tier-asset-normalizer.ts`, which now has a real CLI caller as of
Milestone 4 — see §6, §19); it is a folder name and three filenames that exist only in the debate's
proposal text and in this document. Do not write code that reads or writes an `ai/` folder expecting
existing scaffolding to build on — there is none.

## 13. `AGENTS.md` (theme root) and `tests/` `[NOT YET IMPLEMENTED]`

Verified: `find content/themes -iname "AGENTS.md"` and `find content/themes -type d -iname "tests"` both
return nothing. No theme ships dev-time agent instructions or a `tests/cases.json` +
`fixtures/`/`golden/` contract. The render-settle event contract the debate proposed
(`{"event": "tovu:ready", "timeoutMs": ...}`, meant to fix `static/basic`'s own documented
mid-animation screenshot bug) is design text only — no test runner in this repo consumes it.

## 14. License / attribution / category / tags `[NOT YET IMPLEMENTED — but the requirement itself is now code-enforced, corrected 2026-09-10]`

`validateThemePackage`'s `checkV2PublishReadiness` (`validation/validate-theme-package.ts:136-151`) now
requires a non-empty `license` field, a non-empty `description`, and `assets/previews/card.webp` to
exist, resolved to a hard `error` under `--profile publish` (a warning otherwise via `profiles.ts`'s
severity table). No live theme satisfies this yet — none ships a `license` field or a `LICENSE` file —
so the on-disk facts below are unchanged; what changed is that the requirement moved from prose in this
document into an actual gate a real `tovu theme validate --profile publish` run will fail on.

Verified: `find content/themes -iname "LICENSE"` returns nothing — no theme ships a `LICENSE` file
today, structured or otherwise. `NOTICE.md` is the one REAL provenance mechanism in use today
(free-text prose, present on `basic`/`basic-2`; `fuel`, `gracious-timing`, and `portfolite` also
shipped one before their 2026-08-31 removal — unconfirmed-license Framer Marketplace derivatives).
`theme.json`'s real
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
| `partials` | `slots` (different key, same per-entry shape) | **TARGET rename of a REAL field — schema-checked and flagged `v2-partials-unimplemented` by the validator if present (§16)** | `theme.ts:495-508` (`parseSlots`, reads only `raw.slots`) — see §10 |
| `partials.<x>.inputs` | — | **TARGET, unread** | proposal only |
| `tokens` (nested object) | `modes: string[]` + `defaultMode: string`, both flat top-level | **REAL fields exist, TARGET restructure** | `theme.ts:190-207`, `627-628` |
| `templates` | `templates: string[]` (2026-08-11 unification, superseded `postTemplate`/`pageTemplate`) | **REAL, read + validated** | `theme.ts:161-189`, `626`; `validateTemplateDeclarations`, `theme.ts:511-536` |
| `apiVersion` | same name | **REAL, read + consumed (2026-09-10 correction, was TARGET)** — selects v1 vs. v2 folder layout | `theme.ts:792`, `theme-layout.ts` |
| `$schema` | — | **TARGET, unread** — present on every shipped manifest, but no code reads its value | proposal only |
| `ai` | — | **NOT YET IMPLEMENTED anywhere** | see §12 |
| `assets.previewGallery` | — | **TARGET, unread** | proposal only |
| `scripts.entries` | — (real themes ship `js/*.js`, discovered by convention, not manifest-declared) | **TARGET, unread** | proposal only |
| `pages` (v1's own field) | — | **DEAD** (v1 §3.2) — `DiscoveredTheme.pages` comes from scanning `pages/` on disk, independent of this array | `theme.ts` (not parsed at all in v2's proposed shape either — carried as author documentation only if kept) |

`engine`, `tokens`, `partials`, and `renderer` get a stronger validator treatment than plain "unread":
present-and-schema-valid still earns a `v2-<field>-unimplemented` finding (warning under `author`, hard
error under `install`/`publish`) — see §16. `scripts`, `assets`, `ai`, and `pages` get the same
unimplemented finding via a generic top-level-key sweep rather than a dedicated shape check.

## 16. Machine-checkable rules `[PARTIALLY REAL — corrected 2026-09-10, was "no validator exists"]`

**A real validator exists.** `validateThemePackage` (`apps/website/src/features/theme/validation/validate-theme-package.ts`,
Milestone 2, `a69632b5`, 2026-08-18) is wired to `tovu theme validate <dir> --profile author|publish|install`
(`cli/commands/theme/validate.ts`) **and** to the marketplace install path (`marketplace.ts:265`, always
run at `profile: "install"` before a downloaded theme is copied onto disk). For a manifest with
`apiVersion: 2` it runs a v2-strict path (`validation/manifest-v2.ts`'s `validateManifestV2`,
`validation/structure.ts`'s `checkApprovedRoots`/`checkSourceDirContainment`,
`validation/references.ts`'s `checkDeclaredReferences`); for any other manifest it defers to
`loadTheme()`'s own existing errors. Markup checks (`validation/markup.ts`) run for both. Findings carry
a `severity` resolved per-`profile` (`validation/profiles.ts`'s `resolveSeverity`) — the same finding can
be a warning under `author` and a hard error under `publish`/`install`.

| Rule | Status |
|---|---|
| A `declarative`-tier theme MUST NOT contain `scripts/` | still **not enforced** — no rule in `structure.ts` or elsewhere checks this |
| `build.source: "compiled"` REQUIRES `tier: "static"` | **(already enforced)** — `theme.ts:825-827` (`validateCompiledBuildManifest`) |
| `build.source: "compiled"` REQUIRES `build.sourceDir` (non-empty) | **(already enforced)** — `theme.ts:828-829` |
| `build.source: "compiled"` REQUIRES non-empty `build.artifactHashes` | **(already enforced)** — `theme.ts` (`validateCompiledBuildManifest`, artifactHashes branch) |
| Every generated-tree file has a matching, correct `artifactHashes` entry; every listed hash resolves to a real file; no symlinks | **(already enforced, v1 layout only — §4)** — `checkBuiltThemeConformance`, `build-conformance.ts:535` |
| `build.sourceDir` MUST NOT equal or nest inside a reserved generated directory name (e.g. `preview`) | **(already enforced)** — `isSourceDirGeneratedConflict`, `theme.ts:830` |
| A theme-markup element MUST NOT carry `data-agent-element` (admin-only attribute) | **(already enforced, both schema versions)** — `checkMarkupFile`, `validation/markup.ts:51-57` |
| `id` in `theme.json` MUST equal the folder name | **(already enforced, both schema versions)** — v1 via `theme.ts`; v2 via `checkV2ManifestIdMatch`, `validate-theme-package.ts:102-105` |
| A `templates` entry MUST resolve to a real `pages/<id>.html` with at least one `{"type":"content"}` marker | **(already enforced)** — `validateTemplateDeclarations`, `theme.ts:615-641` |
| `defaultMode` MUST be listed in `modes` | **(already enforced, v1 path)** — `theme.ts` (`validateManifestCrossFields`) |
| Unknown top-level manifest fields REJECTED (fail-closed) | **(already enforced for `apiVersion: 2` manifests only, corrected 2026-09-10, was "not enforced")** — `validateManifestV2`'s `V2_TOP_LEVEL_KEYS` allowlist (`validation/manifest-v2.ts:81-`); a v1 (no-`apiVersion`) manifest is still unaffected — `loadTheme()` itself still silently drops unknown keys |
| A `data-embed-config` marker's `type` MUST be a recognized value; the attribute MUST be single-quoted | **(already enforced, both schema versions — not in the original table)** — `checkMarkupFile`, `validation/markup.ts:59-83` |
| Publish readiness: non-empty `license`, non-empty `description`, `assets/previews/card.webp` present | **(already enforced under `--profile publish`, not in the original table)** — `checkV2PublishReadiness`, `validate-theme-package.ts:136-151` — see §14 |

## 17. Minimal worked example per tier — partially runnable, corrected 2026-09-10

**These examples are more real than "NOT runnable" states.** `render/` and `apiVersion` are both read
by `loadTheme()` today (§11), so 17.1's file tree would actually load as `status: "valid"` — but not
quite for the reasons the manifest states. `loadTheme()` never reads the `license`, `tokens` (nested),
or `partials` keys shown below; it would load nav/footer via `DEFAULT_THEME_SLOTS`'s fallback
(`theme.ts:318-321`, `{source: "nav.html"}`/`{source: "footer.html"}`) resolved against `render/partials/`
(the v2 `partialsDir`) — which happens to match this example's own `render/partials/nav.html`/
`footer.html` files, so nav/footer would in fact resolve, coincidentally rather than because the
manifest's `partials` block did anything. Running `tovu theme validate <dir> --profile author` against
17.1 would report `v2-partials-unimplemented`/`v2-tokens-unimplemented` warnings (§16) for exactly the
fields the runtime ignores — that command is the accurate way to check one of these examples now,
where before there was nothing to run at all.

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
- **`ai/` and `code-tier-asset-normalizer.ts` are STILL NOT the same kind of gap, but the normalizer's
  gap closed (corrected 2026-09-10).** `ai/` is pure proposal text with zero code anywhere. The
  normalizer now has a real CLI caller (`tovu theme normalize-build`, Milestone 4, §6, §19) — it needed
  wiring, and got it. Don't describe them with the same language ("not implemented") — `ai/` needs to be
  built from scratch; the normalizer is done.
- **A theme id is unique per folder, not globally**, in both today's system and this design —
  `static/nordic` and `handlebars/nordic` can both exist and both claim id `nordic`;
  `duplicateThemeIds()` (`theme.ts:965-973`) surfaces this rather than silently resolving it. This
  document's folder rules do not change that invariant.

## 19. Open punch list — carried from the consensus report

1. ~~Fix the `build.sourceDir`-collides-with-a-reserved-directory-name gap~~ — **DONE, 2026-08-17.**
   `isSourceDirGeneratedConflict`, enforced in `loadTheme()`. See §6.
2. ~~Write the validator.~~ — **DONE, 2026-08-18 (Milestone 2, `a69632b5`).** `validateThemePackage`,
   wired to `tovu theme validate` and the marketplace install path. See §16.
3. ~~Write `tovu theme migrate`~~ — **DONE, 2026-08-18 (Milestone 3, `26f19bf6`).** Not just built but
   already run: every built-in `static` theme plus `basic-declarative` is migrated, verified on disk.
   See §11.
4. ~~Wire `code-tier-asset-normalizer.ts` into a real pipeline~~ — **DONE, 2026-08-18 (Milestone 4,
   `4af12853`).** `tovu theme normalize-build`, exactly the "standalone CLI a theme author runs after
   their own framework build" shape this item predicted. See §6.
5. **Confirm which real framework build configurations the normalizer/gate actually support** — still
   open, reverified 2026-09-10: `build.framework` is still a closed `react|vue|angular` union
   (§6), the Astro conformance test still fails the same two ways, and no v2-declared compiled theme
   exists to test the `render/`-nested conformance path at all (§4). Confirm before advertising broader
   framework compatibility anywhere else in the docs.

## 20. Further reading

- `development/docs/themes/theme-authoring-guide.md` — v1, the system as it runs today. Read this
  first for any actual theme-authoring or debugging task.
- `ADS-memory/reports/swarm-consensus/runs/2026-08-17-tovu-theme-invariant-structure-consensus-report.md`
  — the full debate trace this document's design is drawn from, including the two corrections in
  §2 above and every rejected alternative with its reasoning.
- `apps/website/src/features/theme/theme.ts`, `apps/website/src/features/theme/theme-layout.ts`,
  `apps/website/src/features/theme/build-conformance.ts`, `apps/website/src/features/theme/theme-files.ts`,
  `apps/website/src/features/theme/code-tier-asset-normalizer.ts`,
  `apps/website/src/features/theme/marketplace.ts`,
  `apps/website/src/features/theme/validation/{validate-theme-package,manifest-v2,structure,markup,references,profiles}.ts`,
  `apps/website/src/features/theme/migration/{migrate-theme,theme-migration-plan}.ts`,
  `apps/website/src/cli/commands/theme/{validate,migrate,normalize-build}.ts`,
  `apps/website/src/contracts/core/embeds/marker.ts`,
  `apps/website/src/server/middleware/theme-static-assets.ts` — the real source every `[REAL]` claim in
  this document cites (paths corrected 2026-09-10 for the `src/` → `apps/website/src/` rename,
  `708e81b2`, 2026-08-28). Re-check line numbers against current `HEAD` before trusting them verbatim.

## 21. `templates` content-template naming convention — `posts-*` / `pages-*` `[DECISION, layered on a REAL field]`

Added 2026-09-03, after the rest of this document. The §15 table already marks `templates` **REAL,
read + validated** (`theme.ts:161-189, 626`; `validateTemplateDeclarations`, verify against current
`HEAD` — cited as `theme.ts:511-536` there but re-confirmed at `theme.ts:615-641` as of this addition,
consistent with this document's own "line numbers move" disclaimer). This section layers a naming
**convention** — not a schema change — onto that already-real field: a `templates` entry is named for
the content kind it was designed for, `posts-*.html` for Posts, `pages-*.html` for Pages (e.g.
`posts-default.html`, `posts-sidebar.html`, `pages-default.html`). It does not apply to a static
theme's standalone route pages (`index.html`, `about.html`, `blog.html`, `404.html`, etc.), which
are routes, not `templates` entries.

**Descriptive, not enforced — the entire mechanism this convention sits on top of was deliberately
built kind-agnostic.** Neither `validateTemplateDeclarations` nor the render path checks a template's
filename against the `kind` of the row selecting it via `templateChoice`; a Post may select a
`pages-*` template and a Page may select a `posts-*` template, and both render exactly as chosen.
Full reasoning, the live cross-kind evidence, and the partial-adoption state (only
`sites/tovu-com/themes/static/basic/` renamed so far; `content/themes/static/basic/` and four other
themes still ship the pre-convention names) are documented in the primary source for this convention,
`development/docs/themes/theme-authoring-guide.md` §7.3, and
`ADS-memory/reports/architecture/ADR-065-content-template-naming-convention.md` — not duplicated here.

**Superseded 2026-09-10:** the narrow correction this paragraph made for `basic` alone (2026-09-03) has
been folded into a full rewrite of the top banner and §§2–19 above — the migration turned out to cover
every built-in theme, not just `basic`, and shipped 2026-08-18 (the day after this document was
written), not 2026-09-03. This paragraph is kept for its own history; treat the top banner as the
current, complete statement rather than re-deriving it from this section.

## 22. v1's own staleness — a different kind of problem, noted but not fixed here

Checked 2026-09-10 while re-grounding this document: v1 (`theme-authoring-guide.md`) does NOT share
this document's "describes a design that doesn't exist" problem — its own status line correctly says
it's descriptive, and its substantive claims about loader/renderer behavior were not re-verified line by
line here (out of this pass's scope). But its path citations have a different, repo-wide staleness: v1
cites bare `src/...` paths throughout (e.g. `src/server/deps.ts:143-145`, `src/features/theme/theme.ts:265-400`)
that predate the 2026-08-28 `src/` → `apps/website/src/` rename (`708e81b2`) — that path no longer
exists at all (verified: `ls src/features/theme/theme.ts` fails, `src/` is gone). v1 was still being
edited as late as 2026-09-03 (the same `posts-*`/`pages-*` convention commit §21 cites) without this
prefix ever being fixed, so every citation in that document needs the same mental `apps/website/` prefix
this document's own citations now carry (see §20). Flagged for whoever next touches v1; not corrected
here since fixing it properly means re-verifying v1's actual line numbers against current `HEAD`, not
just prepending a string, and that is a separate, larger pass over a much longer document.
