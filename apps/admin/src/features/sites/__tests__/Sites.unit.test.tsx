import { render, screen } from "@testing-library/react";
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

function renderSites(overrides: Partial<SitesController> = {}) {
  const controller = controllerFixture(overrides);
  render(<Sites useSitesHook={() => controller} />);
  return controller;
}

describe("Sites — the live binding is stated from currentSite, never inferred from a row", () => {
  it("renders the served folder and its absolute path", () => {
    renderSites();
    expect(screen.getByText("/repo/sites/alpha")).toBeTruthy();
  });

  it("says so when the served site is absent from the table, instead of reading as 'no sites'", () => {
    renderSites({
      snapshot: snapshotFixture({
        sites: [],
        currentSite: { dir: "/repo/sites/tovu-com", name: "tovu-com", dirOverridden: false, listed: false },
      }),
      sites: [],
    });
    expect(screen.getByText(/isn't in the table below/)).toBeTruthy();
    // The live folder is still named on screen, even though nothing is listed.
    expect(screen.getByText("/repo/sites/tovu-com")).toBeTruthy();
    expect(screen.getByText("No sites are listed yet. Create one above.")).toBeTruthy();
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
  it("explains the deployment cannot switch sites and disables both writes", () => {
    renderSites({ snapshot: snapshotFixture({ switchingEnabled: false }) });

    expect(screen.getByText(/Creating and activating sites is turned off on this deployment/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create site" }).hasAttribute("disabled")).toBe(true);
    for (const button of screen.getAllByRole("button", { name: "Serve after restart" })) {
      expect(button.hasAttribute("disabled")).toBe(true);
    }
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
    renderSites({ creating: true });
    expect(screen.getByLabelText("Folder name").hasAttribute("disabled")).toBe(true);
  });

  it("leaves the create-name input enabled when nothing is in flight", () => {
    renderSites({ creating: false });
    expect(screen.getByLabelText("Folder name").hasAttribute("disabled")).toBe(false);
  });
});

describe("Sites — load and error states", () => {
  it("renders a loading notice before the first snapshot arrives", () => {
    renderSites({ snapshot: undefined, sites: [], listStatus: "loading" });
    expect(screen.getByText("Loading sites…")).toBeTruthy();
  });

  it("renders the read failure rather than an empty table", () => {
    renderSites({ snapshot: undefined, sites: [], listStatus: "error", listError: new Error("server down") });
    expect(screen.getByText("server down")).toBeTruthy();
    expect(screen.queryByText("No sites are listed yet. Create one above.")).toBeNull();
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
