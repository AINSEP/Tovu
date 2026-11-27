import { useShareExpiryState } from "../hooks/use-share-expiry.hooks";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { SiteExportTab } from "../SiteExportTab";
import { useSiteExport } from "../hooks/use-site-transfer.hooks";
import { createFakeSiteTransferPort, defaultSiteTransferPort, type SiteShare, type SiteTransferPort } from "../hooks/site-transfer-dependencies.hooks";
import { shareStatusView } from "../site-transfer-rules";
import { SITE_TRANSFER_DICT } from "../site-transfer-i18n";

const t = (text: string) => text;
const base: SiteShare = { shareId: "backup", file: "site.tovu.zip", bytes: 40, url: "https://share.example/a", status: "active", createdAt: "2026-10-30T17:15:00Z", downloadUrl: "/download/backup" };

describe("share expiry status (P11 ST-12b.T)", () => {
  it("expired label: an expired export reads Expired, never Failed", async () => {
    expect(shareStatusView({ status: "expired", t })).toEqual({ label: "Expired", className: "status status-neutral" });
    const port = createFakeSiteTransferPort({ listShares: async () => ({ shares: [{ ...base, status: "expired", expiresAt: "2026-11-06T17:15:00.000Z" }] }) });
    render(<FetchQueryProvider><SiteExportTab t={t} useExport={() => useSiteExport({ port, t })} /></FetchQueryProvider>);
    expect(await screen.findAllByText("Expired")).not.toHaveLength(0);
    expect(screen.queryByText("Failed")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
  });

  it("every locale translates the Expired label", () => {
    for (const [locale, entries] of Object.entries(SITE_TRANSFER_DICT)) expect(entries.Expired, locale).toMatch(/\S/);
  });
});

describe("share expiry request (P11 ST-12b.T)", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("the live createShare binding sends the owner's day choice on the initial POST only", async () => {
    const bodies: Array<string | undefined> = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => { bodies.push(init?.body as string | undefined); return Response.json({ ok: true }); });
    await defaultSiteTransferPort.createShare({ expiresInDays: 30 });
    await defaultSiteTransferPort.createShare({ jobId: "job-1", expiresInDays: 30 });
    await defaultSiteTransferPort.createShare({ expiresInDays: null });
    expect(bodies).toEqual([JSON.stringify({ expiresInDays: 30 }), JSON.stringify({ jobId: "job-1" }), "{}"]);
  });

  it("poll does not send expiresInDays: only the initial create carries the choice", async () => {
    const calls: Array<{ jobId?: string; expiresInDays?: number | null }> = [];
    const port = createFakeSiteTransferPort({
      listShares: async () => ({ shares: [], expiryChoices: [7, 30, 90] }),
      createShare: async (input, _options = {}) => {
        calls.push(input);
        return calls.length < 3 ? { jobId: "job-1", phase: "packing" } : base;
      },
    });
    const { result } = renderHook(() => useSiteExport({ port, t }), { wrapper: FetchQueryProvider });
    await waitFor(() => expect(result.current.shareExpiry.choices).toEqual([7, 30, 90]));
    act(() => result.current.shareExpiry.useShareExpiry().change({ expiresInDays: 30 }));
    await act(() => result.current.exportSite());
    expect(calls).toEqual([{ expiresInDays: 30 }, { jobId: "job-1" }, { jobId: "job-1" }]);
  });

  it("a day choice the destination does not honour is sent as Never", async () => {
    const calls: Array<{ jobId?: string; expiresInDays?: number | null }> = [];
    const port = createFakeSiteTransferPort({ listShares: async () => ({ shares: [] }), createShare: async (input, _options = {}) => { calls.push(input); return base; } });
    const { result } = renderHook(() => useSiteExport({ port, t }), { wrapper: FetchQueryProvider });
    await waitFor(() => expect(result.current.shares).toEqual([]));
    act(() => result.current.shareExpiry.useShareExpiry().change({ expiresInDays: 7 }));
    await act(() => result.current.exportSite());
    expect(calls).toEqual([{}]);
  });
});

describe("share expiry controls on the Export tab (P11 ST-12b.T)", () => {
  function renderTab(listShares: SiteTransferPort["listShares"]) {
    const port = createFakeSiteTransferPort({ listShares });
    const view = render(<FetchQueryProvider><SiteExportTab t={t} useExport={() => useSiteExport({ port, t })} /></FetchQueryProvider>);
    return { port, view };
  }

  it("active link without expiry untouched: renders Never, no expiry date, and survives hiding expired rows", async () => {
    const { view } = renderTab(async () => ({ shares: [base], expiryChoices: [7, 30, 90] }));
    expect(await screen.findByRole("button", { name: "Copy link" })).toBeVisible();
    expect((screen.getByRole("combobox", { name: "Never expires" }) as HTMLSelectElement).value).toBe("never");
    expect(view.container.querySelector("time")).toBeNull();
    expect(screen.queryByText("This export's link has expired.")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Show expired exports" }));
    expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible();
    expect(screen.getByText("Active")).toBeVisible();
  });

  it("offers 7, 30 and 90 days only when the destination honours them", async () => {
    renderTab(async () => ({ shares: [base] }));
    await screen.findByRole("button", { name: "Copy link" });
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["Never expires"]);
  });

  it("lists the day choices the destination honours", async () => {
    renderTab(async () => ({ shares: [base], expiryChoices: [7, 30, 90] }));
    await screen.findByRole("option", { name: "Expires after 30 days" });
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["Never expires", "Expires after 7 days", "Expires after 30 days", "Expires after 90 days"]);
  });

  it("shows the server's expiryChoices from the live list response and still defaults to Never", async () => {
    // The wire body the list route answers: Never (null) first, then the days this destination honours.
    const posts: Array<string | undefined> = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") { posts.push(init.body as string | undefined); return Response.json(base); }
      return Response.json({ shares: [base], expiryChoices: [null, 30] });
    });
    render(<FetchQueryProvider><SiteExportTab t={t} useExport={() => useSiteExport({ port: defaultSiteTransferPort, t })} /></FetchQueryProvider>);
    await screen.findByRole("option", { name: "Expires after 30 days" });
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["Never expires", "Expires after 30 days"]);
    expect((screen.getByRole("combobox", { name: "Never expires" }) as HTMLSelectElement).value).toBe("never");
    fireEvent.click(screen.getByRole("button", { name: "Export Tovu site" }));
    await waitFor(() => expect(posts).toEqual(["{}"]));
    vi.unstubAllGlobals();
  });

  it("acknowledge after expiry keeps it expired: the notice goes, the row stays Expired with no link actions", async () => {
    renderTab(async () => ({ shares: [{ ...base, status: "expired", expiresAt: "2026-11-06T17:15:00.000Z" }], expiryChoices: [7, 30, 90] }));
    expect(await screen.findByText("This export's link has expired.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("This export's link has expired.")).toBeNull();
    expect(screen.getByText("Expired")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Download zip" })).toBeNull();
  });

  it("Show expired exports (on by default) hides expired rows when cleared", async () => {
    renderTab(async () => ({ shares: [{ ...base, shareId: "old", status: "expired", expiresAt: "2026-11-06T17:15:00.000Z" }, { ...base, shareId: "live", createdAt: "2026-11-20T10:00:00Z" }] }));
    const toggle = await screen.findByRole("checkbox", { name: "Show expired exports" }) as HTMLInputElement;
    await screen.findByText("Expired");
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(screen.queryByText("Expired")).toBeNull();
    expect(screen.getByText("Active")).toBeVisible();
  });
});

it("does not dismiss the expiry notice for a different export after acknowledging one", () => {
  const { result, rerender } = renderHook<ReturnType<typeof useShareExpiryState>, { newestBackup: SiteShare | undefined }>(
    ({ newestBackup }) => useShareExpiryState({ offered: [7], newestBackup }),
    { initialProps: { newestBackup: undefined } },
  );
  act(() => result.current.useShareExpiry().acknowledge());
  expect(result.current.acknowledgedId).toBeNull();
  rerender({ newestBackup: base });
  act(() => result.current.useShareExpiry().acknowledge());
  expect(result.current.acknowledgedId).toBeNull();
  rerender({ newestBackup: { ...base, shareId: "expired-2", status: "expired" } });
  act(() => result.current.useShareExpiry().acknowledge());
  expect(result.current.acknowledgedId).toBe("expired-2");
  rerender({ newestBackup: { ...base, shareId: "active-3" } });
  act(() => result.current.useShareExpiry().acknowledge());
  expect(result.current.acknowledgedId).toBe("expired-2");
});
