import { navigate } from "./router";

/**
 * @file Which admin pages an agent may navigate to, and the route path that gets there.
 *
 * This is the allowlist behind `page.navigate` (`@jini-ai/agentic`'s `PAGE_CAPABILITIES`). The
 * capability takes a published page id, never a URL — `executePageCapability` refuses anything
 * outside `listPages()`, which is exactly `Object.keys` of the map built here. So an agent cannot
 * navigate the admin anywhere this file does not name, and adding a destination is a deliberate
 * edit rather than a side effect of adding a route.
 *
 * That manual step is the design, not an oversight — do **not** derive this from `App.tsx`'s
 * `SECTIONS` map. Doing so would make every new admin screen agent-reachable simply by existing,
 * which is the opposite of an allowlist. A new section is only reachable once someone decides it
 * should be. See `apps/admin/INFO.md`, "Adding a new admin section".
 *
 * Ids are the same vocabulary the sidebar and `activeSectionId()` already use, so "take me to
 * redirects" resolves to the id a human would guess and the one already reported as the current
 * page. Keeping a separate agent-facing naming scheme would mean an agent reading
 * `page.find_elements` output could not act on it without a translation table.
 *
 * Detail routes (`/posts/:id`, `/collections/:key/:entryId`, …) are deliberately absent: they need
 * an id an agent has to look up first, and the tool for that is the content catalog
 * (`content_post_list` and friends), not a navigation allowlist that would have to enumerate every
 * row in the database.
 */

/**
 * Published page id → the **route path** that shows it (base-agnostic; `router.ts` adds `/admin`).
 *
 * Every value is checked against `App.tsx`'s `parseRoute` — a path that parser does not recognize
 * silently falls back to the dashboard, which would make `page.navigate` report success while
 * landing somewhere else entirely. For the one-segment section paths below, that means each must be
 * a key of `App.tsx`'s `SECTIONS` map.
 */
export const ADMIN_AGENT_PAGE_PATHS: Readonly<Record<string, string>> = {
  // Top-level routed views.
  dashboard: "/",
  posts: "/posts",
  menus: "/menus",
  widgets: "/widgets",
  "widget-regions": "/widgets/regions",
  integrations: "/integrations",
  forms: "/forms",
  appearance: "/appearance",
  // Section views. These were `#/section/:id` before path routing; the `section/` segment was an
  // artifact of the hash router's dispatch and is gone from URLs entirely.
  analytics: "/analytics",
  collections: "/collections",
  comments: "/comments",
  database: "/database",
  media: "/media",
  members: "/members",
  pages: "/pages",
  plugins: "/plugins",
  recovery: "/recovery",
  redirects: "/redirects",
  roles: "/roles",
  seo: "/seo",
  settings: "/settings",
  taxonomy: "/taxonomy",
  themes: "/themes",
  users: "/users",
  workspace: "/workspace",
};

/**
 * Projects {@link ADMIN_AGENT_PAGE_PATHS} into the `pages` record `createDomPageDriver` takes.
 *
 * Going through `router.ts`'s `navigate` rather than manipulating history directly, on purpose: it
 * is the same transition a human clicking the sidebar causes, so an agent-driven navigation cannot
 * reach a state a person could not reach by clicking. It also `pushState`s, so the back button
 * works afterwards.
 *
 * @returns One navigation thunk per published page id.
 */
export function buildAdminAgentPages(): Readonly<Record<string, () => void>> {
  return Object.fromEntries(
    Object.entries(ADMIN_AGENT_PAGE_PATHS).map(([pageId, routePath]) => [
      pageId,
      () => {
        navigate(routePath);
      },
    ]),
  );
}
