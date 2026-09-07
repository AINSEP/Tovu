# `development/todos.md` de-stale reconciliation — 2026-09-06

Agent: CodeBase Analyzer(Execution). Branch: `restructure/apps-website-phased`.
Source file before: **1720 lines**.

Disposition policy applied per the dispatch:
1. verified-done -> delete outright; 2. CORRECTION+historical -> collapse to corrected truth;
3. verified non-reproducing -> delete; 4. verified open -> keep + tighten;
5. cannot settle cheaply -> keep verbatim, prefix `[UNVERIFIED 2026-09-06]`.

Written incrementally, pass by pass.

---

## Pass 1 — top-of-file dated entries (lines 24-301)

### Deleted outright (rule 1 — verified done)

| Entry | Evidence |
|---|---|
| `✅ DONE, 2026-08-29 — SonarQube set up in development/sonarqube/` | `ls development/sonarqube/` -> `README.md docker-compose.yml scan.sh sonar-project.properties` |
| `✅ FIXED 2026-08-30 — tovu serve never starts an agent daemon` | `apps/website/src/cli/commands/serve.ts:308` calls `startAssistantDaemon({...}, { registerProcessSignalHandlers: false })`; `apps/website/src/server/runtime/lifecycle/agent-daemon-port.ts` exists (7176 bytes). (Entry's own `serve.ts:178` line ref was already stale — the call is at :308.) |
| `✅ RESOLVED (2026-08-18) — Retrofit the assistant transport onto AG-UI + CopilotKit` | `ADS-memory/reports/architecture/ADR-059-assistant-transport-ag-ui-canary.md` exists; the entry's own last paragraph records the §12 cross-reference fix as already applied. |

### Rewritten

| Entry | Was | Now |
|---|---|---|
| `⚠️ RECURRING 2026-09-03 — Admin SSE connection-pool exhaustion ... fix sitting disabled` | claimed the C1 mkcert fix was disabled at `apps/admin/.certs.disabled/` | **FALSE.** `apps/admin/.certs*` does not exist at all; certs moved to the repo root (`apps/admin/vite.config.ts:49-53`) and `.certs/localhost.pem` + `.certs/localhost-key.pem` are present with no `.certs.disabled/`, so `vite.config.ts:67-73` enables HTTPS/2. Collapsed to the one genuinely-open residual: the 2026-08-18 ADR's unexplained "14 connections vs 3 tabs" anomaly (`ADS-memory/reports/2026-09-03-admin-sse-connection-exhaustion.md:206`). 9 lines -> 7. |
| `🎯 DIRECTION 2026-08-29 — Tovu-Runner becomes an EXTERNAL MCP SERVER` | 44 lines of open questions 1-5 + "pieces already exist" survey | Both directions now have ADRs: **ADR-060** (`runner-unified-operator-chat`) is `PROPOSED — requires owner sign-off` and **ADR-061** (`runner-tools-for-tovu-site-assistant`) is `ACCEPTED — signed off 2026-08-29` (`ADR-INDEX.md:63-64`). Collapsed to a pointer + the call-sites sizing caution. 44 -> 16 lines. |
| `✅ RESOLVED — Users/Roles/Policies + Plugins admin surface` | marked RESOLVED but its own body listed unfinished phases/gates | Header was wrong (not resolved). Retitled to the open remainder only. Verified: neither `005-plugin-system/pipeline-state.md` nor `006-identity-and-authorization/pipeline-state.md` records phases past Architecture Sign-Off; SPEC-006 row 19 reads `COMPLETE, status reverted to DRAFT`; ADR-PIPE-006/ADR-048 row 20 reads `PROPOSED`. 22 -> 14 lines. |
| `🔧 IN PROGRESS 2026-07-28 — finish SPEC-003 recertification` | 24 lines incl. a long coverage-gate debate that the entry itself then records as decided | Coverage-gate decision was made 2026-07-28 (owner) — superseded prose deleted. Kept the still-open part: `003-site-install-dir/pipeline-state.md`'s ledger ends at `Architecture Sign-Off | APPROVED | 2026-07-28` (21 lines total, no Code Inspection row). 24 -> 12 lines. |
| `⚠️ OWED — /audit-work + /code-inspection across this session AND the previous (uncommitted)` | "all still uncommitted and unreviewed" | **Premise false.** `git log --oneline --since=2026-07-28 --until=2026-08-05 \| wc -l` = **318** commits. A code+security review also ran: `ADS-memory/reports/audit/2026-08-02-03-sunday-monday-code-security-review.md`. Kept the real residual: `grep -E "^\| (Code Inspection\|Security\|TestRunner\|Programmer\|TDD)"` over all three `pipeline-state.md` files returns **zero** rows. 12 -> 7 lines. |
| `⚠️ OWED — specs/ADRs/tests for the 2026-08-05 embeds work` | CORRECTION block + "Historical text follows" + superseded prose | Rule 2 collapse. Correction independently re-verified: `apps/website/src/contracts/core/embeds/marker.ts` and `apps/website/src/features/widgets/html-embeds.ts` both exist; `grep -rn "data-widget-embed\|data-form-embed" apps/website/src/features/post` = **0 hits**, and the same pattern DOES match `apps/website/src/features/widgets/{html-embeds,resolver-service}.ts` (so the zero is real, not a silent-miss). ADR-047's gate confirmed still open at `ADR-INDEX.md:54` ("owes `/audit-work` before ACCEPTED"). 47 -> 23 lines. |

### New gaps discovered while verifying (NOT fixed)

- **7 ADRs exist on disk but have no row in `ADS-memory/reports/architecture/ADR-INDEX.md`**: ADR-053 (mcp-ui-confirmation-transport), ADR-055 (mcp-ui-return-path), ADR-056 (pages-vibecoding), ADR-057 (site-glue-tier), **ADR-059 (assistant-transport-ag-ui-canary)**, ADR-063 (admin-tab-deep-linking), ADR-064 (agent-guided-deployment). `grep -c "059" ADR-INDEX.md` = 0. The todos entry that was just deleted pointed at ADR-059 as the authority for a resolved decision, so the index is missing exactly the ADRs that recent work depends on.
- **ADR-047 is live in production code but never reached ACCEPTED** — the widgets/embeds implementation shipped (SPEC-043, commits `03a87816`/`285bbfc1`/`cf41bf14`) while `ADR-INDEX.md:54` still records "owes `/audit-work` before ACCEPTED".

---

## Pass 2 — Admin Section Spec Sweep + 2026-08-10 Commerce/Auth/Agent-Plugins slice

Rewrote the whole 17-row matrix down to remaining-work rows only. Verified each disposition:

### Rows dropped as done (rule 1)
- **Collections, User management, SEO, Redirects** — the matrix's own "What is still not done" column already read "No material admin-screen gap found" / an intentional exclusion. Left as a one-line "nothing outstanding" list rather than four table rows.
- **Comments** — the row's remaining item ("Remove the stale `soon` badge/unfinished copy in the panel registry") is **now false**. `apps/admin/src/panels.tsx:435-440` documents that `soon: true` on a panel rendering a real screen is a deliberate owner call, the only entry in the file shaped that way, made coherent by `soonPreviewable: true`. Removing the badge would now contradict a recorded decision.

### Rows corrected (claim was stale, section still has other open work)
- **Database / Storage** — "Wire the drift banner" is **done**: `SchemaStateWarningBanner` exists in `Database.tsx:32` with a dedicated test (`Database.unit.test.tsx:223`). Still open per `Database.tsx:40`: "the `PENDING_MIGRATION` boot banner and the Tier-3 browser have no route yet".
- **Media** — "Replace Images/Videos filter placeholders" is **done since 2026-08-24**: `Media.tsx:31-34` records that `AdminMedia.contentType` now drives `rules.ts`'s `filterMediaByTab`, "replacing the 'not wired up yet' placeholders those tabs used to render". Replaced with the real current gap from `Media.tsx:900-907`: the screen's file-input `accept` lists images only while `DEFAULT_ALLOWED_MIME_TYPES` accepts `video/mp4`+`video/webm` — an explicit pending owner decision.
- **Analytics** — the "stale 'in memory' copy" item is **done**: `Analytics.tsx:13-15` records the notice was corrected because the in-memory `LocalBufferSink` is only reachable under `TOVU_DB=memory`.

### Rows confirmed still open (kept, tightened with a source citation)
- **Newsletter** — `panels.tsx:984-989` renders `<Placeholder sectionId="newsletter">`; no `apps/admin/src/features/newsletter/` directory exists.
- **Forms** — SPEC-010 / ADR-PIPE-010 have **zero** hits in `ADR-INDEX.md`, while the same ids DO match `ADS-memory/specs/043-widgets/feature.spec.md:464` (so the zero is real, not a silent-miss).
- **Settings** — "Five of 13 tabs" is exactly right: `SettingsUi.tsx` declares 13 tab ids and contains 5 `settings-ui-inert-wrap` occurrences.
- **Menus** — drag-and-drop still absent: `grep -i "draggable|dragstart|dnd" apps/admin/src/features/menus/` returns nothing.
- Categories & Tags, Roles & Permissions, Members, Integrations/API, Backups/Recovery — kept verbatim; not cheaply falsifiable from source alone, and each names concrete unbuilt controls.

### Commerce/Auth/Agent-Plugins checklist
- Deleted all 5 `[x]` items (done by their own marking; git history keeps them).
- **Kept 3 `[ ]` items**, each confirmed against `panels.tsx`: commerce (`payments`/`orders`/`products`/`subscriptions`/`billing` all `soon: true`), authentication (`soon: true`), Agent Plugin Marketplace (`plugins-marketplace` `soon: true` + `Placeholder`).
- **Closed 3 `[ ]` items** that source contradicts:
  - "Build the Agent Plugin loader/installer, validation, trust/permission review, lifecycle, sandboxing, execution boundaries" — `apps/website/src/features/agent-plugins/` ships `install.ts` (205: `installAgentPlugin`), `install-from-url.ts` (72), `capability-projection.ts`, `tool-registrations.ts` (380). `install.ts:5-32` documents hardened extraction (zip-slip, symlink refusal, decompression bombs) and records that *no plugin code is executed at all in v1* — so "sandboxing/execution boundaries" is a deliberate non-goal, not a gap.
  - "Extend the Tovu daemon attachment contract beyond `image/*`" — done. `AssistantDock.tsx:567-584`: `attachmentAccept` deliberately removed, `agent-daemon-server.ts`'s non-image filter deleted, upload path kind-agnostic end to end.
  - "Replace the bounded source catalog with real installed/enabled inventories" — moot. `tool-catalog-composer-source.ts:10-25`: the source was deliberately unwired by owner decision 2026-08-21.
- Folded the standalone "Coverage-gap note (2026-07-07 audit-of-parity)" paragraph into the sweep's own "still separately wanted" blockquote — same subject, was duplicated.

---

## Pass 3 — Active Working Items AW-1 … AW-7

### Deleted (rule 3 — verified does not reproduce)
- **AW-1 (mobile nav drawer clipping)** — the bug was described against theme `tovu-official`, which no longer exists: `ls content/themes/static/` returns `basic basic-2 tailark-dusk tailark-quartz-dark tailark-quartz-libre`, and the only remaining `tovu-official` strings are `NOTICE.md` attribution files plus a legacy name in `seed.ts`. `content/themes/static/basic/css/theme.css` exists and is guarded: `development/e2e/theme-visual.spec.ts:104-159` runs real geometry assertions at 390x844 and takes `home-mobile-390-drawer-open.png`.
- **AW-4 (wide-screen content-page layout)** — same stale-theme premise; guarded by the `AW-4` block at `theme-visual.spec.ts:175-235` (2 page types x 3 widths). Its one residual — a true non-post `page-shell.html` page was never exercised — was **folded into AW-2** rather than dropped.

### Reconciled: the AW-1 / AW-2 baseline contradiction the dispatch flagged
`development/e2e/theme-visual.spec.ts-snapshots/` holds 5 baselines. Four are dated **Jul 15 16:56-16:58**; `home-mobile-390-drawer-open-chromium-darwin.png` is dated **Aug 30 21:41**. That is consistent, not contradictory: AW-1 said "add an open-drawer baseline once AW-1 is fixed", and the 2026-08-30 re-verification found there was nothing to fix, so the baseline was captured at that point alongside the new AW-1 guard block. The four stale baselines are a separate, still-open problem and are kept as such.

### Rewritten
| Entry | Disposition |
|---|---|
| **AW-2** | Rule 2 collapse. Harness half is **done and verified**: `development/playwright.config.ts:82` spawns `apps/website/src/index.ts` (the repoint landed in commit `d4c600b9`, "repoint 39 Playwright configs at apps/website/src"). The "all 4 pass clean" prose and the SETUP-DONE history were deleted. Kept as open: the 4 stale Jul-15 baselines, dev theme hot-reload, cross-platform baseline drift, AW-4's untested page type, and the closed-drawer `scrollWidth` quirk. 31 -> 25 lines but with no superseded prose. |
| **AW-3** | Kept (both ADRs Accepted, spec slices genuinely open); trimmed to 5 lines. |
| **AW-5** | Tier-1 theme names were stale — `column` and `tovu-official` are both gone from disk. AW-5a's paths all moved in the restructure and are now corrected: `render.ts`/`liquid-sandbox.ts`/`liquid-worker.ts` -> `apps/website/src/server/inbound/public-http/http/site/`; `theme.ts`/`liquid-allowlist.ts` -> `apps/website/src/features/theme/` (all five verified present). The `themes/dispatch/` demonstrator no longer exists; templated themes on disk are `content/themes/templated/{fashion-modern,storefront}`. Kept the one residual (VRT baseline for the `render_block` seam) and AW-5b unchanged. 21 -> 20 lines, all of it now true. |
| **AW-6** | Rule 2 collapse. The CORRECTION was itself re-verified: `ADR-INDEX.md:31` reads "Accepted 2026-07-11". Superseded "Proposed / owner sign-off owed" prose deleted; kept the one open item (the ~50k-product faceted-catalog SQLite benchmark). 10 -> 6 lines. |
| **AW-7** | Kept ⭐ and settled most of the 2026-08-30 `UNVERIFIED` note rather than carrying it forward. **Tier 3**: `apps/website/src/features/plugins/store/store-plugin.ts:81` declares its table through the core `dataModule` seam, and `__tests__/store-plugin.test.ts:4` states it "Proves the store plugin declares its table through the core dataModule seam (B: snapshot→DDL)" — so owned-tables + snapshot-before-change IS evidenced; only "live-verified, hand the owner the commands" is not. **Tier 1**: Contact Form shipped as `features/widgets/resolvers/contact-form.ts`, the widgets subsystem, not the plugin/`dataModule` subsystem this item is about — so the item stays open. **Tier 2**: zero hits for `readability`/`content.analyzer` under `apps/website/src/features/plugins/`, and the same pattern matches 5+ other files under `apps/website/src`, so the zero is real. |

### Pass 3 defect — found and fixed before pass 4

My pass-3 helper replaced an `###` block by spanning from its heading to the **next `###` heading**, which does not stop at an intervening `##`. The AW-7 replacement therefore also deleted four `##` sections that sat between AW-7 and the next `###` (`Core architecture fundamentals`): **Completed (WordPress Specs)**, **Completed (Architecture)**, **Canonical Architecture Decisions (ADRs)**, and **Learn (What You Need to Understand)** — 57 lines, none of it in scope for pass 3.

Restored byte-identically from `5e593ab4:development/todos.md` lines 332-388 (`diff` against the restored range returns rc=0) in a separate commit before pass 4 began. Pass 3's intended AW-1..AW-7 edits are unaffected and stand.

---

## Pass 4 — Completed / ADR map / Accomplish / Agent capability surface / research backlogs

(The Completed and ADR-map sections were not assigned to a pass in the dispatch; they sit between the pass-3 and pass-4 material and carried dead paths, so they were handled here.)

### Deleted (rule 1)
- `## Completed (Architecture)` merged into one `## Completed — historical record` pointer block with the two docs' **current** locations: `ADS-memory/docs/architecture/tovu-architecture.md` and `ADS-memory/docs/research/competitor-analysis.md`.
- **Accomplish → Foundation:** "Split `src/contracts/core/ports.ts` into domain-focused port files" — **done**. There is no `contracts/core/ports.ts`; the split files exist (`contracts/core/gated-mutations/ports.ts`, `contracts/core/entry-refs/ports.ts`, `contracts/core/events/index.ts` + `memory-bus.ts` + `outbox-worker.ts`).
- "Add server route tests in `src/server/__tests__/`" — **done**: `apps/website/src/server/__tests__/` holds dozens of route tests (`admin-database-timeline-route.test.ts`, `admin-connectors-routes.test.ts`, …).
- "Add first persistent adapter set (DB-backed repo + DB-backed outbox)" — **done**: `apps/website/src/platform/db/sqlite/outbox-repo.sqlite.ts` plus contract/integration tests under `contracts/core/events/__tests__/`.
- **Accomplish → First real capabilities:** workspace CRUD (`server/inbound/admin-http/routes/workspace/{get,create,list,update,delete}.ts`), auth boundary (`server/inbound/admin-http/authorize-guard.ts`), and the plugin/module registration skeleton (the whole SPEC-005 plugin system) are all built.

### Corrected paths (the apps/website + ADS-memory restructures)
| Claim | Now |
|---|---|
| "`wordpress_specs/` … 53 files" | `development/other-repos-specs/wordpress_specs/` — **78** `.md` files |
| "`other-repos-specs/shopify_specs/TODO.md`" | `development/other-repos-specs/shopify_specs/TODO.md` (exists) |
| "`other-repos-specs/medusa_specs/TODO.md`" | `development/other-repos-specs/medusa_specs/TODO.md` (exists) |
| "`tovu/apps/admin/sections/` placeholder, one INFO.md per section" | **Gone.** No such directory. The live registry is `apps/admin/src/panels.tsx` (46 panels), already reconciled by the sweep above. The only `sections/` left in the repo is `ADS-memory/docs/architecture/sections/`, which is the architecture document split into 15 chunks — unrelated. |
| "`docs/design/admin-sections-ui-brief.md`" and "`docs/design/rail-pages-ui-brief.md`" (ADR map §11) | **Neither exists anywhere in the repo** (`find . -name "*ui-brief*"` returns nothing). |
| "`admin-sitemap.md`" | `ADS-memory/reports/architecture/admin-sitemap.md` |
| "`tovu-v2-design.md`" | `development/tovu-v2-design.md` |
| ADR map §12: "ADR-013: one CopilotKit client + one AG-UI daemon agent" | **ADR-059 is current** (Accepted 2026-08-18); it supersedes ADR-049, which had superseded ADR-013's transport choice. The map was two supersessions behind. |

### Left `[UNVERIFIED 2026-09-06]`
- **Backlog: Commerce Platform Crosswalk** — its pointer, `other-repos/TODO.md`, does not exist anywhere in the repo and the synthesis notes it named could not be located. Kept the work item (redirected at the two upstream TODOs that do exist) and flagged the missing source rather than deleting it.

### Kept verbatim (rule 4/5)
- **Agent capability surface (13 items)** — a design backlog whose `file:line` citations are all to *other* repos (Directus, Strapi, Payload, WordPress). Verified only that its evidence roots exist: `/Users/la/Programming/OSS-Repos/AI-Capabilities/` (per-repo `.md` + `.metrics.json`) and `/Users/la/Programming/Jini/ai-control-plane.md`. Settling the individual items would require reading Jini's control plane, which is out of scope here.
- **Learn (What You Need to Understand)** — a study list, not a claim about this repo's state.
- **Backlog: Directus Research** — 3 items, genuinely open; added the pointer to `development/other-repos-specs/directus_specs/`.

### New gaps discovered while verifying (NOT fixed)
- **The outbox has no backoff and no attempt cap.** `apps/website/src/contracts/core/events/outbox-worker.ts:34` calls `outbox.markFailed(row.id, message, now)` — `now` is the `nextAttemptAt`, so a failed event becomes immediately claimable again. `outbox-repo.sqlite.ts:87-90` faithfully writes whatever it is handed. `attempts` is incremented but nothing reads it: `maxAttempts` and `dead-letter` have **zero** hits under `contracts/core/events/` and `platform/db`. A permanently-failing handler spins at full batch rate (20/tick) forever. This was already an open todo item; what is new is that the schema supports the fix and the worker simply does not use it.
- **`apps/website/src/server/error-mapping/` is an empty promise** — one `INFO.md` declaring itself "the intended home for the canonical error envelope, status mapping helpers, and route-safe translation", with no implementation file beside it.

---

## Pass 5 — Master Build Inventory §1-§18

Deleted every `[x]` item (rule 1; git history keeps them) and rewrote the reconciliation header. `[ ]` items were re-checked rather than carried forward.

### Header paragraph (rule 2 collapse)
The 2026-07-15 snapshot plus its 2026-09-02 §12 correction became one short block. Its stale halves: "`apps/admin/src/sections/` has 26 real screens" (that path does not exist; `apps/admin/src/features/` has **31** directories) and "no CopilotKit/AG-UI/MCP code exists anywhere in `src/`" (already corrected in-place, now stated once).

**Counts re-measured — every one in the old text was wrong:**
| Claim | Measured 2026-09-06 |
|---|---|
| "46 ADRs" | **64** ADR files; only **57** have an index row |
| "34 `__tests__` directories" | **156** |
| "only 10 modules have `__specs__/`" | **7** |
| "8 rule-of-two ports have `*.contract.test.ts`" | **15** |
| "26 `INFO.md` files" | 26 — correct |

### Sections collapsed to a pointer (all items were `[x]`)
§3 Data Layer, §4 Auth/Identity/Permissions, §5 Storage/Media — replaced by one paragraph naming the owning ADRs (006/007/015/022/023/026/041/045; 021/008/022/041; 027) so the architecture map survives the deletion.

### `[ ]` items corrected because source contradicts them
- **§2 "Implement persistent outbox adapter (DB-backed) — only an in-memory outbox exists today"** — **false**. `apps/website/src/platform/db/sqlite/outbox-repo.sqlite.ts` implements it, `server/runtime/composition/deps.ts:934` wires `new SqliteOutboxAdapter(db)` under a comment citing "ADR-046 Phase 1 … durable SQLite outbox", `platform/db/schema.ts:1176` declares `outboxEvents`, and both `outbox-repo.contract.test.ts` and `outbox-restart.integration.test.ts` exercise it. Item deleted.
- **§1 "Add core observability hooks — no metrics/tracing port exists"** — **false**. `apps/website/src/platform/observability/` ships `ports.ts` + `noop.ts` + `otel.ts` + `config.ts` + `index.ts`, wired via `server/inbound/shared/observability-middleware.ts`. Rewritten to the real residual, taken from the port's own header: `trackDbQuery` / `trackOutboundCall` / `trackAgentRun` are unbuilt. Same correction applied to §16's "Add metrics and tracing".
- **§7 "Workspace module full CRUD — create-only today (`features/workspace/create.ts`)"** — **false**. `features/workspace/` no longer has a `create.ts`; the routes `server/inbound/admin-http/routes/workspace/{get,create,list,update,delete}.ts` all exist and register real handlers. Narrowed to the part that is missing: lifecycle events.
- **§15 "no lint script"** — **false**: `package.json:67` is `"lint": "biome lint ."`.
- **§15 "Add formatter — no prettier config in the repo"** — **moot**: `biome.json` exists at the root with `@biomejs/biome ^2.5.5`, and Biome supplies formatting.
- **§15 "no `.github/workflows/`"** — **false**: `.github/workflows/ci.yml` is **508 lines** and runs `npm run typecheck`, `test:ci`, `check:boundaries`, `check:architecture`, `check:inventory`; `fly-deploy.yml` sits beside it.
- **§8 slots/regions "C6 hardening still open"** — stale; C6 landed 2026-07-15 (see AW-5a). Narrowed to the slots/regions model itself.
- **§13 MCP item** — the 2026-09-02 narrowing was correct and is now stated once, without the "was too broad" scaffolding.
- Path fixes throughout: `src/server/error-mapping/` -> `apps/website/src/server/error-mapping/`; `server/http/site/render.ts` -> `apps/website/src/server/inbound/public-http/http/site/render.ts`; `apps/admin/src/sections/` -> `apps/admin/src/features/`.

### `[ ]` items confirmed still open
- **§6 Search** — nothing built: no directory matching `*search*` anywhere under `apps/website/src`. Kept all six items, with a one-line note that ADR-022's expression indexes do not satisfy the first.
- §1 error model, config system, feature flags, module loader contract; §2 naming conventions, retry/backoff, handler idempotency, core dead-letter, replay; §9 all six; §10 all six; §17 all seven — kept and tightened.

### Added
- **§18: "Index the 7 unindexed ADRs (053, 055, 056, 057, 059, 063, 064) in `ADR-INDEX.md`"** — a new, real work item derived from the gap found in pass 1. This is the one line added rather than removed; the index is the file's own stated source of truth and is incomplete.

### Correction to my own pass-4 text
Pass 4's Accomplish item said "no logger module exists". True for logging, but it read as if no observability existed at all. Amended in this pass to name `platform/observability/` explicitly and state the distinction: an `ObservabilityPort` exists, it carries no correlation id and does no structured logging.

### New gap discovered (NOT fixed)
- **A false code comment.** `apps/website/src/server/runtime/composition/deps.ts:439-441` still reads "outbox + event bus remain in-memory for now (events are fire-on-write side effects, not yet durable across restarts) — a durable outbox is a later …", while line 934 of the same file constructs `new SqliteOutboxAdapter(db)`. The comment contradicts the code 495 lines below it.

---

## Pass 6 — Master Build Inventory §19-§25 (parity / AEO / GEO / tooling / reference repos)

Conservative pass, as instructed: **38 `[x]` items deleted**, every `[ ]` item kept unless source flatly contradicts it. After this pass the file contains **zero** `[x]` items and 291 open ones.

### Spot-verified before deleting the `[x]` items
`apps/website/src/features/{taxonomy,seo,redirects,members,newsletter,analytics,forms,navigation}` all exist; `apps/admin/src/features/{users/Users,roles/Roles,media/Media,recovery/Recovery,forms/FormsList}.tsx` all exist; `ts-morph` is a real devDependency (`package.json:138`); `/Users/la/Programming/OSS-Repos/medusa` is cloned. The one cited file that does **not** exist is `apps/admin/src/sections/Appearance.tsx` — the theme settings UI is now `apps/admin/src/features/themes/Themes.tsx`, rendered under both the `themes` and `appearance` panel ids. That item was `[x]` and deleted anyway, but the same stale path appeared in a surviving `[ ]` item and was corrected there.

### `[ ]` item deleted because source contradicts it
- **§19 "Comments/moderation system (if in scope) — ADR-031 Accepted, but backend NOT built yet"** — **false**, and it contradicted this file's own Admin Section Spec Sweep (which lists Comments as ✅ Implemented). `apps/website/src/features/comments/` ships `repo.sqlite.ts`, `write-service.ts`, `ingress.ts`, `sanitize.ts`, `spam.heuristic.ts`, `spam.external.ts`, `settings.ts`, `data-module-install.ts`, `agent-tools.ts`. Deleted.

### `[ ]` items corrected
- **§24 "Evaluate OpenTelemetry (later)"** — **adopted**. Six `@opentelemetry/*` packages are real dependencies (`package.json:101-106`) and `apps/website/src/platform/observability/otel.ts` imports `@opentelemetry/api`, `exporter-trace-otlp-http`, `resources` and `semantic-conventions` behind `ObservabilityPort`. Replaced §24's scattered adoption notes with one "already adopted, do not re-evaluate" block covering dependency-cruiser, ts-morph, Biome and OpenTelemetry.
- **§24 Nx/Turborepo "moot for now, `src/` has not been split into `packages/`"** — a `packages/` root does exist, holding `packages/sdk`. Reworded to "still mostly moot: no multi-package graph to tag or cache yet".
- **§19 theme preview/activation** — `Appearance.tsx` -> `apps/admin/src/features/themes/Themes.tsx`.
- **§19 block editor** — `apps/admin/src/sections/PostEditor.tsx` -> `apps/admin/src/features/posts/PostEditor.tsx` and `apps/admin/src/features/collections/CollectionEntryEditor.tsx`.
- **§22 JSON-LD** — `server/http/site/page-head.ts` -> `apps/website/src/server/inbound/public-http/http/site/page-head.ts`; `seo/page-head-contributor.ts` -> `apps/website/src/features/seo/page-head-contributor.ts`.
- **§22 robots.txt builder** — `src/seo/` -> `apps/website/src/features/seo/`.
- **§19 `#### SEO + discovery`** emptied completely (all four items were `[x]`); replaced the empty heading with a one-line "at parity — ADR-032/ADR-033" note rather than leaving a bare heading.

### Left `[UNVERIFIED 2026-09-06]`
- **§24's source citation** — the three files it rests on (`claude-`/`gemini-`/`codex-tovu-competitor-findings.md`) are not present anywhere in the repo, so the reasoning behind the tool picks could not be re-read. Section kept; the missing sources are flagged inline.

### Deliberately untouched
- §21, §22 (AEO/GEO/AI surfaces, ~120 lines), §23 (Platform Gaps), §25 (Reference Codebases) — aspirational lists with no falsifiable claims about current source beyond the paths already fixed. Kept whole, as instructed.

---

## Pass 7 — the tail sections (not assigned to a pass in the dispatch)

The dispatch's six passes covered the file down to §25. The 13 `##` sections after it (~400 lines) carried the same defects, so they were reconciled too.

### Deleted (rule 1 — verified done)
- **`## ✅ RESOLVED (2026-08-24) — template shells were their own reachable URL`** (67 lines). Verified: `isStandaloneThemePage` is exported at `apps/website/src/features/theme/theme.ts:706` and referenced from `theme.ts:233/251/652` and `server/__tests__/routes/post-template-site-serving.test.ts:58`. Its "two resolvers for one string will drift" lesson is **not lost** — the JSON-column tripwire section directly above already records the same lesson from the `isGeneratedThemePath` case.

### Rewritten
| Section | What changed |
|---|---|
| **HTML-format Pages render in the fallback shell** | **Its stated cause is now false.** It claimed "there is no per-page template selection anywhere in the system". There is: `templateChoice` is a real column (`platform/db/schema.ts:107`, `schema.postgres.ts:871`), threaded through `features/post/{post,repo.sqlite}.ts`, exposed at `contracts/headless/contracts.ts:53`, resolved by `features/theme/static-render.ts` (`resolveTemplate`, `isEligibleForTemplateBranch`, `resolveStaticTierPageShellFallback`), and surfaced in the Pages editor (`apps/admin/src/features/pages/rules.ts`). ADR-065 (Accepted 2026-09-03) landed in the same area. Whether the five pages still render in the fallback shell needs a live site, so the entry is **kept and marked `[UNVERIFIED 2026-09-06]`**, not closed. |
| **`content/themes/` vs `sites/` drift** | Re-ran the entry's own `diff -rq`. The drift is **wider** now and its shape changed: tracked ships `blog-post.html` / `blog-sidebar-template.html` / `page-shell.html` / `blog.html`; live has `listing-default.html` / `pages-default.html` / `posts-default.html` / `posts-sidebar.html` — ADR-065's naming convention was applied to `sites/` and never back to `content/themes/`. `theme.json` also disagrees: tracked has nine `pages` and **no `publishedPages` key**; live has eight `pages` (no `blog`) and `publishedPages: []`. Rewritten around the current measurement; the `nav.html` `variant:"tree"` case (the genuinely load-bearing one) kept. |
| **Footer dead links** | Marked **`[UNVERIFIED 2026-09-06]`**. The 2026-08-30 table came from curling a running `:3000`; the live `theme.json` now has an **empty** `publishedPages: []` and no longer lists `blog`, so the per-link statuses have certainly changed and could not be re-checked without a running site. The structural bug — the footer links unconditionally regardless of `publishedPages`, and an unlisted page 404s outright — is unaffected and kept as the actionable part. |

### Counts and paths corrected
| Claim | Measured 2026-09-06 |
|---|---|
| Admin skins: "`styles.css` defines 77 design tokens" | **94** custom-property declarations |
| Admin skins: "retrofit across 76 components" | **126** `.tsx` files (excluding tests) |
| Tailwind: "`apps/admin` has 27 deps" | **37** dependencies + **11** devDependencies; still zero `tailwind`/`radix`/`shadcn` |
| Tailwind: "the existing 4,687 lines / 541 selectors" | `apps/admin/src/styles.css` is **4,444** lines |
| `src/platform/db/__tests__/migration-manifest.test.ts` | `apps/website/src/platform/db/__tests__/…` (exists) |
| `src/platform/site-dir/resolve-workspace.ts:15-21` (2 occurrences) | `apps/website/src/platform/site-dir/resolve-workspace.ts` (line ref dropped — line numbers drift) |
| Security page: 7 credential-repo rows at `src/platform/db/sqlite/…` | all 7 verified present under `apps/website/src/platform/db/sqlite/…`; table repointed |
| File preamble: "cross-references to `src/…`" | now names `apps/website/src/…` / `apps/admin/src/…` and tells the reader to read a bare `src/…` in an older entry as `apps/website/src/…` |

### Kept verbatim
- **Theme marketplace (local fixture only)**, **Tailwind/shadcn rationale**, **JSON-column tripwire's three items** (all three explicitly latent and non-blocking; the regex, the trailing-comment blind spot and the `build.sourceDir` rule are unchanged in source), **First-run onboarding wizard**, **Security page**, **Deployment** (its own text already says the end-to-end deploy was not verified — that caveat is correct and stays), and the **assistant-dock form-corruption bug** (needs a live browser repro, explicitly out of scope here).

---

## Summary

**`development/todos.md`: 1720 -> 1377 lines (-343, -20%).** Zero `[x]` items remain (was 76); 291 open items; 4 entries carry `[UNVERIFIED 2026-09-06]`.

### Commits (all on `restructure/apps-website-phased`, each independently revertible)
| SHA | Pass |
|---|---|
| `df07b37c` | Pass 1 — top-of-file dated entries |
| `5e593ab4` | Pass 2 — Admin Section Spec Sweep + 2026-08-10 slice |
| `30288302` | Pass 3 — Active Working Items AW-1..AW-7 |
| `6528ed5a` | Fix — restore four sections pass 3 deleted by mistake |
| `af8d083a` | Pass 4 — Accomplish, ADR map, research backlogs |
| `210b3751` | Pass 5 — Master Build Inventory §1-§18 |
| `c71c5923` | Pass 6 — Master Build Inventory §19-§25 |
| `e99249e2` | Pass 7 — the tail sections |

### Everything left `[UNVERIFIED 2026-09-06]`
1. **Commerce Platform Crosswalk backlog** — its `other-repos/TODO.md` pointer resolves nowhere in the repo.
2. **§24 Architecture Tooling Evaluation** — the three competitor-findings files it rests on are absent.
3. **HTML-format Pages in the fallback shell** — its stated cause is disproved, but the symptom needs a running site to re-check.
4. **Footer dead links** — the live `theme.json` changed materially since the statuses were curled.

### Could NOT be verified from source (and were therefore left alone, not guessed at)
- Anything requiring a **running site or browser**: the four stale VRT baselines, the assistant-dock form-corruption bug, the deployment pipeline end-to-end, and both `[UNVERIFIED]` live-site entries above. Test suites were deliberately not run, per the dispatch.
- **The 13-item Agent capability surface backlog** — its `file:line` citations are to Directus/Strapi/Payload/WordPress, and settling the items would mean reading Jini's `ai-control-plane.md`. Only its evidence roots were confirmed to exist.
- **§21, §22 (AEO/GEO), §23, §25** — aspirational lists with no falsifiable claims about current source.
- **Whether `/code-inspection` or `/audit-work` ever actually ran** on SPEC-003/005/006 beyond what the pipeline ledgers record.
- Several §19/§20 parity items phrased as "not confirmed built" (scheduled publishing, private visibility, per-entry trash, term archives) — each would need a behavioral check rather than a source read.

### New gaps found while verifying (reported, NOT fixed)
1. **7 ADRs are absent from `ADR-INDEX.md`** — 053, 055, 056, 057, **059**, 063, 064. The index is the stated source of truth. (This became a new todo item in §18.)
2. **ADR-047 is live in production code but never reached ACCEPTED** — the widgets/embeds implementation shipped while `ADR-INDEX.md:54` still records "owes `/audit-work` before ACCEPTED".
3. **The core outbox has no backoff and no attempt cap.** `contracts/core/events/outbox-worker.ts:34` passes `now` as `nextAttemptAt`, so a failed event is immediately re-claimable, and nothing reads the `attempts` column it increments. A permanently-failing handler spins at 20 events/tick forever.
4. **A false code comment.** `server/runtime/composition/deps.ts:439-441` says "outbox + event bus remain in-memory for now … a durable outbox is a later …" while line 934 of the same file constructs `new SqliteOutboxAdapter(db)`.
5. **`apps/website/src/server/error-mapping/` is an empty promise** — one `INFO.md` declaring itself the home of "the canonical error envelope, status mapping helpers, and route-safe translation", with no code.
6. **ADR-065's template renaming was applied to `sites/` only.** Live `tovu-com` has `listing-default.html` / `pages-default.html` / `posts-default.html` / `posts-sidebar.html`; tracked `content/themes/static/basic/` still has `blog-post.html` / `blog-sidebar-template.html` / `page-shell.html`. Since `sites/` is gitignored, a reinstall or upgrade would restore the old names under a resolver that expects the new ones.

### One defect I introduced and fixed
Pass 3's edit helper spanned an `###` block to the next `###` without stopping at an intervening `##`, deleting four out-of-scope `##` sections. Caught before pass 4, restored byte-identically from `5e593ab4` (`diff` rc=0) in commit `6528ed5a`, and the helper was rewritten to stop at any same-or-higher heading before pass 4 ran.
