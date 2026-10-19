import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { ApiError } from "@/lib/api";
import { resetAssistantPromptBus, useAssistantPromptRequests } from "@/lib/assistant-prompt-bus";
import { SiteExportTab } from "../SiteExportTab";
import { SiteImportTab } from "../SiteImportTab";
import { createFakeSiteTransferPort, defaultSiteTransferPort, type SiteImport, type SiteShare, type SiteTransferPort } from "../hooks/site-transfer-dependencies.hooks";
import { useSiteExport, useSiteImport } from "../hooks/use-site-transfer.hooks";
import {
  formatTransferBytes,
  importOptionsTip,
  importSourceLabel,
  importStateView,
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

function renderImport(port: SiteTransferPort) {
  render(
    <FetchQueryProvider>
      <SiteImportTab t={t} useImport={({ t: tr }) => useSiteImport({ port, t: tr })} />
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
  });

  it("shortens links to host and path, and names an uploaded zip without a path", () => {
    expect(shortLink("https://example.com/_share/abc/x.zip?y=1")).toBe("example.com/_share/abc/x.zip");
    expect(shortLink("https://example.com/")).toBe("example.com");
    expect(shortLink("not a url")).toBe("not a url");
    expect(importSourceLabel({ url: "https://example.com/s/abc" }, t)).toBe("example.com/s/abc");
    expect(importSourceLabel({ uploadId: "u-1" }, t)).toBe("Uploaded zip");
  });

  it("puts both ways in under one tip, a bullet each", () => {
    const lines = importOptionsTip(t).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^• Share link or zip: /);
    expect(lines[1]).toMatch(/^• Live website: /);
  });
});

describe("SiteExportTab", () => {
  it("renders the server's flat refusal as plain text through the real client", async () => {
    const message = "Share refused: 'targets/cloudflare-pages.mjs' contains credential-shaped content. <strong>remove it</strong>";
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ code: "SECRET_IN_CONTENT", message }, { status: 400 }));
    try {
      renderExport(createFakeSiteTransferPort({ createShare: defaultSiteTransferPort.createShare }));
      fireEvent.click(screen.getByRole("button", { name: "Export this site" }));
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe(message);
      expect(alert.querySelector("strong")).toBeNull();
    } finally { fetch.mockRestore(); }
  });
  it("shows an empty state, then exports with one press and no confirmation", async () => {
    let listed: SiteShare[] = [];
    const createShare = vi.fn(async () => { listed = [share()]; return share(); });
    renderExport(createFakeSiteTransferPort({ listShares: async () => ({ shares: listed }), createShare }));
    expect(await screen.findByText("No exports yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Export this site" }));
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
    expect(await screen.findByText(/No link host is set up/)).toBeTruthy();
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
    fireEvent.click(await screen.findByRole("button", { name: "Export this site" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Export failed.");
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

  it("hands a live website to the assistant only once its address is valid", () => {
    const insertText = vi.fn();
    function Dock() {
      useAssistantPromptRequests({ current: { insertText } } as never);
      return null;
    }
    render(<Dock />);
    renderImport(createFakeSiteTransferPort());
    const start = screen.getByRole("button", { name: "Import with the assistant" }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Website address"), { target: { value: "https://example.com" } });
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    expect(insertText).toHaveBeenCalledWith("Import the live website at https://example.com into this site with the site-import agent plugin.");
    expect(screen.getByRole("link", { name: "New site" }).getAttribute("href")).toBe("/admin/sites?tab=new");
  });
});
