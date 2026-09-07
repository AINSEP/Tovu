# Todos — Tovu (website product)

> **Scope.** This is the **Tovu website-product** backlog (CMS runtime: kernel,
> data layer, content model, theme/plugin systems, admin UI, SEO/AEO/GEO plugins,
> WordPress/Payload/Directus/Ghost parity). It moved here in the 2026-07-06 repo
> split. Cross-references to `src/…` and `apps/…` now refer to code in **this
> repository**; they are no longer merely Tovu-Runner port candidates.
> Operator-shell / media-generation / agent-detection / the operator chat profile
> remain tracked in **Tovu-Runner**.
>
> `START-HERE.md` remains the architecture orientation document, but its greenfield
> status language is historical. Verify every backlog claim against current source
> before treating it as open.

**Reference (added 2026-07-14):** competitive positioning vs. WordPress/Strapi/Directus/Payload/Ghost
(where Tovu is ahead vs. genuinely behind) + an agentic-control-plane/MCP-WebMCP-A2UI-MCP-UI readiness
gap analysis, written right after ADR-041/043/044/045 (Storage/Collections/Categories&Tags/Backups-Recovery)
were accepted. Informal, not debated/audited — a reference to revisit during future parity work and
before building the eventual agent tool catalog. See
`ADS-memory/reports/strategy/20260714-competitive-positioning-and-agentic-mcp-readiness.md`.

---

## Admin SSE connection-pool exhaustion — C1 is ON; one anomaly still unexplained

Dev HTTP/2 (ADR C1) is **enabled**: `.certs/localhost.pem` + `localhost-key.pem` exist at the repo
root and `.certs.disabled/` does not, so `apps/admin/vite.config.ts:67-73` serves admin dev over
HTTPS/2 (the API's `server/runtime/boot/dev-tls.ts` reads the same pair). **Still open:** the
2026-08-18 ADR's own unresolved anomaly — 14 established `:5173` connections against a claimed 3
tabs. See `ADS-memory/reports/2026-09-03-admin-sse-connection-exhaustion.md`.

---

## 🎯 DIRECTION, owner call 2026-08-29 — one operator chat spanning fleet + site

Merge Runner's fleet chat and Tovu's admin assistant into one chat instead of disabling one of them.
The open questions this entry used to carry (scoping/authority, direction of trust, the fate of
Runner's own chat, per-site vs per-fleet daemon) are now settled in two ADRs:
- **ADR-060** (`runner-unified-operator-chat`) — Runner-side unified chat; every verb stays
  `runner.*`, Tovu tool definitions are never registered into Runner's allowlist.
  **PROPOSED — owner sign-off required before any implementation.**
- **ADR-061** (`runner-tools-for-tovu-site-assistant`) — the narrow `runner.*` surface Tovu's
  admin-context assistant may invoke. **ACCEPTED 2026-08-29**; supersedes ADR-014 §3's capability
  clause only.

**Caution:** size this from the **call sites**, not from file sizes — an inflated estimate on this
repo already manufactured an unnecessary redesign once.

---

## Open remainder — SPEC-005 (plugins) + SPEC-006 (identity/authorization) gates

Both went through the full formal pipeline; what is left is gates and later phases, not the original
2026-07-16 overnight-run ask (there is no informal output left to audit).
- **SPEC-005 plugin system**: Phase 1 (loader/SDK/hook core + HTTP routes + `Plugins.tsx`) is built
  and test-verified. Phase 2 (sample plugin), Phase 3 (wiring into the real post-save flow — carries
  a proven security finding that needs deliberate handling, not a drive-by fix), and Phase 4 (polish)
  have not started. `ADS-memory/reports/pipeline/005-plugin-system/pipeline-state.md`.
- **SPEC-006 identity/authorization**: spec sits at 0.7.0 with status reverted to DRAFT — an owner
  DRAFT→APPROVED checkpoint is owed, plus a Red-Team pass over the 0.6.0+0.7.0 material.
  ADR-PIPE-006 / ADR-048 (API-key issuance) is still **PROPOSED**, so the real `api_keys` plumbing is
  not cleared to build. `ADS-memory/reports/pipeline/006-identity-and-authorization/pipeline-state.md`.

---

## 🔧 SPEC-003 (CLI surface) — implementation-complete, Code Inspection still owed

`tovu init` / `tovu serve` / `tovu --help` is built and has been through a full TDD recertification
round. The coverage-gate question was **decided by the owner 2026-07-28**: TDD's real-arms evidence
was accepted, since the residual uncovered branches are esbuild/tsx CJS-interop scaffolding injected
into every transpiled module, not Tovu source. Two things remain:
- `/code-inspection` (Code Inspection + Security) has never run — the stage ledger in
  `ADS-memory/reports/pipeline/003-site-install-dir/pipeline-state.md` stops at Architecture
  Sign-Off, with no TestRunner, Programmer, or Code Inspection row.
- Non-blocking follow-up: evaluate a source-map-accurate coverage tool (c8/istanbul) so measured
  numbers match real numbers, instead of re-litigating the real-arms argument once per feature.

---

## ⚠️ OWED — `/code-inspection` + `/audit-work` for SPEC-003 / 005 / 006

**Corrected 2026-09-06.** The original entry's premise ("all still uncommitted") is false — 318
commits landed between 2026-07-28 and 2026-08-05 — and a broad code+security review did run
(`ADS-memory/reports/audit/2026-08-02-03-sunday-monday-code-security-review.md`). What is still
genuinely missing is the **per-feature gate record**: none of the three `pipeline-state.md` ledgers
carries a Code Inspection or Security row. Green TestRunner/TDD is necessary, not sufficient.

---

## ⚠️ OWED — specs/ADRs/tests for the 2026-08-05 embeds work (built quick-and-dirty, deliberately)

Owner explicitly asked to skip spec/ADR-first process for this batch, so this is the promised
follow-up, not a surprise gap. Four pieces landed with no spec, no ADR, and only ad hoc coverage:
- **Posts can render widgets/menus/forms** (`571b11a`) — fixed `resolvePageWidgets` resolving its
  host page via the generic `entries` table when Posts live in a separate `posts` table. The product
  question was answered by building it, never formally decided: **should widget/menu/form embedding
  be in Posts at all**, or should "Pages compose, Posts stay prose" have been the answer?
- **Media per-asset width/height/cssClass** (same commit + Jini `72f3a110`) — new columns, migration
  `0027_bumpy_blockbuster.sql`, threaded into `render.ts`'s public `<img>` output. No ADR on where
  per-asset display-size metadata belongs (per-asset default vs. per-insertion override was punted).
- **Unified "Embed" control in the Post editor toolbar** (`8011bff`) — pure UI, no spec.
- **Taxonomy watermark stamping fix** (`b4c76b4`) — same session, same "just fix it" instruction,
  also never spec'd.

The generic `data-embed-type`/`data-embed-id` contract for Pages' `body_html` **is** implemented
(ADR-047 + SPEC-043 → `apps/website/src/features/widgets/` with `html-embeds.ts`; `data-widget-embed`
and `data-form-embed` return zero hits under `apps/website/src/features/post`) — do not re-derive it
as open. **But ADR-047 itself still reads "Debate cleared 2026-07-21 … owes `/audit-work` before
ACCEPTED"** (`ADR-INDEX.md:54`), so live code is running ahead of its ADR's acceptance gate.

**Still owed:** real unit + integration tests for the render-path fix and the media sizing, and one
spec covering "how do embeds work across Posts + Pages" as a single subject rather than two.

---

## Admin Section Spec Sweep — remaining work only (reconciled 2026-09-06)

The 2026-08-10 sweep covered 17 sections. **Nothing outstanding** in: Collections (ADR-043),
User management (ADR-021/SPEC-006 — hard delete is intentionally excluded by the disable-only
identity model), Comments (ADR-031 — the `soon` badge is a **deliberate** owner call documented at
`apps/admin/src/panels.tsx:435-440`, not stale copy), SEO (ADR-032), Redirects (ADR-033).

| Section | Status | What is still not done |
|---|---|---|
| Database / Storage | 🟡 | The `PENDING_MIGRATION` boot banner and the Tier-3 browser still have no route (`apps/admin/src/features/database/Database.tsx:40`). The drift banner IS built (`SchemaStateWarningBanner`, tested). |
| Categories & Tags | 🟡 | Reparent, deprecate, and term-slug controls. |
| Roles & Permissions | ✅ | Removing one permission still requires delete/recreate. |
| Forms | ✅ | SPEC-010 / ADR-PIPE-010 still have no row in `ADR-INDEX.md` (zero hits; the ids do appear in `ADS-memory/specs/043-widgets/feature.spec.md:464`). |
| Media | 🟡 | The Images/Videos tabs are real filters now (`rules.ts`'s `filterMediaByTab`). Remaining: this screen's own file-input `accept` still lists image types only while the server accepts `video/mp4`/`video/webm` — a pending **owner decision**, not an oversight (`Media.tsx:900-907`); plus origin-isolation, where-used protection, ingress, and GC behavior now owned by Jini. |
| Menus | ✅ | Drag-and-drop deferred (no `draggable`/dnd code under `apps/admin/src/features/menus/`); reorder controls exist. |
| Members | ✅ | Pagination and billing deferred. |
| Newsletter | ⬜ | No admin screen — `panels.tsx:984` renders `<Placeholder sectionId="newsletter">`. Backend is substantial (campaign/list/subscriber/send-log routes, ADR-034). Build the admin client/types plus campaigns, lists, subscribers, and send-log screens. |
| Analytics | 🟡 | Aggregation, trends, breakdowns, goals, export. (The stale "sitting in memory" copy is already fixed — `Analytics.tsx:13-15`.) |
| Integrations / API | 🟡 | API-key issuance (ADR-048), outbound credentials, and rotation surfaces. |
| Backups / Recovery | 🟡 | Import/export, the interrupted-migration unblock route, and complete write-window counts. |
| Settings | 🟡 | 5 of 13 tabs are still `settings-ui-inert-wrap` mounts with no Tovu backend (13 tab ids, 5 inert wrappers in `SettingsUi.tsx`). |

**Evidence caveat:** panel/route existence was verified against source; tests were inventoried, not
executed. Several domains re-export their core implementation from `@jini-ai/cms` — those internals
need a separate cross-repo audit before claiming complete runtime behavior.

**Process note:** 16 of these 17 areas already have Accepted ADRs. Do not repeat the full
teardown → debate → audit → ADR → spec cycle for an implemented section; route only the remaining
slice through the appropriate gates. Newsletter needs an admin-UI-only spec check, not a new
backend ADR.

> **Still separately wanted:** an Accessibility ADR, and the coverage/parity ADR + matrix. The parity
> map lives only in `tovu-v2-design.md §3.5` plus the corpus `coverage-audit.md` files and is **NOT**
> reconciled into ADRs or specs. One matrix mapping each competitor subsystem →
> {v1 / bundled-plugin / deferred / dropped} with its owning ADR would give "are we implementing
> everything the others have?" one authoritative answer instead of four scattered documents.

### 2026-08-10 Commerce, Authentication, and Agent Plugins slice — still open

- [ ] Implement Commerce write paths and provider adapters. Stripe and PayPal remain planned labels
  only; checkout, billing, subscriptions, reconciliation, and revenue data are not wired
  (`payments`/`orders`/`products`/`subscriptions`/`billing` are all `soon: true` in `panels.tsx`).
- [ ] Implement the approved Jini `@jini-ai/capability-providers/visitor-auth` boundary, provider
  adapters, callback/state/PKCE lifecycle, Tovu sealed stores, identity linking, and local session
  issuance. The admin fields are disabled previews and do not persist or enable OAuth
  (`authentication` is `soon: true`).
- [ ] Wire the Agent Plugin Marketplace backend and installation flow. The tab performs no fetch and
  shows no fake inventory (`plugins-marketplace` is `soon: true` + `Placeholder`).

**Closed since 2026-08-10 — verified 2026-09-06, do not re-open:**
- The Agent Plugin **loader/installer + validation + trust review** is built:
  `apps/website/src/features/agent-plugins/{install,install-from-url,capability-projection,tool-registrations}.ts`,
  with adversarially-hardened extraction (zip-slip lexical check, outright symlink refusal,
  decompression-bomb bounds). **Sandboxing/execution boundaries are a deliberate v1 non-goal** —
  Skills are markdown read for context injection, MCP servers are preview-only, and Tovu executes no
  plugin code at all. `install.ts`'s header still describes the MCP admission gate as future work.
- The **daemon attachment contract is no longer `image/*`-only**: `attachmentAccept` was removed on
  purpose and `agent-daemon-server.ts`'s non-image filter is gone, so the upload path is kind-agnostic
  end to end (`AssistantDock.tsx:567-584`). The residual is cosmetic Jini-side naming (`imagePaths`).
- The **bounded source catalog** item is moot: `createToolCatalogComposerCapabilitySource()` was
  deliberately unwired by owner decision 2026-08-21 (`tool-catalog-composer-source.ts:10-25`).

---

## Active Working Items (merged from `TODO.md`, 2026-07-09)

> These were the standalone `TODO.md` (now folded here so there is one backlog). They are near-term
> bugs + build tasks, distinct from the Admin Section Spec Sweep above and finer-grained than the
> Master Build Inventory (§8 Theme System / §9 Plugin System overlap — de-dupe later if needed).
> The ⭐ item (sample plugins) is the current **build-next**.

### AW-2. Visual regression testing — harness works; 4 baselines are stale

**Harness fixed 2026-08-30.** `development/playwright.config.ts` (and 39 sibling
`playwright.*.config.ts` files) pointed at `src/index.ts`, dead since the apps/website restructure —
the entire e2e suite was non-functional on this branch. All 40 are repointed
(`playwright.config.ts:82` now spawns `apps/website/src/index.ts`) and one was re-run end to end.
`npm run test:visual` runs `development/e2e/theme-visual.spec.ts`.

**Still open:**
- The 4 original baselines (`home-desktop`, `home-wide`, `home-mobile-390`, `post-welcome`, all
  captured 2026-07-15) **fail against fresh renders** — real content/CSS drift since capture,
  deliberately NOT regenerated. Needs its own look: decide per baseline whether the drift is the
  intended design or a regression, then re-approve. (`home-mobile-390-drawer-open`, added 2026-08-30
  with the AW-1 guard, is current.)
- **Theme hot-reload in dev**: the server caches the theme at boot with no `themes/**` watch. VRT's
  fresh per-run `webServer` sidesteps it, but dev iteration still costs a manual restart per edit.
- **Cross-platform baseline drift** (Mac vs CI Linux) — pinned Docker image or a hosted service
  (Chromatic/Percy/`reg-suit`). Stretch.
- **Coverage gap inherited from the AW-4 check:** a true non-post `page-shell.html` page was never
  exercised (none seeded under `TOVU_DB=memory`); wide-screen safety there is inferred from
  byte-identical CSS, not directly run.
- **Mobile horizontal-overflow quirk** (test-infra only, previously undocumented): the *closed*
  drawer (`position:fixed; transform:translateX(110%)`) still contributes to
  `document.documentElement.scrollWidth` at mobile widths (742px vs 390px clientWidth), so the
  mobile baseline needs `clip` rather than a bare `fullPage` shot.

### AW-3. Theme trust model + theme bundles — **DECIDED** (pointer)
**ADR-019 ACCEPTED** (theme bundles / plugin deps) + **ADR-020 ACCEPTED** (theme capability tiers:
Declarative / Templated=LiquidJS / Code, via `theme.json.tier`). Themes stay pure data; behavior
lives in plugins. **Still open:** the standalone spec slices — theme bundles, and theme tiers +
LiquidJS renderer + sandbox (see AW-5a).

### AW-5. Build a theme at each capability tier (owner roadmap)
- **Tier 1 — declarative: DONE.** Current static themes are `basic`, `basic-2`, `tailark-dusk`,
  `tailark-quartz-dark`, `tailark-quartz-libre` under `content/themes/static/`. (The `column` and
  `tovu-official` themes this entry used to name no longer exist on disk.)
- **AW-5a. Tier-2 LiquidJS — DONE (spike 2026-07-08, C6 hardening 2026-07-15).** Renderer wired into
  `apps/website/src/server/inbound/public-http/http/site/render.ts` behind `theme.json.tier:
  "templated"`; loader `apps/website/src/features/theme/theme.ts` reads `tier` and discovers
  `.liquid`. Hardening: AST-walked tag/filter allowlist
  (`apps/website/src/features/theme/liquid-allowlist.ts`, enforced at `loadTheme()` publish-time lint
  and again at render time) plus render isolation (`liquid-worker.ts` in a `worker_threads` worker
  spawned per render by `liquid-sandbox.ts`, bounded by wall-clock timeout and V8 `resourceLimits`,
  with a no-op `fs` adapter closing LiquidJS's default filesystem access) — CPU-timeout and
  heap-limit termination both verified to actually fire. Templated themes on disk today:
  `content/themes/templated/{fashion-modern,storefront}` (the `dispatch` demonstrator is gone).
  **Residual:** add a VRT baseline for the `render_block` seam.
- **AW-5b. Tier-3 JS-in-theme — LATER.** Framework-agnostic (Astro or Next); client-side islands
  under strict CSP, build-time compiled to static HTML + hydrated islands. **Blocked on the Tier-3
  isolation design (its own future ADR):** separate cookie-less origin + CSP `connect-src 'none'`
  (ADR-020 §6 amendment — same-origin theme JS can steal the admin session). Trust-based tier with
  an explicit "this runs JS on your site" consent step.

### AW-6. Plugin extensibility ceiling (plugins owning tables) — **DECIDED** (pointer)
**ADR-023 (Core-Mediated Plugin Data Modules) is ACCEPTED**, 2026-07-11 (`ADR-INDEX.md` line 31;
2-round swarm debate + 3-round `/audit-work` `TM-adr023-dataModule-001`, round-3 unanimous PASS).
Plugins may own real `p_{pluginId}__*` tables via schema-as-data that core executes;
snapshot-before-DDL; retain-on-uninstall. **Still open:** the owed evidence for "commerce-grade" — a
~50k-product faceted-catalog benchmark on end-user SQLite.

### ⭐ AW-7. HIGH PRIORITY — build one sample plugin at each tier (build-next)
Approved 2026-07-08. Prove the plugin design in real running code, the way the Tier-2 LiquidJS spike
surfaced real seams. Each sample is genuinely wanted *and* stress-tests a different part of it.

| Tier | Sample | Why users want it | What it stress-tests |
|---|---|---|---|
| **1 — declarative** | **Contact form** (submissions as core entries; email/webhook on submit) | forms = top-3 install category | the zero-code surface **and** ADR-024 audit-condition #1: it cannot send/notify until core ships the **core-mediated primitives** (mail adapter, webhook dispatch, form-submission sink) |
| **2 — sandboxed code** | **SEO / content analyzer** (readability, TOC, reading-time) | SEO = biggest plugin category | running stranger code safely: pure computation, no fs/network, so the cleanest test of the frozen async/serializable ABI. Build the **ABI-boundary slice (worker/RPC), NOT the real `utilityProcess` sandbox** (deferred, ADR-024 §4) |
| **3 — trusted, full access** | **Store / commerce** (products→cart→orders→checkout→payments) | the CMS-choice driver; Tovu's thesis | everything: a plugin that **owns real tables** (ADR-023 `dataModule`), external network, heavy work |

**Status, re-verified 2026-09-06:**
- **Tier 3 — substantially built.** `apps/website/src/features/plugins/store/store-plugin.ts`
  declares its table through the core `dataModule` seam with snapshot→DDL and is covered by
  `__tests__/store-plugin.test.ts`. `lipay/`, `deploy/`, and `supabase-mcp/` are real plugin code
  too. Not yet evidenced: the "live-verified, hand the owner the commands" half of the acceptance.
- **Tier 1 — shipped through the WRONG subsystem for this item.**
  `apps/website/src/features/widgets/resolvers/contact-form.ts` implements Contact Form as a
  **widget resolver** under ADR-047/SPEC-043, a thin adapter over `src/forms/` + `MailerPort` — not
  the plugin/`dataModule` system AW-7 is about, so it does not yield the written list of missing
  core-mediated primitives this item exists to produce.
- **Tier 2 — not started.** No content-analyzer/SEO plugin exists (`readability` /
  `content.analyzer` under `apps/website/src/features/plugins/`: zero hits, while the same pattern
  matches freely elsewhere in `apps/website/src`).

**Remaining build order:** (1) finish Tier-3 live verification; (2) **Tier-1 contact form as a real
plugin**, to expose the missing core-mediated primitives as a concrete "dead without them";
(3) **Tier-2 content analyzer** over the ABI via worker/RPC, no sandbox, with a written note on any
DX pain.

## Completed — historical record (pointers only)

- **WordPress spec library** — complete, now at `development/other-repos-specs/wordpress_specs/`
  (**78** `.md` files; this entry used to say 53): wp-includes, wp-content, wp-admin, wp-root, plugin
  & theme authoring structure, headless-CMS paradigm.
- **Architecture groundwork** — `ADS-memory/docs/architecture/tovu-architecture.md` and
  `ADS-memory/docs/research/competitor-analysis.md` (Ghost/Payload/Directus); the `tovu/` scaffold and
  its conventions. Prioritization source: `tovu-architecture.md` §13 (User Friction Coverage).

## Canonical Architecture Decisions (ADRs)

This checklist is the **capability backlog**, not the decision record. Where an ADR exists it is the
source of truth and supersedes the loose wording below. Index:
`ADS-memory/reports/architecture/ADR-INDEX.md` — **note: 7 ADRs on disk (053, 055, 056, 057, 059,
063, 064) have no row in that index**, so it is not a complete list.

Which ADR owns which inventory area:
- **§1 Kernel / §10 Server** — ADR-001 (agent-native modular monolith), ADR-009 (decoupling: sync
  calls + outbox + hooks).
- **§3 Data Layer** — ADR-006 (ports need two adapters), ADR-007 (`workspaceId` everywhere). Site
  content lives in a per-site `content.db` behind `SiteStorePort` — ADR-012 + ADR-013.
- **§5 Storage/Media** — media blobs under the site folder's `uploads/`, metadata rows in that site's
  `content.db` (ADR-012).
- **§7 Feature Modules** — the `features/*` slices are the site content model
  (post/page/media/presentation), scoped per ADR-007/012.
- **§8 Theme System** — ADR-010 (declarative themes by default; code = trusted mode), ADR-002 (React
  blessed renderer). Two planes: site theme vs app chrome — see
  `ADS-memory/reports/architecture/admin-sitemap.md` §1.
- **§9 Plugin System** — ADR-003 (plugins never run DDL), ADR-004 (prebuilt ESM + signed manifest),
  ADR-005 (SDK compatibility), ADR-023 (core-mediated plugin data modules).
- **§11 Admin UI** — IA in `ADS-memory/reports/architecture/admin-sitemap.md`. **The two per-screen
  UI briefs this section used to cite (`docs/design/admin-sections-ui-brief.md`,
  `docs/design/rail-pages-ui-brief.md`) no longer exist anywhere in the repo** — the live registry is
  `apps/admin/src/panels.tsx`.
- **§12 Agentic UI / AI Layer** — **ADR-059 is current** (assistant transport, AG-UI canary,
  Accepted 2026-08-18). It supersedes ADR-049's rejection of AG-UI, which had itself superseded
  ADR-013's original CopilotKit + AG-UI choice. Paradigm note:
  `ADS-memory/docs/architecture/appendices/A12-tool-use-first-architecture.md`.
- **§13 Protocols** — ADR-011 (two deployment topologies; open-design desktop host), ADR-013 (AG-UI /
  MCP surface, tool exposure).

A "site" everywhere below = **a folder (install dir) with its own `content.db` + `uploads/` +
themes/plugins**, instantiated from a versioned template (ADR-012).

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
- [ ] Add structured logging + request IDs. Neither exists: there is no logging port, and
      `requestId` appears only in `apps/website/src/server/__specs__/00-foundation/` specs plus one
      AG-UI module. Note this is NOT the same as the observability work — `platform/observability/`
      ships a real `ObservabilityPort` with `noop`/`otel` adapters (see Master Build Inventory §1),
      but it tracks requests without carrying a correlation id and does no structured logging.

### First real capabilities
- [ ] Feature-flag support (for safe rollout). `featureFlag` appears only in
      `server/__specs__/00-foundation/request-context.spec.md` — no implementation.

### Reliability and safety
- [ ] **Outbox retry policy with exponential backoff — and an attempt cap.** The schema already
      supports it (`outbox_events.attempts`, `nextAttemptAt`), but
      `apps/website/src/contracts/core/events/outbox-worker.ts:34` calls
      `markFailed(row.id, message, now)` — it re-queues the failed event for retry *immediately*, so a
      permanently-failing event spins at full batch rate. No `maxAttempts` and no dead-letter path
      exist anywhere in `contracts/core/events/`.
- [ ] Idempotency strategy for event handlers. (`operation-lock.ts` guards concurrent mutations; it
      is not handler-level idempotency.)
- [ ] Error taxonomy + standardized API error responses. `apps/website/src/server/error-mapping/`
      exists but contains **only `INFO.md`** — it names itself "the intended home for the canonical
      error envelope, status mapping helpers, and route-safe translation", with no code. Per-feature
      `errors.ts` files exist but there is no shared envelope.
- [ ] Safe-mode / rollback concept draft (from architecture §13). Recovery ships one shape of this
      (restore points, plan→confirm→execute), but "safe mode" itself is only mentioned in
      `server/__specs__/`.

### Agent capability surface (added 2026-07-27)

Backed by a source-level survey of ten shipped products; full reports in
`/Users/la/Programming/OSS-Repos/AI-Capabilities/`. Design written up in
`development/tovu-v2-design.md` §9 and `Jini/ai-control-plane.md` §29 (both verified present).
Build in this order.

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

Directus is still valuable for reference and can run in parallel with implementation. Existing
material: `development/other-repos-specs/directus_specs/`.

- [ ] General Directus architecture map
- [ ] Directus AI layer deep spec (priority)
- [ ] Directus admin UI extension model spec

## Backlog: Admin IA Research (Needed Before Admin Build)

**Path correction 2026-09-06:** the `tovu/apps/admin/sections/` placeholder set this entry was
written against **no longer exists**. The live admin registry is `apps/admin/src/panels.tsx` (46
panels), and the Admin Section Spec Sweep above already reconciled it against source — so the third
bullet's "confirm/adjust the placeholder set" half is obsolete. The competitor research itself is
still genuinely open.

- [ ] Capture the admin information architecture of Directus, Ghost, Payload, Strapi, and WordPress
      (WordPress specs already at `development/other-repos-specs/wordpress_specs/wp-admin/`): sidebar
      taxonomy, screen inventory per section, navigation depth, and where each puts settings vs
      content vs system surfaces. CBM indexes exist for all five repos.
- [ ] Capture each CMS's admin *extension* pattern (how plugins contribute panels/menu items/dashboard
      widgets): WP menu/meta-box registration, Directus extensions-sdk app surfaces, Payload admin
      components, Strapi admin plugin API, Ghost admin-x apps.
- [ ] Synthesize into a Tovu admin IA spec: define the surface-descriptor types each section needs
      (feeds Master Build Inventory §11 Admin UI) and mark which panels are core vs
      registry-contributed vs plugin-shipped.

## Backlog: Shopify Research (Still Needed)

- [ ] Review and execute `development/other-repos-specs/shopify_specs/TODO.md` before restarting
      Shopify decomposition or agent-build-packet work.

## Backlog: Medusa Research (Still Needed)

- [ ] Review `development/other-repos-specs/medusa_specs/TODO.md` before adding deeper Medusa
      internals, route DTO inventories, admin SDK notes, telemetry notes, or hosted-cloud caveats.

## Backlog: Commerce Platform Crosswalk (Still Needed)

- [ ] Turn the Shopify + Medusa research into a Tovu capability map / V1 commerce platform
      architecture, working from
      `development/other-repos-specs/{shopify_specs,medusa_specs}/TODO.md`.
      **[UNVERIFIED 2026-09-06]** This entry's original pointer, `other-repos/TODO.md`, does not
      exist anywhere in the repo — the synthesis notes it referred to were not located.

## Master Build Inventory (Everything)

**Reconciled 2026-09-06** (earlier passes: 2026-07-15, and a §12/§13 correction 2026-09-02).
Checklist items verified DONE have been **deleted** — git history keeps them. What remains is open
work, each line carrying either the evidence that it is open or the ADR that scopes it.

Counts refreshed this pass: **64 ADR files** on disk under
`ADS-memory/reports/architecture/ADR-0*.md`, of which only **57 have an index row** (053, 055, 056,
057, 059, 063, 064 are unindexed). **156** `__tests__` directories and **7** `__specs__`
directories across `apps/website/src` + `apps/admin/src`; **15** `*.contract.test.ts`; **26**
`INFO.md`.

**§3 Data Layer, §4 Auth/Identity/Permissions, and §5 Storage/Media are complete** and their
checklists are gone. Owning ADRs, for navigation: §3 — ADR-006 (rule-of-two adapters), ADR-007
(`workspaceId` everywhere), ADR-015 (SQLite + Drizzle, Postgres deferred to a later adapter swap),
ADR-022/023/026 (schema naming + `p_{pluginId}__*` grammar), ADR-041/045 (backup/restore/rollback).
§4 — ADR-021 (one `principals` table, RBAC catalog, `authorize()`, composite `(workspace_id,id)`
FKs), ADR-008/022/041 (audit trail). §5 — ADR-027 (media object model, upload pipeline, immutable
signed URLs on a cookie-less origin, GC policy, ingress policy, `entry_refs`).

### 1) Core Runtime / Kernel
- [ ] Define final kernel responsibilities (lifecycle, DI, service registry) — no dedicated kernel/DI
      module exists; ADR-046 (Proposed, pending debate) partially scopes composition-root/module-status
      concerns
- [ ] Add core error model (typed errors + error codes) — per-domain typed error classes are pervasive
      (`ForbiddenError`, `ValidationError`, …) but there is no centralized taxonomy;
      `apps/website/src/server/error-mapping/` is still a placeholder folder (**`INFO.md` only, no code**)
- [ ] Add config system with typed schema + env validation
- [ ] Add feature flag system (runtime + env + workspace scope)
- [ ] Add module loader contract (for plugins/themes/providers) — Tier-1 declarative plugin
      data-modules are built (ADR-023, `features/plugins/data-module.ts`/`snapshot.ts`); a general
      load/init/stop lifecycle contract for Tier-2/3 code plugins is scoped by ADR-024, not built
- [ ] Extend core observability beyond inbound HTTP. **The port and its adapters now exist** —
      `apps/website/src/platform/observability/{ports,noop,otel,config,index}.ts`, wired through
      `server/inbound/shared/observability-middleware.ts`, deliberately shaped as `trackRequest`
      rather than OTel's `startSpan` so OTel itself stays replaceable. Still to build, named in the
      port's own header as its natural next additions: `trackDbQuery`, `trackOutboundCall`,
      `trackAgentRun`. (Correlation/request IDs are a separate, unbuilt concern — see §16.)

### 2) Eventing / Hybrid Sync + Async
- [ ] Define event naming conventions and ownership — a consistent `domain.verb` convention is used
      pervasively in code (`entry.created`, `content_type.tombstoned`, …) but is not written down
- [ ] Implement outbox poller/worker with retries and **backoff plus an attempt cap**. The worker
      exists (`contracts/core/events/outbox-worker.ts`) and the schema already supports backoff
      (`outbox_events.attempts`, `nextAttemptAt`), but line 34 calls
      `markFailed(row.id, message, now)` — a failed event is immediately claimable again, and nothing
      reads `attempts`. A permanently-failing handler spins at full batch rate (20/tick) forever.
- [ ] Add idempotency support for handlers — idempotency exists for gated mutations
      (`contracts/core/gated-mutations/token.ts` idempotency keys, `contracts/core/operation-lock.ts`)
      but not for event-handler/outbox consumption
- [ ] Add dead-letter strategy for repeatedly failing events — ADR-036 built dead-lettering for
      **outbound webhook delivery** specifically (`features/integrations/delivery.ts`); the core
      domain-event outbox has none (`maxAttempts`/`dead-letter`: zero hits under
      `contracts/core/events/`)
- [ ] Add event replay strategy for recovery/backfill — explicitly deferred by ADR-022

### 6) Search / Indexing
Nothing built — no search module exists anywhere under `apps/website/src`. (ADR-022's
core-provisioned expression indexes, `features/content-types/index-provisioning.ts`, are DB
query-performance indexes, not a search subsystem, and do not satisfy the first item.)
- [ ] Define search document schema and indexing boundaries
- [ ] Define indexing triggers from domain events
- [ ] Implement index upsert/remove handlers
- [ ] Define hybrid search strategy (keyword + semantic optional)
- [ ] Add search relevance tuning strategy
- [ ] Add search contract tests and latency budgets

### 7) Feature Modules (Initial Core Features)
- [ ] Workspace **lifecycle events** — CRUD itself is built (`features/workspace/` plus
      `server/inbound/admin-http/routes/workspace/{get,create,list,update,delete}.ts`); what is
      missing is the create/rename/delete domain-event lifecycle
- [ ] Publishing workflow module — basic publish/unpublish exists (`features/entries`); no
      draft→review→scheduled multi-stage workflow

### 8) Theme System
- [ ] Define template hierarchy and route mapping — route→template-id resolution exists as a spike
      (`apps/website/src/server/inbound/public-http/http/site/render.ts`); the full
      hierarchy/fallback design is ADR-017 (Proposed, blocked on the theme system)
- [ ] Define slots/regions injection model — ADR-020's Tier-2 `render_block` / `{{ content|raw }}`
      seams are built and hardened (see AW-5a: allowlist + worker isolation, C6 done 2026-07-15); the
      general slots/regions model on top of them is not designed
- [ ] Add theme versioning and compatibility checks — ADR-019 covers theme-declared plugin
      dependencies; theme-to-engine version/compat checks are not built
- [ ] Add theme lifecycle hooks (install/enable/disable/update)
- [ ] Add theme safety checks and rollback strategy — no theme-specific safety/rollback; ADR-041 (DB
      migration rollback) and ADR-023 (plugin snapshot-before-DDL) are the closest analogs in other
      domains

### 9) Plugin System
- [ ] Define plugin lifecycle API (install/load/init/stop/uninstall) — Tier-1 `dataModule`
      install/uninstall is built (ADR-023); the full lifecycle for Tier-2/3 code plugins is deferred
- [ ] Define plugin dependency graph and conflict rules — ADR-019 covers theme→plugin declared
      dependencies only
- [ ] Define plugin sandbox/permission enforcement — the capability-gating model is Accepted
      (ADR-024 default-deny manifest); the Tier-2 isolation mechanism (per-site Electron
      `utilityProcess`) is not built
- [ ] Define plugin UI extension points — ADR-025 decided the mechanism (sandboxed cross-origin
      iframe + `postMessage` RPC); not built. Unblocks OQ-07 (admin-surface/extension-panel registry)
- [ ] Define plugin server extension points (routes/hooks/events) — ADR-024 decided the hook-priority
      model conceptually; no general hook/route extension-point registry exists beyond feature-specific
      hooks (e.g. `features/newsletter/hooks.ts`)
- [ ] Add plugin observability and fault isolation

### 10) HTTP/API Server
- [ ] Define transport-agnostic route/handler shape — a consistent pattern is used in practice
      (`getAuthedPrincipal` → `deps.authorize()` → domain call → `res.json()`) but no formal contract
      layer has been decided
- [ ] Decide Fastify vs Hono migration path — no decision made; Express remains
- [ ] Add request validation and response schema enforcement — ad hoc per-route validation only; no
      schema library adopted (see §24's open Zod evaluation)
- [ ] Add error mapping strategy (domain → HTTP) — `apps/website/src/server/error-mapping/` exists
      only as a placeholder (`INFO.md`, no code); mapping is ad hoc per route
- [ ] Add rate limiting and security headers — per-feature rate limiting exists
      (`features/forms/rate-limit-profile.ts`, ADR-030 magic-link limit) and per-surface CSP exists
      (ADR-025 plugin iframe, ADR-038 egress policy), but no app-wide middleware for either
- [ ] Add OpenAPI generation strategy

### 11) Admin UI (Headless Admin Client)
Shell, workspace, collections, content editor, media, settings/roles/users screens are all built
under `apps/admin/src/features/` (**31 feature directories**, not the `apps/admin/src/sections/`
path this inventory used to name). Per-section remaining work lives in the Admin Section Spec Sweep
above, not here.
- [ ] Build extension-point rendering in admin — site-plugin and Agent Plugins management screens
      exist, but ADR-025's sandboxed plugin-contributed panel runtime is not built
- [ ] Build admin notification center

### 12) Agentic UI / AI Layer
The transport question is settled: **ADR-059 (Accepted 2026-08-18)** ships a real
`@ag-ui/core`/`@ag-ui/client`/`@ag-ui/encoder`-backed canary transport, proved live against 10 real
Tovu tool calls in a browser, and `AssistantDock` (`apps/admin/src/components/AssistantDock/`)
replaced the old stub FAB well before that. What remains:
- [ ] Define the AI interaction model's complete task/capability contract and its hardening
- [ ] Define tool registry contracts and tool safety policy — Jini runtime/tool registration exists,
      but fail-closed per-principal capability discovery and the control/retrieval-plane split (see
      the Agent Capability Surface backlog above) are open
- [ ] Define structured outputs and tool-call protocol — ADR-013/024's ABI (async + serializable-only,
      no live objects) sets the constraints; no concrete implementation
- [ ] Define context assembly pipeline (system/site/task/history)
- [ ] Define memory policy (session, episodic, semantic boundaries)
- [ ] Define guardrails and human-in-the-loop checkpoints — ADR-016 (propose→review→accept/reject→
      revert change-sets) scopes the pattern; not implemented as an AI guardrail system
- [ ] Define AI audit trail and explainability logging

### 13) Protocols and Integrations
- [ ] **Expose Tovu's own tools/data as an MCP *server*.** MCP *consumption* is built
      (`assistant/mcp-federation/`, `assistant/external-mcp-store.ts`) and MCP *UI* rendering exists
      (`assistant/mcp-ui.ts`, MCP Apps/SEP-1865) — but nothing exposes Tovu outward: no
      `@modelcontextprotocol/sdk` dependency and no `McpServer`/`new Server()` construction anywhere.
      Related planning is in §22's Agentic Web / Playground MCP backlog.
- [ ] Define A2A support boundaries
- [ ] Define import/export contracts for interoperability
- [ ] Define an AI WordPress database ingestion agent: connect read-only to a WordPress
      MySQL/MariaDB database, extract posts/pages/custom post types, body content, metadata,
      taxonomies, authors, revisions, attachments and image assets, map them into Tovu
      content/media schemas, and run dry-run validation, permalink/redirect mapping, resumable
      import jobs, audit logs, and rollback/compensation planning before any write.

### 14) Testing Strategy
- [ ] Define test pyramid expectations per module — no written doc; a consistent unit+integration
      split exists in practice
- [ ] Add `__specs__` baseline in all modules — only **7** `__specs__/` directories exist against
      **156** `__tests__/` directories
- [ ] Add contract tests for every core port — **15** `*.contract.test.ts` files today;
      content-types/entries/taxonomy still have no SQLite adapter at all (in-memory only), so no
      contract test is possible for them yet
- [ ] Add regression suite for high-risk flows — no dedicated regression label; the full test run
      serves this role by default
- [ ] Add performance smoke tests

### 15) DevEx / Tooling / CI
**Three items deleted 2026-09-06 as false:** there IS a lint script (`"lint": "biome lint ."`,
`package.json:67`), Biome also supplies formatting (`biome.json` at the repo root,
`@biomejs/biome ^2.5.5`), so "add a formatter / no prettier config" is moot, and there IS a CI
pipeline — `.github/workflows/ci.yml` (508 lines) runs `typecheck`, `test:ci`, `check:boundaries`,
`check:architecture` and `check:inventory`, alongside `fly-deploy.yml`.
- [ ] Add commit/PR conventions — no `CONTRIBUTING.md` or commit-convention doc in the repo
- [ ] Add environment matrix docs (dev/staging/prod)
- [ ] Add codegen strategy for typed clients if needed

### 16) Reliability / Ops / Security
- [ ] Add structured logging + correlation IDs — no logging port or correlation/request-id
      propagation exists (`observability-middleware.ts` tracks requests but carries no correlation id)
- [ ] Finish metrics and tracing — the `ObservabilityPort` + `noop`/`otel` adapters are built and
      wired for inbound HTTP (see §1); DB queries, outbound calls and agent runs are not instrumented
- [ ] Define SLOs and operational dashboards
- [ ] Define incident response runbooks
- [ ] Add secrets management policy — explicitly deferred by ADR-028 ("secret gate: reject
      `secret:true` until a secret-store ADR")
- [ ] Add dependency and supply-chain scanning
- [ ] Add vulnerability response policy

### 17) Product Safety (From WordPress Pain Clusters)
- [ ] Update preflight checks and safe rollout design — ADR-041's cost-gated boot migration policy
      (`evaluateBootMigrationPolicy`) is preflight-shaped for one domain (DB migrations); there is no
      general preflight/safe-rollout framework
- [ ] Incident analysis and guided remediation design — ADR-045's Recovery screen (itemized
      discarded-write-window disclosure before restore) is the closest built analog
- [ ] Conflict isolation and quarantine strategy
- [ ] Performance attribution and budgets
- [ ] Authoring safety and template recovery — ADR-016 is the closest scoped analog; no UI built
- [ ] Migration/portability strategy — ADR-041 covers DB schema migration; content import/export
      portability (the WordPress ingestion agent, §13) is open
- [ ] Governance/trust and provenance strategy

### 18) Documentation / Knowledge Retention
- [ ] Keep module `__specs__` synced with implementation — only 7 modules have one (see §14)
- [ ] Maintain a glossary of domain terms — no standalone glossary; terms are defined inline in
      individual ADRs
- [ ] Maintain a roadmap by milestone (M0, M1, M2…) — this file is the closest thing; there is no
      formal milestone doc
- [ ] **Index the 7 unindexed ADRs** (053, 055, 056, 057, 059, 063, 064) in `ADR-INDEX.md` — the
      index is the stated source of truth and is currently incomplete

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
- [x] Evaluate **dependency-cruiser** — adopted (CORRECTED 2026-09-02, was stale): `.dependency-cruiser.mjs` (674 lines) enforces boundary rules including the inward "core never imports adapters" rule, run via `check:boundaries` in `package.json`; the wider `check:architecture` gate currently reports RED as measured, but the config and enforcement exist.
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

---

## Admin skins (Studio → Appearance) — planned, not started

Goal: switch the ADMIN's own look — `basic` (today's), `glassmorphic`, `ultramodern` — from a
Studio → Appearance tab. Same mechanism the public themes use, aimed at the admin instead.

This is already half-true: `apps/admin/src/styles.css` defines 77 design tokens and every
component references them (`var(--link)`, `var(--surface)`), with dark mode implemented as
`:root[data-theme="dark"]` overriding the same token names. A skin is the identical trick one
axis over — `:root[data-skin="glassmorphic"]` re-declaring those tokens.

**Two things must hold or skins are unreachable, and both are cheaper to honor now than to
retrofit across 76 components:**

1. **No literal visual values in components.** This is the binding constraint on the Tailwind
   adoption below. Tailwind's theme must map utilities onto the CSS variables
   (`backgroundColor: { surface: 'var(--surface)' }` → `bg-surface`), never onto its default
   palette. A component written as `bg-blue-500 shadow-md` is invisible to every skin, because
   there is no variable for a skin to override.

2. **The token vocabulary needs axes beyond color.** Glassmorphism is translucency, backdrop
   blur, and a different border/elevation treatment — a skin that can only change hues cannot
   express it. Needs tokens along the lines of `--surface-alpha`, `--surface-blur`,
   `--elevation-shadow`, `--border-weight` before the look is reachable at all.

Note the symmetry with the public theme work: site themes carry `tokens.json` + `tokens.light.json`
and swap by writing `data-theme`. Admin skins are the same shape. Worth keeping the two token
vocabularies deliberately similar rather than letting them drift into two unrelated systems.

## Theme marketplace — local fixture only

`content/themes/__marketplace__/` stands in for a remote marketplace so the download flow can be
exercised end to end. No network, no search, no publisher identity, no versioning or update
checks, no signing. A real one needs all of those, plus a stable upstream identity on `lineage`
(local folder ids are per-install and mean nothing on another machine).

## Tailwind + shadcn/ui — owner wants both, deferred (2026-08-11)

Owner: *"Remind us to download shadcn and Tailwind later because I wanna be able to use the
components from it."* Wanted specifically for shadcn's component library, not just utilities.

Order matters: shadcn generates components built on Radix primitives **and Tailwind classes**, so
Tailwind lands first. Neither is installed today — `apps/admin` has 27 deps, no Tailwind, no Radix,
no shadcn; all UI comes from `@jini-ai/ui`.

**Do not migrate the existing 4,687 lines / 541 selectors.** Add Tailwind with `preflight` DISABLED
(preflight's reset would clobber the current stylesheet) and use it for NEW surfaces only.

**The binding constraint**, from the admin-skins section above: Tailwind's theme must map onto the
existing CSS variables (`backgroundColor: { surface: 'var(--surface)' }` → `bg-surface`), never onto
its default palette. Same rule applies to whatever shadcn generates — a component shipping
`bg-blue-500 shadow-md` is invisible to every skin, because there is no variable to override. Budget
time to rewrite shadcn's generated classes onto the token bridge as each component is pulled in;
that is the real cost of adopting it here, not the install.

Known cost either way: two styling systems coexisting, and nothing tells a newcomer which to reach
for. Needs a written rule — new components use Tailwind, do not convert old ones.

## JSON-column tripwire + theme write-gate — 3 known-open items (2026-08-12 external audit)

All three are **latent and non-blocking**, recorded here so they are not rediscovered from scratch.
Context: a 4-auditor panel (Terra `gpt-5.6-terra`@xhigh, Gemini 3.1 Pro, Gemini 3.6 Flash, Sonnet)
reviewed the session diff over two rounds. Everything blocking was fixed and mutation-proven —
commits `3cd312d`, `57d5d65`, `697d97e`, `f763bb9`, `3fead5a`, `169b74a`. These three were
deliberately deferred.

**1. The JSON-mention regex fires on phrasing that means "not JSON."**
`/(?<!\.)\bjson\b(?!\.(?:stringify|parse)\b)/i` in `src/platform/db/__tests__/migration-manifest.test.ts`
matches `"non-JSON"`, `"JSON Web Token (JWT)"`, `"JSON:API"`, `"GeoJSON-style … NOT parsed JSON"`.
No such phrasing exists in `schema.ts` today (grep-confirmed). It fails **loud** — the suite breaks
and someone rewords a comment or adds a `REVIEWED_JSON_COLUMNS` entry — so it cannot pass bad data
silently. Same accepted risk class as the `theme.json` filename false positive the `(?<!\.)`
lookbehind already handles. *Fix only if actually hit*, with a narrow `(?<!non-)` exclusion.

**2. A trailing same-line comment is invisible to the tripwire.**
`col: text("x"), // JSON blob` attaches to neither column — `ts.getLeadingCommentRanges` does not
see it. **Pre-existing, not a regression**: the auditor traced the old regex scanner and confirmed
identical behaviour (its backward walk never inspected same-line trailing text either). A column
documented *only* that way carries a JSON signal the tripwire cannot read. Same applies to a shared
section-header comment above a group of columns — only the immediately-following column inherits it.

**3. No install-time rule forbids a theme declaring `build.sourceDir: "preview"`.**
That manifest is what made `preview/` paths resolve `"editable"` and sent PUT down the sourceDir
branch (fixed in `9e75c4a`). The narrow fix is in place; the deeper one — a `build-conformance.ts`
check refusing a `sourceDir` that names a `GENERATED_THEME_DIRS` entry — was not attempted.
Unreachable today: no theme on disk sets `build.source: "compiled"`. Noted in `explore.ts` where a
maintainer would look.

**The lesson worth keeping, above any of the three:** a gate and the writer it guards must resolve a
name the same way. `isGeneratedThemePath()` compared paths as spelled while `resolveThemeFilePath()`
normalized them, so `PUT {"path":"css/../preview/app.css"}` returned 200 and overwrote generated
output — walking around the rule on every route. Two resolvers for one string is a bypass waiting to
be spelled differently.

## First-run onboarding wizard — deferred, but load-bearing (2026-08-15)

**Not being built now. Recorded because the deployment work will be shaped wrong without it.**

The idea: when someone first installs Tovu, ask them what they are actually building before they
make choices they cannot see the consequences of. Roughly — what kind of site (blog / brochure /
store), what database (if any), and do you need payments, forms, members, comments.

Why this is not cosmetic: those answers **determine which deployment targets can ever work**, and the
constraints are invisible to a non-technical user. Someone who picks "store" cannot deploy to a
static host — checkout and `payments-webhook.ts` need trusted compute — but nothing in the product
tells them that until it fails. The wizard is where "you said you want payments, so Cloudflare Pages
alone will not work for you" gets said, at the one moment the user is receptive to hearing it.

**The hard requirement, and the reason this needs design rather than a form:** people will answer
wrong. They will pick "blog" and then want to sell something six months later. **Every answer must be
reversible**, and reversing must not mean a migration the user has to understand. Do not build a
wizard that writes a one-way decision into config. The likely shape is: answers set defaults and
surface warnings, but the underlying capability stays present and re-derivable from what the site
actually uses — i.e. **detect eligibility from real feature usage, and treat the wizard answers as a
hint, never as the source of truth.**

Read `development/docs/deployment/deployment-constraints.md` before designing this — §6 lists exactly
which features force a stateful host, and §9 explains why the target user never sees a provider at
all.

Related open blocker: onboarding a *customer* (as opposed to a developer) is gated on multi-workspace
hosting, which does not exist yet — one running app resolves exactly one workspace at boot
(`src/platform/site-dir/resolve-workspace.ts:15-21`). See constraints doc §4.1.

## ✅ RESOLVED (2026-08-24) — template shells were their own reachable URL (found 2026-08-15)

**Fixed, with one addition the original entry did not catch: `/404` had the same defect.**
`isMarketingPageSlug` (`pages.ts`) excluded only `index`, so a static theme's own `pages/404.html`
was ALSO served at `/404` with a **200 OK** — a soft 404, indexed by search engines as real content.
`route-manifest.ts` already excluded it; the live route did not. Same root cause, same one-line fix,
so it was closed in the same pass rather than left as a second entry.

**What landed:** a single shared predicate, `isStandaloneThemePage(theme, pageId)`, in
`src/features/theme/theme.ts` (next to `validateTemplateDeclarations`, which already owns `templates`
semantics), exported via the theme barrel. It answers "is `GET /<pageId>` a real standalone page"
once — excluding `index` (served at `/`), `404` (the error document), and every
`manifest.templates` stem. Both call sites now import it instead of spelling their own answer:
`server/routes/site/pages.ts`'s `isMarketingPageSlug` and `export/route-manifest.ts`'s
`buildThemePageRoutes`.

**Verified:** 2 regression tests in `src/server/routes/site/__tests__/pages.route.test.ts`, both
confirmed RED first (200 where 404 was required) — one covering the template shells with a passing
`/about` control proving the fixture was genuinely reachable, one covering `/404`. Scoped runs green
afterwards: `src/features/theme/**` 464 pass, `src/platform/export/**` + `src/server/routes/site/__tests__/**`
102 pass, `npx tsc -p tsconfig.json --noEmit` clean.

**Real-world blast radius closed:** 6 themes on disk declare `templates` — `basic`, `portfolite`,
`gracious-timing`, and all three `tailark-*`. On each, `/blog-post`, `/page-shell` (and, on any theme
shipping one, `/404`) were publicly reachable 200s.

**The lesson, same family as the `isGeneratedThemePath` one recorded above:** two resolvers answering
one question will drift, and the drift is invisible because each is internally consistent. The
exporter was right and the live server was wrong for nine days, and nothing failed loudly — the
export output simply disagreed with the running site.

**Original entry, kept for context below.**

**Not being fixed now — recorded so it is not lost, per the deployment-work session's own tracking
convention.** Found while building `src/platform/export/route-manifest.ts` (the static-site exporter's route
enumeration).

A static theme's `pages/*.html` folder (`DiscoveredTheme.pages`, `src/features/theme/theme.ts:290-297`)
holds two different kinds of file in the SAME `Record<string, string>`, keyed identically by filename
minus `.html`: real standalone pages (`about.html`, `pricing.html`, …) AND content-embedding template
shells a Post/Page picks via `templateChoice` (`page-shell.html`, `blog-post.html`,
`blog-sidebar-template.html` for the `basic` theme — declared in `theme.manifest.templates`, the
`ThemeManifest.templates?: string[]` field, `theme.ts:161-176`). Nothing in the loaded theme shape
distinguishes the two by TYPE, only by which OTHER list names a given key.

`src/server/routes/site/pages.ts`'s `GET /:slug` handler (the `theme.pages[slug] !== undefined` check
around line 762) has no exclusion for `theme.manifest.templates` entries. The result: `/page-shell`,
`/blog-post`, and `/blog-sidebar-template` are live, publicly reachable URLs on the `basic` theme
today, each returning the shell's raw HTML directly via `renderStaticPage` — a document that expects a
Post's content to be substituted into its `{"type":"content"}` marker, served instead with no
substitution ever having run. A broken/incomplete page, reachable by anyone who guesses or is handed
the URL.

**Why the exporter doesn't just fix it inline:** the fix belongs in `pages.ts`, a file two other
agents were actively working in during this same session — touching it beyond the one already-landed
`export` keyword addition risked exactly the kind of conflict this session's dispatch briefs were
written to avoid. `route-manifest.ts` instead excludes `theme.manifest.templates` stems from the
theme-page route candidate set (see that file's own header comment), so the STATIC EXPORT never ships
this broken output as if it were a real page — but the underlying live-site reachability is unrelated
to export and remains open on the running server.

**The narrow fix, when someone picks this up:** exclude `theme.manifest.templates` stems in the SAME
`theme.pages[slug] !== undefined` check `pages.ts`'s `GET /:slug` handler already runs, mirroring what
`route-manifest.ts` already does for export purposes — one shared exclusion list (or a small named
helper) rather than two independently-maintained copies of "which page ids are template shells."

---

## Security page (credential inventory) under Operations — owner wants this, deliberately deferred (2026-08-15)

Owner's question, verbatim: *"Should we have, like, a Security tab under Operations and then an Access
Tokens tab? In case we need it in more than one place, or is that too messy?"* Answer: not messy, and
not speculative — the scattering already exists. Owner asked for it to be recorded and revisited, not
built now.

**The measured state.** Eight sealed-credential stores exist (or are landing) in this repo:

| Store | Repo file |
|---|---|
| Site / BYOK credentials | `src/platform/db/sqlite/site-credential-repo.sqlite.ts` |
| Publish targets | `src/platform/db/sqlite/publish-credential-repo.sqlite.ts` |
| Composio connector credentials | `src/platform/db/sqlite/composio-connector-credential-repo.sqlite.ts` |
| Composio config | `src/platform/db/sqlite/composio-config-repo.sqlite.ts` |
| Admin execution credentials | `src/platform/db/sqlite/execution-credential-repo.sqlite.ts` |
| External MCP servers | `src/platform/db/sqlite/external-mcp-repo.sqlite.ts` |
| Media provider credentials | `src/platform/db/sqlite/media-provider-credential-repo.sqlite.ts` |
| Source control (in flight this session) | `source_control_credential_sets` |

**Table is stale as a current count (CORRECTED 2026-09-02):** two more sealed-credential stores
landed 2026-08-28, after this table was written — `platform/db/sqlite/vendor-credential-repo.sqlite.ts`
(`features/vendor-credentials/store.ts`) and `platform/db/sqlite/custom-credential-repo.sqlite.ts`
(`features/custom-credentials/store.ts`), both first committed in `708e81b2`. The real current total
is **ten**, not eight (verified by grepping every `deps.sealer.seal(` call site outside tests). Keep
this table's shape and 2026-08-15 snapshot for history, but do not quote "eight" as today's count.

And five admin screens already accept a token: `features/settings/SettingsUi.tsx`,
`features/settings/ComposioKeyField.tsx`, `features/ai-assistant/AiAssistant.tsx` (BYOK),
`features/deployment/StaticSiteTab.tsx`, `features/source-control/SourceControl.tsx`.

**Scope it to READ + REMOVE. Never a second place to enter a token.** Two entry points for one secret
is the "which row is authoritative" bug, and it would also undo work already paid for: the Static Site
tab's redesign specifically pulled the credential OUT of an "Advanced" disclosure to make it Step 1
inline, on the owner's own direct read that hiding a mandatory first step was backwards
(`PublishCredentialsSection`'s header comment records the three passes it took). A Security page that
re-hosts the connect form re-hides that step one room further away.

The two jobs are genuinely different, and only one of them is built:
- **Connect** — task-shaped, belongs in the flow that needs it. Already correct on Static Site.
- **Inventory** — "what secrets does this install hold, when were they saved, kill that one."
  Cross-cutting. **Nothing does this today.** That is the entire gap this page exists to close.

**The load-bearing constraint — do not get this wrong.** A button that deletes Tovu's row does NOT
revoke the credential at the provider. It stays live on GitHub/Vercel/Cloudflare until someone revokes
it there. Label it **"Remove from Tovu"**, never "Revoke", and link out to the provider's own
revocation page. Calling it "Revoke" ships exactly the defect the owner caught on the connected-
credential row the same day — copy asserting an action the system never performed (see U3 in
`ADS-memory/reports/continuity/2026-08-15-session-4-handoff.md`, and `CredentialStepDone`'s doc
comment for why that timestamp says "saved" and not "updated"). Same family of bug, higher stakes.

**Shape.** One plain page under Operations, no tab bar — a tab bar with a single tab in it is noise.
Add tabs when a second concern actually arrives; obvious candidates already exist (Activity Log is a
`soon: true` placeholder in this same group, and Roles & Permissions sits over in People). One row per
stored credential: provider, what it is for, when it was saved, and a deep link back to the screen
that owns it.

**Known cost when someone picks this up:** a complete inventory means reading from all eight stores,
and two of those surfaces — BYOK and Composio — are already flagged as broken or unfinished elsewhere
in the backlog. Either confront them or scope the first pass to the stores that are healthy and say so
on screen, rather than silently listing a subset as if it were everything.

---

## HTML-format Pages render in the fallback shell, not the theme — and nothing can change that

Filed 2026-08-30, from a live admin-assistant session auditing tovu-com. Diagnosis independently
verified against source before filing; the assistant's line references were all correct.

**Symptom the owner sees:** five authored pages (`/quickstart`, `/documentation`, `/faq`,
`/how-tovu-works`, `/about`) come back cream-and-peach while Posts render correctly in the full Basic
theme. The peach is NOT a theme bug. Those pages are served by Tovu's built-in fallback shell
(`SITE_TITLE = "Tovu Demo Site"`, `server/inbound/public-http/routes/site/pages.ts:137`) — no theme
CSS is requested at all and no theme toggle appears. With the theme's tokens never emitted, the
author's own CSS fallbacks win, and `pages_write_html`'s contract specifies those as
`var(--accent, #8a4b2a)` (burnt orange) over `var(--surface-2, #f6f2ef)` (cream). That is the peach.

**The actual gap.** An `"html"`-format Page should be able to render through the active theme's
`page-shell` template. It cannot, because **there is no per-page template selection anywhere in the
system** — verified: every `templateId` in the codebase is site-level provenance (`"starter"`,
`platform/site-dir/*`), never a page's shell choice. `contracts.ts:126` documents a theme's
`templates` array (`["blog-post.html", "page-shell.html"]`) but nothing selects one for a Page.
This also means **no catalog tool can exist for it yet** — the assistant correctly reported it cannot
fix this from chat. It is a Tovu code change first, a tool second.

Related, already known: this is the same family as the three-diverging-render-paths problem. Confirm
which of the three the fix belongs in before writing code.

**Second finding — theme pages have no "don't publish" switch.** Public routing for a static theme is
driven purely by file presence: any `.html` under the theme's `render/pages/` that is not declared as
a template shell becomes a public URL automatically (`isStandaloneThemePage`,
`features/theme/theme.ts:650`). There is no draft/unpublished state for a theme page. The assistant
worked around this for `/pricing` by moving `pricing.html` into `_unpublished/` inside the theme and
dropping it from `theme.json` — reversible, bytes intact, but a convention it invented, not a feature.
**Decide whether that convention becomes real** (an ignore rule or a declared `unpublished` list) or
whether theme pages get a genuine publish flag. Until then `_unpublished/` is undocumented and the
next person to touch that theme will not know it means anything.

**Smaller, independent:**
- Footer menu still links `/team`, which is a draft page — a live dead link. Fix or drop the link.
- Open question the assistant raised and the owner has not answered: re-skin those five pages to a
  neutral white/grey fallback palette (~15 min) as a stopgap. That hides the peach where it is
  visible but does not fix the shell problem. Do it only if the real fix is not being picked up now.

**Already landed in that session** (theme edits, live, uncommitted): `/pricing` unpublished as above;
header nav rewritten to How It Works / Quickstart / Docs / FAQ / About with all five verified
resolving; the header's Legal dropdown dropped (Terms/Privacy remain in the footer); the theme's demo
Pricing/Changelog/Download/Blog links removed; and a light-mode fix,
`:root[data-theme="light"] .site-header { background: #ffffff; }`, replacing an 82%-blended tinted strip.

---

## Deployment — the owner's 3-session-running goal is more built than it looks (verified 2026-08-30)

**Filed as a todos-audit correction, not a fresh gap report.** The dispatch brief for this audit
described deployment as the owner's stated goal for three sessions running "with essentially no work
done" and "not appear[ing] as an actionable backlog item at all." **That premise is wrong when checked
against current source** — real, substantial, committed code exists on both sides:

- **Admin UI** (`apps/admin/src/features/deployment/`): 6,354 lines across `Deployment.tsx` (tab
  shell), `OverviewTab.tsx`, `StaticSiteTab.tsx` (1,568 lines), `DockerfileTab.tsx` (439 lines),
  `FullSiteTab.tsx`, `HistoryTab.tsx`, plus a `hooks/` directory of port/dependency/use-* pairs
  (`use-static-publish.hooks.ts`, `use-static-export.hooks.ts`, `use-dockerfile-source.hooks.ts`,
  `use-publish-credentials.hooks.ts`) and their own unit tests.
- **Backend** (`apps/website/src/`): `platform/export/site-exporter.ts` (872 lines, real static
  exporter — timeout-bounded, per-route failure isolation, fixed in commit `355ccbbb` 2026-08-28),
  `features/deployments/static-publish/` (S3-compatible publish target at 832 lines, a 693-line
  `verify.ts` post-publish check, `publish-run.ts`, `publish-history.ts`, `credentials.ts`,
  `adapter.ts`), `features/deployments/dockerfile.ts` + a real repo-root `Dockerfile`/
  `Dockerfile.dockerignore`, and admin HTTP routes `publish-site.ts`, `export-site.ts`,
  `deployment-overview.ts`, `publish-credentials.ts`. 23 test files under
  `features/deployments/`+`platform/export/`. All of this is **committed** (landed by 2026-08-28,
  `git log` on the key files, no uncommitted working-tree changes in either directory) — not
  in-progress scaffolding.
- Confirmed real, not a stub: `git status --porcelain` on both directories is clean, and
  `deployment-constraints.md` itself (see below) is dated *before* the exporter/publish work landed,
  which is why its own §3 table is now stale.

**What is genuinely still open, from `development/docs/deployment/deployment-constraints.md`** (the
2026-08-13/15 debate-sourced doc, `194` lines, last touched 2026-08-27 — **now itself partly stale**:
its §3 table row "Static exporter: Does not exist… `grep` for `StaticExporter`/`exportSite` returns
nothing" is **false** as of current source; re-verify the rest of that table before trusting it):
- **§4.1 — multi-workspace hosting does not exist.** One running process resolves exactly one
  workspace at boot (`src/platform/site-dir/resolve-workspace.ts:15-21`). This is the doc's own
  stated gate for any *hosted-SaaS* deployment product (§9) — self-host/export/publish-to-a-bucket
  paths (what the code above actually builds) don't need it, but "click Deploy, get a URL" for a
  non-technical user does.
- **§9 — the product question is still unanswered**: hosted SaaS (Deploy panel nearly empty:
  Publish/domain/status) vs self-hosted (Providers tab with credentials) serve different users, and
  the doc says the existing stub was shaped for the wrong one. Whether the *current* `Deployment.tsx`
  UI (Overview/StaticSite/Docker/FullSite/History tabs) resolved this question one way or just built
  through it was not checked in this pass — worth a direct look before assuming it's settled.
- **Not independently verified this pass**: whether the built pipeline actually succeeds end-to-end
  against a real host (S3-compatible bucket, a live Docker build) — code existing and tests passing is
  not the same claim as "the owner can click Deploy and get a working live site," and no live
  deploy was attempted here (would need real credentials and is outside a todos-audit's scope).

---

## `content/themes/` vs `sites/` have drifted in load-bearing ways — an upgrade would silently break the live site (verified 2026-08-30)

**This is the gap the project memory `[[project_tovu_upgrade_destroys_themes]]` describes from the
other direction** (upgrading Tovu destroys live theme edits because `sites/` is gitignored and themes
live inside the install dir) — this entry documents the CURRENT, concrete drift on `tovu-com`'s
`basic` theme, verified with `diff -rq content/themes/static/basic sites/tovu-com/themes/static/basic`:
`css/theme.css`, `render/pages/404.html`, `render/pages/index.html`, `render/pages/pricing.html`,
`render/partials/footer.html`, `render/partials/nav.html`, `theme.json`, `tokens.light.json` all
differ.

Two of those differences are functionally load-bearing, not cosmetic:

- **`render/partials/nav.html`** — live carries `data-embed-config='{"type":"menu",
  "id":"menu-header-nav","variant":"tree"}'` on the header menu; tracked has the same marker
  **without** `"variant":"tree"`. This is not stylistic: `static-render.ts:267` picks
  `renderMenuTree` only when `marker.config.variant === "tree"`, else the flat `renderMenuLinks`
  (`static-render.ts:168`), and `renderMenuLinks`'s own doc comment (`static-render.ts:188`) says it
  drops every nested-menu hook "on the floor." Confirmed live: `nav.html` already carries an inline
  comment recording this exact reasoning (added this session). **An upgrade that copies the tracked
  theme over the live one would silently delete the Docs dropdown** (or whatever menu currently
  relies on the tree variant) with no error — the flat renderer degrades gracefully, so nothing
  breaks loudly.
- **`render/partials/footer.html`** — live footer's "Product" column drops the Pricing link tracked
  still ships, and its "Resources" column points Docs at `/documentation` (absolute path, bypassing
  the `<name>.html`→`/<name>` rewrite) where tracked still links `docs.html`. Live already carries
  inline comments (added this session) recording that the "Pricing removed because pricing.html was
  unpublished" note is **no longer true** — `pricing.html` is back in `render/pages/`, listed in
  `publishedPages`, and `/pricing` returns 200 — and that `docs.html` 404s because `docs` was never
  added to `publishedPages`, while `/documentation` is the real, separately-published page. An
  upgrade would restore the dead `docs.html`/absent-Pricing-caveat link shape.

`sites/` is gitignored (confirmed: `git status` shows no `sites/` changes despite the diffs above), so
**the tracked copy under `content/themes/` is what any future `tovu init`/theme-reinstall/upgrade
path would deploy** — reverting these live fixes with no warning. No fix attempted here (out of
scope for a todos audit); flagging so the next theme-sync or upgrade-safety pass knows this drift
exists and isn't cosmetic.

---

## Footer dead links on the live site — re-verified 2026-08-30 against a running `:3000`

**Corrects/narrows the version of this claim carried into this audit's dispatch brief.** Curled every
link the rendered homepage footer actually emits (`curl :3000/`, extracted via regex, then checked
each individually — not inferred from `theme.json` alone):

| Link | Status | Why |
|---|---|---|
| `/download` | **404** | `download` is in `basic`'s `theme.json` `pages` list but not in `publishedPages` (`["about","blog","pricing","signin"]`) |
| `/changelog` | **404** | same — in `pages`, not in `publishedPages` |
| `/signup` | **404** | same — in `pages`, not in `publishedPages` |
| `/team` | **404** | **different root cause** — not a theme page at all; it comes from the `menu-footer-nav` embedded menu, and `/team` is a **draft Page entity** in the DB (see the "HTML-format Pages render in the fallback shell" entry above, which independently found this same link). Fixing `publishedPages` will not fix this one. |
| `/blog` | 200 | now live — `blog` **is** in `publishedPages` today (this has changed since the brief was drafted; do not assume it's still dead) |
| `/documentation`, `/about`, `/signin`, `/contact`, `/faq`, `/terms-of-service`, `/privacy-policy` | 200 | all fine |

**Root cause for the theme-allowlist ones (`download`/`changelog`/`signup`):** `basic`'s
`theme.json.publishedPages` is an explicit allowlist separate from `pages` (the full set of `.html`
files the theme ships) — a page can exist, render fine if hit directly... actually does not: confirmed
by curl, an unlisted page 404s outright, it is not merely "unlinked." The footer partial links to all
of them unconditionally regardless of `publishedPages`, so the footer is generating guaranteed 404s by
construction. Either add `download`/`changelog`/`signup` to `publishedPages`, or stop linking pages
that aren't published — the current combination is the bug.

---

## 🐛 BUG, filed 2026-08-30 — opening the assistant dock corrupts the Visitor's AI Assistant form state

**Reproduced twice in a real browser** (per this audit's dispatch brief, which this entry files
verbatim plus a source-level lead): opening the admin `AssistantDock` flips a working, saved Gemini
key's status from `Key works — 39 models available` to `API key not valid. Please pass a valid API
key.` plus `Not saved yet — press Save.` A page reload restores it, so nothing is actually persisted —
but the **Save button is left enabled over a bad value**, which is the dangerous part: an operator who
doesn't reload and just presses Save could overwrite a good stored key with garbage.

**Not fully root-caused this pass** (would need a live repro session, which this audit didn't run —
see `[[feedback_live_agent_tests_via_browser_not_cli]]`), but a concrete lead worth checking first:
`AiAssistant.tsx`'s `VisitorCredentialForm` (`apps/admin/src/features/ai-assistant/hooks/
use-visitor-credential-form.hooks.ts`) owns this exact string pair (`ai-assistant-i18n.ts`: `"Key
works — {count} models available."` / `"Not saved yet — press Save."`) and has a "discovery on load"
effect (`useEffect` keyed on `[stored?.isSet, baseUrl, protocol]`) that re-probes the provider with
`{ ...config, apiKey: "" }` whenever `stored.isSet` flips — relying on the server substituting the
already-saved key. Separately, `AssistantDock.hooks.tsx`'s `useLocalCliSelection` (line ~511) reads
and, on a change, writes+broadcasts `EXECUTION_NAMESPACE = "core.execution"` via
`publishSettingsRefresh([EXECUTION_NAMESPACE])` — the same namespace `execution-settings.ts`'s header
comment says drives a `useSettingsSlice.refresh()` that "replaces the WHOLE in-memory value with
whatever `loadExecutionConfig` returns" on **any** out-of-band settings-changed signal, including a
same-tab echo. That mechanism is documented there as specifically an ADMIN-BYOK-key problem
(`reconcileExecutionConfigRefresh`), and `execution-settings.ts`'s own header says "Settings →
Execution mode deliberately does NOT opt in [to the stored-credential probe] — different key" from the
Visitor's site credential — so it's not a proven match. Flagging it because it's the only shared
mechanism found by grep in the time available (`EXECUTION_NAMESPACE`, `publishSettingsRefresh`,
`reconcileExecutionConfigRefresh`), not because it was confirmed to fire on the Visitor form. Next
step: reproduce with the browser devtools Network tab open on the Visitor's AI Assistant screen while
opening the dock, and see whether a `listModels`/discovery call fires with an empty or stale key at
the moment the dock opens.
