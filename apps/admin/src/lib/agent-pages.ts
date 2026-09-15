import { buildAgentPageMap } from "@jini-ai/admin/core";
import type { DomPageDriverPage } from "@jini-ai/agentic/dom";
import { ADMIN_PANELS } from "../panels";
import { currentRoutePath, navigate } from "./router";
import { publishContentRefresh } from "./content-refresh-bus";

/**
 * @file Which admin pages an agent may navigate to, and the route path that gets there.
 *
 * This is the allowlist behind `page.navigate` (`@jini-ai/agentic`'s `PAGE_CAPABILITIES`). The
 * capability takes a published page id, never a URL — `executePageCapability` refuses anything
 * outside `listPages()`, which is exactly `Object.keys` of the map built here. So an agent cannot
 * navigate the admin anywhere this file does not name.
 *
 * The map itself is derived from `panels.tsx`'s `agentReachable`/`routes[].agentPageId` fields via
 * `@jini-ai/admin/core`'s `buildAgentPageMap` — but unlike that package's own default, Tovu passes
 * `defaultReachable: true` here, so a panel that leaves `agentReachable` unset is INCLUDED, not
 * excluded. That's a deliberate reversal of the package's fail-safe-by-default stance (see
 * `panels.tsx`'s own file header for the reasoning): navigation alone only lets an agent land on a
 * page, never operate anything on it — that needs each control separately tagged with
 * `data-agent-element` — so there is no meaningful risk in an agent knowing a page exists. No panel
 * opts OUT explicitly today; the one that did (`settings-raw`, `agentReachable: false`) was a
 * human-only raw-ledger debugging surface, deleted once `/settings` covered the same rows. The
 * escape hatch is still wired and still honored — it just has no current user.
 *
 * Ids are the same vocabulary the sidebar and `currentPanelId()` already use, so "take me to
 * redirects" resolves to the id a human would guess and the one already reported as the current
 * page. Keeping a separate agent-facing naming scheme would mean an agent reading
 * `page.find_elements` output could not act on it without a translation table.
 *
 * Detail routes (`/posts/:id`, `/collections/:key/:entryId`, …) are deliberately absent unless a
 * panel names one with a param-free pattern (see `widgets`' `/regions` in `panels.tsx`): most need
 * an id an agent has to look up first, and the tool for that is the content catalog
 * (`content_read.content_post` and friends), not a navigation allowlist that would have to enumerate every
 * row in the database.
 */

/**
 * Published page id → the **route path** that shows it (base-agnostic; `router.ts` adds `/admin`).
 *
 * Every value corresponds to a real `panels.tsx` entry (or a param-free detail route on one), so it
 * is always a path `App.tsx`'s `parseRoute` resolves to something other than the dashboard —
 * `buildAgentPageMap` can only produce entries from panels that exist.
 */
export const ADMIN_AGENT_PAGE_PATHS: Readonly<Record<string, string>> = buildAgentPageMap(ADMIN_PANELS, {
  defaultReachable: true,
});

/**
 * `id.split('-')` title-cased — `"widget-regions"` -> `"Widget Regions"`.
 *
 * The fallback label for a published page id with no `nav.label` to use instead: `appearance` has
 * no `nav` entry at all, by design — reachable without a sidebar row — and a per-route agent page
 * id like `widget-regions` was never a panel id
 * in the first place, so it has no `nav` entry to look up either. Both still need SOME label for
 * the site map to be useful, and the id itself, split and title-cased, is the least-surprising one:
 * it is exactly what a human already reads when `page.navigate`'s refusal message names the id raw.
 */
function humanizeId(id: string): string {
  return id.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

/**
 * Panel id → the label an agent should see for it, sourced from `panels.tsx`'s own `nav.label`
 * wherever one exists so the site map never drifts from what the sidebar already calls a section.
 * Falls back to {@link humanizeId} for the handful of panels with no `nav` entry.
 */
const PANEL_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  ADMIN_PANELS.map((panel) => [panel.id, panel.nav?.label ?? humanizeId(panel.id)]),
);

/** The label an agent sees for a published page id. `PANEL_LABELS` is keyed by panel id; a
 *  per-route agent page id (`widget-regions`) was never a panel id, so it falls through to
 *  `humanizeId` here too, not just inside `PANEL_LABELS` itself. */
function labelForPageId(pageId: string): string {
  return PANEL_LABELS[pageId] ?? humanizeId(pageId);
}

/** One agent-navigable admin screen: published page id, label, and route path. */
export interface AdminAgentScreen {
  readonly id: string;
  readonly label: string;
  readonly path: string;
}

/**
 * Every published page id with its label and route path, in {@link ADMIN_AGENT_PAGE_PATHS} order —
 * the same pairs {@link buildAdminAgentPages} hands `page.navigate`, minus the navigate thunk.
 *
 * The source of `apps/website/src/features/site-inspection/admin-screens.generated.ts`, the server's
 * checked-in copy that `site_describe_capabilities` reports (the server cannot import this browser
 * bundle). `__tests__/admin-screens-manifest.unit.test.ts` fails when the two disagree.
 *
 * @returns One `{id, label, path}` per published page id.
 */
export function listAdminAgentScreens(): readonly AdminAgentScreen[] {
  return Object.entries(ADMIN_AGENT_PAGE_PATHS).map(([id, path]) => ({ id, label: labelForPageId(id), path }));
}

/**
 * Projects {@link ADMIN_AGENT_PAGE_PATHS} into the `pages` record `createDomPageDriver` takes —
 * each published page id paired with the label `page.find_elements`/`page.navigate` will show for
 * it, and the thunk that actually gets there.
 *
 * Going through `router.ts`'s `navigate` rather than manipulating history directly, on purpose: it
 * is the same transition a human clicking the sidebar causes, so an agent-driven navigation cannot
 * reach a state a person could not reach by clicking. It also `pushState`s, so the back button
 * works afterwards.
 *
 * @returns One `{label, navigate}` pair per published page id.
 */
export function buildAdminAgentPages(): Readonly<Record<string, DomPageDriverPage>> {
  return Object.fromEntries(
    Object.entries(ADMIN_AGENT_PAGE_PATHS).map(([pageId, routePath]) => [
      pageId,
      {
        label: labelForPageId(pageId),
        navigate: () => {
          // Navigating to the route already displayed is a no-op: `useRouteLocation`'s snapshot
          // string is unchanged, so nothing remounts and the screen keeps rendering what it
          // fetched at mount. Every other destination mounts fresh and fetches in its own mount
          // effect, so this is the only case where an agent asking to SEE a screen would otherwise
          // be shown a stale one.
          if (currentRoutePath() === routePath) publishContentRefresh();
          navigate(routePath);
        },
      },
    ]),
  );
}
