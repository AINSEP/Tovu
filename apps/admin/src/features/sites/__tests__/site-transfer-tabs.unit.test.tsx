import userEvent from "@testing-library/user-event";
import type { SiteExportController, SiteImportController } from "../hooks/use-site-transfer.hooks";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { ApiError } from "@/lib/api";
import { resetAssistantPromptBus, useAssistantPromptRequests } from "@/lib/assistant-prompt-bus";
import { SiteExportTab } from "../SiteExportTab";
import { SiteImportTab } from "../SiteImportTab";
import { createFakeSiteTransferPort, defaultSiteTransferPort, type SiteImport, type SiteShare, type SiteTransferPort } from "../hooks/site-transfer-dependencies.hooks";
import { useSiteExport, useSiteImport } from "../hooks/use-site-transfer.hooks";
import type { LiveImportSiteController } from "../hooks/use-live-import-site.hooks";
import type { DesktopImportController } from "../hooks/use-desktop-import.hooks";
import {
  formatTransferBytes,
  importOptionsTip,
  importSourceLabel,
  importStateView,
  liveImportMode,
  shareStatusView,
  shortLink,
} from "../site-transfer-rules";

/**
 * @file The Export Site and Import Site tabs, rendered with the real controllers over
 * `createFakeSiteTransferPort`, plus their pure display rules.
 */

const t = (key: string): string => key;

function share(overrides: Partial<SiteShare> = {}): SiteShare {
  return {
    shareId: "share-1",
    file: "mingjie.tovu.zip",
    bytes: 3 * 1024 * 1024,
    url: "https://example.com/_share/abc/mingjie.tovu.zip",
    status: "active",
    createdAt: "2026-10-18T10:00:00.000Z",
    downloadUrl: "/x",
    ...overrides,
  };
}

function siteImport(overrides: Partial<SiteImport> = {}): SiteImport {
  return { importId: "import-1", source: { url: "https://example.com/s/abc" }, newSiteName: "mingjie-copy", state: "needs-owner", createdAt: "2026-10-18T11:00:00.000Z", ...overrides };
}

function renderExport(port: SiteTransferPort, clipboard?: Pick<Clipboard, "writeText">) {
  render(
    <FetchQueryProvider>
      <SiteExportTab t={t} useExport={({ t: tr }) => useSiteExport({ port, t: tr }, { clipboard })} />
    </FetchQueryProvider>,
  );
}

/** The live-website source's own seam: records the address it was asked to make a new site for. */
function liveSite(overrides: Partial<LiveImportSiteController> = {}): LiveImportSiteController {
  return { creating: false, error: null, start: vi.fn(async () => {}), ...overrides };
}

function renderImport(port: SiteTransferPort, live: LiveImportSiteController = liveSite()) {
  render(
    <FetchQueryProvider>
      <SiteImportTab t={t} useImport={({ t: tr }) => useSiteImport({ port, t: tr })} useLiveSite={() => live} canMakeSites />
    </FetchQueryProvider>,
  );
}

afterEach(() => resetAssistantPromptBus());

describe("site transfer display rules", () => {
  it.each([
    [null, "—"], [-1, "—"], [Number.NaN, "—"], [512, "512 B"], [2048, "2 KB"], [3 * 1024 ** 2, "3.0 MB"], [1.5 * 1024 ** 3, "1.5 GB"],
  ])("formatTransferBytes(%s) is %s", (bytes, expected) => {
    expect(formatTransferBytes(bytes)).toBe(expected);
  });

  it("gives each export and import state its label and tone", () => {
    expect(shareStatusView("active", t)).toEqual({ label: "Active", className: "status status-ok" });
    expect(shareStatusView("revoked", t)).toEqual({ label: "Revoked", className: "status status-neutral" });
    expect(shareStatusView("failed", t)).toEqual({ label: "Failed", className: "status status-error" });
    expect(importStateView("ready", t)).toEqual({ label: "Ready", className: "status status-ok" });
    expect(importStateView("failed", t)).toEqual({ label: "Failed", className: "status status-error" });
    expect(importStateView("needs-owner", t)).toEqual({ label: "Needs a password", className: "status status-warning" });
    expect(importStateView("verifying", t)).toEqual({ label: "Checking…", className: "status status-neutral" });
    expect(importStateView("creating", t)).toEqual({ label: "Creating…", className: "status status-neutral" });
    // A state a newer server added reads as Failed, never as a blank pill.
    expect(importStateView("archived" as Parameters<typeof importStateView>[0], t)).toEqual({ label: "Failed", className: "status status-error" });
  });

  it("shortens links to host and path, and names an uploaded zip without a path", () => {
    expect(shortLink("https://example.com/_share/abc/x.zip?y=1")).toBe("example.com/_share/abc/x.zip");
    expect(shortLink("https://example.com/")).toBe("example.com");
    expect(shortLink("not a url")).toBe("not a url");
    expect(importSourceLabel({ url: "https://example.com/s/abc" }, t)).toBe("example.com/s/abc");
    expect(importSourceLabel({ uploadId: "u-1" }, t)).toBe("Uploaded zip");
  });

  it("a live website imports into this site only on the site made for it; elsewhere it makes a new site, or is not offered", () => {
    expect(liveImportMode({ arrivedForImport: true, canMakeSites: false })).toBe("this-new-site");
    expect(liveImportMode({ arrivedForImport: true, canMakeSites: true })).toBe("this-new-site");
    expect(liveImportMode({ arrivedForImport: false, canMakeSites: true })).toBe("new-site");
    expect(liveImportMode({ arrivedForImport: false, canMakeSites: false })).toBe("unavailable");
    // Inside the desktop app (its Import bridge is there) the live source hands off to the app's Import tab.
    expect(liveImportMode({ arrivedForImport: false, canMakeSites: false }, { desktopImport: true })).toBe("desktop");
    expect(liveImportMode({ arrivedForImport: false, canMakeSites: true }, { desktopImport: true })).toBe("new-site");
    expect(liveImportMode({ arrivedForImport: true, canMakeSites: false }, { desktopImport: true })).toBe("this-new-site");
  });

  it("puts both ways in under one tip, a bullet each", () => {
    const lines = importOptionsTip(t).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^• Share link or zip: /);
    expect(lines[1]).toBe("• Live website: Makes a new site, and the assistant copies a public website's pages into it. You read its request first, then press Send.");
  });
});

describe("SiteExportTab", () => {
  it("renders the server's flat refusal as plain text through the real client", async () => {
    const message = "Share refused: 'targets/cloudflare-pages.mjs' contains credential-shaped content. <strong>remove it</strong>";
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ code: "SECRET_IN_CONTENT", message }, { status: 400 }));
    try {
      renderExport(createFakeSiteTransferPort({ createShare: defaultSiteTransferPort.createShare }));
      fireEvent.click(screen.getByRole("button", { name: "Export Tovu site" }));
      const alert = await screen.findByRole("alert");
      expect(within(alert).getByText(message, { selector: "p" }).textContent).toBe(message);
      expect(alert.querySelector("strong")).toBeNull();
      expect(alert.querySelector("pre")?.textContent).toContain(`Message: ${message}`);
    } finally { fetch.mockRestore(); }
  });
  it("shows an empty state, then exports with one press and no confirmation", async () => {
    let listed: SiteShare[] = [];
    const createShare = vi.fn(async () => { listed = [share()]; return share(); });
    renderExport(createFakeSiteTransferPort({ listShares: async () => ({ shares: listed }), createShare }));
    expect(await screen.findByText("No exports yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Export Tovu site" }));
    await waitFor(() => expect(createShare).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    const table = await screen.findByRole("table");
    expect(within(table).getByText("3.0 MB")).toBeTruthy();
    expect(within(table).getByText("example.com/_share/abc/mingjie.tovu.zip")).toBeTruthy();
    expect(within(table).getByText("Active")).toBeTruthy();
  });

  it("offers Copy link, Download zip and Revoke on an active export", async () => {
    const writeText = vi.fn(async () => {});
    const revokeShare = vi.fn(async () => share({ status: "revoked" }));
    renderExport(createFakeSiteTransferPort({ listShares: async () => ({ shares: [share()] }), revokeShare }), { writeText });
    fireEvent.click(await screen.findByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://example.com/_share/abc/mingjie.tovu.zip"));
    expect(await screen.findByText("Copied")).toBeTruthy();
    const download = screen.getByRole("link", { name: "Download zip" });
    expect(download.getAttribute("href")).toBe("/download/share-1");
    expect(download.getAttribute("download")).toBe("mingjie.tovu.zip");
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(revokeShare).toHaveBeenCalledWith({ shareId: "share-1" }));
  });

  it("says when exports are zip downloads only, and gives a revoked export no actions", async () => {
    renderExport(createFakeSiteTransferPort({ listShares: async () => ({ shares: [share({ url: null }), share({ shareId: "old", status: "revoked" })] }) }));
    // A warning sign beside the export buttons, not a box.
    expect((await screen.findByText(/No link host is set up/)).closest(".site-transfer-notice-tip")).toBeTruthy();
    expect(screen.getByText("Zip only")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Download zip" })).toHaveLength(1);
    expect(screen.getByText("Revoked")).toBeTruthy();
  });

  it("shows loading, then a list error", async () => {
    let fail: ((error: unknown) => void) | undefined;
    renderExport(createFakeSiteTransferPort({ listShares: () => new Promise((_, reject) => { fail = reject; }) }));
    expect(screen.getByText("Loading exports…")).toBeTruthy();
    await waitFor(() => expect(fail).toBeDefined());
    fail!(new ApiError("", 500));
    expect(await screen.findByText("Couldn't load exports.")).toBeTruthy();
  });

  it("shows an export failure as an alert", async () => {
    renderExport(createFakeSiteTransferPort({ createShare: async () => { throw "no"; } }));
    fireEvent.click(await screen.findByRole("button", { name: "Export Tovu site" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("The site export could not finish.", { selector: "p" }).textContent).toBe("The site export could not finish.");
    expect(within(alert).getByText("Check export history before starting another export. Copy details and report this problem.", { selector: "p" })).toBeTruthy();
    expect(alert.querySelector("details")?.hasAttribute("open")).toBe(false);
    expect(alert.querySelector("pre")?.textContent).toContain("Cause: no");
  });
});

describe("SiteImportTab", () => {
  it("keeps Import off until a link or zip is given, and refuses a non-https link", async () => {
    const startImport = vi.fn();
    renderImport(createFakeSiteTransferPort({ startImport }));
    const importButton = screen.getByRole("button", { name: "Import as a new site" }) as HTMLButtonElement;
    expect(importButton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Share link"), { target: { value: "http://example.com/s" } });
    expect(importButton.disabled).toBe(false);
    fireEvent.click(importButton);
    expect((await screen.findByRole("alert")).textContent).toBe("Paste an https:// share link.");
    expect(startImport).not.toHaveBeenCalled();
  });

  it("imports a share link, then asks for the new owner's password and opens the site", async () => {
    const startImport = vi.fn(async () => siteImport());
    const completeImportOwner = vi.fn(async () => siteImport({ state: "ready", adminUrl: "https://localhost:3001/admin" }));
    renderImport(createFakeSiteTransferPort({ startImport, completeImportOwner }));
    fireEvent.change(screen.getByLabelText("Share link"), { target: { value: "https://example.com/s/abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Import as a new site" }));
    expect(await screen.findByText("Choose a password for mingjie-copy")).toBeTruthy();
    const create = screen.getByRole("button", { name: "Create site" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw-1" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "pw-2" } });
    expect(screen.getByText("The passwords don't match.")).toBeTruthy();
    expect(create.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "pw-1" } });
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    await waitFor(() => expect(completeImportOwner).toHaveBeenCalledWith({ importId: "import-1", adminPassword: "pw-1" }));
    const open = await screen.findByRole("link", { name: "Open" });
    expect(open.getAttribute("href")).toBe("https://localhost:3001/admin");
    expect(open.getAttribute("target")).toBe("_blank");
  });

  it("says when an imported site has no admin address yet, and shows a failed import's reason", async () => {
    const startImport = vi.fn()
      .mockResolvedValueOnce(siteImport({ state: "ready", adminUrl: null }))
      .mockResolvedValueOnce(siteImport({ state: "failed", error: "Archive checksum mismatch." }));
    renderImport(createFakeSiteTransferPort({ startImport }));
    fireEvent.change(screen.getByLabelText("Share link"), { target: { value: "https://example.com/s/abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Import as a new site" }));
    expect(await screen.findByText("Start it from All sites to open its admin.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Share link"), { target: { value: "https://example.com/s/abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Import as a new site" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Archive checksum mismatch.");
  });

  it("lists past imports with source, new site, status and the next step", async () => {
    renderImport(createFakeSiteTransferPort({
      listImports: async () => ({
        imports: [
          siteImport(),
          siteImport({ importId: "import-2", source: { uploadId: "u-1" }, state: "ready", newSiteName: "from-zip", adminUrl: "https://localhost:3002/admin" }),
          siteImport({ importId: "import-3", state: "failed", newSiteName: null }),
        ],
      }),
    }));
    const table = await screen.findByRole("table");
    expect(within(table).getAllByText("example.com/s/abc")).toHaveLength(2);
    expect(within(table).getByText("Uploaded zip")).toBeTruthy();
    expect(within(table).getByText("from-zip")).toBeTruthy();
    expect(within(table).getByRole("link", { name: "Open" }).getAttribute("href")).toBe("https://localhost:3002/admin");
    fireEvent.click(within(table).getByRole("button", { name: "Finish setup" }));
    expect(await screen.findByLabelText("Password")).toBeTruthy();
  });

  it("shows the empty state of the import list", async () => {
    renderImport(createFakeSiteTransferPort());
    expect(await screen.findByText("No imports yet.")).toBeTruthy();
  });

  it("shows the import list's error state", async () => {
    renderImport(createFakeSiteTransferPort({ listImports: async () => { throw new ApiError("", 500); } }));
    expect(await screen.findByText("Couldn't load imports.")).toBeTruthy();
  });

  it("makes a NEW site for a live website, once its address is valid, and never drafts an import into this site (owner, 2026-11-10)", () => {
    const insertText = vi.fn();
    function Dock() {
      useAssistantPromptRequests({ current: { insertText } } as never);
      return null;
    }
    render(<Dock />);
    const live = liveSite();
    renderImport(createFakeSiteTransferPort(), live);
    expect(screen.getAllByText("Makes a new site. This site stays as it is.")).toHaveLength(2);
    expect(screen.queryByText(/Imports into this site/)).toBeNull();
    expect(screen.queryByRole("link", { name: "New site" })).toBeNull();
    const start = screen.getByRole("button", { name: "Import with the assistant" }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Website address"), { target: { value: "https://example.com" } });
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    expect(live.start).toHaveBeenCalledExactlyOnceWith("https://example.com");
    expect(insertText).not.toHaveBeenCalled();
  });

  it("drafts the import on the new site itself, which opened with the address filled in", () => {
    window.history.replaceState(null, "", "/admin/import-export?tab=import&liveImport=https%3A%2F%2Fexample.com%2Fabout");
    try {
      const insertText = vi.fn();
      function Dock() {
        useAssistantPromptRequests({ current: { insertText } } as never);
        return null;
      }
      render(<Dock />);
      const live = liveSite();
      renderImport(createFakeSiteTransferPort(), live);
      expect(screen.getByText("Imports into this new site.")).toBeTruthy();
      expect((screen.getByLabelText("Website address") as HTMLInputElement).value).toBe("https://example.com/about");
      fireEvent.click(screen.getByRole("button", { name: "Import with the assistant" }));
      expect(insertText).toHaveBeenCalledWith("Import the live website at https://example.com/about into this site with the site-import agent plugin.");
      expect(live.start).not.toHaveBeenCalled();
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("shows the new site's progress and its plain-words failure on the live source", () => {
    render(<SiteImportTab t={t} useImport={() => importController({ liveAddress: "https://example.com", liveAddressValid: true })}
      useLiveSite={() => liveSite({ creating: true, error: "example-com was made but didn't start." })} canMakeSites />);
    const busy = screen.getByRole("button", { name: "Creating…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("example-com was made but didn't start.");
  });

  it("inside the desktop app, hands a live website to Tovu's own Import tab with the typed address (owner, 2026-11-10)", () => {
    const desktop = desktopImport();
    render(<SiteImportTab t={t} useImport={() => importController({ liveAddress: " https://example.com/about ", liveAddressValid: true })}
      useLiveSite={() => liveSite()} useDesktop={() => desktop} />);
    expect(screen.getByText("Tovu's Import tab makes a new site from it.")).toBeTruthy();
    expect(screen.queryByText("This host can't make new sites, so it can't import a live website here.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Import with the assistant" })).toBeNull();
    const open = screen.getByRole("button", { name: "Open Import in Tovu" }) as HTMLButtonElement;
    handle(open, "sites-import-live-desktop", "button", "Open Tovu's Import tab with this address");
    fireEvent.click(open);
    expect(desktop.open).toHaveBeenCalledExactlyOnceWith("https://example.com/about");
  });

  it("inside the desktop app, opens Import with no address, but not with one it would refuse", () => {
    const desktop = desktopImport();
    const { unmount } = render(<SiteImportTab t={t} useImport={() => importController()} useLiveSite={() => liveSite()} useDesktop={() => desktop} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Import in Tovu" }));
    expect(desktop.open).toHaveBeenCalledExactlyOnceWith("");
    unmount();
    render(<SiteImportTab t={t} useImport={() => importController({ liveAddress: "not an address", liveAddressValid: false })}
      useLiveSite={() => liveSite()} useDesktop={() => desktop} />);
    expect((screen.getByRole("button", { name: "Open Import in Tovu" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("inside the desktop app, shows the hand-off in flight and its plain-words failure", () => {
    render(<SiteImportTab t={t} useImport={() => importController()} useLiveSite={() => liveSite()}
      useDesktop={() => desktopImport({ opening: true, error: "Couldn't open Tovu's Import tab. Open Tovu's home window, then try again." })} />);
    const busy = screen.getByRole("button", { name: "Open Import in Tovu" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("Couldn't open Tovu's Import tab. Open Tovu's home window, then try again.");
  });

  it("a hosted install that can't make sites, outside the desktop app, keeps its message and no form", () => {
    render(<SiteImportTab t={t} useImport={() => importController()} useLiveSite={() => liveSite()} useDesktop={() => desktopImport({ available: false })} />);
    expect(screen.getByText("This host can't make new sites, so it can't import a live website here.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open Import in Tovu" })).toBeNull();
    expect(screen.queryByLabelText("Website address")).toBeNull();
  });
});

/** The desktop hand-off's seam: records the address it was asked to open Import with. */
function desktopImport(overrides: Partial<DesktopImportController> = {}): DesktopImportController {
  return { available: true, opening: false, error: null, open: vi.fn(async () => {}), ...overrides };
}

// Exercise markup through the components' supported controller seam. Effects and persistence
// remain covered above through the real hooks; these cases pin every transient display state.
function exportController(overrides: Partial<SiteExportController> = {}): SiteExportController {
  return { canManageSavedKeys: false,
    revealedPassword: null, passwordError: null, revealingId: null, passwordCopied: false, revealPassword: vi.fn(async () => {}), copyPassword: vi.fn(async () => {}), hidePassword: vi.fn(),
    staticThemes: [], selectedThemeIds: [], staticExportReady: false, staticOptionsLoading: false, staticOptionsError: null, toggleStaticTheme: vi.fn(), selectAllStaticThemes: vi.fn(),
    shares: [], listError: null, exporting: false, exportError: null, zipOnly: false,
    exportSite: vi.fn(async () => {}), exportingStatic: false, exportStaticSite: vi.fn(async () => {}), revokingId: null, revoke: vi.fn(async () => {}),
    copiedId: null, copyLink: vi.fn(async () => {}), downloadHref: item => `/download/${item.shareId}`,
    credentialGate: () => null, acknowledge: vi.fn(async () => {}), download: vi.fn(async () => {}), ...overrides };
}
function importController(overrides: Partial<SiteImportController> = {}): SiteImportController {
  return { savedKeysPassword: "", setSavedKeysPassword: vi.fn(), imports: [], listError: null, link: "", setLink: vi.fn(), file: null, chooseFiles: vi.fn(), clearFile: vi.fn(),
    canImport: false, importing: false, importError: null, startImport: vi.fn(async () => {}), current: null, resume: vi.fn(),
    password: "", setPassword: vi.fn(), confirm: "", setConfirm: vi.fn(), passwordProblem: null, settingOwner: false,
    ownerError: null, completeOwner: vi.fn(async () => {}), liveAddress: "", setLiveAddress: vi.fn(),
    liveAddressValid: false, startLiveImport: vi.fn(), arrivedForImport: false, ...overrides };
}
function handle(element: HTMLElement, id: string, role: string, label: string) {
  expect(element.getAttribute("data-agent-element")).toBe(id);
  expect(element.getAttribute("data-agent-role")).toBe(role);
  expect(element.getAttribute("data-agent-label")).toBe(label);
}

describe("transfer tab presentation contracts", () => {
  it("publishes the export action and announces an in-flight export", async () => {
    const controller = exportController();
    const ui = render(<SiteExportTab t={t} useExport={() => controller} />);
    expect(screen.getByRole("region", { name: "Export Site" })).toBeTruthy();
    expect(screen.getByText("Makes a .tovu.zip copy of this site that another Tovu can import.")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Export Tovu site" });
    handle(button, "sites-export-create", "button", "Export this site as a .tovu.zip");
    await userEvent.click(button);
    expect(controller.exportSite).toHaveBeenCalledExactlyOnceWith();
    ui.rerender(<SiteExportTab t={t} useExport={() => ({ ...controller, exporting: true })} />);
    const busy = screen.getByRole("button", { name: "Exporting…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.querySelector('[aria-hidden="true"]')?.className).toBe("site-transfer-spinner");
    await userEvent.click(busy);
    expect(controller.exportSite).toHaveBeenCalledTimes(1);
  });

  it("labels export columns, preserves the full link and scopes pending revoke to the right row", async () => {
    const first = share(), second = share({ shareId: "second", url: null, bytes: 1024 });
    const controller = exportController({ shares: [first, second], revokingId: first.shareId, copiedId: first.shareId });
    const ui = render(<SiteExportTab t={t} useExport={() => controller} />);
    const table = screen.getByRole("table", { name: "Exports" });
    for (const name of ["Date", "Size", "Link", "Status", "Actions"]) expect(within(table).getByRole("columnheader", { name })).toBeTruthy();
    const row = within(table).getByText("example.com/_share/abc/mingjie.tovu.zip").closest("tr")!;
    expect(within(row).getByText("Active").className).toBe("status status-ok");
    expect(within(row).getByText("3.0 MB").closest("td")?.className).toBe("site-transfer-num");
    expect(within(row).getByTitle(first.url!).className).toBe("site-transfer-link");
    // The browser's local date is part of the table's contract; use its native formatter independently.
    expect(row.querySelector("td")?.textContent).not.toBe("—");
    const copy = within(row).getByRole("button", { name: "Copied" });
    handle(copy, "sites-export-1-copy", "button", "Copy this export's share link");
    expect(copy.querySelector('[aria-live="polite"]')?.textContent).toBe("Copied");
    const download = within(row).getByRole("link", { name: "Download zip" });
    handle(download, "sites-export-1-download", "link", "Download this export's .tovu.zip");
    expect(download.getAttribute("href")).toBe("/download/share-1");
    expect(download.getAttribute("download")).toBe(first.file);
    const revoking = within(row).getByRole("button", { name: "Revoking…" }) as HTMLButtonElement;
    handle(revoking, "sites-export-1-revoke", "button", "Revoke this export so its link stops working");
    expect(revoking.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Revoke" }) as HTMLButtonElement).disabled).toBe(true);
    const zipRow = screen.getByText("Zip only").closest("tr")!;
    expect(within(zipRow).queryByRole("button", { name: "Copy link" })).toBeNull();
    ui.rerender(<SiteExportTab t={t} useExport={() => ({ ...controller, revokingId: null })} />);
    await userEvent.click(screen.getByRole("button", { name: "Copied" }));
    expect(controller.copyLink).toHaveBeenCalledExactlyOnceWith(first);
    await userEvent.click(within(screen.getByText("Zip only").closest("tr")!).getByRole("button", { name: "Revoke" }));
    expect(controller.revoke).toHaveBeenCalledExactlyOnceWith(second);
  });

  it("publishes source forms, accessible fields, assistant guidance, and prevents browser submission", async () => {
    const controller = importController({ canImport: true, liveAddressValid: true, liveAddress: "https://live.example", link: "https://share.example" });
    const liveStub = liveSite();
    const { container } = render(<SiteImportTab t={t} useImport={() => controller} useLiveSite={() => liveStub} canMakeSites />);
    expect(screen.getByRole("region", { name: "Import Site" })).toBeTruthy();
    for (const text of ["Bring in a site from a Tovu export or a live website.", "From a .tovu.zip or share link", "From a live website", "The new site opens with the request written. Press Send there to start.", "or", "Up to 300 MB", "Drop a .tovu.zip here, or click to browse"]) expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getAllByText("Makes a new site. This site stays as it is.")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "About importing" })).toBeTruthy();
    const link = screen.getByLabelText("Share link");
    handle(link, "sites-import-link", "field", "Tovu share link to import");
    expect(link.getAttribute("type")).toBe("url");
    expect(link.getAttribute("inputmode")).toBe("url");
    expect(link.getAttribute("placeholder")).toBe("https://");
    const live = screen.getByLabelText("Website address");
    handle(live, "sites-import-live-address", "field", "Address of the live website to import");
    expect(live.getAttribute("type")).toBe("url");
    expect(live.getAttribute("inputmode")).toBe("url");
    expect(live.getAttribute("placeholder")).toBe("https://");
    expect(live.getAttribute("aria-describedby")).toBe("sites-import-live-hint");
    // Files first, then the web addresses (owner, 2026-11-10): the drop zone and its Choose file…
    // button come before the share link, and both before the live website's address.
    const zone = screen.getByText("Drop a .tovu.zip here, or click to browse");
    const choose = screen.getByRole("button", { name: "Choose file…" });
    handle(choose, "sites-import-file-choose", "button", "Choose a .tovu.zip file to import");
    for (const [before, after] of [[zone, choose], [choose, link], [link, live]] as const) {
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const picked = vi.fn();
    input.addEventListener("click", (event) => { event.preventDefault(); picked(); });
    await userEvent.click(choose);
    expect(picked).toHaveBeenCalledTimes(1);
    const submit = screen.getByRole("button", { name: "Import as a new site" });
    handle(submit, "sites-import-start", "button", "Import the link or zip as a new site");
    handle(screen.getByRole("button", { name: "Import with the assistant" }), "sites-import-live-start", "button", "Make a new site and open its assistant with the import request");
    const forms = container.querySelectorAll("form");
    handle(forms[0]!, "sites-import-archive-form", "form", "Import a Tovu share link or .tovu.zip as a new site");
    handle(forms[1]!, "sites-import-live-form", "form", "Import a live website into a new site with the assistant");
    const prevented: boolean[] = [];
    container.addEventListener("submit", event => prevented.push(event.defaultPrevented));
    await userEvent.click(submit);
    await userEvent.click(screen.getByRole("button", { name: "Import with the assistant" }));
    expect(prevented).toEqual([true, true]);
    expect(controller.startImport).toHaveBeenCalledExactlyOnceWith();
    expect(liveStub.start).toHaveBeenCalledExactlyOnceWith("https://live.example");
    expect(controller.startLiveImport).not.toHaveBeenCalled();
  });

  it("offers no live import where this host can't make a new site, rather than importing into this one (owner, 2026-11-10)", () => {
    render(<SiteImportTab t={t} useImport={() => importController({})} useLiveSite={() => liveSite()} />);
    expect(screen.getByText("This host can't make new sites, so it can't import a live website here.")).toBeTruthy();
    expect(screen.queryByLabelText("Website address")).toBeNull();
    expect(screen.queryByRole("button", { name: "Import with the assistant" })).toBeNull();
  });

  it("shows a chosen file, can remove it, and locks archive inputs during import", async () => {
    const file = new File(["x".repeat(2048)], "copy.tovu.zip", { type: "application/zip" });
    const controller = importController({ file, canImport: true });
    const ui = render(<SiteImportTab t={t} useImport={() => controller} />);
    expect(screen.getByText(file.name).className).toBe("site-transfer-file-name");
    expect(screen.getByText("2 KB").className).toBe("site-transfer-num");
    const remove = screen.getByRole("button", { name: "Remove" });
    handle(remove, "sites-import-file-remove", "button", "Remove the chosen .tovu.zip");
    await userEvent.click(remove);
    expect(controller.clearFile).toHaveBeenCalledTimes(1);
    ui.rerender(<SiteImportTab t={t} useImport={() => ({ ...controller, importing: true, importError: "Upload refused" })} />);
    expect((screen.getByLabelText("Share link") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Remove" }) as HTMLButtonElement).disabled).toBe(true);
    const busy = screen.getByRole("button", { name: "Importing…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.querySelector('[aria-hidden="true"]')?.className).toBe("site-transfer-spinner");
    expect(screen.getByRole("alert").textContent).toBe("Upload refused");
  });

  it.each(["verifying", "creating"] as const)("announces %s progress", state => {
    render(<SiteImportTab t={t} useImport={() => importController({ current: siteImport({ state }) })} />);
    expect(screen.getByRole("status").textContent).toBe("Checking the archive…");
  });
  it("uses fallback site name and failure text and only shows Open when ready with an address", () => {
    const ui = render(<SiteImportTab t={t} useImport={() => importController({ current: siteImport({ state: "failed", error: undefined }) })} />);
    expect(screen.getByRole("alert").textContent).toBe("Import failed. No site was changed.");
    ui.rerender(<SiteImportTab t={t} useImport={() => importController({ current: siteImport({ state: "ready", newSiteName: null, adminUrl: "https://copy.example/admin" }) })} />);
    expect(screen.getByRole("status").textContent).toBe("the new site is ready.Open");
    const open = screen.getByRole("link", { name: "Open" });
    expect(open.getAttribute("href")).toBe("https://copy.example/admin");
    expect(open.getAttribute("target")).toBe("_blank");
    expect(open.getAttribute("rel")).toBe("noreferrer");
    handle(open, "sites-import-open", "link", "Open the imported site's admin");
  });

  it("focuses and labels owner fields, reports password errors, submits privately and prevents navigation", async () => {
    const controller = importController({ current: siteImport(), password: "secret", confirm: "secret" });
    const ui = render(<SiteImportTab t={t} useImport={() => controller} />);
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    const confirm = screen.getByLabelText("Confirm password") as HTMLInputElement;
    expect(document.activeElement).toBe(password);
    for (const field of [password, confirm]) {
      expect(field.type).toBe("password");
      expect(field.autocomplete).toBe("new-password");
      expect(field.maxLength).toBe(512);
    }
    expect(confirm.hasAttribute("aria-invalid")).toBe(false);
    expect(confirm.hasAttribute("aria-describedby")).toBe(false);
    expect(screen.getByText("The site opens once it has an owner password. Username: admin")).toBeTruthy();
    const form = password.closest("form")!;
    handle(form, "sites-import-owner-form", "form", "Choose the imported site's owner password");
    let prevented = false;
    ui.container.addEventListener("submit", event => { prevented = event.defaultPrevented; });
    const submit = screen.getByRole("button", { name: "Create site" });
    handle(submit, "sites-import-owner-submit", "button", "Create the imported site with this password");
    await userEvent.click(submit);
    expect(prevented).toBe(true);
    expect(controller.completeOwner).toHaveBeenCalledExactlyOnceWith();
    ui.rerender(<SiteImportTab t={t} useImport={() => ({ ...controller, settingOwner: true, ownerError: "Owner refused", passwordProblem: "Mismatch" })} />);
    expect((screen.getByLabelText("Password") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Confirm password") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByLabelText("Confirm password").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Confirm password").getAttribute("aria-describedby")).toBe("sites-import-owner-problem");
    expect(screen.getByText("Mismatch").id).toBe("sites-import-owner-problem");
    expect(screen.getByRole("alert").textContent).toBe("Owner refused");
    expect((screen.getByRole("button", { name: "Creating…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Creating…" }).getAttribute("aria-busy")).toBe("true");
  });

  it("labels past-import columns and targets the second row's Finish setup action", async () => {
    const pending = siteImport({ importId: "pending", newSiteName: "Second copy" });
    const controller = importController({ imports: [siteImport({ state: "ready", adminUrl: "https://first.example/admin" }), pending] });
    render(<SiteImportTab t={t} useImport={() => controller} />);
    const table = screen.getByRole("table", { name: "Past imports" });
    for (const name of ["Date", "Source", "New site", "Status", "Actions"]) expect(within(table).getByRole("columnheader", { name })).toBeTruthy();
    const finish = within(table).getByRole("button", { name: "Finish setup" });
    handle(finish, "sites-import-2-finish", "button", "Finish this import's owner password step");
    await userEvent.click(finish);
    expect(controller.resume).toHaveBeenCalledExactlyOnceWith(pending);
    const open = within(table).getByRole("link", { name: "Open" });
    handle(open, "sites-import-1-open", "link", "Open this imported site's admin");
    expect(open.getAttribute("target")).toBe("_blank");
    expect(open.getAttribute("rel")).toBe("noreferrer");
    expect(open.getAttribute("href")).toBe("https://first.example/admin");
    expect(within(table).getByText("Ready").className).toBe("status status-ok");
    expect(within(table).getByText("Needs a password").className).toBe("status status-warning");
    expect(within(table).getAllByTitle("https://example.com/s/abc")).toHaveLength(2);
    expect(within(table).getAllByText("example.com/s/abc")[0]?.className).toBe("site-transfer-link");
    expect(within(table).getAllByRole("cell")[0]?.className).toBe("site-transfer-num");
    expect(within(table).getAllByRole("cell")[0]?.textContent).not.toBe("—");
  });
});

describe("transfer tab browser contracts", () => {
  it("formats both history dates in the viewer's local time", () => {
    const getters = [
      vi.spyOn(Date.prototype, "getFullYear").mockReturnValue(2042),
      vi.spyOn(Date.prototype, "getMonth").mockReturnValue(3),
      vi.spyOn(Date.prototype, "getDate").mockReturnValue(5),
      vi.spyOn(Date.prototype, "getHours").mockReturnValue(6),
      vi.spyOn(Date.prototype, "getMinutes").mockReturnValue(7),
    ];
    try {
      render(<><SiteExportTab t={t} useExport={() => exportController({ shares: [share()] })} /><SiteImportTab t={t} useImport={() => importController({ imports: [siteImport()] })} /></>);
      expect(screen.getAllByText("2042-04-05 06:07")).toHaveLength(2);
      for (const date of screen.getAllByText("2042-04-05 06:07")) expect(date.className).toBe("site-transfer-num");
    } finally { for (const getter of getters) getter.mockRestore(); }
  });

  it("uploads and removes a zip through the real dropzone and sends the uploaded ID as the source", async () => {
    const file = new File(["zip bytes"], "portable.tovu.zip", { type: "application/zip" });
    const uploadImportZip = vi.fn(async () => ({ uploadId: "uploaded-zip" }));
    const startImport = vi.fn(async () => siteImport({ state: "verifying" }));
    renderImport(createFakeSiteTransferPort({ uploadImportZip, startImport }));
    const zone = screen.getByRole("button", { name: /Add files/ });
    const picker = zone.querySelector('input[type="file"]') as HTMLInputElement;
    expect(picker.accept).toBe(".zip,application/zip");
    await userEvent.upload(picker, file);
    expect(await screen.findByText(file.name)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByText(file.name)).toBeNull();
    expect((screen.getByRole("button", { name: "Import as a new site" }) as HTMLButtonElement).disabled).toBe(true);
    const newPicker = screen.getByRole("button", { name: /Add files/ }).querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(newPicker, file);
    await userEvent.click(screen.getByRole("button", { name: "Import as a new site" }));
    await waitFor(() => expect(uploadImportZip).toHaveBeenCalledExactlyOnceWith({ file }));
    expect(startImport).toHaveBeenCalledExactlyOnceWith({ uploadId: "uploaded-zip" });
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Checking the archive…");
    expect(screen.queryByText(file.name)).toBeNull();
  });

  it("forwards field edits to their controllers and exposes loading import history", async () => {
    const controller = importController({ imports: undefined, link: "https://share.example", liveAddress: "https://live.example", current: siteImport(), password: "password", confirm: "password" });
    render(<SiteImportTab t={t} useImport={() => controller} />);
    expect(screen.getByText("Loading imports…").className).toBe("notice");
    await userEvent.clear(screen.getByLabelText("Share link"));
    expect(controller.setLink).toHaveBeenCalledWith("");
    await userEvent.clear(screen.getByLabelText("Website address"));
    expect(controller.setLiveAddress).toHaveBeenCalledWith("");
    await userEvent.clear(screen.getByLabelText("Password"));
    expect(controller.setPassword).toHaveBeenCalledWith("");
    await userEvent.clear(screen.getByLabelText("Confirm password"));
    expect(controller.setConfirm).toHaveBeenCalledWith("");
  });
});

it("withholds Open for failed, unfinished and ready imports without an admin address", () => {
  const rows = [siteImport({ importId: "failed", state: "failed", newSiteName: "Failed copy" }), siteImport({ importId: "verifying", state: "verifying", newSiteName: "Checking copy" }), siteImport({ importId: "ready-no-url", state: "ready", newSiteName: "Stopped copy", adminUrl: null })];
  render(<SiteImportTab t={t} useImport={() => importController({ imports: rows })} />);
  const table = screen.getByRole("table", { name: "Past imports" });
  for (const name of ["Failed copy", "Checking copy", "Stopped copy"]) {
    const row = within(table).getByText(name).closest("tr")!;
    expect(within(row).queryByText("Open")).toBeNull();
    expect(within(row).getByText("—").className).toBe("muted-cell");
  }
});

it("explains that export images are web-optimized copies", () => {
  render(<SiteExportTab t={t} useExport={() => exportController()} />);
  expect(screen.getByRole("button", { name: "Images are exported as web-optimized copies." })).toBeTruthy();
});
it.each(["needs-owner", "ready"] as const)("shows edited-code warnings on the warning sign of a current %s import", state => {
  const warning = "Edited agent-plugins/demo was imported and kept switched off.";
  render(<SiteImportTab t={t} useImport={() => importController({ current: siteImport({ state, warnings: [warning] }) })} />);
  expect(screen.getByText(warning).closest(".site-transfer-notice-tip")).toBeTruthy();
});

describe("export row notices", () => {
  it("shows every notice of an export once in its detail line, not on the Status column", () => {
    const notice = "No domain was given, so sitemap.xml and feed.xml were left out.";
    render(<SiteExportTab t={t} useExport={() => exportController({ shares: [share({ notes: ["Published content only."], notices: [notice, "Published content only."] }), share({ shareId: "plain" })] })} />);
    expect(screen.queryByRole("button", { name: "Warning" })).toBeNull();
    const details = document.querySelectorAll(".list-table-detail");
    expect(details).toHaveLength(1);
    expect(within(details[0] as HTMLElement).getAllByText("Published content only.")).toHaveLength(1);
    expect(within(details[0] as HTMLElement).getByText(notice)).toBeTruthy();
    expect(document.querySelector(".site-transfer-status .notice")).toBeNull();
  });
});

describe("rows hold still after Revoke", () => {
  it("keeps the revoked row and its detail line at their height, so the next row's Revoke cannot slide under a second click", () => {
    const revoke = vi.fn(async () => {});
    const credentialWarnings = [{ path: "media/notes.txt", kind: "Password" }];
    const shares = [share({ credentialWarnings }), share({ shareId: "next" })];
    const ui = render(<SiteExportTab t={t} useExport={() => exportController({ shares, revoke })} />);
    const [row, detail, next] = screen.getAllByRole("row").slice(1);
    vi.spyOn(row!, "getBoundingClientRect").mockReturnValue({ height: 61 } as DOMRect);
    vi.spyOn(detail!, "getBoundingClientRect").mockReturnValue({ height: 28 } as DOMRect);
    fireEvent.click(within(row!).getByRole("button", { name: "Revoke" }));
    expect(revoke).toHaveBeenCalledOnce();
    ui.rerender(<SiteExportTab t={t} useExport={() => exportController({ shares: [{ ...shares[0]!, status: "revoked" }, shares[1]!], revoke })} />);
    const [rowAfter, detailAfter, nextAfter] = screen.getAllByRole("row").slice(1);
    expect(within(rowAfter!).queryByRole("button", { name: "Revoke" })).toBeNull();
    expect([rowAfter!.style.height, detailAfter!.style.height]).toEqual(["61px", "28px"]);
    expect(nextAfter).toBe(next);
    expect(nextAfter!.style.height).toBe("");
  });
});
