import { buildAgentPageMap } from "@jini-ai/admin/core";
import { ADMIN_PANELS } from "../panels";
import { navigate } from "./router";

/**
 * @file Which admin pages an agent may navigate to, and the route path that gets there.
 *
 * This is the allowlist behind `page.navigate` (`@jini-ai/agentic`'s `PAGE_CAPABILITIES`). The
 * capability takes a published page id, never a URL — `executePageCapability` refuses anything
 * outside `listPages()`, which is exactly `Object.keys` of the map built here. So an agent cannot
 * navigate the admin anywhere this file does not name.
 *
 * The map itself is now derived from `panels.tsx`'s `agentReachable`/`routes[].agentPageId` fields
 * via `@jini-ai/admin/core`'s `buildAgentPageMap`, but the allowlist property this file's header
 * used to insist on is unchanged and enforced one level up, in the package: `agentReachable`
 * defaults to `false` on every panel, so a panel author who forgets to opt in is excluded, not
 * included — adding a destination is still a deliberate edit (setting the field in `panels.tsx`),
 * never a side effect of adding a route. See that package's `manifest/types.ts` header for why this
 * is strictly safer than deriving from a routing/dispatch map: forgetting to think about agent
 * reachability now fails safe by construction, not just by convention.
 *
 * Ids are the same vocabulary the sidebar and `currentPanelId()` already use, so "take me to
 * redirects" resolves to the id a human would guess and the one already reported as the current
 * page. Keeping a separate agent-facing naming scheme would mean an agent reading
 * `page.find_elements` output could not act on it without a translation table.
 *
 * Detail routes (`/posts/:id`, `/collections/:key/:entryId`, …) are deliberately absent unless a
 * panel names one with a param-free pattern (see `widgets`' `/regions` in `panels.tsx`): most need
 * an id an agent has to look up first, and the tool for that is the content catalog
 * (`content_post_list` and friends), not a navigation allowlist that would have to enumerate every
 * row in the database.
 */

/**
 * Published page id → the **route path** that shows it (base-agnostic; `router.ts` adds `/admin`).
 *
 * Every value corresponds to a real `panels.tsx` entry (or a param-free detail route on one), so it
 * is always a path `App.tsx`'s `parseRoute` resolves to something other than the dashboard —
 * `buildAgentPageMap` can only produce entries from panels that exist.
 */
export const ADMIN_AGENT_PAGE_PATHS: Readonly<Record<string, string>> = buildAgentPageMap(ADMIN_PANELS);

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
