import { act, fireEvent, render, renderHook, screen, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportExport } from "../ImportExport";
import { IMPORT_EXPORT_DICT, t } from "../import-export-i18n";
import { resolveImportExportTabId, resolveImportExportTabs } from "../import-export-tabs";
import { createFakeGitBackupPort } from "../hooks/git-backup-port.hooks";
import { useGitBackup } from "../hooks/use-git-backup.hooks";
import { useSitesSectionAvailable } from "../hooks/use-import-export.hooks";
import { publishContentRefresh } from "@/lib/content-refresh-bus";
import { SITES_RESOURCE } from "@/features/sites/rules";

/** The Git backup card on a fake port with no connection, so no test here reaches the network. */
const useFakeGitBackup = ({ t: translate }: { t: (key: string) => string }) => useGitBackup({ port: createFakeGitBackupPort(), t: translate });
const identity = () => (key: string) => key;

/** Export and Import read their lists over `fetch`; answer every read with empty lists. */
beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => Response.json({ shares: [], imports: [] }))));
afterEach(() => vi.unstubAllGlobals());

function renderPanel(tabId: string | null, { sitesAvailable = false }: { sitesAvailable?: boolean } = {}) {
  return render(
    <ImportExport tabId={tabId} useGitBackup={useFakeGitBackup} useTransferTranslate={identity} useSitesAvailable={() => sitesAvailable} />,
  );
}

describe("Import & Export tabs (owner, 2026-10-25, option A)", () => {
  it("opens Export by default, with Export this site and the Publish button beside it", async () => {
    renderPanel(null);
    expect(screen.getByRole("heading", { level: 1, name: "Import & Export" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Export/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "Export this site" })).toBeTruthy();
    // Publish stays on every host, desktop included (owner, 2026-10-25).
    expect(screen.getByRole("button", { name: "Publish" }).getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(screen.queryByText("Loading exports…")).toBeNull());
  });

  it("opens Import from ?tab=import, without Publish", async () => {
    renderPanel("import");
    expect(screen.getByRole("tab", { name: /Import/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "Import as a new site" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    await waitFor(() => expect(screen.queryByText("Loading imports…")).toBeNull());
  });

  it("links Import to Sites → New site only where the Sites section exists", () => {
    const view = renderPanel("import");
    expect(screen.queryByRole("link", { name: "New site" })).toBeNull();
    view.unmount();
    renderPanel("import", { sitesAvailable: true });
    expect(screen.getByRole("link", { name: "New site" }).getAttribute("href")).toBe("/admin/sites?tab=new");
  });

  it("keeps the Static Site card and Git backup on Other", async () => {
    renderPanel("other");
    expect(screen.getByRole("tab", { name: /Other/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("link", { name: "Open Static Site" }).getAttribute("href")).toBe("/admin/deployment?tab=static-site");
    expect(screen.queryByRole("link", { name: /Open (Export|Import) Site/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Git backup" })).toBeTruthy();
    expect((await screen.findByRole("link", { name: "Open Source Control" })).getAttribute("href")).toBe("/admin/source-control");
  });

  it("falls back to Export for an unknown or absent ?tab=", () => {
    expect(resolveImportExportTabId("other")).toBe("other");
    expect(resolveImportExportTabId("import")).toBe("import");
    expect(resolveImportExportTabId("Import")).toBe("export");
    expect(resolveImportExportTabId("static")).toBe("export");
    expect(resolveImportExportTabId(null)).toBe("export");
    expect(resolveImportExportTabId(undefined)).toBe("export");
    renderPanel("nope");
    expect(screen.getByRole("tab", { name: /Export/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("tags Export and Import SOON, greyed by the page scope, and every tab navigates", () => {
    renderPanel("other");
    expect(document.querySelector(".page.import-export-page")).toBeTruthy();
    for (const [name, search] of [[/Export/, "?tab=export"], [/Import/, "?tab=import"], [/Other/, "?tab=other"]] as const) {
      const tab = screen.getByRole("tab", { name: name });
      expect(tab.hasAttribute("disabled")).toBe(false);
      fireEvent.click(tab);
      expect(window.location.pathname.endsWith("/import-export")).toBe(true);
      expect(window.location.search).toBe(search);
    }
    const tabs = resolveImportExportTabs({ t: (key) => key });
    expect(tabs.map((tab) => [tab.id, tab.label, tab.tag, tab.handle])).toEqual([
      ["export", "Export", "Soon", "import-export-tab-export"],
      ["import", "Import", "Soon", "import-export-tab-import"],
      ["other", "Other", undefined, "import-export-tab-other"],
    ]);
    expect(resolveImportExportTabs({ t: (key) => key }, { transferTabsSoon: false }).map((tab) => tab.tag)).toEqual([undefined, undefined, undefined]);
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

  it("drops the New site link when a refresh fails, as the router drops the Sites route", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ sites: [], switchingEnabled: true, currentSite: null, persistedSiteName: null }))
        .mockResolvedValue(Response.json({ error: "boom" }, { status: 500 })),
    );
    const { result } = renderHook(() => useSitesSectionAvailable({}, { desktop: false }));
    await waitFor(() => expect(result.current).toBe(true));
    act(() => publishContentRefresh([SITES_RESOURCE]));
    await waitFor(() => expect(result.current).toBe(false));
  });
});

it("renders through the translator it is given", () => {
  render(<ImportExport tabId="other" useTranslate={() => (key) => `[${key}]`} useGitBackup={useFakeGitBackup} />);
  expect(screen.getByRole("heading", { level: 1, name: "[Import & Export]" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: /\[Other\]/ })).toBeTruthy();
  expect(screen.getByText("[Read-only HTML of the published pages, for any static host.]")).toBeTruthy();
});

it("carries every key in every locale", () => {
  const keys = Object.keys(IMPORT_EXPORT_DICT.es);
  for (const [locale, entries] of Object.entries(IMPORT_EXPORT_DICT)) expect(Object.keys(entries), locale).toEqual(keys);
  expect(keys).toEqual(expect.arrayContaining(["Export", "Import", "Other", "Soon"]));
  expect(t({ locale: "fr", key: "Open" })).toBe("Ouvrir");
  expect(t({ locale: "fr", key: "Other" })).toBe("Autres");
  expect(t({ locale: "fr", key: "Operations" })).not.toBe("Operations");
});
