# Round 3 — Correcting the build/tier decisions against shipped code

You (or a peer in your model family) participated in Rounds 1-2 of this debate about Tovu's invariant theme folder/manifest shape. Rounds 1-2 converged near-unanimously on an 11-point shape. **Two of those points — Decision 5 (build output) and Decision 13 (tier taxonomy) — are confirmed WRONG**, contradicted by real, shipped code neither round's file access included. This round exists to fix just those two, and work out what they imply for the rest of the already-converged shape.

## What Rounds 1-2 got wrong, and why

Decision 5 said: "build output (`dist/`) never lives inside a theme's own author folder, any tier, no exceptions — the marketplace must sandbox-build untrusted third-party source itself." Decision 13 said: introduce a new `framework` tier alongside `static`/`templated`/`declarative` for React/Vue/Svelte/etc.

Both are contradicted by **`ADR-020 §5`, shipped 2026-08-12** (three days before this debate started) — verified directly against source, not inferred:

```typescript
// src/features/theme/theme.ts:60-93
export interface ThemeBuildInfo {
  source: "authored" | "compiled";
  framework?: "react" | "vue" | "angular";   // purely descriptive, never branched on
  sourceDir?: string;    // compiled only, REQUIRED — author's pre-build source root, relative to theme folder
  builderVersion?: string;
  lockfileHash?: string;
  artifactHashes?: Record<string, string>;   // compiled only, REQUIRED non-empty — sha256 per generated file
}
export interface ThemeManifest {
  // ...
  build?: ThemeBuildInfo;
}
```

Real, load-bearing facts:

1. **`source: "compiled"` REQUIRES `tier: "static"`** — enforced in `loadTheme()` (`theme.ts:640-650`, `manifest.tier !== "static"` is a hard validation error when `build.source === "compiled"`). There is no separate `framework`/`component` tier, and the shipped comment states why: *"a compiled theme's RUNTIME is a `static` theme; there is no server-executing tier this maps onto."*
2. **Tovu never runs a build.** Quoted directly from the code: *"the author or publisher CI builds; Tovu never runs the build."* Trust comes from `artifactHashes` (verified against real files by `checkBuiltThemeConformance()` in `build-conformance.ts`, a 26KB install-time conformance gate: stylesheet sentinel, asset-path checks, a `data-tovu-island` empty-content check, symlinks refused outright) plus that hash check — never a platform sandbox rebuild.
3. **A compiled theme has a real source/generated split, not a source-only folder.** `build.sourceDir` (required when compiled) names the author's pre-build project root — everything under it, plus `theme.json`, stays per-file editable exactly like an authored theme. Everything OUTSIDE `sourceDir` is the generated output (real `pages/`/`css/`/`js/` a framework's own build produced) and is READ-ONLY through every per-file editing surface, restored only as one whole release, never file-by-file.
4. **Supporting infrastructure already exists and is tested:** `code-tier-asset-normalizer.ts` (`AssetRelocationPlan`, `normalizeBuildOutputDirectory()`, `rewriteBundlerHtml()`, `rewriteCssRelativeUrls()`) relocates/rewrites a raw framework build's output into Tovu's asset-path conventions — verified against a real Angular `ng build` output and a real Astro build (`src/features/theme/__tests__/astro-real-bundler-conformance.test.ts`, and a documented spike at `ADS-memory/reports/spikes/20260812-angular-code-tier-build-output-verification.md`). `marketplace.ts` (`listMarketplaceThemes`, `downloadMarketplaceTheme`, `ThemeLineage`) is a real, working theme catalog/download/lineage system — the "marketplace build pipeline" Round 2's punch list called out of scope is already built, at least for cataloging/distribution (not necessarily for building — see open question 3 below).
5. **A separate, smaller data point:** `src/themes/static/basic/preview/` is real, git-committed, generated content living inside a first-party theme folder today (a `build-preview.mjs` script's output). This is a DIFFERENT mechanism from `build.source: "compiled"` — dev-tooling preview generation, not framework build provenance — but it's a second real precedent against an absolute "a theme folder never contains generated content, no exceptions" rule.

## What still stands from Round 1-2, unaffected by this correction

`render/` as the invariant render-source folder for AUTHORED (non-compiled) theme content; root `AGENTS.md` separate from runtime `ai/`; structured `license`/`attributions`/`category` fields; `partials` (not `slots`) as the manifest key; `apiVersion`/`$schema` versioning; the two-artifact (human guide + machine spec) documentation split; `regions`/`modes`/`defaultMode` preserved as-implemented; `data-tovu-agent` as a distinct attribute name from the admin's `data-agent-element` (though note: naming alone isn't a security fix without validator enforcement, which doesn't exist yet — say so plainly if you address this, don't overclaim).

## Open questions for this round

1. **Confirm or refute:** should `build.source: "compiled"` ever be allowed on a tier other than `static` in the future, or is the static-only gate permanently correct by construction (since any framework's build output is static HTML/CSS/JS at runtime, full stop)? Give your reasoning, not just a restatement of the shipped constraint.
2. **The `sourceDir`/generated-tree split vs. the rest of the invariant shape:** should the generated tree (everything outside `sourceDir` in a compiled theme) be required to conform to the exact same `render/`/`css/`/`scripts/`/`assets/` shape as an authored theme — so a consumer (render pipeline, validator, coding agent) never needs to know or care whether a theme is authored or compiled? Or does compiled output need its own, different invariant shape? The Coordinator leans toward "same shape, normalizer's job to get it there" — push back if you disagree.
3. **Should `sourceDir` itself be constrained to any convention** (e.g., must be named `src/`, must live at a specific depth), or fully exempt from every other rule in this spec (arbitrary author-chosen layout, since it's pre-build source Tovu never directly consumes, not runtime-served content)? The Coordinator leans toward fully exempt — the field is already author-declared specifically to avoid assuming a `src/` convention (see the interface's own doc comment above). Agree or push back.
4. **Does `build.framework` (currently `"react" | "vue" | "angular"` only) need to widen** given Round 1-2 already discussed Svelte, Astro, Solid, Qwik, and Web Components as real candidates for what themes could be built with? If so, is this purely additive (add more string literals) or does it interact with anything else?
5. **Give a ranked solution slate** (per the Solution Slate Protocol, required from this synthesis round on) for how `theme.json`'s `build` object should be presented in the new schema v2 — carried forward verbatim from `ADR-020 §5` with zero changes (option A), same shape but renamed/reorganized to match the new schema's conventions (option B), or something else you think is stronger — with real trade-offs, not just a preference.

## What to do

Give your position on all 5 open questions above, back your leading recommendation with a concrete `theme.json` sketch for BOTH an authored and a compiled example of the same theme kind, and a corrected folder-tree fragment showing where `sourceDir` sits relative to the rest of the invariant shape. This round is narrowly scoped — do not re-relitigate the render-folder-name, agent-attribute, or slots-vs-partials questions from Rounds 1-2; those are settled and out of scope here unless this correction genuinely changes one of them (say explicitly if you think it does, and why).
