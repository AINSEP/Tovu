import type { ReactNode } from "react";
import type { AdminPanel } from "@jini-ai/admin/core";
import { Themes, ThemeExplore } from "./features/themes";
import { Dashboard } from "./features/dashboard";
import { Placeholder } from "./components/Placeholder";
import { PlaceholderTabs } from "./components/PlaceholderTabs";
import { PostEditor, Posts } from "./features/posts";
import { PageEditor, Pages } from "./features/pages";
import { Members } from "./features/members";
import { Comments } from "./features/comments";
import { Analytics } from "./features/analytics";
import { Media } from "./features/media";
import { Menus, MenuEditor } from "./features/menus";
import { Integrations, IntegrationDeliveries } from "./features/integrations";
import { Users } from "./features/users";
import { Authentication } from "./features/authentication";
import { Payments } from "./features/commerce";
import { Roles } from "./features/roles";
import { SettingsUi } from "./features/settings";
import { Seo } from "./features/seo";
import { Redirects } from "./features/redirects";
import { Plugins, AgentPlugins } from "./features/plugins";
import { FormsList, FormEditor } from "./features/forms";
import { Collections, CollectionEntries, CollectionEntryEditor } from "./features/collections";
import { Taxonomy } from "./features/taxonomy";
import { Database } from "./features/database";
import { Recovery } from "./features/recovery";
import { Deployment } from "./features/deployment";
import { SourceControl } from "./features/source-control";
import { Security } from "./features/security";
import { WidgetsLibrary, WidgetInstanceEditor, WidgetRegions, WidgetRegionEditor } from "./features/widgets";
import { Workspace } from "./features/workspace";
import { AiAssistant } from "./features/ai-assistant";
import { Playground } from "./features/playground";
import { Sites } from "./features/sites";

/**
 * @file The single declaration of every Tovu admin section — one `AdminPanel` per screen, in one
 * file, instead of three that had to be hand-synced.
 *
 * ## What this replaces
 *
 * Before this file, a section was defined in three places, each owning a different fact:
 *
 * - `App.tsx`'s `SECTIONS` map — the routing allowlist *and* the render dispatch.
 * - `nav.ts` — sidebar label/icon/group/order.
 * - `lib/agent-pages.ts` — the AI assistant's navigation allowlist.
 *
 * `apps/admin/INFO.md` ("Adding a new admin section") explained why that split existed and was
 * right to insist on it: `nav.ts` presence and agent reachability are separate concerns from
 * routability — `appearance` is reachable with no sidebar row, for instance,
 * and an agent may only navigate where `agent-pages.ts` names. `@jini-ai/admin/core`'s `AdminPanel`
 * keeps that exact reasoning but as fields on one declaration: `nav` is optional (omit it and a
 * panel is routable but unlisted), and `agentReachable` is left unset on nearly every panel below —
 * `agent-pages.ts` opts Tovu into `buildAgentPageMap`'s `defaultReachable: true`, so unset now means
 * reachable, not excluded. No panel currently sets `agentReachable: false` to opt back OUT: the one
 * that did was `settings-raw`, the SPEC-007 raw namespace/key ledger inspector, a human-only
 * debugging surface deleted once `/settings` covered the same rows through a curated tabbed UI. The
 * field still exists and still works; nothing needs it today. This is the mirror image of the field's original
 * fail-safe-by-default design (`@jini-ai/admin/core`'s own default is still `false`, for a host that
 * hasn't made this call); Tovu decided navigation-only reachability carries no meaningful risk on
 * its own — operating a page's controls is a separate, still per-element `data-agent-element`
 * opt-in this default has no effect on — so unset defaulting to *included* is the more useful shape
 * for an operator asking the assistant "where is X" and getting "nowhere, by construction" back.
 *
 * Detail routes (`/posts/:id`, `/widgets/regions/:key`, …) used to live as branches in `App.tsx`'s
 * `parseRoute`, a ~30-line if-chain. They live on each panel's own `routes` now — see
 * `AdminRoutePattern` in `@jini-ai/admin/core` for the segment-matching rules, and this file's
 * `widgets` entry below for the one case where a route's reported agent page id genuinely diverges
 * from its panel id.
 *
 * `App.tsx` still owns two Tovu-local things the generic package cannot: the legacy
 * `/section/:id` URL shape (nothing else in the corpus this package was ported from has that), and
 * wiring `route.view`/`route.params` into each panel's render call.
 */

/**
 * What a panel's render thunk receives for the sub-route within its own URL space.
 *
 * `view`/`params` are `null`/`{}` for the panel's own index route (`/posts`, not `/posts/abc`).
 * Each panel below does its own small `switch` on `view` rather than the router doing it, which is
 * what lets a panel own its URL space without editing a shared dispatch — see the file header.
 */
export interface PanelRouteContext {
  readonly view: string | null;
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
}

export type PanelRenderer = (ctx: PanelRouteContext) => ReactNode;

/**
 * Every admin section, in the order the sidebar groups them (see `nav.ts`'s `getNav()`, which
 * derives the nav model from this array via `buildNav` — group and item order both come from
 * here, not a second list).
 */
export const ADMIN_PANELS: readonly AdminPanel<PanelRenderer>[] = [
  // --- Ungrouped top row ---
  {
    id: "dashboard",
    render: () => <Dashboard />,
    nav: {
      label: "Overview",
      icon: '<rect x="2" y="2" width="6" height="6" rx="1.5"/><rect x="10" y="2" width="6" height="9" rx="1.5"/><rect x="2" y="10" width="6" height="6" rx="1.5"/><rect x="10" y="13" width="6" height="3" rx="1.5"/>',
    },
    agentReachable: true,
  },
  {
    id: "ai-assistant",
    // `?tab=<id>` picks the initially-active tab and stays in sync as the operator switches tabs
    // (see `AiAssistant`'s `tabId` prop) — same `?tab=` deep-linking convention as `settings`'s and
    // `deployment`'s own entries elsewhere in this file.
    render: (ctx) => <AiAssistant tabId={ctx.query.get("tab")} />,
    nav: {
      // Sits in the ungrouped top row directly under Overview rather than in "Design & System",
      // because the control it owns is an incident switch: the operator reaching for it is
      // dealing with a leak, a bad deploy, or runaway spend, and should not have to scroll a
      // grouped menu to find the off switch. Kept out of "Marketing" for the same reason — this
      // is not a growth surface, it is a kill switch with a roadmap attached.
      label: "AI Assistant",
      icon: '<rect x="3" y="5" width="12" height="9" rx="2.5"/><path d="M9 5V2.5M6.5 9v.01M11.5 9v.01M7 12h4"/><path d="M1.5 8.5v2M16.5 8.5v2"/>',
    },
    // Reachable via the default, same as every other panel here. An earlier version of this
    // comment excluded it on the reasoning that "an agent navigating to its own dock is not a
    // meaningful action" — a mistaken premise: this screen is not the assistant's chat dock, it's
    // an operator control panel (the visitor-assistant kill switch, execution mode, BYOK
    // credentials) that happens to be named "AI Assistant". Reachability alone only lets an agent
    // land here; operating the kill switch or reading a credential would need those specific
    // controls individually tagged with `data-agent-element`, which none of them are.
  },
  {
    id: "sites",
    render: () => <Sites />,
    nav: {
      // Under "Overview" in the ungrouped top row — the owner's placement (2026-09-04
      // sites-switcher decision). It belongs beside Overview rather than in "Operations" because
      // it answers the question that comes BEFORE every other screen in this admin: which site is
      // all of this about? Every grouped section below (Pages, Posts, Media, Themes, …) is scoped
      // to whichever site this one names, so filing it among them would put the frame inside the
      // picture.
      label: "Sites",
      // Three stacked cards with the front one offset — "several of the same thing, one in front"
      // — deliberately distinct from Overview's dashboard grid of four fixed panes and from
      // Deployment's rocket. Nothing else in the rail uses an overlapping-stack silhouette.
      icon: '<rect x="2" y="6" width="11" height="9" rx="1.5"/><path d="M5 6V3.5A1.5 1.5 0 016.5 2H15a1 1 0 011 1v8.5A1.5 1.5 0 0114.5 13H13"/>',
    },
    // Reachable by the file-wide `defaultReachable: true`. Navigation-only, as everywhere else:
    // Create and Activate are ordinary buttons with no `data-agent-element` opt-in, so an agent can
    // land here and read which site is live but cannot switch one.
  },

  // --- Content ---
  {
    id: "pages",
    render: (ctx) => {
      switch (ctx.view) {
        case "page-editor":
          // Guaranteed present: this view only fires when `/:slug` matched. Despite the name, the
          // server-side lookup this feeds (`getAdminPostByIdOrSlug`) accepts either a slug or a
          // real id, so an old id-based bookmark still resolves — see that function's own doc.
          return <PageEditor key={ctx.params.slug} slug={ctx.params.slug} />;
        default:
          return <Pages />;
      }
    },
    routes: [{ pattern: "/:slug", view: "page-editor" }],
    nav: {
      label: "Pages",
      group: "Content",
      icon: '<rect x="3" y="2" width="12" height="14" rx="1.5"/><path d="M6 6h6M6 9h6M6 12h4"/>',
    },
    agentReachable: true,
  },
  {
    id: "posts",
    render: (ctx) => {
      switch (ctx.view) {
        case "post-editor":
          // Guaranteed present: this view only fires when `/:postId` matched.
          // `key` (2026-08-12 audit, blocker TM-TOVU-2026-08-12-A/F1): without it React reuses one
          // component + hook instance across entity navigation, so `save()`'s closure stays bound to
          // whichever entity was current when Save was clicked. Navigate mid-save and the late
          // response commits over the newly-displayed entity — then the NEXT save reads the stale id
          // and writes to the wrong record. Remounting per id closes the whole class at the routing
          // layer instead of one hand-rolled staleness ref per hook. `Seo.tsx:245` already does this
          // (`<SeoEntryPanel key={entryId} …>`) and is why that panel was never vulnerable.
          return <PostEditor key={ctx.params.postId} postId={ctx.params.postId} />;
        default:
          return <Posts />;
      }
    },
    nav: {
      // Was a plain 3-line stack (`M3 4h12M3 8h12M3 12h8`) — pixel-identical in silhouette to the
      // since-deleted `settings-raw` panel's icon (same three widths, same pattern), invisible with
      // labels present but indistinguishable in the icon-only rail. Redrawn as a bulleted list
      // (small marker + line per row) so the two read as different controls at a glance. Kept as
      // drawn: the distinction it buys against every other line-based glyph in the rail still holds.
      label: "Posts",
      group: "Content",
      icon: '<circle cx="3.5" cy="4.5" r="1"/><path d="M6.5 4.5h9"/><circle cx="3.5" cy="9" r="1"/><path d="M6.5 9h9"/><circle cx="3.5" cy="13.5" r="1"/><path d="M6.5 13.5h6"/>',
    },
    agentReachable: true,
    routes: [{ pattern: "/:postId", view: "post-editor" }],
  },
  {
    id: "media",
    // `?tab=<id>` picks the initially-active tab and stays in sync as the operator switches tabs
    // (see `Media`'s `tabId` prop) — same `?tab=` deep-linking convention as `deployment`'s and
    // `settings`'s own entries elsewhere in this file.
    render: (ctx) => <Media tabId={ctx.query.get("tab")} />,
    nav: {
      label: "Media",
      group: "Content",
      icon: '<rect x="2" y="3" width="14" height="11" rx="1.5"/><path d="M2 11l4-3 3 2 3-3 4 3"/><circle cx="6" cy="6.5" r="1"/>',
    },
    agentReachable: true,
  },
  {
    id: "collections",
    render: (ctx) => {
      // Guaranteed present on both routes below: both patterns start with `/:contentTypeKey`.
      const contentTypeKey = ctx.params.contentTypeKey;
      switch (ctx.view) {
        case "collection-entry-editor":
          return (
            <CollectionEntryEditor
              key={`${contentTypeKey}:${ctx.params.entryId}`}
              contentTypeKey={contentTypeKey}
              entryId={ctx.params.entryId === "new" ? null : ctx.params.entryId}
            />
          );
        case "collection-entries":
          return <CollectionEntries contentTypeKey={contentTypeKey} />;
        default:
          return <Collections />;
      }
    },
    nav: {
      label: "Collections",
      group: "Content",
      icon: '<rect x="2.5" y="4" width="13" height="10" rx="1.5"/><path d="M2.5 7.5h13M6 4V2.5M12 4V2.5"/>',
    },
    agentReachable: true,
    routes: [
      { pattern: "/:contentTypeKey/:entryId", view: "collection-entry-editor" },
      { pattern: "/:contentTypeKey", view: "collection-entries" },
    ],
  },
  {
    id: "menus",
    render: (ctx) => {
      switch (ctx.view) {
        case "menu-editor":
          // The `/new` pattern below captures no params, so `menuId` is `undefined` there — the
          // same "new means null" mapping `App.tsx`'s old `parseRoute` did inline.
          return <MenuEditor key={ctx.params.menuId ?? "new"} menuId={ctx.params.menuId ?? null} />;
        default:
          return <Menus />;
      }
    },
    nav: {
      label: "Menus",
      group: "Content",
      icon: '<path d="M4 3h10M4 7h10M4 11h6M2 3v.01M2 7v.01M2 11v.01"/>',
    },
    agentReachable: true,
    routes: [
      { pattern: "/new", view: "menu-editor" },
      { pattern: "/:menuId", view: "menu-editor" },
    ],
  },
  {
    id: "widgets",
    render: (ctx) => {
      switch (ctx.view) {
        case "widget-regions":
          return <WidgetRegions />;
        case "widget-region-editor":
          // Guaranteed present: this view only fires when `/regions/:regionKey` matched.
          return <WidgetRegionEditor key={ctx.params.regionKey} regionKey={ctx.params.regionKey} />;
        case "widget-editor": {
          // Same split as `menus`: the `/new` pattern captures no `widgetId`, so its presence is
          // what distinguishes "editing" from "creating" — `widgetType` only ever came from the
          // query string on the create path.
          const widgetId = ctx.params.widgetId ?? null;
          return <WidgetInstanceEditor key={widgetId ?? "new"} widgetId={widgetId} widgetType={widgetId ? null : ctx.query.get("type")} />;
        }
        default:
          return <WidgetsLibrary />;
      }
    },
    nav: {
      label: "Widgets",
      group: "Content",
      icon: '<rect x="2" y="2" width="6" height="6" rx="1"/><rect x="10" y="2" width="6" height="6" rx="1"/><rect x="2" y="10" width="6" height="6" rx="1"/><rect x="10" y="10" width="6" height="6" rx="1"/>',
    },
    agentReachable: true,
    routes: [
      // Widget regions is the one case in this manifest where the sidebar highlight and the id an
      // agent is told genuinely disagree, which is why `agentPageId` exists as a per-route field
      // rather than being derived from the panel id everywhere. The sidebar has no "regions" row
      // of its own (it's a sub-view of Widgets), so `widgets` stays highlighted — but an agent that
      // asked for `page.navigate('widget-regions')` has to be told it arrived at `widget-regions`,
      // not `widgets`, or its only correction is to navigate again. `App.tsx`'s old `agentPageId`
      // carried this exact case with the exact same reasoning before the split; see its own
      // comment for the full account of the bug this prevents.
      { pattern: "/regions", view: "widget-regions", agentPageId: "widget-regions" },
      { pattern: "/regions/:regionKey", view: "widget-region-editor", agentPageId: "widget-regions" },
      { pattern: "/new", view: "widget-editor" },
      { pattern: "/:widgetId", view: "widget-editor" },
    ],
  },
  {
    id: "taxonomy",
    render: () => <Taxonomy />,
    nav: {
      label: "Categories & Tags",
      group: "Content",
      icon: '<path d="M9 2l2 3.5 4 .6-3 2.9.7 4L9 11.5 5.6 13l.7-4-3-2.9 4-.6L9 2z"/>',
    },
    agentReachable: true,
  },
  {
    id: "forms",
    render: (ctx) => {
      switch (ctx.view) {
        case "form-editor":
          // Guaranteed present: this view only fires when `/:formId` matched.
          return <FormEditor key={ctx.params.formId} formId={ctx.params.formId} tab="fields" />;
        case "form-submissions":
          // Guaranteed present: this view only fires when `/:formId/submissions` matched. Same
          // `key` as `form-editor` above (both key off `ctx.params.formId`) — switching between
          // Fields and Submissions for the SAME form is a route change, not a remount, so
          // in-progress Fields edits survive the round trip (ADR-063). A different `formId`
          // switching the key IS meant to remount, resetting state for the new form.
          return <FormEditor key={ctx.params.formId} formId={ctx.params.formId} tab="submissions" />;
        default:
          return <FormsList />;
      }
    },
    nav: {
      // Was `pages`'s exact rect-plus-three-lines silhouette, differing only in the last line's
      // width by one grid unit (12/9/4 vs 12/9/3) — invisible with a label next to it,
      // indistinguishable in an icon-only rail (the collision that blocked shipping the rail at
      // all). Redrawn form-shaped per the fix request: two checkbox-and-line rows instead of plain
      // lines, so the silhouette itself says "form fields", not "document".
      label: "Forms",
      group: "Content",
      icon: '<rect x="3" y="2" width="12" height="14" rx="1.5"/><rect x="5.5" y="5.75" width="2" height="2" rx="0.5"/><path d="M9.5 6.75h3.5"/><rect x="5.5" y="10.25" width="2" height="2" rx="0.5"/><path d="M9.5 11.25h3.5"/>',
    },
    agentReachable: true,
    // Longer pattern (2 segments) first, then the bare `/:formId` (1 segment) — same order
    // `collections` already uses for its own `/:contentTypeKey/:entryId` + `/:contentTypeKey` pair
    // above. Segment count alone disambiguates them (`matchRoute` tries each in order and keeps the
    // first whose segment count matches), so `/forms/submissions` — a form literally id'd
    // "submissions" — still resolves as the ONE-segment form-editor route for that id, not a
    // truncated two-segment match (ADR-063's own stated edge case).
    routes: [
      { pattern: "/:formId/submissions", view: "form-submissions" },
      { pattern: "/:formId", view: "form-editor" },
    ],
  },

  // --- People ---
  {
    id: "users",
    render: () => <Users />,
    nav: {
      label: "Users",
      group: "People",
      icon: '<circle cx="9" cy="6" r="3"/><path d="M3 15c0-3.3 2.7-6 6-6s6 2.7 6 6"/>',
    },
    agentReachable: true,
  },
  {
    id: "authentication",
    // Sits directly after Users and above Roles & Permissions: it is a property of how an
    // operator's identity gets INTO the system (sign-in method), which precedes and is distinct
    // from Roles & Permissions (what they can do once in). Registration order is what places it
    // here — this array's order IS `buildNav`'s tiebreak (see this file's own header and
    // `AdminNavItem`'s doc comment in `@jini-ai/admin/core`), and neither entry sets `nav.order`,
    // so the two rows keep the order they are declared in below. Pinned by
    // `__tests__/unit/nav-wiring.unit.test.ts`'s "sits directly between users and roles" test,
    // which fails the moment this stops being consecutive with them — confirmed by temporarily
    // moving this block after `roles` and watching that test go red (mutation-proof per the
    // owner's 2026-08-05 requirement), then restoring this exact position.
    render: () => <Authentication />,
    nav: {
      label: "Authentication",
      group: "People",
      soon: true,
      soonPreviewable: true,
      // A key, not a lock or a shield: `roles`'s icon below is already a card-with-rule-lines
      // silhouette and `users`'s is a person-in-a-circle — a shield or padlock reads close to
      // `roles`'s rounded rectangle at rail size, the exact collision `forms`'s icon comment above
      // documents blocking the icon-only rail once already. A key is a different primitive
      // (a shaft + teeth + a ring) from both neighbors' silhouettes.
      icon: '<circle cx="6" cy="6" r="2.75"/><path d="M8 8l7 7M12 12l1.5-1.5M14 14l1.5-1.5"/>',
    },
    // Reachable via `agent-pages.ts`'s flipped default like every other panel here — there is
    // nothing built yet for an agent to DO on this screen, but landing here to report that back
    // ("payments isn't set up yet") is itself useful, and is exactly the discoverability gap a
    // `false` default would reintroduce.
  },
  {
    id: "roles",
    render: () => <Roles />,
    nav: {
      label: "Roles & Permissions",
      group: "People",
      icon: '<rect x="2.5" y="4" width="13" height="10" rx="1.5"/><path d="M2.5 8h13M6 12h3"/>',
    },
    agentReachable: true,
  },
  {
    id: "members",
    render: () => <Members />,
    nav: {
      label: "Members",
      group: "People",
      icon: '<circle cx="7" cy="6" r="2.5"/><path d="M2 15c0-2.8 2.2-5 5-5s5 2.2 5 5"/><path d="M12.5 6.5l1.3 1.3 2.2-2.5"/>',
    },
    agentReachable: true,
  },
  {
    id: "comments",
    // `soon: true` on a panel that DOES render a real screen — deliberately, and the only entry in
    // this file shaped that way. Every other `soon` row is a `Placeholder`; here the owner's call is
    // that the Comments surface is genuinely unfinished, so the badge sets expectations while the
    // working screen stays reachable. `soonPreviewable` is what makes that combination coherent:
    // without it the row would render as a disabled link and the badge would hide shipped
    // functionality rather than annotate it.
    render: () => <Comments />,
    nav: {
      label: "Comments",
      group: "People",
      soon: true,
      soonPreviewable: true,
      icon: '<path d="M3 4h12v8H8l-3 3v-3H3V4z"/>',
    },
    agentReachable: true,
  },

  // --- Studio ---
  {
    id: "themes",
    // `themes` and `appearance` below both render `Themes`: two accepted spellings, one screen,
    // kept as two panel ids (rather than one panel with two routes) because they are two
    // independently agent-reachable pages at two independent URLs, exactly as `SECTIONS` and
    // `ADMIN_AGENT_PAGE_PATHS` both treated them before. The `appearance` SPELLING is legacy here
    // and should not grow: `admin-appearance` below is the real Appearance feature (restyling the
    // admin's own chrome), and this screen is about SITE themes — which is why the module it lives
    // in is `features/themes/`, not `features/appearance/`.
    render: (ctx) => {
      switch (ctx.view) {
        case "theme-explore":
          // The theme id rides in `?theme=` rather than the path because it names a theme, not a
          // resource in this app's own URL space. Read here from the router's own parsed `query`
          // rather than off `window` so the component stays a pure function of its props.
          //
          // `?page=` (2026-08-27, optional) picks which of that theme's pages to open on — set by
          // the Pages screen's "Theme Pages" rows. `?? undefined` rather than `themeId`'s `?? ""`:
          // an absent `?page=` is a genuine, ordinary state (open the default page), whereas an
          // absent `?theme=` is a malformed URL that has no screen to show.
          //
          // `?file=` (2026-08-30, optional) is the general, full-relative-path form this screen
          // writes back for a NON-page file (`theme-explore-url.hooks.ts`'s
          // `writeThemeExploreSelectionToUrl` — an ordinary page gets the short `?page=<label>` form
          // instead, 2026-08-31) and takes priority over `?page=` when both are present.
          return (
            <ThemeExplore
              themeId={ctx.query.get("theme") ?? ""}
              pageId={ctx.query.get("page") ?? undefined}
              fileId={ctx.query.get("file") ?? undefined}
            />
          );
        default:
          // `?tab=` picks the initially-active tier tab (Declarative/Static/Templated/Code/
          // Marketplace) and stays in sync as the operator switches — same `?tab=` convention as
          // `deployment`'s/`database`'s own entries elsewhere in this file (ADR-063).
          return <Themes tabId={ctx.query.get("tab")} />;
      }
    },
    routes: [{ pattern: "/explore", view: "theme-explore" }],
    nav: {
      label: "Themes",
      group: "Studio",
      icon: '<circle cx="6.2" cy="7" r="3.4"/><circle cx="11.8" cy="7" r="3.4"/><circle cx="9" cy="11.6" r="3.4"/>',
    },
    agentReachable: true,
  },
  {
    id: "skills",
    // No screen yet — `soon: true` + `Placeholder`, the same shape `newsletter` below already uses
    // for a genuinely unbuilt-but-real nav entry. Deliberately NOT a bespoke "coming soon"
    // component: this repo has one idiom for this, and a second would be a second thing to maintain.
    render: () => <Placeholder sectionId="skills" />,
    nav: {
      label: "Skills",
      group: "Studio",
      soon: true,
      icon: '<path d="M9 2.5l1.9 4 4.4.6-3.2 3.1.8 4.3L9 12.5l-3.9 2 .8-4.3L2.7 7.1l4.4-.6z"/>',
    },
    // Reachable via `agent-pages.ts`'s flipped default like every other panel here — there is
    // nothing built yet for an agent to DO on this screen, but landing here to report that back
    // ("payments isn't set up yet") is itself useful, and is exactly the discoverability gap a
    // `false` default would reintroduce.
  },
  {
    id: "design-system",
    render: () => <Placeholder sectionId="design-system" />,
    nav: {
      label: "Design System",
      group: "Studio",
      soon: true,
      // Four tiles, two square and two round — a token/primitive set, distinct from `widgets`'
      // four-equal-squares icon at a glance in the icon-only rail.
      icon: '<rect x="2.5" y="2.5" width="6" height="6" rx="1"/><rect x="9.5" y="2.5" width="6" height="6" rx="3"/><rect x="2.5" y="9.5" width="6" height="6" rx="3"/><rect x="9.5" y="9.5" width="6" height="6" rx="1"/>',
    },
  },
  {
    // No screen yet — `soon: true` + `Placeholder`, the same shape `skills`/`design-system` above
    // use. `id: "admin-appearance"`, NOT `"appearance"` — that id is already taken (see the
    // nav-less `id: "appearance"` entry further down, which renders the SITE-themes `<Themes>`
    // screen, same component `id: "themes"` above also renders under its own label). This entry is
    // for a genuinely different, not-yet-built thing: letting the OPERATOR restyle Tovu's own admin
    // chrome (CSS/motifs for this panel, not the public site) — labelled "Appearance" per the
    // owner's own wording, deliberately placed in Studio next to `themes` where an operator would
    // look for either. The `note` below is what stops that placement reading as a duplicate of
    // `themes`: `ComingSoonNotice`'s one generic "X is coming soon." sentence alone doesn't say
    // WHICH X, and "Appearance" sitting one row below "Themes" is exactly the ambiguity an operator
    // would hit cold. (The screens' own modules no longer collide: site themes live in
    // `features/themes/`, leaving the `appearance` name free for whatever this grows into.)
    id: "admin-appearance",
    render: () => (
      <Placeholder
        sectionId="admin-appearance"
        note="This is the admin panel's own look — not the public site's themes (see Themes above). Planned, not yet built."
      />
    ),
    nav: {
      label: "Appearance",
      group: "Studio",
      soon: true,
      // A paintbrush + drop — a different primitive from `themes`' three overlapping circles,
      // `skills`' four-point star, and `design-system`'s 2x2 tile grid at icon-only rail size.
      icon: '<path d="M12.5 2.5l3 3-6.5 6.5-3.5.8.8-3.5z"/><circle cx="5" cy="14" r="1.5"/>',
    },
  },
  {
    id: "playground",
    // Not `soon: true`, unlike Skills/Design System above — this one is real: a live A2UI surface
    // over `@jini-ai/ui`'s `interactive-ui` registry. See `features/playground/Playground.tsx`'s
    // own header for exactly what does and doesn't work yet (not wired to chat).
    render: () => <Playground />,
    nav: {
      label: "Playground",
      group: "Studio",
      icon: '<path d="M4 3h10v3H4zM4 9h10v6H4z"/><circle cx="6.5" cy="12" r="1"/>',
    },
    agentReachable: true,
  },

  // --- Plugins ---
  // Promoted out of Studio to its own group (owner call). Studio is the design surface — themes,
  // skills, design tokens — whereas plugins are installed capabilities that extend what the site
  // can DO, which is a different axis. Splitting also gives Marketplace somewhere to live: as a
  // Studio row it would have read as a fourth design tool.
  {
    id: "plugins",
    render: () => <Plugins />,
    nav: {
      // SPEC-005 REQ-17/AC-25: the plugin system now ships (SPEC-045's Option A — finish SPEC-005,
      // then add this thin admin UI), so this entry links to the real `Plugins` screen instead of
      // being marked `soon`. Relabelled "Installed" now that it is one of two rows under a
      // "Plugins" heading — "Plugins > Plugins" would have read as a mistake. The panel **id** is
      // deliberately unchanged: it is the route (`/plugins`) and the `agent-pages.ts` allowlist
      // key, so renaming it would break both for a cosmetic gain.
      label: "Installed",
      group: "Plugins",
      icon: '<path d="M7 2v3H4v9h10V5h-3V2H7z"/>',
    },
    agentReachable: true,
  },
  {
    id: "plugins-marketplace",
    render: () => <Placeholder sectionId="plugins-marketplace" />,
    nav: {
      label: "Marketplace",
      group: "Plugins",
      soon: true,
      icon: '<path d="M3 6.5h12l-1 8H4z"/><path d="M6.5 6.5a2.5 2.5 0 015 0"/>',
    },
    // Reachable via `agent-pages.ts`'s flipped default like every other panel here — there is
    // nothing built yet for an agent to DO on this screen, but landing here to report that back
    // ("payments isn't set up yet") is itself useful, and is exactly the discoverability gap a
    // `false` default would reintroduce.
  },
  {
    id: "agent-plugins",
    render: () => <AgentPlugins />,
    nav: {
      // Third row under "Plugins", alongside Installed and Marketplace: surfaces the Agent
      // Plugins open standard (agent-plugins.org, published 2026-08-06) — portable
      // skills/MCP-server bundles, distinct from the site-capability plugins the other two rows
      // manage. No backend yet, but `soonPreviewable: true` (owner request) so the row is a real
      // clickable link to a reminder note + the spec URL, not an inert "coming soon" label.
      label: "Agent Plugins",
      group: "Plugins",
      soon: true,
      soonPreviewable: true,
      icon: '<circle cx="8" cy="8" r="2.25"/><path d="M8 2v2.25M8 11.75V14M2 8h2.25M11.75 8H14M4.5 4.5l1.6 1.6M9.9 9.9l1.6 1.6M4.5 11.5l1.6-1.6M9.9 6.1l1.6-1.6"/>',
    },
    // Reachable via the default, same as every other panel here — still no backend, so an agent
    // landing here finds a reminder note and a spec URL, not a usable feature, but that's still a
    // more useful answer than "no such page" for an operator asking where this is.
  },

  // --- Commerce ---
  {
    id: "payments",
    // Moved out of People (see git history for the prior comment on this panel, which correctly
    // anticipated exactly this reshuffle once there was something to group with). This entry is
    // provider configuration — the `lipay` plugin's Stripe/PayPal integrations — not the billing
    // data itself; the `member_tiers`/`member_subscriptions` tables it charges against are their
    // own `subscriptions` entry below. Commerce groups the two together with Orders and Products
    // because all four are the same business function (running a storefront), which is a
    // meaningfully different concern from People's identity/access management.
    render: () => <Payments />,
    nav: {
      label: "Payments",
      group: "Commerce",
      soon: true,
      soonPreviewable: true,
      icon: '<rect x="2" y="4" width="14" height="10" rx="1.5"/><path d="M2 7.5h14"/><path d="M4.5 11h3"/>',
    },
  },
  {
    id: "orders",
    // No screen yet — `soon: true` + `Placeholder`, the same shape `skills`/`newsletter`/
    // `design-system` use for a genuinely unbuilt-but-real nav entry. `p_store__orders` exists as a
    // table (`store-plugin.ts`) but there is no admin API or screen for it yet, so it renders the
    // plain single-page placeholder rather than `PlaceholderTabs` — there is no named sub-list
    // (Stripe/PayPal, GitHub/AWS) to preview the way `payments`/`deployment` do. `soonPreviewable`
    // is still set, by owner decision: every row in Commerce previews as a real, clickable link
    // rather than a disabled one, so the section doesn't read as some rows working and others not.
    render: () => <Placeholder sectionId="orders" />,
    nav: {
      label: "Orders",
      group: "Commerce",
      soon: true,
      soonPreviewable: true,
      icon: '<rect x="3" y="2" width="10" height="14" rx="1.5"/><path d="M6 6h4M6 9h4"/><path d="M12 11.5l1.5 1.5 2.5-3"/>',
    },
    // Reachable via `agent-pages.ts`'s flipped default like every other panel here — there is
    // nothing built yet for an agent to DO on this screen, but landing here to report that back
    // ("payments isn't set up yet") is itself useful, and is exactly the discoverability gap a
    // `false` default would reintroduce.
  },
  {
    id: "products",
    // Same shape and reasoning as `orders` above: `p_store__products` exists as a table with rows
    // in it (`store-plugin.ts`), but no admin API or screen exists yet.
    render: () => <Placeholder sectionId="products" />,
    nav: {
      label: "Products",
      group: "Commerce",
      soon: true,
      soonPreviewable: true,
      icon: '<path d="M9 2l6 3.2v7.6l-6 3.2-6-3.2V5.2L9 2z"/><path d="M3 5.2L9 8.4l6-3.2M9 8.4v7"/>',
    },
    // Reachable via `agent-pages.ts`'s flipped default like every other panel here — there is
    // nothing built yet for an agent to DO on this screen, but landing here to report that back
    // ("payments isn't set up yet") is itself useful, and is exactly the discoverability gap a
    // `false` default would reintroduce.
  },
  {
    id: "subscriptions",
    // Same `soon` + `Placeholder` shape as `orders`/`products` above, but the most speculative of
    // the four — worth being honest about rather than implying parity. Products has 3 seeded rows,
    // a public `routes/site/products.ts`, and a storefront theme actually serving them; Orders has 0
    // rows but a real, wired path to get them (`store-plugin.ts`'s `checkout()`, called from
    // `routes/site/store.ts`'s buy action — unexercised, not unbuilt). `member_tiers`/
    // `member_subscriptions` (referenced by `payments`'s own comment above) are one level further
    // back: `SqliteMemberTierRepo`/`SqliteMemberSubscriptionRepo` (`src/members/repo.sqlite.ts`)
    // implement full CRUD against them, but nothing in the app calls those methods — no route, no
    // plugin, no admin API. Verified via `grep` for their method names outside that one file and its
    // tests: no hits. This is the recurring-billing counterpart to Payments' provider configuration,
    // but with no reachable code path yet, not just an empty table waiting for traffic.
    render: () => <Placeholder sectionId="subscriptions" />,
    nav: {
      label: "Subscriptions",
      group: "Commerce",
      soon: true,
      soonPreviewable: true,
      icon: '<path d="M9 3a6 6 0 015.2 3M15 3v3.5H11.5"/><path d="M9 15a6 6 0 01-5.2-3M3 15v-3.5H6.5"/>',
    },
    // Reachable via `agent-pages.ts`'s flipped default like every other panel here — there is
    // nothing built yet for an agent to DO on this screen, but landing here to report that back
    // ("payments isn't set up yet") is itself useful, and is exactly the discoverability gap a
    // `false` default would reintroduce.
  },
  {
    id: "billing",
    // Distinct from Payments and Subscriptions, which are both about money coming IN: Payments is
    // provider configuration (the `lipay` plugin's Stripe/PayPal wiring) and Subscriptions is the
    // recurring charges levied against members. Billing is this workspace's own account — what the
    // operator pays to run the site. `soonPreviewable` matches the owner decision recorded on
    // `orders` above: every Commerce row previews as a real clickable link, so the section never
    // reads as some rows working and others not.
    render: () => <Placeholder sectionId="billing" />,
    nav: {
      label: "Billing",
      group: "Commerce",
      soon: true,
      soonPreviewable: true,
      icon: '<path d="M4 2.5h10v13l-2-1.5-1.5 1.5L9 14l-1.5 1.5L6 14l-2 1.5z"/><path d="M6.5 6h5M6.5 9h5"/>',
    },
    // Reachable via `agent-pages.ts`'s flipped default like every other panel here — there is
    // nothing built yet for an agent to DO on this screen, but landing here to report that back
    // ("payments isn't set up yet") is itself useful, and is exactly the discoverability gap a
    // `false` default would reintroduce.
  },

  // --- Operations ---
  {
    id: "database",
    // `?tab=<id>` picks the initially-active tab and stays in sync as the operator switches tabs
    // (see `Database`'s `tabId` prop) — same `?tab=` deep-linking convention as `deployment`'s and
    // `settings`'s own entries elsewhere in this file.
    render: (ctx) => <Database tabId={ctx.query.get("tab")} />,
    nav: {
      // Renamed from "storage" to "database" (ADR-041 naming-correction note, 2026-07): "Storage"
      // read as ambiguous next to the Media/Assets subsystem's own file/blob storage — this
      // section is the ADR-041 read-first ledger of migrations/snapshots/index changes/template
      // upgrades, now called Database.
      label: "Database",
      group: "Operations",
      icon: '<ellipse cx="9" cy="4.5" rx="6" ry="2.2"/><path d="M3 4.5v9c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2v-9"/><path d="M3 9c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2"/>',
    },
    agentReachable: true,
  },
  {
    id: "integrations",
    render: (ctx) => {
      switch (ctx.view) {
        case "integration-deliveries":
          // Guaranteed present: this view only fires when `/:subscriptionId` matched.
          return <IntegrationDeliveries subscriptionId={ctx.params.subscriptionId} />;
        default:
          return <Integrations />;
      }
    },
    nav: {
      label: "Integrations & API",
      group: "Operations",
      icon: '<path d="M6 6l-3 3 3 3M12 6l3 3-3 3M10 4l-2 10"/>',
    },
    agentReachable: true,
    routes: [{ pattern: "/:subscriptionId", view: "integration-deliveries" }],
  },
  {
    id: "recovery",
    render: () => <Recovery />,
    nav: {
      // Renamed from "backups" — ADR-045: Recovery supersedes Backups as a concept, there is no
      // separate Backups screen (see Recovery.tsx's own header comment).
      label: "Recovery",
      group: "Operations",
      icon: '<path d="M9 2a7 7 0 107 7"/><path d="M9 5v4l2.5 1.5"/>',
    },
    agentReachable: true,
  },
  {
    id: "deployment",
    // Five real tabs (Overview, Static Site, Full Site, Dockerfile, History) replaced the
    // `PlaceholderTabs` stub (Home/GitHub/AWS) this pass. `soon: true` is dropped: that flag means
    // "announced but not yet built" (see `PlaceholderTabs.tsx`'s own doc), and this screen no
    // longer renders a generic "X is coming soon" panel anywhere — Overview and Dockerfile are
    // backed by real endpoints, and Static Site/Full Site/History are honest, real empty/explainer
    // states rather than placeholders. Same `?tab=` deep-linking convention as `settings`'s own
    // entry just below.
    //
    // Ordered directly beneath Recovery (owner's call, 2026-08-15), ahead of the two `soon: true`
    // entries rather than after them. Deployment is a BUILT screen and Activity Log / Import &
    // Export are not, so trailing it behind them buried the section's most active surface under two
    // that cannot be used yet. It also puts it beside its nearest neighbour in meaning: Recovery is
    // how a site comes back, Deployment is how it goes out.
    render: (ctx) => <Deployment tabId={ctx.query.get("tab")} />,
    nav: {
      label: "Deployment",
      group: "Operations",
      icon: '<path d="M9 2.5c2.6 1.8 4 4.4 4 7.2L9 13 5 9.7c0-2.8 1.4-5.4 4-7.2z"/><circle cx="9" cy="7.5" r="1.4"/><path d="M6.6 12.4L5 15.5l3-.9M11.4 12.4L13 15.5l-3-.9"/>',
    },
  },
  {
    // A CONNECTION page — save a personal access token per git host so Tovu can read (and later
    // push to) repositories. Not git integration itself: no commit history, rollback, sync,
    // diffing, or branch management here — that is a separate, larger, not-yet-started feature.
    // See `features/source-control/SourceControl.tsx`'s own header for the full scope boundary.
    //
    // Its own Operations entry rather than a Deployment tab (owner's call, 2026-08-15): GitLab and
    // Bitbucket are not deploy targets, so filing this under Deployment would list providers that
    // cannot deploy anything. Deployment already carries five tabs — a sixth holding three
    // sub-tabs would be two levels of nesting, which is exactly what that panel's own numbered-step
    // redesign just paid to remove. Source control is also broader than deployment in what it will
    // eventually cover, so it does not get locked under a feature it outgrows on day one.
    //
    // Ordered directly beneath Deployment, its nearest neighbour in meaning: Deployment is how this
    // site's built output goes OUT, Source Control is how its code comes IN (and, later, goes out
    // too) — the two panels answer adjacent questions about the same "where does this site's
    // material live outside this admin" concern.
    id: "source-control",
    // `?tab=` deep-linking, same convention as `deployment`'s own entry just above — see
    // `SourceControl.tsx`'s own header for the 2026-08-16 page-shell pass that added it.
    render: (ctx) => <SourceControl tabId={ctx.query.get("tab")} />,
    nav: {
      label: "Source Control",
      group: "Operations",
      // Two nodes joined by a line — the generic shape of "a connection," not any one host's mark.
      // Distinct from Deployment's rocket-launch icon: this page connects an ACCOUNT, not a deploy
      // target.
      icon: '<circle cx="6" cy="6" r="2.5"/><circle cx="14" cy="14" r="2.5"/><path d="M7.8 7.8l4.4 4.4"/>',
    },
    // Reachable via the default, same as every other panel here — an agent landing here to report
    // which providers are already connected is a useful answer, even though saving a token itself
    // is a credential-entry action no `data-agent-element` opt-in exposes (same boundary the
    // Static Site tab's own publish-credential fields draw).
  },
  {
    // Consolidates the two multi-named-token credential stores (`publish_credential_sets`,
    // `source_control_credential_sets`) that Deployment/Source Control already write, into one
    // searchable place to see, name, replace, and remove a saved token — `development/todos.md:1208`
    // + its 2026-08-16 supersessions (`ADS-memory/reports/continuity/
    // 2026-08-16-session-6-handoff.md`; `ADS-memory/reports/design/
    // 2026-08-16-access-tokens-visual-spec.md`'s Phase-1 spec). Directly after Source Control, ahead
    // of the two `soon: true` placeholders below — same "a BUILT screen belongs beside its nearest
    // neighbours in meaning, not buried under panels nobody can use yet" reasoning `deployment`'s own
    // comment gives for its position relative to Recovery: this screen reads the exact credentials
    // Deployment and Source Control create.
    // `id: "access-tokens"`, not `"security"` — the panel `id` IS the URL segment (`matchRoute`
    // matches `panels.find(p => p.id === segment)`, `App.tsx`'s own comment on that function), and
    // the owner asked for this page at `/admin/access-tokens` specifically, not `/admin/security`.
    // `nav.label` below is "Security" — the nav LABEL and the route id are independent, same as
    // every other panel here (e.g. `id: "themes"` labels "Themes" while `id: "admin-appearance"`
    // also renders a Themes-shaped screen under a different label).
    id: "access-tokens",
    render: (ctx) => <Security tabId={ctx.query.get("tab")} />,
    nav: {
      label: "Security",
      group: "Operations",
      // A shield — distinct from Deployment's rocket-launch and Source Control's two-nodes-joined
      // glyph.
      icon: '<path d="M9 2 3.5 4v4.2c0 3.6 2.3 6.4 5.5 7.8 3.2-1.4 5.5-4.2 5.5-7.8V4z"/><path d="M6.7 9.2l1.8 1.8 3-3.4"/>',
    },
    // Reachable via the default — an agent asking "what tokens does this install have saved" gets a
    // useful answer from this page's own row summaries (name/provider/saved-date), same boundary
    // Deployment/Source Control already draw: the summary is agent-readable, the credential-entry
    // fields and the destructive Remove action are not (`AccessTokensTab.tsx`'s own `agentHandle`
    // tagging plan).
  },
  {
    id: "activity-log",
    // No screen yet — `soon: true` + `Placeholder`, this repo's one idiom for a real-but-unbuilt
    // nav entry. Sits beside Recovery deliberately: both answer "what happened to my site," one
    // after the fact and one as a way back. The read side already exists in the tool catalog as
    // `database_query_timeline`, so this is a missing surface rather than a missing capability.
    render: () => <Placeholder sectionId="activity-log" />,
    nav: {
      label: "Activity Log",
      group: "Operations",
      soon: true,
      icon: '<circle cx="9" cy="9" r="6.5"/><path d="M9 5v4l2.5 1.5"/>',
    },
    // Reachable via the default, same as every other panel here — nothing built here yet for an
    // agent to act on, but landing here to report so is itself a useful answer.
  },
  {
    id: "import-export",
    // Operations rather than Studio or Administration: this is bulk data movement, so its siblings
    // are Database, Recovery, and Integrations — not the design surface (Studio) and not this
    // site's own configuration (Administration). It is also the one section that is as much about
    // getting data OUT as in, which is an operational guarantee rather than an authoring feature.
    render: () => <Placeholder sectionId="import-export" />,
    nav: {
      label: "Import & Export",
      group: "Operations",
      soon: true,
      icon: '<path d="M9 2.5v8M9 10.5L6 7.5M9 10.5l3-3"/><path d="M3 12v2.5h12V12"/>',
    },
  },

  // --- Administration ---
  {
    id: "settings",
    // `?tab=<id>` picks the initially-active tab and stays in sync as the operator switches tabs
    // (see `SettingsUi`'s `tabId` prop) — same "URL names the sub-state" shape as `widgets`' own
    // `?type=` below, so `/admin/settings?tab=privacy` is both bookmarkable and a page an agent's
    // `page.navigate` could be pointed at once that capability grows param support.
    render: (ctx) => <SettingsUi tabId={ctx.query.get("tab")} />,
    nav: {
      label: "Settings",
      group: "Administration",
      icon: '<circle cx="9" cy="9" r="2.5"/><path d="M9 2v2M9 14v2M2 9h2M14 9h2M4.2 4.2l1.4 1.4M12.4 12.4l1.4 1.4M4.2 13.8l1.4-1.4M12.4 5.6l1.4-1.4"/>',
    },
    agentReachable: true,
  },
  {
    id: "workspace",
    render: () => <Workspace />,
    nav: {
      // SPEC-044 (Workspace Administration). Placement call (OQ-04 in feature.spec.md, not yet
      // resolved by the owner): a standalone nav entry near Settings, its closest sibling concept
      // — could instead become a Settings tab; either satisfies every REQ/AC unchanged.
      label: "Workspace",
      group: "Administration",
      icon: '<rect x="2.5" y="2.5" width="13" height="13" rx="2"/><path d="M2.5 7h13"/>',
    },
    agentReachable: true,
  },
  {
    id: "notifications",
    // Owner placed this "under settings" — read as the Administration group beside Settings, not as
    // a tab inside `SettingsUi`, because it ships as a `soon` NAV entry and a tab would have no nav
    // row to label. Same open question Workspace's own note records above (standalone entry vs
    // Settings tab); resolving one should probably resolve both.
    render: () => <Placeholder sectionId="notifications" />,
    nav: {
      label: "Notifications",
      group: "Administration",
      soon: true,
      icon: '<path d="M9 2.5a4.5 4.5 0 00-4.5 4.5c0 3.5-1.5 4.5-1.5 4.5h12s-1.5-1-1.5-4.5A4.5 4.5 0 009 2.5z"/><path d="M7.5 14a1.5 1.5 0 003 0"/>',
    },
  },
  {
    id: "trash",
    // Administration rather than Content: the trash spans domains — `media_trash_asset`,
    // `comments_trash_comment`, and `redirects_tombstone` all exist today and each currently
    // strands its deletions inside its own section. A single cross-cutting recycle bin belongs
    // with the site-wide surfaces, not under any one content type.
    render: () => <Placeholder sectionId="trash" />,
    nav: {
      label: "Trash",
      group: "Administration",
      soon: true,
      icon: '<path d="M3.5 5h11M7 5V3.5h4V5M5 5l.8 9.5h6.4L13 5"/>',
    },
  },

  // --- Marketing ---
  {
    id: "seo",
    render: () => <Seo />,
    nav: {
      label: "SEO & Metadata",
      group: "Marketing",
      icon: '<circle cx="8" cy="8" r="5.5"/><path d="M12 12l3.5 3.5"/>',
    },
    agentReachable: true,
  },
  {
    id: "redirects",
    render: () => <Redirects />,
    nav: {
      label: "Redirects",
      group: "Marketing",
      icon: '<path d="M3 6h8a3 3 0 010 6H6M3 6l2.5-2.5M3 6l2.5 2.5"/>',
    },
    agentReachable: true,
  },
  {
    id: "newsletter",
    // No screen yet — renders `Placeholder`, exactly as `#/section/newsletter` did, and exactly
    // what a genuinely unbuilt-but-real `nav` entry (`soon: true`) is for.
    render: () => <Placeholder sectionId="newsletter" />,
    nav: {
      label: "Newsletter",
      group: "Marketing",
      soon: true,
      icon: '<rect x="2.5" y="4" width="13" height="9" rx="1.5"/><path d="M2.5 5.5L9 9.5l6.5-4"/>',
    },
    // Reachable via `agent-pages.ts`'s flipped default like every other panel here — there is
    // nothing built yet for an agent to DO on this screen, but landing here to report that back
    // ("payments isn't set up yet") is itself useful, and is exactly the discoverability gap a
    // `false` default would reintroduce.
  },
  {
    id: "analytics",
    render: () => <Analytics />,
    nav: {
      label: "Analytics",
      group: "Marketing",
      icon: '<path d="M3 15V9M8 15V4M13 15v-4"/>',
    },
    agentReachable: true,
  },

  // --- Routable, no sidebar row (deliberate opt-out — see INFO.md "Adding a new admin section") ---
  {
    id: "appearance",
    // Same `?tab=` threading as the `themes` entry above (ADR-063) — `basePath="/appearance"` so a
    // tab click on THIS alias URL navigates within `/appearance`, not away to `/themes`. Without an
    // explicit base, `Themes`' tab-switch `navigate()` would default to `/themes?tab=...` and silently
    // redirect an operator on this legacy alias to the other URL for the identical screen.
    render: (ctx) => <Themes tabId={ctx.query.get("tab")} basePath="/appearance" />,
    agentReachable: true,
  },
];
