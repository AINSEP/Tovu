import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { SiteExportTab } from "../SiteExportTab";
import { useSiteExport } from "../hooks/use-site-transfer.hooks";
import { createFakeSiteTransferPort, defaultSiteTransferPort, type SiteShare } from "../hooks/site-transfer-dependencies.hooks";
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
