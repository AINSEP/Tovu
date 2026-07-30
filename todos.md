# Todos — Tovu (website product)

> **Scope.** This is the **Tovu website-product** backlog (CMS runtime: kernel,
> data layer, content model, theme/plugin systems, admin UI, SEO/AEO/GEO plugins,
> WordPress/Payload/Directus/Ghost parity). It moved here in the 2026-07-06 repo
> split. Cross-references to `src/…` mean code that currently lives in
> **`Tovu-Runner/web/src`** and should be evaluated for **porting here** (see
> `START-HERE.md`), not rebuilt. Operator-shell / media-generation / agent-detection
> / the operator chat profile are **not** here — they're tracked in **Tovu-Runner**.
> The `Completed (Architecture)` scaffold note below refers to the pre-split
> `tovu/` layout that is now Runner's `web/src`.
>
> **Start with the v1 first slice in `START-HERE.md`** before working down this list —
> most items below are gated behind that walking skeleton.

**Reference (added 2026-07-14):** competitive positioning vs. WordPress/Strapi/Directus/Payload/Ghost
(where Tovu is ahead vs. genuinely behind) + an agentic-control-plane/MCP-WebMCP-A2UI-MCP-UI readiness
gap analysis, written right after ADR-041/043/044/045 (Storage/Collections/Categories&Tags/Backups-Recovery)
were accepted. Informal, not debated/audited — a reference to revisit before/during the Admin Section Spec
Sweep's "competitor teardown" step below, and before building the eventual agent tool catalog. See
`ADS-memory/reports/strategy/20260714-competitive-positioning-and-agentic-mcp-readiness.md`.

---

## ✅ RESOLVED — Users/Roles/Policies + Plugins admin surface (was the 2026-07-17 overnight-run item)

**Superseded 2026-07-28.** The original 2026-07-16 overnight-run ask (unaudited spec+build+test for
these two items) was overtaken by far more rigorous work: both went through the full formal pipeline
(Red-Team → Software Architect ADR → TDD certification → Programmer → TestRunner) as **SPEC-005**
(plugin system) and **SPEC-006** (identity/authorization, API-key issuance).
- **Plugins admin surface**: Phase 1 (loader/SDK/hook core + HTTP routes + admin UI screen) is built
  and test-verified — `Plugins.tsx` implemented, nav wired, 16/16 admin tests green.
  `ADS-memory/reports/pipeline/005-plugin-system/pipeline-state.md`. **Not fully done**:
  Phase 2 (sample plugin), Phase 3 (wiring into the real post-save flow — has a real, proven security
  finding that needs deliberate handling, not a drive-by fix), Phase 4 (polish) haven't started.
- **Users/Roles/Policies backend gaps**: closed via SPEC-006's 0.6.0 amendment
  (`ENABLE_PRINCIPAL`/`UPDATE_USER`/`UPDATE_ROLE`/`UPDATE_POLICY`/`DELETE_ROLE`/`DELETE_POLICY` etc.)
  plus the 0.7.0 amendment resolving the `CREATE_PRINCIPAL` HTTP-surface gap for API-key issuance.
  `ADS-memory/reports/pipeline/006-identity-and-authorization/pipeline-state.md`.
  **Not fully done**: still needs a Red-Team pass over the 0.6.0+0.7.0 material, an owner DRAFT→APPROVED
  spec checkpoint, and separate architecture sign-off on the API-key issuance ADR (ADR-PIPE-006) before
  TDD/Programmer can build the actual `api_keys` plumbing.
- The original `/audit-work` instruction no longer applies in its original form — there's no informal
  overnight-run output left to audit; sign-off now runs through the normal pipeline gates above instead.

---

## 🔧 IN PROGRESS 2026-07-28 — finish SPEC-003 recertification + Code Review (resume here)

**SPEC-003** (`tovu init`/`tovu serve`/`tovu --help` CLI surface) is implementation-complete and has
been through one full TDD recertification round this session, but is not yet through Code Review:
- TestRunner found 3 blockers; TDD fixed 2 for real (both independently re-verified by direct test
  runs, not just trusted): the `EC-05` locked-db test's broken lock-priming fixture, and the
  `serve-command` port-boundary test's indefinite hang (no timeout on a synchronous CLI spawn).
- **One decision still owed from the owner, not yet made**: branch-coverage gates read below the
  98%/90% bar as measured (83.72% unit / 81.68% integration), but TDD mechanically proved 100%/90.64%
  of *real, reachable* source branches are covered — the residual is esbuild/tsx's auto-generated
  CommonJS interop scaffolding, which the coverage tool counts but no test can ever reach. Three
  concrete remedies on the table (switch to a source-map-accurate coverage tool; mechanically exclude
  the transpiler-prelude ranges from the count; or a profile-override waiver as a last resort) — see
  `ADS-memory/reports/pipeline/003-site-install-dir/test-certification.md`'s "Coverage
  Gates" section for the full mechanical breakdown.
- **Coverage-gate decision (made 2026-07-28, owner):** accepted TDD's real-arms evidence as
  satisfying the gate — the residual is esbuild/tsx CJS-interop scaffolding injected into every
  transpiled module (not Tovu source, nothing to refactor). Logged as a real follow-up, not blocking:
  evaluate swapping to a source-map-accurate coverage tool (c8/istanbul) so measured numbers match
  real numbers going forward, instead of needing this same real-arms argument re-litigated per feature.
- **Next steps**: clean TestRunner re-verification pass (in progress), then Code Review + Security
  dispatch (`/code-review`), then this feature is genuinely commit-ready.

---

## ⚠️ OWED — `/audit-work` + `/code-review` across this session AND the previous (uncommitted) session

**Added 2026-07-28.** Nothing from either session has gone through a real review pass yet — this
session's SPEC-003/005/006 work AND the prior long session's work (repo-wide signature refactor,
snapshot-leak fix, posts/pages create-time validation fix, the 002/004/007 drift-fix sweep) are all
still uncommitted and unreviewed beyond in-house TestRunner/TDD verification. Run both before treating
any of it as mergeable:
- `/code-review` — internal pipeline gate (Code Review + Security agents) per feature.
- `/audit-work` — external multi-LLM audit (needs peer CLIs with pinned exact model versions; check
  availability before assuming it can run).
Do not skip either just because TestRunner/TDD reported green — those are necessary, not sufficient
(see this repo's own Code Review Agent charter: "Green tests are necessary but not sufficient").

---

## ⛔ BLOCKER — Admin Section Spec Sweep (DO FIRST NEXT SESSION)

**Added 2026-07-07.** These are the admin nav sections currently rendering a generic
**placeholder** (real screen not built, no spec). Each needs its own spec before it can be
built. This is the breadth gap: v1 has only ~5 real capabilities (posts/pages, themes,
audit-undo, auth, workspaces) vs dozens in mature CMSs. **Treat this as the next-session
starting point.**

**Process for each (do NOT jump straight to a spec):**
1. **Competitor teardown** — how did each platform do it, and *who did it best*? Mine
   `other-repos-specs/` (wordpress 78 · directus 29 · medusa · shopify · woocommerce) +
   `competitor-analysis.md` (Ghost/Payload/Directus). Map each to the `tovu-v2-design.md
   §3.5` capability tier it belongs to.
2. **Deep debate** — architecture options, trade-offs, build-vs-bundled-plugin placement
   (§3.5 placement rule: tier-2 core lib vs tier-3 bundled plugin). Use `/debate` +
   `/consensus`.
3. **Audit** — pressure-test the chosen architecture with `/audit-work` (codex + gemini/agy)
   before committing.
4. **ADR** — record the decision (the parity/coverage decisions are currently NOT
   ADR-governed — see gap note below).
5. **Spec** — only then write the SPEC-NNN package.

**Sections needing this treatment (each → competitor study → debate → audit → ADR → spec):**

> **Status legend:** ✅ decided (ADR exists) · 🟡 in progress · ⬜ open (needs the full cycle).
> **Progress:** 6 decided (Media → ADR-027, Settings → ADR-028, both ACCEPTED), 2 in progress (Storage, Forms — debated, awaiting audit→ADR), 10 open. Next ADR candidates called out below.

- 🟡 **Database → "Storage"** — **DEBATE DONE 2026-07-09** (3-round swarm; report
  `reports/swarm-consensus/runs/20260709-storage-database-surface-consensus-report.md`). Decision locked
  (build a read-first "Storage/Timeline" surface, not a raw DB editor). **ADR parked** at owner's request
  — a punch-list of 3 blockers + 6 must-fix items is captured in the report, to fold before writing the ADR.
- ✅ **Collections** — DECIDED: **ADR-022** (content-types-as-data registry). Screen still to build.
- ✅ **Categories & Tags** — DECIDED: **ADR-022** (taxonomies + terms). Screen still to build.
- ✅ **User management** — DECIDED: **ADR-021 + SPEC-006** (APPROVED 2026-07-09). Screen still to build.
- ✅ **Roles & Permissions** — DECIDED: **ADR-021 + SPEC-006** (APPROVED 2026-07-09) — retires the Art. VI
  auth exception. Screen still to build.
- 🟡 **Forms** — tracked as the **Tier-1 sample plugin** (see AW-7); decision folds into that build.
- ✅ **Media** — **ADR-027 ACCEPTED 2026-07-09**. **DEBATE DONE 2026-07-09** (2-round swarm: Opus + Codex gpt-5.5 + Gemini 3.1 Pro + Fable; report
  `reports/swarm-consensus/runs/20260709-media-admin-section-consensus-report.md`). Converged (~0.92) on hybrid
  `media` entry + `asset_blobs`/`asset_renditions` sidecars, `BlobStorePort` (content-addressed) + `ImageTransformPort`
  (out-of-process worker), named-only transforms, origin-isolated serving under a frozen renditions-only URL contract,
  entry_refs safe-delete + 2-phase GC. Maximize-v1: ~22 items IN, deferred only TUS/arbitrary-transforms/live-scanner/
  transcoding/S3-adapter. **AUDIT DONE 2026-07-09** (`/audit-work` TM-media-001; Codex+Gemini external + Fable internal
  verifier): architecture endorsed but round-1 **FAIL** (8.1/8.0 vs 8.5 floor) — 3 blockers (GC/dedup byte-deletion race,
  immutable-URL+transform-name lifecycle, original-serving-origin) + 6 advisories, **all with converged drafted fixes**
  (`.local-artifacts/external-audit/proposed-fixes/20260709-media/proposed-fixes.md`; report
  `reports/external-audit/runs/20260709-media-design-external-audit-report.md`). B2 URL resolved → Fable version-in-path
  `/m/{assetId}/{transformName}.v{version}/{slug}`. **DONE → fixes folded → ADR-027 written → round-2 re-audit PASS (Fable 8.7 PASS; Codex 8.3 clause-gaps; Gemini degraded) → 6 clause-gap amendments folded → ADR-027 ACCEPTED.**
  ⚠️ **OWES CONFIRM-AUDIT (added 2026-07-09):** the round-2 re-audit ran against the **pre-amendment PROPOSED** version; the **6 clause-gap amendments applied this session were NOT themselves audited** (I applied the auditors' recommended-fix wording but no one verified the implementation). Run `/audit-work` diff-only (amended ADR-027 vs the round-2 recommendations, Codex + agy + fresh Fable) to confirm the 6 edits land the fixes without introducing new gaps — **before treating ACCEPTED as final**. Next stage for Media = SPEC-NNN (or the build-structure/package-layout pass).
- ⬜ **Menus** — navigation trees as editable content (`navigation` lib, tier 2)
- ⬜ **Members** — front-end membership/subscribers (Ghost members is the reference)
- ⬜ **Comments** — moderation queue, own tables/hooks (bundled plugin — SDK stress test, §3.5 tier 3)
- ⬜ **SEO** — metadata, sitemaps, `page.head` hook (dogfood plugin; large AEO/GEO backlog in §22)
- ⬜ **Redirects** — redirect rules over `routing`
- ⬜ **Newsletter** — email campaigns over `MailerPort` (bundled plugin)
- ⬜ **Analytics** — traffic/usage surface (privacy-first; who did this best?)
- ⬜ **Integrations / API** — API keys, webhooks, outbound integrations (`identity` app tokens + outbox).
  **← owner named this next after Database** (webhooks).
- ⬜ **Backups** — backup/restore + export (UF-13 portability; pairs with `tovu build` export). NOTE: shares
  the one snapshot library with the Storage debate above — sequence it right after the Storage ADR.
- ✅ **Settings** — **DECIDED: ADR-028 ACCEPTED 2026-07-11.** (3-round swarm: Opus + Codex gpt-5.5 xhigh + Gemini 3.1 Pro/agy + Fable.) Screen still to build.
  R1–R2 position debate → consensus (~0.92) on a dedicated **"Layered Settings Ledger"** (own tables reusing ADR-022's
  chokepoint/revision discipline, NOT settings-as-entries — killed by the authz-collapse argument: `content.write` reaches
  agents, so settings-as-entries lets any agent flip site security). R3 concrete design (full DDL/resolver/ops) surfaced
  **8 issues** (2 multi-peer-confirmed: rename+retype-in-one-op; the composite user-FK can't be table-wide → split value
  tables). Reports: `reports/swarm-consensus/runs/20260709-settings-architecture-consensus-report.md` +
  `…-settings-r3-design-report.md`. **Audit history (`TM-settings-001`, all in `ADR-028-settings-layered-ledger.md`,
  status ACCEPTED 2026-07-11):** R1 **FAIL** (agy 4 / Codex 8.1 / Fable 8.2; 4 blockers) → fixes folded · R2 **FAIL** 2026-07-11
  (internal 8.0 / Codex 8.4 / agy 9.5; `settings.write` reconciliation gap + 4 completeness gaps) → fixes folded ·
  **R3 PASS 2026-07-11 (agy 9.8 / Codex 9.1; 0 blockers; all round-2 items reverified resolved; one LOW notes-mode R3-01
  folded into §7)** → Coordinator closed without a 3rd internal round (2 clean externals + round-2 internal drove the fixes)
  → **ACCEPTED**. Round-3 report: `.local-artifacts/external-audit/runs/20260711T054500Z-settings-round3-external-audit-report.md`.
  Core-only subset greenlit to spec independently of the plugin/secret gates. (`settings` lib, replaces WP options grab-bag)
  **Next: build the Settings admin screen + write the core-only SPEC.**

> **Not on this list but the owner wants ADRs for them (2026-07-09):** **Accessibility** (a cross-cutting
> baseline, currently only in §21/§20 backlog — candidate for its own ADR) and the **coverage/parity ADR +
> matrix** recommended in the gap note below (the "are we building everything the others have?" answer).

**Coverage-gap note (surfaced 2026-07-07 audit-of-parity):** the parity map lives in
`tovu-v2-design.md §3.5` (mutable design doc) and the corpus `coverage-audit.md` files —
**it is NOT reconciled into ADRs or the specs.** Recommended first artifact next session: a
**coverage/parity ADR + matrix** mapping each competitor subsystem → {v1 / bundled-plugin /
deferred / dropped} with the owning ADR, so "are we implementing everything the others have?"
has one authoritative answer instead of being spread across four docs.

---

## Active Working Items (merged from `TODO.md`, 2026-07-09)

> These were the standalone `TODO.md` (now folded here so there is one backlog). They are near-term
> bugs + build tasks, distinct from the Admin Section Spec Sweep above and finer-grained than the
> Master Build Inventory (§8 Theme System / §9 Plugin System overlap — de-dupe later if needed).
> The ⭐ item (sample plugins) is the current **build-next**.

### AW-1. Fix the mobile nav drawer (header) — via a visual regression test
**Status:** known bug, intentionally left unfixed until AW-2 (VRT) exists, so the test proves the bug
and guards the fix. On narrow viewports (`< 52rem`) tapping the hamburger opens the drawer but its top
edge doesn't line up with the sticky header bottom — first item ("Product") is clipped. Cause (confirm
with the test): `.nav-menu` uses a hard-coded `top: 3.7rem` offset in `themes/tovu-official/styles.css`
(`@media (max-width: 52rem)` block, ~line 226), which doesn't match real header height at every
font-size/zoom. Candidate fixes: full-height drawer (`top:0;bottom:0`) w/ its own close affordance; or
drive the offset from real header height (drawer inside sticky header + `top:100%`, or a CSS var); add a
scrim + body-scroll-lock. **Acceptance:** 390×844 — hamburger opens a drawer whose top meets the header
cleanly, no clipped items, all items+CTA reachable, closes on toggle; VRT captures it and stays green.

### AW-2. Learn visual regression testing (the skill that fixes AW-1 + AW-4)
**Status: SETUP DONE (2026-07-15).** `@playwright/test` + chromium installed; `playwright.config.ts`
boots a fresh `PORT=3999 TOVU_DB=memory node --import tsx src/index.ts` per run (`reuseExistingServer`
left off, so a stale long-running dev server can never serve these tests — confirmed the fresh-boot
gotcha below doesn't apply). `e2e/theme-visual.spec.ts` + committed baselines under
`e2e/theme-visual.spec.ts-snapshots/`: `home-desktop.png` (1280, full page), `home-wide.png` (2560, full
page — guards the band rhythm), `home-mobile-390.png` (390, full page, **drawer CLOSED only** — AW-1's
open-drawer clipping bug was deliberately NOT baselined, per this section's own plan; add an
open-drawer baseline once AW-1 is fixed), `post-welcome.png` (`/welcome`, 1280). Anti-flake: reuses the
theme's own baked-in `prefers-reduced-motion` CSS via `page.emulateMedia`, bounded `document.fonts.ready`
wait, pinned viewport/deviceScaleFactor, `maxDiffPixelRatio: 0.02`, headless. `npm run test:visual` runs
the suite; all 4 pass clean against their own baselines. **New finding while building this (not
fixed, test-infra only):** the mobile-390 baseline needed `clip` (not a bare `fullPage` shot) because
the *closed* drawer (`position:fixed; transform:translateX(110%)`) still contributes to
`document.documentElement.scrollWidth` at mobile widths (confirmed 742px vs 390px clientWidth) — an
unclipped screenshot bled the off-canvas "Product" dropdown into the "closed drawer" baseline. This is a
separate, previously-undocumented mobile horizontal-overflow quirk from AW-1's clipping bug; worth a
look whenever AW-1 is picked up. Also flagging the still-open follow-up this surfaced: **add theme
hot-reload in dev** (the server caches the theme at boot with no hot-reload of `themes/**` — VRT's fresh
per-run `webServer` boot sidesteps it, but dev iteration still eats a manual restart per theme edit).
Next: AW-1 and AW-4 fixes are now safely guardable by this suite but neither was done here (both stay
their own separate items). Stretch, still open: cross-platform baseline drift (Mac vs CI Linux) → pinned
Docker image or hosted service (Chromatic/Percy/`reg-suit`).

### AW-3. Theme trust model + theme bundles — **DECIDED** (pointer)
**ADR-019 ACCEPTED** (theme bundles / plugin deps) + **ADR-020 ACCEPTED** (theme capability tiers:
Declarative / Templated=LiquidJS / Code via `theme.json.tier`). Themes stay pure data; behavior lives in
plugins. **Still open:** the standalone spec slices (theme bundles; theme tiers + LiquidJS renderer +
sandbox — see AW-5a C6 hardening).

### AW-4. Fix content-page (entry) wide-screen layout — via a visual regression test
**Status:** known bug, intentionally left unfixed until AW-2 (write the test first). On a content page
(`/about`, any `/:slug`) at ≥~1600px (obvious at 2560px), nav + footer go full-width but the article
column is anchored left with the right half empty — stretching just grows white space. Cause (verified):
`tovu/entry-content` renders `.wrap`(max-width 75rem, centered) → `article.entry` → `.prose`(max-width
42rem, **no auto margins**, `themes/tovu-official/styles.css` ~line 187), so the article is left-aligned
inside the centered wrap. Candidate fixes: `article.entry { max-width:46rem; margin:0 auto }` (and/or a
`.wrap--narrow`); optional full-bleed band to match home rhythm; check `column` theme too. **Acceptance:**
at 1280/1920/2560 the article is a centered readable column with balanced gutters (no dead right half),
baselined per theme. Lesson: **verify a fix on every page type + width it claims to cover, not just the
one page you were looking at** (home looked fixed; content pages were never checked).

### AW-5. Build a theme at each capability tier (owner roadmap)
- **Tier 1 — basic declarative theme: DONE.** `column` is the barebones starter; `tovu-official` the
  flagship. (`signal` removed 2026-07-08 as redundant.)
- **AW-5a. Tier-2 LiquidJS theme — SPIKE DONE (2026-07-08).** Renderer (LiquidJS 10.27.1, pin ≥10.26.0)
  wired into `src/server/http/site/render.ts` behind `theme.json.tier:"templated"`, over the existing
  component registry via `{% render_block %}` + `{{content|raw}}`; autoescape ON + zero fs = the safety
  baseline; loader (`src/features/theme/theme.ts`) reads `tier` + discovers `.liquid`. Demonstrator
  `themes/dispatch/` verified live (home + `/welcome` 200, no unrendered tags, titles escaped, content
  raw, C7 link-sanitization intact). **C6 HARDENING DONE (2026-07-15).** Tag/filter allowlist
  (`src/features/theme/liquid-allowlist.ts`, AST-walked, enforced at `loadTheme()` publish-time lint and
  again defensively at render time) + render isolation (`liquid-worker.ts` runs in a `worker_threads`
  worker spawned per render by `liquid-sandbox.ts`, bounded by a wall-clock timeout and V8
  `resourceLimits`, with an explicit no-op `fs` adapter closing LiquidJS's default real-filesystem
  access) + template lint-before-publish, all wired and covered by tests (nested-loop CPU timeout and
  heap-limit termination both verified to actually fire, not just compile). Still add a VRT baseline for
  the `render_block` seam once AW-2 lands.
- **AW-5b. Tier-3 JS-in-theme (Framer Motion) — LATER.** Framework-agnostic (Astro or Next); client-side
  islands under strict CSP, build-time compiled → static HTML + hydrated islands. **Blocked on the
  Tier-3 isolation design (its own future ADR):** separate cookie-less origin + CSP `connect-src 'none'`
  (ADR-020 §6 amendment — same-origin theme JS can steal the admin session). Trust-based tier, explicit
  "this runs JS on your site" consent.

### AW-6. Plugin extensibility ceiling (plugins owning tables) — **DECIDED** (pointer)
**RESOLVED → ADR-023 (Core-Mediated Plugin Data Modules), PROPOSED** (2-round swarm debate picked
core-mediated declarative tables + consent model; split-finalized per ADR-024). Plugins may own real
`p_{pluginId}__*` tables via schema-as-data core executes; snapshot-before-DDL; retain-on-uninstall.
**Remaining:** owner DRAFT→ACCEPTED sign-off on ADR-023; owed evidence for "commerce-grade" = a
~50k-product faceted-catalog benchmark on end-user SQLite.

### ⭐ AW-7. HIGH PRIORITY — build one sample plugin at each tier (build-next)
Approved 2026-07-08. Prove the plugin design (ADR-024 accepted; ADR-023/025 proposed) in real running
code, the way the Tier-2 LiquidJS spike surfaced real seams. Each sample is genuinely wanted *and*
stress-tests a different part of the design.

| Tier | Sample | Why users want it | What it stress-tests |
|---|---|---|---|
| **1 — declarative** | **Contact form** (submissions as core entries; email/webhook on submit) | forms = top-3 install category | the zero-code surface **and** forces ADR-024 audit-condition #1: it can't send/notify until core ships the **core-mediated primitives** (mail adapter, webhook dispatch, form-submission sink) |
| **2 — sandboxed code** | **SEO / content analyzer** (readability, TOC, reading-time) | SEO = biggest plugin category | running stranger code safely: pure computation, no fs/network → cleanest test of the frozen async/serializable ABI. Build the **ABI-boundary slice (worker/RPC), NOT the real `utilityProcess` sandbox** (deferred, ADR-024 §4) |
| **3 — trusted, full access** | **Store / commerce** (products→cart→orders→checkout→payments) | the CMS-choice driver; Tovu's thesis | everything: a plugin that **owns real tables** (ADR-023 `dataModule`), external network, heavy work — if "plugins can own tables" has a flaw, a store finds it |

**Build order:** (1) **Tier-3 thin store slice** = products → own table → listed on site (tests the
irreversible foundation — the plugin↔Tovu ABI + plugin-owned tables w/ snapshot-before-schema-change —
on ~200 lines); (2) **Tier-1 contact form** (exposes the missing core-mediated primitives as a concrete
"dead without them"); (3) **Tier-2 content analyzer** (proves stranger-code survives the frozen contract,
no sandbox). Optional pre-check: a ~1hr throwaway Tier-3 plugin against the ABI to feel whether the frozen
contract is painful. **Acceptance:** three plugins run + live-verified (hand owner the commands, don't
auto-run); Tier-3 slice proves owned-tables end-to-end w/ snapshot-before-change; Tier-1 yields the
written list of core-mediated primitives core must build; Tier-2 runs over the ABI via worker/RPC with a
written note on any DX pain.

---

## Completed (WordPress Specs)
All WordPress spec work is complete. See `wordpress_specs/` for the full library (53 files).
- ✓ wp-includes (20 specs)
- ✓ wp-content (overview)
- ✓ wp-admin (12 specs including users)
- ✓ wp-root (3 condensed specs + 12 originals archived)
- ✓ Plugin & Theme Authoring Structure
- ✓ Headless CMS paradigm

## Completed (Architecture)
- ✓ `tovu-architecture.md` — combined, renamed Forge→Tovu, includes appendix of all general patterns
- ✓ `competitor-analysis.md` — Ghost, Payload, Directus breakdown
- ✓ `tovu/` scaffold initialized (TypeScript, Express, tests, modular structure)
- ✓ `tovu/` conventions captured (`PROJECT_MEMORY.md`, local `AGENTS.md`, module `INFO.md`)

Prioritization source: `tovu-architecture.md` section 13 (User Friction Coverage).

---

## Canonical Architecture Decisions (ADRs)

This checklist is the **capability backlog**, not the decision record. Where an ADR
exists, it is the source of truth and supersedes the loose wording below. Index:
`ADS-memory/reports/architecture/ADR-INDEX.md`.

Which ADR owns which inventory area:
- **§1 Kernel / §10 Server** — ADR-001 (agent-native modular monolith), ADR-009
  (decoupling: sync calls + outbox + hooks).
- **§3 Data Layer** — ADR-006 (ports need two adapters), ADR-007 (`workspaceId`
  everywhere). **Site content lives in a per-site `content.db` behind
  `SiteStorePort`** (better-sqlite3 now → Supabase later) — ADR-012 + ADR-013.
- **§5 Storage/Media** — media blobs under the site folder's `uploads/`, metadata
  rows in that site's `content.db` (ADR-012).
- **§7 Feature Modules** — the `features/*` slices are the site content model
  (post/page/media/presentation), scoped per ADR-007/012.
- **§8 Theme System** — ADR-010 (declarative themes by default; code = trusted
  mode), ADR-002 (React blessed renderer). Two planes: site theme vs app chrome —
  see `admin-sitemap.md §1`.
- **§9 Plugin System** — ADR-003 (plugins never run DDL), ADR-004 (prebuilt ESM +
  signed manifest), ADR-005 (SDK compatibility).
- **§11 Admin UI** — IA in `admin-sitemap.md`; per-screen UI brief in
  `docs/design/admin-sections-ui-brief.md`; rail pages in
  `docs/design/rail-pages-ui-brief.md`.
- **§12 Agentic UI / AI Layer** — **ADR-013**: one CopilotKit client + one AG-UI
  daemon agent; `tools.ts` registry with an execution `surface` (frontend/data);
  agent detection ported from open-design; composer rebuilt headless. Paradigm note:
  `docs/architecture/appendices/A12-tool-use-first-architecture.md`.
- **§13 Protocols** — ADR-011 (two deployment topologies; open-design desktop host),
  ADR-013 (AG-UI/MCP surface, tool exposure).

A "site" everywhere below = **a folder (install dir) with its own `content.db` +
`uploads/` + themes/plugins**, instantiated from a versioned template (ADR-012).

---

## Learn (What You Need to Understand)

### Core architecture fundamentals
- Ports/adapters and dependency inversion (how core stays swappable)
- Hybrid sync command + outbox flow (what is synchronous vs asynchronous)
- Vertical slice architecture (feature-by-feature development)
- Contract testing vs integration testing

### Platform and runtime choices
- Express vs Fastify vs Hono tradeoffs for Tovu
- Outbox implementations (in-memory now, Postgres later)
- Queue/event delivery options (retries, backoff, dead-letter strategy)

### Product + ecosystem
- Directus internals (especially AI layer)
- WordPress pain clusters and how each maps to Tovu capabilities
- Spec-first workflow (Spec Kit commands and artifacts)

---

## Accomplish (What We Need to Build)

### Foundation (active)
- [ ] Split `src/core/ports.ts` into domain-focused port files (including `core/events/ports.ts`)
- [ ] Add server route tests in `src/server/__tests__/` (status code + payload assertions)
- [ ] Add first persistent adapter set (DB-backed repo + DB-backed outbox)
- [ ] Add structured logging + request IDs

### First real capabilities
- [ ] Workspace management beyond create (read/list/update/delete)
- [ ] Basic auth boundary (identity extraction + role checks)
- [ ] Plugin/module registration skeleton
- [ ] Feature flag support (for safe rollout)

### Reliability and safety
- [ ] Outbox retry policy with exponential backoff
- [ ] Idempotency strategy for event handlers
- [ ] Error taxonomy + standardized API error responses
- [ ] Safe-mode/rollback concept draft (from architecture section 13)

### Agent capability surface (added 2026-07-27)

Backed by a source-level survey of ten shipped products; full reports in
`/Users/la/Programming/OSS-Repos/AI-Capabilities/`. Design written up in
`tovu-v2-design.md` §9 and `Jini/ai-control-plane.md` §29. Build in this order.

- [ ] **Split control plane from retrieval plane.** One capability registry, two postures: agent/admin
      writes go through authorize → confirm → execute → audit; end-user search runs as the *user*,
      read-only, no confirmation. A retrieval-plane capability must be structurally incapable of
      holding a write handler. (Directus shares 12 tools across both and the weaker path — a
      client-declared, server-trusted approval — defines the security of both.)
- [ ] **Fail-closed at registration.** Throw at boot if a capability declares no auth policy, so
      "registered with no auth check" is unreachable rather than discouraged. (Strapi,
      `McpCapabilityDefinitionRegistry.define()`.) ~20 lines; do this first.
- [ ] **Entity as a parameter, not tool-per-entity.** One tool per *operation* with the entity slug
      as an argument — `findDocuments({ collectionSlug })` rather than `findPosts`/`findProducts`.
      Keeps the tool count flat as content types grow. (Payload, `buildMcpServer.ts:126-151`.)
- [ ] **Make the entity discriminator a per-principal enum**, not a free string. Kills the extra
      discovery round trip and puts least privilege in the contract. Neither Payload nor Strapi
      shipped this combination — it's ours to get right. Cache keys must include principal +
      permission version; execution-time authorization stays mandatory regardless.
- [ ] **Two-sided conformance test**, taken verbatim from Strapi's suite: *a read-only principal
      cannot see write tools and cannot invoke them.* One test, both halves of the anti-pattern.
- [ ] **Kill-switch completeness test.** Verify that disabling the AI feature stops artifacts the
      agent already created, not just new invocations. Directus (agent-authored Flow with an `exec`
      step) and novamira (agent-written sandbox PHP) both fail this — two of ten products.
- [ ] **Actor kind in the event envelope.** Record agent-vs-human on every mutation. Directus knows
      the OAuth client on every request and never writes it to the activity row, so its audit trail
      can't tell them apart. Relates to W6 (change-set primitive); retrofitting provenance is the
      same class of error as retrofitting tenancy (W7).
- [ ] **Decide per-integration credential storage.** Nothing in the current design covers it. Two
      shipped references: WordPress's Connectors API (env → constant → DB precedence,
      validate-before-persist, mask-on-every-read) and Directus's inversion where the *absence* of a
      principal is the read capability, so admins cannot read provider keys through the API at all
      (`api/src/services/payload.ts:169-195`). Multi-tenant makes this load-bearing early.
- [ ] **Validate capability *output*, not just input.** Every WordPress ability validates what it
      returns against a declared output schema (`class-wp-ability.php:677`); Jini validates input
      only. Cheap now, awkward once handlers exist. Relates to `ai-control-plane.md §19.4`, which
      already asks for it under output safety but has no implementation.
- [ ] **Ship schema-on-error before collapsing tools.** When validation fails, return the entity's
      full schema in the error so the model self-corrects in one turn. It is a one-line change to an
      error path and it is what makes a deliberately loose wire schema affordable — collapsing tools
      to `findDocuments({ collectionSlug })` without it turns every mistake into a dead end.
- [ ] **Derive risk independently of the tool author's declaration.** Treat `requiresConfirmation`
      and `readonly` as *claims*, not facts: require `readonly === true` explicitly (absent ⇒
      confirmation required) and OR in danger flags derived from the capability's own service
      binding and risk class. Matters most for plugin-contributed capabilities, where the registrant
      is not you.
- [ ] **Do not build a tool catalog / search layer yet.** With entity-as-parameter the count lands in
      the dozens, not hundreds. Build discovery when the *measured* count justifies it. Watch the
      ratio of distinct-outcome capabilities (which never collapse) to CRUD ones (which do) — when
      the former dominates, discovery stops being premature.

**Where the evidence lives.** Ten canonical per-repo reports in
`/Users/la/Programming/OSS-Repos/AI-Capabilities/` (`<repo>.md` + `<repo>.metrics.json`), merged from
22 independent analyses across three models; raw passes preserved under `passes/<repo>/`. Design
rationale with `file:line` citations is in `Jini/ai-control-plane.md` §29 and `tovu-v2-design.md` §9.
Caveat when reading a single-pass report (`ghost`, `medusa`, `open-saas`, `jini`): measured across
this corpus, **68–70% of findings came from exactly one pass**, so one pass is roughly a third of
what is findable.

---

## Backlog: Directus Research (Still Needed)

Directus is still valuable for reference and can run in parallel with implementation.

- [ ] General Directus architecture map
- [ ] Directus AI layer deep spec (priority)
- [ ] Directus admin UI extension model spec

## Backlog: Admin IA Research (Needed Before Admin Build)

Placeholder admin structure exists at `tovu/apps/admin/sections/` (one INFO.md per section, WordPress-derived). It is a DRAFT until this research lands.

- [ ] Capture the admin information architecture of Directus, Ghost, Payload, Strapi, and WordPress (specs already in `other-repos-specs/wordpress_specs/wp-admin/`): sidebar taxonomy, screen inventory per section, navigation depth, and where each puts settings vs content vs system surfaces. CBM indexes exist for all five repos.
- [ ] Capture each CMS's admin *extension* pattern (how plugins contribute panels/menu items/dashboard widgets): WP menu/meta-box registration, Directus extensions-sdk app surfaces, Payload admin components, Strapi admin plugin API, Ghost admin-x apps.
- [ ] Synthesize into a Tovu admin IA spec: confirm/adjust the `apps/admin/sections/` placeholder set, define the surface-descriptor types each section needs (feeds Master Build Inventory §11 Admin UI), and mark which sections are core vs registry-contributed vs plugin-shipped.

## Backlog: Shopify Research (Still Needed)

Shopify capture work has a detailed checklist in `other-repos-specs/shopify_specs/TODO.md`.

- [ ] Review and execute the Shopify research TODO before restarting Shopify decomposition or agent-build-packet work.

## Backlog: Medusa Research (Still Needed)

Medusa follow-on decomposition notes live in `other-repos-specs/medusa_specs/TODO.md`.

- [ ] Review the Medusa research TODO before adding deeper Medusa internals, route DTO inventories, admin SDK notes, telemetry notes, or hosted-cloud caveats.

## Backlog: Commerce Platform Crosswalk (Still Needed)

Shopify + Medusa synthesis notes live in `other-repos/TODO.md`.

- [ ] Review the Shopify + Medusa follow-on TODO before turning commerce research into a Tovu capability map or V1 commerce platform architecture.

---

## Master Build Inventory (Everything)

**Reconciliation pass (2026-07-15):** cross-referenced every item below against
`ADR-INDEX.md` (46 ADRs), real code in `src/`/`apps/admin/src/`, and the
spec-016-020 gated-mutations progress ledger. Of 361 checklist items: **86 DONE**
+ **5 SUPERSEDED** (real ADR + shipped code, or overtaken by a since-made
decision), **129 STILL OPEN with a scoping ADR/pointer** noted inline, **141
STILL OPEN, UNSCOPED** (mostly the aspirational §19-25 parity/research/tooling
lists, which remain largely unbuilt). Biggest surprise: the admin UI (§11) is far more built
than the checklist assumed (`apps/admin/src/sections/` has 26 real screens —
Collections, Media, Settings, Roles, Users, Storage, Recovery, Redirects, Seo,
Menus, Integrations, Analytics, Forms — not the Next.js/Zustand shell originally
imagined). Conversely, the Agentic UI/AI layer (§12) and all AEO/GEO/AI-surface
work (§22) are still almost entirely unbuilt — no CopilotKit/AG-UI/MCP code
exists anywhere in `src/` yet, only a stub FAB.

### 1) Core Runtime / Kernel
- [ ] Define final kernel responsibilities (lifecycle, DI, service registry) — no dedicated kernel/DI module exists; ADR-046 (Proposed, pending debate) partially scopes composition-root/module-status concerns
- [x] Split core ports into module-level files (`events`, `auth`, `storage`, `search`, etc.) — de facto done: every feature/infra module now owns its own `ports.ts` (`identity/ports.ts`, `media/ports.ts`, `mail/ports.ts`, `http/ports.ts`, `core/gated-mutations/ports.ts`, etc.); `core/ports.ts` retains only the shared kernel primitives (147 lines)
- [ ] Add core error model (typed errors + error codes) — pervasive per-domain typed error classes exist (`ForbiddenError`, `ValidationError`, etc.) but no centralized core error taxonomy; `src/server/error-mapping/` is a placeholder folder (INFO.md only, no code yet)
- [ ] Add config system with typed schema + env validation
- [ ] Add feature flag system (runtime + env + workspace scope)
- [x] Add capability/permission policy engine primitives — ADR-021 (`identity/authorize.ts`, `permissions.ts`, `grant-service.ts`)
- [ ] Add module loader contract (for plugins/themes/providers) — Tier-1 declarative plugin data-modules are built (ADR-023, `features/plugins/data-module.ts`/`snapshot.ts`); a general load/init/stop lifecycle contract for Tier-2/3 code plugins is scoped by ADR-024 but not built
- [ ] Add architecture boundary enforcement (lint/import rules) — no eslint/dependency-cruiser config in the repo; see §24's still-open dependency-cruiser/knip evaluation items
- [ ] Add core observability hooks (metrics/log/tracing abstractions) — no metrics/tracing port exists; ADR-046 (Proposed) touches boot readiness/module-status exposure, not full observability

### 2) Eventing / Hybrid Sync + Async
- [x] Finalize domain event envelope schema + versioning — `(workspaceId, aggregateId, actorId, occurredAt, metadata)` envelope in `core/ports.ts`, ADR-007/009
- [ ] Define event naming conventions and ownership — a consistent `domain.verb` convention is used pervasively in code (`entry.created`, `content_type.tombstoned`, etc.) but it isn't written down as a standalone conventions doc
- [ ] Implement persistent outbox adapter (DB-backed) — scoped by ADR-046 Phase 1 (pending debate); only an in-memory outbox exists today (`core/events/memory-bus.ts`, `outbox-worker.ts`)
- [ ] Implement outbox poller/worker with retries and backoff — an in-memory worker exists (`core/events/outbox-worker.ts`); no durable poller with retry/backoff — scoped by ADR-046 Phase 1
- [ ] Add idempotency support for handlers — idempotency exists for gated mutations (`core/gated-mutations/token.ts`'s idempotency keys, `core/operation-lock.ts`) but not specifically for event-handler/outbox consumption
- [ ] Add dead-letter strategy for repeatedly failing events — ADR-036 built dead-letter handling for outbound webhook delivery specifically (`integrations/delivery.ts`); the core domain-event outbox has no DLQ yet
- [ ] Add event replay strategy for recovery/backfill — explicitly deferred by ADR-022 ("Defers the replay engine")
- [x] Add event contract tests — `core/events/__tests__/`, `core/events/__specs__/`

### 3) Data Layer / DB / ORM
- [x] ~~Choose primary DB strategy for early stage (Postgres first)~~ — superseded: went SQLite-behind-ports first (better-sqlite3, ADR-015), Postgres deferred to a later adapter swap (ADR-006 rule-of-two)
- [x] Choose ORM/query layer (Drizzle/Kysely/Prisma decision) — Drizzle (ADR-015)
- [x] Define migration strategy and tooling — `drizzle-kit generate`, committed migrations (ADR-015); a second independent migration set exists for the storage-journal sidecar DB (ADR-041)
- [x] Define schema naming conventions and table ownership — ADR-022/023/026 namespace/identifier grammar (`p_{pluginId}__*`, closed lowercase-alphanumeric-plus-hyphen grammar), `infra/db/schema.ts` ownership per feature
- [x] Implement workspace/tenant isolation strategy at DB level — ADR-007 (`workspaceId` everywhere) + ADR-021 composite `(workspace_id,id)` FKs
- [x] Add transactional unit-of-work patterns for commands — `core/commands/command.ts`, `core/gated-mutations/gateway.ts` (same-tx write+revision pattern used pervasively)
- [x] Add repository adapter conventions — `repo.memory.ts`/`repo.sqlite.ts` pairs (ADR-006 rule-of-two) pervasive; shared `findOneBy` base (ADR-042 item 1, `infra/sqlite/repo-helpers.ts`)
- [x] Add seed/fixtures strategy for local and tests — `server/seed.ts` (ADR-042 item 3 fixed the `content-db.ts` → `server/seed.ts` dependency direction)
- [x] Add backup/restore and rollback strategy — ADR-041 (Storage Timeline) + ADR-045 (Recovery), fully built (`features/storage`, `features/recovery`)

### 4) Auth / Identity / Permissions
- [x] Define identity model (user, service account, workspace membership) — ADR-021 (one `principals` table: user/agent/api_key/system)
- [x] Define RBAC model (roles, permissions, scopes) — ADR-021, `identity/permissions.ts` catalog
- [x] Define policy evaluation model (resource/action/context) — ADR-021 `authorize()` is ordinary core code, flat permission strings, no separate PolicyPort
- [x] Add auth middleware contract for server layer — `server/middleware/dev-auth.ts`, `getAuthedPrincipal`/`deps.authorize()` pattern used across every admin route
- [x] Add session/token strategy — `identity/auth-service.ts` (`SESSION_TTL_MS`, SHA-256-hashed session tokens, argon2id password hashing)
- [x] Add audit trail for security-sensitive actions — change-sets (ADR-008), append-only revisions with actor+monotonic seq (ADR-022), the storage/migration/restore ledger (ADR-041)
- [x] Add permission test matrix — `identity/__tests__/permissions.test.ts`, `permission-migrations.test.ts`

### 5) Storage / Media
- [x] Define media object model and metadata schema — ADR-027 (seeded `media` entry + `asset_blobs`/`asset_renditions` sidecars)
- [x] Define upload pipeline contract (validation, transforms, derivatives) — ADR-027, `media/media-service.ts`, `image-transformer.ts`, `rendition-service.ts`
- [x] Add signed URL strategy and expiry model — ADR-027 frozen immutable URL scheme, mint-only signed URL on a cookie-less origin
- [x] Add media lifecycle policies (retention, deletion, restore) — ADR-027 GC policy (`media/blob-gc.ts`, grace period, 2-phase journaled delete)
- [x] Add media quality checks (format, size, accessibility metadata) — ADR-027 `MediaIngressPolicy` (SSRF/pixel-bomb/magic-byte/MIME allowlist) + `alt` field in `media/types.ts`
- [x] Add content-media relationship model — ADR-027 `entry_refs`, `bodyJson` stores refs not URLs

### 6) Search / Indexing
- [ ] Define search document schema and indexing boundaries — not built; note ADR-022's core-provisioned expression indexes (`content-types/index-provisioning.ts`) are DB query-performance indexes, not a search subsystem, and don't satisfy this item
- [ ] Define indexing triggers from domain events
- [ ] Implement index upsert/remove handlers
- [ ] Define hybrid search strategy (keyword + semantic optional)
- [ ] Add search relevance tuning strategy
- [ ] Add search contract tests and latency budgets

### 7) Feature Modules (Initial Core Features)
- [ ] Workspace module full CRUD + lifecycle events — create-only today (`features/workspace/create.ts`); read/update/delete/lifecycle not yet built (matches the still-open "Workspace management beyond create" item in the Accomplish section above)
- [x] User + membership module — ADR-021 (`identity`, principals) + ADR-030 (`src/members`, audience directory)
- [x] Content model module (types, fields, validation) — ADR-022/043 (`features/content-types`)
- [x] Content entry module (CRUD, status transitions) — ADR-022/043 (`features/entries`: create/update/publish/unpublish)
- [x] Revision/version module — ADR-022 append-only revisions (entries, content-types, taxonomy all revision)
- [ ] Publishing workflow module — basic publish/unpublish exists (`features/entries`); no draft→review→scheduled multi-stage workflow yet
- [x] Taxonomy/relations module — ADR-044 (`features/taxonomy`)
- [x] Settings module (workspace/system) — ADR-028 (`features/settings`)

### 8) Theme System
- [x] Define theme manifest schema — `theme.json` (`ThemeManifest`, ADR-020 `tier` field), `features/theme/theme.ts` — spike-level implementation per its own docstring, not yet the full SPEC-004 validation pipeline
- [ ] Define template hierarchy and route mapping — route→template-id resolution exists as a spike (`server/http/site/render.ts`); the full template-hierarchy/fallback design is ADR-017 (Proposed, blocked on theme system)
- [ ] Define slots/regions injection model — ADR-020 Tier-2 `render_block`/`{{ content|raw }}` seams exist as a SPIKE only (per project memory: "C6 hardening still open")
- [ ] Add theme versioning and compatibility checks — ADR-019 covers theme-declared plugin dependencies; theme-to-engine versioning/compat checks not built
- [ ] Add theme lifecycle hooks (install/enable/disable/update)
- [ ] Add theme safety checks and rollback strategy — no theme-specific safety/rollback; ADR-041 (DB migration rollback) and ADR-023 (plugin snapshot-before-DDL) are the closest analogs for other domains

### 9) Plugin System
- [x] Define plugin manifest schema and capability declaration — ADR-024 (capability manifest namespace, frozen now/contents iterate) + ADR-004 (signed manifest artifact format)
- [ ] Define plugin lifecycle API (install/load/init/stop/uninstall) — Tier-1 dataModule install/uninstall built (ADR-023, `features/plugins/data-module.ts`/`snapshot.ts`); full load/init/stop lifecycle for Tier-2/3 code plugins deferred
- [ ] Define plugin dependency graph and conflict rules — ADR-019 covers theme→plugin declared dependencies only; general plugin-to-plugin conflict/dependency graph not built
- [ ] Define plugin sandbox/permission enforcement — capability-gating model decided and Accepted (ADR-024 default-deny manifest); the actual Tier-2 sandbox isolation mechanism ("first rung" per-site Electron `utilityProcess`) is not yet built
- [ ] Define plugin UI extension points — ADR-025 decided the mechanism (sandboxed cross-origin iframe + `postMessage` RPC) but it isn't built yet; unblocks OQ-07 (admin-surface/extension-panel registry, itself still open)
- [ ] Define plugin server extension points (routes/hooks/events) — ADR-024 decided the hook-priority model conceptually; no general-purpose hook/route extension-point registry exists beyond feature-specific hooks (e.g. `newsletter/hooks.ts`)
- [x] Add plugin compatibility/versioning policy — ADR-005/024 (SDK compat surface, semver, deprecation ladder, frozen transport-agnostic ABI)
- [ ] Add plugin observability and fault isolation

### 10) HTTP/API Server
- [x] Keep current Express baseline stable — still the transport, no migration since ADR-001
- [ ] Define transport-agnostic route/handler shape — a consistent route-handler pattern is used pervasively in practice (`getAuthedPrincipal` → `deps.authorize()` → domain call → `res.json()`) but no formal transport-agnostic contract layer has been decided
- [ ] Decide Fastify vs Hono migration path — no decision made; Express remains
- [ ] Add request validation and response schema enforcement — ad hoc per-route validation exists (typed `ValidationError` classes); no schema-enforcement library adopted (see §24's still-open Zod evaluation)
- [ ] Add error mapping strategy (domain -> HTTP) — `src/server/error-mapping/` exists only as a placeholder (INFO.md, no code); mapping is currently ad hoc per route
- [ ] Add rate limiting and security headers — per-feature rate limiting exists (`forms/rate-limit-profile.ts`, ADR-030 magic-link rate limit) and per-surface CSP exists (ADR-025 plugin iframe, ADR-038 egress policy), but no app-wide security-headers/rate-limit middleware
- [x] Add API versioning strategy — de facto `/api/admin/v1/...` prefix convention in place across all admin routes
- [ ] Add OpenAPI generation strategy

### 11) Admin UI (Headless Admin Client)
- [x] Define admin API contract and client SDK boundaries — `apps/admin/src/lib/api.ts`
- [x] ~~Choose baseline stack (Next.js + React + Zustand)~~ — superseded: actual stack is Vite + React (`apps/admin/`), not Next.js/Zustand, per the lean-rebuild decision
- [x] Build shell layout (navigation, module registry, auth guard) — `admin-shell/navigation.ts` + `apps/admin/src/sections/`
- [ ] Build workspace management screens — no `Workspace.tsx` section exists; blocked on the workspace-module gap above (§7 item 1)
- [x] Build content type builder UI — `apps/admin/src/sections/Collections.tsx`
- [x] Build content editor UI (forms, validation, revisions) — `PostEditor.tsx`, `CollectionEntryEditor.tsx`
- [x] Build media manager UI — `apps/admin/src/sections/Media.tsx`
- [x] Build settings and permissions UI — `Settings.tsx`, `Roles.tsx`, `Users.tsx`
- [ ] Build extension point rendering in admin — ADR-025 mechanism decided, not built; no plugin panel registry screen
- [ ] Build admin notification center

### 12) Agentic UI / AI Layer
- [ ] Define AI interaction model (assistant panel + task execution) — ADR-013 (Accepted) defines the target model; implementation is still a stub FAB, not built (no CopilotKit/AG-UI code exists in `src/` or `apps/admin/src/`)
- [ ] Define tool registry contracts and tool safety policy — ADR-013 `tools.ts` registry + ADR-014 profiles decided; not implemented
- [ ] Define structured outputs and tool-call protocol — ADR-013/024 ABI (async + serializable-only, no live objects) sets the constraints; no concrete implementation yet
- [ ] Define context assembly pipeline (system/site/task/history)
- [ ] Define memory policy (session, episodic, semantic boundaries)
- [ ] Define guardrails and human-in-the-loop checkpoints — ADR-016 (propose→review→accept/reject→revert change-sets for agentic document editing) scopes this pattern generally; not implemented as an AI guardrail system yet
- [ ] Define AI audit trail and explainability logging
- [ ] Define AG-UI event/state model for streaming interactions — ADR-013 names AG-UI as the protocol; no implementation yet

### 13) Protocols and Integrations
- [ ] Define MCP exposure model for tools/data — no MCP code exists in `src/`; related future planning lives in §22's "Agentic Web / Playground MCP Backlog" (also still open)
- [ ] Define A2A support boundaries
- [x] Define webhook/event subscription model for external systems — ADR-036 Integrations/webhooks (`src/integrations`)
- [ ] Define import/export contracts for interoperability
- [ ] Define AI WordPress database ingestion agent: connect read-only to a WordPress MySQL/MariaDB database, extract posts/pages/custom post types, body content, metadata, taxonomies, authors, revisions, attachments, and image assets, map them into Tovu content/media schemas, and run dry-run validation, permalink/redirect mapping, resumable import jobs, audit logs, and rollback/compensation planning before writes.
- [x] Define provider adapter lifecycle contracts — ADR-006 rule-of-two adapter pattern implemented pervasively (mail: ADR-037, http: ADR-038, blob-store: ADR-027, db-ops)

### 14) Testing Strategy
- [ ] Define test pyramid expectations per module — no written doc; consistent unit+integration split exists in practice
- [x] Add `__tests__` baseline in all modules — 34 `__tests__` directories across the codebase
- [ ] Add `__specs__` baseline in all modules — only 10 modules have `__specs__/` (post, presentation, workspace, forms, headless, redirects, settings, server); most newer feature modules (content-types, entries, taxonomy, storage, recovery, media, members, navigation, etc.) don't yet
- [ ] Add contract tests for every core port — 8 rule-of-two ports have `*.contract.test.ts` today (forms, settings, identity, integrations×2, redirects, members, newsletter); content-types/entries/taxonomy still lack a SQLite adapter at all (in-memory only, per the spec-016-020 progress ledger), so no contract test exists for them yet
- [x] Add integration tests for command + outbox flow — `core/commands/__tests__/command-atomicity.test.ts`, `core/events/__tests__/`
- [x] Add API route tests — `server/__tests__/routes/*.test.ts`, 18+ admin routes covered as of the 2026-07-15 backend session
- [ ] Add regression suite for high-risk flows — no dedicated regression-suite label; the full `npm test` run (1400+ tests) effectively serves this role today
- [ ] Add performance smoke tests

### 15) DevEx / Tooling / CI
- [ ] Standardize project scripts (dev/build/typecheck/test/lint) — dev/build/typecheck/test/db:generate scripts exist in `package.json`; no lint script
- [ ] Add lint + formatter + architecture lint — no eslint/prettier config in the repo
- [ ] Add commit/PR conventions — no CONTRIBUTING.md/commit-convention doc in the repo itself
- [ ] Add CI pipeline with required gates — no `.github/workflows/` in the repo
- [x] Add local dev bootstrap docs — `START-HERE.md` + `npm run setup` (note: `START-HERE.md` itself is now stale — it claims "there is no code yet" — but the doc exists and is the intended bootstrap entry point; refreshing it is outside this reconciliation's scope)
- [ ] Add environment matrix docs (dev/staging/prod)
- [ ] Add codegen strategy for typed clients if needed

### 16) Reliability / Ops / Security
- [ ] Add structured logging + correlation IDs
- [ ] Add metrics and tracing
- [ ] Define SLOs and operational dashboards
- [ ] Define incident response runbooks
- [x] Define backup/restore runbooks — superseded by a real shipped feature, not just a runbook: ADR-041 (Storage Timeline) + ADR-045 (Recovery screen)
- [ ] Add secrets management policy — explicitly deferred by ADR-028 itself ("secret gate: reject `secret:true` until secret-store ADR")
- [ ] Add dependency and supply-chain scanning
- [ ] Add vulnerability response policy

### 17) Product Safety (From WordPress Pain Clusters)
- [ ] Update preflight checks and safe rollout design — ADR-041's cost-gated boot migration policy (`evaluateBootMigrationPolicy`) is a preflight-check-shaped mechanism for one domain (DB migrations); no general preflight/safe-rollout framework
- [ ] Incident analysis and guided remediation design — ADR-045's Recovery screen (itemized discarded-write-window disclosure before restore) is the closest built analog; general incident-analysis tooling isn't built
- [ ] Conflict isolation and quarantine strategy
- [ ] Performance attribution and budgets
- [ ] Authoring safety and template recovery — ADR-016 (propose→review→accept/reject→revert change-sets) is the closest scoped analog; not built as a UI yet
- [ ] Migration/portability strategy — ADR-041 covers DB schema migration; content import/export portability (e.g. the WordPress ingestion agent, §13) is still open
- [ ] Governance/trust and provenance strategy

### 18) Documentation / Knowledge Retention
- [x] ~~Keep `PROJECT_MEMORY.md` updated each session~~ — superseded: the actual mechanism is `ADS-memory/memory/project_memory.md` plus the AI-Dev-Shop continuity-ledger workflow, not a root-level `PROJECT_MEMORY.md`
- [x] Keep module `INFO.md` accurate as files evolve — 26 `INFO.md` files maintained across modules
- [ ] Keep module `__specs__` synced with implementation — only 10 of the many feature modules have `__specs__/` (see §14)
- [x] Maintain ADR log for major architecture decisions — `ADR-INDEX.md`, 46 ADRs, actively maintained
- [ ] Maintain glossary of domain terms — no standalone glossary doc; terms are defined inline within individual ADRs
- [ ] Maintain roadmap by milestone (M0, M1, M2...) — `todos.md` itself is the closest thing but there's no formal M0/M1/M2 milestone doc

### 19) WordPress Parity Gap Checklist (Detailed)

#### Content + publishing
- [x] Post/page/custom-type parity (authoring + APIs + permissions) — `features/post` (post/page) + `features/content-types` (custom types, ADR-043 Collections), full authz via ADR-021
- [ ] Draft/review/published/future/private status model parity — draft/published exists (`features/entries`, `features/post`); scheduled ("future") and private-visibility states not confirmed built
- [ ] Scheduled publishing with timezone correctness
- [ ] Revisions + restore + compare views — append-only revisions exist (ADR-022); restore-to-a-past-revision and compare-views UI not built
- [ ] Autosave and crash recovery
- [x] Slug/permalink management and uniqueness handling — ADR-039 routing + slug-uniqueness guard in `entries/write-service.ts` + ADR-033 redirects capture on slug change
- [ ] Trash/restore/delete lifecycle — content-type deprecate/tombstone/cleanup lifecycle is built (ADR-043); a per-entry trash/delete lifecycle is not confirmed
- [ ] Sticky/featured content behavior

#### Taxonomy + navigation
- [x] Categories/tags/custom taxonomies — ADR-044 (`features/taxonomy`)
- [ ] Term archives and filtering behavior — taxonomy backend/admin is built (ADR-044); public-facing term-archive/filter pages are not confirmed
- [x] Menu builder (hierarchical) + assignment to theme locations — ADR-029 (`src/navigation`, `MenuEditor.tsx`)
- [ ] Breadcrumb/navigation helper model — ADR-039 routing (`urlFor`/`isActive`) provides the primitive; no breadcrumb helper built on top yet

#### Editor + design system
- [ ] Block editor equivalent (or strict alternative) with schema safety — a TipTap-based rich-text editor exists (`apps/admin/src/sections/PostEditor.tsx`, `CollectionEntryEditor.tsx`); not a block-based, schema-safe editor per ADR-016/017's fuller vision
- [ ] Reusable blocks/patterns/templates
- [ ] Full-site editing equivalents (template parts, global styles) — ADR-017 (Proposed, blocked on theme system)
- [ ] Media embed blocks and short content primitives (quote/code/table/etc.)
- [ ] WYSIWYG parity between editor and rendered output

#### Theme system parity
- [ ] Template hierarchy and fallback rules — same gap as §8 item 2 (ADR-017 Proposed, blocked)
- [x] Theme manifest and settings UI — `theme.json` manifest (ADR-020) + `apps/admin/src/sections/Appearance.tsx`
- [ ] Child-theme equivalent strategy
- [ ] Theme update compatibility checks and rollback
- [ ] Theme preview and activation flow — activation flow exists (`Appearance.tsx`'s `activate()`); a preview-before-activate step wasn't found

#### Plugin ecosystem parity
- [ ] Plugin install/activate/deactivate/update/uninstall flows — Tier-1 install/uninstall is built (ADR-023, `features/plugins/data-module.ts`); activate/deactivate/update flows and UI not confirmed
- [ ] Plugin dependency + compatibility checks — ADR-019 covers theme→plugin declared deps only; general plugin-to-plugin checks not built
- [ ] Hook/filter-like extension model — ADR-024 decided the hook-priority model conceptually; no general-purpose registry beyond feature-specific hooks
- [ ] Plugin settings registration and UI mounting — ADR-025 decided the iframe/`postMessage` mechanism; not built yet
- [ ] Plugin conflict detection and safe disable/quarantine

#### Admin + operations
- [x] Users/roles/capabilities management UI — `Users.tsx` + `Roles.tsx` (ADR-021)
- [ ] Comments/moderation system (if in scope) — ADR-031 Accepted, but backend NOT built yet (blocked on ADR-023's dataModule engine per ADR-INDEX); only `comments/ports.ts`/`types.ts` exist today
- [x] Settings pages parity (general/reading/writing/permalinks-like) — ADR-028 (`features/settings`) + `Settings.tsx`
- [ ] Update center and update history
- [ ] Built-in site health diagnostics — ADR-041's drift banner (`features/storage/drift.ts`) is a partial analog, but no route/UI is wired for it yet (deliberately deferred in the 2026-07-15 backend session)
- [ ] Import/export tooling and migration helpers

#### SEO + discovery
- [x] XML sitemap generation + controls — ADR-032 (`src/seo/sitemap.ts`)
- [x] Canonical/meta/schema controls — ADR-032/040, `seo/seo.ts`, `seo/page-head-contributor.ts`
- [x] Robots and indexing controls — ADR-032 (`buildRobots` in `seo/sitemap.ts`)
- [x] Redirect rules + canonicalization strategy — ADR-033 (`src/redirects`)

#### Media + files
- [x] Media library parity (search/filter/metadata) — ADR-027 + `Media.tsx`
- [x] Image derivatives and responsive sizes — ADR-027 (`media/transform-registry.ts`, `rendition-service.ts`)
- [x] ~~File replacement/versioning behavior~~ — superseded: ADR-027 deliberately rejects in-place file replace; source-replace mints a new media entry instead (write-once `bodyJson.$.source.sha256`)
- [ ] Bulk media operations

#### Infrastructure + reliability
- [ ] Cron/scheduler equivalent
- [ ] Caching strategy (page/data/object) with invalidation — one narrow cache exists (SEO sitemap cache, `seo/sitemap.ts`'s `regenerateSitemapCache`/`invalidateSitemapCache`); no general page/data/object caching strategy
- [x] Backup/restore UX — ADR-041/045, `Storage.tsx`/`Recovery.tsx`
- [ ] Safe update/rollback flows — ADR-041's migrate-forward state machine is the closest analog for DB schema changes; app/plugin/theme update rollback isn't built
- [x] Multisite/tenant strategy (if parity target includes multisite) — ADR-007 (workspace scoping) + ADR-011/012 (deployment topology; Tovu-Runner as the multi-site host)

### 20) Payload/Directus/Ghost Parity and Strategic Additions

#### Payload-like capabilities
- [x] Field-level schema builder parity (rich field types + validation) — ADR-022/043 (5-entry field-kind enum, validated on write)
- [ ] Relationship and nested/document modeling parity — taxonomy relations (ADR-044) + media `entry_refs` (ADR-027) exist; ADR-022's flat-typed-columns + JSON-ext-bag model is deliberately not a Payload-style deep nested/relational document model
- [ ] Access control at collection/field/doc level — collection/doc-level access control is built (ADR-021 permissions); field-level ACL is not built
- [ ] Hooks lifecycle parity (`beforeChange`, `afterRead`, etc. equivalent)
- [x] Local API equivalent (server-side direct invocation) — every feature module exposes direct typed functions (`write-service.ts` etc.) callable server-side without HTTP, matching Payload's Local API pattern (an architectural property of the whole codebase, not a discrete build item)
- [x] Draft/publish + versioning parity — `features/entries` publish/unpublish + ADR-022 revisions
- [ ] Uploads with focal points/transforms and ACL — transforms + ACL are built (ADR-027); focal-point cropping is not confirmed

#### Directus-like capabilities
- [x] ~~Database-first introspection mode (optional strategy)~~ — superseded/rejected: ADR-043 explicitly rejects Directus-style per-collection tables/DB-first introspection for operator-defined content types in favor of a data-driven registry
- [ ] Data Studio-like admin configurability — a basic registry UI exists (`Collections.tsx`); full Directus-style Data Studio configurability isn't a stated goal or built
- [ ] Flows/automation builder equivalent
- [ ] Realtime subscriptions and event streams
- [x] Granular permissions matrix (role/policy/filter-based) — ADR-021 (roles→policies→permissions, explicitly "Directus-shaped" per the ADR's own text)
- [ ] Extension types parity (interface/display/layout/module/hook/endpoint/op/panel analogs)
- [ ] Marketplace/distribution model for extensions (if in scope) — ADR-024 sets the trust-tier forcing function for a future marketplace ("shipping the marketplace is shipping the sandbox") but the marketplace itself isn't built

#### Ghost-like capabilities
- [ ] Writer-first editing experience quality target
- [x] Membership/subscription primitives — ADR-030 (`src/members`: directory, consent, magic-link) — note subscription tiers/paywall specifically are still open, see the Membership/Paywall plugin items in §22
- [x] Newsletter/email publishing primitives — ADR-034 (`src/newsletter`), domain layer built; routes/UI intentionally parked per explicit owner request (not a gap — deferred indefinitely by choice)
- [x] Publication settings and audience segmentation — `newsletter/lists.ts` + ADR-034
- [ ] SEO + canonical + social cards defaults — canonical/meta is done (ADR-032); social-card (OG/Twitter card) defaults are not confirmed built
- [ ] Performance-first defaults for publishing surfaces

#### Strategic additions (beyond parity)
- [ ] AI-native operations assistant (safe tool-calling) — same gap as §12, nothing built yet
- [ ] Guided incident remediation — ADR-045's Recovery screen is the closest built analog
- [ ] Preflight update risk checks + canary + rollback — ADR-041's migrate-forward cost-gating is a partial analog, scoped to DB migrations only
- [ ] Policy-based governance and provenance controls
- [x] Contract-first plugin security model — ADR-023/024/025/026 collectively are this: capability-gated typed writes, a frozen transport-agnostic ABI, and cross-origin iframe isolation for plugin JS

### 21) Big Missing Items to Explicitly Track
- [ ] Billing/licensing domain model (if SaaS)
- [ ] Tenant provisioning lifecycle (create/suspend/delete/archive) — create/instantiate is built (ADR-012 site template instantiation); suspend/archive/delete lifecycle is not built
- [ ] Rate limits and abuse prevention — per-feature rate limits exist (forms, ADR-030 magic-link); no platform-wide abuse-prevention layer
- [ ] Legal/compliance requirements (audit, retention, privacy workflows) — consent (ADR-030 D1c) and erasure-handler patterns (ADR-031 `principal.erasure.requested`, ADR-035 erasure scope) exist per-domain; no unified compliance/retention framework
- [ ] Data portability + exit tooling guarantees
- [ ] Disaster recovery objectives (RPO/RTO targets) — ADR-041/045 build the restore mechanism itself; no stated RPO/RTO numeric targets
- [ ] Internationalization/localization strategy
- [ ] Accessibility baseline and regression checks — an `alt` field exists on media (ADR-027, `media/types.ts`); no broader accessibility baseline or regression testing
- [x] Analytics/event taxonomy and data governance — ADR-035 (`src/analytics`, PII-death-at-sink ingest design)
- [ ] Support/admin tooling for operations team

### 22) AEO / GEO / AI Surfaces (First-Class)

#### AEO (Answer Engine Optimization)
- [ ] Define AEO content model (Q&A entities, canonical answer blocks, evidence links)
- [ ] Add structured data generation for answer engines (schema consistency + validation) — a JSON-LD serialization primitive already exists (`server/http/site/page-head.ts`'s `serializeJsonLd`, ADR-032 `seo/page-head-contributor.ts`); full per-content-type auto-generation is not confirmed complete
- [ ] Build answer freshness workflow (staleness checks + auto-review queue)
- [ ] Add answer quality scoring (accuracy, completeness, citation confidence)
- [ ] Add AEO analytics surface (answer impressions, citation wins, decay signals)

#### GEO (Generative Engine Optimization)
- [ ] Define GEO entity graph model (brand, product, docs, features, relationships)
- [ ] Add machine-readable knowledge packaging (LLM-ready endpoint/doc bundles)
- [ ] Create an AI-readable site guide/template pack for Next.js, Vite, and other frontend users covering semantic HTML, structured data, canonical metadata, sitemaps, content hierarchy, and LLM-readable source pages
  Starter links to review later (not exhaustive):
  - Search Engine Land: `https://searchengineland.com/google-publishes-guide-on-optimizing-for-generative-ai-features-477671`
  - Google Search Central: `https://developers.google.com/search/docs/fundamentals/ai-optimization-guide`
- [ ] Add citation-safe source-of-truth pages and canonical mapping
- [ ] Add GEO monitoring (model mention tracking, citation drift, hallucination risk)
- [ ] Add remediation workflows for weak/missing entity representation

#### AIO/GEO Sitemap Plugin
Source video: `https://www.youtube.com/watch?v=4WyduoGpIPo` (Dead Internet / Search Heist / Zero-Click analysis)

##### Visibility (GEO-era sitemap as knowledge declaration)
- [ ] Define "knowledge sitemap" schema — entity graph, canonical answer anchors, authority claims, not just URLs
- [ ] Add structured content relationship mapping (topics → pages → evidence → citations)
- [ ] Generate machine-optimized sitemap variants for AI crawlers (beyond XML — structured data, entity bundles)
- [ ] Add per-page "citability" metadata (canonical answers, freshness date, authorship, source chain)
- [ ] Integrate with existing GEO entity graph model (section above)

##### Defense (Anti-Heist / Anti-Clone)
- [ ] Add sitemap topology monitoring — detect when a competing domain mirrors your URL structure
- [ ] Add selective sitemap exposure — full graph for trusted crawlers, minimal for unknowns
- [ ] Add content fingerprinting and first-publication timestamping (prove original authorship)
- [ ] Add domain lapse / zombie page alerting — warn before dormant pages expire and become cloneable
- [ ] Add lookalike domain detection (variations on site name appearing with mirrored content)
- [ ] Add crawler pattern analysis — detect mass-export behavior vs normal crawling

##### Intelligence (Citation & Displacement Tracking)
- [ ] Track which pages are being cited in AI overviews / answer engines
- [ ] Track content staleness signals (pages going stale = ripe for displacement by competitors)
- [ ] Track competitor topology mirrors and content overlap drift
- [ ] Add alerting for citation loss / decay (you were cited, now you're not)
- [ ] Add dashboard: citation wins, displacement risks, heist attempts, freshness scores

#### Content Provenance & Defense (Platform-Level)
Source video: `https://www.youtube.com/watch?v=4WyduoGpIPo`

- [ ] [Optional-Weak] Content provenance as a first-class CMS feature — content signing, timestamping, editorial process declaration at platform level (proves human authorship + original pub date in a model-collapse world)
- [ ] Add intelligent crawler policy management beyond robots.txt — per-crawler rules, welcome citation bots, throttle scrapers, detect mass-export patterns
- [ ] Add "human-first" signal packaging — editorial process metadata, authorship chains, source citations, signals that quality-focused engines will reward
- [ ] Add content originality scoring — flag when published content looks AI-generated or duplicative before it damages site authority

#### AEO Plugin (Tovu-Native — replaces Yoast/RankMath)
Source research: AI engine crawler/indexing patterns (Google AI Overviews, ChatGPT Search, Claude, Perplexity, Bing Copilot)

##### Per-page auto-generated outputs
- [ ] Auto-generate JSON-LD structured data from typed content model (Article, HowTo, Product — context-dependent)
- [ ] Auto-generate "direct-answer block" (2-3 sentence extractable answer) placed at top of page
- [ ] Auto-generate clean `.md` mirror of each page at `<url>.md` for LLM-friendly consumption
- [ ] `data-nosnippet` zone management — let editors mark sections excluded from AI extraction
- [ ] Meta description generation optimized for extraction (complete sentences, factual, 150-160 chars)

##### Site-level outputs
- [ ] Auto-generate `/llms.txt` from site structure and key pages (low-cost future bet)
- [ ] IndexNow integration — ping Bing instantly on publish/update (only proven instant-discovery signal)
- [x] Sitemap.xml with accurate `<lastmod>` dates (freshness signal across all engines) — ADR-032 (`seo/sitemap.ts`)
- [ ] robots.txt builder — per-bot allow/block config (OAI-SearchBot, GPTBot, PerplexityBot, Googlebot, bingbot, ChatGPT-User) — a generic `RobotsPolicy`/`buildRobots` exists (ADR-032, `src/seo/`); per-bot granularity (OAI-SearchBot/GPTBot/etc.) not confirmed

##### Engine-specific optimizations
- [ ] Google AI Overviews: "nugget in the mine" content structure (long-form with extractable direct answers per section)
- [ ] ChatGPT Search: ensure pages indexed in Bing (OAI-SearchBot uses Bing's index); separate GPTBot (training) vs OAI-SearchBot (search) controls
- [ ] Perplexity: freshness-first strategy — auto-flag stale content, surface recency signals, original research/data emphasis
- [ ] Bing Copilot: IndexNow for real-time discovery + `data-nosnippet` for fine-grained control
- [ ] Claude: clean semantic HTML that converts well to text/markdown, minimal JS-dependent content

##### Content quality signals (agent-assisted)
- [ ] Claim + evidence pair detection — AI suggests adding citations/data to unsupported claims
- [ ] Heading hierarchy validation — flag broken H1>H2>H3 structure
- [ ] "Citability score" per page — how extractable/quotable is this content for AI engines?
- [ ] Freshness monitoring — alert when pages go stale and become displacement targets

##### Forms plugin (TanStack Form-based)
- [x] Define form schema model compatible with TanStack Form's typed API (agent-manipulable field definitions, validation rules, nested structures) — `src/forms` (`forms.ts`, `types.ts`, `manifest.ts`)
- [x] Form builder capability contracts (agent can create/modify/validate forms via typed commands) — `forms/write-service.ts` + `apps/admin/src/sections/FormEditor.tsx`/`FormsList.tsx`
- [ ] Submission routing, conditional logic, payment integration — submission handling + notification is built (`forms/submit-service.ts`, `notify-subscriber.ts`); conditional logic and payment integration are not confirmed built
- [x] Notification/webhook triggers on submission — `forms/notify-subscriber.ts` + ADR-036 integrations webhooks

##### Multilingual plugin
- [ ] Locale model + fallback chains (per-content-type locale config)
- [ ] Agent-driven translation workflow (auto-translate on publish, human review queue)
- [ ] URL slug per locale, hreflang generation, locale switcher component
- [ ] Translation memory / glossary for consistency across content
- [ ] Parity tracking — surface which locales are out of sync

##### Membership/Paywall plugin
- [ ] Subscription tier model (plans, entitlements, content access rules)
- [ ] Content restriction rules (per-page, per-section, per-content-type)
- [ ] Drip/scheduled content release
- [ ] Payment gateway integration (Stripe primary)
- [x] Member directory, login/registration flows, profile management — ADR-030 (`src/members`)

#### AI Surfaces (User + Employee)
- [ ] Define end-user AI surface (assistant panel for guided site changes)
- [ ] Define employee/internal AI surface (operations console with elevated tooling)
- [ ] Define tool permission tiers (user-safe vs staff-only vs admin-only)
- [ ] Add approval flows for destructive/high-impact tool actions
- [ ] Add audit logs for all AI tool calls and resulting mutations
- [ ] Add simulation/dry-run mode before applying front-end or back-end changes
- [ ] Add rollback checkpoints for AI-applied changes
- [ ] Add dual-surface UX contracts (what users can self-serve vs what staff can perform)

#### AI Tooling for Frontend + Backend Mutation
- [ ] Tooling: frontend layout/style/content mutation tools
- [ ] Tooling: backend schema/config/workflow mutation tools
- [ ] Tooling: safe migration tools (preview diff, impact analysis, revert plan)
- [ ] Tooling: test-and-verify tools (run checks before apply)
- [ ] Tool orchestration policy: require tool-use-first and structured outputs
- [ ] Add guardrails to prevent unbounded or cross-tenant mutations

#### Agentic Web / Playground MCP Backlog
Source prompts:
- Automattic: `https://automattic.com/2026/04/21/wordpress-operating-system-agentic-web/`
- WordPress Playground MCP: `https://make.wordpress.org/playground/2026/03/17/connect-ai-coding-agents-to-wordpress-playground-with-mcp/`

- [ ] Evaluate the "WordPress as operating system of the agentic web" thesis against Tovu's strategy: governed web operating layer exposing content, admin, extensions, jobs, diagnostics, and site state as safe agent capabilities.
- [ ] Track the agentic-web challenge set as explicit risks to solve later: legacy/technical-debt drag, inconsistent extension quality, abandoned/insecure extensions, performance overhead, extension-order complexity, fragmented runtimes, and missing ecosystem quality signals.
- [ ] Define a Tovu agent capability catalog for content, media, themes, plugins, settings, jobs, migrations, diagnostics, and recovery, with descriptors reusable by admin UI, AI assistant, MCP, and future protocols.
- [ ] Define a WordPress Playground-style Tovu Playground: disposable local/browser sandbox for AI coding agents to test site, content, theme, plugin, and schema changes without production writes.
- [ ] Add a local-only MCP bridge for Tovu Playground with token/origin protection, explicit user-scoped enablement, and no production credentials by default.
- [ ] Expose sandbox tools for HTTP requests, admin navigation, content mutation, theme/plugin file operations, migration dry-runs, test execution, job inspection, snapshot reset, and export/import.
- [ ] Add an AI coding agent integration contract covering sandbox creation, patch application, preview URL, diff review, human approval, audit log, and rollback checkpoint linkage.
- [ ] Add contract tests proving MCP/playground actions cannot exceed equivalent authenticated admin permissions or bypass safe-mode/recovery policy.

### 23) Platform Gaps Still Missing

#### Governance, data, and compliance
- [ ] Define data classification policy (PII, sensitive business data, public data)
- [ ] Define retention and deletion policy per data class
- [ ] Implement data subject request workflows (export/delete/correction) — erasure-handler patterns exist per-domain (ADR-031 `principal.erasure.requested`, ADR-035 erasure scope); no unified data-subject-request workflow/UI
- [ ] Map controls for SOC2-style audit readiness
- [ ] Map GDPR/CCPA requirements to concrete product behaviors
- [ ] Define evidence collection workflow for audits (logs, approvals, controls)

#### Reliability and global operations
- [ ] Define multi-region strategy (active/passive or active/active)
- [ ] Define data residency controls by workspace/tenant
- [ ] Define disaster failover playbook and trigger criteria
- [ ] Define latency and availability SLOs by region
- [ ] Run recurring restore drills to validate RPO/RTO goals

#### Commercial platform capabilities
- [ ] Define billing domain model (plans, subscriptions, invoices)
- [ ] Define entitlement model (feature access by plan)
- [ ] Define quota model (API, storage, AI usage, seats)
- [ ] Define overage handling and enforcement behavior
- [ ] Define billing/audit reconciliation workflows

#### API and ecosystem lifecycle
- [x] Define API versioning lifecycle and sunset/deprecation policy — ADR-005 (semver, deprecation ladder)
- [ ] Define SDK generation and release process
- [x] Define backward-compatibility guarantees for core APIs — ADR-005 (SDK compatibility promise, API snapshot tests)
- [x] Define extension API stability policy (what can break and when) — ADR-005/024 (ABI frozen now, capability manifest namespace frozen/contents iterate)

#### Marketplace and supply chain trust
- [ ] Define plugin/theme submission and review workflow
- [x] Define package signing and integrity verification model — ADR-004 (prebuilt ESM + signed manifest)
- [ ] Define extension trust scoring (security, maintenance, quality)
- [ ] Define malicious package response workflow (disable/quarantine/notify)

#### Release management and support operations
- [ ] Define release channels (stable, beta, canary) and promotion rules
- [ ] Define rollback playbooks per release type
- [ ] Define customer-facing status page and incident communication templates
- [ ] Define support tooling (safe impersonation, diagnostics bundle export)
- [ ] Define runbooks for top recurring incidents

#### Product growth and safety operations
- [ ] Define experimentation framework (A/B testing + guardrails)
- [ ] Define onboarding wizard and activation milestone tracking
- [ ] Define migration assistant UX with success/failure checkpoints
- [ ] Define cost telemetry by module/feature and budget alerts
- [ ] Define analytics taxonomy governance and ownership
- [ ] Define UGC moderation/safety policy if user-generated content is enabled

### 24) Architecture Tooling Evaluation (added 2026-06-30)

Source: competitor-analysis session. See `claude-tovu-competitor-findings.md`, `gemini-tovu-competitor-findings.md`, `codex-tovu-competitor-findings.md`.
Goal: evaluate/adopt tooling that keeps the codebase modular, maintainable, and flexible (enforces the ports/adapters + spec-first constraints). Ties into existing items 1) "architecture boundary enforcement" and 15) "architecture lint".

Recommended starting five (highest ROI):
- [ ] Evaluate **dependency-cruiser** — enforce "core never imports adapters" as CI-failing rules (makes the inward-dependency rule real)
- [ ] Evaluate **knip** — find unused files/exports/deps across the workspace (keeps plugin-heavy platform lean)
- [ ] Evaluate **Zod** at all boundaries — runtime validation + single source of truth for types (fits SQLite JSON-text ↔ jsonb strategy) — not adopted; relates to §10's still-open request-validation item
- [ ] Evaluate **ArchUnitTS / ts-arch** — architecture rules as unit tests (fits spec-first / M3 test-contract framework)
- [ ] Evaluate **Testcontainers** (+ **Pact**) — contract-test each DB/storage/payment adapter against a real backend

Adopt when splitting `src/` into `packages/`:
- [ ] Evaluate **Nx** vs **Turborepo** — workspace + module-boundary tags + affected graph + caching — moot for now, `src/` has not been split into `packages/`
- [ ] Evaluate **Sheriff** / **good-fences** — lighter encapsulation if not going full Nx

Understanding / codegen / docs:
- [ ] Evaluate **Madge** — fast circular-dependency detection (cheap complement to Graphify/CBM)
- [x] Evaluate **ts-morph** — TS AST manipulation for `migration-generator.ts`, plugin `sdk-builder`, typegen (how Payload does config/typegen) — adopted (`package.json` devDependency), in active use in `scripts/write-path-inventory.ts` for the ADR-042 structural graph-audit tooling
- [ ] Evaluate **ts-rest / tRPC** — compiler-checked contracts for the headless packet (Next/Vue shells)
- [ ] Evaluate **Structurizr DSL / C4 model** (+ PlantUML) — diagrams-as-code living architecture docs (pairs with ADR log in item 18) — the ADR log itself (`ADR-INDEX.md`) serves the living-decision-record role in prose form; no diagrams-as-code tooling adopted
- [ ] Evaluate **OpenTelemetry** (later) — runtime coupling/traces once modules talk via events

### 25) Reference Codebases to Study (added 2026-06-30)

Goal: study exemplary OSS repos for architecture/design patterns Tovu needs (ports/adapters, DDD, plugin systems, theme systems, provider adapters, monorepo layout). Consider cloning + graphifying the high-priority ones like the existing OSS-Repos set.

Ports/adapters + DDD references (TS):
- [ ] **Sairyss/domain-driven-hexagon** — canonical TS DDD + hexagonal + CQRS reference (closest to Tovu's intended core)
- [ ] **CodelyTV/typescript-ddd-example** — DDD/CQRS skeleton in TS
- [x] **medusajs/medusa** — modular monolith, module container + module links, provider pattern (already partly in specs; graphify it) — cloned to `OSS-Repos/medusa` and graphified (465 files in `OSS-Repos/graphify-out/manifest.json`)

Plugin-system gold standards:
- [ ] **microsoft/vscode** — contribution points, extension host, activation events (the canonical extensible-platform design)
- [ ] **backstage/backstage** — plugin framework at scale, well-documented plugin API
- [ ] **grafana/grafana** — plugin + data-source-provider architecture

Theme + plugin + content tooling (TS, directly relevant):
- [ ] **facebook/docusaurus** — theme + plugin + preset lifecycle in TS (strong theme-system reference)
- [ ] **withastro/astro** — integrations API, content collections, deploy adapters (modern content-tool adapter pattern)

Provider/adapter + modular monorepo references (TS):
- [ ] **novuhq/novu** — NestJS modular monorepo, notification provider adapters (like Strapi providers)
- [ ] **twentyhq/twenty** — modern NestJS + React modular monorepo (CRM)
- [ ] **calcom/cal.com** — large Next.js app + packages monorepo, feature modularity
- [ ] **nestjs/nest** — DI/modules/providers = canonical TS ports/adapters + DI reference

Curated lists to mine:
- [ ] **mehdihadeli/awesome-software-architecture** and **donnemartin/system-design-primer** — patterns catalog
