import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  THEME_EXPLORE_COLLAPSED_FILE_LIMIT,
  themeExploreActiveGroup,
  themeExploreFileGroupTabs,
  themeExploreVisibleGroupFiles,
  useThemeExploreFileGroups,
} from "../hooks/use-theme-explore-file-groups.hooks";
import type { ThemeExploreFile, ThemeFileGroup } from "../hooks/use-theme-explore.hooks";

/**
 * @file The Explore file picker's group tabs and "Show all" collapse (owner, 2026-10-11: the sidebar
 * moved above the preview as group tabs plus file chips). Plain data in, no ports: the hook has no
 * I/O.
 */

function file(path: string, kind: ThemeFileGroup, modified: boolean | null = false): ThemeExploreFile {
  const label = path.slice(path.lastIndexOf("/") + 1);
  return { path, label, kind, readable: true, editable: true, resettable: true, modified, published: null, collidingContent: null };
}

const FILES: ThemeExploreFile[] = [
  file("pages/index.html", "page"),
  file("pages/about.html", "page", true),
  file("nav.html", "partial"),
  file("css/styles.css", "style"),
  file("assets/logo.svg", "asset"),
];

function assets(count: number): ThemeExploreFile[] {
  return Array.from({ length: count }, (_, i) => file(`assets/a${i}.png`, "asset"));
}

describe("themeExploreFileGroupTabs", () => {
  it("lists only non-empty groups, in the fixed group order, with counts", () => {
    const shuffled = [FILES[4]!, FILES[3]!, FILES[0]!, FILES[2]!, FILES[1]!];
    expect(themeExploreFileGroupTabs(shuffled).map(({ key, count }) => [key, count])).toEqual([
      ["page", 2],
      ["partial", 1],
      ["style", 1],
      ["asset", 1],
    ]);
  });

  it("flags a group when any one of its files is modified, and only that group", () => {
    const tabs = themeExploreFileGroupTabs(FILES);
    expect(tabs.filter((tab) => tab.modified).map((tab) => tab.key)).toEqual(["page"]);
  });

  it("carries the untranslated label and an id equal to the key for the tab keyboard helpers", () => {
    const [pages] = themeExploreFileGroupTabs(FILES);
    expect(pages).toMatchObject({ id: "page", key: "page", label: "Pages" });
  });

  it("returns no tabs for a theme with no files", () => {
    expect(themeExploreFileGroupTabs([])).toEqual([]);
  });
});

describe("themeExploreActiveGroup", () => {
  const tabs = themeExploreFileGroupTabs(FILES);

  it("follows the highlighted file's own group when nothing was chosen", () => {
    expect(themeExploreActiveGroup({ tabs, files: FILES, highlightedPath: "css/styles.css", choice: null })).toBe("style");
  });

  it("keeps the operator's pick while the same file is still highlighted", () => {
    const choice = { group: "asset" as const, forPath: "pages/index.html" };
    expect(themeExploreActiveGroup({ tabs, files: FILES, highlightedPath: "pages/index.html", choice })).toBe("asset");
  });

  it("drops a pick made against a different file, so a ?file= link or Back shows that file's group", () => {
    const choice = { group: "asset" as const, forPath: "pages/index.html" };
    expect(themeExploreActiveGroup({ tabs, files: FILES, highlightedPath: "nav.html", choice })).toBe("partial");
  });

  it("ignores a pick for a group that has no files (for example after its last file was deleted)", () => {
    const choice = { group: "script" as const, forPath: "pages/index.html" };
    expect(themeExploreActiveGroup({ tabs, files: FILES, highlightedPath: "pages/index.html", choice })).toBe("page");
  });

  it("falls back to the first group when nothing, or an unknown path, is highlighted", () => {
    expect(themeExploreActiveGroup({ tabs, files: FILES, highlightedPath: null, choice: null })).toBe("page");
    expect(themeExploreActiveGroup({ tabs, files: FILES, highlightedPath: "gone.html", choice: null })).toBe("page");
  });

  it("is null for a theme with no files", () => {
    expect(themeExploreActiveGroup({ tabs: [], files: [], highlightedPath: null, choice: null })).toBeNull();
  });
});

describe("themeExploreVisibleGroupFiles", () => {
  it("shows a group at or under the limit whole, with no collapse control", () => {
    const group = assets(3);
    expect(themeExploreVisibleGroupFiles({ files: group, highlightedPath: null, expanded: false }, { limit: 3 })).toEqual({
      visible: group,
      collapsible: false,
    });
  });

  it("collapses a longer group to its first `limit` files", () => {
    const group = assets(5);
    const result = themeExploreVisibleGroupFiles({ files: group, highlightedPath: null, expanded: false }, { limit: 3 });
    expect(result.visible.map((f) => f.path)).toEqual(["assets/a0.png", "assets/a1.png", "assets/a2.png"]);
    expect(result.collapsible).toBe(true);
  });

  it("keeps a highlighted file past the limit visible, appended once after the first `limit`", () => {
    const group = assets(6);
    const result = themeExploreVisibleGroupFiles({ files: group, highlightedPath: "assets/a4.png", expanded: false }, { limit: 3 });
    expect(result.visible.map((f) => f.path)).toEqual(["assets/a0.png", "assets/a1.png", "assets/a2.png", "assets/a4.png"]);
  });

  it("does not duplicate a highlighted file that is already inside the limit", () => {
    const group = assets(6);
    const result = themeExploreVisibleGroupFiles({ files: group, highlightedPath: "assets/a1.png", expanded: false }, { limit: 3 });
    expect(result.visible).toHaveLength(3);
  });

  it("shows everything when expanded, still reporting the group as collapsible", () => {
    const group = assets(6);
    expect(themeExploreVisibleGroupFiles({ files: group, highlightedPath: null, expanded: true }, { limit: 3 })).toEqual({
      visible: group,
      collapsible: true,
    });
  });

  it("defaults the limit to THEME_EXPLORE_COLLAPSED_FILE_LIMIT", () => {
    const group = assets(THEME_EXPLORE_COLLAPSED_FILE_LIMIT + 1);
    const result = themeExploreVisibleGroupFiles({ files: group, highlightedPath: null, expanded: false });
    expect(result.visible).toHaveLength(THEME_EXPLORE_COLLAPSED_FILE_LIMIT);
  });
});

describe("useThemeExploreFileGroups", () => {
  it("opens on the highlighted file's group and lists that group's files", () => {
    const { result } = renderHook(() => useThemeExploreFileGroups({ files: FILES, highlightedPath: "pages/about.html" }));
    expect(result.current.activeGroup).toBe("page");
    expect(result.current.visibleFiles.map((f) => f.path)).toEqual(["pages/index.html", "pages/about.html"]);
    expect(result.current.groupCount).toBe(2);
    expect(result.current.tabs.map((tab) => tab.key)).toEqual(["page", "partial", "style", "asset"]);
  });

  it("switches group on chooseGroup without changing the selection", () => {
    const { result } = renderHook(() => useThemeExploreFileGroups({ files: FILES, highlightedPath: "pages/index.html" }));
    act(() => result.current.chooseGroup("style"));
    expect(result.current.activeGroup).toBe("style");
    expect(result.current.visibleFiles.map((f) => f.path)).toEqual(["css/styles.css"]);
  });

  it("follows a selection that moves to another group after a pick", () => {
    const { result, rerender } = renderHook(({ path }) => useThemeExploreFileGroups({ files: FILES, highlightedPath: path }), {
      initialProps: { path: "pages/index.html" },
    });
    act(() => result.current.chooseGroup("asset"));
    rerender({ path: "nav.html" });
    expect(result.current.activeGroup).toBe("partial");
  });

  it("stays on a picked group when a chip in it is then selected", () => {
    const { result, rerender } = renderHook(({ path }) => useThemeExploreFileGroups({ files: FILES, highlightedPath: path }), {
      initialProps: { path: "pages/index.html" },
    });
    act(() => result.current.chooseGroup("asset"));
    rerender({ path: "assets/logo.svg" });
    expect(result.current.activeGroup).toBe("asset");
  });

  it("expands and collapses a long group, and keeps that group open across a tab round trip", () => {
    const files = [...FILES, ...assets(THEME_EXPLORE_COLLAPSED_FILE_LIMIT + 2)];
    const { result } = renderHook(() => useThemeExploreFileGroups({ files, highlightedPath: "pages/index.html" }));
    act(() => result.current.chooseGroup("asset"));
    expect(result.current.collapsible).toBe(true);
    expect(result.current.expanded).toBe(false);
    expect(result.current.visibleFiles).toHaveLength(THEME_EXPLORE_COLLAPSED_FILE_LIMIT);
    expect(result.current.groupCount).toBe(THEME_EXPLORE_COLLAPSED_FILE_LIMIT + 3);

    act(() => result.current.toggleExpanded());
    expect(result.current.expanded).toBe(true);
    expect(result.current.visibleFiles).toHaveLength(THEME_EXPLORE_COLLAPSED_FILE_LIMIT + 3);

    act(() => result.current.chooseGroup("page"));
    expect(result.current.expanded).toBe(false);
    act(() => result.current.chooseGroup("asset"));
    expect(result.current.expanded).toBe(true);

    act(() => result.current.toggleExpanded());
    expect(result.current.expanded).toBe(false);
    expect(result.current.visibleFiles).toHaveLength(THEME_EXPLORE_COLLAPSED_FILE_LIMIT);
  });

  it("reports nothing to show for a theme with no files", () => {
    const { result } = renderHook(() => useThemeExploreFileGroups({ files: [], highlightedPath: null }));
    expect(result.current.activeGroup).toBeNull();
    expect(result.current.visibleFiles).toEqual([]);
    expect(result.current.expanded).toBe(false);
  });
});
