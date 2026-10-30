import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { SiteExportTab } from "../SiteExportTab";
import { useSiteExport } from "../hooks/use-site-transfer.hooks";
import { createFakeSiteTransferPort, type SiteShare, type SiteShareCreateResult } from "../hooks/site-transfer-dependencies.hooks";

const t = (text: string) => text;
const share: SiteShare = { shareId: "static-1", file: "site-static-2026-10-30-1015.zip", bytes: 40, url: null, status: "active", createdAt: "2026-10-30T17:15:00Z", downloadUrl: "/download/static-1" };

describe("SiteExportTab static download", () => {
  it("renders an outlined Export static site button beside Export Tovu site and downloads through the share route", async () => {
    const createStaticShare = vi.fn(async () => share);
    const downloadShare = vi.fn();
    const port = createFakeSiteTransferPort({ createStaticShare, downloadShare });
    render(<FetchQueryProvider><SiteExportTab t={t} useExport={() => useSiteExport({ port, t })} /></FetchQueryProvider>);
    expect(screen.queryByRole("button", { name: "Export this site" })).toBeNull();
    const button = screen.getByRole("button", { name: "Export static site" });
    expect(button.className).toContain("btn-secondary");
    expect(button.parentElement).toBe(screen.getByRole("button", { name: "Export Tovu site" }).parentElement);
    fireEvent.click(button);
    await waitFor(() => expect(createStaticShare).toHaveBeenCalledWith({}));
    await waitFor(() => expect(downloadShare).toHaveBeenCalledWith({ share }));
  });

  it("shows the same busy and error states and prevents another export while static export is running", async () => {
    let reject!: (error: Error) => void;
    const createShare = vi.fn();
    const port = createFakeSiteTransferPort({ createShare, createStaticShare: () => new Promise<SiteShareCreateResult>((_, fail) => { reject = fail; }) });
    render(<FetchQueryProvider><SiteExportTab t={t} useExport={() => useSiteExport({ port, t })} /></FetchQueryProvider>);
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
    const port = createFakeSiteTransferPort({ createStaticShare, downloadShare });
    render(<FetchQueryProvider><SiteExportTab t={t} useExport={() => useSiteExport({ port, t })} /></FetchQueryProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Export static site" }));
    await waitFor(() => expect(downloadShare).toHaveBeenCalledWith({ share }));
    expect(createStaticShare.mock.calls).toEqual([[{}], [{ jobId: "job-1" }]]);
  });

  it("does not claim link hosting is missing just because a static download has no public URL", async () => {
    const port = createFakeSiteTransferPort({ listShares: async () => ({ shares: [share] }) });
    render(<FetchQueryProvider><SiteExportTab t={t} useExport={() => useSiteExport({ port, t })} /></FetchQueryProvider>);
    await waitFor(() => expect(screen.queryByText("Loading exports…")).toBeNull());
    expect(screen.queryByText(/No link host is set up/)).toBeNull();
  });
});
