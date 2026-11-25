import { Library as LibraryView } from "@jini-ai/admin/screens/library/Library";
import { useWiredLibrary } from "./hooks/use-wired-library.hooks";

/**
 * @file The Library screen (`/admin/library`) — markup only; state lives in
 * `hooks/use-library.hooks.ts`. Private documents for this site that the assistant can read
 * (`library_list` / `library_read`) and visitors never see. Two `?tab=` tabs: Upload and
 * Documents (owner, 2026-10-18). The Upload tab leads with an "Upload documents" button that opens
 * the drop zone's own file picker; Documents is only the list (owner, 2026-10-18).
 *
 * A thin Tovu page rather than a Jini `@jini-ai/admin/media` page: the Jini media page is parked
 * (`media-panel.ts`) and the legacy Media screen this sits beside is a Tovu feature too, so a Jini
 * version would need the parked module's ports wired first.
 *
 * Previews never run document content: Markdown renders with raw HTML off inside a scriptless,
 * network-blocked frame; text is React-escaped; PDF opens in the browser's PDF viewer from a blob
 * typed `application/pdf`; Office/iWork/RTF documents download.
 *
 * The markup and state now live in `@jini-ai/admin`'s `Library` screen; this file is the route's
 * binding of it to this host — the controller hook to its `useWiredLibrary` binding (live port,
 * admin locale, Library dictionary).
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
