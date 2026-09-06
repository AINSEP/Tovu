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

## Fix log

- **Placeholder batch (13 pages)** — wired `agentHandle="<sectionId>"` onto every bare `<Placeholder sectionId="X" />` call site in `panels.tsx` (skills, design-system, admin-appearance, plugins-marketplace, orders, products, subscriptions, billing, activity-log, import-export, notifications, trash, newsletter). Mechanical, additive, no DOM restructuring — the prop already existed on `Placeholder`/`ComingSoonNotice` from a prior "Batch 1" shared-component pass (`components/__tests__/agent-handle-batch1.unit.test.tsx`), just never threaded through from `panels.tsx`. Verified: `env -u TOVU_ADMIN_PASSWORD npx vitest run src/components/__tests__/Placeholder.unit.test.tsx src/components/__tests__/agent-handle-batch1.unit.test.tsx src/__tests__/unit/panels-render.unit.test.tsx src/__tests__/unit/app-plugins-route.unit.test.tsx` — 4 files, 95 tests, all green. Commit: (pending, see below).
