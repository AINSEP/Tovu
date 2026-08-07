import type { ReactNode } from "react";
import type { AdminPanel } from "@jini-ai/admin/core";
import { Appearance } from "./features/appearance";
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
import { Roles } from "./features/roles";
import { Settings } from "./features/settings-raw";
import { SettingsUi } from "./features/settings";
import { Seo } from "./features/seo";
import { Redirects } from "./features/redirects";
import { Plugins } from "./features/plugins";
import { FormsList, FormEditor } from "./features/forms";
import { Collections, CollectionEntries, CollectionEntryEditor } from "./features/collections";
import { Taxonomy } from "./features/taxonomy";
import { Database } from "./features/database";
import { Recovery } from "./features/recovery";
import { WidgetsLibrary, WidgetInstanceEditor, WidgetRegions, WidgetRegionEditor } from "./features/widgets";
import { Workspace } from "./features/workspace";
import { AiAssistant } from "./features/ai-assistant";

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
 * right to insist on it: `nav.ts` presence and agent reachability are both *deliberate opt-ins*,
 * not things a new section should get simply by being routable — `appearance` and `settings-raw`
 * are reachable with no sidebar row, and an agent may only navigate where `agent-pages.ts` names,
 * on purpose. `@jini-ai/admin/core`'s `AdminPanel` keeps that exact reasoning but as fields on one
 * declaration: `nav` is optional (omit it and a panel is routable but unlisted), and
 * `agentReachable` defaults to `false` and must be opted into explicitly. A panel author who
 * forgets to think about agent reachability gets `false` — the safe default — rather than a panel
 * silently becoming agent-reachable by existing in a dispatch map, which is what deriving it from
 * `SECTIONS` would have done.
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
    render: () => <AiAssistant />,
    nav: {
      // Sits in the ungrouped top row directly under Overview rather than in "Design & System",
      // because the control it owns is an incident switch: the operator reaching for it is
      // dealing with a leak, a bad deploy, or runaway spend, and should not have to scroll a
      // grouped menu to find the off switch. Kept out of "Marketing" for the same reason — this
      // is not a growth surface, it is a kill switch with a roadmap attached.
      label: "AI Assistant",
      icon: '<rect x="3" y="5" width="12" height="9" rx="2.5"/><path d="M9 5V2.5M6.5 9v.01M11.5 9v.01M7 12h4"/><path d="M1.5 8.5v2M16.5 8.5v2"/>',
    },
    // Not agent-reachable, by design: this IS the assistant surface. An agent navigating to its
    // own dock is not a meaningful action, and the allowlist default (`false`, unset) is correct
    // here without needing a comment at every other panel that also leaves it unset.
  },

  // --- Content ---
  {
    id: "pages",
    render: (ctx) => {
      switch (ctx.view) {
        case "page-editor":
          // Guaranteed present: this view only fires when `/:pageId` matched.
          return <PageEditor pageId={ctx.params.pageId} />;
        default:
          return <Pages />;
      }
    },
    routes: [{ pattern: "/:pageId", view: "page-editor" }],
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
          return <PostEditor postId={ctx.params.postId} />;
        default:
          return <Posts />;
      }
    },
    nav: {
      // Was a plain 3-line stack (`M3 4h12M3 8h12M3 12h8`) — pixel-identical in silhouette to
      // `settings-raw`'s icon below (same three widths, same pattern), invisible with labels
      // present but indistinguishable in the icon-only rail. Redrawn as a bulleted list (small
      // marker + line per row) so the two read as different controls at a glance; `settings-raw`
      // keeps its plain lines, since "raw ledger of rows" is the more literal fit for that one.
      label: "Posts",
      group: "Content",
      icon: '<circle cx="3.5" cy="4.5" r="1"/><path d="M6.5 4.5h9"/><circle cx="3.5" cy="9" r="1"/><path d="M6.5 9h9"/><circle cx="3.5" cy="13.5" r="1"/><path d="M6.5 13.5h6"/>',
    },
    agentReachable: true,
    routes: [{ pattern: "/:postId", view: "post-editor" }],
  },
  {
    id: "media",
    render: () => <Media />,
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
          return <MenuEditor menuId={ctx.params.menuId ?? null} />;
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
          return <WidgetRegionEditor regionKey={ctx.params.regionKey} />;
        case "widget-editor": {
          // Same split as `menus`: the `/new` pattern captures no `widgetId`, so its presence is
          // what distinguishes "editing" from "creating" — `widgetType` only ever came from the
          // query string on the create path.
          const widgetId = ctx.params.widgetId ?? null;
          return <WidgetInstanceEditor widgetId={widgetId} widgetType={widgetId ? null : ctx.query.get("type")} />;
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
          return <FormEditor formId={ctx.params.formId} />;
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
    routes: [{ pattern: "/:formId", view: "form-editor" }],
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
    render: () => (
      <PlaceholderTabs
        sectionId="authentication"
        tabs={[
          { id: "home", label: "Home" },
          { id: "google", label: "Google" },
          { id: "facebook", label: "Facebook" },
          { id: "linkedin", label: "LinkedIn" },
        ]}
      />
    ),
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
    // Not agent-reachable: there is nothing built here yet for an agent to do.
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
    render: () => <Comments />,
    nav: {
      label: "Comments",
      group: "People",
      icon: '<path d="M3 4h12v8H8l-3 3v-3H3V4z"/>',
    },
    agentReachable: true,
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
    render: () => (
      <PlaceholderTabs
        sectionId="payments"
        tabs={[
          { id: "home", label: "Home" },
          { id: "stripe", label: "Stripe" },
          { id: "paypal", label: "PayPal" },
        ]}
      />
    ),
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
    // Not agent-reachable: there is nothing built here yet for an agent to do.
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
    // Not agent-reachable: there is nothing built here yet for an agent to do.
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
    // Not agent-reachable: there is nothing built here yet for an agent to do.
  },

  // --- Studio ---
  {
    id: "themes",
    // `themes` and `appearance` below both render `Appearance`: two accepted spellings, one
    // screen, kept as two panel ids (rather than one panel with two routes) because they are two
    // independently agent-reachable pages at two independent URLs, exactly as `SECTIONS` and
    // `ADMIN_AGENT_PAGE_PATHS` both treated them before.
    render: () => <Appearance />,
    nav: {
      label: "Themes",
      group: "Studio",
      icon: '<circle cx="6.2" cy="7" r="3.4"/><circle cx="11.8" cy="7" r="3.4"/><circle cx="9" cy="11.6" r="3.4"/>',
    },
    agentReachable: true,
  },
  {
    id: "plugins",
    render: () => <Plugins />,
    nav: {
      // SPEC-005 REQ-17/AC-25: the plugin system now ships (SPEC-045's Option A — finish SPEC-005,
      // then add this thin admin UI), so this entry links to the real `Plugins` screen instead of
      // being marked `soon`.
      label: "Plugins",
      group: "Studio",
      icon: '<path d="M7 2v3H4v9h10V5h-3V2H7z"/>',
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
    // Not agent-reachable: there is nothing built here yet for an agent to do.
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

  // --- Operations ---
  {
    id: "database",
    render: () => <Database />,
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
    render: () => (
      <PlaceholderTabs
        sectionId="deployment"
        tabs={[
          { id: "home", label: "Home" },
          { id: "github", label: "GitHub" },
          { id: "aws", label: "AWS" },
        ]}
      />
    ),
    nav: {
      label: "Deployment",
      group: "Operations",
      soon: true,
      soonPreviewable: true,
      icon: '<path d="M9 2.5c2.6 1.8 4 4.4 4 7.2L9 13 5 9.7c0-2.8 1.4-5.4 4-7.2z"/><circle cx="9" cy="7.5" r="1.4"/><path d="M6.6 12.4L5 15.5l3-.9M11.4 12.4L13 15.5l-3-.9"/>',
    },
  },

  // --- Administration ---
  {
    id: "settings",
    render: () => <SettingsUi />,
    nav: {
      label: "Settings",
      group: "Administration",
      icon: '<circle cx="9" cy="9" r="2.5"/><path d="M9 2v2M9 14v2M2 9h2M14 9h2M4.2 4.2l1.4 1.4M12.4 12.4l1.4 1.4M4.2 13.8l1.4-1.4M12.4 5.6l1.4-1.4"/>',
    },
    agentReachable: true,
  },
  {
    id: "settings-raw",
    // The SPEC-007 raw namespace/key ledger inspector, kept reachable now that `/settings` renders
    // the curated tabbed surface ported from Open Design. Both read and write the same
    // `content.db` rows through the ADR-028 chokepoint — a second *view*, not a second store.
    // No `nav` entry — deliberately reachable without a sidebar row, same as `appearance` below.
    // Not agent-reachable, by the same allowlist logic as `ai-assistant`: this is a human-only
    // debugging surface, not a destination worth publishing.
    render: () => <Settings />,
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
    // Not agent-reachable: there is nothing built here yet for an agent to do.
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
    render: () => <Appearance />,
    agentReachable: true,
  },
];
