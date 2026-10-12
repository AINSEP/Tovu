import { useState } from "react";
import { THEME_FILE_GROUPS, isThemeFileModified, type ThemeExploreFile, type ThemeFileGroup } from "./use-theme-explore.hooks";

/**
 * @file The Explore screen's file picker state: which group tab is showing, and whether a long group
 * is collapsed.
 *
 * Owner, 2026-10-11: "the file list that's on the left, make that up top, and then the Preview/HTML
 * and the content under it ... it's way too small right now when the assistant chat is open." The
 * 190px sidebar became a full-width tray above the preview: one row of group tabs (Pages, Partials,
 * Styles, ...) and the active group's files as wrapping chips. Showing one group at a time keeps the
 * tray to about two rows, so the preview starts high instead of below six stacked lists.
 *
 * The active group follows the selected file unless the operator picked a tab while that same file
 * was selected. Storing the path the choice was made against (rather than resetting the choice in an
 * effect) means a selection that arrives any other way, such as a `?file=` link, Back/Forward or a
 * rename, shows that file's own group with no extra render.
 */

/** A long group (assets, mostly) shows this many chips until "Show all" is pressed. */
export const THEME_EXPLORE_COLLAPSED_FILE_LIMIT = 10;

/** One group tab. `id` repeats `key` for `useTabBarKeyboard`/`resolveTabBarTabIndex`; `label` is the
 *  untranslated group name the caller passes through `t()`. */
export interface ThemeExploreFileGroupTab {
  id: ThemeFileGroup;
  key: ThemeFileGroup;
  label: string;
  count: number;
  /** Some file in the group differs from its catalog original, so the dot stays visible on a tab
   *  whose files are not on screen. */
  modified: boolean;
}

/**
 * The non-empty groups, in `THEME_FILE_GROUPS` order, with their file counts.
 *
 * @complexity O(g + n) time: one pass over `n` files, then one over the fixed `g` groups; O(g) space.
 */
export function themeExploreFileGroupTabs(files: readonly ThemeExploreFile[]): ThemeExploreFileGroupTab[] {
  const counts = new Map<ThemeFileGroup, { count: number; modified: boolean }>();
  for (const file of files) {
    const entry = counts.get(file.kind) ?? { count: 0, modified: false };
    counts.set(file.kind, { count: entry.count + 1, modified: entry.modified || isThemeFileModified(file) });
  }
  return THEME_FILE_GROUPS.flatMap(({ key, label }) => {
    const entry = counts.get(key);
    return entry ? [{ id: key, key, label, count: entry.count, modified: entry.modified }] : [];
  });
}

/** A group tab the operator picked, and the file that was highlighted when they picked it. */
export interface ThemeExploreGroupChoice {
  group: ThemeFileGroup;
  forPath: string | null;
}

/**
 * Which group tab is showing: the operator's pick while the highlighted file is still the one it was
 * made against, else the highlighted file's own group, else the first non-empty group. `null` only
 * when the theme has no files at all.
 *
 * @complexity O(n) time for the highlighted-file lookup; O(1) space.
 */
export function themeExploreActiveGroup({
  tabs,
  files,
  highlightedPath,
  choice,
}: {
  tabs: readonly ThemeExploreFileGroupTab[];
  files: readonly ThemeExploreFile[];
  highlightedPath: string | null;
  choice: ThemeExploreGroupChoice | null;
}): ThemeFileGroup | null {
  const hasGroup = (group: ThemeFileGroup | undefined) => group !== undefined && tabs.some((tab) => tab.key === group);
  if (choice && choice.forPath === highlightedPath && hasGroup(choice.group)) return choice.group;
  const selectedKind = files.find((file) => file.path === highlightedPath)?.kind;
  if (hasGroup(selectedKind)) return selectedKind!;
  return tabs[0]?.key ?? null;
}

/**
 * The chips to render for one group. Collapsed, a group longer than `limit` shows its first `limit`
 * files plus the highlighted file when it falls past them, so the open file never disappears from
 * the tray.
 *
 * @returns `visible` in group order (the highlighted extra last) and `collapsible`, whether the group
 *   is long enough to need the Show all / Show fewer control at all.
 * @complexity O(n) time and space over the group's files.
 */
export function themeExploreVisibleGroupFiles(
  { files, highlightedPath, expanded }: { files: readonly ThemeExploreFile[]; highlightedPath: string | null; expanded: boolean },
  { limit = THEME_EXPLORE_COLLAPSED_FILE_LIMIT }: { limit?: number } = {}
): { visible: ThemeExploreFile[]; collapsible: boolean } {
  const collapsible = files.length > limit;
  if (expanded || !collapsible) return { visible: [...files], collapsible };
  const visible = files.slice(0, limit);
  const highlightedIndex = files.findIndex((file) => file.path === highlightedPath);
  if (highlightedIndex >= limit) visible.push(files[highlightedIndex]!);
  return { visible, collapsible };
}

export interface ThemeExploreFileGroupsController {
  tabs: ThemeExploreFileGroupTab[];
  activeGroup: ThemeFileGroup | null;
  chooseGroup: (group: ThemeFileGroup) => void;
  /** The active group's chips, already collapsed or not. */
  visibleFiles: ThemeExploreFile[];
  /** The active group's full size, for the "Show all ({count})" label. */
  groupCount: number;
  collapsible: boolean;
  expanded: boolean;
  toggleExpanded: () => void;
}

/**
 * The file picker's tab and collapse state. Pure view state with no I/O, so no port: it lives
 * outside `useThemeExploreHook`'s injected controller for the same reason `device`/`fullscreen` do
 * (see `ThemeExplore.tsx`'s "STAYS LOCAL" comment), and a static controller fake still gets a
 * working tray.
 *
 * Expansion is remembered per group (`expandedGroup`), so opening Assets and switching to Pages and
 * back keeps Assets open, while every other long group still starts collapsed.
 *
 * @complexity O(n) per render over the theme's files (tab counts, active-group filter).
 */
export function useThemeExploreFileGroups({
  files,
  highlightedPath,
}: {
  files: readonly ThemeExploreFile[];
  highlightedPath: string | null;
}): ThemeExploreFileGroupsController {
  const [choice, setChoice] = useState<ThemeExploreGroupChoice | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<ThemeFileGroup | null>(null);

  const tabs = themeExploreFileGroupTabs(files);
  const activeGroup = themeExploreActiveGroup({ tabs, files, highlightedPath, choice });
  const groupFiles = files.filter((file) => file.kind === activeGroup);
  const expanded = activeGroup !== null && expandedGroup === activeGroup;
  const { visible, collapsible } = themeExploreVisibleGroupFiles({ files: groupFiles, highlightedPath, expanded });

  return {
    tabs,
    activeGroup,
    chooseGroup: (group) => setChoice({ group, forPath: highlightedPath }),
    visibleFiles: visible,
    groupCount: groupFiles.length,
    collapsible,
    expanded,
    toggleExpanded: () => setExpandedGroup(expanded ? null : activeGroup),
  };
}
