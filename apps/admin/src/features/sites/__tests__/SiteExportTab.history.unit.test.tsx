import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { SiteExportTab } from "../SiteExportTab";
import { useSiteExport } from "../hooks/use-site-transfer.hooks";
import { createFakeSiteTransferPort, type SiteShare } from "../hooks/site-transfer-dependencies.hooks";

const t = (text: string) => text;
const base: SiteShare = { shareId: "backup", file: "site.tovu.zip", bytes: 40, url: null, status: "active", createdAt: "2026-10-30T17:15:00Z", downloadUrl: "/download/backup" };

it("labels backup and static exports even when their dates and sizes match", async () => {
  const port = createFakeSiteTransferPort({ listShares: async () => ({ shares: [base, { ...base, shareId: "static", file: "site-static-2026-10-30-1015.zip" }] }) });
  render(<FetchQueryProvider><SiteExportTab t={t} useExport={() => useSiteExport({ port, t })} /></FetchQueryProvider>);
  expect(await screen.findByRole("columnheader", { name: "Type" })).toBeVisible();
  expect(screen.getByText("Tovu backup")).toBeVisible();
  expect(screen.getByText("Static site")).toBeVisible();
});

it("uses the server's theme display name in the export choices", async () => {
  const port = createFakeSiteTransferPort({ staticExportOptions: async () => ({ activeThemeId: "studio-poster", themes: [{ themeId: "studio-poster", name: "Poster Display" }] }) });
  render(<FetchQueryProvider><SiteExportTab t={t} useExport={() => useSiteExport({ port, t })} /></FetchQueryProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Choose sites to export" }));
  expect(await screen.findByText("Poster Display")).toBeInTheDocument();
  expect(screen.queryByText("studio-poster")).toBeNull();
});
