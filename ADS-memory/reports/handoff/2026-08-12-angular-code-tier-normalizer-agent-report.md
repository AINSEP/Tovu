# Agent report — Angular code-tier build verification + normalizer

**Date:** 2026-08-12 · **Agent:** Sonnet 5, Programmer persona · **Branch:** `general-work`
**Commits:** `0f593a4`, `e850217`, `9754f67`, `8e9f7c4`, `411eace`, `3b48ef3`, `e2d0a0f`, `0e3f77a`, `40f4b3d`

---

## Lead with the gap, not the achievement

**This module has zero callers.** `code-tier-asset-normalizer.ts` is not invoked anywhere in this
repository outside its own test file — no CLI entrypoint, no `package.json` script, no reference from
`theme.ts`'s manifest/loader path, no wiring into `checkBuiltThemeConformance`'s install-time gate
(which validates an *already-normalized* theme's output and has no opinion on how it got that way). A
security pass earlier today found three separate feature slices shipped in exactly this state —
hardened, tested, unreachable — and it found them, not their authors. This is the fourth, and it is
disclosed here rather than left for the next audit to surface.

This was a deliberate scoping decision, not an oversight: the task was to verify a debated claim and
build the transform's correctness, not to decide who runs it. Wiring it up would take three things:

1. **Deciding who invokes it.** Most likely a standalone CLI/script an Angular theme author runs
   locally or in their own CI, immediately after `ng build` — consistent with this codebase's "Tovu
   never runs the build" decision (`build-conformance.ts`'s own file header cites the same
   `worker_threads`-isn't-code-isolation reasoning for that decision). Running it server-side inside
   Tovu's own process would be a separate, larger architectural call, not an extension of this module.
2. **An entrypoint** that stops requiring a caller to supply `outputDir`/`pageFileNames`/
   `primaryStylesheetFile` by hand — deriving them from `angular.json`/`theme.json` instead.
3. **Theme-authoring documentation** for the full `ng build` → normalize → compute `artifactHashes` →
   publish workflow, which does not exist anywhere yet.

This is also documented in the module's own file header (`code-tier-asset-normalizer.ts`'s "Still
open" section) so it survives independent of this report.

## What was verified, and what turned out to be wrong

A prior debate doc (`ADS-memory/reports/swarm-consensus/offloads/2026-08-12-code-tier/sonnet5-round3.md`)
flagged as **unverified but load-bearing**: whether Angular can be configured to emit Tovu's literal
stylesheet sentinel and `../css/`/`../js/` asset-path contract. Rather than build against that
assumption, a throwaway Angular CLI 21.2.21 project was scaffolded in scratchpad and really built —
full findings in `ADS-memory/reports/spikes/20260812-angular-code-tier-build-output-verification.md`.

The prior doc's bottom line (a normalizer is required) held up. Its specific mechanism did not: it
worried Angular might emit root-absolute (`/styles.css`-style) hrefs, unreachable by a relative-path
fix. Real output showed bare relative hrefs instead — not the blocker. **The actual blocker, found
empirically and not previously identified by anyone:** Angular's default production build runs
Beasties (critical-CSS inlining), which rewrites the plain `<link rel="stylesheet">` into an inlined
`<style>` block plus an async-loading `<link media="print" onload=...>` plus a duplicate
`<noscript><link></noscript>` — none of which can ever contain the literal sentinel string, regardless
of path or hashing config. This is now documented as a **required**, not optional, author-side setting
in the normalizer's own file header: `optimization.styles.inlineCritical: false`, alongside
`outputHashing: "none"`. `rewriteBundlerHtml` throws rather than silently ships a page missing the
sentinel if it finds the Beasties shape instead of the plain tag it expects.

**Product statement, also elevated into the module's own header** (where a theme author building
against it will actually read it, not buried in a spike doc): "Angular support" means *prerendered*
Angular only. A CSR-only build ships `<app-root></app-root>` as literally empty raw HTML; all content
arrives after client-side hydration, invisible to GPTBot/ClaudeBot/PerplexityBot (none execute
JavaScript) and delayed for Googlebot's two-phase indexing — for the *entire page*, worse than the
single-island emptiness `checkIslandContent` already guards against. `ng add @angular/ssr` with
`outputMode: "static"` and prerendering every indexable route is a hard requirement this module does
not itself enforce (it normalizes whatever HTML it's given).

## What was built

- **`checkAssetPaths` vacuity fix** (`build-conformance.ts`) — a page shipping zero `../css/`/`../js/`
  references used to pass silently, indistinguishable from a page whose assets were actually verified.
  Now reports an explicit finding. Required honestly strengthening
  `astro-real-bundler-conformance.test.ts`'s assertions (1 issue → 2 for real, unmodified Astro output).
- **`code-tier-asset-normalizer.ts`** — pure core (`planAssetRelocation`, `rewriteBundlerHtml`,
  `rewriteCssRelativeUrls`) plus an fs-effectful orchestrator (`normalizeBuildOutputDirectory`) that
  relocates a flat build's CSS/JS output into `css/`/`js/`, rewrites the referencing HTML tags to the
  exact sentinel and relative-path contract, rewrites a relocated CSS file's own `url(...)` references
  to compensate for the directory-depth shift, relocates `.js.map`/`.css.map` sourcemaps alongside
  their bundle, and deletes Angular SSR's unused `index.csr.html` CSR-fallback shell. 17/17 tests
  passing, `tsc` clean.

## Test-evidence tier: fixture-based, not live — read the label before citing this as "Angular works"

Per team-lead decision (option C of three proposed, 2026-08-12): stayed fixture-based rather than add
Angular as a devDependency. Measured cost: ~286MB `node_modules` (Astro's own footprint for comparison:
~6.8MB) plus a real `express` major-version divergence (Tovu depends on `^4.21.2`; Angular SSR's own
scaffold wants `^5.1.0`). Reasoning: Angular is currently *speculative* code-tier support with no
reference theme shipping; Astro earns its live-build test
(`astro-real-bundler-conformance.test.ts`, a real `astro build` subprocess) because Astro is real here.
Angular does not earn it yet.

`code-tier-asset-normalizer.test.ts`'s own header states this plainly: its Angular fixtures are **frozen
captures from Angular CLI 21.2.21, taken 2026-08-12, not live build output.** Named explicitly, what
this cannot catch: a future Angular version changing how `outputHashing: "none"` names bundles,
changing what Beasties (or its successor) does even with `inlineCritical: false`, or emitting a subtly
different `<link>`/`<script>` tag shape than the one frozen here — this test suite will keep passing
against the old, stale shape while real current `ng build` output silently diverges from it.
**Revisit trigger, recorded in that same header:** when Angular ships as a real reference theme (the
same bar Astro already cleared), replace the fixture with a live `ng build` subprocess test in the
shape of `astro-real-bundler-conformance.test.ts`, and re-measure the devDependency cost above rather
than assuming these 2026-08-12 numbers still hold.

## Sourcemap fix (closed, not left as a caveat)

Self-caught during the function-quality review, not from build output (the validated config uses
`sourceMap: false`, so it never surfaced empirically): a `.js.map`/`.css.map` file doesn't end in
`.js`/`.css`, so it wasn't relocated alongside its bundle — the bundle's own `sourceMappingURL` comment
would then point at a file that no longer exists at that location once the bundle moved. Per team-lead
direction this was fixed, not just documented: `planAssetRelocation` now relocates a sourcemap into the
same target directory as its bundle purely from the map's own extension (`.js.map`/`.mjs.map` → `js/`,
`.css.map` → `css/`); because both halves of a pair move together, their relative reference to each
other survives untouched with no comment rewriting needed. Two new tests pin this (classification, and
an end-to-end fs test proving both files really move and the `sourceMappingURL` reference stays valid).
Explicitly still out of scope: a sourcemap's own internal `sources`/`sourceRoot` JSON fields
(build-time-absolute paths to original `.ts` sources) — unrelated to the 404 this fixes, and a
pre-existing property of every bundler's sourcemap output that Tovu never serves original sources for
regardless.

## Process note: a git-stash mistake, caught and reasoned through, no damage done

While verifying the sourcemap fix's RED state, `git stash push -- <path>` / `git stash pop` was used to
temporarily revert the implementation file. This repo's git index is shared across concurrently running
agents (a standing, documented risk); the pop landed on a **different agent's** unrelated stash entry
(`AssistantDock.tsx` WIP) instead of this agent's own, and failed to apply (left "kept" in the stash
list) rather than corrupting anything. Verified before proceeding: no conflict markers anywhere in the
repo, the target file's content was exactly as intended, and the two other agents' pre-existing stash
entries were untouched. No further stash operations were performed. Recorded here so this specific
mistake — using `git stash` at all in a shared-index multi-agent session — isn't repeated.

## Full commit chain

| Commit | What |
|---|---|
| `0f593a4` | Phase 1 empirical verification (real `ng build`, not inference) |
| `e850217`, `9754f67` | `checkAssetPaths` vacuity-detection RED test, then fix |
| `8e9f7c4` | Normalizer pure core: `planAssetRelocation`, `rewriteBundlerHtml` |
| `411eace` | fs-effectful orchestrator: `normalizeBuildOutputDirectory` |
| `3b48ef3` | Sourcemap-gap disclosure (documented, not yet fixed at that point) |
| `e2d0a0f` | CSS `url()` fix + `index.csr.html` deletion; required-config labeling; frozen-fixture relabeling |
| `0e3f77a` | Zero-callers gap named in the module's own header |
| `40f4b3d` | Sourcemap-relocation fix, closed (not just documented) |

## Scope discipline

Touched only: `src/features/theme/build-conformance.ts`, `src/features/theme/static-asset-contract.ts`
(read-only), `src/features/theme/code-tier-asset-normalizer.ts` (new), their tests, and
`ADS-memory/reports/`. Never touched `theme.ts`'s manifest/loader, `src/features/agent-plugins/**`,
`src/features/commerce/**`, `src/server/**`, theme asset-serving/route files, or any other agent's
concurrent work (`SecurityPass` in the theme write/serve paths, `LiquidPreview` in
`apps/admin/src/features/themes/**`) — confirmed via `git status`/`git diff --stat` against those paths
before every commit in this chain.
