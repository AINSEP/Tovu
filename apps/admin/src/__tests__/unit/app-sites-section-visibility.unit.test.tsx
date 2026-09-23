// @vitest-environment jsdom
import { cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../App";
import {
  resolveSiteSectionRouteGate,
  useSiteSectionAvailability,
  withoutSiteSection,
  type SiteSectionAvailability,
} from "../../App.hooks";
import { FetchQueryProvider } from "../../lib/fetch-query";
import { api, ApiError, type AdminUser } from "../../lib/api";

/**
 * @file The Sites section exists only on a deployment that owns site switching from the admin.
 *
 * The owner's requirement: inside the Tovu desktop app the admin's own "Sites" nav row and page
 * must not be there at all — the Electron shell already switches sites with its own tabs and sites
 * home — while a developer running `npm run dev` keeps both. `TOVU_ENABLE_SITE_SWITCHER` already
 * draws exactly that line (`site-switcher-enabled.ts`: ON for local dev via `dev.mjs`, OFF for a
 * Runner/desktop host and for a hosted install, default OFF), and `GET .../system/sites` already
 * carries its value to this client as `switchingEnabled` — its own header says the value is there
 * "so the UI can decide whether to render the 'Sites' nav item". This file covers the wiring that
 * finally reads it that way.
 *
 * ## What each case here would still pass under, and what that cost
 *
 * "The Sites row is absent" is the assertion this whole file exists for, and on its own it is
 * nearly worthless: it passes just as happily if the sidebar never rendered, if `<App/>` threw
 * during boot, or if the fetch stub starved every screen and the tree came up empty. Every negative
 * assertion below is therefore paired, in the same test, with a POSITIVE control on the two rows
 * that must survive — Overview and AI Assistant, Sites' own neighbours in the ungrouped top row.
 * A nav that failed to render fails those, so the negative can only pass for the right reason.
 *
 * The redirect cases carry the mirror of that problem: "`/admin/sites` does not show Sites" passes
 * under an over-broad fix that redirects unconditionally, or one that redirects before the flag has
 * arrived. Hence the flag-ON case asserting the route still renders Sites and the URL still says
 * `/admin/sites`, and the `unknown` unit case below pinning that a not-yet-known answer holds
 * rather than redirects.
 */

/** A full `AdminSitesSnapshot`, since the Sites screen renders it for real in the flag-ON case. */
function sitesSnapshot(switchingEnabled: boolean) {
  return {
    switchingEnabled,
    sites: [],
    currentSite: { dir: "/tmp/site", name: "site", dirOverridden: false, listed: true },
    persistedSiteName: null,
  };
}

function stubFetch(switchingEnabled: boolean): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string) => {
    const href = String(url);
    if (href.includes("/auth/me")) {
      return new Response(JSON.stringify({ user: { id: "u1", username: "admin" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (href.includes("/system/sites")) {
      return new Response(JSON.stringify(sitesSnapshot(switchingEnabled)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // Every other call this render pulls in (locale, assistant settings, the dashboard's own
    // reads) — a benign superset, the same fallback the sibling App tests in this directory use.
    // `posts`/`settings` are the two the Dashboard reads unguarded inside a `.then`, and the
    // redirect cases below land on exactly that screen.
    return new Response(JSON.stringify({ posts: [], settings: { activeThemeId: "t1" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

beforeEach(() => {
  // jsdom has no `EventSource`; `useAdminSession`'s settings feed and `App`'s page-control bridge
  // both construct one in an effect, and an unstubbed throw tears the tree down — taking the
  // sidebar and `<main>` with it. Inert stub, same as every sibling App test here.
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
  // Unmount before unstubbing, explicitly — see `app-agent-page-identity.unit.test.tsx`'s own
  // afterEach for why RTL's auto-cleanup runs too late to prevent in-flight effects hitting real
  // undici with a relative URL.
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

/** Renders the app at `path`, inside the same `FetchQueryProvider` `main.tsx` wraps it in (the
 *  Sites screen reads through `useFetchQuery`), and resolves once the boot screen has cleared. */
async function renderAt(path: string) {
  window.history.replaceState(null, "", path);
  const { container } = render(
    <FetchQueryProvider>
      <App />
    </FetchQueryProvider>,
  );
  await waitFor(() => expect(container.querySelector(".boot-screen")).toBeNull(), { timeout: 3000 });
  return container;
}

describe("the Sites nav row follows the deployment's site-switcher capability", () => {
  it("keeps the Sites row when the server reports the switcher on (a developer's own npm run dev)", async () => {
    vi.stubGlobal("fetch", stubFetch(true));
    const container = await renderAt("/admin/");

    await waitFor(() => expect(container.querySelector('a[href="/admin/sites"]')).not.toBeNull());
    // The same two controls the hidden case asserts, so both tests describe the same sidebar.
    expect(container.querySelector('a[href="/admin/"]')).not.toBeNull();
    expect(container.querySelector('a[href="/admin/ai-assistant"]')).not.toBeNull();
  });

  it("drops the Sites row when the server reports the switcher off (the desktop app's own server)", async () => {
    vi.stubGlobal("fetch", stubFetch(false));
    const container = await renderAt("/admin/");

    // Positive controls FIRST and in this same test: Sites' two neighbours in the ungrouped top row
    // must still be there, or the assertion below is only proving that the nav failed to render.
    await waitFor(() => expect(container.querySelector('a[href="/admin/ai-assistant"]')).not.toBeNull());
    expect(container.querySelector('a[href="/admin/"]')).not.toBeNull();
    // And a labelled group below the split, so this also proves the `slice(0, 1)`/`slice(1)`
    // boundary did not move when the item was filtered out of group 0.
    expect(container.querySelector('a[href="/admin/posts"]')).not.toBeNull();

    expect(container.querySelector('a[href="/admin/sites"]')).toBeNull();
  });
});

describe("the /admin/sites route itself, not just its nav row", () => {
  it("still renders Sites, and stays on the URL, when the switcher is on", async () => {
    vi.stubGlobal("fetch", stubFetch(true));
    const container = await renderAt("/admin/sites");

    await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-agent-page", "sites"));
    expect(window.location.pathname).toBe("/admin/sites");
  });

  it("redirects a direct visit to the default section when the switcher is off", async () => {
    vi.stubGlobal("fetch", stubFetch(false));
    const container = await renderAt("/admin/sites");

    // The URL, not just the rendered screen: a hidden nav row with a live route leaves the address
    // reachable, which is the half of this feature that a nav-only fix would silently skip.
    await waitFor(() => expect(window.location.pathname).toBe("/admin/"));
    await waitFor(() => expect(container.querySelector("main")).toHaveAttribute("data-agent-page", "dashboard"));
  });
});

describe("resolveSiteSectionRouteGate", () => {
  it("holds rather than redirects while the answer is still unknown", () => {
    // The premature-redirect guard: collapsing `unknown` into "unavailable" would bounce a
    // developer's own /admin/sites deep link to the dashboard in the window before the flag lands.
    expect(resolveSiteSectionRouteGate("sites", "unknown")).toBe("hold");
  });

  it("renders sites only once the deployment has confirmed it has the section", () => {
    expect(resolveSiteSectionRouteGate("sites", "available")).toBe("render");
    expect(resolveSiteSectionRouteGate("sites", "unavailable")).toBe("redirect");
  });

  it("never touches any other panel, whatever the flag says", () => {
    for (const availability of ["unknown", "available", "unavailable"] as const) {
      expect(resolveSiteSectionRouteGate("posts", availability)).toBe("render");
      expect(resolveSiteSectionRouteGate(null, availability)).toBe("render");
    }
  });
});

describe("withoutSiteSection", () => {
  const groups = [
    { items: [{ id: "dashboard", href: "/", label: "Overview" }, { id: "sites", href: "/sites", label: "Sites" }, { id: "ai-assistant", href: "/ai-assistant", label: "AI Assistant" }] },
    { label: "Content", items: [{ id: "posts", href: "/posts", label: "Posts" }] },
  ];

  it("returns the very same array when the section is available", () => {
    // Reference equality, not a deep compare: the visible case must allocate nothing.
    expect(withoutSiteSection(groups, "available")).toBe(groups);
  });

  it("drops only the sites item, keeps every group, and preserves the order of the rest", () => {
    const filtered = withoutSiteSection(groups, "unavailable");

    // Group COUNT and order are the load-bearing part — `App.tsx` slices this array by group index
    // to splice the rail toggle in, so a dropped or reordered group would move that control.
    expect(filtered.map((group) => group.label)).toEqual([undefined, "Content"]);
    expect(filtered[0]?.items.map((item) => item.id)).toEqual(["dashboard", "ai-assistant"]);
    expect(filtered[1]?.items.map((item) => item.id)).toEqual(["posts"]);
  });
});

/** A manually-resolved/rejected promise — pins settlement order across sessions without a timer. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (err: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useSiteSectionAvailability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forgets the previous session's answer at logout and while the next session's own read is in flight", async () => {
    const alice: AdminUser = { id: "u1", username: "alice" };
    const bob: AdminUser = { id: "u2", username: "bob" };
    const second = deferred<ReturnType<typeof sitesSnapshot>>();
    const listSites = vi
      .spyOn(api, "listSites")
      .mockResolvedValueOnce(sitesSnapshot(true))
      .mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook<SiteSectionAvailability, { user: AdminUser | null }>(
      ({ user }) => useSiteSectionAvailability(user),
      { initialProps: { user: alice } },
    );

    await waitFor(() => expect(result.current).toBe("available"));

    // Logout: the session object is gone, so an answer that was keyed to Alice's session must not
    // keep painting the nav/route as available — even though no new read has settled yet.
    rerender({ user: null });
    expect(result.current).toBe("unknown");

    // A new login, before its OWN read has settled: still unknown, never Alice's stale "available".
    rerender({ user: bob });
    expect(result.current).toBe("unknown");

    second.reject(new ApiError("forbidden", 403, "FORBIDDEN"));
    await waitFor(() => expect(result.current).toBe("unavailable"));

    expect(listSites).toHaveBeenCalledTimes(2);
  });
});
