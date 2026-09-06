# Admin nav agent-tag coverage audit — 2026-09-06

Scope: every panel in `apps/admin/src/panels.tsx`'s `ADMIN_PANELS` that carries a `nav` entry
(rendered via `getNav()` / `buildNav`), i.e. every page reachable from the admin sidebar. `id:
"appearance"` is the one panel with no `nav` entry (deliberate opt-out per `panels.tsx`'s own
comment) — routable but not a nav page, so it is out of scope for this sweep.

Convention confirmed by grep: `import { agentHandle } from "@jini-ai/agentic"`, then either
`{...agentHandle("kebab-id", { role: "button"|"field"|"link"|"region"|"status"|..., label:
"human-readable description" })}` spread onto a JSX element, or a plain `agentHandle="kebab-id"`
prop on library components that accept it directly (`RowMenu`, `Select`, `PlaceholderTabs`'
`ComingSoonNotice`'s own `agentHandle?` prop). Per-row handles use `buildAgentListHandles(prefix,
ids)` (`apps/admin/src/lib/agent-list-handles.ts`) so each row gets a distinct base.

`agentHandle_uses` counts are `grep -hoE "agentHandle(\(|=)"` occurrences across each feature
directory's non-test `.tsx` files — a coarse proxy for "how much of this screen is tagged", not a
per-element completeness proof. Rows marked **read-verified** were opened and checked element by
element; rows marked **grep-estimated** were not opened this pass and need a closer look before
being called done.

## Excluded / off-limits (per dispatch scope) — do not touch

| Page(s) | Why |
|---|---|
| `seo` (`features/seo/**`) | Another agent (`seo-tools`) is tagging this screen's per-entry fields right now. `agentHandle_uses=37` already — do not re-audit or touch. |
| `menus` (`features/menus/**`) | Leona's own uncommitted work (`MenuEditor.tsx` modified, `MenuEditor.hooks.tsx` new, both untracked/uncommitted as of this pass). `agentHandle_uses=0` on `Menus.tsx`/`MenuEditor.tsx` currently — real gap, but off limits until she lands it. |
| `pages`, `posts` | Do-last per dispatch; posts has a live autosave-drafts feature (`34694309 wip(posts): autosave recovery banner in PostEditor, state unverified` — landed as a WIP commit, not clean). `posts` already carries `agentHandle_uses=21` (`PostEditor.tsx`). `pages` is unaudited this pass. |
| `media` (`features/media/Media.tsx`) | Was mid-flight (git status showed it modified) at dispatch time; confirmed via `git log` it has since landed clean (`04806e6b feat(media): accept AVIF in the admin upload surfaces, with regression tests`). Not touched this pass to avoid crossing paths with whichever agent owns it (`avif-bridge`) — flagged for a future pass, not a hard exclusion. `agentHandle_uses=23`. |

## Out of scope (not a nav page)

- `features/auth/Login.tsx` — the pre-admin sign-in gate, not in `ADMIN_PANELS`/`getNav()`. Zero tags, real form (username/password/submit), but not "a page in the nav" by the dispatch's own reading of the task.
- `features/voice-input/**` — no panel id in `panels.tsx`; internal component, another agent's (`mic-button`) surface.
- `components/AssistantDock/**` — a global floating dock mounted outside any one panel, currently modified by another agent. Not a nav page's own file.

## Placeholder-backed "soon" pages — the ONE fix needed for all of them

`components/Placeholder.tsx`'s `Placeholder` and `ComingSoonNotice` both already accept an
**optional** `agentHandle?: string` prop and, when given one, tag their status `<div>` with
`role: "status"` — but every current call site in `panels.tsx` calls `<Placeholder
sectionId="..." />` **without** passing it, so these pages render completely untagged today even
though the plumbing exists. This is a single-file, mechanical, additive fix (pass
`agentHandle={sectionId}` per call site) — no DOM restructuring, no new component.

Affected panels (all `render: () => <Placeholder sectionId="X" />` in `panels.tsx`, no other
interactive controls on any of them):

| Panel id | Status before fix |
|---|---|
| `skills` | untagged |
| `design-system` | untagged |
| `admin-appearance` | untagged (also passes a `note`) |
| `plugins-marketplace` | untagged |
| `orders` | untagged |
| `products` | untagged |
| `subscriptions` | untagged |
| `billing` | untagged |
| `activity-log` | untagged |
| `import-export` | untagged |
| `notifications` | untagged |
| `trash` | untagged |
| `newsletter` | untagged |
| `agent-plugins` | renders a real component (`AgentPlugins.tsx`), NOT `Placeholder` — see Tier A below, not part of this batch |
| `payments` | renders a real custom component (`commerce/Payments.tsx`), NOT `Placeholder` — see Tier A below, not part of this batch |

## Coverage table — real screens

| Panel id | Nav label | Component(s) | `agentHandle_uses` | Status | Plan |
|---|---|---|---|---|---|
| dashboard | Overview | `Dashboard.tsx` | 0 | **read-verified**, gap | Stat cards + "All posts"/"Change" links + "View site" link are all plain `<a>` — none tagged. Add `role: "link"` handles. |
| sites | Sites | `Sites.tsx`, `AllSitesTab.tsx`, `CreateSiteOnboarding.tsx` | 12 | grep-estimated, likely OK | Spot-check only (budget) |
| ai-assistant | AI Assistant | `AiAssistant.tsx` | 0 | grep-estimated, gap | Not opened this pass — flagged for next agent |
| pages | Pages | `Pages.tsx`, `PageEditor.tsx` | 0 | excluded (do last) | — |
| posts | Posts | `Posts.tsx`, `PostEditor.tsx` | 21 | excluded (do last / WIP) | — |
| media | Media | `Media.tsx` | 23 | excluded (recently landed elsewhere) | — |
| collections | Collections | `Collections.tsx`, `CollectionEntries.tsx`, `CollectionEntryEditor.tsx` | 36 | grep-estimated, likely OK | Spot-check only |
| menus | Menus | `Menus.tsx`, `MenuEditor.tsx` | 0 | **excluded** (Leona's WIP) | — |
| widgets | Widgets | `WidgetsLibrary.tsx`, `WidgetRegions.tsx`, `WidgetRegionEditor.tsx`, `WidgetInstanceEditor.tsx` | 0 | grep-estimated, gap | Not opened this pass — 4 files, largest untagged real surface after Database/Roles |
| taxonomy | Categories & Tags | `Taxonomy.tsx` | 19 | grep-estimated, likely OK | Spot-check only |
| forms | Forms | `FormsList.tsx`, `FormEditor.tsx` | 34 | grep-estimated, likely OK | Spot-check only |
| users | Users | `Users.tsx` | 14 | grep-estimated, likely OK | Spot-check only |
| authentication | Authentication | `Authentication.tsx` | 0 | **read-verified**, no gap | All credential fields are permanently `disabled` by design (no backend yet — see file's own header) and there is no Save/Enable action. Nothing to operate; tagging the fieldset as a `role: "status"` region is optional polish, not a functional gap. |
| roles | Roles & Permissions | `Roles.tsx`, `Roles.hooks.tsx` | 2 | **read-verified**, gap | `RowMenu`s (role/policy row actions) ARE tagged. Untagged: create-role form (input+submit), create-policy form (2 inputs+submit), inline rename Save/Cancel buttons (both row kinds), the policy permission add-form (2 inputs+button) and its per-row Remove button, and `TabBar`'s `containerHandle="roles-tab-bar"` (already tagged — verify `TabBar` itself propagates it). |
| members | Members | `Members.tsx` | 1 | **read-verified**, gap | `RowMenu` tagged. Untagged: the email `<button>` that expands/collapses the detail row, and the disable `ConfirmDialog` (no `agentHandle` passed through). |
| comments | Comments | `Comments.tsx` | 0 | **read-verified**, gap | Fully untagged despite importing `agentHandle` (dead import). Untagged: status filter `<select>`, "Load more" button, `RowMenu` (no `agentHandle` passed), purge `ConfirmDialog`, and the entire Settings form (2 checkboxes, 4 number inputs, submit button) — an uncontrolled `<form>` + `new FormData(e.currentTarget)`, so only attribute additions are safe, no restructuring. |
| themes | Themes | `Themes.tsx`, `ThemeExplore.tsx` | 3 | grep-estimated, partial | Only `ThemeExplore.tsx` is tagged (per earlier full-repo grep); `Themes.tsx`'s own tab list/tiles not opened this pass. |
| skills | Skills | `Placeholder` | 0 | Placeholder-batch fix | See above |
| design-system | Design System | `Placeholder` | 0 | Placeholder-batch fix | See above |
| admin-appearance | Appearance | `Placeholder` | 0 | Placeholder-batch fix | See above |
| playground | Playground | `Playground.tsx` | 0 | grep-estimated, gap | Not opened this pass |
| plugins | Installed | `Plugins.tsx` | 0 | grep-estimated, gap | Not opened this pass |
| plugins-marketplace | Marketplace | `Placeholder` | 0 | Placeholder-batch fix | See above |
| agent-plugins | Agent Plugins | `AgentPlugins.tsx`, `AgentPluginDetailsModal.tsx` | 0 | grep-estimated, gap | Real component (not `Placeholder`) — needs its own tags, not part of the Placeholder batch |
| payments | Payments | `commerce/Payments.tsx` | 0 | **read-verified**, mostly no gap | Static, read-only "provider-neutral overview" — no forms/buttons found in the header section read; needs a full read to confirm no links/buttons further down the file before calling it done |
| orders | Orders | `Placeholder` | 0 | Placeholder-batch fix | See above |
| products | Products | `Placeholder` | 0 | Placeholder-batch fix | See above |
| subscriptions | Subscriptions | `Placeholder` | 0 | Placeholder-batch fix | See above |
| billing | Billing | `Placeholder` | 0 | Placeholder-batch fix | See above |
| database | Database | `Database.tsx`, `database-i18n.tsx` | 0 | **read-verified**, gap | Zero tags on a large real screen: Timeline filter form (select+3 inputs+submit), Timeline "View in Recovery →" per-row button, "Load more" button, Restore points "Create restore point" button, Migrate-forward's 4-step ceremony buttons (Plan/Confirm/Execute/Reset) — all untagged. `TabBar` itself has no `containerHandle` passed either (unlike Roles). |
| integrations | Integrations & API | `Integrations.tsx`, `IntegrationDeliveries.tsx` | 1 | grep-estimated, gap | Not opened this pass |
| recovery | Recovery | `Recovery.tsx` | 0 | grep-estimated, gap | Not opened this pass |
| deployment | Deployment | `Deployment.tsx` + 5 tab files | 50 | grep-estimated, likely OK | Well covered — spot-check only |
| source-control | Source Control | `SourceControl.tsx`, `ProvidersTab.tsx` | 8 | grep-estimated, likely OK | Spot-check only |
| access-tokens | Security | `Security.tsx`, `AccessTokensTab.tsx`, `OtherCredentialsSection.tsx` | 33 | grep-estimated, likely OK | Spot-check only |
| activity-log | Activity Log | `Placeholder` | 0 | Placeholder-batch fix | See above |
| import-export | Import & Export | `Placeholder` | 0 | Placeholder-batch fix | See above |
| settings | Settings | `SettingsUi.tsx`, `ExternalMcpSettingsPanel.tsx`, `ComposioKeyField.tsx` | 2 | grep-estimated, gap | Only `ExternalMcpSettingsPanel.tsx` carries tags; `SettingsUi.tsx`'s own tabs not opened this pass |
| workspace | Workspace | `Workspace.tsx` | 0 | grep-estimated, gap | Not opened this pass |
| notifications | Notifications | `Placeholder` | 0 | Placeholder-batch fix | See above |
| trash | Trash | `Placeholder` | 0 | Placeholder-batch fix | See above |
| seo | SEO & Metadata | `Seo.tsx` + 2 more | 37 | **excluded** (another agent, live) | — |
| redirects | Redirects | `Redirects.tsx` | 1 | grep-estimated, gap | Not opened this pass |
| newsletter | Newsletter | `Placeholder` | 0 | Placeholder-batch fix | See above |
| analytics | Analytics | `Analytics.tsx` | 0 | **read-verified**, no gap | Pure read-only `DataTable` of raw hits, no row actions, no buttons, no forms — nothing to operate. Tagging the table region is optional polish, not a functional gap. |

## Summary at first commit

- Total nav pages (excludes `appearance`, the no-nav opt-out): **45**
- Excluded/off-limits this pass (seo, menus, pages, posts, media): **5**
- In scope for this sweep: **40**
- Placeholder-backed pages needing only the one-line `agentHandle` prop fix: **13** (skills, design-system, admin-appearance, plugins-marketplace, orders, products, subscriptions, billing, activity-log, import-export, notifications, trash, newsletter)
- Read-verified real gaps found so far: dashboard, roles, members, comments, database (5)
- Read-verified, genuinely nothing to tag (all controls disabled / no controls exist): authentication, analytics, payments\* (2.5)
- Not yet opened this pass (grep-estimated only): ai-assistant, widgets, playground, plugins, agent-plugins, integrations, recovery, redirects, workspace, settings (main tabs), themes (main Themes.tsx)
- Believed already well covered from the pre-existing sweep, spot-check only: sites, collections, taxonomy, forms, users, deployment, source-control, access-tokens

Status will be updated in place as fixes land, with commit SHAs appended below.

- **plugins** — per-row enable/disable toggle. Commit: `d52258af`.
- **agent-plugins** — per-card Inspect button, spec-standard link, per-file selection buttons, Wrap toggle in the details modal. **Known gap**: the details modal's own Close button belongs to `@jini-ai/ui`'s `PreviewModalShell`, which has no `agentHandle` support — out of scope (Jini package). Commit: `d52258af`.
- **playground** — read-verified, no gap: a pure portal canvas with zero interactive controls of its own.
- **payments** — the three cross-links (Open products/subscriptions/orders) on this static Commerce overview. Commit: `98e3021c`.
- **themes** (main `Themes.tsx`) — View site, Rescan, tab bar, per-theme preview/Activate/Explore, per-marketplace-item Download. `ThemeExplore.tsx` was already tagged. Commit: `fb5a1909`.
- **settings** — Tovu-owned controls tagged: "Open as dialog" toggle, Composio key field (input/Save/Clear). `ExternalMcpSettingsPanel` was already tagged. **Major structural finding**: of the 13 tabs, 11 mount `@jini-ai/ui` components directly with zero `agentHandle` support (checked every one's source: `ExecutionTab`, `InstructionsTab`, `NotificationsTab`, `PrivacyTab`, `AppearanceTab`, `LanguageTab`, `IntegrationsTab`, `MediaProvidersTab`, `ConnectorsBrowser`, `MemorySettingsPanel`, `SkillsTab` — all 0 hits for `agentHandle`). Making Settings' actual field-level controls (execution mode radios, instructions textarea, notification toggles, language picker, connector cards, etc.) agent-driveable requires adding `agentHandle` plumbing to those 11 upstream Jini UI components plus a Jini rebuild — a cross-repo change outside this sweep's scope and outside the house rule against unscoped Jini edits. **This is the single largest remaining coverage gap on the entire nav** — recommend a dedicated follow-up task against `Jini/packages/ui`, not folded into a Tovu-only sweep. Commit: `7637876d`.

## Fix log

- **Placeholder batch (13 pages)** — wired `agentHandle="<sectionId>"` onto every bare `<Placeholder sectionId="X" />` call site in `panels.tsx` (skills, design-system, admin-appearance, plugins-marketplace, orders, products, subscriptions, billing, activity-log, import-export, notifications, trash, newsletter). Mechanical, additive, no DOM restructuring — the prop already existed on `Placeholder`/`ComingSoonNotice` from a prior "Batch 1" shared-component pass (`components/__tests__/agent-handle-batch1.unit.test.tsx`), just never threaded through from `panels.tsx`. Verified: `env -u TOVU_ADMIN_PASSWORD npx vitest run src/components/__tests__/Placeholder.unit.test.tsx src/components/__tests__/agent-handle-batch1.unit.test.tsx src/__tests__/unit/panels-render.unit.test.tsx src/__tests__/unit/app-plugins-route.unit.test.tsx` — 4 files, 95 tests, all green. Commit: `ab5f4b0f`.
- **database** — tagged the Timeline filter form (kind select, outcome/from/to inputs, Apply filters button), the per-row "View in Recovery →" button (per-row handles via `buildAgentListHandles`, looked up by row id since `DataTable`'s `cell` callback gets no index), Load more, Restore points' Create restore point, all four Migrate-forward ceremony buttons (Plan/Confirm/Execute/Reset), and the `TabBar`'s own `containerHandle`. Verified: `env -u TOVU_ADMIN_PASSWORD npx vitest run src/features/database/__tests__/Database.unit.test.tsx` — 50 tests green; `npx eslint src/features/database/Database.tsx` — 0 errors (2 pre-existing warnings, unrelated line). Commit: `79ade955`. Status: **done**.
- **roles** — `RowMenu`s were already tagged. Added: create-role form (name input + submit), create-policy form (name/description inputs + submit), both rename Save/Cancel button pairs (role rows and policy rows) plus their inline rename inputs, the policy permission add-form (permission/resource-type inputs + Add), and each policy's per-row permission Remove button. Verified: `env -u TOVU_ADMIN_PASSWORD npx vitest run src/features/roles/__tests__/Roles.unit.test.tsx` — 38 tests green; `npx eslint src/features/roles/Roles.tsx` — 0 errors (1 pre-existing warning, unrelated line). Commit: `a4efd9c2`. Status: **done**. Not tagged: `TabBar`'s own `containerHandle="roles-tab-bar"` was already present before this pass.
- **members** — email toggle-detail button and the disable `ConfirmDialog` tagged. Commit: `cbbda021`. Status: **done**.
- **`ConfirmDialog` systemic gap found and fixed** — `ConfirmDialog` (`@jini-ai/admin/react`) has supported an `agentHandle` base prop (publishing `-confirm`/`-cancel` sub-handles) all along, but a repo-wide `grep -rn "<ConfirmDialog"` found **21 call sites** and only the 2 just added in Roles/Members were passing it. Fixed 8 more in already-"likely OK" screens: Integrations (delete-webhook), Redirects (delete-rule), Taxonomy (delete-term, delete-taxonomy), Users (disable, reset-password), ThemeExplore (reset-file, rename-page, delete-file). Commit: `6e71742c`. Still outstanding (not fixed — in excluded files, or a global shell control rather than a nav-page element): `App.tsx`'s logout dialog (shell chrome, not one nav page — out of this sweep's stated scope, flagging as a bonus finding), and the dialogs in `posts/PostEditor.tsx`, `posts/Posts.tsx`, `pages/PageEditor.tsx`, `pages/Pages.tsx`, `menus/Menus.tsx`, `media/Media.tsx` (all excluded per the exclusions table above).
- **comments** — full pass: status-filter select, per-row `RowMenu` (per-page handle derivation via `buildAgentListHandles`), Load more, purge `ConfirmDialog`, and the entire Settings form (2 checkboxes, 4 number inputs, Save). The `agentHandle` import was dead before this — now used. Commit: `e804d16d`. Status: **done**.
- **dashboard** — all 4 stat cards, View site, All posts, and Change (theme) links tagged. Commit: `cdb205a5`. Status: **done**.
- **widgets** (all 4 files: WidgetsLibrary, WidgetRegions, WidgetRegionEditor, WidgetInstanceEditor) — every control across the whole feature: library header actions + per-row title/Trash-Delete, regions list header + per-row key/Manage, region editor's Save/back + per-placement enable/move/remove (via `WidgetAddControl`'s existing `agentHandle` prop for the add-widget picker), and instance editor's Save/back/title (via `WidgetConfigFields`' existing `agentHandle` prop for the type-specific config form). Verified: `env -u TOVU_ADMIN_PASSWORD npx vitest run` on all 4 component suites — 45 tests green; `npx eslint` — 0 errors (1 pre-existing warning, unrelated line). Commit: `c629c0e6`. Status: **done**.
- **recovery** — degraded-banner actions, per-row Restore button, disclosure-acknowledge checkbox, all three ceremony buttons, back-to-list button. Verified: 32 tests green, 0 lint issues. Commit: `a5dd5e09`. Status: **done**.
- **workspace** — name/slug inputs, Save changes, disabled Delete workspace button. Commit: `b5439d94`. Status: **done**.
- **integrations** — Add webhook/Cancel toggle, create form (3 inputs + submit), per-row label link. RowMenu/ConfirmDialog were already tagged. Commit: `be0f582a`. Status: **done**.
- **redirects** — create-redirect form (4 fields + submit, FormData-shaped — attributes only), bulk-import textarea + button, per-row lazy "Load hits" button. RowMenu/ConfirmDialog were already tagged. Verified: 60 hook tests green, 0 lint issues. Commit: `c08155f2`. Status: **done**.
