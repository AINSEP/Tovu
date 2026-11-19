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
  readonly isExpanded: (required: { folderPath: string }, optional?: Record<string, never>) => boolean;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  /** A folder row toggles; a file row opens. */
  readonly onRowClick: (row: PackageFileTreeRow) => void;
  /** Keeps the roving tabindex on whichever row focus landed on (a click, or a Tab back in). */
  readonly onRowFocus: (path: string) => void;
}

/** What one key action can do to the tree; {@link applyPackageFileTreeKeyAction}'s effects port. */
export interface PackageFileTreeKeyEffects {
  readonly setExpanded: (required: { path: string; expanded: boolean }, optional?: Record<string, never>) => void;
  readonly openFile: (relativePath: string) => void;
  readonly focus: (required: { path: string }, optional?: Record<string, never>) => void;
}

/**
 * Carries out one key action's effects (expand/collapse, open, then focus). Every field of the action
 * is optional by contract — the current key map always moves focus, but an action that only opens or
 * only toggles still does exactly that and nothing more.
 *
 * @returns Whether the key was the tree's (so the caller suppresses the browser's default).
 * @complexity O(1).
 */
export function applyPackageFileTreeKeyAction({ action, effects }: { action: ReturnType<typeof packageFileTreeKeyAction>; effects: PackageFileTreeKeyEffects }, _optional: Record<string, never> = {}): boolean {
  if (!action.focus && !action.setExpanded && !action.open) return false;
  if (action.setExpanded) effects.setExpanded({ path: action.setExpanded.path, expanded: action.setExpanded.expanded });
  if (action.open) effects.openFile(action.open);
  if (action.focus) effects.focus({ path: action.focus });
  return true;
}

/**
 * @returns The rows to render and the handlers for the tree.
 * @complexity O(files) per render to rebuild visible rows; the tree itself is memoized on the paths.
 */
export function usePackageFileTree({ paths, selectedPath, onOpenFile }: PackageFileTreeDependencies): PackageFileTreeController {
  const pathsKey = paths.join("\n");
  const tree = useMemo(() => buildPackageFileTree({ paths }), [pathsKey]);
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const moveDomFocus = useRef(false);

  const selectedAncestors = new Set(selectedPath ? ancestorFolderPaths({ filePath: selectedPath }) : []);
  const isExpanded = ({ folderPath }: { folderPath: string }, _optional = {}) => toggled.get(folderPath) ?? selectedAncestors.has(folderPath);
  const rows = visiblePackageFileRows({ nodes: tree, isExpanded: ({ path }) => isExpanded({ folderPath: path }) });
  const visible = ({ path }: { path: string | null }, _optional = {}) => path !== null && rows.some((row) => row.node.path === path);
  const fallbackPath = visible({ path: selectedPath }) ? selectedPath : (rows[0]?.node.path ?? null);
  const activePath = visible({ path: focusedPath }) ? focusedPath : fallbackPath;

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

  const setExpanded = ({ path, expanded }: { path: string; expanded: boolean }, _optional = {}) =>
    setToggled((previous) => new Map(previous).set(path, expanded));

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (activePath === null) return;
    const action = packageFileTreeKeyAction({ rows, currentPath: activePath, key: event.key, isExpanded: ({ path }) => isExpanded({ folderPath: path }) });
    const handled = applyPackageFileTreeKeyAction({ action, effects: {
      setExpanded,
      openFile: onOpenFile,
      focus: ({ path }, _optional = {}) => {
        setFocusedPath(path);
        moveDomFocus.current = true;
      },
    } });
    if (handled) event.preventDefault();
  };

  const onRowClick = (row: PackageFileTreeRow) => {
    setFocusedPath(row.node.path);
    if (row.node.kind === "folder") setExpanded({ path: row.node.path, expanded: !isExpanded({ folderPath: row.node.path }) });
    else onOpenFile(row.node.path);
  };

  return { treeRef, rows, activePath, isExpanded, onKeyDown, onRowClick, onRowFocus: setFocusedPath };
}
