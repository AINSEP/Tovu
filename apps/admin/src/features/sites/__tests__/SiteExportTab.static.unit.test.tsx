import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { SiteExportTab } from "../SiteExportTab";
import { useSiteExport } from "../hooks/use-site-transfer.hooks";
import { createFakeSiteTransferPort, type SiteShare, type SiteShareCreateResult } from "../hooks/site-transfer-dependencies.hooks";

// jsdom applies the popover UA hiding rule but cannot run the native invoker action.
// Keep React's hidden/open state observable here; real top-layer behavior needs a browser probe.
const popoverStyle = document.createElement("style");
beforeAll(() => { popoverStyle.textContent = "[popover]:not([hidden]) { display: block !important; }"; document.head.appendChild(popoverStyle); });
afterAll(() => popoverStyle.remove());

const options = { activeThemeId: "zoran-poster", themes: [{ themeId: "zoran-poster", name: "poster" }, { themeId: "zoran-editorial", name: "editorial" }] };
const t = (text: string) => text;
const share: SiteShare = { shareId: "static-1", file: "site-static-2026-10-30-1015.zip", bytes: 40, url: null, status: "active", createdAt: "2026-10-30T17:15:00Z", downloadUrl: "/download/static-1" };

it("shows static-export scope notes and omission notices while downloading", async () => {
  const notices = ["Left out custom/example.txt."];
  const notes = ["Static copy only."];
  const downloadShare = vi.fn();
  const port = createFakeSiteTransferPort({ staticExportOptions: async () => options,
    createStaticShare: async () => ({ ...share, notices, notes }), downloadShare });
  render(<FetchQueryProvider><SiteExportTab t={t} useExport={() => useSiteExport({ port, t })} /></FetchQueryProvider>);
  const button = screen.getByRole("button", { name: "Export static site" });
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
  expect(await screen.findByText(notices[0]!)).toBeVisible();
  expect(screen.getByText(notes[0]!)).toBeVisible();
  expect(downloadShare).toHaveBeenCalledOnce();
}, 10000);

describe("SiteExportTab static download", () => {
  it("renders an outlined Export static site button beside Export Tovu site and downloads through the share route", async () => {
    const createStaticShare = vi.fn(async () => share);
    const downloadShare = vi.fn();
    const port = createFakeSiteTransferPort({ staticExportOptions: async () => options, createStaticShare, downloadShare });
    render(<FetchQueryProvider><SiteExportTab t={t} useExport={() => useSiteExport({ port, t })} /></FetchQueryProvider>);
    expect(screen.queryByRole("button", { name: "Export this site" })).toBeNull();
    const button = screen.getByRole("button", { name: "Export static site" });
    expect(button.className).toContain("btn-secondary");
    expect(button.closest(".site-export-actions")).toBe(screen.getByRole("button", { name: "Export Tovu site" }).parentElement);
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(createStaticShare).toHaveBeenCalledWith({ themeIds: ["zoran-poster"] }));
    await waitFor(() => expect(downloadShare).toHaveBeenCalledWith({ share }));
  });

  it("shows the same busy and error states and prevents another export while static export is running", async () => {
    let reject!: (error: Error) => void;
    const createShare = vi.fn();
    const port = createFakeSiteTransferPort({ staticExportOptions: async () => options, createShare, createStaticShare: () => new Promise<SiteShareCreateResult>((_, fail) => { reject = fail; }) });
    render(<FetchQueryProvider><SiteExportTab t={t} useExport={() => useSiteExport({ port, t })} /></FetchQueryProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Export static site" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Export static site" }));
    const busy = screen.getByRole("button", { name: "Exporting…" });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Export Tovu site" }).hasAttribute("disabled")).toBe(true);
    expect(createShare).not.toHaveBeenCalled();
    await act(async () => { reject(new Error("Static render unavailable")); });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Static render unavailable"));
    expect(screen.getByRole("button", { name: "Export static site" }).hasAttribute("disabled")).toBe(false);
  });

  it("polls the static export job through the static action before downloading", async () => {
    const createStaticShare = vi.fn().mockResolvedValueOnce({ jobId: "job-1", phase: "preparing" }).mockResolvedValueOnce(share);
    const downloadShare = vi.fn();
    const port = createFakeSiteTransferPort({ staticExportOptions: async () => options, createStaticShare, downloadShare });
    render(<FetchQueryProvider><SiteExportTab t={t} useExport={() => useSiteExport({ port, t })} /></FetchQueryProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Export static site" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Export static site" }));
    await waitFor(() => expect(downloadShare).toHaveBeenCalledWith({ share }));
    expect(createStaticShare.mock.calls).toEqual([[{ themeIds: ["zoran-poster"] }], [{ jobId: "job-1" }]]);
  });

  it("does not claim link hosting is missing just because a static download has no public URL", async () => {
    const port = createFakeSiteTransferPort({ staticExportOptions: async () => options, listShares: async () => ({ shares: [share] }) });
    render(<FetchQueryProvider><SiteExportTab t={t} useExport={() => useSiteExport({ port, t })} /></FetchQueryProvider>);
    await waitFor(() => expect(screen.queryByText("Loading exports…")).toBeNull());
    expect(screen.queryByText(/No link host is set up/)).toBeNull();
    expect(screen.getByRole("link", { name: "Download zip" }).getAttribute("download")).toBe("site-static-2026-10-30-1015.zip");
  });
});


it("picker keeps ordered selections, mixed Select all, zero disabling and keyboard checkbox navigation", async () => {
  const user = userEvent.setup(), createStaticShare = vi.fn(async () => share);
  const port = createFakeSiteTransferPort({ staticExportOptions: async () => options, createStaticShare, downloadShare: vi.fn() });
  render(<FetchQueryProvider><SiteExportTab t={t} useExport={() => useSiteExport({ port, t })} /></FetchQueryProvider>);
  const toggle = screen.getByRole("button", { name: "Choose sites to export" });
  await user.click(toggle);
  const poster = await screen.findByRole("checkbox", { name: "poster" }) as HTMLInputElement;
  const editorial = screen.getByRole("checkbox", { name: "editorial" }) as HTMLInputElement;
  const all = screen.getByRole("checkbox", { name: "Select all" }) as HTMLInputElement;
  expect(poster.checked).toBe(true); expect(editorial.checked).toBe(false); expect(all.indeterminate).toBe(true);
  await user.click(poster);
  expect(screen.getByRole("button", { name: "Export static site" }).hasAttribute("disabled")).toBe(true);
  expect(toggle.hasAttribute("disabled")).toBe(false);
  editorial.focus(); await user.keyboard(" ");
  await user.click(poster);
  expect(all.checked).toBe(true); expect(all.indeterminate).toBe(false);
  await user.click(screen.getByRole("button", { name: "Export static site" }));
  await waitFor(() => expect(createStaticShare).toHaveBeenCalledWith({ themeIds: ["zoran-editorial", "zoran-poster"] }));
  expect(screen.getByRole("group", { name: "Sites to export" })).toBeTruthy();
});

it("Select all toggles 50 options while the list has a separate scrolling region", async () => {
  const user = userEvent.setup();
  const themes = Array.from({ length: 50 }, (_, index) => ({ themeId: `theme-${index}`, name: `theme-${index}` }));
  const port = createFakeSiteTransferPort({ staticExportOptions: async () => ({ activeThemeId: "theme-0", themes }) });
  const { container } = render(<FetchQueryProvider><SiteExportTab t={t} useExport={() => useSiteExport({ port, t })} /></FetchQueryProvider>);
  await user.click(screen.getByRole("button", { name: "Choose sites to export" }));
  const all = await screen.findByRole("checkbox", { name: "Select all" }) as HTMLInputElement;
  await user.click(all);
  expect(screen.getAllByRole("checkbox").filter(input => (input as HTMLInputElement).checked)).toHaveLength(51);
  expect(container.querySelector(".static-export-theme-list")!.contains(all)).toBe(false);
  await user.click(all);
  expect(screen.getAllByRole("checkbox").some(input => (input as HTMLInputElement).checked)).toBe(false);
});

it("disables export during roster loading or failure and explains the problem inside the picker", async () => {
  let fail!: (error: Error) => void;
  const port = createFakeSiteTransferPort({ staticExportOptions: () => new Promise((_, reject) => { fail = reject; }) });
  render(<FetchQueryProvider><SiteExportTab t={t} useExport={() => useSiteExport({ port, t })} /></FetchQueryProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Choose sites to export" }));
  expect(screen.getByText("Loading sites…")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Export static site" }).hasAttribute("disabled")).toBe(true);
  await waitFor(() => expect(fail).toBeTypeOf("function"));
  await act(async () => fail(new Error("Roster unavailable")));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Roster unavailable"));
  expect(screen.getByRole("button", { name: "Export static site" }).hasAttribute("disabled")).toBe(true);
});
