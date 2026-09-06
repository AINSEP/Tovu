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
 * `tabId` is the `?tab=` value `panels.tsx` threads in (tab redesign, 2026-09-05) — omitted here it
 * falls back to the "all" tab, exactly as an operator arriving at a bare `/admin/sites` gets. Tests
 * that exercise the create questionnaire pass `"new"`, because that is now where the form lives.
 */
function renderSites(overrides: Partial<SitesController> = {}, tabId?: string) {
  const controller = controllerFixture(overrides);
  render(<Sites useSitesHook={() => controller} tabId={tabId} />);
  return controller;
}

describe("Sites — the live binding is stated from currentSite, never inferred from a row", () => {
  it("renders the served folder and its absolute path", () => {
    renderSites();
    expect(screen.getByText("/repo/sites/alpha")).toBeTruthy();
  });

  it("says so when the served site is absent from the grid, instead of reading as 'no sites'", () => {
    renderSites({
      snapshot: snapshotFixture({
        sites: [],
        currentSite: { dir: "/repo/sites/tovu-com", name: "tovu-com", dirOverridden: false, listed: false },
      }),
      sites: [],
    });
    expect(screen.getByText(/isn't listed below/)).toBeTruthy();
    // The live folder is still named on screen, even though nothing is listed.
    expect(screen.getByText("/repo/sites/tovu-com")).toBeTruthy();
    // Tab redesign (2026-09-05): the Create tile no longer sits in the grid, so "zero listed sites"
    // renders as a real empty state instead — one that must NOT read as "you have no sites" while
    // `Now serving` names a live one directly above it. Asserting the empty state's own copy (which
    // points back at that card) rather than merely that some create control exists: an assertion on
    // a button's presence would still pass under an empty state that said "No sites." full stop.
    expect(screen.getByText(/What's serving now is above/)).toBeTruthy();
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
    // Two matches now, not one: the Now Serving card's own head badge (added for at-a-glance
    // legibility) plus `alpha`'s row badge — both true, since `alpha` is still what's live.
    expect(screen.getAllByText("Serving now")).toHaveLength(2);
    expect(screen.getByText(/beta.*queued/)).toBeTruthy(); // the card head's compact "what's queued" pill
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

describe("Sites — the Now Serving card's own head badges (at-a-glance, not just prose)", () => {
  it("always shows the live state, in the same wording and tone the row table gives it", () => {
    renderSites();
    // Card head badge plus `alpha`'s own row badge — same string, same color, by design.
    expect(screen.getAllByText("Serving now")).toHaveLength(2);
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

  it("clears the 'Created.' banner the moment the name is edited again", () => {
    const controller = renderSites({ createdName: "gamma" }, "new");
    expect(screen.getByText(/Created\./)).toBeTruthy();
    // The clearing itself lives in `useSites.setCreateName` (pinned by its own hook test); what
    // this pins is that the questionnaire still routes its input through THAT setter rather than a
    // local one of its own, which is how the guard would silently die in this restructure.
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
    // The full-screen error guard returns before the page header renders — asserting on the
    // header's own New site button, which the list view always shows, rather than on "Create site",
    // which is absent from the list view anyway and would pass even if the screen had rendered.
    expect(screen.queryByRole("button", { name: /New site/ })).toBeNull();
  });

  it("shows a write failure as a banner without hiding the list", () => {
    renderSites({ writeError: "A folder with that name already exists under sites/." });
    expect(screen.getByText("A folder with that name already exists under sites/.")).toBeTruthy();
    // Card head badge plus `alpha`'s own row badge — see the pending-choice block above.
    expect(screen.getAllByText("Serving now")).toHaveLength(2);
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

describe("Sites — the list/create views (Runner port: a header button, not a tab)", () => {
  it("opens on the list for a bare URL, and shows the site cards rather than the create screen", () => {
    renderSites();
    // Asserting on the DISPLAY names, which only the cards render — the folder name "alpha" also
    // appears in the `Now serving` card above, so it would match with no grid at all.
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.queryByLabelText("Folder name")).toBeNull();
  });

  it("offers New site as a header button, never as a tab", () => {
    renderSites();
    expect(screen.getByRole("button", { name: /New site/ })).toBeTruthy();
    // The pass this replaced made it a tab. Nothing on this screen is a tablist any more, so a
    // regression back to that shape fails here rather than silently passing a button query.
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("opens the create screen on ?tab=new, and stops rendering the grid's cards", () => {
    renderSites({}, "new");
    expect(screen.getByLabelText("Folder name")).toBeTruthy();
    // The grid is genuinely gone, not merely visually hidden behind the create screen.
    expect(screen.queryByRole("button", { name: "Serve after restart" })).toBeNull();
  });

  it("retitles the page on the create screen, the way Runner's own header does", () => {
    renderSites({}, "new");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Create a site");
    // And puts the way back on screen — Runner's `← All websites`.
    expect(screen.getByRole("link", { name: /All sites/ })).toBeTruthy();
  });

  it("hides the header's New site button on the create screen, so nothing links to where you are", () => {
    renderSites({}, "new");
    expect(screen.queryByRole("button", { name: /New site/ })).toBeNull();
  });

  it("falls back to the list for a stale or typo'd ?tab= value rather than blanking the panel", () => {
    renderSites({}, "questionnaire");
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.queryByLabelText("Folder name")).toBeNull();
  });
});

describe("Sites — 'Now serving' is page-level: it renders above BOTH views", () => {
  it("states the live binding on the create screen too, not just on the list", () => {
    renderSites({}, "new");
    // A bookmarked ?tab=new must never be a page that fails to say what is being served. Runner's
    // own create screen is a full-page takeover that hides its fleet chrome; this deliberately does
    // not follow it there, because Create is the moment an operator is most likely to assume a
    // switch happened.
    expect(screen.getByText("Now serving")).toBeTruthy();
    expect(screen.getByText("/repo/sites/alpha")).toBeTruthy();
  });

  it("carries the unlisted-site warning onto the create screen as well", () => {
    renderSites(
      {
        snapshot: snapshotFixture({
          sites: [],
          currentSite: { dir: "/repo/sites/tovu-com", name: "tovu-com", dirOverridden: false, listed: false },
        }),
        sites: [],
      },
      "new",
    );
    expect(screen.getByText(/isn't listed below/)).toBeTruthy();
  });

  it("carries the pending-choice notice onto the create screen as well", () => {
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

describe("Sites — the create screen's own navigation", () => {
  it("offers Cancel as a way out that creates nothing", () => {
    const controller = renderSites({ createName: "gamma" }, "new");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // Leaving is not creating — the guard that matters here is that Cancel never submits the form
    // it sits inside, which a `<button>` without an explicit `type="button"` would do by default.
    expect(controller.createSite).not.toHaveBeenCalled();
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

  it("says the new site is not switched to, only created — the restart truth survives the move", () => {
    renderSites({ createdName: "gamma" }, "new");
    expect(screen.getByText(/Activate it to serve after the next restart/)).toBeTruthy();
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
