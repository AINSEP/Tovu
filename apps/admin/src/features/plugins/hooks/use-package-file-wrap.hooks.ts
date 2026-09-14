import { useState } from "react";

/**
 * @file `PackageFilesModal`'s per-file line-wrap toggle, split out of the `.tsx` per this admin's
 * rule that component state lives in `hooks/`. The component calling this is keyed by the selected
 * file's path, so choosing another file remounts it and the toggle resets to wrapped instead of
 * carrying a manual override across files.
 */

export interface PackageFileWrapController {
  /** `true` by default for every file — see `PackageFilesModal.tsx`'s content-pane doc for why. */
  wrap: boolean;
  toggleWrap: () => void;
}

/**
 * @returns Whether the open file's lines wrap, and a toggle.
 * @complexity O(1).
 */
export function usePackageFileWrap(): PackageFileWrapController {
  const [wrap, setWrap] = useState(true);
  return { wrap, toggleWrap: () => setWrap((prev) => !prev) };
}
