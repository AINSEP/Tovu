/**
 * @file Subscribes to the server's settings change feed and republishes onto
 * `settings-refresh-bus.ts`, so a change made anywhere — another tab, another operator, a
 * background job, an agent run in a different window — reaches this tab's mounted settings tabs
 * without a page reload.
 *
 * ## How this differs from the run-completion trigger
 *
 * `components/AssistantDock/AssistantDock.tsx` already refreshes when an assistant run finishes in THIS tab.
 * That covers the common case immediately and needs no server support, but it is blind by
 * construction: it only knows about runs it hosted. This feed covers everything else, and the two
 * are deliberately independent — the dock keeps working if the feed is unavailable, and the feed
 * keeps working with the dock closed. Both land on the same bus, and a duplicate refresh is a
 * no-op read, so overlap costs nothing worth preventing.
 *
 * ## Reconnection is the browser's job, not ours
 *
 * `EventSource` reconnects on its own and replays `Last-Event-ID`, which the server honors as a
 * ledger cursor — so a dropped connection resumes at the revision it left off rather than silently
 * skipping the writes that happened in the gap. Hand-rolling that would mean reimplementing
 * backoff and resume for no gain, which is the reason this uses `EventSource` rather than `fetch`
 * streaming.
 */
import { publishSettingsRefresh } from "./settings-refresh-bus";

/** Frame payload. Namespace names only — the server never sends values (see `change-feed.ts`). */
interface SettingsChangedFrame {
  namespaces?: readonly string[];
}

function eventsUrl(workspaceId: string): string {
  return `/api/admin/v1/workspaces/${encodeURIComponent(workspaceId)}/settings/events`;
}

/**
 * Opens the change feed for `workspaceId` and returns a disposer.
 *
 * Never throws and never rejects. A workspace whose server predates this endpoint, a proxy that
 * refuses `text/event-stream`, a revoked `settings.read` grant — every one surfaces as
 * `EventSource`'s opaque `error`, and none of them should break the admin. The tab simply keeps the
 * behavior it had before this feed existed: values refresh on run completion and on reload.
 *
 * @returns A disposer that closes the connection. Call it from the owner's effect cleanup —
 * `EventSource` retries forever otherwise, including after the component that opened it is gone.
 * @complexity O(1).
 */
export function subscribeToSettingsChanges(workspaceId: string): () => void {
  let source: EventSource;
  try {
    source = new EventSource(eventsUrl(workspaceId), { withCredentials: true });
  } catch (error) {
    console.warn("[admin] settings change feed unavailable", error);
    return () => {};
  }

  source.addEventListener("settings-changed", (event) => {
    try {
      const frame = JSON.parse((event as MessageEvent<string>).data) as SettingsChangedFrame;
      // A frame with no usable namespace list still means "something changed" — refresh everything
      // rather than dropping a notification because its payload shape was unexpected.
      publishSettingsRefresh(Array.isArray(frame.namespaces) ? frame.namespaces : undefined);
    } catch {
      publishSettingsRefresh();
    }
  });

  // Deliberately not closed here: `EventSource` reconnects with backoff on its own, and a transient
  // blip must not permanently silence the feed for the tab's remaining lifetime. Logged at debug
  // volume because a reconnect is ordinary, not an incident.
  source.addEventListener("error", () => {
    if (source.readyState === EventSource.CLOSED) {
      console.warn("[admin] settings change feed closed by the server; no further updates on this connection");
    }
  });

  return () => source.close();
}
