# Angular code-tier build-output verification (Phase 1)

**Date:** 2026-08-12
**Author:** Programmer subagent, dispatched by team-lead to verify an unverified claim from `ADS-memory/reports/swarm-consensus/offloads/2026-08-12-code-tier/sonnet5-round3.md` (lines 26, 605) before building anything.

## What was claimed, and what this spike tested

The round-3 debate doc explicitly flagged as **unverified but load-bearing**: whether Angular's build can be configured to emit the literal `TOKEN_STYLESHEET_SENTINEL` (`src/features/theme/static-asset-contract.ts:21`) — specifically whether `outputHashing: "none"` removes filename hashing, whether Angular's output can be split into `css/`/`js/` subdirectories by configuration, and whether Angular emits root-absolute (`/styles.css`) or relative hrefs.

This spike scaffolded a real Angular CLI project in the scratchpad (not the repo — no Angular dependency was added to Tovu) and ran real builds to answer each sub-question with actual build output, not inference.

**Environment:** Angular CLl `21.2.21` (`@angular/build:application` esbuild-based builder), Node v24.2.0. `@angular/cli@latest` (22.1.3) refused to run on this Node version (`engines` requires `^22.22.3 || ^24.15.0 || >=26.0.0`); 21.2.21 (`engines: >=24.0.0`) was used instead and is close enough in build-output shape for this purpose — the esbuild-based `@angular/build:application` builder has been the default since Angular 17 and its HTML-injection/optimization pipeline (`index.ts`, Beasties) has not changed shape across that range.

## Findings — each backed by real build output or a fetched doc

### 1. Default output layout is genuinely flat, and no config option splits it into `css/`/`js/`

`ng build` (defaults) produces:
```
dist/probe-app/browser/
  index.html
  favicon.ico
  main-ILULY5CZ.js
  styles-5INURTSO.css
```
No subdirectories for JS or CSS. Verified two ways this is not just "the default" but **has no configuration escape hatch**:
- Read `node_modules/@angular/build/src/builders/application/schema.json`'s full `outputPath` option: it supports only `base`/`browser`/`server`/`media` — top-level directory *names*, not an asset-type split. `media` covers only images/fonts copied via `optimization.fonts`/asset globs, not JS or CSS bundles.
- WebFetched `https://angular.dev/reference/configs/workspace-config` directly and asked it explicitly whether any option produces a css/js split: confirmed no such option exists in the current docs.

**This part of the prior claim is CONFIRMED TRUE.**

### 2. `outputHashing: "none"` does remove filename hashing — confirmed

With `outputHashing: "none"` set on the `production` configuration, the same build produces `main.js` and `styles.css` (no hash suffix). **Confirmed true**, exactly as the prior claim stated.

### 3. Angular does NOT emit root-absolute hrefs — this part of the prior hypothesis was wrong

The prior debate doc worried Angular might rewrite asset paths to `/assets/`-style absolute URLs "regardless of hashing config," which would make the `../css/` relative form structurally unreachable. **Not what was observed.** With `outputHashing: none`, the generated `index.html` contains:
```html
<link rel="stylesheet" href="styles.css">
...
<script src="main.js" type="module"></script>
```
These are **bare, relative filenames** (not `/styles.css`), resolved against `<base href="/">`. There is no root-absolute rewriting to fight. This is actually easier to work with than the prior hypothesis assumed.

### 4. A bigger, previously-unidentified obstacle: Beasties (critical-CSS inlining) is on by default

This is the one thing the prior debate doc's speculation missed entirely. Angular's production `optimization` defaults (`optimization.styles.inlineCritical: true`) run **Beasties** (formerly Critters) after the build, which rewrites the plain `<link>` into:
```html
<style>body{margin:0;...}</style><link rel="stylesheet" href="styles.css" media="print" onload="this.media='all'"><noscript><link rel="stylesheet" href="styles.css"></noscript>
```
— an inlined `<style>` block, an async-loading `<link media="print" onload=...>`, and a duplicate `<noscript><link>` fallback. **This alone defeats the sentinel match regardless of path or hashing** — there is no way a literal `<link rel="stylesheet" href="../css/styles.css" />` can appear when Beasties has restructured the tag this way. It is disableable: `optimization.styles.inlineCritical: false` (schema-confirmed option, `@angular/build/.../schema.json:243`) produces a single plain `<link rel="stylesheet" href="styles.css">` with no inlining, no async pattern, no duplicate. Confirmed by rebuilding with the option off.

### 5. `ng add @angular/ssr` + `outputMode: 'static'` genuinely prerenders real content, not an empty mount

Ran `ng add @angular/ssr --skip-confirmation`, set `outputMode: 'static'` (the default is `'server'`), left the schematic's default `RenderMode.Prerender` for `**`. Build output: `Prerendered 1 static route.` The resulting `browser/index.html`'s `<app-root>` contains the **full real component markup** (headings, SVG logo, links, actual text) — not `<app-root></app-root>`. This confirms the product statement in the dispatch brief: Angular support genuinely means **prerendered** Angular, and that prerendering is not a formality — it's what makes the page's content visible to non-JS crawlers at all (CSR-only Angular ships a literally empty `<app-root></app-root>` body, which is worse than the `data-tovu-island` empty-mount problem `checkIslandContent` already guards against — it's the *entire page* that's invisible pre-hydration, not just one marked island).

### 6. End-to-end validation: a hand-applied normalizer transform passes the REAL gate cleanly

To find out whether a normalizer is not just necessary but *sufficient*, I hand-applied the minimal transform implied by findings 1–5 to the real SSG build output (`mkdir css js; mv styles.css css/; mv main.js js/`, then text-rewrite the two tags to `<link rel="stylesheet" href="../css/styles.css" />` and `<script src="../js/main.js" ...>`), then fed the actual resulting `index.html` through this repo's real `checkBuiltThemeConformance()` (`src/features/theme/build-conformance.ts`) — not a reimplementation, the actual imported function.

- Sentinel count in the transformed `index.html`: **exactly 1** (`TOKEN_STYLESHEET_SENTINEL` literal match).
- With `artifactHashes: {}`: only `artifact-hash` "not listed" issues remained (expected — hashes weren't supplied yet); stylesheet-sentinel, asset-path, and island-content all reported **zero issues**.
- With real sha256 hashes computed over the transformed tree and supplied as `artifactHashes`: **`issues.length === 0`** — a full clean pass.

This is strong evidence the normalizer approach is viable, not just no-config-alternative-exists by elimination.

## Conclusion: is the normalizer still necessary?

**Yes — confirmed necessary (no configuration-only path exists), and confirmed sufficient** (real transformed output passes the real gate with zero issues). The prior debate doc's specific mechanism guess (root-absolute hrefs defeating the relative sentinel) was wrong, but its bottom-line conclusion (a normalizer is required) was right, for a different and previously-unidentified reason (Beasties' default HTML restructuring) plus the confirmed-true flat-output/no-split-option fact.

### Preconditions the normalizer (and any reference Angular theme) must satisfy
1. Exactly one global stylesheet entry in `angular.json`'s `styles` array, so the CSS bundle is unambiguously named after it (`outputHashing: none` names the bundle after the source file's basename).
2. Build config: `outputHashing: "none"`, `optimization.styles.inlineCritical: false`.
3. `ng add @angular/ssr` with `outputMode: "static"` and `RenderMode.Prerender` for the routes that must be indexable — CSR-only Angular is out of scope per the island/SEO rule (see finding 5).
4. Normalizer moves the **whole JS output cohort** together into `js/` (not just the entry chunk) — lazy chunks reference each other via relative specifiers baked into `main.js`; moving them together as siblings preserves those relative references without needing to rewrite import specifiers inside the bundled JS.

### Known unverified risk, flagged not tested
The probe app's CSS had no `url(...)` references to images/fonts. A real theme's CSS very likely will (background images, `@font-face` `src`). Moving the CSS file from the output root into `css/` shifts every **relative** `url()` inside that CSS one directory level — `url(../media/logo.png)` → would need to become `url(../../media/logo.png)` after the move, or the normalizer needs to rewrite CSS-internal relative URLs during the same pass. **Not yet tested — this needs to be checked before the normalizer is treated as fully solved for real-world themes with images/fonts.**

Also unhandled/untested: `index.csr.html` (the CSR-fallback shell `@angular/ssr` also emits into `browser/`) landed inside the generated tree in this probe and would need either a hash entry or deliberate deletion by the normalizer — Tovu's static-tier serving model has no use for it since Tovu serves the theme's own page HTML directly rather than through Angular's client router.

## Files/scripts used (scratchpad only, not committed, not in the repo)
- Probe apps: `.../scratchpad/angular-probe/probe-app/` (CSR-only) and `.../scratchpad/angular-probe/probe-app-ssr-src/` (SSR+prerender)
- Manual transform + gate check scripts: `.../scratchpad/probe-gate-check.mjs`, `.../scratchpad/probe-gate-check2.mjs`, `.../scratchpad/angular-hashes.json`
- None of the above were added as dependencies to the Tovu repo; `package.json` and `node_modules` at repo root are untouched.
