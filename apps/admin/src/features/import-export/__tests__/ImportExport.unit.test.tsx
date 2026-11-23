import { act, fireEvent, render, renderHook, screen, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportExport } from "@jini-ai/admin/screens/import-export/ImportExport";
import { createFakeGitBackupPort } from "@jini-ai/admin/screens/import-export/hooks/git-backup-port.hooks";
import { useGitBackup } from "@jini-ai/admin/screens/import-export/hooks/use-git-backup.hooks";
import { describeApiError } from "@/lib/admin-http/request";
import { navigate } from "@jini-ai/admin/shell/lib/router";
import { SiteExportTab, SiteImportTab } from "@/features/sites";
import { IMPORT_EXPORT_HANDLE_LABELS, ImportExportPanel } from "../ImportExportPanel";
import { useSitesSectionAvailable } from "../hooks/use-import-export.hooks";
import { publishContentRefresh } from "@jini-ai/admin/shell/lib/content-refresh-bus";
import { SITES_RESOURCE } from "@/features/sites/rules";

/**
 * @file The moved `ImportExport` screen with this app's real Sites tabs and hooks (the screen's own
 * tab, card and dictionary behaviour is tested in `@jini-ai/admin`), plus the panel mount.
 */

/** The Git backup card on a fake port with no connection, so no test here reaches the network. */
const useFakeGitBackup = ({ t: translate }: { t: (key: string) => string }) => useGitBackup({ port: createFakeGitBackupPort(), t: translate, describeApiError });
const identity = () => (key: string) => key;

/** Export and Import read their lists over `fetch`; answer every read with empty lists. */
beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => Response.json({ shares: [], imports: [] }))));
afterEach(() => vi.unstubAllGlobals());

function renderPanel(tabId: string | null, { sitesAvailable = false }: { sitesAvailable?: boolean } = {}) {
  return render(
    <ImportExport
      tabId={tabId} useTranslate={identity} useGitBackup={useFakeGitBackup} useTransferTranslate={identity} useSitesAvailable={() => sitesAvailable}
      SiteExportTab={SiteExportTab} SiteImportTab={SiteImportTab} handleLabels={IMPORT_EXPORT_HANDLE_LABELS} navigate={navigate}
    />,
  );
}

describe("Import & Export tabs (owner, 2026-10-25, option A)", () => {
  it("opens Export by default, with Export Tovu site and no Publish button beside it", async () => {
    renderPanel(null);
    expect(screen.getByRole("heading", { level: 1, name: "Import & Export" })).toBeTruthy();
    // No "Operations" kicker above the title (owner, 2026-10-25).
    expect(screen.queryByText("Operations")).toBeNull();
    expect(screen.getByRole("tab", { name: /Export/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "Export Tovu site" })).toBeTruthy();
    // Removed from this page (owner, 2026-10-25): it republished the whole site, not the zip.
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    await waitFor(() => expect(screen.queryByText("Loading exports…")).toBeNull());
  });

  it("opens Import from ?tab=import, without Publish", async () => {
    renderPanel("import");
    expect(screen.getByRole("tab", { name: /Import/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "Import as a new site" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    await waitFor(() => expect(screen.queryByText("Loading imports…")).toBeNull());
  });

  it("offers a live website (which makes a new site) only where the Sites section can make one", () => {
    const view = renderPanel("import");
    expect(screen.queryByLabelText("Website address")).toBeNull();
    expect(screen.getByText("This host can't make new sites, so it can't import a live website here.")).toBeTruthy();
    view.unmount();
    renderPanel("import", { sitesAvailable: true });
    expect(screen.getByLabelText("Website address")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "New site" })).toBeNull();
  });

  it("keeps the Static Site card and Git backup on Other", async () => {
    renderPanel("other");
    expect(screen.getByRole("tab", { name: /Other/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("link", { name: "Open Static Site" }).getAttribute("href")).toBe("/admin/deployment?tab=static-site");
    expect(screen.queryByRole("link", { name: /Open (Export|Import) Site/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Git backup" })).toBeTruthy();
    expect((await screen.findByRole("link", { name: "Open Source Control" })).getAttribute("href")).toBe("/admin/source-control");
  });

  it("mounts with the app wiring: its own dictionary, the live Sites Export tab and the .tovu.zip agent labels", async () => {
    render(<ImportExportPanel tabId={null} />);
    expect(screen.getByRole("heading", { level: 1, name: "Import & Export" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export Tovu site" })).toBeTruthy();
    expect(IMPORT_EXPORT_HANDLE_LABELS.export).toContain(".tovu.zip");
    expect(IMPORT_EXPORT_HANDLE_LABELS.import).toContain(".tovu.zip");
    await waitFor(() => expect(screen.queryByText("Loading exports…")).toBeNull());
  });
});

describe("useSitesSectionAvailable", () => {
  it("is false in the desktop shell without reading the sites list", () => {
    const fetchSpy = vi.mocked(globalThis.fetch);
    const { result } = renderHook(() => useSitesSectionAvailable({}, { desktop: true }));
    expect(result.current).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("follows the server's switchingEnabled in a browser", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ sites: [], switchingEnabled: true, currentSite: null, persistedSiteName: null })));
    const { result } = renderHook(() => useSitesSectionAvailable({}, { desktop: false }));
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("turns off making sites when a refresh fails, as the router drops the Sites route", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ sites: [], switchingEnabled: true, currentSite: null, persistedSiteName: null }))
        .mockResolvedValue(Response.json({ error: "boom" }, { status: 500 })),
    );
    const { result } = renderHook(() => useSitesSectionAvailable({}, { desktop: false }));
    await waitFor(() => expect(result.current).toBe(true));
    act(() => publishContentRefresh({ resources: [SITES_RESOURCE] }));
    await waitFor(() => expect(result.current).toBe(false));
  });
});
