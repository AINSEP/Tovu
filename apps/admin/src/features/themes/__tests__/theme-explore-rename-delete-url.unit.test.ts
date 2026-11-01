import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, describe, expect, it } from "vitest";

import { createFakeThemeExplorePort } from "../hooks/theme-explore-dependencies.hooks";
import { useThemeExplore } from "../hooks/use-theme-explore.hooks";

/**
 * todos.md:368 ("remaining rename/URL cases"): renaming or deleting the OPEN file moved the
 * selection but left the old `?page=`/`?file=` in the address bar, so a reload, a copied link or an
 * agent reading `location.href` pointed at a file that no longer exists. `select` already mirrors a
 * click into the URL; a rename or delete of the open file must do the same.
 */

const FILES = [
  { path: "pages/index.html", group: "page" as const, readable: true, editable: true, resettable: true },
  { path: "pages/about.html", group: "page" as const, readable: true, editable: true, resettable: true },
  { path: "css/a.css", group: "style" as const, readable: true, editable: true, resettable: true },
];
const CONTENTS = { "pages/index.html": "<h1>Home</h1>", "pages/about.html": "<h1>About</h1>", "css/a.css": "body{}" };

afterEach(() => window.history.replaceState(null, "", "/"));

function params() {
  return new URLSearchParams(window.location.search);
}

describe("useThemeExplore — the address bar follows a rename or delete of the open file", () => {
  it("renaming the open page moves ?page= to its new name", async () => {
    window.history.replaceState(null, "", "/admin/themes/explore?theme=basic&page=about");
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }, { pageId: "about" }));
    await waitFor(() => expect(result.current.selected).toBe("pages/about.html"));

    act(() => result.current.startRename("pages/about.html"));
    act(() => result.current.setRenameDraft("team.html"));
    act(() => result.current.commitRename());
    // A page rename changes its public URL, so it goes through the warning dialog first.
    await act(async () => {
      await result.current.confirmPageRename();
    });

    await waitFor(() => expect(result.current.selected).toBe("pages/team.html"));
    expect(params().get("page")).toBe("team");
    expect(params().get("theme")).toBe("basic");
  });

  it("renaming a file that is not open leaves the address bar alone", async () => {
    window.history.replaceState(null, "", "/admin/themes/explore?theme=basic&page=about");
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }, { pageId: "about" }));
    await waitFor(() => expect(result.current.selected).toBe("pages/about.html"));

    act(() => result.current.startRename("css/a.css"));
    act(() => result.current.setRenameDraft("b.css"));
    await act(async () => {
      result.current.commitRename();
    });

    await waitFor(() => expect(result.current.notice).toBe("Renamed to css/b.css"));
    expect(params().get("page")).toBe("about");
    expect(params().get("file")).toBeNull();
  });

  it("deleting the open page points the address bar at the file the editor falls back to", async () => {
    window.history.replaceState(null, "", "/admin/themes/explore?theme=basic&page=about");
    const port = createFakeThemeExplorePort({ files: FILES, contents: CONTENTS });
    const { result } = renderHook(() => useThemeExplore("basic", { port, t: (k) => k }, { pageId: "about" }));
    await waitFor(() => expect(result.current.selected).toBe("pages/about.html"));

    act(() => result.current.openDeleteConfirm("pages/about.html"));
    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(result.current.selected).toBe("pages/index.html");
    expect(params().get("page")).toBe("index");
  });
});
