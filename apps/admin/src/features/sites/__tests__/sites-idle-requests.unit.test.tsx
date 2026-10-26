import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { useInvalidate } from "@jini-ai/ui/fetch-query";
import { Sites } from "../Sites";
import { ImportExport } from "../../import-export";
import { useSites } from "../hooks/use-sites.hooks";
import { createFakeSitesPort } from "../hooks/sites-dependencies.hooks";
import { KEYS } from "../rules";

const t = (key: string) => key;

/** Render the real screen and query observers; count I/O, not renders or mocked hooks. */
describe("Sites request lifecycle", () => {
  it("keeps reads bounded over ten idle seconds and isolates site-list refreshes", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const reads = new Map<string, number>();
    const sites = vi.fn(async () => ({
      sites: [], switchingEnabled: true, localManagementEnabled: true,
      currentSite: { name: "owner", dir: "/sites/owner", listed: true, dirOverridden: false },
      persistedSiteName: null,
    }));
    const port = createFakeSitesPort(sites);
    vi.stubGlobal("fetch", async (url: string) => {
      const path = String(url).split("?")[0]!;
      reads.set(path, (reads.get(path) ?? 0) + 1);
      if (path.endsWith("/settings/effective")) return Response.json({ data: [] });
      if (path.endsWith("/site-shares")) return Response.json({ shares: [] });
      if (path.endsWith("/auth/me")) return Response.json({ effectivePermissions: [] });
      throw new Error(`Unexpected read: ${path}`);
    });
    function RefreshList() {
      const invalidate = useInvalidate();
      return <button onClick={() => invalidate({ key: KEYS.list })}>Refresh site list</button>;
    }
    const view = render(<FetchQueryProvider>
      {/* Export moved to Import & Export (owner, 2026-10-25), and its Publish button was removed
          the same day; both screens mount side by side here so a site-list refresh is still shown
          not to re-read them. */}
      <Sites useSitesHook={() => useSites(port, t)} tabId="all" />
      <ImportExport tabId="export" useTranslate={() => t} useTransferTranslate={() => t} useSitesAvailable={() => true} />
      <RefreshList />
    </FetchQueryProvider>);
    try {
      await screen.findByText("No exports yet.");
      const initialReads = new Map(reads);
      expect(sites).toHaveBeenCalledTimes(1);
      for (const count of reads.values()) expect(count).toBe(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(sites).toHaveBeenCalledTimes(1);
      expect(reads).toEqual(initialReads);
      // waitFor polls with setInterval; with it faked, a refresh that changes no DOM is never re-checked.
      vi.useRealTimers();
      fireEvent.click(screen.getByRole("button", { name: "Refresh site list" }));
      await waitFor(() => expect(sites).toHaveBeenCalledTimes(2));
      expect(reads).toEqual(initialReads);
    } finally {
      view.unmount();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
