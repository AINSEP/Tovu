import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { AdminSiteListEntry, AdminSitesSnapshot } from "@/lib/api";
import { LocalSiteConfirmDialog } from "../LocalSiteConfirmDialog";
import { useSiteConfirm } from "../hooks/use-site-confirm.hooks";
import type { LocalSitesController } from "../hooks/use-local-sites.hooks";
import {
  buildSiteCardMenuItems,
  resolveSiteCardMeta,
  resolveSiteIsDefault,
  resolveSiteRunningTitle,
  resolveSiteCardView,
  resolveSiteStatusPill,
  resolveTrashCardActions,
} from "../Sites.hooks";

const t = (key: string) => key;
const alpha: AdminSiteListEntry = { name: "alpha", dir: "/sites/alpha", displayName: "alpha", active: false, createdAt: "" };

function snapshot(overrides: Partial<AdminSitesSnapshot> = {}): AdminSitesSnapshot {
  return { sites: [], switchingEnabled: true, localManagementEnabled: true, canSwitchNow: true, persistedSiteName: null,
    currentSite: { name: "owner", dir: "/sites/owner", listed: true, dirOverridden: false }, ...overrides };
}

function view(overrides: Partial<Parameters<typeof resolveSiteCardView>[0]> = {}) {
  return resolveSiteCardView({ site: alpha, snapshot: snapshot(), busyName: null, switchingEnabled: true, activatingName: null, managed: true, ...overrides });
}

describe("resolveSiteCardView — visible actions per state", () => {
  it("stopped: primary Start, no Open, full menu with Delete last", () => {
    expect(view()).toEqual({ lifecycle: { action: "start", labelKey: "Start", className: "btn-primary", disabled: false }, openUrl: null, menu: ["make-default", "switch", "trash"] });
  });

  it("running: secondary Stop, the ready admin URL, and no trash for a live process", () => {
    const running = snapshot({ localSites: [{ name: "alpha", status: "running", pid: 9, port: 3101, daemonPort: 3102, adminUrl: "https://localhost:3101/admin/" }] });
    expect(view({ snapshot: running })).toEqual({ lifecycle: { action: "stop", labelKey: "Stop", className: "btn-secondary", disabled: false }, openUrl: "https://localhost:3101/admin/", menu: ["make-default", "switch"] });
  });

  it("serving: Open only, nothing in the menu", () => {
    expect(view({ site: { ...alpha, dir: "/sites/owner", name: "owner" } })).toEqual({ lifecycle: null, openUrl: "/admin/", menu: [],
      disabledMenuTitleKey: "Stop or remove isn't available for the site you're using." });
  });

  it("the saved default, an in-flight activation, or switching off each drop Make default", () => {
    expect(view({ snapshot: snapshot({ persistedSiteName: "alpha" }) }).menu).toEqual(["switch", "trash"]);
    expect(view({ activatingName: "beta" }).menu).toEqual(["switch", "trash"]);
    expect(view({ switchingEnabled: false }).menu).toEqual(["switch", "trash"]);
  });

  it("unmanaged (no controller, or capability off) shows no lifecycle, Open, Switch or Delete", () => {
    expect(view({ managed: false })).toEqual({ lifecycle: null, openUrl: null, menu: ["make-default"] });
    expect(view({ snapshot: snapshot({ localManagementEnabled: false }) })).toEqual({ lifecycle: null, openUrl: null, menu: ["make-default"] });
  });

  it("busy keeps the lifecycle button but disables it", () => {
    expect(view({ busyName: "beta" }).lifecycle?.disabled).toBe(true);
  });
});

describe("resolveSiteCardView — external processes and live pids", () => {
  it("a Desktop-owned running card offers its URL and has no Web stop action", () => {
    const site = { name: "alpha", dir: "/home/alpha", displayName: "Alpha", createdAt: "2026-10-09", active: false };
    const snapshot: AdminSitesSnapshot = { sites: [site], switchingEnabled: true, localManagementEnabled: true, persistedSiteName: null,
      currentSite: { name: "owner", dir: "/home/owner", listed: true, dirOverridden: false },
      localSites: [{ name: "alpha", status: "running", pid: 10, port: 3456, daemonPort: null, adminUrl: "http://localhost:3456/admin/", app: "Desktop", external: true }] };
    const view = resolveSiteCardView({ site, snapshot, busyName: null, switchingEnabled: true, activatingName: null, managed: true });
    expect(view.lifecycle).toBeNull(); expect(view.openUrl).toBe("http://localhost:3456/admin/"); expect(view.menu).not.toContain("trash");
  });

  it("a lease alone supplies the existing Open action even without local lifecycle management", () => {
    const site = { name: "outside", dir: "/outside", displayName: "Outside", createdAt: "2026-10-09", active: false,
      running: { pid: 10, port: 3456, app: "Desktop", started: "2026-10-09T00:00:00.000Z", scheme: "https" as const } };
    const snapshot: AdminSitesSnapshot = { sites: [site], switchingEnabled: false, persistedSiteName: null,
      currentSite: { name: "owner", dir: "/owner", listed: true, dirOverridden: true } };
    const view = resolveSiteCardView({ site, snapshot, busyName: null, switchingEnabled: false, activatingName: null, managed: false });
    expect(view.openUrl).toBe("https://localhost:3456/admin/"); expect(view.lifecycle).toBeNull(); expect(view.menu).toEqual([]);
  });

  it("crashed but still holding a pid: Stop, not Start, and no trash", () => {
    const crashed = snapshot({ localSites: [{ name: "alpha", status: "crashed", pid: 7, port: null, daemonPort: null, adminUrl: null }] });
    expect(view({ snapshot: crashed })).toEqual({ lifecycle: { action: "stop", labelKey: "Stop", className: "btn-secondary", disabled: false }, openUrl: null, menu: ["make-default", "switch"] });
  });

  it("crashed with no pid left: Start again, and trash is offered", () => {
    const crashed = snapshot({ localSites: [{ name: "alpha", status: "crashed", pid: null, port: null, daemonPort: null, adminUrl: null }] });
    expect(view({ snapshot: crashed })).toEqual({ lifecycle: { action: "start", labelKey: "Start", className: "btn-primary", disabled: false }, openUrl: null, menu: ["make-default", "switch", "trash"] });
  });

  it("starting: Stop is offered but no Open until the admin is ready", () => {
    const starting = snapshot({ localSites: [{ name: "alpha", status: "starting", pid: 3, port: 3101, daemonPort: null, adminUrl: "https://localhost:3101/admin/" }] });
    expect(view({ snapshot: starting })).toEqual({ lifecycle: { action: "stop", labelKey: "Stop", className: "btn-secondary", disabled: false }, openUrl: null, menu: ["make-default", "switch"] });
  });

  it("a starting lease (port 0) gives no Open URL", () => {
    const site = { ...alpha, running: { pid: 10, port: 0, app: "Desktop", started: "2026-10-09T00:00:00.000Z", scheme: "http" as const } };
    expect(view({ site, managed: false })).toEqual({ lifecycle: null, openUrl: null, menu: ["make-default"] });
  });

  it("a host that cannot switch now drops Switch now from the menu", () => {
    expect(view({ snapshot: snapshot({ canSwitchNow: false }) }).menu).toEqual(["make-default", "trash"]);
  });
});

it("without local management, a supervised child still drives the status pill (pinned)", () => {
  const unmanaged = snapshot({ localManagementEnabled: false, localSites: [{ name: "alpha", status: "running", pid: 1, port: 3101, daemonPort: null, adminUrl: null }] });
  expect(resolveSiteStatusPill({ site: alpha, snapshot: unmanaged, t })).toEqual({ toneClass: "status-ok", label: "Running" });
});

describe("resolveSiteStatusPill and resolveSiteCardMeta", () => {
  it("states the process with local management, and the binding state without it", () => {
    const local = (status: "starting" | "running" | "stopped" | "crashed", port: number | null = 3101) =>
      snapshot({ localSites: [{ name: "alpha", status, pid: null, port, daemonPort: null, adminUrl: null }] });
    expect(resolveSiteStatusPill({ site: alpha, snapshot: local("running"), t })).toEqual({ toneClass: "status-ok", label: "Running on :3101" });
    expect(resolveSiteStatusPill({ site: alpha, snapshot: local("running", null), t })).toEqual({ toneClass: "status-ok", label: "Running" });
    expect(resolveSiteStatusPill({ site: alpha, snapshot: local("starting"), t })).toEqual({ toneClass: "status-warning", label: "Starting…" });
    expect(resolveSiteStatusPill({ site: alpha, snapshot: local("crashed"), t })).toEqual({ toneClass: "status-error", label: "Crashed" });
    expect(resolveSiteStatusPill({ site: alpha, snapshot: snapshot(), t })).toEqual({ toneClass: "status-neutral", label: "Stopped" });
    expect(resolveSiteStatusPill({ site: { ...alpha, dir: "/sites/owner" }, snapshot: local("running"), t })).toEqual({ toneClass: "status-ok", label: "Serving now" });
    expect(resolveSiteStatusPill({ site: alpha, snapshot: snapshot({ localManagementEnabled: false }), t })).toEqual({ toneClass: "status-neutral", label: "Not in use" });
  });

  it("adds only facts the pill does not state", () => {
    const starting = snapshot({ localSites: [{ name: "alpha", status: "starting", pid: 1, port: 3201, daemonPort: null, adminUrl: null }] });
    expect(resolveSiteCardMeta({ site: alpha, snapshot: starting, activatingName: null, t })).toBe(":3201");
    expect(resolveSiteCardMeta({ site: alpha, snapshot: snapshot({ persistedSiteName: "alpha" }), activatingName: "alpha", t })).toBe("Saving…");
    expect(resolveSiteCardMeta({ site: alpha, snapshot: snapshot(), activatingName: null, t })).toBeNull();
    expect(resolveSiteCardMeta({ site: { ...alpha, name: "owner" }, snapshot: snapshot(), activatingName: null, t })).toBeNull();
  });

  it("marks the default site for the star and puts the running app in the pill's tooltip", () => {
    // 2026-10-09: "Default" and "Running in …" left the card's text; the facts stay.
    expect(resolveSiteIsDefault({ ...alpha, name: "owner" }, snapshot())).toBe(true);
    expect(resolveSiteIsDefault(alpha, snapshot({ persistedSiteName: "alpha" }))).toBe(true);
    expect(resolveSiteIsDefault(alpha, snapshot())).toBe(false);
    const running = (port: number) => ({ ...alpha, running: { pid: 1, port, app: "Web", started: "2026-10-09T00:00:00.000Z", scheme: "https" as const } });
    expect(resolveSiteRunningTitle({ site: running(3000), t })).toBe("Running in Web (port 3000)");
    expect(resolveSiteRunningTitle({ site: running(0), t })).toBe("Running in Web (starting)");
    expect(resolveSiteRunningTitle({ site: alpha, t })).toBeUndefined();
  });
});

describe("buildSiteCardMenuItems", () => {
  it("maps menu actions to labelled items; Delete… is danger and routes through the controller", async () => {
    const runs: unknown[] = [], activations: string[] = [];
    const controller: LocalSitesController = { busyName: null, error: null, checked: {}, toggleChecked() {}, async run(name, action) { runs.push([name, action]); } };
    const items = buildSiteCardMenuItems({ site: alpha, menu: ["make-default", "switch", "trash"], onActivate: (name) => activations.push(name), controller, t });
    expect(items.map(({ key, label, tone }) => ({ key, label, tone }))).toEqual([
      { key: "make-default", label: "Make default", tone: undefined },
      { key: "switch", label: "Switch now", tone: undefined },
      { key: "trash", label: "Delete…", tone: "danger" },
    ]);
    items.forEach((item) => item.onSelect());
    expect(activations).toEqual(["alpha"]);
    expect(runs).toEqual([["alpha", "switch"], ["alpha", "trash"]]);
    expect(() => buildSiteCardMenuItems({ site: alpha, menu: ["switch", "trash"], onActivate() {}, t }).forEach((item) => item.onSelect())).not.toThrow();
  });
});

it("resolveTrashCardActions exposes delete only after selection and blocks both while busy", () => {
  expect(resolveTrashCardActions({ id: "x", checked: {}, busyName: null })).toEqual({ selected: false, restoreDisabled: false, deleteDisabled: true });
  expect(resolveTrashCardActions({ id: "x", checked: { x: true }, busyName: null })).toEqual({ selected: true, restoreDisabled: false, deleteDisabled: false });
  expect(resolveTrashCardActions({ id: "x", checked: { x: true }, busyName: "y" })).toEqual({ selected: true, restoreDisabled: true, deleteDisabled: true });
});

describe("useSiteConfirm", () => {
  it("resolves true/false from the dialog and titles itself per action", async () => {
    const { result } = renderHook(() => useSiteConfirm({ t }));
    expect(result.current.open).toBe(false);
    let answer!: Promise<boolean>;
    act(() => { answer = result.current.confirm("Move this site to Trash? You can restore it later.", { action: "trash" }); });
    expect(result.current).toMatchObject({ open: true, title: "Move site to Trash?", confirmLabel: "Move to Trash", tone: "danger", body: "Move this site to Trash? You can restore it later." });
    act(() => result.current.onConfirm());
    await expect(answer).resolves.toBe(true);
    expect(result.current.open).toBe(false);
    act(() => { answer = result.current.confirm("Switch now? Unsaved changes will be lost.", { action: "switch" }); });
    expect(result.current).toMatchObject({ title: "Switch to this site now?", confirmLabel: "Switch now", tone: "warning" });
    act(() => result.current.onCancel());
    await expect(answer).resolves.toBe(false);
  });

  it("a second request cancels the first instead of leaving it pending", async () => {
    const { result } = renderHook(() => useSiteConfirm({ t }));
    let first!: Promise<boolean>, second!: Promise<boolean>;
    act(() => { first = result.current.confirm("one", { action: "trash" }); });
    act(() => { second = result.current.confirm("two", { action: "delete" }); });
    await expect(first).resolves.toBe(false);
    expect(result.current).toMatchObject({ body: "two", title: "Delete site permanently?", confirmLabel: "Delete permanently" });
    act(() => result.current.onConfirm());
    await expect(second).resolves.toBe(true);
  });
});

describe("LocalSiteConfirmDialog", () => {
  function Harness() {
    const dialog = useSiteConfirm({ t });
    const [answer, setAnswer] = useState("none");
    return <>
      <button type="button" onClick={() => void dialog.confirm("Move this site to Trash? You can restore it later.", { action: "trash" }).then((ok) => setAnswer(String(ok)))}>Ask</button>
      <p>answer:{answer}</p>
      <LocalSiteConfirmDialog dialog={dialog} />
    </>;
  }

  it("renders the shared ConfirmDialog for the open request and answers the awaiting caller", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(screen.getByText("Move this site to Trash? You can restore it later.")).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Move to Trash" })); });
    expect(screen.getByText("answer:true")).toBeInTheDocument();
  });

  it("renders nothing without a controller", () => {
    const { container } = render(<LocalSiteConfirmDialog />);
    expect(container.innerHTML).toBe("");
  });
});
