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
| `pages`, `posts` | **EXCLUSION LIFTED (2026-09-06, later the same day)** — the autosave-drafts feature landed (commits `05782b71`/`559655cb`/`a4b99c90`/`34694309`/`10efb899`) and its authoring agent stood down, so a fresh dispatch picked up exactly these directories once they were clean. Both are now **done** — see the table rows below and the Phase 5 section for the fix log. The zero/partial counts recorded below are the real BEFORE measurements from when this exclusion was written, kept as historical data rather than silently overwritten. |
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
| pages | Pages | `Pages.tsx`, `PageEditor.tsx`, `ThemePagesTab.tsx`, `ThemePageDetailsModal.tsx` | was 0 across all 5 files | **done** (exclusion lifted, see Phase 5) | — |
| posts | Posts | `Posts.tsx`, `PostEditor.tsx`, `PostTemplateModal.tsx` | was 21 (`PostEditor.tsx` only; `Posts.tsx`/`PostTemplateModal.tsx` were 0) | **done** (exclusion lifted, see Phase 5) | — |
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

## Handoff — what a successor should do next

**Not yet opened this session (real work likely needed):**
- `ai-assistant` (`AiAssistant.tsx`, 1052 lines) — the largest unaudited real screen left. Not opened due to size/budget; audit and tag it the same way as the other Tier-A screens in this report.
- `sites` (4 files), `collections` (3 files), `taxonomy`, `forms` (2 files), `users`, `deployment` (6 files), `source-control` (2 files), `access-tokens`/Security (3 files) — all recorded as "likely OK" from the pre-existing `agentHandle_uses` counts (8–50 each) but were **spot-check only, not read line-by-line**. Confirm each one's forms/dialogs/row actions are fully covered, not just "has some tags" — the `ConfirmDialog` gap this session found (9 screens missing it despite otherwise-good coverage) is exactly the shape of bug a partial-coverage screen can still hide.
- `media` (`Media.tsx`) — excluded this pass because it looked mid-flight at dispatch time; confirmed since landed clean (`04806e6b`). Worth a first real audit — `agentHandle_uses=23` from before this sweep, not verified complete.

**Explicitly off-limits, still real gaps — pick up once unblocked:**
- `menus` (`Menus.tsx`/`MenuEditor.tsx`, `agentHandle_uses=0`) — Leona's own uncommitted WIP as of this session.
- `seo` — another agent's live work as of this session; check its own final state before assuming it's incomplete.
- `pages`/`posts` — **excluded entirely** (2026-09-06 scope change): a separate agent owns finishing autosave-drafts in exactly these directories. Do not edit even after that lands without re-confirming scope; `posts` had a WIP autosave commit landing during this session already.

**Structural, cross-repo (not a Tovu-only fix):**
- Settings' 11 Jini-UI-mounted tabs (see above) — needs `agentHandle` support added inside `Jini/packages/ui`'s components, then a Jini rebuild. Do not attempt without explicit sign-off; this is exactly the kind of unscoped Jini change the house rules warn against.
- `AgentPluginDetailsModal`'s Close button belongs to `@jini-ai/ui/renderers`' `PreviewModalShell`, same class of gap, much smaller blast radius.

**FormData-shaped forms found and handled safely (attributes only, no restructuring, confirmed against the known hazard):** Comments' Settings form, Redirects' create-redirect form. No form was restructured in this sweep.

## Summary at handoff

45 nav pages total. Fixed and verified this session: dashboard, all 13 Placeholder-backed "soon" pages, database, roles, members, comments, widgets (4 files), recovery, workspace, integrations, redirects, plugins, agent-plugins (+ details modal), playground (verified no gap), payments, themes (main), settings (Tovu-owned parts) — **24 pages** newly fixed or confirmed complete, plus a systemic `ConfirmDialog` fix touching 8 more already-tagged screens. Analytics and Authentication were read and confirmed to have no interactive controls to tag. Excluded per dispatch: seo, menus, pages, posts (4). Not yet opened: ai-assistant, media, and 8 "likely OK" screens needing a real read-through rather than a grep-based assumption.

## Phase 3 — live verification (2026-09-06, via `https://localhost:5173/admin/`)

Driven with Playwright in a dedicated tab (never `:3000`, per the HTTP/1.1 hazard). `location.href`
asserted on every navigation. Grepping for the handle string was NOT accepted as proof — every check
below queried the live DOM for `data-agent-element`/`data-agent-role`/`data-agent-label` and, for a
sample, actually clicked or focused the real element:

- **Dashboard** (`/admin/`) — all 7 tags present (`dashboard-view-site`, 4 stat cards, `dashboard-all-posts`, `dashboard-change-theme`); confirmed `dashboard-stat-posts` resolves to the real `<a href="/admin/posts">`, not a wrapper.
- **Placeholder page** (`/admin/newsletter`) — `data-agent-element="newsletter"` present with `role="status"` and the expected label, on the live "coming soon" render.
- **Database** (`/admin/database`) — `database-filter-kind` resolves to the real `<select>`; **clicked** `database-filter-apply` for real (no error, form intercepted client-side as expected).
- **Roles** (`/admin/roles`) — `roles-create-name` resolves to the real input; **clicked** it. Verified the ABSENCE of any `roles-row-*` `RowMenu` handle is correct, not a bug: this dev DB's 4 roles are all built-in, and built-in rows render `—` instead of a `RowMenu` by design (`Roles.tsx`'s own `role.isBuiltin` guard) — confirmed by reading the live table (admin/editor/owner/viewer, all "Built-in").
- **Widgets** (`/admin/widgets`) — 9 tags found live including two real per-row handles (`widgets-row-<uuid>-edit`, `widgets-row-<uuid>-trash-or-purge`) against actual seeded widget rows, confirming `buildAgentListHandles` produces working handles against real ids, not just test fixtures.
- **Comments** (`/admin/comments`) — `comments-status-filter`, `comments-settings-enabled`, `comments-settings-save` all present and resolve to the real `<select>`/`<input>`/`<button>`.

## Phase 4 — successor session (2026-09-06, continued)

Scope: `ai-assistant` (never opened), `media` (never audited), and a real read-through of the 8
"likely OK" screens the predecessor only spot-checked by `agentHandle` count: sites, collections,
taxonomy, forms, users, deployment, source-control, access-tokens.

**ai-assistant** — never opened before this pass. Read in full (1052 lines). Every Tovu-owned plain
control now tagged: the admin-dock show/hide checkbox, the three `AdminByokKeyPanel` sub-components
(`AdminByokMigrationPrompt`/`AdminByokKeyFooter`/`AdminByokSettingsFooter` — all three already had an
**optional** `agentHandle` pass-through prop that neither `AiAssistant.tsx` NOR `SettingsUi.tsx`'s own
mount was passing; fixed here for `AiAssistant.tsx` only, flagging `SettingsUi.tsx`'s identical gap
below rather than touching a screen marked done), the daemon Restart/Check status buttons, and the
visitor tab's enable checkbox plus Save key/Test Key/Save settings buttons. **Structural, not fixed**:
`ExecutionTab`, `ByokProviderForm`, `ProviderChipGroup`, `SettingsDialogShell` (all `@jini-ai/ui`) have
zero `agentHandle` support in Jini — same class of gap as Settings' 11 Jini-mounted tabs. Verified: 61
tests green (`AiAssistant`/`AdminExecutionMode`/`AssistantDaemonRestart`/`VisitorCredentialForm`
suites), 0 lint errors. Commit: `978a7ca3`. Status: **done** (Tovu-owned surface).

**media** — never audited before this pass (landed via a different agent, `04806e6b`). Read in full
(1017 lines): every control was ALREADY correctly tagged except one — `MediaPurgeDialog`'s
`ConfirmDialog` had no `agentHandle`, the same systemic gap the predecessor found and partially fixed
elsewhere. Fixed. `media-providers` tab mounts `@jini-ai/ui`'s `MediaProvidersTab`, zero `agentHandle`
support — same structural Jini gap, not fixed. Verified: 28 tests green, 0 lint errors. Commit:
`935762a5`. Status: **done**.

**8 "likely OK" screens — real read-through, not a re-count:**

- **sites** (`Sites.tsx`, `AllSitesTab.tsx`, `CreateSiteOnboarding.tsx`) — read in full. One real gap:
  the empty-state's "New site" `<a>` link had no handle. Fixed. `CreateSiteOnboarding.tsx`'s Supabase/
  Custom vendor fields and the SQLite radio are permanently non-interactive by design (Postgres-at-
  creation is cancelled per standing decision) — correctly left untagged, matching the Authentication
  screen's own precedent. Commit: `273b43cb`. Status: **done**.
- **collections** (`Collections.tsx`, `CollectionEntries.tsx`, `CollectionEntryEditor.tsx`) — read in
  full. Two gaps: the entries list's "Collections" breadcrumb link, and `WidgetEmbedInsertControl`
  (`lib/widget-embed-extension.tsx`, shared with the off-limits `PostEditor.tsx`) never threaded its
  own optional `agentHandle` through to `WidgetAddControl`. Fixed both — the shared file's prop was
  added as a new optional field so `PostEditor.tsx`'s existing call site is byte-for-byte unaffected
  (confirmed via `tsc --noEmit`: zero new errors anywhere, including that file). `Collections.tsx`
  itself and its three dialogs (New content type / Edit fields / Lifecycle confirm) were already fully
  tagged. Verified: 297 tests green across all 15 collections + widget-embed suites. Commit: `273b43cb`.
  Status: **done**.
- **taxonomy** (`Taxonomy.tsx`) — read in full, 828 lines. No gap found — every form, `RowMenu`, and
  both `ConfirmDialog`s were already correctly tagged. Status: **done, confirmed**.
- **forms** (`FormsList.tsx`, `FormEditor.tsx`) — read in full, ~1000 combined lines including the
  field-attributes dialog and submissions detail view. No gap found. Status: **done, confirmed**.
- **users** (`Users.tsx`) — read in full, 887 lines. No gap found (the original spot-check's
  interactive-vs-tagged count heuristic flagged an 18-vs-17 delta; on a full read every real control,
  including both `ConfirmDialog`s and the reveal-toggle password fields, was already tagged — a false
  positive from the counting heuristic itself, not a real hole). Status: **done, confirmed**.
- **deployment** (`Deployment.tsx` + `OverviewTab`/`StaticSiteTab`/`FullSiteTab`/`DockerfileTab`/
  `HistoryTab`) — read in full, ~2000 combined lines, the largest feature in this sweep. Only two gaps
  in the entire feature, both in `StaticSiteTab.tsx`: the provider "Create a token" external link, and
  the completed-publish-run's live-site result link. Fixed. Verified: 100/100 `StaticSiteTab` tests
  green, 0 lint errors. Commit: `34a69401`. Status: **done**.
- **source-control** (`SourceControl.tsx`, `ProvidersTab.tsx`) — read in full. One gap: the same
  "Create a token" external-link pattern `StaticSiteTab.tsx` had. Fixed (commit `c84559e8`, bundled
  with the security fixes below since they landed in the same pass). Status: **done**.
- **access-tokens** / Security (`Security.tsx`, `AccessTokensTab.tsx`, `OtherCredentialsSection.tsx`)
  — read in full, ~1100 combined lines. **Real gap found**: the shared `TokenInputFields` component's
  token/accountId/username inputs had NO `agentHandle` at all — only the sibling `Name` field in the
  same component did, unlike the two other implementations of this identical pattern
  (`StaticSiteTab.tsx`'s `PublishCredentialFields`, `ProvidersTab.tsx`'s
  `SourceControlCredentialFields`), both of which already tag their token fields. Also found and
  fixed a Tier1-vs-Tier2 inconsistency: Tier 2's (`OtherCredentialsSection.tsx`) "Remove from Tovu"
  trigger buttons were already tagged (only the destructive Confirm *inside* the dialog is
  deliberately untagged, per that file's own doc comment on the boundary), but Tier 1's
  (`AccessTokensTab.tsx`) equivalent trigger was not — fixed for consistency. Every Cancel button
  across both tiers' four dialogs was also untagged with no documented reason (unlike every other
  screen in this admin, which tags Cancel) — fixed all four. Also fixed the "Create a token"/"Revoke
  it on…" external links and `OtherCredentialsSection.tsx`'s `DeepLink` ("Manage on…") control, which
  had none across all three of its render states (unconfigured placeholder, static, replaceable).
  **Deliberately left alone, confirmed correct**: the destructive Confirm/Remove buttons inside both
  tiers' native `<dialog>`s (Tier 1's `RemoveConfirmDialog`, Tier 2's `OtherCredentialRemoveDialog`),
  and `OtherCredentialReplaceableRow`'s disabled masked-value preview field — both are explicitly
  documented, deliberate security boundaries ("no agent read/act surface over a credential action"),
  not oversights, and were NOT touched. Verified: 300 tests green across all 10 security suites, 0
  lint errors. Commit: `c84559e8`. Status: **done**.

**ConfirmDialog outstanding-11 resolved**: re-audited the full repo-wide `<ConfirmDialog` list (21
call sites, confirmed via fresh `grep`). 14 already carried `agentHandle` before this pass. Of the
remaining 7: **6 are in off-limits files** (`App.tsx` — global shell chrome, not a nav page, flagged
as a bonus finding, not fixed; `posts/PostEditor.tsx`, `posts/Posts.tsx`, `pages/PageEditor.tsx`,
`pages/Pages.tsx` — excluded per dispatch; `menus/Menus.tsx` — Leona's own uncommitted work). **The
7th, `media/Media.tsx`'s `MediaPurgeDialog`, was the only one in scope** — fixed above. The "find and
fix the remaining 11" instruction in the dispatch appears to have overcounted; the actual remaining,
in-scope count was 1.

**Structural/cross-repo gap now also found on `settings/SettingsUi.tsx`** (not fixed — that screen is
marked done and off this pass's scope): it mounts the SAME `AdminByokMigrationPrompt`/
`AdminByokKeyFooter`/`AdminByokSettingsFooter` trio `AiAssistant.tsx` does, and its own call sites
(`SettingsUi.tsx:309,329,330`) also don't pass the optional `agentHandle` prop those three components
have always accepted. One-line-per-call-site fix, same shape as this session's `AiAssistant.tsx` fix —
flagging for a future pass rather than touching a screen the predecessor already marked complete.

### Live verification (2026-09-06, via `https://localhost:5173/admin/`)

Driven with Playwright in a dedicated tab, `:5173` only (never `:3000`), `location.href` and viewport
asserted on every navigation. Queried the live DOM for `data-agent-element`/`data-agent-role`/
`data-agent-label` and clicked/focused real elements — grep was not accepted as proof:

- **AI Assistant** (`/admin/ai-assistant`) — `ai-assistant-admin-dock-toggle` resolves to the real
  checkbox; **clicked** it and confirmed the dock opened. `ai-assistant-daemon-restart`/`-check-status`
  present on the Admin tab. Switched to the Visitor tab live (`ai-assistant-visitor-enable` checkbox
  present); `ai-assistant-visitor-save-key`/`-test-key` resolve to real buttons inside the Jini
  `ByokProviderForm`'s `apiKeyFooter` slot — confirming the slot-injection approach actually reaches
  the DOM, not just compiles.
- **Media** (`/admin/media`) — uploaded nothing (read-only per house rules); confirmed
  `media-tab-all`/`media-tab-images`/`media-tab-videos` all present and **clicked** through each;
  `media-upload-toolbar`/`media-upload-file`/`media-upload-alt`/`media-upload-submit` all resolve to
  real elements.
- **Security → Access Tokens** (`/admin/access-tokens`) — clicked
  `security-access-tokens-connect-source-control-github` to open its add form; confirmed
  `security-add-source-control-github-name`/`-token` both resolve to real inputs (the `-token` field
  is the actual fix — previously absent). GitHub's own form correctly omits `-username` (not one of
  its required/optional fields); clicked the Bitbucket row instead and confirmed
  `security-add-source-control-bitbucket-username` resolves too, proving `TokenInputFields`' per-field
  conditional gating renders correctly for both providers. Also confirmed
  `security-access-tokens-cancel-source-control-github` (one of the 4 newly-tagged Cancel buttons)
  resolves to a real button. Did not type a real value into any credential field or press Save
  (read-only interaction per house rules).
- **Sites** (`/admin/sites`) — confirmed the existing site card grid renders; did not drive the empty
  state directly (this repo's dev DB always has at least one site) but confirmed
  `sites-empty-new-site`'s sibling handles (`sites-create-name`, `sites-create-submit`) on the adjacent
  "New site" tab resolve correctly, confirming the `agentHandle` import/convention is live on this
  file.

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
- **ai-assistant** — full pass, see Phase 4 above. Commit: `978a7ca3`. Status: **done**.
- **media** — `MediaPurgeDialog`'s `ConfirmDialog` was the one gap; everything else already tagged. Commit: `935762a5`. Status: **done**.
- **sites** — empty-state "New site" link. Commit: `273b43cb`. Status: **done, verified by full read**.
- **collections** — breadcrumb link + `WidgetEmbedInsertControl`'s missing `agentHandle` pass-through. Commit: `273b43cb`. Status: **done, verified by full read**.
- **taxonomy, forms, users** — verified by full read, no gaps found. Status: **done, confirmed**.
- **deployment** — two external-link gaps in `StaticSiteTab.tsx`; every other file already fully tagged. Commit: `34a69401`. Status: **done, verified by full read**.
- **source-control** — one external-link gap in `ProvidersTab.tsx`. Commit: `c84559e8`. Status: **done, verified by full read**.
- **access-tokens / Security** — `TokenInputFields`' missing token/accountId/username handles (the session's largest real find), plus a Tier1/Tier2 trigger-button inconsistency and four untagged Cancel buttons. Destructive Confirm/Remove buttons and the disabled masked-preview field were deliberately left untagged — pre-existing, documented security boundaries, not oversights. Commit: `c84559e8`. Status: **done, verified by full read**.

## Summary at second handoff (2026-09-06, Phase 4 close)

All 8 previously-"spot-check only" screens are now verified by a full line-by-line read, plus
`ai-assistant` and `media` (the two screens never before opened/audited). Every nav page this sweep
was ever scoped to touch is now either **done** or **structurally blocked on Jini** (Settings' 11
tabs, `ai-assistant`'s `ExecutionTab`/`ByokProviderForm`/`ProviderChipGroup`/`SettingsDialogShell`,
`media`'s `MediaProvidersTab` — all `@jini-ai/ui` components with zero `agentHandle` support). Excluded
per dispatch and unchanged this session: `seo`, `menus`. `pages`/`posts` were unchanged AT THE TIME
this section was written but have since been fixed — see Phase 5 below. One new flagged-not-fixed
item: `SettingsUi.tsx`'s own mount of the `AdminByokKeyPanel` trio has the identical unpassed-optional-
prop gap this session fixed in `AiAssistant.tsx` — a one-line-per-call-site fix for a future pass,
not touched here since Settings is marked done.

## Phase 5 — `pages`/`posts` exclusion lifted (2026-09-06, later the same day)

The autosave-drafts feature (see the standing-draft commits named above) landed and its authoring
agent stood down with both directories clean, so a fresh dispatch picked up the real gap Phase 4's
predecessor had flagged but left untouched. Fixed across several concurrent passes on the shared
tree (commits below), each verified live at `https://localhost:5173/admin/` in a dedicated tab —
`location.href` and viewport asserted on every navigation, DOM queried for `data-agent-element`
rather than trusting a grep:

- **Pages.tsx** (list) — "New Page", per-row title/slug/menu handles (`buildAgentListHandles`,
  matching `Posts.tsx`'s own pattern), the delete `ConfirmDialog` (`agentHandle="pages-delete"`),
  and the tab bar (`containerHandle="pages-tab-bar"`, per-tab handles).
- **PageEditor.tsx** — the header/back-link, the title/slug fields and the public-site link, the
  template picker (both branches), the action row (status/publish/save/delete), the new standing-
  draft recovery banner (region + Restore/Discard buttons), the delete `ConfirmDialog`
  (`agentHandle="page-delete-confirm"`), and the view/device toolbar controls. Live-verified against
  a real (then-deleted) test page: typed a title, let the 3s autosave debounce fire, reloaded to
  confirm the recovery banner appears with a real Restore button that actually applies the
  recovered title into the field, then deleted the test page through the tagged Delete button and
  ConfirmDialog to leave the tree clean.
- **ThemePagesTab.tsx** / **ThemePageDetailsModal.tsx** — per-row publish-toggle handles, the
  details dialog's own region/Close button, and the slug-collision "Open {title}" link.
- **Posts.tsx** (list) — "New Post" and per-row handles, matching Pages.tsx's shape exactly.
- **PostEditor.tsx** — already carried 20 handles from the autosave-drafts pass itself (including
  the new recovery banner's Restore/Discard, already tagged when that feature landed). The one real
  gap found: its delete `ConfirmDialog` had no `agentHandle`, unlike `Posts.tsx`'s own
  `"posts-delete"` — fixed with `agentHandle="post-delete-confirm"`. Live-verified the same way as
  Pages: created a test post, opened the confirm dialog, confirmed both sub-handles
  (`post-delete-confirm-confirm`/`-cancel`) resolve to real buttons, then deleted the test post.
- **PostTemplateModal.tsx** — audited, zero gap to fix: fully delegated to Jini's
  `PreviewModalShell` (`@jini-ai/ui/renderers`), same structural "no `agentHandle` support upstream"
  gap as `AgentPluginDetailsModal`'s Close button and Settings' 11 Jini-mounted tabs — not fixable
  from Tovu alone.

Commits: `2202253d`, `56f6b46b`, `3ad87f39`, `f3579456`, `48bf42c8` (this list is not exhaustive —
several agents landed overlapping commits on this shared tree in the same window; see `git log --
oneline -- apps/admin/src/features/pages apps/admin/src/features/posts` for the authoritative
sequence).

**Known pre-existing issue, NOT introduced by this pass and NOT fixed** (out of scope — a structural
refactor, not a tagging gap): `PageEditor.tsx`'s top-level `PageEditor` function already exceeded the
cognitive-complexity ceiling (10 vs. the 9 allowed, `sonarjs/cognitive-complexity`) on the committed
baseline before any of this session's edits — confirmed by linting the pre-edit version from `git
show`. Flagging for whoever picks up complexity-ceiling cleanup next; adding `agentHandle` props did
not change this function's branch count.
