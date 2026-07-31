/**
 * @file Which admin pages an agent may navigate to, and the hash that gets there.
 *
 * This is the allowlist behind `page.navigate` (`@jini-ai/agentic`'s `PAGE_CAPABILITIES`). The
 * capability takes a published page id, never a URL — `executePageCapability` refuses anything
 * outside `listPages()`, which is exactly `Object.keys` of the map built here. So an agent cannot
 * navigate the admin anywhere this file does not name, and adding a destination is a deliberate
 * edit rather than a side effect of adding a route.
 *
 * Ids are the same vocabulary the sidebar and `activeSectionId()` already use, so "take me to
 * redirects" resolves to the id a human would guess and the one already reported as the current
 * page. Keeping a separate agent-facing naming scheme would mean an agent reading
 * `page.find_elements` output could not act on it without a translation table.
 *
 * Detail routes (`#/posts/:id`, `#/collections/:key/:entryId`, …) are deliberately absent: they
 * need an id an agent has to look up first, and the tool for that is the content catalog
 * (`content_post_list` and friends), not a navigation allowlist that would have to enumerate
 * every row in the database.
 */

/**
 * Published page id → the hash that shows it.
 *
 * Every value is checked against `App.tsx`'s `parseHash` — a hash this router does not recognize
 * silently falls back to the dashboard, which would make `page.navigate` report success while
 * landing somewhere else entirely.
 */
export const ADMIN_AGENT_PAGE_HASHES: Readonly<Record<string, string>> = {
  // Top-level routed views.
  dashboard: "#/",
  posts: "#/posts",
  menus: "#/menus",
  widgets: "#/widgets",
  "widget-regions": "#/widgets/regions",
  integrations: "#/integrations",
  forms: "#/forms",
  // `#/appearance` is its own accepted spelling in `parseHash`, not a `#/section/` route.
  appearance: "#/appearance",
  // Section views, all reached through the generic `#/section/:id` route.
  analytics: "#/section/analytics",
  collections: "#/section/collections",
  comments: "#/section/comments",
  database: "#/section/database",
  media: "#/section/media",
  members: "#/section/members",
  pages: "#/section/pages",
  plugins: "#/section/plugins",
  recovery: "#/section/recovery",
  redirects: "#/section/redirects",
  roles: "#/section/roles",
  seo: "#/section/seo",
  settings: "#/section/settings",
  taxonomy: "#/section/taxonomy",
  themes: "#/section/themes",
  users: "#/section/users",
  workspace: "#/section/workspace",
};

/**
 * Projects {@link ADMIN_AGENT_PAGE_HASHES} into the `pages` record `createDomPageDriver` takes.
 *
 * Assigning `location.hash` rather than calling the router directly on purpose: it is the same
 * transition a human clicking the sidebar causes, so an agent-driven navigation goes through
 * `App.tsx`'s own `hashchange` listener and cannot reach a state a person could not reach by
 * clicking. It also means the back button works afterwards.
 *
 * @returns One navigation thunk per published page id.
 */
export function buildAdminAgentPages(): Readonly<Record<string, () => void>> {
  return Object.fromEntries(
    Object.entries(ADMIN_AGENT_PAGE_HASHES).map(([pageId, hash]) => [
      pageId,
      () => {
        window.location.hash = hash;
      },
    ]),
  );
}
