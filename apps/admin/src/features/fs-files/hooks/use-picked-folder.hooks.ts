import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../../../lib/api";

/**
 * @file State for the composer's attached-folders button: the `custom` fs root, read on mount and
 * again whenever `useFolderDrop` confirms a new pick (`confirmedPath`); `remove` DELETEs it on the
 * server. A failed read or remove leaves the list as it was.
 *
 * Returned as a list (0 or 1 today): the server holds a single folder, but the button and its
 * popover are built over a list so supporting several folders later is only a server change.
 */
export interface UsePickedFolderDeps {
  /** Test seams — default to `api.getFsFilesCustomRoot` / `api.clearFsFilesCustomRoot`. */
  readonly get?: () => Promise<{ path: string | null }>;
  readonly clear?: () => Promise<unknown>;
}

/** @complexity O(1); one GET per mount and per confirmed pick, one DELETE per clear. */
export function usePickedFolder({ confirmedPath }: { confirmedPath: string | null }, deps: UsePickedFolderDeps = {}) {
  const get = deps.get ?? api.getFsFilesCustomRoot;
  const clearRoot = deps.clear ?? api.clearFsFilesCustomRoot;
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    get().then((root) => { if (live) setPath(root.path); }, () => {});
    return () => { live = false; };
  }, [get, confirmedPath]);
  // One folder on the server, so removing any listed path clears it.
  const remove = useCallback((_path: string) => { void clearRoot().then(() => setPath(null), () => {}); }, [clearRoot]);
  const folders = useMemo(() => (path ? [path] : []), [path]);
  return { folders, remove };
}
