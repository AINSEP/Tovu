# Opus review part 6 of 6: Jini / kUInetic / theme (2026-09-29)

Read-only review. The persona is `AI-Dev-Shop/agents/code-inspection/skills.md`. All code was read via `git show`. Mechanical sensor slots (code_metrics, dependency_graph, type_safety, duplication, changed-code coverage) were **not run**, because the dispatch said "no tests or builds". They are INCONCLUSIVE, not passes. Nothing here repeats the findings in `2026-09-28-codex-sol-review-today.md`.

Counts: critical 0, high 0, medium 1, low 9.

## Commits reviewed
- Jini `0cf6d659`: fix(cms,infra), which awaits the taxonomy watermark stamp and the restore-point watermark read
- Jini `28f67f9a`: fix(devops), which sends Cloudflare Pages `_headers`/`_redirects` as deployment form fields
- kUInetic `206867d`: fix(text), which settles line reveals only when the split host is finished
- Tovu `7d377d02a`: re-vendor kUInetic 206867d
- Tovu `d2b0f234a`: theme FOUC cloak for kUInetic entrances
- Tovu `5c4c93ed0`: publish sends `_headers` to Cloudflare Pages
- Tovu `1ef94cbf8`: static exports carry the live security headers
- Tovu `e1b1b6a04` and `b63ad0014`: the link:jini / unlink:jini scripts

## Verified OK (asked-for checks)
- **Vendored bytes (7d377d02a).** All six `kuinetic.all.js` copies have the same blob, `8bce9fc68d78…`. That is also the `git hash-object` of kUInetic's `dist/kuinetic.all.js`, built at 17:22 on 09-28, one minute after `206867d`. The bundle contains `[data-kui-state=finished] > [data-kui-split-fx] .kui-split-line`, and the previous copy had the descendant form. Other kUInetic copies in the tree (the desktop `vendor/kuinetic/*` and the `kuinetic-showcase` `css/vendor/kuinetic.css` / `scripts/vendor/kuinetic.js`) are separate, older builds. None of them contains the finished-line rule in either form, so none carries the bug.
- **Cloak fail-open (d2b0f234a).**
  - JS off or blocked: `data-kui-cloak` is only set by `scripts/kui-cloak.js`, so nothing is hidden. The same holds under `<noscript>` conditions.
  - Reduced motion: the JS returns before setting the attribute, and the CSS also has a `prefers-reduced-motion` exemption.
  - Runtime never loads (CDN and vendored copy both fail): the CSS `kui-cloak-release 1ms linear 2s forwards` shows content after 2 s, and the JS timer removes the attribute at 3 s.
  - Runtime loads: the vendored runtime's `uncloak()` (bundle line ~6370) removes the attribute on start, and each element releases on `data-kui-state`.
  - The preset list in the cloak CSS matches the bundle's `kui.cloak` layer exactly (64/64). The layer-order statement matches the bundle's. The preload `crossorigin="anonymous"` matches the body `<script>`, so there is no double fetch. Every page in the site copy that loads kUInetic also loads the cloak.
  - Conclusion: content cannot stay hidden longer than about 2 s.
- **Cloudflare request shape (28f67f9a).** The request matches `wrangler pages deploy`: multipart `manifest` + `branch`, plus `_headers` / `_redirects` as `File` fields named after the file, and both are kept out of the asset upload and the manifest. Only root copies are treated as config.
- **0cf6d659 await inside a transaction.** `deleteTerm`/`deleteTaxonomy` now await the stamp inside `transaction()`. Tovu's stamp is `kernelStampWatermark(kernel)`, and that kernel is the same instance the taxonomy repo uses:
  - PG: `pgOnlyServices(store.content)` and `deps.ts:896 kernel = store.content`.
  - SQLite: `sqliteKernel` is memoized per connection (`drivers/sqlite.ts:37`).
  - Because it is the same instance, the per-instance ALS scope makes the UPDATE join the open transaction, and there is no PGlite self-deadlock. `WatermarkReader` has only one consumer (`SqliteDbOpsAdapter`), and it now awaits.

## Bugs

### B1 MEDIUM: 5c4c93ed0 depends on a Jini fix that is not in the version release builds install
- **Where.** Tovu `apps/website/src/features/deployments/static-publish/adapter.ts:486` (`"cloudflare-pages": () => ({ file: "_headers", … })`).
- **Evidence.**
  - Tovu `package.json:105` pins `@jini-ai/devops ^0.3.1`, and `package-lock.json` resolves the registry tarball `devops-0.3.1.tgz`. That lock entry dates from `8f1da0015` (2026-09-03).
  - Jini `28f67f9a` is dated 2026-09-28 and is only on branch `general-work`. Jini's committed `packages/devops/package.json` still says `"version": "0.3.0"`, while the working tree says 0.3.1 (an uncommitted bump). No published version contains the fix.
  - Locally, `node_modules/@jini-ai/devops` is a symlink into the Jini checkout, so dev looks correct.
  - `check-no-linked-jini.mjs` blocks every linked build, so every real build (Docker, desktop, published typecheck) uses registry 0.3.1.
- **Failure.** A production Cloudflare Pages publish now adds a root `_headers` file. Old devops 0.3.1 hashes it as an ordinary asset. So:
  1. The security headers are **not applied**, although the commit message and the `static-security-headers.ts` doc both say they are.
  2. `https://<site>.pages.dev/_headers` is served publicly. It only exposes the CSP text, so the disclosure is minor.
  3. Before this commit, Cloudflare got no `_headers` at all, so this is a regression toward a public stray file.
- **Fix direction.** Publish `@jini-ai/devops` containing 28f67f9a, commit the version bump, and move Tovu's pin before shipping the `cloudflare-pages` entry. Otherwise, gate the entry on the installed devops version.

### B2 LOW: the cloak exists only in the live site copy of the theme
- **Where.** `d2b0f234a` adds `css/kuinetic-cloak.css`, `scripts/kui-cloak.js` and 13 page edits under `sites/tovu-dev/themes/static/tovu-theme/` only.
- **What is missing.** At HEAD, three copies have no `kui-cloak.js`:
  - `sites/tovu-dev/themes/__original-themes__/static/tovu-theme`
  - `content/themes/static/tovu-theme`
  - `content/themes/__original-themes__/static/tovu-theme`
- **Why it matters.** 7d377d02a, the matching kUInetic change a few hours earlier, updated all six vendored copies. So the pattern is inconsistent.
- **Failure.** A "reset theme to original" on tovu-dev silently drops the cloak, and the flash comes back. New sites seeded from the stock theme never get it.

### B3 LOW (PLAUSIBLE): the build guard does not cover the transitive links that link-jini now creates
- **Where.**
  - `development/scripts/check-no-linked-jini.mjs`'s `findLinkedPackages` only flags names in the consumer's direct `dependencies`/`devDependencies`.
  - `link-jini.mjs` (b63ad0014) also links transitively installed `@jini-ai/*` (via `jini-links.mjs:44`).
  - `link-jini.mjs:25-27` says the guard "fails the build while any of these links are active". That is false for transitive-only links.
- **Scenario.** A partial manual cleanup leaves only transitive symlinks, for example `rm -rf node_modules/@jini-ai/chat && npm i @jini-ai/chat`. The build passes against a local Jini checkout.
- **Fix.** Share `jiniConsumers()` with the guard.

### B4 LOW: link-jini is not idempotent when `JINI_PACKAGES_DIR` is relative
- **Where.** `development/scripts/link-jini.mjs:57-58`. `linkStatus` compares an absolute `path.resolve(...)` against `target = path.join(jiniPackagesDir, name)`. When the env var is relative, `target` is also relative.
- **Failure.** Every link reports `wrong-link` and is recreated on every run, and "N link(s) changed" is always non-zero.
- **Fix.** `path.resolve` the env var once.

### B5 LOW (latent): Jini still uploads `_routes.json` and `_worker.js` as public assets
- **Where.** Jini `packages/devops/src/deploy/cloudflare-pages.ts:533`. `CLOUDFLARE_PAGES_CONFIG_FILES` holds only `_headers` and `_redirects`.
- **Failure.** wrangler also treats `_routes.json` and `_worker.js` specially. A consumer that publishes `_worker.js` would get its Worker source served publicly and never run.
- **Tovu impact.** None today: Tovu exports neither file.

### B6 LOW (PLAUSIBLE): `withSecurityMeta` injects into the first `<head…>` it finds anywhere in the text
- **Where.** Tovu `apps/website/src/features/site-export/static-security-headers.ts:41,53`. The regex is `/<head(\s[^>]*)?>/i` with no comment or script awareness.
- **Failure.** In an html-format Page that has `<!-- <head> -->`, or a `"<head>"` string in an inline script before the real head, the meta lands inside the comment or string. In the string case, the script text is changed.
- **Severity reasoning.** Rare, and the meta is a no-op anyway (see E1).

## Excess

### E1 LOW: the referrer meta repeats the browser default on every exported page
- **Where.** Tovu `static-security-headers.ts:50-53`, called at `site-exporter.ts:617,663,695`.
- **What it does.** It writes `<meta name="referrer" content="strict-origin-when-cross-origin">` into every exported HTML page, including plain exports.
- **Why it is excess.** That value is already the default referrer policy in every current browser. The rewrite changes every exported page's bytes but has no behavioural effect unless the shared value is changed later. That is defensible as tracking the shared set, but it is worth a comment saying so.

### E2 LOW: the security-header middleware takes a parameter that only tests use
- **Where.** Tovu `server/inbound/public-http/middleware/public-page-security-headers.ts:44`. The `createPublicPageSecurityHeaders(headers)` parameter exists "only so a test can prove a changed set reaches the response" (its own doc says so).
- **Related boundary issue.** `features/site-export/__tests__/static-security-headers.test.ts:8` imports from `server/inbound/**`. The new `contracts/core/public-page-security-headers.ts` header says features/site-export never does that. It is test-only, so this is advisory.

## Slop

### S1 LOW: 7d377d02a's message understates what the re-vendor ships
- **The claim.** The message says it re-vendors "206867d (text-reveal-mask inside a finished section)".
- **What the bundle actually jumps.** From `cf4dc85` to `206867d`: 20 kUInetic commits, including the 0.2.0 release, the showcase widgets (modal, lightbox, compare, hotspots, scroll-story, slideshow), the core time-scale / slow-mo seam, and the `kui.cloak` layer. The diff is +1850/−1188 lines in each of the six copies.
- **Why it matters.** This undisclosed runtime change is only in the fallback copy (the CDN `kuinetic@0` loads first). Still, the message should list it (owner rule: no silent behaviour changes).

### S2 LOW: Jini's taxonomy `WriteServiceDeps.stampWatermark` doc overstates its own guarantee
- **Where.** Jini `packages/cms/src/taxonomy/write-service.ts:149-152`. The doc was edited in 0cf6d659 and still says "same-transaction stamp per mutation".
- **The gap.** Every call site calls `deps.stampWatermark()` with no `tx`. Joining the transaction depends entirely on the host's ambient context, which Tovu provides through kernel ALS. The package itself guarantees nothing. Only `deleteTerm`/`deleteTaxonomy` even run inside a transaction.

### S3 LOW (PLAUSIBLE): link-jini's "no registry copy is left" claim does not cover nested copies
- **Where.** Tovu `link-jini.mjs:18-19`: "so no registry copy is left beside the linked ones".
- **The gap.** Only the top-level `<consumer>/node_modules/@jini-ai/*` is handled. Nested `node_modules/<pkg>/node_modules/@jini-ai/*` copies are neither linked nor reported.

## Architecture
- Nothing new beyond E2's test-only import. The `dependency_graph` slot was not run, so cycle status for 1ef94cbf8's new `contracts/core` module is INCONCLUSIVE. By reading the imports, the module imports nothing.

## Not reviewed (per dispatch)
- 5179f6f32, 0925ef1e9, c52b8d547 (theme sync-originals).
