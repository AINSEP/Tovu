// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { agentPageId, App, parseRoute } from "../../App";
import { ADMIN_AGENT_PAGE_PATHS } from "../../lib/agent-pages";

/**
 * @file The page id an agent reads back must be the id it navigated to.
 *
 * `data-agent-page` is not decoration: `page.navigate` returns `{ navigatedTo, before, after }`,
 * where `after` is read straight off this attribute, and `page.find_elements` tags every element
 * handle with its nearest `[data-agent-page]` ancestor. So the value here is the app's answer to
 * "where am I", and an agent has no other source for it.
 *
 * It used to come from `activeSectionId`, the same function that decides which sidebar row lights
 * up — which is a different question that only usually has the same answer. Widget regions is where
 * they part: `agent-pages.ts` publishes `widget-regions`, the sidebar has no such row and highlights
 * `widgets`. `page.navigate("widget-regions")` therefore landed on the correct screen and then
 * reported `after: "widgets"` — telling the agent it had arrived somewhere it never asked for, with
 * no correction available to it except navigating again.
 *
 * These cases pin both halves at once: the reported id, and the sidebar highlight that must NOT
 * have moved when the two were split apart.
 */

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ user: { id: "u1", username: "admin" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    /*
     * A superset body, so whichever of these screens mounts finds the keys it reads. None of them
     * renders anything this file asserts on — only the route the app resolved to matters — but the
     * shapes still have to be right: `WidgetRegionEditor` reads `r.placements` and renders
     * `placements.length` unguarded, so a missing key throws during render and takes `<main>` (and
     * therefore the attribute under test) down with it.
     */
    return new Response(
      JSON.stringify({
        regions: [],
        area: { regionKey: "sidebar", enabled: true },
        placements: [],
        widgets: [],
        instances: [],
        // The published-page sweep below renders every screen including the Dashboard, whose
        // effects read `r.posts.length` and `r.settings.activeThemeId` unguarded. Absent keys throw
        // inside a `.then`, which surfaces as an unhandled rejection rather than a failed assertion
        // — noise that would obscure a genuine failure in this file.
        posts: [],
        settings: { activeThemeId: "t1" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  // jsdom has no `EventSource`, and `App`'s page-control bridge constructs one in an effect. Left
  // unstubbed it tears the tree down, taking `<main>` — and therefore the attribute under test —
  // with it. An inert stub is enough; nothing here exercises page control.
  vi.stubGlobal(
    "EventSource",
    class {
      close() {}
      addEventListener() {}
      removeEventListener() {}
    },
  );
});

afterEach(() => {
  // Unmount BEFORE unstubbing, and explicitly rather than relying on RTL's auto-cleanup. Vitest
  // runs `afterEach` hooks in reverse registration order, and RTL registers its own on import —
  // i.e. after this one — so the automatic version would tear the tree down only once `fetch` had
  // already been restored. Any effect still in flight then hits real undici with a relative URL
  // ("Failed to parse URL from /api/…") and reports as an unhandled rejection attributed to
  // whichever test happened to be last.
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

/** Renders `App` at `path` and resolves once the boot screen has cleared. */
async function renderAt(path: string) {
  // `replaceState`, not `location.pathname = …`: jsdom does not implement real navigation, so an
  // assignment leaves the URL alone and the app renders the dashboard — passing vacuously.
  window.history.replaceState(null, "", path);
  const { container } = render(<App />);
  await waitFor(() => expect(container.querySelector(".boot-screen")).toBeNull(), { timeout: 3000 });
  return container;
}

describe("data-agent-page reports the published page id, not the sidebar row", () => {
  it("/admin/widgets/regions reports widget-regions, the id agent-pages.ts publishes", async () => {
    const container = await renderAt("/admin/widgets/regions");

    // The regression: this was "widgets".
    expect(container.querySelector("main")).toHaveAttribute("data-agent-page", "widget-regions");
  });

  it("…while the sidebar still highlights Widgets, which has no regions row of its own", async () => {
    const container = await renderAt("/admin/widgets/regions");

    // Splitting the two functions must not cost the highlight — there is no `widget-regions` nav
    // item to move it to, so `widgets` staying current is the correct behaviour, not a leftover.
    expect(container.querySelector('a[href="/admin/widgets"]')).toHaveAttribute("aria-current", "page");
  });

  it("the region editor reports its list page, the same way /posts/:id reports posts", async () => {
    const container = await renderAt("/admin/widgets/regions/sidebar");

    expect(container.querySelector("main")).toHaveAttribute("data-agent-page", "widget-regions");
  });

  it("/admin/widgets is unchanged — the split must not move the ordinary case", async () => {
    const container = await renderAt("/admin/widgets");

    expect(container.querySelector("main")).toHaveAttribute("data-agent-page", "widgets");
  });

  it.each(Object.entries(ADMIN_AGENT_PAGE_PATHS))(
    "page.navigate(%s) lands on a route that reports %s back",
    (pageId, routePath) => {
      /*
       * The invariant, stated in the only direction it actually holds — an external review was right
       * that the earlier version of this test overclaimed. It was named "every id reported is one
       * page.navigate will accept" while checking three widget routes: both narrower than its name
       * and, as a general claim, false. `/admin/ai-assistant`, `/admin/newsletter` and every legacy
       * `/admin/section/<unknown>` route legitimately report an id `ADMIN_AGENT_PAGE_PATHS` does
       * not publish. (An earlier version of this list also named `/admin/settings-raw`; that panel
       * was deleted, so the route no longer exists to report anything at all.) That is the
       * allowlist working as designed — those screens are reachable by a human and deliberately
       * not by an agent — and reporting where you are is not the same as advertising somewhere to
       * go.
       *
       * What must hold is the round trip: if an agent CAN navigate somewhere, arriving has to report
       * the id it asked for. Otherwise `page.navigate` returns an `after` contradicting its own
       * `navigatedTo`, which is exactly the `widget-regions` bug.
       *
       * Asserted against the parser rather than by rendering, unlike the cases above. Rendering all
       * ~25 published screens would make this a test of every screen's data-fetching shape — one
       * shared `fetch` stub satisfying Dashboard, Appearance, WidgetRegionEditor and the rest at
       * once — so it would break whenever an unrelated screen gained a field, while proving nothing
       * more about routing. The rendered cases above already pin that `agentPageId` is what reaches
       * `data-agent-page`; this pins the mapping across every entry.
       */
      expect(agentPageId(parseRoute(routePath))).toBe(pageId);
    },
  );
});
