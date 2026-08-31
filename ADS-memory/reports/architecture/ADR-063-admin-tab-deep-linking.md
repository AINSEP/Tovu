# ADR-063: Admin Tab Deep-Linking — Path Segments for Sub-Resources, Query Params for View Modifiers

- Status: PROPOSED — report-only dispatch. No implementation exists; nothing here has been built or committed.
- Date: 2026-08-31
- Author: Claude Opus 5 (software-architect dispatch) / Leona Burime
- Supersedes: nothing.
- Relates: none in this directory name an existing tab-URL ADR — this is the first. The convention
  this ADR ratifies is already *partially* live in code (Deployment/Database/Security/Source
  Control/Settings/Media all ship `?tab=`) but was never written down as a decision, which is why
  Forms and Themes drifted to a different (no-URL) shape with nobody having chosen that on purpose.
- Pipeline note: this is a direct `<<SUBAGENT_DISPATCH>>` report, not a full ADS spec pipeline run.
  There is no upstream `spec.md`, no Coordinator Planning Preflight token, and no Constitution
  Compliance pass — those pipeline artifacts are N/A for this dispatch shape, not skipped. Everything
  else the Software Architect workflow asks for (pattern evaluation, quality tradeoffs, migration
  plan, re-evaluation triggers) is included below.

## Context

The owner's request, verbatim: tabs on admin pages should be deep-linkable, and specifically an
*agent* should be able to navigate straight to the Submissions tab for a named form
(`/admin/forms/contact-us`, which today has Fields/Submissions tabs with no URL for Submissions).
Two questions were asked: (1) inventory every tabbed admin screen and what deep-linking would cost
each, and (2) which URL paradigm is right — query param or path segment.

### The routing architecture actually in place

The admin router is generic and panel-declared, not a hand-written if-chain. Source:
`Jini/packages/admin/src/core/routing/rules.ts` (`matchRoute`) and
`Jini/packages/admin/src/core/manifest/types.ts` (`AdminPanel`/`AdminRoutePattern`). Each panel in
`apps/admin/src/panels.tsx` declares an id (= its URL segment) and an optional `routes: [{pattern,
view, agentPageId?}]` array. `matchRoute` splits the path into segments, finds the panel whose id is
segment 0, then matches the rest against the panel's patterns — literal segments match themselves,
`:name` captures one segment. **Query string is parsed but deliberately never part of matching**
(`rules.ts` file header, explicit design note) — it is passed through as `ctx.query`
(`URLSearchParams`) for a panel to read as it likes.

This matters for the decision below: path segments are a **first-class, already-agent-integrated
manifest concept** (`AdminRoutePattern`, walked by `buildAgentPageMap`). Query-string tabs are
**not modeled in the manifest at all** — `AdminPanel` has no `tabs` field. Every existing `?tab=`
screen invented its own convention by hand (see next section) with zero enumerability outside
reading that screen's own source.

### Ground truth: every tabbed admin screen, read from current source

| Panel (route) | Tabs | Where tab state lives today | Deep-linkable today? |
|---|---|---|---|
| **forms** — `/admin/forms/:formId` | Fields, Submissions | `useState<"fields"\|"submissions">("fields")` in `features/forms/hooks/use-form-editor.hooks.ts:109` — pure local state, never reads or writes the URL | **No.** Always opens on Fields. |
| **media** — `/admin/media` | All, Images, Videos, Media providers | `?tab=` — `panels.tsx:186` passes `ctx.query.get("tab")` into `<Media tabId=…>`; tab list in `hooks/use-media-tabs.hooks.ts` | Yes |
| **database** — `/admin/database` | Timeline, Restore points, Migrate forward | `?tab=` — `panels.tsx:688`, `resolveActiveTabId` in `Database.tsx:67` | Yes |
| **deployment** — `/admin/deployment` | Overview, Static Site, Full Site, Dockerfile, History | `?tab=` — `panels.tsx:746`; tab switch calls the **real app router**: `navigate(\`/deployment?tab=${id}\`, {replace: true})` (`Deployment.tsx:112`) | Yes |
| **source-control** — `/admin/source-control` | Providers (1 tab today — shell built for more) | `?tab=` — `panels.tsx:773` | Yes |
| **access-tokens** — `/admin/access-tokens` (nav label "Security") | Access Tokens (1 tab today) | `?tab=` — `panels.tsx:805` | Yes |
| **settings** — `/admin/settings` | 13 tabs: execution, instructions, notifications, privacy, appearance, language, mcp, media-providers, connectors, memory, external-mcp, skills, about | `?tab=` — `panels.tsx:857`, threaded into `SettingsDialogShell`'s `activeTabId` | Yes |
| **pages** — `/admin/pages` | Mine, Theme Pages | `?tab=themes` — but via a **second, independent idiom**: `features/pages/hooks/pages-tab-url.hooks.ts`, local `useState` initialized once from the URL + hand-rolled `window.history.replaceState` on change, deliberately bypassing the app's real `navigate()` (see next section for why) | Yes, but a different mechanism than the six above |
| **themes** — `/admin/themes` | Free / Premium / Marketplace (tier tabs) | `useState<string\|null>(null)` (`manualTab`, `Themes.tsx:380`) — local only, never touches the URL | **No** |
| **themes** — `/admin/themes/explore` (`routes: [{pattern: "/explore", view: "theme-explore"}]`) | N/A — not a tab, a distinct route already; has its own `?page=` query param selecting which theme file is open, via `theme-explore-url.hooks.ts` | Already path + query, working precedent for the hybrid rule | Yes |
| **workspace** — `/admin/workspace` | None. Confirmed by reading `Workspace.tsx` in full: one read-only summary + rename form, no tab strip. (The Aug-30 redesign commit changed its visual layout, not its structure — it was never tabbed.) | n/a | n/a |
| **agent-plugins** — `/admin/agent-plugins` | None. `render: () => <AgentPlugins />` is a `soon: true` placeholder with no backend (`panels.tsx:557-574`). No tab strip exists. | n/a | n/a |

Workspace and Agent Plugins were named in the dispatch as screens to check; neither is actually
tabbed today, so neither belongs in a tab-deep-linking migration — flagging this explicitly rather
than inventing tabs that don't exist.

### Two idioms already live for `?tab=` — and the codebase already reasoned through why

This is the single most useful piece of ground truth for the paradigm question, because it means
the "does a tab switch go through the real router" question has already been answered twice, in
opposite directions, on purpose:

1. **URL-as-source-of-truth** (Deployment, Database, Security, Source Control, Media, Settings): the
   panel has **no local tab state at all**. `panels.tsx` reads `ctx.query.get("tab")` and passes it
   straight through as a prop; the tab strip's `onChange` calls the app's real `navigate()`. Every
   tab switch is a genuine route change (`App.tsx`'s `routePath` memo recomputes, the panel
   re-renders with new props) — cheap here because these screens have nothing else stateful above
   the tab (no in-progress edit to preserve across the "leave and re-enter" React re-render).

2. **Local-state-mirrors-URL** (Pages, Themes' Explore file picker): the screen owns real
   `useState`, seeded once from the URL on mount, and pushes changes back with a hand-rolled
   `history.replaceState` that **deliberately does not call the app's `navigate()`**. `Pages.tsx`'s
   own comment on `pages-tab-url.hooks.ts` explains why: `navigate()` dispatches
   `jini:admin-navigate`, which "every mounted screen treats as a real navigation and re-renders
   on" — routing an in-page tab click through it "would make switching tabs look like leaving and
   re-entering the Pages screen for no reason." This is the right call specifically because Pages
   already eagerly fetches both tabs' data up front (`usePagesHook()` and `useThemePagesHook()` both
   run unconditionally) — the tab is pure display-layer chrome over data that's already there.

Forms' current state is idiom 2 minus the URL half: pure local chrome state, no persistence, no
data-fetch reason to avoid a real navigation — because unlike Pages, **Submissions is not
prefetched**. `FormSubmissions` and its `useWiredFormSubmissions` hook only run when the Submissions
tab is actually selected (`FormEditorMainPanel`, `FormEditor.tsx:875-879`). That's a real,
independent collection with its own fetch, its own pagination cursor, and its own drill-down
(`FormSubmissionDetail`, keyed on `selectedId` — itself a third, deeper, currently non-deep-linkable
piece of state, out of scope here but worth naming as the next layer down).

## Decision — the paradigm

**Path segments for a tab that is a distinct sub-resource with its own fetch. Query params for a
tab that is a display-layer filter/view over data the panel already has loaded. This is not a new
rule — it is the rule the codebase has already been following inconsistently, made explicit.**

Concretely:

- **Forms' Submissions tab becomes a real route**: `panels.tsx`'s `forms` panel gains a second
  pattern, `{ pattern: "/:formId/submissions", view: "form-submissions" }`, alongside the existing
  `{ pattern: "/:formId", view: "form-editor" }`. `/admin/forms/contact-us/submissions` is a URL
  Fields never has to know about.
- **The six existing `?tab=` screens are correct as-is and should not migrate to paths.** Their tabs
  are filters over one loaded dataset (Media's All/Images/Videos), fixed operational sub-panels with
  no independent data model of their own (Deployment's Overview/Dockerfile/History), or
  configuration sections of one settings document (Settings' 13 tabs). None of them fetch on tab
  switch the way Submissions does. Converting them to path segments would be nesting for its own
  sake — see the "route-table growth" counterweight below.
- **Pages and Themes are the two screens that need a decision, not just a label.** Pages already
  satisfies the letter of "deep-linkable" via its own `?tab=themes` idiom; leave it, because its own
  documented reason for existing (avoid a real navigation over already-loaded data) is sound and
  matches the query-param branch of this same rule — it does not need to be migrated to match the
  other six screens' *mechanism* (real `navigate()`) as long as the *URL shape* (`?tab=`) already
  matches. Themes' tier tabs (Free/Premium/Marketplace) should get the same `?tab=` treatment the
  other six use — filtering over an already-loaded, already-fetched theme catalog is exactly this
  rule's query-param case, and today it's the one screen with neither the query-param URL nor a
  documented reason to have skipped it.

### The decision rule an implementer applies to a new tab

Ask two questions, in order:

1. **Does selecting this tab trigger its own network fetch that the other tab(s) don't already
   make?** If yes → path segment. If the data is already sitting in memory regardless of which tab
   is showing → continue to (2).
2. **Would a user or an agent ever want to reach this tab without first landing on its sibling?**
   (Bookmark it, share it, have an agent jump straight there.) If yes → still worth a URL, but a
   query param on the parent route is sufficient and cheaper than a route-table entry.

Forms' Submissions answers yes to (1) — done, it's a path segment. Every other existing tab strip in
this codebase answers no to (1) and yes to (2) — `?tab=` is already right for them.

## Pattern Evaluation

| Candidate | Fit Band | Evidence Basis | Pros | Cons | Verdict |
|---|---|---|---|---|---|
| **Query param everywhere** (`?tab=submissions` on all tabs, including Forms) | Adequate | 6 of 8 tabbed screens already do this; zero new route-table entries | Cheapest to add to Forms today (one line in `panels.tsx`, mirroring Deployment); consistent with the majority convention | Understates Submissions as "a filter on the form editor" when it's a materially different fetch/dataset; **query params are invisible to `buildAgentPageMap`/the route manifest** — see Agent Discoverability below — so this is the worse choice specifically for the stated motivating use case | Rejected for Forms; kept for the other six |
| **Path segment everywhere** (retrofit Media/Database/Deployment/Source Control/Settings/Pages to `/admin/settings/privacy` etc.) | Poor | Settings alone would add 13 route-table entries for what is one settings document with 13 sections; none of these tabs independently fetch | Maximal manifest enumerability | Route-table bloat (45 panels, 13 route patterns today — Settings alone would roughly double the pattern count) for screens with no independent sub-resource; breaks the deliberate "avoid a real navigation over already-loaded data" reasoning `Pages.tsx`/`pages-tab-url.hooks.ts` already documented; nesting cost the team already flagged for itself (`panels.tsx:761-763`'s Source Control placement comment: "Deployment already carries five tabs — a sixth holding three sub-tabs would be two levels of nesting, which is exactly what that panel's own numbered-step redesign just paid to remove") | Rejected wholesale |
| **Hybrid — path for sub-resources with their own fetch, query for view filters** (this ADR) | Strong | Matches the two idioms the codebase already independently arrived at (URL-as-source-of-truth vs local-state-mirrors-URL) once Forms and Themes are corrected to follow the same rule everyone else already follows implicitly | Minimal migration (one screen, Forms, gains a route; one screen, Themes' tier tabs, gains a query param); each screen's mechanism already matches its own data shape; scales the route table only where a route is actually earned | Requires stating the rule explicitly so the next new tab doesn't reintroduce Forms' mistake — mitigated by this ADR itself plus a short comment at the `AdminRoutePattern`/`AdminPanel` call sites | **Selected** |

## Agent discoverability — the part that actually decides this

This is where the two paradigms stop being cosmetically different and start being functionally
different, and it's the reason path segments win for Forms specifically.

`page.navigate` (`@jini-ai/agentic`'s `PAGE_CAPABILITIES`, wired through
`apps/admin/src/lib/agent-pages.ts`) takes a **published page id**, never a URL. The allowlist behind
it, `ADMIN_AGENT_PAGE_PATHS`, is built by `buildAgentPageMap(ADMIN_PANELS, {defaultReachable:
true})` — a function that walks `AdminPanel.routes[]` and includes exactly the **param-free**
patterns as navigable destinations (`Jini/packages/admin/src/core/manifest/types.ts`'s own doc
comment on `AdminRoutePattern.agentPageId`: "Param-free pattern: the route becomes a published agent
destination... Pattern with params: the route is not a destination — an agent cannot supply the
id"). Detail routes needing an id today (`/posts/:id`, `/pages/:slug`, and — after this ADR —
`/forms/:formId/submissions`) are **all** excluded from that map by the same rule; an agent reaches
them by first calling a content-catalog tool for the id, then either clicking through the DOM
(`page.find_elements`) or the map growing param support later, exactly as `panels.tsx:855`'s own
comment on the Settings entry already anticipates ("`/admin/settings?tab=privacy` is... a page an
agent's `page.navigate` could be pointed at once that capability grows param support").

So neither `?tab=submissions` nor a path segment lets an agent one-hop navigate to Contact Us's
Submissions *today* — that gap is `page.navigate`'s param-free restriction, not a URL-scheme
question, and fixing it is a separate, larger decision than this ADR (extending
`buildAgentPageMap`/`page.navigate` to accept caller-supplied params, or adding a URL-construction
tool that composes `adminHref` from a route pattern the agent already knows). **But the two schemes
are not equally positioned for that fix to land on later:**

- A path segment is a **route-table entry that already exists as a structured object**
  (`AdminRoutePattern`) the moment it's added — `buildAgentPageMap` already knows how to iterate
  `routes[]`. Teaching `page.navigate` to accept a param for an existing pattern is an incremental
  change to a mechanism that already models the destination.
- A query-param tab has **zero representation in the manifest type**. `AdminPanel` has no `tabs`
  field; `matchRoute`'s own file header states outright that "query is parsed but never part of
  matching." Every `?tab=` screen today invented its valid-tab-id list ad hoc, in its own
  `resolveActiveTabId`/tab-array constant, with no shared type and no path any enumeration tool
  (`buildAgentPageMap`, a future `tovu introspect` extension, `capability_search`) currently walks.
  Making `?tab=` enumerable at all would mean inventing a second manifest concept from scratch, in a
  package (`@jini-ai/admin`) whose own file header calls avoiding exactly this kind of "three-file,
  invented-per-screen" duplication its central design goal.

Net: choosing the path segment for Submissions costs nothing extra today (an agent still reaches it
by the same two-hop click-through every detail route uses) and is the only one of the two schemes
that is structurally ready for the day `page.navigate` or `tovu introspect` grows param/manifest
support. Choosing `?tab=` for it would mean *also* inventing that missing manifest concept later, on
top of the schema-modeling work path segments get for free.

**Recommendation beyond this ADR's direct scope, stated but not decided here**: if agent one-hop
navigation to a specific form's submissions is wanted sooner than a general `page.navigate` param
extension, the smallest correct addition is a dedicated tool (e.g. `admin_page_url(pageId,
params)`) that resolves a param-carrying `AdminRoutePattern` the same way `buildAgentPageMap` already
resolves param-free ones, returning a URL for the agent to open rather than trying to make
`page.navigate`'s existing enumerable-id contract carry parameters it was explicitly designed to
exclude. This is a call for whoever owns the agent-tools registration workstream, not this ADR.

## Migration path

Sequenced from lowest to highest risk. Nothing here has been implemented.

1. **Forms — add the Submissions route.**
   - `panels.tsx`: `forms` panel's `routes` gains `{ pattern: "/:formId/submissions", view:
     "form-submissions" }` alongside the existing `{ pattern: "/:formId", view: "form-editor" }`.
     Matches `matchRoute`'s existing segment-count-based disambiguation exactly the way `collections`
     already does with `/:contentTypeKey/:entryId` + `/:contentTypeKey` (`panels.tsx:220-223`) — a
     precedented, low-risk shape, not a new capability for the matcher.
   - `panels.tsx`'s `forms.render(ctx)` switch gains a `case "form-submissions"`, passing
     `ctx.view`/an explicit `initialTab` prop into `FormEditor` instead of (or alongside) `formId`.
   - `FormEditor.tsx`: `useWiredFormEditor`'s local `tab`/`setTab` (`use-form-editor.hooks.ts:109`)
     is replaced by deriving the active tab from the route (the prop from step above), with
     `FormEditorTabStrip`'s `onTabChange` calling the app's real `navigate()` to
     `/forms/${formId}/submissions` or `/forms/${formId}` — the Deployment idiom, not the Pages
     idiom, since Submissions has its own fetch and there is no in-progress-edit reason to dodge a
     real route change. Because `key={ctx.params.formId}` stays constant across this route change
     (only the trailing segment differs), `FormEditor` does not remount when switching tabs — any
     in-progress Fields edits survive a trip to Submissions and back, same as today.
   - `FormsList.tsx` and anywhere else that already links to `/admin/forms/<slug>` are unaffected —
     they keep linking to the Fields view by omitting the trailing segment; nothing existing points
     at a URL this change removes.
   - Regression-test note (not written here, per report-only scope): a test asserting the current
     "Submissions tab always resets to Fields on reload" behavior will need to become "Submissions
     tab, reached via `/forms/:id/submissions`, survives a reload."

2. **Themes — add `?tab=` to the Free/Premium/Marketplace tier tabs**, matching the Deployment/
   Database idiom (`ctx.query.get("tab")` threaded through `panels.tsx`'s `themes` entry,
   `manualTab`'s `useState` replaced by the query value, tab-strip `onChange` calling real
   `navigate()`). Lower priority than (1) — not the screen the owner named — but the one clear gap
   left once Forms is fixed, and cheap given five other screens already show the exact pattern to
   copy.

3. **Nothing else needs to move.** The six existing `?tab=` screens (Media, Database, Deployment,
   Source Control, Security, Settings) and Pages' own `?tab=` idiom are already correct under this
   ADR's rule and need no change. Re-litigating them would be churn with no behavior change.

### What would break

- **Nothing currently links to `/admin/forms/:formId/submissions`** (it doesn't exist yet), so there
  is no existing bookmark, redirect, or agent-tool reference to break by adding it.
- **No existing test, link, or tool assumes Forms' Submissions tab has no URL** in a way that a URL
  appearing would violate — the current behavior (always opens on Fields) is a gap, not a contract
  anything depends on.
- The one thing to get right on implementation: `matchRoute`'s pattern list is order-sensitive only
  in that both patterns must have distinct segment counts (they do: 1 vs 2) — no ordering hazard, but
  worth a real test given `/:formId/submissions` where `formId` literally equals `"submissions"`
  would collide with nothing here (segment count still disambiguates: `/submissions` alone is 1
  segment, matches `{pattern: "/:formId"}` as `formId="submissions"`, the existing form-editor view —
  correct and unambiguous, but worth a stated test case since it's the kind of edge a reviewer should
  see named rather than discover).

## Re-evaluation triggers

- If `page.navigate` (or a successor tool) grows support for caller-supplied route params, revisit
  whether `ADMIN_AGENT_PAGE_PATHS`/`buildAgentPageMap` should also start enumerating `?tab=` values —
  at that point the query-param screens' invented-per-screen `resolveActiveTabId` lists should
  probably become a real `AdminPanel.tabs` manifest field rather than staying implicit, closing the
  enumerability gap this ADR identifies but does not fix.
- If Submissions grows a second independent sub-view (e.g., an Exports tab under Submissions, or
  the currently-non-deep-linkable single-submission detail view, `FormSubmissionDetail`'s
  `selectedId`, becoming addressable as `/forms/:formId/submissions/:submissionId`), re-run this
  ADR's two-question test on that new tab rather than assuming it inherits Submissions' own
  path-segment treatment automatically.
- If Security or Source Control's single tab (`access-tokens`, `providers`) grows a second tab and
  that second tab has its own independent fetch, apply the same rule rather than defaulting to
  `?tab=` out of habit because that's what the first tab used.
