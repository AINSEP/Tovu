# Primary (Claude Opus 5) — Debate 1 (`code` tier), ROUND 2, FROZEN

Written after reading every Round 1 response, before reading any Round 2 output.

## Position And Movement

**Changed on one point, hardened on another.**

Round 1 I led with "Option B plus a two-class admission." I now think the two-class split is not a concession — it is the design, and I hold that more firmly after seeing Codex reach it independently via source-plus-artifact packages and Sonnet reach it via the AI-authorability cost.

**What changed: I have a decisive answer on the build-lifecycle fork, and it comes from internal consistency rather than new evidence.**

## The Build-Lifecycle Verdict — the author builds; Tovu never runs `npm install`

The fork is: author builds locally (safe, worse UX) vs Tovu runs the build (better UX, npm supply-chain risk).

**Tovu-runs-build is disqualified by the same argument that killed Option A, and this is the point I want on the record.** All four of us rejected server-side SSR because `worker_threads` gives resource isolation, not code isolation, and arbitrary JavaScript cannot be allowlisted. You cannot reject "execute the author's render code in a worker" and then accept "execute the author's `postinstall` script with full process privilege." The second is strictly worse: a build runs the *transitive* dependency graph's arbitrary scripts, at install time, with filesystem and network access, before any sandbox reasoning even begins. Rejecting A while accepting Tovu-side builds is incoherent.

So: **the package ships authored source + the built artifact + a lockfile + per-file integrity hashes.** Tovu verifies hashes and serves the artifact. It never builds, never resolves dependencies, never executes a package script. That keeps C1 (self-hostable) intact without inventing a containment story this repo has no machinery for — it hasn't shipped the CSS sanitizer ADR-010 asked for on the far smaller trust surface of a stylesheet.

**The sacrifice I am accepting, stated plainly:** a built theme cannot be edited in the admin, cannot be per-file reset to pristine source, and cannot be repaired by `theme_write_file`. Built themes are read-only in the editor with source provenance shown. Authored themes — all 7 live ones — keep every capability they have today. Two populations, declared, not degraded silently.

## Remaining Disagreements

**Conformance must ship before the first framework theme, not after.** Token injection is a single literal-string `.replace()` on `'<link rel="stylesheet" href="../css/styles.css" />"` (`static-render.ts:402`) that **silently no-ops** when absent; asset rewriting hardcodes double-quoted `../css/` and `../js/` prefixes. A bundler that changes one byte of that tag produces a page with no design tokens and no error. So a `theme verify` conformance check is not follow-up polish — it is the precondition that makes "compile to static" a contract rather than a hope. It is also cheap, and it protects the 7 existing themes from an unrelated regression.

I would not rewrite `static-render.ts` from string-replace to a parser yet. That path serves 100% of live traffic; changing it to enable a tier with zero themes is the wrong risk ordering. Conformance-check first, parser later if real bundler output keeps failing it.

**Web Components: islands only, not whole-page.** I raised custom elements in Round 1 and Codex independently named it. Having thought harder: declarative shadow DOM fights the theme's global token injection, because `:root` custom properties do not cross a shadow boundary the way authors expect and `styles.css` is injected once at document level. As a whole-page seam it creates a styling problem worse than the one it solves. As an islands boundary for interactive widgets it is clean and framework-neutral. That is a genuine narrowing of my own Round 1 unlisted option.

**One framework first: React.** Not on merit — on toolchain. `apps/admin` already runs React 19 + Vite 7, so the team can build and test the reference theme without adopting anything new. Vue and Angular qualify by passing the same conformance suite, which also proves the suite is framework-neutral rather than React-shaped.

**Fix `parseTier` first, regardless.** Unknown tiers silently coerce to `"declarative"` (`theme.ts:249-252`). Anyone shipping `"tier": "code"` today gets a declarative theme failing validation for unrelated reasons. Make it a hard error before any of this.

## Strongest Counter-Argument

The strongest case against me is Codex's: that "authors build elsewhere" abandons reproducible marketplace installation, and that a self-hosted operator editing theme source then needs a local toolchain, making Tovu's in-product editing story a lie for a whole class of theme. That is real. My answer is that it is *honest* rather than a lie, provided the product says so — and that the alternative buys UX with a supply-chain exposure the product cannot currently contain. I would rather ship a narrower true promise than a broader one resting on a sandbox that does not exist.

## What Would Change My Mind

- A credible containment design for a local build — disposable OS process or container, no server credentials, no writable host FS beyond staging, capped CPU/memory/time, constrained network. If someone shows that, Tovu-runs-build becomes viable and I would take it, because the UX is genuinely better.
- Evidence that theme authors need per-request server-side dynamism the content-marker system cannot express. That reopens the whole runtime question, not just this fork.

<<SWARM_END>>
