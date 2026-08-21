# Visual regression testing (VRT) — the repeatable paradigm

**Date:** 2026-08-21
**Author:** Software Architect (subagent dispatch)
**Status:** paradigm documented + working reference spec committed. CI wiring designed, not enabled
(CI is deliberately off in this repo; see `project_tovu_ci_off_reenable_checklist` memory — this doc
does not change that).

## 1. This is not a new pattern — it's one existing pattern, generalized

Tovu already has a working VRT suite: `development/e2e/theme-visual.spec.ts` +
`development/playwright.config.ts` (its dedicated config — despite the generic-looking filename,
that config is testMatch-scoped to this one spec, per its own header comment). It renders the live
`tovu-official` public theme against a fresh, hermetic `TOVU_DB=memory` boot and diffs four routes
against committed baselines in `theme-visual.spec.ts-snapshots/`. A second baseline set exists under
`theme-liquid-preview.spec.ts-snapshots/` (an admin-side `.liquid` preview iframe, two static shots).

That existing pattern already has the four ingredients any VRT test needs:

| Ingredient | `theme-visual.spec.ts`'s answer |
|---|---|
| Deterministic render | Fresh `TOVU_DB=memory` boot per run (no stale server, no live data) |
| Anti-flake for motion | `page.emulateMedia({ reducedMotion: "reduce" })`, which the theme's own baked-in `@media (prefers-reduced-motion: reduce)` CSS respects |
| Anti-flake for fonts | Bounded `document.fonts.status === "loaded"` wait (5s cap, best-effort) before the shot |
| Tolerance | `maxDiffPixelRatio: 0.02` at the config level — small enough to catch real drift, large enough to absorb anti-aliasing noise |

**This document generalizes that pattern into a written convention, extends it to the admin app
(where the render is authenticated, dynamic, and has an open SSE feed the theme pages don't), and
adds the one piece that was still open: what happens when this runs in CI, where the OS differs from
every machine that has captured a baseline so far.**

## 2. The hard problem: baselines are platform-locked

Every existing baseline file is suffixed `-chromium-darwin.png`. That's not a naming choice — it's
Playwright's own default `toHaveScreenshot()` behavior: it suffixes by platform + browser
automatically, because font rasterization, subpixel antialiasing, and scrollbar rendering genuinely
differ between macOS and Linux. A baseline captured on the owner's Mac **will not byte-match** a
render produced by GitHub Actions' `ubuntu-latest` runners (confirmed: `.github/workflows/ci.yml`
targets `ubuntu-latest` for its existing jobs). Turning VRT on in CI naively means every screenshot
test goes red on its first CI run — indistinguishable from a real regression — and the realistic
outcome is the suite gets disabled out of alarm fatigue.

### Options considered

**Option 1 — Pin a Playwright Docker container as the single source of truth for baseline generation
AND comparison, used identically local and CI.**
`mcr.microsoft.com/playwright:v1.61.1-noble` (matching the installed `@playwright/test@^1.61.1`
exactly — Playwright ships one Docker tag per release, with the matching browser builds baked in).
Local baseline captures run *through the same container* (`docker run -v "$PWD:/work" ...`), so the
committed baseline and a CI run of the same container produce the same bytes — not because the two
host OSes happen to agree, but because neither one is the actual rendering environment; the pinned
container is. Bump `@playwright/test` and the image tag together, in the same commit, or the two
drift apart again — that's the one sharp edge and it belongs in the "add a new spec" checklist below.

**Option 2 — Commit both `-darwin` and `-linux` baseline variants, refreshed on each platform
separately.**
Rejected. The owner does not have a Linux machine — producing the `-linux` set still requires the
same Docker container as Option 1, so this is Option 1 plus a permanent second baseline set to keep
in sync forever, with a real risk of someone updating one platform's baseline and forgetting the
other (which then either false-fails on the *other* platform or, worse, gets ignored because "the
suite is already flaky across platforms").

**Option 3 — Run VRT only in CI; treat local runs as advisory.**
Rejected. This defeats the actual ask: the owner wants to type `/` locally and have a mangled menu
caught *before* pushing, not learn about it from a CI job three minutes later. Zero local signal.

### Recommendation: Option 1

Docker is already a first-class tool in this repo — a root `Dockerfile` exists and the deployment
model is Docker-first (see `project_tovu_deployment_model` memory). This is not a new dependency to
introduce, it's reusing what's already here. Confirmed locally: Docker Desktop 27.4.0 is installed
and running (`desktop-linux` context — meaning even on the owner's Mac, the container's actual kernel
is Linux, which is exactly why this converges local and CI instead of just relocating the mismatch).

```bash
# Generate/update baselines through the pinned container (same one CI will use):
docker run --rm -v "$PWD:/work" -w /work \
  mcr.microsoft.com/playwright:v1.61.1-noble \
  npx playwright test --config=development/<config>.ts --update-snapshots

# Run (verify, no update) locally the same way before pushing:
docker run --rm -v "$PWD:/work" -w /work \
  mcr.microsoft.com/playwright:v1.61.1-noble \
  npx playwright test --config=development/<config>.ts
```

CI (when re-enabled) runs the identical image tag, no host `npx playwright install` needed — the
image already has the browsers. Baseline filenames become `-chromium-linux.png` uniformly (the
container's OS, regardless of host), which also stops the current `-darwin` suffix from silently
implying "this only works for the owner's Mac."

**This recommendation was checked in with the team lead before the reference spec below was built.**

## 3. Flake controls this repo should standardize on

| Control | Use it for | Notes |
|---|---|---|
| `page.emulateMedia({ reducedMotion: "reduce" })` | Every VRT test | Matches the existing `theme-visual.spec.ts` idiom; relies on the app's own `prefers-reduced-motion` CSS, so it only works where that CSS exists — confirm it exists for admin surfaces before assuming it, don't assume parity with the theme |
| `toHaveScreenshot(..., { animations: "disabled" })` | Every VRT test, in addition to the above | Playwright-level guarantee (freezes CSS animations/transitions and finite-duration Web Animations at their end state) that doesn't depend on the app respecting a media query — belt-and-suspenders for surfaces (like the admin composer popovers) that weren't written with VRT in mind |
| Bounded webfont wait (`document.fonts.status === "loaded"`, capped) | Any page with custom/Google fonts | Already in `theme-visual.spec.ts`; admin app should adopt the same helper if its own fonts load async |
| Element-scoped screenshot (`expect(locator).toHaveScreenshot(...)`) instead of `fullPage` | Admin surfaces with *anything else live on screen* (SSE feed, workspace stats, sidebar chrome) | New guidance this doc adds — see §4 |
| `maxDiffPixelRatio: 0.02` | Config-level default | Matches the one existing precedent (`playwright.config.ts`); don't invent a new tolerance per spec without a reason |
| `mask: [...]` | Timestamps, avatars, live counters that can't be scoped out by element selection alone | Not needed by the reference spec below (the composer dock has no such content), but the right tool the day one shows up — document the specific locator being masked and why, don't mask broadly |

**`fullPage: true` vs element-scoped is the one real judgment call**, and this repo's two existing
suites already disagree implicitly (theme-visual uses `fullPage`, the reference spec below does not).
The rule: **use `fullPage: true` for pages where nothing outside the thing under test is live or
dynamic** (the public theme, an isolated preview iframe). **Use an element-scoped locator screenshot
for admin surfaces**, where the dispatch brief itself notes an open SSE feed keeps `networkidle` from
ever resolving — the same liveness that breaks `networkidle` will make unrelated chrome flap in a
full-page diff. Scoping to the container element under test keeps the diff surface limited to what
the spec is actually about.

## 4. The type-ahead case, specifically

The owner's named example — typing `/` and getting a mangled menu — already has a regression spec:
`development/e2e/admin-composer-discovery-menu-overlap.spec.ts` (config:
`playwright.composer-discovery.config.ts`, ports 8021/8022/8023). It asserts two things via bounding
boxes: the popover doesn't overlap the textarea, and a real click reaches the textarea and dismisses
it. **That spec cannot catch a menu that's geometrically fine but visually broken** — wrong font,
missing icon, collapsed padding, wrong colors. That's the gap this paradigm's reference spec fills,
as a second, complementary layer next to the geometric one, not a replacement.

Reference implementation (both new, both committed):

- `development/playwright.composer-typeahead-visual.config.ts` — ports **8041/8042/8043** (confirmed
  free via `lsof`; next unclaimed slot after 8031-8033 in this directory's `+10` port ladder)
- `development/e2e/admin-composer-typeahead-visual.spec.ts` — three cases:
  1. resting-state baseline (dock open, nothing typed) — establishes what "normal" looks like so a
     future diff on case 2/3 isn't the *only* signal something changed
  2. typing `/` opens `#jini-composer-slash-menu` — the owner's named case
  3. clicking "+ Add Context" opens `.jini-composer-discovery-menu` — the sibling popover the
     existing geometric spec also covers, same visual layer added for consistency

All three screenshot `.admin-chat-dock` (the composer's own container — see §3's element-scoping
rule), with `animations: "disabled"` and the shared `reducedMotion` emulation.

## 5. Baseline update workflow — the visual analogue of a ratchet

Intentional visual change: run the affected config with `--update-snapshots` (through the pinned
Docker container per §2), inspect the new PNG by eye, and commit it **as its own reviewable diff** —
PNG files show up in `git diff`/PR review as an image diff on GitHub, so a reviewer sees the visual
before/after directly, not just a binary blob replacement.

**What prevents an accidental blanket-accept from sneaking through:**
- `--update-snapshots` is never run as part of the normal `test:visual`-style script — it's a
  distinct, explicitly-invoked command, never a flag a CI job would pass.
- Snapshot files are ordinary tracked files, so a PR that changes one shows up in the diff exactly
  like a code change — there's no separate un-reviewed channel for baselines to move through.
- A PR that touches `*.spec.ts-snapshots/*.png` without a corresponding change to the spec or the
  component it renders is the review smell to flag by hand today; this repo doesn't yet have an
  automated "snapshot changed without a code reason" check, and inventing one wasn't asked for here —
  flagging it as a real gap rather than quietly building it.

## 6. Adding a new visual spec — checklist

1. **Pick a fresh port block.** This directory uses a `+10`-per-config ladder. Confirm via `lsof
   -iTCP -sTCP:LISTEN -P -n | grep -E ":PORT1|:PORT2|:PORT3"` that the block is actually free — don't
   trust the highest-number-seen-so-far heuristic, since configs aren't all in one file. Reserved so
   far: 8041/8042/8043 is now taken by `playwright.composer-typeahead-visual.config.ts`; the next open
   block is 8051/8052/8053.
2. **`testMatch` must scope to your one spec file, always.** `development/playwright.config.ts`'s own
   header documents this trap directly: with no `testMatch`, a new `.spec.ts` landing anywhere in
   `e2e/` is silently collected by *every other* unscoped sibling config's default `**/*.spec.ts`, and
   run against that sibling's own (wrong) server. Confirmed live on 2026-08-04 (67 tests enumerated
   across 11 files against one config meant for 4). Every config in this directory opts out
   individually — there is no shared base to inherit the exclusion from.
3. **Boot fresh, never `reuseExistingServer` for VRT.** A VRT suite's entire premise is "this render,
   right now, from disk" — a reused server could be serving a stale build.
4. **Explicit viewport, twice.** Set it in the config's top-level `use.viewport` AND call
   `page.setViewportSize(...)` explicitly inside the test. The project-level
   `use: { ...devices["Desktop Chrome"] }` block (used by most configs in this directory, including
   this one) overrides the top-level `use.viewport` per Playwright's config-merge order — this repo's
   e2e suites actually run at Desktop Chrome's default viewport unless a test sets it explicitly at
   runtime. Don't assume the config's declared viewport is what actually rendered.
5. **`domcontentloaded`, never `networkidle`, against the admin app.** The admin's open SSE feed keeps
   the connection alive indefinitely, so `networkidle` never resolves and the wait fails silently
   (hangs to timeout with no error pointing at the real cause). Use `domcontentloaded` plus an
   explicit element wait for the thing you actually need.
6. **`fullPage` vs element-scoped — decide per §3's rule**, not by copying whichever precedent is
   closest at hand.
7. **Generate the baseline through the pinned Docker container**, not a bare local `npx playwright
   test --update-snapshots` — a locally-generated `-darwin` baseline works for local re-runs but will
   not match what CI eventually produces (§2).
8. **Don't touch a live dev server.** Every config here boots its own hermetic process pair on its own
   ports — never point a new spec at the owner's `:5173`/`:3000` dev servers, and never `kill -9` a
   Playwright-managed webServer (it leaves the child bound to the port; `gracefulShutdown` on the
   webServer block, which this directory's configs already set, is what avoids that).

## 7. What's still open (not built here, on purpose)

- **CI wiring itself.** CI is deliberately off in this repo (see `project_tovu_ci_off_reenable_checklist`
  memory) and this dispatch was explicitly told not to turn it on. This doc's §2 recommendation is
  what a future CI job should do (pull the pinned image, run the configs, compare against committed
  container-generated baselines) — it is a design, not a `.github/workflows/` change.
- **`theme-visual.spec.ts`'s own baselines are still `-darwin`.** Migrating the *existing* suite onto
  the pinned-container workflow (regenerating its four baselines through Docker) wasn't in scope for
  this dispatch and wasn't done — flagging it explicitly rather than silently leaving it implied-done.
  It should happen before CI is turned back on, or that suite hits the exact platform mismatch this
  doc exists to prevent.
- **An automated "snapshot changed without a matching code change" PR check** (§5) — named as a gap,
  not built; no existing tooling in this repo does this today.

## 8. Reference implementation — proof it runs

See the session's own dispatch report for the actual command output (3 passed, one first-run
cold-boot flake on the very first login of a freshly-booted server — not a spec defect; documented as
a known flake class in the repo already, e.g. slow `webServer` boot on the first test in a file).
Files:

- `development/playwright.composer-typeahead-visual.config.ts`
- `development/e2e/admin-composer-typeahead-visual.spec.ts`
- `development/e2e/admin-composer-typeahead-visual.spec.ts-snapshots/*.png` (3 baselines, generated
  locally on this macOS machine — **not yet regenerated through the pinned Docker container**; see §7)
