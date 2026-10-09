import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { AllSitesTab } from "../AllSitesTab";
import { SiteTrashTab } from "../SiteTrashTab";
import type { AdminSitesSnapshot } from "@/lib/api";
import type { LocalSitesController } from "../hooks/use-local-sites.hooks";

function localSnapshot(): AdminSitesSnapshot {
  return { switchingEnabled: true, localManagementEnabled: true, canSwitchNow: true,
    persistedSiteName: null, currentSite: { name: "owner", dir: "/sites/owner", listed: true, dirOverridden: false },
    sites: [{ name: "owner", dir: "/sites/owner", displayName: "owner", createdAt: "", active: true },
      { name: "alpha", dir: "/sites/alpha", displayName: "alpha", createdAt: "", active: false },
      { name: "beta", dir: "/sites/beta", displayName: "beta", createdAt: "", active: false }],
    localSites: [{ name: "alpha", status: "running", port: 3101, daemonPort: 3102, pid: 55, adminUrl: "https://localhost:3101/admin/" }] };
}

function recordingController(actions: unknown[], overrides: Partial<LocalSitesController> = {}): LocalSitesController {
  return { busyName: null, error: null, checked: {}, toggleChecked() {}, async run(name, action) { actions.push([name, action]); }, ...overrides };
}

function renderCards(snapshot: AdminSitesSnapshot, controller: LocalSitesController) {
  render(<AllSitesTab sites={snapshot.sites} snapshot={snapshot} switchingEnabled activatingName={null} createdName={null}
    onActivate={() => {}} localSites={controller} t={(key) => key} />);
}

/** The menu's item labels, in order, after opening the named card's "⋯" trigger. */
function openMenu(site: string): string[] {
  fireEvent.click(screen.getByRole("button", { name: `More actions for ${site}` }));
  return within(screen.getByRole("menu", { name: `More actions for ${site}` })).getAllByRole("menuitem").map((item) => item.textContent ?? "");
}

it("serving card: status pill, Default meta, Open in a new tab, and no lifecycle, Delete or menu", () => {
  renderCards(localSnapshot(), recordingController([]));
  const owner = within(screen.getByTitle("/sites/owner"));
  expect(owner.getByText("Serving now").className).toContain("status-ok");
  expect(owner.getByText("Default").className).toBe("site-card-meta");
  const open = owner.getByRole("link", { name: "Open owner in a new tab" });
  expect(open).toHaveAttribute("href", "/admin/"); expect(open).toHaveAttribute("target", "_blank");
  expect(owner.queryByRole("button", { name: "Start owner" })).toBeNull();
  expect(owner.queryByRole("button", { name: "Stop owner" })).toBeNull();
  expect(owner.queryByRole("button", { name: /Delete/ })).toBeNull();
  expect(owner.queryByRole("button", { name: "More actions for owner" })).toBeNull();
});

it("running card: port pill, Open + secondary Stop, and a menu without Delete", () => {
  const actions: unknown[] = [];
  renderCards(localSnapshot(), recordingController(actions));
  const alpha = within(screen.getByTitle("/sites/alpha"));
  expect(alpha.getByText("Running on :3101").className).toContain("status-ok");
  expect(alpha.getByRole("link", { name: "Open alpha in a new tab" })).toHaveAttribute("href", "https://localhost:3101/admin/");
  const stop = alpha.getByRole("button", { name: "Stop alpha" });
  expect(stop.className).toBe("btn-secondary");
  fireEvent.click(stop);
  expect(actions).toEqual([["alpha", "stop"]]);
  expect(openMenu("alpha")).toEqual(["Make default", "Switch now"]);
});

it("stopped card: primary Start, no Open, and Delete… last and danger-toned in the menu", () => {
  const actions: unknown[] = [];
  renderCards(localSnapshot(), recordingController(actions));
  const beta = within(screen.getByTitle("/sites/beta"));
  expect(beta.getByText("Stopped").className).toContain("status-neutral");
  expect(beta.queryByRole("link")).toBeNull();
  expect(beta.getByRole("button", { name: "Start beta" }).className).toBe("btn-primary");
  expect(openMenu("beta")).toEqual(["Make default", "Switch now", "Delete…"]);
  const remove = screen.getByRole("menuitem", { name: "Delete…" });
  expect(remove.className).toContain("btn-danger");
  fireEvent.click(remove);
  expect(actions).toEqual([["beta", "trash"]]);
  expect(screen.queryByRole("menu")).toBeNull();
});

it("crashed and starting cards state their process, and a host that cannot switch drops Switch now", () => {
  const snapshot = localSnapshot();
  snapshot.canSwitchNow = false;
  snapshot.localSites = [
    { name: "alpha", status: "crashed", port: null, daemonPort: null, pid: null, adminUrl: null },
    { name: "beta", status: "starting", port: 3201, daemonPort: 3202, pid: 7, adminUrl: null },
  ];
  renderCards(snapshot, recordingController([]));
  const alpha = within(screen.getByTitle("/sites/alpha"));
  expect(alpha.getByText("Crashed").className).toContain("status-error");
  expect(alpha.getByRole("button", { name: "Start alpha" })).toBeEnabled();
  expect(openMenu("alpha")).toEqual(["Make default", "Delete…"]);
  const beta = within(screen.getByTitle("/sites/beta"));
  expect(beta.getByText("Starting…").className).toContain("status-warning");
  expect(beta.getByText(":3201").className).toBe("site-card-meta");
  expect(beta.getByRole("button", { name: "Stop beta" })).toBeEnabled();
});

it("disables the visible lifecycle button while any local action is in flight", () => {
  renderCards(localSnapshot(), recordingController([], { busyName: "alpha" }));
  expect(screen.getByRole("button", { name: "Start beta" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Stop alpha" })).toBeDisabled();
});

it("production hides lifecycle controls and Trash; permanent deletion appears only for a selected Trash card", () => {
  const snapshot: AdminSitesSnapshot = { sites: [], switchingEnabled: false, localManagementEnabled: false,
    persistedSiteName: null, currentSite: { name: "owner", dir: "/sites/owner", listed: true, dirOverridden: false },
    trash: [{ id: "id", name: "alpha", displayName: "Alpha" }] };
  const actions: unknown[] = [];
  const toggles: unknown[] = [];
  const controller = recordingController(actions, { toggleChecked: (id, value) => { toggles.push([id, value]); } });
  const { rerender } = render(<SiteTrashTab snapshot={snapshot} controller={controller} t={(key) => key} />);
  expect(screen.queryByRole("button")).toBeNull();
  snapshot.localManagementEnabled = true;
  rerender(<SiteTrashTab snapshot={snapshot} controller={controller} t={(key) => key} />);
  const card = within(screen.getByRole("group", { name: "Site Trash" }));
  expect(card.getByText("In Trash").className).toContain("status-neutral");
  expect(card.getByText("Alpha").className).toBe("site-card-display-name");
  expect(card.queryByRole("button", { name: "Delete permanently alpha" })).toBeNull();
  fireEvent.click(card.getByRole("checkbox", { name: "Select for permanent deletion alpha" }));
  expect(toggles).toEqual([["id", true]]);
  fireEvent.click(card.getByRole("button", { name: "Restore alpha" }));
  controller.checked.id = true;
  rerender(<SiteTrashTab snapshot={snapshot} controller={controller} t={(key) => key} />);
  const remove = screen.getByRole("button", { name: "Delete permanently alpha" });
  expect(remove.className).toBe("btn-danger");
  fireEvent.click(remove);
  expect(actions).toEqual([["id", "restore"], ["id", "delete"]]);
});

it("Trash says it is empty instead of rendering an empty grid", () => {
  const snapshot: AdminSitesSnapshot = { sites: [], switchingEnabled: true, localManagementEnabled: true, trash: [],
    persistedSiteName: null, currentSite: { name: "owner", dir: "/sites/owner", listed: true, dirOverridden: false } };
  render(<SiteTrashTab snapshot={snapshot} controller={recordingController([])} t={(key) => key} />);
  expect(screen.getByText("Site Trash is empty.")).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Site Trash" })).toBeNull();
});
