# Build brief: Admin "Import & Export" panel

Code base: `tovu-int` (branch `integration/2026-10-20`). Paths below are relative to `tovu-int/`.

## Goal (owner terms)
One admin screen under Operations where the owner gets a copy of the site out, or brings one in. It replaces
today's "Soon" placeholder. Almost all the machinery already exists. This job puts it in one place and adds
the only missing screen: backing up to a private Git repository.

## Owner rules (every lot)
- Generic code goes in Jini, site- or product-specific code in Tovu. This panel is Tovu-specific: the `.tovu.zip` format and Tovu routes.
- Plugins never import each other. Tools are generic by category; vendors are adapters (git hosts come from plugins via `source_control_get_capabilities`).
- Functions take `(requiredObj, optionalObj = {})`. Deps are injected as ports. React components get props only. Complexity ≤10 per function.
- 100% line/branch/function coverage per touched file, using DI fakes. No schema change is needed (if one turns up: ADR-066 TS migration, Drizzle is frozen).
- Make the smallest change that works and trim overbuild. Move "why" comments, never delete them. Add no new deps without saying why.
- Cap vitest at `--maxWorkers=2`. Leave no test processes running.

## What already exists (reuse, do not rebuild)
| Capability | Backend | Admin UI today |
|---|---|---|
| Whole-site `.tovu.zip` export: create, list, revoke, download | `apps/website/src/server/inbound/admin-http/routes/system/site-shares.ts:19-75`; tools `site_share_create/list/revoke` (`features/site-backup/tool-registrations.ts:183-205`) | **Built**: `apps/admin/src/features/sites/SiteExportTab.tsx` (Sites → "Export Site", owner 2026-10-18) |
| Import a `.tovu.zip` or share URL into a NEW site (verified in a sandboxed helper: `platform/db/sqlite/import-database.ts:13`) | `routes/system/site-imports.ts:13-80`; tools `site_import_backup`, `site_import_list` | **Built**: `apps/admin/src/features/sites/SiteImportTab.tsx` (Sites → "Import Site") |
| Port for both tabs | — | `apps/admin/src/features/sites/hooks/site-transfer-dependencies.hooks.ts`, `use-site-transfer.hooks.ts` |
| Back up to a private Git repo (plan, then push) | Tool handlers only, inside `features/site-backup/tool-registrations.ts` (~line 506 onward, plan-store, push-engine, push-jobs) | **None**, and no HTTP route either |
| Static HTML export | `routes/system/export-site.ts` (trigger + poll) | **Built**: Deployment → Static Site (`features/deployment/StaticSiteTab.tsx`) |
| Move the database to Postgres | `features/database-transfer/*` (chat-card tools `database_transfer_set_destination`, `database_transfer_run`) | Chat only, by design (secret form card) |
| Import media from a URL or file | `features/media-import/agent-tools.ts:105-130` | Media library / chat |
| Duplicate one entry | `features/content-duplication/agent-tools.ts:37` | Per-item. It belongs on Posts/Pages row menus, **not here** |

Panel entry: `apps/admin/src/panels.tsx` ~1017 (`id: "import-export"`, `Placeholder`, `soon: true`).
Tab idiom: `TabBar` + `resolveActiveTabId` with `?tab=` deep links (see `features/database/Database.tsx:13-14`, `features/sites/Sites.tsx:293-297`).

## Scope
IN:
- The panel shell with three tabs: **Export** (reuses `SiteExportTab`), **Import** (reuses `SiteImportTab`) and **Git backup** (new).
- A small "Other ways" strip: links to Deployment → Static Site (`/admin/deployment?tab=static-site`), to Database (Postgres move via the assistant) and to Media.
- Admin HTTP routes for git backup plan/push. They wrap the **same** functions the two tools call.
- Drop `soon: true`.

OUT:
- Content-level CSV/JSON export, WordPress import (todos.md §13, a separate future agent) and form-submission export.
- Any new archive format. Overwrite-in-place import: existing sites are never overwritten (current rule).
- Moving or removing the Sites → Export/Import tabs. The owner placed them on 2026-10-18; they stay unchanged unless the owner says otherwise (see Open questions).

## Lots
**L1: Tovu backend: git-backup HTTP routes (S)**
- Extract the plan and push handler bodies from `features/site-backup/tool-registrations.ts` into `features/site-backup/backup-service.ts`, exposing `planSiteBackup(required, optional)` and `pushSiteBackup(...)`. Tools call the service. Behavior does not change; the tool tests stay green.
- New `server/inbound/admin-http/routes/system/site-backups.ts`: `POST .../site-backups/plan` (the body is the tool's PLAN_SCHEMA) and `POST .../site-backups/push {planId}` (returns `inProgress` with progress, and the client polls by re-POSTing the same planId).
- Use the same permission as the tools (`PUSH_PERMISSION`), the same workspace 404, and `no-store`. Register it next to `registerAdminSiteShareRoutes` in `server/runtime/composition/app.ts`.
- Tests: route integration with a fake service (403, 404, 400 refusal codes, 200, inProgress), plus a unit test proving the service and tool parity.

**L2: Tovu admin: panel shell + reuse (S)**
- `apps/admin/src/features/import-export/{ImportExport.tsx,index.ts,import-export-i18n.ts,rules.ts}`.
- Tabs are `export|import|git-backup` with `?tab=` and `replace:true` navigation. Render `SiteExportTab`/`SiteImportTab` by exporting them from `features/sites/index.ts` (the index-only import rule).
- `panels.tsx`: `render: (ctx) => <ImportExport tabId={ctx.query.get("tab")} />`, `anyOfPermissions: ["system.read"]`, remove `soon`. Keep the existing "why" comment block.
- Add the "Other ways" link strip. Strings go in every locale the sibling i18n files carry.
- Tests: tab resolution rules, render per tab with injected hook fakes, nav entry no longer soon.

**L3: Tovu admin: Git backup tab (M)**
- Port `hooks/site-backup-dependencies.hooks.ts` onto the L1 routes. Controller hook `use-site-backup.hooks.ts` drives the states idle → planning → planned(summary) → pushing(progress poll every 2s) → done(commit link) | refused(code → plain message).
- Form fields mirror PLAN_SCHEMA: connection (read the saved source-control credentials through the existing Source Control port; do not add a new one), repository, branch (optional), folder (optional), include checkboxes.
- The plan summary shows repo, branch, folder, what is included, file count and size, and the skipped list. That summary is the confirmation; the user then clicks "Back up now".
- With no connection, link to the Source Control panel's form. Do not inline a credential form.
- Tests: controller state machine with a fake port (each refusal code, PLAN_EXPIRED → replan, inProgress loop, unmount stops polling), and markup snapshot-free assertions on roles/labels.

## Acceptance tests
- `/admin/import-export` renders three tabs, and `?tab=import` opens Import. The sidebar entry has no "Soon".
- Export/Import behave exactly as on the Sites page: the same component, so the existing tests pass unchanged.
- Git backup: planning against a fake host returns a summary, push shows progress then a commit link, and the `REPOSITORY_NOT_PRIVATE` refusal shows a readable message with nothing pushed.
- The `site_backup_plan`/`site_backup_push` tool tests pass unchanged after the L1 extraction.

## Needs a local Chrome look afterwards
Yes: the tab strip at 375px, Git-backup form layout and progress, dark theme, and keyboard order. A real push needs a private GitHub repo and the owner's saved GitHub connection, which can only be tested locally.

## Risks
- The L1 extraction touches a 1000+ line tool file. Keep it a pure move, preserving comments.
- The `site-backup.push` vs `system.read` gating differs per tab. A user without push permission should see Git backup disabled with a reason, not a 403 page.
- Duplicate entry points (Sites tabs + this panel) are deliberate until the owner decides.

## Open questions (owner)
1. Once this panel exists, should Sites → Export/Import tabs stay, or become links to Import & Export? Recommendation: link, later.
2. Should the Git backup tab offer "back up daily"? There is no scheduler for it today, so it is OUT unless asked.
