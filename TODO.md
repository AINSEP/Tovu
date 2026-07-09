# TODO

> ⭐ **HIGH PRIORITY / build next → §7: one sample plugin at each tier** (Tier-1 contact form,
> Tier-2 SEO/content analyzer, Tier-3 store). Start with the thin store slice. Added 2026-07-08.

## 1. Fix the mobile nav drawer (header) — via a visual regression test

**Status:** known bug, intentionally left unfixed. Fix it *after* you've set up visual
regression testing, so the test both proves the bug and guards the fix.

### The bug
On narrow viewports (`< 52rem`), tapping the hamburger opens the mobile nav drawer, but
it renders wrong: the panel's top edge doesn't line up with the bottom of the sticky
header, so the first item ("Product") is clipped / the panel looks like it's floating in
the wrong place. See the drawer in `themes/tovu-official/styles.css` (the
`@media (max-width: 52rem)` block, ~line 226).

### Likely cause (confirm with the test, don't trust this)
- `.nav-menu` is `position: fixed; top: 3.7rem; ...` — a **hard-coded** 3.7rem offset
  meant to sit just below the header. But the real header height = announcement bar +
  nav row, which isn't exactly 3.7rem at every font size / zoom, so the drawer top
  overlaps or leaves a gap and the first row gets clipped.
- Candidate fixes to try (pick one once the test is red):
  - Make the drawer full-height (`top: 0; bottom: 0`) and give it its own close affordance,
    instead of aligning to a magic offset.
  - Or drive the offset from the real header height (JS-free: put the drawer inside the
    sticky header and use `top: 100%`, or use a CSS var set to the header height).
  - Also consider a scrim/overlay behind the drawer and locking body scroll while open.

### Acceptance
- On a 390×844 viewport: hamburger opens a drawer whose top meets the header cleanly,
  **no clipped items**, all nav items + CTA reachable, closes again on toggle.
- The regression test below captures this state and stays green after the fix.

---

## 2. Learn visual regression testing (the skill that fixes #1)

Goal: a test that renders the site at set viewports, screenshots key states, and **fails
when pixels drift** from an approved baseline. That's how you catch header/layout bugs
like #1 automatically instead of eyeballing.

### Recommended tool: Playwright's built-in `toHaveScreenshot()`
You already use Playwright here. `@playwright/test` ships visual comparison for free — no
Percy/Chromatic/paid service needed to start.

**Learning path (do these in order):**

1. **Read the one doc that matters:** Playwright → "Visual comparisons"
   (`toHaveScreenshot`, `toMatchSnapshot`). Understand: first run *creates* a baseline PNG,
   later runs *diff* against it, and `--update-snapshots` re-baselines on purpose.
2. **Add the dev deps:** `npm i -D @playwright/test` then `npx playwright install chromium`.
   Add a `playwright.config.ts` (set `use.viewport`, and a `webServer` block that boots
   `PORT=3999 TOVU_DB=memory node --import tsx src/index.ts` so the test starts the app).
3. **Write your first spec** (`e2e/theme-visual.spec.ts`): navigate to `/`, then
   `await expect(page).toHaveScreenshot('home-desktop.png')`. Run it once to create the
   baseline, commit the baseline PNG.
4. **Add the states that matter here:**
   - Home at desktop (1280) **and** wide (2560) — this guards the band fix you just made.
   - Home at mobile (390) with the drawer **closed**, then **open**
     (`await page.locator('label.nav-burger').click()`) — **this is the #1 bug's test.**
     Baseline it in the *correct* state only after you fix the drawer; until then it should
     fail / show the clipped panel.
   - A post page (`/welcome`).
5. **Learn the workflow:** run `npx playwright test`; when it fails it drops
   `actual` / `expected` / `diff` PNGs in `test-results/` — open the diff to see what moved.
   Re-baseline intentionally with `--update-snapshots` only when the change is wanted.
6. **Tame flakiness:** disable animations, wait for fonts (`document.fonts.ready`), pin the
   viewport and `deviceScaleFactor`, and set a small `maxDiffPixelRatio`. Run headless so
   results are consistent. (Google-Fonts loading can cause diffs offline — consider
   self-hosting fonts or masking the hero.)

### Gotcha you already hit (write it into the test setup)
The server **caches the theme at boot** — it does not hot-reload `themes/**`. So a visual
test *must* boot a fresh server (the `webServer` block handles this) or you'll test a
stale theme. This is exactly why my first CSS attempts "looked unchanged." Worth also
filing a separate task: **add theme hot-reload (re-read theme package on change) in dev.**

### Stretch (later, if you outgrow local baselines)
- Cross-platform baseline drift (Mac vs CI Linux render fonts differently) → run the
  snapshot job in a pinned Docker image, or use a hosted service (Chromatic, Percy,
  `reg-suit` + S3) that stores baselines centrally and gives PR review UI.

---

## 3. Decide: theme trust model + theme bundles (needs an ADR)

**Converged direction (from the design conversation):**
- Themes stay **pure data / zero executable code** — this is the invariant that makes
  "install a theme from anyone" safe. Do **not** add a JS-capable theme class.
- Behavior/interactivity lives in **plugins** (the existing "code you trust" plane, with
  capability-scoped permissions). That stays the *only* executable surface.
- Introduce a **packaging category, not a trust class**:
  - **Plain theme** — pure data, no dependencies. Install is instant + unconditionally safe.
  - **Theme bundle** (theme + plugin pack) — a data theme whose manifest **declares the
    plugin(s) it needs**. The installer resolves + installs them together behind one honest
    consent step ("this theme needs plugin X, which requests permissions A, B — install
    both?"). Fixes the bad UX of "download theme → go hunt for a plugin," WITHOUT giving
    themes execution power.
  - The user-facing label ("pure theme, no code" vs "theme + plugins, requests
    permissions") is what expresses trust — the distinction is *does code come with it*,
    not *can the theme execute*.

**Open design questions for the ADR:**
- Vendored plugin (ships inside the theme package; offline-friendly, coupled updates) vs
  referenced dependency (manifest points at a registry plugin by id+version; better
  updates/dedup). Leaning: **referenced** primary, vendored allowed for first-party/offline.
- One broad plugin vs several narrow ones — broad = worse permission inspectability.
- If a real JS-in-theme escape hatch is ever needed: explicit consent + sandbox
  (iframe/worker, strict CSP, no network, scoped DOM) + provenance — as an opt-in tier,
  never the default catalog.

Capture all of this in an ADR (`ADS-project-knowledge/reports/architecture/`, next ADR-NNN,
check ADR-INDEX.md) before building toward it.

**Done:** **ADR-019 ACCEPTED** (2026-07-07) + SPEC-004 OQ-06. The trust model was then
superseded/extended by **ADR-020 — Theme Capability Tiers (ACCEPTED 2026-07-07)**, which
names the spectrum as three tiers (Declarative / **Templated = LiquidJS** / Code) via
`theme.json.tier`, and records the Tier-3 consent-honesty constraint. Still open: the
standalone spec slices (theme bundles; theme tiers + LiquidJS renderer + sandbox).

---

## 5. Build a theme at each capability tier (owner roadmap, 2026-07-07)

One demonstrator theme per ADR-020 tier. Sequenced by what's buildable today vs what
needs new engine work.

- **Tier 1 — basic declarative theme: ALREADY DONE.** `column` and `signal` *are* the
  barebones starters (8-line `home.json`, 3 components, ~110-line CSS); `tovu-official`
  is the fuller flagship. No new "basic theme" needed. Refine an existing one only if a
  gap shows up.

### 5a. Make a LiquidJS (Tier-2) theme — SPIKE DONE (VibeCoder, 2026-07-08)

The "templated" tier demonstrator. **Renderer built + one Liquid theme live-verified.**

- **DONE — Tier-2 renderer:** **LiquidJS 10.27.1** (pin ≥ 10.26.0) wired into
  `src/server/http/site/render.ts` behind `theme.json.tier: "templated"`, over the
  **existing component registry** via a `{% render_block component: "tovu/…", … %}`
  tag, with the `{{ content | raw }}` seam injecting the pre-sanitized TipTap body.
  `outputEscape: "escape"` (autoescape ON) + zero filesystem access is the safety
  baseline; sync render (`parseAndRenderSync`) keeps `renderSite` sync. Loader
  (`src/features/theme/theme.ts`) now reads `tier`, discovers `.liquid` templates
  into `liquidTemplates`, and gates the required set per tier.
- **DONE — demonstrator theme:** `themes/dispatch/` (an editorial/magazine theme).
  `home.liquid` builds the entry grid with a `{% for %}` loop + `forloop.first`
  featured card + folio zero-pad conditional + `date` filter; `entry.liquid` uses
  `assign`/`plus`/slug-compare for a "More dispatches" list and `{{ content | raw }}`
  for the body. Verified live: home + `/welcome` render 200 with no unrendered tags,
  titles auto-escaped, content raw-injected, C7 link sanitization intact.
- **STILL OPEN — hardening (→ C6/REQ-06):** tag/filter allowlist, render isolation,
  template lint-before-publish. The spike's autoescape+no-fs baseline is NOT the full
  Tier-2 guardrail set. The "install a templated theme from anyone safely" claim
  depends on C6. Also not test-certified beyond the live check (add unit coverage for
  the `render_block` seam + a VRT baseline once #2 lands).

### 5b. JavaScript-in-theme with Framer Motion (Tier-3) — LATER

The "code" tier demonstrator. **Framework-agnostic — Astro *or* Next.js** (both are just
Tier-3 code authoring; ADR-002 blesses React, so Next fits natively; Astro fits the
build-time-islands model). Framer Motion / GSAP live here (or as a plugin-provided
island), NOT in a Liquid theme.

- **Blocked on the Tier-3 isolation design** (its own future ADR): client-side islands
  under strict CSP; NOT server-side code. Build-time compiled (Astro/Next) → static HTML
  + hydrated islands aligns with ADR-020 §3/§6 and the "export to standalone binary"
  story.
- Trust-based tier: explicit "this runs JS on your site" consent, never marketed as safe
  (ADR-020 §6).

> Reality check the owner named: the full Tier-3 picture (safe JS execution) is not yet
> settled — deferred to its own ADR. The near-term path is Tier-2 (LiquidJS) when ready.

---

## 4. Fix content-page (entry) wide-screen layout — via a visual regression test

**Status:** known bug, intentionally left unfixed (same discipline as #1 — write the test
first, then fix). This is the bug the owner flagged: *"the theme css doesn't respond when
I stretch the page."* My earlier "wide screen" fix only added full-bleed bands to the
**home** template; **content/post pages were never touched** and still break when widened.

### The bug
On a content page (`/about`, `/how-themes-work`, any `/:slug`) at a wide viewport
(≥ ~1600px, obvious at 2560px): the nav and footer go full-width, but the **article
column is anchored left with the entire right half of the page empty**. It does not feel
responsive — stretching the window just grows white space on the right.

### Cause (verified in the DOM + CSS)
`tovu/entry-content` renders `<div class="wrap"> … <article class="entry"><div class="prose">`.
- `.wrap` is `max-width: 75rem; margin: 0 auto` (centered), but
- `.prose` is `max-width: 42rem` with **no auto margins** (`themes/tovu-official/styles.css`
  ~line 187), so the article is **left-aligned inside the wide centered wrap**. Net: on a
  2560px screen the readable column sits left-of-center with ~half the viewport blank.

### Candidate fixes (pick once the test is red)
- Give the entry a narrow, centered reading column: `article.entry { max-width: 46rem;
  margin: 0 auto; }` (and/or a `.wrap--narrow` variant for entry-content), so the measure
  stays readable AND centered at any width.
- Optionally add an announcement bar / band treatment to match the home page's full-bleed
  rhythm, so content pages don't read as a bare column on ultrawide.
- Check the other themes too (`column`, `signal`) — each has its own entry layout; the
  regression test should cover all three.

### Acceptance
- At 1280 / 1920 / 2560 widths, the article is a centered, readable column with balanced
  gutters (no dead right half). Baseline these once fixed.

### The test that guards it (ties to #2)
Add to the same Playwright visual suite: screenshot `/about` (a content page) at **1280,
1920, and 2560** for **each theme** (`tovu-official`, `column`, `signal`). Wide-viewport
content-page shots are exactly the coverage that was missing — the home-only checks let
this slip through. Baseline only after the layout fix; until then the wide shots should
visibly show the left-anchored column.

> Lesson worth writing into the test plan: **verify the fix on every page type and width
> it claims to cover, not just the one page you were looking at.** The home page looked
> fixed; content pages were never checked.

---

## 6. Plugin extensibility ceiling — find the compromise (owner not sold, 2026-07-08)

**Status:** RESOLVED as a decision (2026-07-08) → **ADR-023 (Core-Mediated Plugin Data
Modules), PROPOSED.** A 2-round swarm debate picked Candidate 1 (core-mediated declarative
tables) with Candidate 2's consent model, split-finalized per ADR-024: recoverability
guarantees hold now, access-control guarantees are advisory until Tier-2 isolation ships.
v1 commits the seams only; the reconciliation engine is built v-next against a real demand
plugin. Remaining owner action: DRAFT→ACCEPTED sign-off on ADR-023. Owed evidence for a
"commerce-grade" claim: a ~50k-product faceted-catalog benchmark on end-user SQLite.

<details><summary>Original tension + candidates (kept for context)</summary>

**Status (original):** OPEN. Owner is not sold on the no-plugin-own-tables limitation and wants a
compromise before it becomes load-bearing. Needs its own ADR (and likely a swarm debate).

### The tension
ADR-003 (Accepted) + ADR-022 (Accepted, content model) forbid plugins from running DDL:
plugin fields live in a namespaced JSON bag with core-provisioned expression indexes. This is
what makes "never brick on update" structural — but it **caps relational-heavy / commerce-scale
plugins** (WooCommerce-style faceted catalogs, directories, big custom datasets). That ceiling
is the deliberate cost of the safety guarantee, and the owner wants it liftable.

### The seam already exists (don't reinvent)
ADR-003 Consequences already names the escape hatch: *"if a plugin genuinely needs its own
tables, that is a **tier promotion**: the tables enter **core's** migration engine under the
plugin's namespace — a deliberate, reviewed act, not an install-time side effect."* The
invariant is *"no plugin corrupts the DB,"* NOT *"no plugin ever has tables."* So the
compromise is **core-mediated DDL**, not plugin DDL.

### Candidate compromises to weigh in the ADR (rank/debate these)
1. **Core-mediated declarative tables (lead candidate).** Plugin *declares* tables/columns/
   indexes in its manifest (schema-as-data); **core's migration engine executes** the DDL,
   versioned, snapshot-before, rollback-able; plugin never holds a DB handle. Uninstall =
   core drops/retains per policy. Gives WooCommerce-grade tables while keeping never-brick.
2. **Capability-gated "data tier" plugin (mirror ADR-020 theme tiers).** A trusted plugin tier
   that may request table-owning capability, shown to the user with explicit *"this plugin
   creates database tables"* consent + a pre-change snapshot. Opt-in, trust-based — same
   philosophy as the theme capability tiers, applied to plugin data.
3. **Per-plugin sandboxed database** (`ATTACH DATABASE`/namespace). Plugin gets its own file/
   schema it fully controls; blast radius contained; uninstall = drop the file. Trade:
   cross-plugin/core joins are harder.
4. Do nothing — accept the ceiling; relational-heavy = out of scope (the status quo).

### Acceptance
An ADR (next free number) that picks a path (likely 1, possibly + 2's consent model), proves
it preserves never-brick (every schema change is core-owned, snapshotted, reversible), and
defines the manifest declaration + migration/rollback + uninstall semantics. Relates to
ADR-003, ADR-022, ADR-021 (plugin capabilities axis), and the recovery/UF-01 (safe-mode) work.

</details>

---

## 7. ⭐ HIGH PRIORITY — Build one sample plugin at each tier (surface real problems in code)

**Status:** HIGH PRIORITY, build next. Approved by owner 2026-07-08. Purpose: prove the plugin
design (ADR-024 accepted; ADR-023 + ADR-025 proposed) in **real running code**, the same way the
Tier-2 LiquidJS theme spike (§5a) surfaced real seams. Each sample is something users genuinely
want (all near the top of the install charts) *and* stress-tests a different part of the design.
Build order is chosen so the cheapest, most-irreversible tests come first.

### The three samples

| Tier | Sample plugin | Why users want it | What it stress-tests |
|---|---|---|---|
| **1 — declarative, install-from-anyone-safe** | **Contact form** — build a form, collect submissions (as core entries), "email me / POST a webhook on submit" | Forms are a top-3 install category (CF7/WPForms, 10M+ sites each). | The whole zero-code surface (types/fields/settings/declarative admin) **and** it cannot send/notify until core ships the **core-mediated primitives** (mail adapter, webhook dispatch, form-submission sink) — so it forces ADR-024 audit condition #1 into the open. |
| **2 — sandboxed code, ships with the marketplace** | **SEO / content analyzer** — score readability + keyword use, suggest fixes, add reading-time + auto table-of-contents | SEO is the single biggest plugin category (Yoast: 13M sites). | Running **stranger code** safely: pure computation over content, **no fs/network needed** → the cleanest test of "run untrusted code over the frozen async/serializable ABI in a sealed box." Build the **ABI-boundary slice (worker/RPC), NOT the real per-site `utilityProcess` sandbox** — the sandbox stays deferred (ADR-024 §4). |
| **3 — trusted, full access (first-party)** | **Store / commerce** (WooCommerce-like): products, cart, orders, checkout, payments | The reason a huge share of people pick a CMS; it's Tovu's whole thesis (ADR-001, agentic commerce). | Everything at once: a **plugin that owns its own real tables** (ADR-023 `dataModule` — the big new capability), external network (payments), heavy work. If "plugins can safely own tables" has a flaw, a store finds it. |

### Notes / decisions already made
- **Commerce is Tier-3 *for now*** (full access, first-party/trusted) and becomes the reference
  **Tier-2** plugin later once the sandbox ships. No conflict with ADR-024's sequencing.
- **Tier-2 = fake the sandbox, don't build it.** Run the analyzer over the frozen ABI as-if-walled
  (worker/message channel); do NOT build the real per-site process isolation (that is the expensive
  rung the tiered plan deliberately defers).
- **Start with the store as a THIN SLICE:** just **products → their own table → listed on the
  site.** Nothing else. That already exercises the two irreversible things (the plugin↔Tovu ABI
  contract, and plugin-owned tables with snapshot-before-every-schema-change). Checkout + payments
  come after the slice proves the foundation holds.
- Optional cheaper pre-check: a tiny throwaway Tier-3 plugin against the ABI first (~1hr) to feel
  fast whether the frozen contract is painful, before committing to the store slice.

### Recommended build order
1. **Tier-3 thin store slice** (products own-table + list on site) — highest-stakes, tests the
   irreversible foundation on ~200 lines before anything is built on top of it.
2. **Tier-1 contact form** — cheap, and exposes the missing core-mediated primitives (audit
   condition #1) as a concrete "this sample is dead without them," not a footnote.
3. **Tier-2 content analyzer** (ABI-boundary slice) — proves stranger-code survives the frozen
   contract without building the sandbox.

### Acceptance
- Three sample plugins exist and run; each is live-verified (hand the owner the commands — do not
  auto-run the dev server).
- The Tier-3 slice proves plugin-owned tables work end-to-end with a snapshot taken before the
  schema change (never-brick, ADR-023 recoverability half).
- The Tier-1 form produces a written list of the exact **core-mediated primitives** core must build
  (feeds the near-term core roadmap).
- The Tier-2 analyzer runs over the async/serializable ABI via a worker/RPC boundary, with a written
  note on any DX pain the frozen contract caused (this is the whole point — find it now).
- Relates to ADR-024 (accepted), ADR-023 + ADR-025 (proposed), SPEC-005 (plugin skeleton), and
  §5a (the theme-tier spike this mirrors).
