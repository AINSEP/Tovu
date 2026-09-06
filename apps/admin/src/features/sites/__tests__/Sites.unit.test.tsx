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

    // The notice is page-level (rendered above the tab bar), so it is visible from BOTH tabs — the
    // reason Create is inert has to reach the operator who opened the questionnaire, not only the
    // one looking at the grid.
    expect(screen.getByText(/Creating and activating sites is turned off on this deployment/)).toBeTruthy();
    for (const button of screen.getAllByRole("button", { name: "Serve after restart" })) {
      expect(button.hasAttribute("disabled")).toBe(true);
    }
  });

  it("disables Create on the questionnaire, and still says why there", () => {
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
    // The full-screen error guard returns before the tab bar itself renders — asserting on the
    // tablist rather than on one button inside one tab, because "Create site" is absent from the
    // "all" tab anyway and that assertion would pass even if the whole screen had rendered.
    expect(screen.queryByRole("tablist")).toBeNull();
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

describe("Sites — the tab system (2026-09-05 owner redesign: 'All sites' and 'New site')", () => {
  it("opens on All sites for a bare URL, and shows the site cards rather than the questionnaire", () => {
    renderSites();
    expect(screen.getByRole("tab", { name: /All sites/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /New site/ }).getAttribute("aria-selected")).toBe("false");
    // Real content, not just the tab's existence: the grid's own cards are what this tab is for.
    // Asserting on the DISPLAY names, which only the cards render — the folder name "alpha" also
    // appears in the `Now serving` card above the tabs, so it would match with no grid at all.
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.queryByLabelText("Folder name")).toBeNull();
  });

  it("opens the questionnaire on ?tab=new, and stops rendering the grid's cards", () => {
    renderSites({}, "new");
    expect(screen.getByRole("tab", { name: /New site/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Folder name")).toBeTruthy();
    // The grid is genuinely gone, not merely visually hidden behind the questionnaire.
    expect(screen.queryByRole("button", { name: "Serve after restart" })).toBeNull();
  });

  it("falls back to All sites for a stale or typo'd ?tab= value rather than blanking the panel", () => {
    renderSites({}, "questionnaire");
    expect(screen.getByRole("tab", { name: /All sites/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Alpha")).toBeTruthy();
  });

  it("counts only the LISTED sites on the All sites tab, so the count can never contradict the grid", () => {
    renderSites({
      snapshot: snapshotFixture({
        sites: [],
        currentSite: { dir: "/repo/sites/tovu-com", name: "tovu-com", dirOverridden: false, listed: false },
      }),
      sites: [],
    });
    // Zero, even though a site is plainly being served — the tab labels the grid beneath it, and a
    // "1" here would be the same lie the unlisted-site notice exists to prevent.
    expect(screen.getByRole("tab", { name: /All sites/ }).textContent).toContain("0");
  });
});

describe("Sites — 'Now serving' is page-level, above the tabs, never inside one", () => {
  it("states the live binding on the New site tab too, not just on All sites", () => {
    renderSites({}, "new");
    // A bookmarked ?tab=new must never be a page that fails to say what is being served.
    expect(screen.getByText("Now serving")).toBeTruthy();
    expect(screen.getByText("/repo/sites/alpha")).toBeTruthy();
  });

  it("carries the unlisted-site warning onto the New site tab as well", () => {
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

  it("carries the pending-choice notice onto the New site tab as well", () => {
    renderSites(
      { snapshot: snapshotFixture({ persistedSiteName: "beta" }), outlook: { kind: "pending", name: "beta" } },
      "new",
    );
    expect(screen.getByText(/Nothing has switched yet/)).toBeTruthy();
  });
});

describe("Sites — the database question tells the truth about what it can actually do", () => {
  it("offers SQLite as the chosen backend, checked and not switchable away from", () => {
    renderSites({}, "new");
    const sqlite = screen.getByLabelText("SQLite") as HTMLInputElement;
    expect(sqlite.checked).toBe(true);
  });

  it("shows Supabase but makes it unselectable, and says why in words", () => {
    renderSites({}, "new");
    const supabase = screen.getByLabelText("Supabase") as HTMLInputElement;
    expect(supabase.disabled).toBe(true);
    expect(supabase.checked).toBe(false);
    // Not merely greyed out — the screen states the fact, because a disabled control with no
    // explanation reads as a bug or a permission problem rather than an unbuilt feature.
    expect(screen.getByText(/Not supported yet/)).toBeTruthy();
  });

  it("keeps the access-token field visible but inert, and says it is saved nowhere", () => {
    renderSites({}, "new");
    const token = screen.getByLabelText("Supabase access token") as HTMLInputElement;
    expect(token.disabled).toBe(true);
    expect(screen.getByText(/isn't stored anywhere yet/)).toBeTruthy();
  });

  it("cannot be made to submit a database choice at all: create sends the name and nothing else", () => {
    // The structural guarantee, not the cosmetic one. Even with the Supabase radio forced on in the
    // DOM — which is exactly what a `disabled` attribute alone would not survive — submitting the
    // form still calls `createSite()`, whose whole signature is zero arguments. There is no state
    // holding a dialect and no argument that could carry one, so the "chose Supabase, silently got
    // SQLite" outcome has no code path to travel down.
    const controller = renderSites({ createName: "gamma" }, "new");
    const supabase = screen.getByLabelText("Supabase") as HTMLInputElement;
    supabase.disabled = false;
    fireEvent.click(supabase);

    fireEvent.submit(screen.getByLabelText("Folder name").closest("form") as HTMLFormElement);
    expect(controller.createSite).toHaveBeenCalledTimes(1);
    expect((controller.createSite as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]).toEqual([]);
  });

  it("says chat data is always SQLite, so the one choice on screen isn't read as covering everything", () => {
    renderSites({}, "new");
    expect(screen.getByText(/Chats always use SQLite/)).toBeTruthy();
  });
});

describe("Sites — the questionnaire still carries every create guard the tile had", () => {
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
