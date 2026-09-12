# Feature Spec: core-site-title

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-050 |
| version | 0.2.0 |
| status | APPROVED (owner, 2026-09-12) |
| content_hash | sha256:371678360d9b1eab9df4e005758ed8ea4203c0aefaec382a145c8be48960b02d |
| feature_name | FEAT-050-core-site-title |
| last_edited | 2026-09-12T00:00:00Z |
| owner | Leona Burime |
| spec_agent | Spec Agent |
| spec_mode | brownfield |

> **[NEEDS CLARIFICATION] vs Open Questions — use the right one:**
>
> **`[NEEDS CLARIFICATION]`** — inline marker for a requirement that is too ambiguous to be testable as written. Blocks Software Architect dispatch. Must be resolved before the spec advances.
>
> **Open Questions** — tracked questions that do not block Software Architect dispatch. Each must have an owner and a resolution target date.

---

## Overview

Replace the hardcoded public-site title literal `SITE_TITLE = "Tovu Demo Site"` with a per-workspace setting, `core.site.title`, that a site owner can set. Sites that exist when this ships must render exactly what they render today. The input to this spec is `ADS-memory/reports/2026-09-12-core-site-title-scoping.md` (commit `7756b400`). Every code claim below was re-verified against the working tree on 2026-09-12. Section "Corrections to the scoping report" lists where that report was wrong or incomplete.

---

## Problem Statement

**Current state.** Every site renders the same literal site title. It has exactly one definition, `apps/website/src/server/inbound/public-http/routes/site/pages.ts:174`, and eight render call sites:

- `pages.ts:1154`, `:1235`, `:1256`, `:1266`, `:1615`, `:1621`
- `routes/site/products.ts:94`, `:125`
- `middleware/theme-page-preview.ts:231`

An owner cannot change the title. Every new site's workspace record is named `"Local Tovu Workspace"`, no matter what name the user typed. Details are in the Evidence section.

**Desired state.** An owner can set a site title, and it renders everywhere the literal renders today. Sites that already exist render byte-identical output until their owner changes the title. A site with no owner-set title renders `Tovu Demo Site` if it is pre-existing (pinned), or its site display name if it is new (NC-1 = A, NC-2 = B; resolved 2026-09-12 — see Clarifications Required).

**Why now.** The owner ruled that this goes through a spec pass, not a quick fix. The blast radius is production `<title>` and visible site chrome. The obvious "register the setting now, wire it later" slice is a latent silent-flip defect (see Wiring Order). There is no external deadline.

**Success signal.** The Wiring Order tests (AC-10 through AC-13) pass in one commit, together with the per-surface title ACs.

---

## Evidence (verified against code, 2026-09-12)

### E1. Where `siteTitle` reaches the rendered HTML

"`<title>` today" is traced through code. It was not observed on a live server, because no local server was running when I probed.

| # | Surface | Route or entry point | `<title>` today | Evidence |
|---|---------|----------------------|-----------------|----------|
| S1 | Home with no published Page claiming `/` (or member access denies it) | `GET /` | `Tovu Demo Site` | `pages.ts:1599-1628` (home Page check, then entry-less `buildExtraHead(..., "home", SITE_TITLE)`). `page-head-contributor.ts:73-78` emits `{kind:"title", text: ctx.siteTitle}`. `render.ts:2709-2710` drops `pageShell`'s own `<title>` when the fold has one. On the static tier, `render.ts:2915-2920` and `:2604-2607` apply the same replacement. |
| S2 | Static-tier theme page with no backing post | `GET /:slug` | `Tovu Demo Site` | `pages.ts:1154`. Asserted today by `server/__tests__/routes/seo-site-serving.test.ts:179-183`. |
| S3 | Product grid and product detail | `GET /products`, `GET /products/:id` | `Tovu Demo Site` | `products.ts:94`, `:125` call `renderSite` with no `extraHead`, so `pageShell` renders `resolvePageTitle(route, …)` = `siteTitle` (`render.ts:2967-2968`, `:3012-3013`, `:2710`). |
| S4 | Templated-theme preview | `middleware/theme-page-preview.ts:228-243` | `Tovu Demo Site`, or `<post.title> — Tovu Demo Site` on the `post` route | No `extraHead`, so this uses the same `pageShell` path as S3 (`render.ts:2968`). The preview's post is `posts[0]` (`theme-page-preview.ts:205-206`). The ordering of that list is unverified. |
| S5 | Entry routes: posts and pages at `/:slug`, and `GET /` when a Page claims `/` | `pages.ts:1235`, `:1256`, `:1602-1606` | The entry's own title, via `titleTemplate` (default `%s`) | `seo.ts:209`, `seo/settings.ts:45`. **`siteTitle` is not in `<title>` here.** On the template branch, `pages.ts:846` injects `post.title`. |
| S5-fallback | Entry route where the SEO contributor throws | Same as S5 | `<post.title> — Tovu Demo Site` | `page-head.ts:170-175` swallows contributor errors, so the fold has no `<title>` and `pageShell` falls back to `render.ts:2968`. |
| B | Visible body text (not `<title>`) | Any route that renders these helpers | — | Header wordmark `render.ts:1420`. Footer `"<siteTitle> — powered by Tovu"` `render.ts:1643`. Back links `:1472`, `:1625`. Brand fallbacks `:1699`, `:1737`, `:1760`. Liquid/Handlebars `site.title` `:2385`. Slot title `<h1>` `:2458`. |
| X | Static export | `platform/export/site-exporter.ts:45`, `:555` | Inherits S1–S5 | The exporter boots the real `createApp` and fetches routes. It has no `SITE_TITLE` or `siteTitle` reference of its own (verified by grep). |

`og:title` never carries `siteTitle` today. The entry-less fold emits only `title` and `canonical` (`page-head-contributor.ts:75-78`). On entry routes, `og:title` is `ogTitle ?? resolved title` (`seo.ts:233`). `og:site_name` is always `undefined` (`seo.ts:238`).

### E2. Facts that constrain the "existing site vs new site" split

- **Workspace name is a placeholder on every starter-seeded site.** The seed uses `"Local Tovu Workspace"` (`server/runtime/configuration/seed.ts:44`, `content/templates/starter/seed-content.json:4`). `readTemplate` copies the seed workspace verbatim (`platform/site-dir/read-template.ts:77`).
- **The name a user types never reaches the workspace row.** `tovu init --name` and the desktop display name (`apps/desktop/src/site-dir-store.js:190`) are written only to `config.json` `name` (`platform/site-dir/init-site.ts:207`; the duplicate path `duplicate-site.ts:222`). Without `--name`, the name is the directory basename (`init-site.ts:88-89`). `config` is loaded at boot (`boot-site-dir.ts:43`). *Unverified:* whether it reaches the composition root.
- **`createdAt` is identical on every starter-seeded site:** `2026-04-06T00:00:00.000Z` (`seed.ts:46`, `seed-content.json:6`). It cannot tell old sites from new ones.
- **On a fresh database, migrations run before the seed** (`platform/db/sqlite/content-db.ts:86` vs `:93`). `seedContentDb` returns `void` and does nothing when the workspace slug already exists (`content-db.ts:138-163`). No "seeded in this boot" signal exists today.
- **A Postgres dialect exists alongside SQLite** (`platform/db/postgres/`, `platform/db/schema.postgres.ts`).
- **Workspace rename exists:** `PATCH /api/admin/v1/workspaces/:workspaceId` accepts `name` (`admin-http/routes/workspace/update.ts:11-16`, `:42`).
- **Route handlers can read the name at request time.** `RouteDeps.workspaceRepo` (`server/routes/types.ts:1290`) can do it, so the scoping report's "boot-context gap" only applies if the default is baked into the definition at registration.
- **Shipped `sites/tovu-com/content.seed.db`** (read-only query):
  - workspace `workspace-local` is named `Local Tovu Workspace`
  - a published `kind=page` row claims `/` with the title `Home`
  - the active theme is `basic`
  - `sites/tovu-com/themes/static/basic/theme.json:43` has `"publishedPages": []`

  By code trace, on that database S1 and S2 are normally unreachable and S3 is reachable.

### E3. Settings ledger facts

- **Resolution order.** `getEffective` resolves `user ?? workspace ?? global ?? default`. It returns `null` when no definition exists, and the user layer is read only when a `principalId` is passed (`Jini/packages/cms/src/settings/settings.ts:304-357`).
- **Definitions can be per-workspace, each with its own default.** Precedent: `site.seo.*` (`features/seo/settings.ts:111-133`). The global-scoped precedent is `core.presentation.activeThemeId` (`features/settings/migration.ts:115-133`).
- **Code can overwrite a `core` default.** `reconcileDefinitionDefault` rewrites a stored default only for `ownerKind: "core"` (Jini `settings/write-service.ts`, error text at `:903`). A site that relies on a `core` default can therefore change when code changes, which is why preserved sites need an explicit workspace-layer value.
- **Boot registration is fire-and-forget.** It runs as chained promises (`server/runtime/composition/app.ts:290-317`, `deps.ts:755-778`). The public route handlers in `pages.ts:1563-1628` and `products.ts:76-130` never await a readiness promise.
- **Public pages are cached** with `public, max-age=60, stale-while-revalidate=300` (`products.ts:33`, and the same header per `pages.ts:176-184`).
- **Once a definition is registered, anyone with settings access can write it** through the generic route `PUT /api/admin/v1/workspaces/:workspaceId/settings/value` (`admin-http/routes/settings/set.ts:76`). A reset route also exists (`routes/settings/reset.ts`). *Unverified:* the reset route's path.
- **Precedent for the pin-migration.** `migrateLegacyPresentationSettings` (`migration.ts:240-270`) registers only if absent, skips unchanged values, and catches, logs, and continues on each row. It attributes writes to the system principal `system-settings-migration` (`seed.ts:335`).

### E4. Corrections to the scoping report

1. **"Every page of every site renders `Tovu Demo Site`" is false.** Only S1–S4 and S5-fallback carry it in `<title>`. Entry routes (S5) render the entry's title.
2. **"`og:title` fallback" is false.** `siteTitle` never reaches `og:title` (E1).
3. **The report missed the body text.** `siteTitle` also renders as visible chrome and as template data `site.title` (row B). Preserving only `<title>` is not preservation.
4. **The report missed the name source.** `--name` and the desktop display name never reach `workspaces.name`, and `createdAt` is identical everywhere (E2).
5. **The report missed the readiness race.** Boot registration is fire-and-forget and public pages are cached. A request served between "definition registered" and "pin written" would render, and cache, the flipped title.
6. **The "boot-context gap" is narrower than stated.** A request-time read exists (`types.ts:1290`).

---

## User Journey

1. **Trigger:** A site owner wants their site's name in browser tabs, search results, and site chrome instead of "Tovu Demo Site".
2. **Steps:**
   1. The owner sets `core.site.title` for their workspace, through the generic settings route or an agent tool that wraps it. A dedicated admin field is out of scope (OQ-02).
   2. The owner reloads a public page that shows the site title.
3. **Outcome:** Every surface in E1 that showed `Tovu Demo Site` shows the owner's title. Entry titles (S5) are unchanged.
4. **Alternate paths:**
   - If the value is invalid, the write is rejected with a validation error and the previous title keeps rendering.
   - If the owner resets the value, the site renders the "no owner-set title" behavior for its tier: `Tovu Demo Site` if pinned (pre-existing), the site display name if not (NC-1 = A, NC-2 = B).
   - A cached page may show the previous title for up to 360 seconds (EC-06).

---

## Scope

**In scope:**
- A workspace-scoped `core.site.title` setting definition.
- A single title resolver that the E1 call sites read instead of the literal.
- A one-time preservation mechanism (pin-migration) for sites that exist when this ships (NC-1 = A).
- The "no owner-set title" behavior: `Tovu Demo Site` for pinned pre-existing sites, the site display name (falling back to `workspaces.name`) for new sites (NC-1 = A, NC-2 = B).
- Wiring-order guarantees and the tests that prove them.
- Updating `seo-site-serving.test.ts:179-183` to assert the resolved title.

**Out of scope:**
- A dedicated admin UI field for the site title (OQ-02).
- Changing entry-route titles or `titleTemplate` composition (for example `%s — <site title>`).
- `og:site_name`, JSON-LD `WebSite.name`, and any new head element.
- Changing `workspaces.name` or `config.json` `name` semantics (NC-2 option C was considered and not chosen; see Clarifications Required).
- Purging caches when the title changes.

---

## Requirements

- **REQ-01:** A setting `core.site.title` exists: namespace `core.site`, key `title`, schema string, workspace scope only.
  - Writes at global or user scope are rejected.
- **REQ-02:** Every render call site listed in the Problem Statement gets its site title from one resolver taking `workspaceId` instead of from `SITE_TITLE`.
  - This covers `pages.ts:1154, 1235, 1256, 1266, 1615, 1621`, `products.ts:94, 125`, and `theme-page-preview.ts:231`.
  - The resolved string reaches every S1–S4, S5-fallback, and B surface exactly where the literal reaches it today.
  - After this change, no module outside the resolver, the preservation mechanism, and their tests references the literal `Tovu Demo Site`.
- **REQ-03:** The resolver reads without a principal, so the user layer never applies to public renders. It returns, in order:
  1. the workspace-layer value, if one is set and valid;
  2. otherwise, `Tovu Demo Site` for a pinned pre-existing workspace, or the site display name for a workspace with no pin (NC-1 = A, NC-2 = B).
- **REQ-04:** *Preservation.* A workspace that exists when this ships, with no explicit `core.site.title`, renders every S1–S4, S5-fallback, and B surface byte-identical to the pre-feature output: `Tovu Demo Site`, via the pin-migration (REQ-06). (NC-1 = A, resolved 2026-09-12.)
- **REQ-05:** *New sites.* A workspace created after this ships, with no explicit `core.site.title`, renders its site display name from `config.json` `name`, falling back to `workspaces.name` when there is no site directory. (NC-1 = A, NC-2 = B, resolved 2026-09-12.)
- **REQ-06:** *Pin-migration.* For each workspace identified as pre-existing (per NC-3), the migration writes one workspace-layer value through the settings write chokepoint (`set`), never a raw repo write.
  - **Value:** the JSON string `"Tovu Demo Site"`: exactly 14 characters, no leading or trailing whitespace.
  - **Attribution:** actor `system-settings-migration`.
  - **Skip rule:** skip any workspace that already has a workspace-layer row in any state (`set` or `cleared`). An explicit owner action always wins.
  - **Runs once per database.** A later reset by the owner is never re-pinned.
  - Every pre-existing workspace gets the same value, because today's literal has one definition and no per-site variant (`pages.ts:174`).
  - **Pre-existing is identified by a schema-migration marker:** when `migrate()` runs, record the id of every workspace row that exists at that point; pin exactly those ids. (NC-3 = A, resolved 2026-09-12.)
- **REQ-07:** *No flip window.* No public response (S1–S4, S5-fallback, B) or static export may render a workspace's non-preserved title while that workspace's preservation is still pending. That includes before the boot chain completes and after a failed pin write. Architect chooses the mechanism, for example awaiting readiness or a render-time legacy fallback while pending.
- **REQ-08:** *Owner writes.* An owner-set value must be a string of 1..200 characters after trimming. The 200 mirrors `init-site.ts:49` for site display names and is proposed, not inherited. The stored and rendered value is the trimmed string. An invalid write is rejected and changes no stored or rendered value.
- **REQ-09:** *Degradation.* If the resolver's reads throw or return a non-string or blank value, the page still renders with HTTP 200 and a non-empty title. The title is the "no owner-set title" value for that workspace, or `Tovu Demo Site` if that value also cannot be resolved. Neither the settings read nor the name read may turn a public page into `<h1>Site error</h1>`.
- **REQ-10:** *Wiring order.* REQ-01, REQ-02, REQ-06 (if applicable), and REQ-07 land in a single commit. See Wiring Order for the only permitted split.
- **REQ-11:** *Observability.* The preservation mechanism reports counts of pinned, skipped, and failed workspaces, and logs each failed workspace id without aborting boot (precedent `migration.ts:77-84`, `:220-227`). Each pin appends an ordinary `op='set'` revision.

---

## Clarifications Required

All three items below were resolved by the owner (Leona Burime) on 2026-09-12. The options tables are kept as a record of what was considered; the chosen option is marked and carried into Requirements, Behavior Summary, Wiring Order, and Acceptance Criteria as unconditional behavior.

### NC-1 — What does a site with no owner-set title render? (the contradiction) — RESOLVED 2026-09-12: Option A

"Default to the workspace name" and "keep today's behaviour" cannot both hold with one default: today's value is `Tovu Demo Site` (`pages.ts:174`), and the name is `Local Tovu Workspace` (`seed.ts:44`).

| Option | Behavior | Consequence |
|---|---|---|
| **A. Two-tier** | Pre-existing sites are pinned to `Tovu Demo Site` (REQ-06). New sites default to "the name" (NC-2). | No existing site changes, and new sites get a name. Needs a durable pre-existing discriminator (NC-3), a pin-migration, and the REQ-07 race guard. This is the most machinery of the three. |
| **B. Preserve for everyone** | Every workspace defaults to `Tovu Demo Site`. No pin-migration and no discriminator. | Nothing renders differently anywhere, and the change is smallest. The register-without-wiring trap disappears, because the default *is* today's value. But "default to the workspace name" is dropped: new sites show the demo placeholder until the owner sets a title. REQ-06 and NC-3 become N/A. |
| **C. Name for everyone, announced** | Every workspace defaults to the name. No pin. Shipped as a deliberate, release-noted change. | Every existing site's S1–S4, S5-fallback, and B text changes on first render after deploy, to `Local Tovu Workspace` if NC-2 = A. This explicitly breaks "keep today's behaviour" and needs owner sign-off as a visible change. |

**Recommendation:** A, but only together with NC-2 = B. If NC-2 resolves to A, recommend B instead: under that combination, option A would spend a migration to replace one placeholder (`Tovu Demo Site`) with another (`Local Tovu Workspace`) on every new site.

**Decision (owner, 2026-09-12): Option A.** Pre-existing sites are pinned to `Tovu Demo Site` (REQ-06); new sites default to the site display name (NC-2 = B). This is the combination the recommendation calls for.

### NC-2 — What is "the workspace name" a new site defaults to? — RESOLVED 2026-09-12: Option B

| Option | Source | Consequence |
|---|---|---|
| **A. `workspaces.name`** | The workspace row | Every site created by `tovu init`, desktop "New Site", or duplication renders `Local Tovu Workspace` (E2). Only an admin rename changes it. |
| **B. Site display name** | `config.json` `name` (from `--name`, the desktop display name, or the directory basename). Falls back to `workspaces.name` when there is no site directory (in-memory, dev, and test boots). | New sites show the name the user typed. Needs the config name threaded from boot into the resolver; the path from `boot-site-dir.ts:43` to the composition root is unverified. The title can differ from the admin "workspace name" field. |
| **C. Fix the source** | Option A, plus seeding writes `--name` into the new site's `workspaces.name` | One source of truth. But it changes a second visible value (the admin workspace name) for new sites, and it touches init, duplicate, and desktop seeding, which goes beyond this feature. |

**Recommendation:** B.

**Decision (owner, 2026-09-12): Option B.** A new site's name is the site display name from `config.json` (falling back to `workspaces.name` when there is no site directory).

### NC-3 — How is a site that "exists when this ships" identified? — RESOLVED 2026-09-12: Option A

Rejected as discriminators: `createdAt` (identical on every starter-seeded site) and workspace name (identical). See E2.

| Option | Mechanism | Consequence |
|---|---|---|
| **A. Schema-migration marker** | When `migrate()` runs, record the id of every workspace row that exists. Fresh databases record none, because migrations run before the seed (`content-db.ts:86` vs `:93`). Pin exactly those ids. | Exact, and survives crashes and restarts, because a migration applies once per database. Needs a migration in both SQLite and Postgres dialects, plus somewhere to record the ids. |
| **B. "Seeded this boot" signal** | Pin every workspace row except the one `seedContentDb` inserted during this boot, then set a one-shot marker. | No schema change, but `seedContentDb` returns `void` today, so it needs new plumbing. If the process crashes between seeding and writing the marker, a brand-new site looks pre-existing on its next boot and is permanently pinned to `Tovu Demo Site`. |
| **C. Pin every row at first migration run** | No exception for new sites | Simplest, but a site created after ship already has its row when its first boot runs the migration, so it is pinned too. Every site renders `Tovu Demo Site`: NC-1 B with extra machinery. |

**Recommendation:** A.

**Decision (owner, 2026-09-12): Option A.** A schema migration records the ids of every workspace row that exists when it runs; only those ids are pinned. This needs a migration in both the SQLite and Postgres dialects (Dependencies table), and was the one item flagged "Ask before" (Agent Directives) — the owner's answer covers that ask.

---

## Behavior Summary

Resolved combination: NC-1 = A, NC-2 = B. The rejected alternatives (NC-1 = B or C; NC-2 = A or C) are recorded in Clarifications Required and are not built.

Fixture names: pre-existing site P; new site N created with `--name "My Site"` (the string used in `apps/desktop/src/site-dir-store.test.js:346`); owner-set title `Acme Field Notes`.

| Site | Renders |
|---|---|
| P, no owner title | `Tovu Demo Site` (pinned) |
| N, no owner title | `My Site` |
| P or N, owner set `Acme Field Notes` | `Acme Field Notes` |
| P, owner reset after pin | P's config name (owner-initiated) |
| Any site, entry route S5 | Entry title, unchanged |

---

## Wiring Order

**The trap.** Each way the pieces can land partially produces a defect that no single diff shows:

1. **Definition registered, no pin and no reads.** Nothing changes yet. The later wiring commit ("read the setting instead of the constant") silently flips every pre-existing site. The dangerous half and the triggering half sit in different commits.
2. **Definition and pin registered, no reads.** The generic `PUT …/settings/value` route (`set.ts:76`) accepts an owner's title and renders nothing: a silent no-op.
3. **Reads wired, no pin.** Pre-existing sites flip immediately.
4. **Everything wired, but the boot chain is not awaited.** Pre-existing sites flip during the boot window and CDNs cache the result (E4.5).

**Rule (REQ-10).** Definition registration, the call-site reads (REQ-02), preservation (REQ-06), and the race guard (REQ-07) land in one commit. No commit on the branch contains the `core.site.title` definition without all of the others.

**The only permitted split** (useful if the full commit proves too large):
- **Step 1:** Register the definition with default `Tovu Demo Site` for every workspace, and wire every call site. This is NC-1 B: zero rendered change, and owner writes work.
- **Step 2:** In one commit, add preservation (REQ-06, REQ-07) *and* change the no-owner-title value for non-preserved workspaces to the NC-2 name.

Step 2's default change must never land without its preservation.

**How tests prove it.** These tests must all exist in the same commit as the feature and be RED before it (Article II):

- **T-W1 (catches trap 1/3):** boot the real SQLite composition root on a database whose workspace row existed before the feature's migration or marker. Then run AC-10.
- **T-W2 (catches trap 2):** write through the generic settings route, then fetch every surface. Then run AC-11.
- **T-W3 (catches trap 4):** hold the settings boot chain open with an injected gated repo. Then run AC-12.
- **T-W4 (catches a Step-2 default change without preservation):** run AC-13.

A partial landing fails at least one of T-W1 to T-W4. Each surface is asserted separately, because the defect repeats per call site: eight call sites, with no shared helper today.

---

## Acceptance Criteria

Fixture notes:
- `createRouteDeps()` seeds workspace `workspace-local`, the post "Welcome to Tovu" at `/welcome` (`seed.ts:287`), and a Page "Home" claiming `/` (`seed.ts:310`).
- S1 therefore needs a fixture with no `/` Page.
- S2 uses `/pricing` with `publishedPages` flipped in memory, as `seo-site-serving.test.ts:163-165` already does.
- "Exactly one `<title>`" means `html.match(/<title>/g).length === 1`.

- **AC-01 (REQ-04) [P1]:** Given a pre-existing workspace with no owner-set title, when these are fetched, then each response contains exactly one `<title>` with this text:
  - `GET /` with no Page claiming `/`: `<title>Tovu Demo Site</title>`
  - `GET /pricing`: `<title>Tovu Demo Site</title>`
  - `GET /products`: `<title>Tovu Demo Site</title>`
- **AC-02 (REQ-04) [P1]:** Given the same workspace, when `GET /products` is fetched, then the body contains `<a class="wordmark" href="/">Tovu Demo Site</a>` and `<span>Tovu Demo Site — powered by Tovu</span>` (`render.ts:1420`, `:1643`).
- **AC-03 (REQ-02, REQ-04) [P1]:** Given any workspace, when `GET /welcome` is fetched, then the response contains `<title>Welcome to Tovu</title>`. When `GET /` is fetched with the seeded `/` Page, then it contains `<title>Home</title>`. Both are identical before and after this feature.
- **AC-04 (REQ-02, REQ-03) [P1]:** Given a workspace whose owner set `core.site.title` to `Acme Field Notes`, when `GET /`, `GET /pricing`, `GET /products`, and `GET /products/<id>` are fetched, then each contains `<title>Acme Field Notes</title>`, and `GET /products` contains `<a class="wordmark" href="/">Acme Field Notes</a>`.
- **AC-05 (REQ-02) [P1]:** Given the owner-set title `Acme & Co`, when `GET /products` is fetched, then the response contains `<title>Acme &amp; Co</title>`.
- **AC-06 (REQ-05) [P1]:** Given a new workspace with no owner-set title, created with `--name "My Site"`, when `GET /products` is fetched, then it contains exactly one `<title>`: `<title>My Site</title>`.
- **AC-07 (REQ-06) [P1]:** Given a pre-existing workspace, when the preservation mechanism has run, then `getEffective` for `core.site`/`title` without a principal returns `{ value: "Tovu Demo Site", sourceLayer: "workspace" }`, and exactly one `op='set'` revision exists for it, attributed to `system-settings-migration`.
- **AC-08 (REQ-06) [P1]:** Given a pre-existing workspace whose owner reset the pinned value, when the server restarts twice, then no new `op='set'` revision is appended by `system-settings-migration`, and the site renders its no-owner-title value.
- **AC-09 (REQ-06) [P1]:** Given a pre-existing workspace whose owner set `Acme Field Notes` before preservation ran, when preservation runs, then the value remains `Acme Field Notes` and the mechanism reports that workspace as skipped.
- **AC-10 (REQ-10, T-W1) [P1]:** Given a SQLite database created and seeded before this feature, when the real composition root boots and `GET /products` is fetched after the settings boot chain resolves, then the response contains `<title>Tovu Demo Site</title>`.
- **AC-11 (REQ-10, T-W2) [P1]:** Given a booted site, when `PUT /api/admin/v1/workspaces/workspace-local/settings/value` sets `core.site`/`title` to `Acme Field Notes`, then each of the following contains `Acme Field Notes` in its title, and none contains `Tovu Demo Site`:
  - `GET /`, with no `/` Page: `<title>Acme Field Notes</title>`
  - `GET /pricing`: `<title>Acme Field Notes</title>`
  - `GET /products`: `<title>Acme Field Notes</title>`
  - `GET /products/<id>`: `<title>Acme Field Notes</title>`
  - the templated preview on a non-`post` route: `<title>Acme Field Notes</title>`
- **AC-12 (REQ-07, T-W3) [P1]:** Given a pre-existing database and a settings boot chain held open, when `GET /products` is fetched before the chain resolves, then the response either contains `<title>Tovu Demo Site</title>` or has not been sent. It never contains the NC-2 name.
- **AC-13 (REQ-10, T-W4) [P1]:** Given the preservation mechanism disabled in the test harness and a pre-existing database, when `GET /products` is fetched, then the test fails. This proves AC-10 detects missing preservation and is not passing by coincidence.
- **AC-14 (REQ-08) [P1]:** Given each of `""`, `"   "`, and a 201-character string, when it is written to `core.site.title`, then the write is rejected with a validation error and `GET /products` still renders the previous `<title>`. Given `"  My Site  "`, when it is written, then `GET /products` contains `<title>My Site</title>`.
- **AC-15 (REQ-01) [P1]:** Given a global-scope or user-scope write to `core.site`/`title`, when it is submitted, then it is rejected and no revision is appended.
- **AC-16 (REQ-09) [P1]:** Given a settings repo whose read throws for `core.site`/`title`, when `GET /products` is fetched, then the status is 200 and the response contains exactly one non-empty `<title>`: the no-owner-title value, or `Tovu Demo Site`.
- **AC-17 (REQ-11) [P2]:** Given two pre-existing workspaces where the pin write throws for one, when preservation runs, then boot completes and the result reports `pinned=1`, `failed=[<that id>]`. The failed workspace still renders `<title>Tovu Demo Site</title>` (REQ-07).
- **AC-18 (REQ-02) [P2]:** Given the feature has landed, when the non-test source under `apps/website/src` is searched for the literal `Tovu Demo Site`, then it appears only in the resolver and preservation modules.
- **AC-19 (REQ-02) [P2]:** Given an owner-set title `Acme Field Notes` and a Liquid template that renders `{{ site.title }}`, when the templated preview renders it, then the output contains `Acme Field Notes`.

---

## Invariants

- **INV-01:** A pre-existing workspace with no owner action must never render any E1 surface differently from the pre-feature output, at any moment, including during boot and after a failed pin.
- **INV-02:** An explicit workspace-layer value (`set` or `cleared`) must never be overwritten by the preservation mechanism.
- **INV-03:** A public render must never resolve `core.site.title` through the user layer.
- **INV-04:** A public page must never render an empty `<title></title>` or more than one `<title>` because of this feature.
- **INV-05:** The `core.site.title` definition must never exist in a commit that lacks the REQ-02 reads (REQ-10).
- **INV-06:** Entry-route titles (S5) must never change because of this feature.

---

## Edge Cases

- **EC-01:** The owner renames the workspace or the site display name. Expected: an explicit or pinned title is unaffected. A site that uses the name default follows OQ-01.
- **EC-02:** A database holds several workspaces (created through admin `/workspaces`). Expected: per NC-3 = A, every workspace row present at migration time is pinned, including ones the public site does not render. That is harmless and keeps REQ-06 uniform.
- **EC-03:** An in-memory composition root (dev and tests) always seeds fresh. Expected: it is treated as a new site, and the fixture's expected titles follow AC-06. `seo-site-serving.test.ts:179-183` is updated to the resolved value, not deleted.
- **EC-04:** The SEO contributor throws on an entry route (S5-fallback). Expected: `pageShell` renders `<post.title> — <resolved title>`. For a pre-existing site that is `Welcome to Tovu — Tovu Demo Site`, unchanged.
- **EC-05:** A static export is taken during the boot window. Expected: the same guarantee as REQ-07, because the exporter fetches the real routes.
- **EC-06:** The owner changes the title while a CDN or browser holds a cached page. Expected: the old title may be served for up to 60 s plus 300 s stale-while-revalidate (`products.ts:33`). No purge is in scope.
- **EC-07:** The owner sets the title to exactly `Tovu Demo Site` on a pinned site. Expected: no rendered change; it appends one ordinary `set` revision.
- **EC-08:** A future code change edits the definition's default (`reconcileDefinitionDefault`, only if `ownerKind: "core"`). Expected: pinned and owner-set sites are unaffected, because the workspace layer wins. Only sites on the default move, which must be called out in that future change's review.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|---|---|---|---|
| `@jini-ai/cms/settings` (`getEffective`, `set`, `registerDefinitions`, `resolveDefinitionRaw`) | Definition, layered resolution, audited writes | A read throws or the definition is missing | REQ-09 degradation; the page never returns 500 |
| Composition roots' boot chain (`app.ts:290-317`, `deps.ts:755-778`) | Ordering for registration and preservation, avoiding the single-connection `BEGIN IMMEDIATE` hazard (`deps.ts` comment at `:764-769`) | Chain is slow or rejects | REQ-07 guard; `Tovu Demo Site` for pending pre-existing workspaces |
| Drizzle migrations, SQLite and Postgres (NC-3 = A) | Once-per-database pre-existing marker | Migration fails | Boot fails the same way any schema migration failure does today; no partial pin |
| Site `config.json`, falling back to `RouteDeps.workspaceRepo` (NC-2 = B) | The name for the no-owner-title value on new sites | Read fails | REQ-09 fallback to `Tovu Demo Site` |
| Page-head fold (`page-head.ts:165-188`) and `pageShell` (`render.ts:2709-2710`) | `<title>` emission and single-title suppression | Contributor throws | Existing EC-04 path |

---

## Open Questions

- **OQ-01:** Does the name-based default track renames (resolved at render time) or snapshot the name when the workspace is first seen? This spec proposes tracking; a render-time read is available (`types.ts:1290`). Owner: Leona Burime. Resolve by: 2026-09-19.
- **OQ-02:** Is a dedicated "Site title" admin field needed in this feature, or is the generic settings route plus agent tools enough for v1? Owner: Leona Burime. Resolve by: 2026-09-19.
- **OQ-03:** Should the definition be `ownerKind: "core"` (code-owned default, reconcilable) or `"site"` (operator-owned, like `site.seo.*`)? This is an Architect decision, bounded by EC-08. Owner: Software Architect. Resolve by: 2026-09-19.

---

## Constitution Compliance

| Article | Status | Notes |
|---|---|---|
| I — Library-First | COMPLIES | Uses the existing `@jini-ai/cms/settings` ledger; no custom store. |
| II — Test-First | COMPLIES | T-W1 to T-W4 and the per-surface ACs are RED before implementation (Wiring Order). |
| III — Simplicity Gate | COMPLIES | The resolver maps to REQ-02/03 and preservation to REQ-06 (built, per NC-1 = A). |
| IV — Anti-Abstraction Gate | COMPLIES | No new port; the resolver is a function over existing ports. |
| V — Integration-First Testing | COMPLIES | P1 ACs are asserted over HTTP against the real `createApp`; AC-10 against the real SQLite composition root. |
| VI — Security-by-Default | COMPLIES | No new endpoint. Writes go through the existing settings route's authz. The title is HTML-escaped on output (AC-05, `page-head.ts:226`). |
| VII — Spec Integrity | EXCEPTION (temporary) | `content_hash` not yet computed; the validator was not run under this dispatch's scope. Must be resolved before `/plan`. |
| VIII — Observability | COMPLIES | REQ-11 counts and logs; every pin is an audited ledger revision. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (049 is the highest existing number in `ADS-memory/specs/` and `ADS-memory/reports/pipeline/`)
- [x] version set
- [x] status APPROVED (owner, 2026-09-12)
- [ ] content_hash computed by the provider validator (not run: dispatch limited output to this file)
- [x] feature_name matches the folder name
- [x] Zero `[NEEDS CLARIFICATION]` markers (NC-1, NC-2, NC-3 resolved by the owner 2026-09-12; see Clarifications Required)
- [x] Open Questions have an owner and a date
- [x] REQs testable; every REQ has at least one AC; every AC has a priority and uses Given/When/Then
- [x] Invariants absolute; edge cases have expected behavior; Dependencies table complete
- [x] Constitution table complete
- [x] Scope in and out present; Why-now present; User Journey complete
- [ ] Companion package files (`spec-manifest.md`, `traceability.spec.md`, `spec-dod.md`, and `behavior.spec.md` for the precedence rules) not written: out of this dispatch's scope
- [ ] `reports/pipeline/050-core-site-title/pipeline-state.md` not created: out of this dispatch's scope
- [x] Brownfield evidence recorded (Evidence section; source report `ADS-memory/reports/2026-09-12-core-site-title-scoping.md`)

**Gate result:** CLARIFICATIONS RESOLVED. All three blocking clarifications (NC-1 to NC-3) are resolved and status is APPROVED. Still outstanding before `/plan`: package companions, pipeline state, and the validator-computed `content_hash` (out of this dispatch's scope).

---

## Agent Directives

Always:
- Treat Evidence line numbers as of 2026-09-12 and re-verify before editing.
- Assert per surface (S1–S4, B), never through one representative route.

Ask before:
- Changing `workspaces.name` or `config.json` semantics (rejected as NC-2 option C; out of scope unless a future spec revisits it).
- Adding the Postgres migration for the NC-3 pre-existing-workspace marker (resolved NC-3 = A; still confirm the migration's shape with the Architect before writing it).

Never:
- Commit the `core.site.title` definition without the REQ-02 reads, preservation (REQ-06), and the REQ-07 guard in the same commit.
- Delete the `seo-site-serving.test.ts:179-183` assertion. Update it to the resolved title.
