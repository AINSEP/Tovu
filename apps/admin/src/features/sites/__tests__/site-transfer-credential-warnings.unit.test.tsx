import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { ApiError } from "@/lib/api";
import { SiteExportTab } from "../SiteExportTab";
import { SiteImportTab } from "../SiteImportTab";
import { createFakeSiteTransferPort, defaultSiteTransferPort, type SiteImport, type SiteShare, type SiteTransferPort } from "../hooks/site-transfer-dependencies.hooks";
import { useSiteExport, useSiteImport } from "../hooks/use-site-transfer.hooks";

/**
 * @file Owner, 2026-11-03: credential-looking content stays in exports and imports; the user is
 * warned, and an export downloads only after "I understand this export may contain credentials".
 * Rendered with the real controllers over `createFakeSiteTransferPort`.
 */

const t = (key: string): string => key;
const REFUSAL = "This export may contain credentials. Review the warnings and acknowledge that you understand before downloading.";
const warnings = [
  { path: "content.db:settings.value", kind: "API key" },
  { path: "media/notes.txt", kind: "Private key" },
  { path: "media/notes.txt", kind: "Password" },
];

function share(overrides: Partial<SiteShare> = {}): SiteShare {
  return { shareId: "share-1", file: "mingjie.tovu.zip", bytes: 2048, url: "https://example.com/_share/abc/mingjie.tovu.zip", status: "active",
    createdAt: "2026-11-03T10:00:00.000Z", downloadUrl: "/x", credentialWarnings: [], needsAcknowledgement: false, ...overrides };
}

function siteImport(overrides: Partial<SiteImport> = {}): SiteImport {
  return { importId: "import-1", source: { url: "https://example.com/s/abc" }, newSiteName: "mingjie-copy", state: "needs-owner", createdAt: "2026-11-03T11:00:00.000Z", ...overrides };
}

function renderExport(port: SiteTransferPort, clipboard: Pick<Clipboard, "writeText"> = { writeText: vi.fn(async () => {}) }) {
  render(<FetchQueryProvider><SiteExportTab t={t} useExport={({ t: tr }) => useSiteExport({ port, t: tr }, { clipboard })} /></FetchQueryProvider>);
}

function renderImport(port: SiteTransferPort) {
  render(<FetchQueryProvider><SiteImportTab t={t} useImport={({ t: tr }) => useSiteImport({ port, t: tr })} /></FetchQueryProvider>);
}

async function exportRow() {
  // The whole table body: an export's row and its full-width detail line under it are one unit here.
  return (await screen.findByText("example.com/_share/abc/mingjie.tovu.zip")).closest("tbody")!;
}

afterEach(() => vi.unstubAllGlobals());

describe("export credential warning", () => {
  it("shows the warning in the export's detail line, not the Status column, with each file once and its kinds beside it", async () => {
    renderExport(createFakeSiteTransferPort({ listShares: async () => ({ shares: [share({ credentialWarnings: warnings, needsAcknowledgement: true })] }) }));
    const row = await exportRow();
    const detail = row.querySelector<HTMLElement>(".list-table-detail")!;
    // Status says only the status; the warning text lives in the full-width line under the row.
    expect(row.querySelector(".site-transfer-status")!.querySelector(".site-transfer-notice-tip")).toBeNull();
    expect(within(row).queryByRole("button", { name: "Warning" })).toBeNull();
    expect(within(detail).getByText("This export may contain credentials in 2 files.")).toBeTruthy();
    expect(row.querySelector(".notice")).toBeNull();
    expect(within(detail).getByText("Show files")).toBeTruthy();
    expect(within(detail).getByText("content.db:settings.value")).toBeTruthy();
    // One entry per file: media/notes.txt has two kinds, listed next to the one path.
    expect(within(detail).getAllByText("media/notes.txt")).toHaveLength(1);
    const notes = within(detail).getByText("media/notes.txt").closest("li")!;
    expect(notes.textContent).toContain("Private key");
    expect(notes.textContent).toContain("Password");
    expect(within(detail).getByText("API key")).toBeTruthy();
    expect((within(row).getByRole("checkbox", { name: "I understand this export may contain credentials" }) as HTMLInputElement).checked).toBe(false);
    // In the row, never a dialog.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says 1 file for a single file", async () => {
    renderExport(createFakeSiteTransferPort({ listShares: async () => ({ shares: [share({ credentialWarnings: [warnings[0]!], needsAcknowledgement: true })] }) }));
    expect(await screen.findByText("This export may contain credentials in 1 file.")).toBeTruthy();
  });

  it("keeps Download zip and Copy link disabled until I understand is checked", async () => {
    const downloadShare = vi.fn();
    renderExport(createFakeSiteTransferPort({ listShares: async () => ({ shares: [share({ credentialWarnings: warnings, needsAcknowledgement: true })] }), downloadShare }));
    const row = await exportRow();
    expect((within(row).getByRole("button", { name: "Download zip" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(row).queryByRole("link", { name: "Download zip" })).toBeNull();
    expect((within(row).getByRole("button", { name: "Copy link" }) as HTMLButtonElement).disabled).toBe(true);
    // Revoke stays available: the warning only gates handing the archive out.
    expect((within(row).getByRole("button", { name: "Revoke" }) as HTMLButtonElement).disabled).toBe(false);
    expect(downloadShare).not.toHaveBeenCalled();
  });

  it("checking I understand records it, then enables Download zip and Copy link", async () => {
    const acknowledgeShare = vi.fn(async () => share({ credentialWarnings: warnings, needsAcknowledgement: false }));
    const writeText = vi.fn(async () => {});
    renderExport(createFakeSiteTransferPort({ listShares: async () => ({ shares: [share({ credentialWarnings: warnings, needsAcknowledgement: true })] }), acknowledgeShare }), { writeText });
    const row = await exportRow();
    fireEvent.click(within(row).getByRole("checkbox", { name: "I understand this export may contain credentials" }));
    await waitFor(() => expect(acknowledgeShare).toHaveBeenCalledExactlyOnceWith({ shareId: "share-1" }));
    const download = await screen.findByRole("link", { name: "Download zip" });
    expect(download.getAttribute("href")).toBe("/download/share-1");
    const copy = screen.getByRole("button", { name: "Copy link" }) as HTMLButtonElement;
    expect(copy.disabled).toBe(false);
    fireEvent.click(copy);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://example.com/_share/abc/mingjie.tovu.zip"));
  });

  it("says when I understand could not be saved and keeps the download disabled", async () => {
    const acknowledgeShare = vi.fn(async () => { throw new ApiError("Export acknowledgement requires an authorized admin session.", 403, "FORBIDDEN"); });
    renderExport(createFakeSiteTransferPort({ listShares: async () => ({ shares: [share({ credentialWarnings: warnings, needsAcknowledgement: true })] }), acknowledgeShare }));
    const row = await exportRow();
    const box = within(row).getByRole("checkbox", { name: "I understand this export may contain credentials" }) as HTMLInputElement;
    fireEvent.click(box);
    expect((await within(row).findByRole("alert")).textContent).toBe("Export acknowledgement requires an authorized admin session.");
    expect(box.checked).toBe(false);
    expect((within(row).getByRole("button", { name: "Download zip" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("leaves an export without warnings unchanged", async () => {
    const downloadShare = vi.fn();
    renderExport(createFakeSiteTransferPort({ listShares: async () => ({ shares: [share()] }), downloadShare }));
    const row = await exportRow();
    expect(within(row).queryByRole("checkbox")).toBeNull();
    expect(within(row).queryByText(/may contain credentials/)).toBeNull();
    expect(within(row).queryByRole("button", { name: "Warning" })).toBeNull();
    // No warning, no detail line: an empty one drew a stray 13px strip under every row.
    expect(row.querySelector(".list-table-detail")).toBeNull();
    expect(within(row).getByRole("link", { name: "Download zip" }).getAttribute("download")).toBe("mingjie.tovu.zip");
    expect((within(row).getByRole("button", { name: "Copy link" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(row).getByRole("link", { name: "Download zip" }));
    await waitFor(() => expect(downloadShare).toHaveBeenCalledExactlyOnceWith({ share: share() }));
  });

  it("shows the server's own reason and the same checkbox when a download is still refused, then downloads once checked", async () => {
    const downloadShare = vi.fn();
    const shareDownloadRefusal = vi.fn().mockResolvedValueOnce({ status: 409, code: "ACKNOWLEDGE_CREDENTIALS", message: REFUSAL, credentialWarnings: warnings }).mockResolvedValue(null);
    const acknowledgeShare = vi.fn(async () => share());
    renderExport(createFakeSiteTransferPort({ listShares: async () => ({ shares: [share()] }), downloadShare, shareDownloadRefusal, acknowledgeShare }));
    const row = await exportRow();
    fireEvent.click(within(row).getByRole("link", { name: "Download zip" }));
    expect(await within(row).findByText(REFUSAL)).toBeTruthy();
    expect(within(row).getByText("content.db:settings.value")).toBeTruthy();
    // A 409's warnings reach the detail line too, though the listed row had none.
    expect(within(row).getByText("This export may contain credentials in 2 files.").closest(".list-table-detail")).toBeTruthy();
    expect(screen.queryByText("Download failed.")).toBeNull();
    expect(downloadShare).not.toHaveBeenCalled();
    expect((within(row).getByRole("button", { name: "Download zip" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(row).getByRole("checkbox", { name: "I understand this export may contain credentials" }));
    await waitFor(() => expect(acknowledgeShare).toHaveBeenCalledWith({ shareId: "share-1" }));
    await waitFor(() => expect(downloadShare).toHaveBeenCalledOnce());
  });

  it("shows any other refused download's own reason", async () => {
    const shareDownloadRefusal = vi.fn(async () => ({ status: 404, code: "NOT_FOUND", message: "Export download failed: the ZIP is missing from storage. Create a new export.", credentialWarnings: [] }));
    renderExport(createFakeSiteTransferPort({ listShares: async () => ({ shares: [share()] }), shareDownloadRefusal, downloadShare: vi.fn() }));
    fireEvent.click(within(await exportRow()).getByRole("link", { name: "Download zip" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Export download failed: the ZIP is missing from storage. Create a new export.");
  });

  it("holds a static export's automatic download until I understand is checked", async () => {
    const pending = share({ shareId: "static-1", file: "site-static.zip", url: null, credentialWarnings: warnings, needsAcknowledgement: true });
    const downloadShare = vi.fn();
    const acknowledgeShare = vi.fn(async () => ({ ...pending, needsAcknowledgement: false }));
    const listShares = vi.fn().mockResolvedValueOnce({ shares: [] }).mockResolvedValue({ shares: [pending] });
    renderExport(createFakeSiteTransferPort({ staticExportOptions: async () => ({ activeThemeId: "a", themes: [{ themeId: "a", name: "a" }] }),
      createStaticShare: async () => pending, listShares, downloadShare, acknowledgeShare }));
    const button = screen.getByRole("button", { name: "Export static site" }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    const box = await screen.findByRole("checkbox", { name: "I understand this export may contain credentials" });
    expect(downloadShare).not.toHaveBeenCalled();
    fireEvent.click(box);
    await waitFor(() => expect(downloadShare).toHaveBeenCalledOnce());
    expect(acknowledgeShare).toHaveBeenCalledWith({ shareId: "static-1" });
  });
});

describe("import credential notice", () => {
  it("lists credential warnings for the import just made without blocking its setup", async () => {
    const startImport = vi.fn(async () => siteImport({ credentialWarnings: [warnings[0]!] }));
    renderImport(createFakeSiteTransferPort({ startImport }));
    fireEvent.change(screen.getByLabelText("Share link"), { target: { value: "https://example.com/s/abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Import as a new site" }));
    const summary = await screen.findByText("This import may contain credentials in 1 file.");
    expect(summary.closest(".site-transfer-notice-tip")).toBeTruthy();
    const form = summary.closest("form") as HTMLElement;
    expect(within(form).getByText("content.db:settings.value")).toBeTruthy();
    expect(within(form).getByText("API key")).toBeTruthy();
    expect(within(form).queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Create site" })).toBeTruthy();
  });

  it("shows a past import's credential warnings in its history row", async () => {
    renderImport(createFakeSiteTransferPort({ listImports: async () => ({ imports: [siteImport({ state: "ready", credentialWarnings: warnings })] }) }));
    const table = await screen.findByRole("table");
    expect(within(table).getByText("This import may contain credentials in 2 files.")).toBeTruthy();
    expect(within(table).getByText("content.db:settings.value")).toBeTruthy();
  });

  it("shows no credential notice for an import without warnings", async () => {
    renderImport(createFakeSiteTransferPort({ startImport: async () => siteImport({ credentialWarnings: [] }) }));
    fireEvent.change(screen.getByLabelText("Share link"), { target: { value: "https://example.com/s/abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Import as a new site" }));
    await screen.findByRole("button", { name: "Create site" });
    expect(screen.queryByText(/may contain credentials/)).toBeNull();
  });
});

describe("live port: acknowledgement and download check", () => {
  it("records I understand with an empty POST to the share's acknowledge route", async () => {
    const calls: { url: string; method?: string; body?: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body });
      return new Response(JSON.stringify(share()), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    await defaultSiteTransferPort.acknowledgeShare({ shareId: "a/b" });
    expect(calls).toEqual([{ url: expect.stringMatching(/\/site-shares\/a%2Fb\/acknowledge$/), method: "POST", body: "{}" }]);
  });

  it("asks with HEAD first and lets an allowed download proceed without reading the zip", async () => {
    const methods: (string | undefined)[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => { methods.push(init?.method); return new Response(null, { status: 200 }); });
    expect(await defaultSiteTransferPort.shareDownloadRefusal({ share: share() })).toBeNull();
    expect(methods).toEqual(["HEAD"]);
  });

  it("reads a refused download's reason from the server", async () => {
    const methods: (string | undefined)[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      methods.push(init?.method);
      return init?.method === "HEAD" ? new Response(null, { status: 409 })
        : new Response(JSON.stringify({ code: "ACKNOWLEDGE_CREDENTIALS", message: REFUSAL, credentialWarnings: warnings }), { status: 409, headers: { "Content-Type": "application/json" } });
    });
    expect(await defaultSiteTransferPort.shareDownloadRefusal({ share: share() })).toEqual({ status: 409, code: "ACKNOWLEDGE_CREDENTIALS", message: REFUSAL, credentialWarnings: warnings });
    expect(methods).toEqual(["HEAD", "GET"]);
  });
});
