import { useCallback, useEffect, useState } from "react";

import { api } from "../../../lib/api";

/**
 * @file State for the composer's picked-folder chip: the `custom` fs root, read on mount and again
 * whenever `useFolderDrop` confirms a new pick (`confirmedPath`); `clear` DELETEs it on the server.
 * A failed read or clear leaves the chip as it was.
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
  const clear = useCallback(() => { void clearRoot().then(() => setPath(null), () => {}); }, [clearRoot]);
  return { path, clear };
}
