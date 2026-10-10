import { useState } from "react";

/**
 * @file The line-wrap toggle for read-only code viewers (plugin package files, theme templates).
 * Was `usePackageFileWrap` in features/plugins until 2026-10-10, when the template viewer got the
 * same toggle. A caller keyed by the file it shows remounts on a file switch, so the toggle resets to
 * wrapped instead of carrying a manual override across files.
 */

export interface CodeWrapController {
  /** `true` by default — see `PackageFilesModal.tsx`'s content-pane doc for why. */
  wrap: boolean;
  toggleWrap: () => void;
}

/**
 * @returns Whether the shown code wraps, and a toggle.
 * @complexity O(1).
 */
export function useCodeWrap(): CodeWrapController {
  const [wrap, setWrap] = useState(true);
  return { wrap, toggleWrap: () => setWrap((prev) => !prev) };
}
