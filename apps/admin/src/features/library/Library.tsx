import { Library as LibraryView } from "@jini-ai/admin/screens/library/Library";
import { useWiredLibrary } from "./hooks/use-wired-library.hooks";

/**
 * @file The admin's Library route: `@jini-ai/admin`'s `Library` screen bound to this host — the
 * controller hook to its `useWiredLibrary` binding (live port, admin locale, Library dictionary).
 */

export interface LibraryProps {
  /** The `?tab=` query value; guarded by the screen. */
  tabId?: string | null;
  /** Test seam; production passes nothing. */
  useLibraryHook?: typeof useWiredLibrary;
}

export function Library({ tabId, useLibraryHook = useWiredLibrary }: LibraryProps = {}) {
  return <LibraryView tabId={tabId} useLibraryHook={useLibraryHook} />;
}
