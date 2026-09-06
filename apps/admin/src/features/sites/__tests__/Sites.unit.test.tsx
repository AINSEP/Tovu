import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Sites } from "../Sites";
import type { SitesController } from "../hooks/use-sites.hooks";
import type { AdminSitesSnapshot } from "@/lib/api";

/**
 * @file `Sites` — driven entirely through the `useSitesHook` DI seam, so no `FetchQueryProvider` or
 * network round trip is needed to exercise the rendered states.
 *
 * The requirement these assertions exist for is narrow and absolute: **this screen must never imply
 * a switch happened when it did not.** Three of the blocks below are that requirement, one per way
 * the screen could get it wrong (see `Sites.tsx`'s own header for the enumeration).
 */

const fakeT = (key: string): string => key;

function snapshotFixture(overrides: Partial<AdminSitesSnapshot> = {}): AdminSitesSnapshot {
  return {
    switchingEnabled: true,
    sites: [
      { name: "alpha", dir: "/repo/sites/alpha", displayName: "Alpha", createdAt: "2026-01-01T00:00:00.000Z", active: true },
      { name: "beta", dir: "/repo/sites/beta", displayName: "Beta", createdAt: "2026-02-01T00:00:00.000Z", active: false },
    ],
    currentSite: { dir: "/repo/sites/alpha", name: "alpha", dirOverridden: false, listed: true },
    persistedSiteName: null,
    ...overrides,
  };
}

function controllerFixture(overrides: Partial<SitesController> = {}): SitesController {
  const snapshot = overrides.snapshot ?? snapshotFixture();
  return {
    snapshot,
    sites: snapshot.sites,
    listStatus: "success",
    listError: null,
    writeError: null,
    switchingEnabled: snapshot.switchingEnabled,
    outlook: { kind: "none" },
    createName: "",
    setCreateName: vi.fn(),
    createNameError: null,
    createSite: vi.fn(),
    creating: false,
    createdName: null,
    activate: vi.fn(),
    activatingName: null,
    activation: null,
    restartInstructions: null,
    t: fakeT,
    ...overrides,
  };
}

/**
 * `tabId` is the `?tab=` value `panels.tsx` threads in — omitted here it falls back to the "all"
 * tab, exactly as an operator arriving at a bare `/admin/sites` gets. Tests that exercise the
 * create form pass `"new"`, because that is the tab it lives in.
 */
function renderSites(overrides: Partial<SitesController> = {}, tabId?: string) {
  const controller = controllerFixture(overrides);
  render(<Sites useSitesHook={() => controller} tabId={tabId} />);
  return controller;
}

describe("Sites — the live binding is stated on the served site's own card", () => {
  it("puts the absolute path in a hover tooltip on the card, not in a visible line", () => {
    renderSites();
    // The owner asked for "just a regular square card with a hover tooltip for the actual folder
    // directory" — so the path must be REACHABLE but must not be spending a line of card height.
    // Asserting both halves: a `getByTitle` alone would still pass if the path were also printed.
    expect(screen.getByTitle("/repo/sites/alpha")).toBeTruthy();
    expect(screen.queryByText("/repo/sites/alpha")).toBeNull();
  });

  it("gives the served-but-uninitialized folder a card of its own, green, flagged, and NOT the empty state", () => {
    // The exact state of this repo: `sites/tovu-com` carries neither `config.json` nor
    // `.site-meta.json`, so `listSites` used to drop it and this screen rendered "no sites" on a
    // server that was plainly serving it. `includeServingSite` now composes it in.
    renderSites({
      snapshot: snapshotFixture({
        sites: [{ name: "tovu-com", dir: "/repo/sites/tovu-com", displayName: "tovu-com", createdAt: "2026-01-01T00:00:00.000Z", active: true }],
        currentSite: { dir: "/repo/sites/tovu-com", name: "tovu-com", dirOverridden: false, listed: false },
      }),
      sites: [{ name: "tovu-com", dir: "/repo/sites/tovu-com", displayName: "tovu-com", createdAt: "2026-01-01T00:00:00.000Z", active: true }],
    });

    expect(screen.getByText("tovu-com")).toBeTruthy();
    expect(screen.getByText("Serving now").className).toContain("status-ok");
    // The fact the removed amber banner used to carry, now a quiet badge on the card. Without this
    // the card would promise a folder `tovu serve` will refuse.
    expect(screen.getByText("Not initialized")).toBeTruthy();
    expect(screen.getByTitle(/tovu serve would refuse it/)).toBeTruthy();
    // And the empty state is genuinely not rendered — the site is IN the grid now.
    expect(screen.queryByText(/A folder appears here once Tovu has created it/)).toBeNull();
  });

  it("flags only the served card, never a sibling, when the served folder is uninitialized", () => {
    // The trap this guards: reading `currentSite.listed` per row would paint every card in the grid
    // with the served folder's own state. `siteRegistration` matches on `dir` first.
    renderSites({
      snapshot: snapshotFixture({
        currentSite: { dir: "/repo/sites/alpha", name: "alpha", dirOverridden: false, listed: false },
      }),
    });
    expect(screen.getAllByText("Not initialized")).toHaveLength(1);
  });

  it("never renders the removed 'isn't listed below' sentence, which stopped being true", () => {
    renderSites({
      snapshot: snapshotFixture({
        currentSite: { dir: "/repo/sites/alpha", name: "alpha", dirOverridden: false, listed: false },
      }),
    });
    expect(screen.queryByText(/isn't listed below/)).toBeNull();
    expect(screen.queryByText("Now serving")).toBeNull();
  });

  it("warns that TOVU_SITE_DIR outranks anything Activate saves", () => {
    renderSites({
      snapshot: snapshotFixture({
        currentSite: { dir: "/elsewhere/alpha", name: "alpha", dirOverridden: true, listed: false },
      }),
    });
    expect(screen.getByText(/TOVU_SITE_DIR is set in this server's environment/)).toBeTruthy();
  });
});

describe("Sites — a pending choice is never presented as a completed switch", () => {
  it("names what is STILL being served, and says the daemon is on it too", () => {
    renderSites({
      snapshot: snapshotFixture({ persistedSiteName: "beta" }),
      outlook: { kind: "pending", name: "beta" },
    });
    expect(screen.getByText(/Nothing has switched yet — this server and its agent daemon are both still on/)).toBeTruthy();
    expect(screen.getByText("Queued for next restart")).toBeTruthy();
    // ONE match now, not two: the page-level "Now serving" card that carried the second copy is
    // gone, so the only `Serving now` on screen is `alpha`'s own card badge.
    expect(screen.getAllByText("Serving now")).toHaveLength(1);
    expect(screen.getByText(/beta.*queued/)).toBeTruthy(); // the compact "what's queued" pill
  });

  it("renders the server's own restart prose verbatim when it has one", () => {
    renderSites({
      snapshot: snapshotFixture({ persistedSiteName: "beta" }),
      outlook: { kind: "pending", name: "beta" },
      restartInstructions: "Stop `npm run dev` and start it again.",
    });
    expect(screen.getByText("Stop `npm run dev` and start it again.")).toBeTruthy();
  });

  it("still reports the pending choice after a reload has thrown the response away", () => {
    renderSites({
      snapshot: snapshotFixture({ persistedSiteName: "beta" }),
      outlook: { kind: "pending", name: "beta" },
      restartInstructions: null,
    });
    expect(screen.getByText("Restart the dev server to apply it.")).toBeTruthy();
  });

  it("says a restart will NOT pick the choice up when TOVU_SITE_DIR defeats it", () => {
    renderSites({
      snapshot: snapshotFixture({
        persistedSiteName: "beta",
        currentSite: { dir: "/elsewhere/alpha", name: "alpha", dirOverridden: true, listed: false },
      }),
      outlook: { kind: "pending-ignored", name: "beta" },
    });
    expect(screen.getByText(/so a restart will not pick it up/)).toBeTruthy();
  });
});

describe("Sites — the queued-choice pill (at-a-glance, not just prose)", () => {
  it("states the live site exactly once, on its own card, now that the page-level panel is gone", () => {
    renderSites();
    expect(screen.getAllByText("Serving now")).toHaveLength(1);
    expect(screen.getByText("Serving now").className).toContain("status-ok");
  });

  it("gives a queued-and-will-be-honored choice a warning tone, not the error tone reserved for 'won't apply'", () => {
    renderSites({
      snapshot: snapshotFixture({ persistedSiteName: "beta" }),
      outlook: { kind: "pending", name: "beta" },
    });
    expect(screen.getByText(/beta.*queued/).className).toContain("status-warning");
  });

  it("gives a queued-but-defeated choice an error tone, not the warning tone that would undersell it", () => {
    renderSites({
      snapshot: snapshotFixture({
        persistedSiteName: "beta",
        currentSite: { dir: "/elsewhere/alpha", name: "alpha", dirOverridden: true, listed: false },
      }),
      outlook: { kind: "pending-ignored", name: "beta" },
    });
    expect(screen.getByText(/beta.*won't apply/).className).toContain("status-error");
  });

  it("shows no queued-choice pill at all when nothing is pending", () => {
    renderSites();
    expect(screen.queryByText(/queued/)).toBeNull();
    expect(screen.queryByText(/won't apply/)).toBeNull();
  });
});

describe("Sites — the capability flag", () => {
  it("explains the deployment cannot switch sites and disables Activate", () => {
    renderSites({ snapshot: snapshotFixture({ switchingEnabled: false }) });

    // The notice is page-level, so it is visible from BOTH views — the reason Create is inert has
    // to reach the operator who opened the create screen, not only the one looking at the grid.
    expect(screen.getByText(/Creating and activating sites is turned off on this deployment/)).toBeTruthy();
    for (const button of screen.getAllByRole("button", { name: "Serve after restart" })) {
      expect(button.hasAttribute("disabled")).toBe(true);
    }
  });

  it("disables Create on the create screen, and still says why there", () => {
    renderSites({ snapshot: snapshotFixture({ switchingEnabled: false }) }, "new");

    expect(screen.getByRole("button", { name: "Create site" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Creating and activating sites is turned off on this deployment/)).toBeTruthy();
  });

  it("leaves the served row's own Activate disabled even when switching is on", () => {
    renderSites();
    const buttons = screen.getAllByRole("button", { name: "Serve after restart" });
    // `alpha` is being served, `beta` is not.
    expect(buttons[0].hasAttribute("disabled")).toBe(true);
    expect(buttons[1].hasAttribute("disabled")).toBe(false);
  });
});

describe("Sites — create form safety", () => {
  it("disables the create-name input while a create is in flight, so a second name can't be typed and silently lost", () => {
    renderSites({ creating: true }, "new");
    expect(screen.getByLabelText("Folder name").hasAttribute("disabled")).toBe(true);
  });

  it("leaves the create-name input enabled when nothing is in flight", () => {
    renderSites({ creating: false }, "new");
    expect(screen.getByLabelText("Folder name").hasAttribute("disabled")).toBe(false);
  });

  it("routes every edit through the controller's setCreateName, which is what clears the confirmation", () => {
    const controller = renderSites({ createdName: "gamma" }, "new");
    // The clearing itself lives in `useSites.setCreateName` (pinned by its own hook test); what
    // this pins is that the form still routes its input through THAT setter rather than a local one
    // of its own, which is how the guard would silently die in a restructure.
    fireEvent.change(screen.getByLabelText("Folder name"), { target: { value: "gamma-2" } });
    expect(controller.setCreateName).toHaveBeenCalledWith("gamma-2");
  });
});

describe("Sites — load and error states", () => {
  it("renders a loading notice before the first snapshot arrives", () => {
    renderSites({ snapshot: undefined, sites: [], listStatus: "loading" });
    expect(screen.getByText("Loading sites…")).toBeTruthy();
  });

  it("renders the read failure rather than an empty grid", () => {
    renderSites({ snapshot: undefined, sites: [], listStatus: "error", listError: new Error("server down") });
    expect(screen.getByText("server down")).toBeTruthy();
    // The full-screen error guard returns before the page header and the tab bar render — asserting
    // on the tab bar, which BOTH tabs always show, rather than on "Create site", which is absent
    // from the list tab anyway and would pass even if the screen had rendered.
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("shows a write failure as a banner without hiding the list", () => {
    renderSites({ writeError: "A folder with that name already exists under sites/." });
    expect(screen.getByText("A folder with that name already exists under sites/.")).toBeTruthy();
    // The grid is still rendered underneath the banner — `alpha`'s own card badge proves it.
    expect(screen.getAllByText("Serving now")).toHaveLength(1);
  });
});

describe("Sites — hook injection", () => {
  it("does not hardcode the wired hook: a fake the real one could never produce is what renders", () => {
    // The real hook always starts `snapshot: undefined` and resolves a microtask later, so a
    // synchronously-populated snapshot proves the seam is live rather than decorative — the same
    // technique the upstream `ConfirmDialog dialog-hook injection` block uses.
    renderSites({
      snapshot: snapshotFixture({
        sites: [{ name: "only-a-fake-would-say-this", dir: "/x", displayName: "Fake", createdAt: "2026-01-01T00:00:00.000Z", active: false }],
        currentSite: { dir: "/x2", name: "somewhere-else", dirOverridden: false, listed: false },
      }),
      sites: [{ name: "only-a-fake-would-say-this", dir: "/x", displayName: "Fake", createdAt: "2026-01-01T00:00:00.000Z", active: false }],
    });
    expect(screen.getByText("only-a-fake-would-say-this")).toBeTruthy();
  });
});

describe("Sites — the two tabs the owner asked for, in words, twice", () => {
  it("renders a real tab bar with both tabs on it", () => {
    renderSites();
    // The regression this exists for: a pass that replaced the tabs with a header button plus a
    // `?tab=new` page ended up deleting the one-item tab bar entirely. A tablist with BOTH tabs on
    // it is the shape she asked for, so both halves are asserted — a `getByRole("tablist")` alone
    // would pass on a bar with one tab in it.
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /All sites/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /New site/ })).toBeTruthy();
  });

  it("offers New site as a TAB, never as a header button beside the title", () => {
    renderSites();
    expect(screen.queryByRole("button", { name: /^\+ ?New site$/ })).toBeNull();
    expect(screen.getByRole("tab", { name: /New site/ })).toBeTruthy();
  });

  it("counts only the LISTED sites on the All sites tab", () => {
    renderSites();
    expect(screen.getByRole("tab", { name: /All sites/ }).textContent).toContain("2");
  });

  it("opens on the list for a bare URL, and shows the site cards rather than the create form", () => {
    renderSites();
    // Asserting on the DISPLAY names, which only the cards render — the folder name "alpha" also
    // appears elsewhere on the page, so it would match with no grid at all.
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.queryByLabelText("Folder name")).toBeNull();
    expect(screen.getByRole("tab", { name: /All sites/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("opens the create form INSIDE the second tab, with the tab bar still on screen", () => {
    renderSites({}, "new");
    expect(screen.getByLabelText("Folder name")).toBeTruthy();
    // Not another page: the tab bar is still there, still shows both tabs, and marks this one
    // selected. This is the exact assertion the deleted-tab-bar regression would fail.
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /New site/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /All sites/ })).toBeTruthy();
    // And the grid is genuinely gone, not merely hidden behind the form.
    expect(screen.queryByRole("button", { name: "Serve after restart" })).toBeNull();
  });

  it("keeps ONE page title across both tabs — a tab is not a page, so nothing retitles", () => {
    renderSites({}, "new");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Sites");
    // The full-page port's `← All sites` back link went with the page. A tab bar IS the way back.
    expect(screen.queryByRole("link", { name: /← ?All sites/ })).toBeNull();
  });

  it("navigates rather than holding tab state locally, so ?tab= stays a real deep link", () => {
    renderSites();
    fireEvent.click(screen.getByRole("tab", { name: /New site/ }));
    expect(window.location.search).toBe("?tab=new");
  });

  it("falls back to the list for a stale or typo'd ?tab= value rather than blanking the panel", () => {
    renderSites({}, "questionnaire");
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.queryByLabelText("Folder name")).toBeNull();
  });
});

describe("Sites — the PROCESS-level notices render above BOTH tabs", () => {
  it("carries the TOVU_SITE_DIR override warning onto the New site tab as well", () => {
    // A bookmarked ?tab=new must never hide the reason Activate is inert, and these notices sit
    // ABOVE the tab bar for exactly that reason: Create is the moment an operator is most likely to
    // assume a switch happened.
    renderSites(
      { snapshot: snapshotFixture({ currentSite: { dir: "/elsewhere/alpha", name: "alpha", dirOverridden: true, listed: false } }) },
      "new",
    );
    expect(screen.getByText(/TOVU_SITE_DIR is set in this server's environment/)).toBeTruthy();
  });

  it("renders nothing at all when the process has nothing to report, so the grid moves up", () => {
    // The point of removing the panel was the vertical space. A container that always rendered —
    // even empty — would give it straight back, and `:empty` in CSS cannot hide a box with
    // whitespace children, so this asserts on the DOM rather than trusting the stylesheet.
    const { container } = render(<Sites useSitesHook={() => controllerFixture()} />);
    const notices = container.querySelector(".sites-process-notices");
    expect(notices?.childElementCount).toBe(0);
  });

  it("carries the pending-choice notice onto the New site tab as well", () => {
    renderSites(
      { snapshot: snapshotFixture({ persistedSiteName: "beta" }), outlook: { kind: "pending", name: "beta" } },
      "new",
    );
    expect(screen.getByText(/Nothing has switched yet/)).toBeTruthy();
  });
});

describe("Sites — the ported database picker tells the truth about what it can do", () => {
  it("shows all three of Runner's backends, so the port is the port", () => {
    renderSites({}, "new");
    expect(screen.getByLabelText("SQLite")).toBeTruthy();
    expect(screen.getByLabelText("Supabase")).toBeTruthy();
    expect(screen.getByLabelText("Custom DB Provider")).toBeTruthy();
  });

  it("leaves SQLite chosen and the other two refused", () => {
    renderSites({}, "new");
    expect((screen.getByLabelText("SQLite") as HTMLInputElement).checked).toBe(true);
    for (const name of ["Supabase", "Custom DB Provider"]) {
      const radio = screen.getByLabelText(name) as HTMLInputElement;
      expect(radio.disabled).toBe(true);
      expect(radio.checked).toBe(false);
    }
  });

  it("says why each refused backend is refused, rather than only greying it out", () => {
    renderSites({}, "new");
    // Two, not one — a single match would pass with Custom DB Provider silently unexplained.
    // A disabled control with no stated reason reads as a bug or a permissions problem, not as an
    // unbuilt feature; Runner's own `blocked` status carries the same reasoning in its source.
    expect(screen.getAllByText("Not supported yet")).toHaveLength(2);
    expect(screen.getByText(/Tovu creates every site's content database as SQLite today/)).toBeTruthy();
  });

  it("keeps each vendor's credential fields visible but inert, and says they are stored nowhere", () => {
    renderSites({}, "new");
    for (const label of ["Supabase project URL", "Supabase API key", "Provider name", "Connection string or API endpoint"]) {
      expect((screen.getByLabelText(label) as HTMLInputElement).disabled).toBe(true);
    }
    expect(screen.getAllByText(/isn't stored anywhere yet/).length).toBeGreaterThan(0);
  });

  it("cannot be made to submit a database choice at all: create sends the name and nothing else", () => {
    // The structural guarantee, not the cosmetic one. Even with BOTH unavailable radios forced on
    // in the DOM — which is exactly what a `disabled` attribute alone would not survive —
    // submitting still calls `createSite()`, whose whole signature is zero arguments. There is no
    // state holding a dialect and no argument that could carry one, so "chose Supabase, silently
    // got SQLite" has no code path to travel down.
    const controller = renderSites({ createName: "gamma" }, "new");
    for (const name of ["Supabase", "Custom DB Provider"]) {
      const radio = screen.getByLabelText(name) as HTMLInputElement;
      radio.disabled = false;
      fireEvent.click(radio);
    }

    fireEvent.submit(screen.getByLabelText("Folder name").closest("form") as HTMLFormElement);
    expect(controller.createSite).toHaveBeenCalledTimes(1);
    expect((controller.createSite as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]).toEqual([]);
  });

  it("says chat data is always SQLite, so the one live choice isn't read as covering everything", () => {
    renderSites({}, "new");
    expect(screen.getByText(/Chats always use SQLite/)).toBeTruthy();
  });
});

describe("Sites — creating returns to the first tab, where the new card is", () => {
  it("offers Cancel as a way back to All sites that creates nothing", () => {
    const controller = renderSites({ createName: "gamma" }, "new");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // Leaving is not creating — the guard that matters here is that Cancel never submits the form
    // it sits inside, which a `<button>` without an explicit `type="button"` would do by default.
    expect(controller.createSite).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?tab=all");
  });

  it("returns to All sites when a create SUCCEEDS", () => {
    // The owner's own requirement: "That should go back to the first tab, and then we should see
    // the new website created there." Driven through the controller's `createdName` transition,
    // which is the only signal a success produces.
    window.history.replaceState(null, "", "/admin/sites?tab=new");
    const { rerender } = render(<Sites useSitesHook={() => controllerFixture()} tabId="new" />);
    expect(window.location.search).toBe("?tab=new");

    const created = controllerFixture({ createdName: "gamma" });
    rerender(<Sites useSitesHook={() => created} tabId="new" />);
    expect(window.location.search).toBe("?tab=all");
  });

  it("does NOT yank the operator off a tab they opened deliberately when a create is already recorded", () => {
    // The bug a plain `if (createdName !== null)` effect would ship: mounting with the state
    // already set is not a success EVENT. An operator reopening New site after a create must stay
    // on New site.
    window.history.replaceState(null, "", "/admin/sites?tab=new");
    renderSites({ createdName: "gamma" }, "new");
    expect(window.location.search).toBe("?tab=new");
    expect(screen.getByLabelText("Folder name")).toBeTruthy();
  });

  it("puts the confirmation on All sites, not in the form footer nobody returns to", () => {
    renderSites({ createdName: "gamma" });
    expect(screen.getByText("gamma")).toBeTruthy();
    expect(screen.getByText(/was created\. Activate it to serve after the next restart\./)).toBeTruthy();
  });

  it("keeps no stale confirmation on the New site tab", () => {
    renderSites({ createdName: "gamma" }, "new");
    expect(screen.queryByText(/was created\./)).toBeNull();
  });
});

describe("Sites — the create screen still carries every create guard the tile had", () => {
  it("keeps the multi-condition submit guard: a blank name cannot be submitted", () => {
    renderSites({ createName: "" }, "new");
    expect(screen.getByRole("button", { name: "Create site" }).hasAttribute("disabled")).toBe(true);
  });

  it("enables Create once the name is valid", () => {
    renderSites({ createName: "gamma" }, "new");
    expect(screen.getByRole("button", { name: "Create site" }).hasAttribute("disabled")).toBe(false);
  });

  it("shows the name error in place of the hint, and blocks Create with it", () => {
    renderSites({ createName: "Not Valid", createNameError: "Use lowercase letters, digits, and dashes only." }, "new");
    expect(screen.getByText("Use lowercase letters, digits, and dashes only.")).toBeTruthy();
    expect(screen.queryByText("Lowercase letters, digits, and dashes.")).toBeNull();
    expect(screen.getByRole("button", { name: "Create site" }).hasAttribute("disabled")).toBe(true);
  });

  it("says a created site is not switched to, only created — the restart truth survives the move", () => {
    renderSites({ createdName: "gamma" });
    expect(screen.getByText(/Activate it to serve after the next restart/)).toBeTruthy();
  });

  it("still warns on the form itself that creating switches nothing, before anything is created", () => {
    renderSites({}, "new");
    expect(screen.getByText(/Creating a site never switches this server onto it/)).toBeTruthy();
  });
});

describe("Sites — the All sites empty state", () => {
  it("invites the operator to create one instead of reading as a dead end", () => {
    renderSites({ snapshot: snapshotFixture({ sites: [] }), sites: [] });
    expect(screen.getByText("No listed sites")).toBeTruthy();
    expect(screen.getByRole("link", { name: "New site" })).toBeTruthy();
  });

  it("renders the grid, not the empty state, as soon as there is one listed site", () => {
    renderSites();
    expect(screen.queryByText("No listed sites")).toBeNull();
  });
});
