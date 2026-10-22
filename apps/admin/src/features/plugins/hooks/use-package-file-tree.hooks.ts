import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import {
  ancestorFolderPaths,
  buildPackageFileTree,
  packageFileTreeKeyAction,
  visiblePackageFileRows,
  type PackageFileTreeRow,
} from "../package-file-tree";

/**
 * @file `PackageFilesModal`'s file-tree state (2026-09-29): which folders are open, which row holds
 * keyboard focus, and what a click or key press does. The tree shape, visible rows and key mapping
 * are the pure helpers in `package-file-tree.ts`; this hook only stores state and moves DOM focus.
 *
 * Expansion is derived, not synced: a folder is open when the viewer toggled it open, or — until
 * they toggle it — when it contains the selected file. So the folders around the first selected file
 * open on their own once the listing loads, with no effect copying selection into state.
 */

export interface PackageFileTreeDependencies {
  /** Every listed file's `relativePath`. */
  readonly paths: readonly string[];
  readonly selectedPath: string | null;
  readonly onOpenFile: (relativePath: string) => void;
}

export interface PackageFileTreeController {
  /** Attach to the `role="tree"` element; keyboard moves focus to rows inside it. */
  readonly treeRef: RefObject<HTMLDivElement | null>;
  readonly rows: readonly PackageFileTreeRow[];
  /** The one row with `tabIndex=0` (roving tabindex); `null` only while there are no rows. */
  readonly activePath: string | null;
  readonly isExpanded: (folderPath: string) => boolean;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  /** A folder row toggles; a file row opens. */
  readonly onRowClick: (row: PackageFileTreeRow) => void;
  /** Keeps the roving tabindex on whichever row focus landed on (a click, or a Tab back in). */
  readonly onRowFocus: (path: string) => void;
}

/** What one key action can do to the tree; {@link applyPackageFileTreeKeyAction}'s effects port. */
export interface PackageFileTreeKeyEffects {
  readonly setExpanded: (path: string, expanded: boolean) => void;
  readonly openFile: (relativePath: string) => void;
  readonly focus: (path: string) => void;
}

/**
 * Carries out one key action's effects (expand/collapse, open, then focus). Every field of the action
 * is optional by contract — the current key map always moves focus, but an action that only opens or
 * only toggles still does exactly that and nothing more.
 *
 * @returns Whether the key was the tree's (so the caller suppresses the browser's default).
 * @complexity O(1).
 */
export function applyPackageFileTreeKeyAction(action: ReturnType<typeof packageFileTreeKeyAction>, effects: PackageFileTreeKeyEffects): boolean {
  if (!action.focus && !action.setExpanded && !action.open) return false;
  if (action.setExpanded) effects.setExpanded(action.setExpanded.path, action.setExpanded.expanded);
  if (action.open) effects.openFile(action.open);
  if (action.focus) effects.focus(action.focus);
  return true;
}

/**
 * @returns The rows to render and the handlers for the tree.
 * @complexity O(files) per render to rebuild visible rows; the tree itself is memoized on the paths.
 */
export function usePackageFileTree({ paths, selectedPath, onOpenFile }: PackageFileTreeDependencies): PackageFileTreeController {
  const pathsKey = paths.join("\n");
  const tree = useMemo(() => buildPackageFileTree(paths), [pathsKey]);
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const moveDomFocus = useRef(false);

  const selectedAncestors = new Set(selectedPath ? ancestorFolderPaths(selectedPath) : []);
  const isExpanded = (folderPath: string) => toggled.get(folderPath) ?? selectedAncestors.has(folderPath);
  const rows = visiblePackageFileRows(tree, isExpanded);
  const visible = (path: string | null) => path !== null && rows.some((row) => row.node.path === path);
  const activePath = visible(focusedPath) ? focusedPath : visible(selectedPath) ? selectedPath : (rows[0]?.node.path ?? null);

  // Only after a key press: DOM focus follows the roving tabindex. Never on mount or on a
  // selection that came from outside, so opening the dialog doesn't pull focus into the tree.
  useEffect(() => {
    if (!moveDomFocus.current) return;
    moveDomFocus.current = false;
    const target = Array.from(treeRef.current?.querySelectorAll<HTMLElement>("[data-tree-path]") ?? []).find(
      (element) => element.dataset.treePath === activePath,
    );
    target?.focus();
  });

  const setExpanded = (path: string, expanded: boolean) =>
    setToggled((previous) => new Map(previous).set(path, expanded));

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (activePath === null) return;
    const action = packageFileTreeKeyAction(rows, activePath, event.key, isExpanded);
    const handled = applyPackageFileTreeKeyAction(action, {
      setExpanded,
      openFile: onOpenFile,
      focus: (path) => {
        setFocusedPath(path);
        moveDomFocus.current = true;
      },
    });
    if (handled) event.preventDefault();
  };

  const onRowClick = (row: PackageFileTreeRow) => {
    setFocusedPath(row.node.path);
    if (row.node.kind === "folder") setExpanded(row.node.path, !isExpanded(row.node.path));
    else onOpenFile(row.node.path);
  };

  return { treeRef, rows, activePath, isExpanded, onKeyDown, onRowClick, onRowFocus: setFocusedPath };
}
