import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { SiteExportTab } from "../SiteExportTab";
import { useSiteExport } from "../hooks/use-site-transfer.hooks";
import { createFakeSiteTransferPort, type SiteShare } from "../hooks/site-transfer-dependencies.hooks";
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
