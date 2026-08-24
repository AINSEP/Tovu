# Admin → Jini Port Audit (2026-08-17)

Agent: CodeBase Analyzer (read-only). Repos: `/Users/la/Programming/Tovu`, `/Users/la/Programming/Jini`
(current branch `general-work`, HEAD `23400f4d`), spot-checked `/Users/la/Programming/Zana`.

## Sampling Notice

**Sampled:** `apps/admin/src/lib/api.ts` (2,873 lines) — full type-header region read (lines
1–400), full `api` object method inventory extracted structurally (186 top-level methods via
`grep`, offsets 1553–2873, i.e. the whole object). `Jini/packages/admin/src/core/ports/*` (18
files, 1,971 lines) and `core/transport/*` — read headers of `forms.ts`/`menus.ts`, full
`git log`/consumer greps for all. `Jini/packages/capability-providers/*` structure + `payments.ts`
full read. `Jini/ADS-memory/reports/jini-port/recon/r5b-consumers-matrix.md` (partial, ~40 lines).
Tovu `ADS-memory/reports/refactors/20260801-admin-ports.md` (full) and
`ADS-memory/.local-artifacts/handoff/20260801-184837-handoff.md` (partial, decisions/next-steps
sections). `apps/admin/src/features/commerce/Payments.tsx` (full, 121 lines). `apps/admin/src/features/*`
directory listing. Git branch/merge-base checks in Jini for `refactor/jini-admin-extraction`.

**Excluded (token budget):** the remaining ~2,400 lines of `api.ts` (type definitions for every
DTO — sampled representatively via the header region + port-file cross-checks rather than read
verbatim); the bodies of all 186 methods beyond their signatures (signatures + surrounding
one-line grep context were used to classify, not full implementations); `Jini/packages/admin/src/react/*`
and `/browser/*` (out of scope — brief confirmed these are the live-and-working half, not in
question); all 16 recon docs under `Jini/ADS-memory/reports/jini-port/recon/` except r5b (a much
larger, separate "OD engine → Jini" workstream, only relevant here as context for one finding
below); `Zana/` beyond a directory listing + dependency grep.

**Confidence:**
- Ports/transport dead-code claim (zero consumers): **High** — verified by grep across both
  `packages/` and `apps/` in Jini, and across `apps/admin/src` in Tovu, matched against `package.json`.
- `api.ts` method inventory and its mapping onto existing ports: **High** for the mapping (built from
  the port design doc's own table, cross-checked against current method names); **Medium** for the
  "generic vs entangled" judgment on methods not covered by that doc (deployment/execution/widgets/
  content-types/entries/taxonomy) — signatures were read, full bodies were not.
- Composio-percentage / architecture-risk claim: **High** — confirmed by `git log` (explicit
  extraction commit) and current directory listing.
- Zana capability-providers relevance: **Medium** — the package and its docstring are directly
  read; its actual design intent (whether it's meant to supersede or complement admin-port work) is
  inferred from one docstring citation and one partially-read recon doc, not confirmed with the owner.

---

## 1. Re-verification of the 2026-08-09 findings

| 2026-08-09 claim | Current status | Evidence |
|---|---|---|
| `Jini/packages/admin/core/ports/*` (~1,698 lines), zero consumers | **Confirmed, path corrected.** Now `packages/admin/src/core/ports/*`, **1,971 lines** (18 files, up from the ~12 implied). **Still zero consumers** anywhere in Jini or Tovu. | `grep -rl "admin/core/ports\|@jini-ai/admin/core" packages apps` (Jini) → empty; same in Tovu `apps/admin/src` → empty (see 62-file count below, all `/core` non-port imports) |
| `core/transport/*` (~273 lines, `createAdminClient`), zero consumers | **Confirmed.** Same zero-consumer result (transport is under the same `core/` barrel, same grep). | same greps |
| Tovu's `api.ts` imports nothing from `@jini-ai/admin` ports | **Confirmed, and the gap grew.** File is now **2,873 lines** (up from 1,819 at 08-01, then 2,870 at the "moments ago" recheck — stable). Zero `@jini-ai/admin` imports. | `grep -n "@jini-ai/admin" apps/admin/src/lib/api.ts` → no output |
| 62 files import `@jini-ai/admin` (7 `/core`, 41 `/react`) | **Reconfirmed.** 7 `/core`, 41 `/react`, and (new data) **2 `/browser`** — 50 of 62 accounted for by subpath; the remainder likely import the root/mixed subpaths. | `grep -rl "@jini-ai/admin/core\|/react\|/browser" apps/admin/src` |
| `refactor/jini-admin-extraction` branch status | **Merged into `origin/main`**, not abandoned. Local `main` ref is stale (points at the branch's own tip, 8 commits behind `origin/general-work`'s current HEAD) — that made it *look* orphaned; it isn't. | `git merge-base --is-ancestor origin/refactor/jini-admin-extraction origin/main` → true |
| `packages/admin/server/composio/*` ~5,709 lines, 63% of package | **STALE — resolved, not current.** Composio was moved **out of `packages/admin` entirely** into `packages/integrations/src/composio` (commit `e27fa91a`, "refactor(admin,integrations): move composio out of admin/server into integrations"). `packages/admin` has no `server/` directory at all now. Admin package total is **4,585 lines**; ports+transport (1,971) is now **~43%** of it, composio is **0%**. | `find . -iname "*composio*"` → all under `packages/integrations`; `find packages/admin -iname "*.ts" \| wc -l` region check |
| "CMS content panels explicitly ruled out" (posts/pages/widgets/taxonomy/collections/menus/seo/forms stay Tovu-only) | **STALE — reversed by the owner same-session, 2026-08-01, then partially executed.** The handoff records: *"The user overruled the original CMS/generic split: forms, SEO, menus, redirects, widgets, content-types, taxonomy should also move to Jini."* Two sub-groups were created: **(a) clean, ported already** — SEO/redirects/menus/forms (all four exist as port files today, confirmed on disk: `seo.ts`, `redirects.ts`, `menus.ts`, `forms.ts`). **(b) needs design first** — widgets, content-types, entries, taxonomy (closed unions need opening) — **not yet done**, no matching port files exist. **Posts/pages remain deliberately parked** — the Pages-vibecoding workstream is actively redefining what a Page is, and extracting that contract now would bake in a shape about to be replaced. | `ADS-memory/.local-artifacts/handoff/20260801-184837-handoff.md:88-100`; `ls packages/admin/src/core/ports/` |

**Net correction to the brief:** the brief's framing ("CMS content explicitly ruled out") describes
a decision that existed for part of one session and was then reversed in the same session. Four of
the eight reversed items already shipped. Don't re-state the original ruling as current.

---

## 2. `api.ts` method inventory (186 methods) classified by group

Existing port coverage cross-referenced against `Jini/packages/admin/src/core/ports/*` file names
and the 08-01 design doc's method table (which lists exact `api.ts` method names per port).

| Group | Methods (count) | Jini port status | Notes |
|---|---|---|---|
| Auth | `login`/`logout`/`me` (3) | **Ported** (`auth.ts`) | |
| Identity (staff users/roles/policies) | `listUsers…writePolicyPermission` (17) | **Ported** (`identity.ts`) | Explicitly NOT the same thing as "members" below — this is Tovu's own staff/admin table |
| Members (app end-users) | `listMembers`/`getMember`/`disableMember`/`requestMemberMagicLink` (4) | **Ported** (`members.ts`) | This is the "member management for the app's own end-users" the brief flagged as a Zana priority — the port already exists, unconsumed on both ends |
| Workspace | `getWorkspace`/`updateWorkspace`/`deleteWorkspace` (3) | **Ported** (`workspace.ts`) | |
| Settings | 4 methods | **Ported** (`settings.ts`) | |
| Media (core CRUD) | `listMedia`/`mediaOriginalUrl`/`uploadMedia`/`updateMedia`/`trashMedia`/`deleteMedia` (6 of the 18-method Media block) | **Ported** (`media.ts`) | |
| Media block, non-generic remainder | `getMediaProviders`/`saveMediaProviders`, `listExternalMcpServers`/`saveExternalMcpServer`/`deleteExternalMcpServer`, `getComposioConfig`/`saveComposioConfig`, `listConnectors`/`getConnectorStatuses`/`connectConnector`/`disconnectConnector`/`cancelConnectorAuthorization`/`getConnector` (12) | **Not ported, correctly** | These are AI-provider credentials, external-MCP-server config, and Composio connector wiring — Tovu-assistant-specific, not "media" in any generic admin sense despite living in the same `api.ts` block. Do not fold into `media.ts`. |
| Settings/Recovery/Database | `getDatabaseTimeline`…`executeMigrateForward` (6), Recovery (7) | **Ported** (`database.ts`, `recovery.ts`) | See §3 — these are admin **control-plane** ops (backups, restore points, migrate-forward on the CMS's *own* DB), not a data-access layer an end app defines its own schema against |
| Comments | 5 methods | **Ported** (`comments.ts`) | |
| Plugins | `listPlugins`/`setPluginEnabled` (2) | **Ported** (`plugins.ts`/`AdminExtensionsPort`) | Enable/disable toggle only — not a plugin *system* (install/discover/permission-grant). See §3. |
| Analytics | `listRecentAnalyticsHits` (1) | **Ported** (`analytics.ts`) | |
| Integrations (outbound webhooks) | 5 methods | **Ported** (`integrations.ts`) | |
| Menus | 5 methods | **Ported** (`menus.ts`) | Was "ruled out" per stale claim, actually shipped — see §1 |
| SEO | 6 methods | **Ported** (`seo.ts`) | ditto |
| Redirects | 6 methods | **Ported** (`redirects.ts`) | ditto |
| Forms | 7 methods | **Ported** (`forms.ts`) | ditto |
| Execution (agent detection) | `detectExecutionAgents`/`testExecutionConnection`/`testExecutionAgent`/`listExecutionModels` (4) | **Deliberately not ported** | `@jini-ai/ui-core`'s `features/execution/ports.ts` already has an equivalent `ExecutionPort` — documented absence, not a gap |
| Assistant/AI settings | `getAssistantSettings`…`deleteAdminExecutionCredential` (10) | **Not ported, correctly** | Tied to Tovu's own in-product AI assistant feature (daemon lifecycle, site/execution credentials) — Tovu-specific, not a generic admin concern |
| Posts | 6 methods | **Not ported — deliberately parked** | Pages-vibecoding workstream is redefining the content shape; extracting now bakes in a shape about to change |
| Pages | 5 methods | **Not ported — same reason** | |
| Presentation/Themes | `getPresentation`, marketplace/theme-file CRUD (11) | **Not ported, not evaluated in the reversed-scope list** | Not mentioned in the 08-01 CMS-scope reversal at all; likely out of scope by omission rather than decision — worth a explicit call, not assumed |
| Content-types | `listContentTypes`…`contentTypeLifecycle` (4) | **Design pending** | `CONTENT_TYPE_FIELD_KINDS` closed union (5 Tovu kinds) needs opening before a generic port can be written |
| Entries | `listEntries`…`entryLifecycle` (4) | **Design pending** | `EntryStatus` union needs the same treatment |
| Taxonomy | 10 methods | **Design pending** | |
| Widgets | 14 methods | **Design pending** | `AdminWidgetType` closed union (5 Tovu kinds) |
| Deployment/Publish/Source-control | `getDeploymentOverview`…`getDeployments` (18) | **Not ported, not in the reversed-scope list either** | Thin admin-client wrappers over Tovu server routes that already call the shared `@jini-ai/devops` package server-side (confirmed live: `src/features/deployments/*`, `src/server/app.ts`, `src/export/site-exporter.ts` all import `@jini-ai/devops`). The *server-side* deploy logic is already shared; only the *admin-panel* wrapper (Dockerfile-source editing, export/publish run polling, credential CRUD) is Tovu-only. Generic in concept, would need the Docker/single-container self-host assumption (see memory note on Tovu's deployment model) generalized or made optional. |

---

## 3. Zana priority check: payments, members, DB, plugins

The brief asks specifically about these because they're what Zana (the planned Lovable/Bolt-style
app-builder on Jini) needs for its generated apps' own backends. Findings, ranked by what actually
unblocks that:

### Payments — genuinely unbuilt in Tovu, and a *separate* Jini artifact is closer to the real answer
- `apps/admin/src/features/commerce/Payments.tsx` (121 lines) is a static, honest placeholder — its
  own header says *"Tovu does not yet expose an approved Commerce admin read model or money-movement
  operation, so this first slice ports [Open SaaS's] information architecture only."* Zero backing
  API methods exist in `api.ts` (no `payment`/`order`/`product`/`subscription` method appears in the
  186-method inventory above). The sidebar's "SOON" tags for Payments/Orders/Products/Subscriptions
  are accurate, not stale.
- **Separately, and not mentioned in the brief:** `Jini/packages/capability-providers/src/payments.ts`
  already defines a `PaymentsProvider` port (charge/getCharge/refund) with a **production-quality
  Stripe adapter** at `./adapters/stripe` and an in-memory reference stub. Its own header states it's
  *"named explicitly in `ADS-memory/reports/jini-port/recon/r5b-consumers-matrix.md` §3.3 as one of the
  capabilities Zana's and a fleet orchestrator's independent provider layers converge on (alongside
  auth/storage/db/realtime)."* This lives in `@jini-ai/capability-providers` (v0.1.2), a package
  **entirely separate from `@jini-ai/admin`**, built under a different, larger initiative ("OD engine
  → Jini" port for 4 consumers: OD, Open-Marketing, Tovu-Runner, Zana — see the recon docs at
  `Jini/ADS-memory/reports/jini-port/recon/`). It also has `auth.ts`+`visitor-auth/*` (a full
  end-user auth subsystem: definitions/lifecycle/ports/registry/tokens), `db.ts`+sqlite adapter,
  `storage.ts`+blob-storage adapter, `realtime.ts`+ws adapter.
- **Confirmed zero consumers**, on both sides: not imported by Tovu (`grep` for
  `capability-providers` across `apps/admin/src` and `src` → empty, not in `package.json`), and
  `Zana/` itself has no `package.json` yet — it's still docs-only (`AGENTS.md`, `TODO.md`,
  `app-chassis/`). The package's own docstring flags it as *"Speculative port-design exploration...
  no OD source."*
- **Scope-risk flag for the team lead:** this package already covers 4 of Zana's stated needs
  (payments, auth/members, db, storage) as speculative-but-real TypeScript interfaces with at least
  one production adapter each. Before porting Tovu's payment/member-adjacent `api.ts` methods into
  `@jini-ai/admin`, worth confirming with the owner whether `@jini-ai/capability-providers` is the
  intended vehicle for Zana's backend needs and `@jini-ai/admin` is meant only for the *admin panel
  UI* over those providers (two different layers, not competing implementations) — the two packages
  don't currently reference each other, so this isn't resolved anywhere in the code.

### Members (app end-users) — port done, unconsumed both ends
- `AdminMembersPort` (`members.ts`) exists, cleanly separated from staff `identity.ts` per the design
  doc's explicit reasoning. Zero consumers in Tovu or Jini. Lowest-effort win if the near-term goal is
  "prove the admin-port pattern end-to-end" — it's smaller (4 methods) than identity and already done.

### Database — the ported version solves a different problem than Zana needs
- `AdminDatabasePort`/`AdminRecoveryPort` cover **control-plane** operations on the CMS's own
  database: timeline, restore points, migrate-forward, disaster recovery. This is genuinely generic
  admin tooling (any host wants backup/restore), and it's done and well-designed (the `GatedOperation`
  correction in the 08-01 report shows real rigor here).
- It is **not** what a Zana-generated app needs, which is a data-access layer for *its own* schema
  (tables it defines, CRUD against them) — that's `capability-providers/db.ts` + the sqlite adapter,
  again a different package, same "not yet consumed by anything" status.

### Plugins — the ported version is a toggle, not a system
- `AdminExtensionsPort` is `listPlugins`/`setPluginEnabled` only — enabling/disabling an
  *already-installed* plugin. A real plugin system (discovery, install, sandboxing, permission grants)
  lives in `@jini-ai/plugins` (a separate, no-root-export namespace package per existing project
  memory), not evaluated in this pass — flagging that "plugins" in the brief's Zana-needs list maps to
  a different package than the one `AdminExtensionsPort` touches.

---

## 4. Prioritized port list

Ranked by what unblocks Zana's stated needs first, then generic-but-lower-priority.

1. **Do not duplicate payments/members/db/storage/auth work into `@jini-ai/admin`'s ports before
   resolving `@jini-ai/capability-providers`'s intended role** (see §3). This is a decision, not a
   port — raising it is the highest-priority action, ahead of any file to write.
2. **Port widgets/content-types/entries/taxonomy — the "needs design first" backlog from 08-01,
   still open.** These are the remaining pieces of the *already-approved* CMS-scope reversal (owner
   said yes to all 8, 4 shipped). Concrete next step, no new decision needed, ~32 methods
   (`apps/admin/src/lib/api.ts:798-921`, `:1041-1129`). Requires opening `CONTENT_TYPE_FIELD_KINDS`
   (5 Tovu kinds), `EntryStatus`, `AdminWidgetType` (5 Tovu kinds) as extensible unions, same pattern
   `AdminMenuTarget` already used (closed reference-implementation kinds + one open escape-hatch
   variant).
3. **Slice 3 from the 08-01 handoff: route-group factories (`createXRoutes(transport)`).** This is
   the actual blocker on *every* port having a real consumer — 18 port files with zero implementations
   wired to them is the root cause of the "dead code" finding, not a flaw in the ports themselves.
   Two known encoding obligations already documented in the port headers: `settings.value` (JSON) and
   restore's opaque token (Tovu sends `planId`+`planHash`, adapter must compose/split). Until this
   ships, item 2 (or any future port) adds to the same dead-code pile.
4. **Deployment/publish/source-control block (18 methods, `api.ts:1141-1320`+).** Medium priority —
   generic in concept (any host wants a deploy panel), and the server-side logic is *already* shared
   via `@jini-ai/devops`. Entangled parts to resolve before porting: Dockerfile-source editing assumes
   Tovu's single-container self-host model; the four static-publish targets (github-pages/vercel/
   netlify/cloudflare-pages) match `@jini-ai/devops`'s current provider set exactly, so the mapping is
   mechanical there.
5. **Presentation/Themes (11 methods, `api.ts:94-235`).** Not addressed by the 08-01 reversal at all
   (silent omission, not a decision) — worth an explicit yes/no from the owner rather than assuming
   either way.
6. **Composio/MCP/AI-provider-credential remainder of the Media block (12 methods).** Correctly
   excluded from `media.ts`; no action — these belong with Tovu's assistant feature, not a generic
   admin package.

## 5. Architecture risk: composio-crowding — resolved

The 08-09 claim that `packages/admin/server/composio/*` was 63% of the package and crowding out its
"admin" identity is **stale, not current risk**. Composio was relocated to
`packages/integrations/src/composio` (commit `e27fa91a`); `packages/admin` has no `server/`
subdirectory at all today. Current `packages/admin` is 4,585 lines total, and its largest component
is the ports+transport work (1,971 lines, ~43%) — itself currently zero-consumer dead code per §1,
which is the real risk in the package today: not identity-crowding, but a well-designed interface
layer with no adapters wired to it yet (see §4 item 3).
