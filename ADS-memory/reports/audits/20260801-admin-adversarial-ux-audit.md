# Tovu Admin — Adversarial UX Audit

Date: 2026-08-01
Auditor: dispatched Sonnet 5 web-design/red-team subagent
Method: source read of `apps/admin/src/**` + a live isolated instance (own Node process on
`:3100`, in-memory DB). Screenshots at
`/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/b174133f-1774-4ac0-8ddd-3adeb616a125/scratchpad/shots/`.

**Isolation methodology, and why it changed mid-audit.** `/admin` on `:3100` redirects the browser
to the shared Vite origin (`:5173/admin/`, `admin-static.ts`'s documented dev-proxy behavior). Vite's
own `/api` proxy (`apps/admin/vite.config.ts:59`) defaults to `TOVU_API_URL ?? "http://localhost:3000"`
— the other agent's server, confirmed running against the real `content.db` (a 1.9 MB file, no
`TOVU_DB` override). Following the original setup instruction literally would have routed every
API call, including destructive ones, to the shared live database. Caught before clicking anything;
see the dedicated finding under "Cross-cutting patterns" — this is a real footgun in the dev
tooling, not just a note about my own setup. Fixed with a **fail-closed** Playwright
`context.route()` interceptor: known static/HMR paths pass through to `:5173` unchanged, known
data-plane paths (`/api/*`, `/agent-icons/*`) are rewritten to `:3100`, and anything unrecognized
targeting `:5173` or `:3000` is `route.abort()`-ed and logged loudly rather than silently let
through. **Verified, not assumed**: created a real post through the actual UI on `:3100`, confirmed
it exists there, then confirmed directly via `curl`-equivalent fetch (no browser involved) that it
does **not** exist on `:3000`; confirmed `:3000` rejects even a stolen `:3100` session-cookie value
with 401 (separate session stores, not just separate data); confirmed the browser's own
`/api/admin/v1/auth/me` resolves against `:3100`. Total requests aborted by the fail-closed
interceptor across the entire audit session (initial sweep + detail-route pass + interactive
tests): **zero** — the allowlist correctly covered 100% of real traffic shapes encountered, so
nothing had to be added reactively.

Scope note (per dispatch §6): `admin-makeover-canary` is concurrently restyling Posts, Media, the
sidebar, and the global design-token/button system. Nothing below is a visual/color/spacing finding
against those three surfaces — flow, logic, IA, copy, and accessibility findings against Posts and
Media are still included, since that work is untouched by the in-flight visual pass.

**Two audit passes, two different failure profiles.** The first pass covered the 26 nav sections'
list/settings screens. A second pass, added mid-audit at the user's request, covers the
detail/editor routes that sit *behind* those lists — `/posts/:id`, the four big editors
(`CollectionEntryEditor`, `FormEditor`, `MenuEditor`, `PostEditor`), and the smaller detail screens
(`WidgetInstanceEditor`, `WidgetRegionEditor`, `IntegrationDeliveries`). These are not in `nav.ts`
at all, are the largest/most complex files in the app, and where operators actually spend their
time. The two passes found genuinely different failure shapes: list screens mostly fail on
*missing* affordances (no delete, no confirmation); editor routes mostly fail on *bogus-input*
handling (an editor that renders as if a nonexistent record were real) and *unsaved-state loss*.
Kept in a dedicated section below rather than interleaved, so the distinction stays visible.

Status: **complete**. Written incrementally as the audit progressed rather than held to the end.

---

## Executive summary — worst things, ranked

Widened past a strict five once the detail-route pass landed two more blocker-tier, live-verified
findings that belong at the top rather than buried in a subsection.

1. **A bogus collection type renders as a real, empty, creatable collection — confirmed live, with
   a working "New entry" button.** `CollectionEntries.tsx:34`, `const label = contentType?.label ??
   props.contentTypeKey`, silently falls back to the raw URL segment when the type doesn't exist,
   and nothing ever checks for that case. Navigating to `/admin/collections/does-not-exist-12345`
   shows a breadcrumb, a heading, "No entries yet in does-not-exist-12345," and a fully clickable
   **New entry** button — indistinguishable from a real, legitimately-empty collection
   (screenshot: `shots/detail-collections-bogus-type.png`). Its own sibling screen,
   `CollectionEntryEditor.tsx:266`, gets this exact case right one click deeper (`if (!contentType)
   return <div className="notice error">Unknown content type "{key}".</div>`) — one file in the
   same feature has the guard, the other doesn't. This is the precise "editor silently presents
   itself as valid for a nonexistent record" data-integrity trap, and it's reachable by anyone with
   a typo'd bookmark, not just an attacker.
2. **There is no way to delete a post or page anywhere in the admin.** The server has a working
   `DELETE` route (`src/server/routes/admin/posts/delete.ts`), but `lib/api.ts` never calls it,
   and neither `Posts.tsx`, `Pages.tsx`, nor `PostEditor.tsx` expose any delete/trash control — the
   status dropdown only offers Draft/Published. Every post an operator creates is permanent from
   the UI's point of view. Confirmed the hard way: auditing empty states required clearing 9 seed
   posts through a direct, authenticated API call (`shots/empty-posts.png`,
   `shots/empty-pages.png`) because the UI itself offers no path to do it.
3. **`FormEditor.tsx` renders a fully live, saveable form under its own "not found" error.**
   `FormEditor.tsx:334`, `if (!isNew && !form && !error) return <Loading/>` — the guard only
   catches the *no-error-yet* case; once `error` is set, it evaluates false and the function falls
   through to the full edit form. A bogus form id shows *both* `"form definition 'X' was not
   found"` *and*, right below it, an empty Name/Slug/Fields editor with a live Save button
   (screenshot: `shots/detail-form-bogus.png`) — the exact bug class as #1, independently
   introduced in a second file via a differently-shaped bug (an inverted-guard logic error, not a
   missing guard).
4. **Destructive delete buttons are inconsistently guarded, and the inconsistency is silent.**
   `Comments`, `Integrations`, `Media`, `Menus`, and `WidgetsLibrary` gate their delete/purge
   actions behind `window.confirm` (or better). `Roles.tsx` (Delete role, Delete policy) and
   `Redirects.tsx` (Delete rule) fire the mutation on the very first click, no confirmation at all.
   An operator who has learned "delete asks me first" from five other screens will trust that
   pattern on Roles or Redirects and lose data with a single mis-click.
5. **`Dashboard.tsx` has no error handling at all.** Its two `useEffect` fetches (`listPosts`,
   `getPresentation`) have no `.catch()`. A failed request — expired session, 500, network blip —
   leaves the two stat cards showing `…` forever, with zero indication anything is wrong, on the
   very first screen every operator lands on after login.
6. **"Settings" is not settings — it's AI-assistant configuration, and there is no discoverable
   general site-settings screen at all.** `/admin/settings` (the sidebar's "Settings" row — the
   single most conventional, most-clicked nav item in any CMS admin) renders 13 tabs: Execution
   mode, Instructions, Notifications, Privacy, Dialog appearance, Language, MCP server, Media
   providers, Connectors, Memory, External MCP, Skills, About. Every one of these configures the
   embedded AI agent — none of it is site title, timezone, general options, or anything an operator
   would conventionally look for under "Settings." The screen that actually holds general
   site-scoped values (e.g. `core.presentation`'s `activeThemeId`) is `/admin/settings-raw` —
   labeled "Settings (Raw)," which reads as "a technical view of the same settings," not "the
   actual general-settings screen, entry gated by you already knowing the exact namespace string to
   type in (there is no listing endpoint — confirmed live: `settings-raw` has no browse/discovery
   UI at all, just a namespace text box)." An operator looking for "where do I set my site's title"
   has no discoverable path in this admin at all.
7. **No editor in the admin protects against navigating away from unsaved changes.** Confirmed live
   on a real post (`post-home`): edited the title, clicked the in-app "← Posts" link, no native
   `beforeunload` prompt, no custom dirty-state warning — the edit is discarded silently. Same
   pattern confirmed on `MenuEditor`. Every editor screen (`PostEditor`, `CollectionEntryEditor`,
   `FormEditor`, `MenuEditor`, `WidgetInstanceEditor`) tracks its own field state locally but none
   of them compare it against the loaded record to know they're dirty, so there's nothing to warn
   *with* even if a handler were added.
8. **Raw server error strings and internal permission-constant names reach the operator verbatim.**
   `request()` in `lib/api.ts` throws `body.error` straight from the JSON response with no
   translation layer by default (many screens add a per-code lookup table on top, but it's opt-in
   per screen and several don't bother). Concretely: `Users.tsx`'s Disable/Enable button title
   attribute is the literal internal action name (`"DISABLE_PRINCIPAL"`/`"ENABLE_PRINCIPAL"`) —
   permission-system implementation detail exposed as a tooltip, and it duplicates information the
   button's own label already states.

---

## Per-section findings

### Dashboard (`/admin`, `Dashboard.tsx`)

- **Blocker** — No error handling on load. `api.listPosts()` and `api.getPresentation()` are
  called with `.then()` and no `.catch()` (`Dashboard.tsx:11-15`). A rejected promise is an
  unhandled rejection; `postCount`/`themeId` stay `null` forever and the cards show `"…"`
  indefinitely. **Cost**: an operator whose session has quietly expired, or who hits a real 500 on
  this very common code path, sees a permanently-loading dashboard with no error, no retry, no
  explanation — indistinguishable from "still loading" no matter how long they wait. **Fix**: add
  `.catch()` on both calls, set an error state, and render a real error notice (matching every
  other screen's `notice error` convention, which this screen alone skips).
- **Minor** — "Your public site is live." (`Dashboard.tsx:38`) is asserted unconditionally, never
  checked. If the public site is actually down, the admin's own front page tells the operator
  otherwise. **Fix**: either verify with a lightweight health check, or soften the copy to
  something that isn't a factual claim ("View your public site ↗").
- **Minor** — No welcome/setup guidance for a brand-new, empty workspace. `postCount: 0` renders
  identically to "you have posts but happened to publish none," with no "get started" nudge. Not
  severe (an operator who just installed Tovu can find Posts via the sidebar), but a missed
  opportunity on the one screen every new install's owner sees first.

### AI Assistant (`/admin/ai-assistant`, `AiAssistant.tsx`)

This screen is good and should be treated as a reference pattern, not just audited. One line only:
save-immediately-on-toggle with the switch re-rendering from the server's response (never the
optimistic value), a public roadmap of what is *not* built rather than hiding the gaps, and a
disabled-with-explanation pattern for not-yet-shippable controls (`AiAssistant.tsx:74-96`). No
findings here worth the space — see it cited under "Workspace" and the cross-cutting section as
the standard other screens should match.

### Recovery (`/admin/recovery`, `Recovery.tsx`)

- **Nit** — Positive callout, not a defect: the restore ceremony's disclosure panel
  (`Recovery.tsx:108-161`) — plan → confirm → execute, an explicit loss-window disclosure the
  operator must read and acknowledge before "Continue" even enables, and an honest `"unknown"`
  count that is never conflated with a verified zero — is the strongest destructive-action pattern
  in the app. This is what Roles/Redirects' bare-click deletes should look like at the top end of
  the spectrum (not every delete needs this much ceremony, but every one should use least
  `window.confirm`; see cross-cutting §1).
- **Minor** — inconsistency, not a bug: `Database.tsx`'s "Migrate forward" ceremony is the same
  three-step plan/confirm/execute shape but with only prose warnings, no equivalent disclosure
  panel or acknowledgement checkbox. A schema migration is lower-stakes than a full data restore,
  so this may be a deliberate proportionality call — flagging in case it wasn't.

### Workspace (`/admin/workspace`, `Workspace.tsx`)

- **Nit** — Positive pattern: "Delete workspace" is shown, not hidden, always disabled, with a
  `title` explaining exactly why (`Workspace.tsx:117-119`) — "exists, guarded, not reachable yet"
  instead of a control that looks live and silently no-ops. This is the correct shape for a
  disabled button and should be the house style (cross-referenced in cross-cutting §3).

### Redirects (`/admin/redirects`, `Redirects.tsx`)

- **Major** — "Delete" (`Redirects.tsx:347-355`) fires `removeRule.mutate(rule)` on the very first
  click. No `window.confirm`, no undo, no indication the underlying operation
  (`tombstoneRedirect`) might even be a soft delete. **Cost**: a fat-fingered click on a redirect
  rule that's actively protecting an old URL from 404ing silently removes it, with zero recovery
  path visible to the operator (even if the backend tombstones rather than hard-deletes, the UI
  gives no hint that recovery is possible, so the operator will act as though it's gone forever).
  **Fix**: same `window.confirm` pattern already used four other places in this codebase
  (`Comments.tsx`, `Integrations.tsx`, `Media.tsx`, `Menus.tsx`), or upgrade it to state whether
  the action is reversible.
- **Minor** — Timestamp formatting: none visible on the list itself (redirects don't show a
  timestamp column), but see cross-cutting §4 for the `slice(0,16).replace("T"," ")` pattern this
  file's sibling screens use.
- Good pattern worth noting: the bulk-import result (`Redirects.tsx:158-185`) renders a genuine
  per-item created/failed breakdown instead of collapsing a partial batch into one pass/fail toast.

### Users (`/admin/users`, `Users.tsx`)

- **Major** — Disable/Enable button `title` attribute is the literal internal permission-system
  action name: `title={user.status === "active" ? "DISABLE_PRINCIPAL" : "ENABLE_PRINCIPAL"}`
  (`Users.tsx:258`). **Cost**: this is developer/implementation vocabulary surfaced as an operator
  tooltip, and it's pure noise even for a technical operator — the button's own label already says
  "Disable"/"Enable"; the tooltip adds a second, uglier way of saying the same thing instead of
  adding new information (e.g. what disabling actually does — blocks login? kills active
  sessions?). **Fix**: either drop the `title` (the label suffices) or replace it with a real
  behavior explanation.
- **Major** — No confirmation on Disable. A single click locks a user out
  (`Users.tsx:161-176`, `onToggleStatus`). Reversible by re-enabling, so lower stakes than a
  delete, but still an access-control action with no "are you sure."
  **Fix**: at minimum a `window.confirm`, matching the delete-confirmation precedent elsewhere.
- **Major** — "Create user" password field: `minLength={1}` (`Users.tsx:211`). No strength meter,
  no confirmation field, no visible policy. **Cost**: the UI actively implies a one-character
  password is acceptable; if the server enforces a real policy, the operator only discovers it via
  a raw validation-error round trip after submit (whatever `err.message` the server sends — see
  cross-cutting §2). If the server does *not* enforce a real policy, this is a live security gap
  in an area (admin credential creation) where it matters most. Either way the UI should state the
  requirement up front.
- **Minor** — "Reset password" (`Users.tsx:292-313`) has no confirmation before overwriting a
  user's password (it does correctly disclose *afterward* that every active session was revoked,
  which is good honesty — just after the fact, not before).
- Good pattern: role/policy `<select>` dropdowns show `(built-in)` inline for built-in rows
  (`Users.tsx:322`, `343`) — small, correct disambiguation.

### Roles & Permissions (`/admin/roles`, `Roles.tsx`)

- **Major** — Delete role and Delete policy (`Roles.tsx:256`, `347`) both fire immediately with no
  confirmation, the same gap as Redirects. **Cost**: identical to the Redirects finding — worse,
  arguably, since a role/policy in use elsewhere presumably 409s server-side (the error-code table
  at `Roles.tsx:26` maps `RESOURCE_CONFLICT` to "It is still in use"), so the operator only learns
  a delete was dangerous *after* clicking, via an error — the one case where it turned out to be
  safe (an unused role/policy) is exactly the case with no server-side backstop and no client-side
  confirmation either.
- **Minor** — "Add permission" (`Roles.tsx:359-380`) takes a free-text permission string
  (`e.g. content.write`) with no autocomplete, no list of valid permissions to pick from, and no
  client-side validation before the round trip. An operator has to already know the exact
  permission string syntax; a typo just produces a server error rather than being caught earlier.
  Given this screen already has full lists of roles/policies fetched, a `<datalist>` or dropdown of
  known permission strings (if the server can enumerate them) would remove a whole class of typos.
- **Minor** — `Roles.tsx` shares a single `rowSavingId` across *both* its tables (roles and
  policies — `onSaveRole`, `onDeleteRole`, `onSavePolicy`, `onDeletePolicy`, and
  `onWritePermission` all read/write the same state variable). This is the identical shape as the
  reframed `Plugins.tsx` finding below, in the very file `Plugins.tsx`'s own header names as the
  convention it's mirroring — confirms that finding isn't an isolated Plugins quirk, it's baked
  into the shared convention and reproducible here too (e.g. rename Role A, then immediately
  delete Policy B while A's rename is still in flight).

### Members (`/admin/members`, `Members.tsx`)

- **Minor** — "Disable" has no confirmation (`Members.tsx:150-156`), consistent with the Users
  screen's Disable gap above — noting once here, folded into cross-cutting §1's list rather than
  repeated as a separate major.
- Good pattern: expandable detail row loads lazily on first expand and caches
  (`detailById`), and the email itself is the expand trigger via a real `<button
  aria-expanded>` (`Members.tsx:134-141`) rather than a whole clickable `<tr>` — keyboard and
  screen-reader accessible by construction.

### Comments (`/admin/comments`, `Comments.tsx`)

No findings worth flagging — this is the best-built screen in the app for state handling: loading,
error, empty, and success are all visually and semantically distinct, permission-gated sections
degrade to an explanatory notice rather than a doomed fetch, purge is `window.confirm`-gated, and
a 409 (stale version) gets its own specific message instead of a generic failure. Held up as the
reference implementation in the cross-cutting section.

### Plugins (`/admin/plugins`, `Plugins.tsx`)

- **Major, and this is an argument with a documented decision, not an undiscovered bug** —
  correction to my own first pass on this screen: `Plugins.tsx:38-44`'s own `@tradeoffs` comment
  already names the row-busy race I initially filed as a fresh finding: *"In-flight state is a
  single `rowSavingId` (`ui.spec.md` §0 mandates mirroring `Roles.tsx`), so toggling a second row
  while the first is still in flight re-enables the first row's button — EC-11's single-flight
  guarantee is per-row-at-a-time, not per-row-concurrent. A `Set` of in-flight ids would close
  that, at the cost of diverging from the mandated convention."` It names the scenario, the cause,
  the exact fix I would have proposed, and why it wasn't taken. Filing that as an undiscovered bug
  would have been wrong — the real finding is that **the documented tradeoff undercounts its own
  consequence**. The comment frames the cost as "re-enables the first row's button" (a cosmetic
  inconvenience). The actual behavior goes further: `rowSavingId` being overwritten means a second
  click on the "re-enabled" row now passes the `if (rowSavingId === plugin.id) return` guard and
  fires a duplicate `PATCH`, and the two in-flight `reload()` calls have no ordering guarantee — so
  the operator can end up looking at plugin enable/disable state that does not match the action
  they actually took, for a control where "which state is it actually in" has real consequences (a
  disabled plugin might be serving broken pages). That's a correctness cost, not a cosmetic one.
  **This isn't a one-screen problem**: `ui.spec.md §0`'s convention is *mandated*, and checking its
  namesake — `Roles.tsx` shares the identical single-`rowSavingId`-across-many-actions shape (see
  that section above) — confirms it propagates everywhere the convention is mirrored, not just here.
  **Recommendation**: revisit `ui.spec.md §0`'s mandate itself, not just this file. A `Set<string>`
  of in-flight ids (the alternative the comment already names and rejects) closes the correctness
  gap; if consistency with `Roles.tsx` is the reason to keep the single-id version, that argument
  needs to weigh the duplicate-request/response-ordering cost above, not just the "button
  re-enables" framing it currently rests on.

### Newsletter (`/admin/newsletter`, `Placeholder.tsx`)

- **Major** — Confirmed live (screenshot `shots/newsletter.png`): navigating directly to
  `/admin/newsletter` renders a bright red error banner reading **"Unknown section: newsletter"** —
  not a "coming soon" message. `nav.ts` marks this item `soon: true` (so it doesn't appear as a
  clickable sidebar link — the honest half of the design works), but it's still directly routable
  (`App.tsx`'s `SECTIONS.newsletter` renders `<Placeholder sectionId="newsletter" />`,
  `Placeholder.tsx:3-5`), and `Placeholder` looks up its label/description from
  `src/admin-shell/navigation.ts`'s `getAdminSectionById`. That registry's `AdminSectionId` union
  (`navigation.ts:9-20`) never had `"newsletter"` added to it — the lookup returns `undefined`, and
  `Placeholder.tsx` falls to its own `if (!section) return <div className="notice
  error">Unknown section: {props.sectionId}</div>` branch. **Cost**: anyone who reaches this URL
  directly — a bookmark, a shared link, an AI agent navigating by section id, or simply typing the
  obvious path — gets a genuine-looking error banner instead of "Newsletter is coming soon," which
  reads as "this admin is broken" rather than "this feature isn't built yet." **Root cause is
  structural, not a newsletter-specific typo**: `navigation.ts`'s own header comment already
  discloses that this registry is legacy and out of sync with `nav.ts` (only 12 ids are registered;
  current nav has ~26). Any future `soon: true` section that isn't *also* manually added to this
  second, separate registry will hit the identical "Unknown section" error. **Fix**: either make
  `Placeholder` fail soft (render the generic "coming soon" copy using `nav.ts`'s own `label`,
  which it already has, instead of a second lookup that can silently miss entries), or retire
  `admin-shell/navigation.ts` as a data source for this component entirely, per its own header note
  admitting `nav.ts` is now the actual source of truth.

### Themes (`/admin/themes`) / Appearance (`/admin/appearance`, `Appearance.tsx`)

- **Minor** (confirmed live, not just from source) — `App.tsx` documents `themes` and `appearance`
  as "two accepted spellings, one screen" (`App.tsx:83`) and both are deliberately routable
  (`nav.ts:14-16`). But only `themes` has a `nav.ts` entry; `activeNavId`'s `"section"` case falls
  through to the raw route id (`App.tsx:198-199`), and `appearance` matches no `NavItem.id`. I
  checked this empirically (not just by reading the code): on `/admin/themes` the sidebar's Themes
  link has `class="cms-item active"` and `aria-current="page"`; on `/admin/appearance` — same
  screen, same content — it has neither. **Cost**: an operator who reaches this screen via
  `/admin/appearance` (a bookmark, a shared link, an agent-issued navigation) sees a sidebar with
  no indication of where they are — exactly the "renders a link that works but never lights up"
  failure mode `nav.ts`'s own header comment (`nav.ts:17-18`) names as the thing to avoid. **Fix**:
  either give `activeNavId` an explicit `appearance -> "themes"` alias next to the existing
  `SECTIONS` alias, or drop one of the two spellings.
- Correcting an early read of mine: the first automated sweep pass logged this route (and
  Integrations) with an empty body-text snippet and a large failed-request count, which looked like
  a broken/blank page. Re-verified manually with a slower per-route wait — both render correctly
  with real content. The original signal was a sweep-script artifact (fixed 700 ms settle time
  racing this screen's heavier dev-mode chunk loading, plus in-flight requests getting aborted when
  the script navigated to the next route before they finished), not a product bug. Not filing it as
  a finding; noting the correction so it isn't mistaken for an unresolved lead.

### Database (`/admin/database`, `Database.tsx`)

- See Recovery's note above re: migrate-forward lacking the richer disclosure pattern.
- Good pattern: `View in Recovery →` deep-link (`Database.tsx:146-150`) stashes context via
  `sessionStorage` rather than a bookmarkable/shareable query string, deliberately — the file
  header explains why. Worth calling out as the right call, not an oversight.

### Pages (`/admin/pages`, `Pages.tsx`) / Posts (`/admin/posts`, `Posts.tsx`) / Post Editor (`PostEditor.tsx`)

- **Blocker** — No delete capability anywhere in this flow (see executive summary #1). Verified:
  `src/server/routes/admin/posts/delete.ts` exists and is a real route; `apps/admin/src/lib/api.ts`
  has no `deletePost`/`deletePage` method; `Posts.tsx` and `Pages.tsx` list screens have no delete
  control; `PostEditor.tsx`'s status `<select>` only offers `draft`/`published`
  (`PostEditor.tsx:198-201`) — no `trash`. A post created by mistake, a test page, spam content —
  none of it can be removed through the UI. This is a dead end with no visual cause (not a Posts
  restyle issue), purely a missing affordance, so it's in scope despite Posts being otherwise
  excluded per §6.
- **Minor** (Pages only, IA) — `Pages.tsx` has no "no pages yet" empty-state treatment distinct
  from Posts' newer `card`/`empty-state` markup (`Pages.tsx:36-38` vs. `Posts.tsx:47-53`) — it
  still uses the bare `<div className="notice">Loading pages…</div>` idiom and has no populated
  empty-state message at all (an empty `<table>` renders with just headers, no rows, no "no pages
  yet" text). Since Posts is mid-restyle this may already be slated to change; flagging in case
  Pages was missed in that pass since it shares the same underlying data shape.
- Good pattern: Both list screens' Slug column links straight to the live public URL in a new tab
  (`Pages.tsx:64-66`, `Posts.tsx:73-75`) — a genuinely useful shortcut, not just decoration.
- See "Detail / editor routes" below for `PostEditor.tsx`'s bogus-post-id handling (safe) and
  unsaved-changes protection (absent, confirmed live on a real post) and its TipTap toolbar's
  keyboard behavior.

### Settings (`/admin/settings`, `SettingsUi.tsx`) / Settings (Raw) (`/admin/settings-raw`, `Settings.tsx`)

This is the IA question the dispatch brief specifically asked me to argue with, so the full case,
not just the executive-summary version:

- **Blocker (IA)** — `/admin/settings`'s 13 tabs (`SettingsUi.tsx` header, verified live —
  screenshot at `shots/settings.png`) are Execution mode, Instructions, Notifications, Privacy,
  Dialog appearance, Language, MCP server, Media providers, Connectors, Memory, External MCP,
  Skills, About. This is a direct port of the embedded AI agent's own settings dialog (the file's
  own header calls it "the Open Design settings-dialog port"). None of these tabs are general
  site/CMS configuration. There is no site title field, no default timezone, no admin contact
  email, no general/branding tab anywhere in this admin. **Cost**: every operator's mental model of
  "Settings" in any CMS (WordPress, Ghost, Webflow, Shopify — the entire category) is "where the
  site's own configuration lives." Clicking the nav item labeled exactly that and landing on AI
  agent execution-mode/MCP-server/connector configuration is a hard model violation on the single
  highest-traffic settings entry point in the app. An operator who came here to set the site title
  will not think to try "Settings (Raw)" — that label reads as "advanced/technical view of the
  Settings I just saw," not "the actual general-purpose settings store."
- **Major (IA)**, compounding the above — `/admin/settings-raw` (`Settings.tsx`, screenshot at
  `shots/settings-raw.png`) is where general values like `core.presentation`'s `activeThemeId`
  actually live, but it has zero discovery UI: a single namespace text box, and the screen's own
  copy admits it — *"There is no definitions-listing endpoint in this API surface yet — enter the
  namespace you want to inspect."* An operator has to already know the exact dotted namespace
  string (`core.presentation`, or whatever else exists) to see anything at all. Combined with the
  finding above: there is no path from "I want to change a site-wide setting" to actually doing it
  that doesn't require either already knowing the internal namespace key, or reading source.
- **Fix, in order of effort**: (1) cheapest — rename the two nav entries so their labels match their
  actual content: `/admin/settings` → "AI Assistant" or "Assistant Settings" (note this would sit
  oddly next to the *existing*, separate `/admin/ai-assistant` screen — see next point — so this
  rename alone surfaces a second, adjacent problem) and `/admin/settings-raw` → something like
  "Advanced / Raw Settings" only after a real "Settings" screen exists to be advanced *relative to*.
  (2) The real fix — build (or route to) an actual general-settings screen for whatever site-level
  config exists today (starting with the one confirmed value, `activeThemeId`, which already has a
  friendlier home on the Themes screen's "Activate" buttons — so it's not clear `settings-raw`
  needs to be operator-facing at all, vs. being a debug/support tool reachable only from a "Danger
  zone" or developer menu). Either way, "Settings" should not be the AI agent's configuration
  dialog with no other general-settings screen anywhere in the product.
- **Minor, related IA question** — with `/admin/settings` now meaning "AI Assistant configuration,"
  its relationship to the separately-routed `/admin/ai-assistant` (the master public-facing on/off
  switch + roadmap, reviewed above) is unclear from the nav alone: one is an ungrouped top-row item
  right under Overview, the other is 13 tabs buried in "Design & System." Both are "AI assistant
  settings" to an operator; nothing in the IA signals why they're different concepts (one gates
  whether the *visitor-facing* site assistant runs at all; the other configures the *admin's own*
  embedded coding-agent chat, per `AiAssistant.tsx`'s and `SettingsUi.tsx`'s header comments,
  respectively) — worth at minimum a one-line description under each nav label, or grouping them
  adjacently so their scope difference has to be explained once, not inferred.

### Collections / Collection entries / Collection entry editor

No blockers or majors — this is the second-best-built area after Comments. `Collections.tsx` has a
dedicated `ResetNamespaceDialog`-style lifecycle-confirm dialog for Deprecate/Reactivate/Tombstone
(`Collections.tsx:371-402`, comment cites "autoFocus the confirm button" as a deliberate default)
rather than a bare `window.confirm` — the richest confirmation UI outside Recovery's restore
ceremony. One **minor**: `Collections.tsx`/`CollectionEntries.tsx` both use "Remove field" for
schema-field removal with no confirmation at all (`Collections.tsx:192,342`) — lower stakes than
deleting an entry (it's removing a field definition, not data), but worth a beat of hesitation
given it could silently orphan data already stored under that field on existing entries; unclear
from this screen alone whether the backend preserves or drops that data.
- **This "no findings" verdict does not extend to the entry editor or the entries list one level
  deeper** — see "Detail / editor routes" below for `CollectionEntries.tsx`'s bogus-content-type
  trap (executive summary #1) and `CollectionEntryEditor.tsx`'s bogus-id handling (the best in the
  app, cited there as the reference pattern).

### Forms (`FormsList.tsx`, `FormEditor.tsx`)

`FormsList.tsx` itself: no findings. `FormEditor.tsx`'s "Delete submission" uses a clean two-click
in-place pattern (`"Delete submission"` → click → `"Confirm delete"` → click, `FormEditor.tsx:148-192`)
that achieves the same protection as `window.confirm` without a native browser dialog — a good
pattern, cited as a third valid confirmation shape alongside `window.confirm` and a dedicated
dialog component (see cross-cutting §1). But see "Detail / editor routes" below for a serious,
separate bug in the same file: a bogus form id renders a fully live, saveable form underneath its
own "not found" error (executive summary #3).

### Widgets (`WidgetsLibrary.tsx`, `WidgetRegions.tsx`, `WidgetRegionEditor.tsx`, `WidgetInstanceEditor.tsx`)

`WidgetsLibrary.tsx` has the most careful destructive-flow copy in the app: attempting to delete a
widget that's still placed somewhere shows exactly where it's used before offering a force-delete,
and the force path's confirm dialog names the usage explicitly (`WidgetsLibrary.tsx:41`, `"'{title}'
is still used in: {summary}. Permanently delete anyway? This cannot be undone."`). Cite this
alongside Recovery's disclosure panel as a top-tier destructive-action pattern. See "Detail / editor
routes" below for `WidgetInstanceEditor.tsx`'s handling of `/widgets/new` with a missing vs. garbage
`?type=` query param (missing is handled well; garbage is not).

### Integrations & API (`Integrations.tsx`) / Integration deliveries (`IntegrationDeliveries.tsx`)

No findings — webhook delete is `window.confirm`-gated with the target named in the prompt
(`Integrations.tsx:61`), consistent with the good half of the confirmation matrix.
`IntegrationDeliveries.tsx`'s bogus-subscription-id handling is covered in "Detail / editor routes"
below.

### Menus (`Menus.tsx`, `MenuEditor.tsx`)

`Menus.tsx` (the list): good proportional-confirmation pattern — soft "Trash" fires with no
confirmation (reversible), "Delete permanently" (only reachable once already trashed) requires
`window.confirm` (`Menus.tsx:37-49`). This is the correct shape for a two-stage delete and should
be the model cited when fixing Roles/Redirects' bare deletes (cross-cutting §1). `MenuEditor.tsx`
(the tree editor one level deeper) has real findings of its own — see "Detail / editor routes"
below: no unsaved-changes protection, no list/tree semantics for the nested item tree, and a
"Remove" control that deletes an entire subtree in one click with no confirmation and no warning
that children exist.

### Categories & Tags / Taxonomy (`Taxonomy.tsx`)

No findings in the portion reviewed (creation, term merge ceremony) — the merge-term flow uses the
same plan/confirm/execute ceremony shape as Database/Recovery, appropriately for an operation that
folds one term's content into another. Reparent and Deprecate are named in the design spec but have
no backend route yet; the screen correctly omits the controls rather than rendering dead buttons
for them (`Taxonomy.tsx:11-16`) — same honest-omission pattern as Database.tsx's drift banner.

### SEO & Metadata (`Seo.tsx`) / Analytics (`Analytics.tsx`)

No findings. Both worth citing as reference patterns: `Analytics.tsx` states plainly, in-UI, that
it is "raw ingest data only... not a dashboard" with no rollup layer yet, rather than presenting an
empty/sparse-looking screen with no explanation (`Analytics.tsx:32-36`) — this is exactly the
honest-about-limitations copy other "not fully built" screens should match (see also
`AiAssistant.tsx`'s roadmap and `Taxonomy.tsx`'s omitted controls above).

---

## Detail / editor routes (second audit pass)

Not in `nav.ts` at all — reached only by opening something from a list screen, or by URL. These are
the largest, most complex files in the app and where operators actually spend their time once past
the list view. Audited separately per the methodology note at the top: **list screens mostly fail
on missing affordances; editor routes mostly fail on bogus-input handling and unsaved-state loss** —
a genuinely different failure profile, kept distinct here rather than folded into the sections above.

Every bogus-id/bogus-param case below was reproduced live (not inferred from source alone) by
navigating my isolated browser session directly to the URL and capturing a screenshot; paths are at
`shots/detail-*.png`.

### Bogus-ID / bogus-param handling — the full matrix

| Route | Bogus input | Result | Verdict |
|---|---|---|---|
| `/posts/:id` (`PostEditor.tsx`) | junk id | Clean error banner: `"post 'X' was not found"`, no editor chrome, sidebar correctly highlights Posts | **Safe** |
| `/collections/:typeKey` (`CollectionEntries.tsx`) | junk type key | Renders as a real, empty, **creatable** collection — breadcrumb, heading, "No entries yet," a live "New entry" button. No error, anywhere. | **Blocker** — exec summary #1 |
| `/collections/:typeKey/:entryId` (`CollectionEntryEditor.tsx`) | junk type key, or junk entry id | Explicit sequential guards: loading → "Unknown content type" → "Entry not found." Never falls through to a live editor. | **Safe — best pattern in the app** |
| `/forms/:formId` (`FormEditor.tsx`) | junk id | Shows `"form definition 'X' was not found"` **and**, underneath it, a fully live, empty, saveable form with a working Save button | **Blocker** — exec summary #3 |
| `/menus/:menuId` (`MenuEditor.tsx`) | junk id | Clean error banner, no editor chrome | **Safe** |
| `/widgets/:widgetId` (`WidgetInstanceEditor.tsx`) | junk id | Clean error banner, no editor chrome | **Safe** |
| `/widgets/new` (`WidgetInstanceEditor.tsx`) | missing `?type=` | Clean `"No widget type specified."` error | **Safe** |
| `/widgets/new?type=garbage-nonsense` | garbage `?type=` | Full live editor shell (title field, Save button) with a `"Type: garbage-nonsense"` label and **zero config fields, zero error** — `WidgetConfigFields`'s switch has no `default` case beyond `return null` (`components/WidgetConfigFields.tsx:208-209`) | **Major** — silent, not a hard trap (Save would 400 server-side) but no signal to the operator that the type is invalid until they try |
| `/widgets/regions/:regionKey` (`WidgetRegionEditor.tsx`) | junk key | Precise error: `"region 'X' is not bound"` — correctly distinguishes "not bound to a template location" from "doesn't exist" | **Safe, good copy** |
| `/integrations/:subscriptionId` (`IntegrationDeliveries.tsx`) | junk id | Clean error banner | **Safe** |
| `/section/:id` (legacy fallback) | any junk id | Same red `"Unknown section: X"` banner as the Newsletter bug above — confirms that failure mode isn't newsletter-specific, it's this fallback's generic behavior for anything the (stale) `admin-shell` registry doesn't know | Reinforces the Newsletter finding, not a new one |

Two screens above get the identical underlying situation (a foreign-key id that doesn't resolve)
right, and two get it wrong in two structurally different ways — `CollectionEntries.tsx` never
checks at all; `FormEditor.tsx` checks but its loading-guard's boolean logic (`if (!isNew && !form
&& !error) return <Loading/>`) only covers the pre-error state, so once `error` is set the
condition evaluates false and rendering falls through anyway. Different root causes, same operator
experience: an editor that looks real for a record that doesn't exist.

### Unsaved-changes protection

**None of the five editor screens have any** (`PostEditor`, `CollectionEntryEditor`, `FormEditor`,
`MenuEditor`, `WidgetInstanceEditor`) — no `beforeunload` handler, no dirty-state comparison against
the loaded record, no custom "you have unsaved changes" prompt on in-app navigation. Confirmed live,
not just from source: opened a real post (`post-home`), edited the title to a marker string, clicked
the in-app "← Posts" link, and navigated away instantly with no dialog of any kind — the edit is
gone. Reproduced the same result on `MenuEditor`. **Cost**: every one of these is a moderately
long-form editing surface (rich text, nested trees, dynamic field lists) — exactly the shape of
input an operator is most likely to lose several minutes of work on from one misclick, and there is
currently no floor under that loss anywhere in the app. **Fix**: a shared `useDirtyGuard(current,
original)` hook wired to `beforeunload` and to the in-app back-link's click handler would cover all
five screens with one implementation; none of them currently track "original loaded state" at all,
so this is new state, not just a new warning on top of existing state.

### `PostEditor.tsx`'s TipTap toolbar — keyboard access

Reachable quickly (3 Tab presses from the title field: title → back-link → first toolbar button),
and every button has a real `title` (several also have `aria-pressed` reflecting active formatting
state — `Toolbar`, e.g. `PostEditor.tsx:80`, good). One real friction point, confirmed live:
activating a toolbar button via keyboard (`Enter`) calls `chain().toggleBold().run()`, and `chain =
() => editor.chain().focus()` (`PostEditor.tsx:75`) — every single toolbar action returns focus to
the document body, not back to the toolbar. For a mouse user this is invisible. For a keyboard user
who wants to apply Bold *then* Italic, the first action ejects focus from the toolbar entirely, and
reaching the *next* toolbar button means tabbing there again from wherever the cursor landed in the
document — there's no way to fire two toolbar actions back-to-back via keyboard without a full
re-navigation each time. **Fix**: keep focus on the toolbar button after a formatting toggle (only
`.focus()` the document on an *insert* action like image/widget-embed, where returning to the
document is the actually-wanted behavior), or make the toolbar a proper `role="toolbar"` roving
tabindex group so arrow keys move between buttons without re-entering document tab order at all.

### `MenuEditor.tsx`'s nested item tree

Confirmed live via DOM inspection after adding a nested item: the tree is `<div>` soup —
`.menu-item-row` elements nested via plain recursion, indentation expressed purely as inline
`marginLeft: path.length * 20` (`MenuEditor.tsx:118`). No `<ul>/<li>`, no `role="tree"` /
`role="treeitem"`, no `aria-level` anywhere. A sighted mouse user reads nesting depth from
indentation; a screen-reader user gets no structural signal for it at all beyond DOM order — the
same underlying information the sighted user gets "for free" from indentation is architecturally
inaccessible here, not just imperfectly labeled. Two more, smaller issues in the same component:

- **Minor** — Move up/down (`↑`/`↓`) buttons have no `aria-label`, relying solely on a `title`
  attribute plus an arrow glyph as their accessible name (confirmed: `ariaLabel: null` on both,
  live DOM query). `title` isn't reliably exposed to assistive tech and isn't keyboard-discoverable
  without a mouse hover — these need an explicit `aria-label="Move item up"`/`"…down"`.
- **Major** — "Remove" (`✕`, `title="Remove item"`) deletes the clicked item **and its entire
  subtree** in one click, no confirmation, no warning that children exist. Confirmed live: built a
  3-row tree (two root items, one child under the first), clicked Remove on the parent, went from 3
  rows to 1 in a single click with no dialog. **Cost**: for a deep menu, removing a top-level item
  silently destroys everything nested under it — the visual cue (indentation) that would tell an
  operator "this has children" is exactly the same information a screen-reader user can't get at
  all (see above), so this hits hardest for the users least able to see the consequence coming.
  **Fix**: at minimum, `window.confirm` when `(item.children ?? []).length > 0`, naming the count
  of items that will be removed.

### Empty states — confirmed, not just theorized

The nav-section sweep's seed data (8 posts/pages) meant most screens showed populated state by
default; emptied it via a direct authenticated API call (the only way to do it at all — see exec
summary #2) to actually see the empty states underneath. Confirmed a real, clean, visually-verified
bug: **`Pages.tsx`'s empty state is a bare table with column headers and nothing else** —
`shots/empty-pages.png` — compared directly against `Posts.tsx`'s identical situation
(`shots/empty-posts.png`), which shows a proper card: `"No posts yet."` / `"Create your first post
to get started."`. Same underlying data shape (a post row with `kind: "page"`), same screen author,
one has the empty-state treatment and its sibling doesn't. **Fix**: port `Posts.tsx`'s
`card`/`empty-state` block to `Pages.tsx` verbatim — this is a five-minute fix once someone notices
the two screens have drifted.

---

## Cross-cutting patterns

These recur across many screens and are worth fixing once, structurally, rather than 15 separate
times.

1. **Confirmation coverage is a coin flip.** `window.confirm` (or better) appears on:
   `Comments.tsx` (purge), `Integrations.tsx` (delete webhook), `Media.tsx`, `Menus.tsx`,
   `WidgetsLibrary.tsx` (delete/trash), plus `FormEditor.tsx`'s own two-click
   "Delete submission" → "Confirm delete" in-place pattern, and `Collections.tsx`'s dedicated
   lifecycle-confirm dialog for deprecate/reactivate/tombstone. Missing entirely on:
   `Roles.tsx` (delete role, delete policy), `Redirects.tsx` (delete rule), and single-click
   Disable on both `Users.tsx` and `Members.tsx`. There is no shared component or convention here —
   each screen reinvented (or skipped) this independently. **Fix**: a single `useConfirm()` hook or
   shared `<ConfirmButton destructive label confirmLabel onConfirm>` component, used by every
   irreversible or access-affecting action, so the decision "does this need confirmation" is made
   once per action type and enforced structurally instead of per-file.

2. **Raw server strings reach the operator by default; per-screen translation is opt-in.**
   `request()` in `lib/api.ts` (`lib/api.ts:721-737`) throws `String(body.error ?? "request failed
   (${status})")` verbatim. Roughly a dozen screens then layer a `describeApiError()` with a
   per-`code` lookup table on top (`Comments.tsx`, `Users.tsx`, `Roles.tsx`, `Workspace.tsx`,
   `AiAssistant.tsx`, …) — good, but it's copy-pasted per file rather than centralized, so coverage
   is uneven and every new screen starts from raw strings again unless its author remembers to add
   the table. Server-side, several routes already return developer-shaped `err.message` straight
   into the `error` field for unmapped codes (e.g. `settings/clear.ts`, `settings/register-definitions.ts`
   forward `err.message` for `SECRET_NOT_SUPPORTED`, `DEFINITION_INVALID`, etc. — worth an
   independent check of whether those messages actually read as operator language). **Fix**: move
   the code→message mapping into `lib/api.ts` itself (or a shared helper `describeApiError` that
   every screen imports instead of redefining), so raw-string leakage requires an explicit opt-out
   rather than an explicit opt-in.

3. **Disabled-with-explanation is a real, good pattern — but only two screens use it.**
   `Workspace.tsx`'s "Delete workspace" and `AiAssistant.tsx`'s roadmap checklist both do the same
   thing correctly: show the control, disable it, and put the *why* in a `title` or inline text
   rather than hiding the capability or leaving the operator to guess. Every other disabled button
   in the app should default to this shape instead of a bare `disabled` with no explanation —
   worth writing down as a house rule since it clearly already exists as a convention in two
   places, just not enforced.

4. **Timestamp formatting: `x.slice(0, 16).replace("T", " ")`, everywhere.** Confirmed in
   `Comments.tsx:175`, `Database.tsx:155,230`, `Recovery.tsx:87,246`, `Members.tsx:147`,
   `Pages.tsx:71`, `Posts.tsx:80`, and more. A raw ISO-string slice: no timezone conversion (every
   timestamp is shown in whatever zone the server stored it in, presumably UTC, silently, with no
   "UTC" label anywhere), no locale-aware formatting, and it breaks if a timestamp is ever
   millisecond-precision or lacks the expected `T` separator. **Fix**: one shared
   `formatTimestamp()` helper — even a thin one — so a future "show relative time" or "respect the
   operator's timezone" improvement is a one-file change instead of a grep-and-replace across a
   dozen files.

5. **No skip link, anywhere — confirmed by actually counting.** Every one of the ~26+2 routes
   repeats the full sidebar before reaching page content, and there is no skip-navigation link
   (checked via `document.querySelector('a[href^="#"], [class*="skip"]')` on a live page — none
   found). Empirically counted the cost: from a fresh page load, it takes **26 Tab presses** to
   reach the main content region on `/admin/dashboard`. A keyboard-only or screen-reader operator
   pays that tax on every single navigation, all day. This is squarely a content/interaction gap
   (not sidebar visual styling), so it's in scope despite the shell being mid-restyle — worth
   fixing at the same time as the shell work since it's touching the same markup anyway. **Fix**: a
   standard `<a href="#main-content" class="skip-link">Skip to content</a>` as the very first
   focusable element, visually hidden until focused.
   
6. **Duplicate `<h1>` on every single page.** `AssistantDock.tsx:191-192` renders `<h1
   className="jini-chat-pane__title">{…"Tovu assistant"}</h1>` for the globally-mounted chat dock,
   alongside whatever `<h1>` the active screen renders for itself (confirmed live: `/admin/users`
   has both `H1:Users` and `H1:Tovu assistant`). Since `AssistantDock` mounts in `App.tsx` for every
   route, this means **no page in the admin has a single, unambiguous top-level heading** — a
   screen-reader user navigating by heading level gets two "page title" candidates on every screen,
   with no signal for which one is the actual page. This is a semantic-markup defect, not a visual
   one — it survives whatever the shell's visual restyle does unless the heading level is also
   corrected as part of that pass. **Fix**: the chat dock's own title should be an `<h2>` (or lower,
   scoped within its own `role="complementary"`/`aria-label` region), never competing with the
   page's `<h1>` for document-outline primacy.

7. **Per-screen action hierarchy, for whoever builds the new button system.** The dispatch brief
   noted every `<button>` today inherits one filled style app-wide, and that a token/hierarchy
   system is already in flight — so this is *not* a color finding, it's the interaction-design
   input that system needs per screen. A representative sample of what should read as
   primary/secondary/destructive once real hierarchy exists:
   - **Posts/Pages list**: primary = New Post/New Page; row actions (once delete ships, see
     Blocker above) = destructive, visually distinct from the primary create action.
   - **Redirects**: primary = Add redirect; Enable/Disable = secondary/neutral toggle; Delete =
     destructive.
   - **Roles & Permissions**: Create role/Create policy = primary within their own forms; Rename =
     secondary; Delete = destructive, currently indistinguishable from Rename.
   - **Users**: New user = primary; Manage = secondary; Disable = warning-toned (not neutral, not
     full destructive — it's reversible but access-affecting); Reset password = warning-toned.
   - **Recovery/Database ceremonies**: each step's forward action (Continue/Confirm/Execute) should
     escalate in visual weight as the action gets closer to irreversible — "Execute restore" should
     not look like "Continue to confirm."
   - **AI Assistant**: the on/off switch is the entire primary surface; nothing else on the screen
     should compete with it.

8. **A dev-mode default silently routes writes to the wrong database when two instances run
   side-by-side — a real footgun, not just a note about my own setup.** `apps/admin/vite.config.ts`
   proxies `/api` to `process.env.TOVU_API_URL ?? "http://localhost:3000"`. Point a second `tovu`
   server (any port, any `TOVU_DB` mode) at Vite's dev proxy without also exporting `TOVU_API_URL`
   for that specific Vite process, and every request from that second server's admin UI silently
   goes to whatever happens to be listening on `:3000` instead — with no error, no warning, and no
   visual difference in the browser (the URL bar still shows the second server's own origin after
   the dev-proxy redirect lands on Vite). **Cost, demonstrated, not hypothetical**: this is exactly
   what my own MSG-01 setup instructions specified, and following them literally would have routed
   every write I made — including the destructive actions I was specifically dispatched to exercise
   — into the shared `content.db` on `:3000` instead of my intended disposable `:3100` instance. I
   caught it by checking `curl -o /dev/null -w '%{redirect_url}' http://localhost:3100/admin` before
   clicking anything, but this is a normal thing for any developer to hit by running two `tovu`
   instances at once (a common dev workflow — testing against a fresh DB while a main instance
   keeps running) without knowing this specific env var needs to travel with the *Vite* process, not
   the server process. **Fix**: `admin-static.ts`'s dev-proxy redirect could carry the originating
   server's own port/API-base as a query param or header for Vite's proxy config to honor, or —
   simpler — `vite.config.ts`'s default should fail loudly (refuse to proxy, or proxy to a
   guaranteed-wrong port that 404s obviously) rather than silently defaulting to `:3000` specifically,
   since `:3000` reads as "probably a real, running instance" precisely because it's the ecosystem's
   own conventional default port.

---

## What I could not assess

- **Isolation setup — resolved, verified, and filed as a finding (cross-cutting §8), not left as an
  open question.** The redirect-only setup as originally specified would have routed writes to the
  shared `:3000`/`content.db` (caught before clicking anything). Fixed with a fail-closed
  `context.route()` interceptor and **demonstrated** the fix rather than assumed it: created a real
  post through the actual UI on `:3100`, confirmed directly (no browser involved) that it does not
  exist on `:3000`, confirmed `:3000` rejects even a stolen `:3100` session cookie, confirmed the
  browser's own session lives on `:3100`. Zero requests were aborted by the fail-closed interceptor
  across the entire session, meaning the allowlist covered 100% of real traffic without needing a
  reactive fix mid-audit. Full detail in the methodology note at the top of this report.
- **Live-verified almost everything reported above**, including several corrections to my own first
  automated pass (Themes/Integrations were not actually broken — a sweep-script settle-time
  artifact; the "no delete for posts," "Unknown section: newsletter," bogus-id/bogus-param matrix,
  unsaved-changes-loss, and Pages/Posts empty-state-drift findings were all independently confirmed
  against rendered screenshots or live DOM queries, not just source). Two ceremonies I read
  carefully in source but did not click all the way through live: Database's migrate-forward and
  Recovery's full restore execute (both are multi-step and executing either changes server/DB state
  I'd then need to account for in every subsequent screenshot — read the code path for both
  instead; the confirmation-quality observations above are source-based for these two specifically,
  not click-verified). Also not executed live: the merge-term ceremony on Taxonomy, and Collections'
  Deprecate/Reactivate/Tombstone lifecycle dialog — both reviewed in source only.
- **Narrow-viewport/responsive audit deliberately shallow.** Confirmed the shell already responds
  reasonably at 375px (hamburger nav, no horizontal overflow on Posts) — but did not do a
  screen-by-screen responsive pass, since the shell/responsive layout is explicitly in flight per
  the dispatch scope note and a full pass would likely re-report things already being fixed. Did
  not test any detail/editor route at a narrow viewport (e.g. whether MenuEditor's tree or
  PostEditor's toolbar remain usable at 375px) — worth a follow-up pass once the shell work lands.
- **Accessibility pass was targeted, not exhaustive.** Checked and reported on skip-link absence,
  duplicate `<h1>`, one focus-order sample (dashboard, 26 tabs to main content), TipTap toolbar
  keyboard reachability, and MenuEditor's tree semantics — did not run a full axe-core sweep or
  check every form's label association, contrast ratio, or modal focus-trap behavior individually
  across all 27 list screens plus the 8 detail routes.
- Two nav items' underlying data model I did not fully trace: whether `Redirects.tsx`'s
  `tombstoneRedirect` is a genuine soft-delete (recoverable) or effectively permanent — the finding
  above treats this as unknown-to-the-operator either way, since the UI communicates nothing about
  it regardless of the true backend behavior.
- `CollectionEntryEditor.tsx`'s "read the whole collection to find one entry by id" pattern
  (`listEntries({type})` then a client-side `.find()`, rather than a dedicated get-by-id route) is a
  performance/scalability concern for large collections, not a UX one — noted but not sized against
  any real collection large enough to matter, and not filed as a ranked finding.
- Did not attempt the `WidgetInstanceEditor`/`WidgetRegionEditor`/`CollectionEntryEditor` TipTap-lite
  editors' keyboard access individually — read their source (they reuse `PostEditor.tsx`'s pattern
  or a trimmed subset of it) rather than re-verifying each one live, given `PostEditor.tsx`'s own
  toolbar was already confirmed and the others are documented as deliberately reduced copies of it.
