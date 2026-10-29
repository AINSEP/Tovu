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
 * streaming. Explicit ownership handoff preserves the last received id via `afterRevision`;
 * ordinary network retries still belong to the same native EventSource.
 */
import { publishThemePreviewRefresh, type ThemePreviewRefresh } from "@/features/themes/theme-preview-refresh";
import { publishSettingsRefresh } from "./settings-refresh-bus";
import { startBrowserStream, type BrowserStreamPorts } from "./browser-stream";
import { adminStreamActivity, type StreamActivity } from "./stream-activity";

/** Frame payload. Namespace names only — the server never sends values (see `change-feed.ts`). */
interface SettingsChangedFrame {
  namespaces?: readonly string[];
}

function eventsUrl(workspaceId: string): string {
  return `/api/admin/v1/workspaces/${encodeURIComponent(workspaceId)}/settings/events?themePreview=1`;
}

/**
 * Shares the change feed for this workspace/principal across tabs and returns a disposer.
 * The positional workspace argument is retained for existing hook consumers.
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
export function subscribeToSettingsChanges(workspaceId: string, {
  open = (url: string) => new EventSource(url, { withCredentials: true }),
  principalId = "session", ports, activity = adminStreamActivity,
  publishSettings = publishSettingsRefresh, publishPreview = publishThemePreviewRefresh,
}: {
  open?: (url: string) => Pick<EventSource, "addEventListener" | "close" | "readyState">;
  principalId?: string; ports?: BrowserStreamPorts; activity?: StreamActivity;
  publishSettings?: typeof publishSettingsRefresh; publishPreview?: typeof publishThemePreviewRefresh;
} = {}): () => void {
  let cursor = "";
  let themeRevision = "";
  let opened = false;
  type Frame = { kind: "settings-changed" | "theme-preview-refresh" | "open"; data: string; id: string };
  return startBrowserStream<Frame>({
    // Workspace and principal are both disclosure boundaries; never share across identities.
    key: `settings/${encodeURIComponent(workspaceId)}/${encodeURIComponent(principalId)}`,
    connect: ({ emit }) => {
      let source: Pick<EventSource, "addEventListener" | "close" | "readyState">;
      const afterRevision = cursor ? "&afterRevision=" + encodeURIComponent(cursor) : "";
      const themeRevisionParam = themeRevision ? "&themeRevision=" + encodeURIComponent(themeRevision) : "";
      const resume = afterRevision + themeRevisionParam;
      try { source = open(eventsUrl(workspaceId) + resume); }
      catch (error) {
        console.warn("[admin] settings change feed unavailable", error);
        return () => {};
      }
      for (const kind of ["theme-preview-refresh", "settings-changed", "open"] as const) {
        source.addEventListener(kind, (event) => {
          const message = event as MessageEvent<string>;
          emit({ kind, data: message.data ?? "", id: message.lastEventId ?? "" });
        });
      }
      // Deliberately not closed here: EventSource reconnects with backoff on its own, and a
      // transient blip must not permanently silence the feed for the tab's remaining lifetime.
      // Logged at debug volume because a reconnect is ordinary, not an incident.
      source.addEventListener("error", () => {
        if (source.readyState === 2) console.warn("[admin] settings change feed closed by the server; no further updates on this connection");
      });
      return () => source.close();
    },
    receive: ({ frame }) => {
      if (frame.id) cursor = frame.id;
      if (frame.kind === "open") {
        // A new leader/follower connection may have no cursor yet. Re-read after boot so a
        // handoff cannot leave stale values even when no settings frame preceded it.
        // Theme's durable marker replays independently.
        // The FIRST attach belongs to boot's fresh reads, not a change. Later opens still cover
        // reconnects/leadership handoffs, including those for which no cursor was received.
        // A prior frame can supply the resume cursor even if that source never emitted open.
        if (opened || cursor) publishSettings();
        opened = true;
        return;
      }
      if (frame.kind === "theme-preview-refresh") {
        try {
          const preview = JSON.parse(frame.data) as ThemePreviewRefresh;
          publishPreview(preview);
          themeRevision = preview.revision;
        } catch { /* A malformed theme frame must not break the independent settings feed. */ }
        return;
      }
      try {
        const changed = JSON.parse(frame.data) as SettingsChangedFrame;
        // A frame with no usable namespace list still means "something changed" — refresh everything
        // rather than dropping a notification because its payload shape was unexpected.
        publishSettings(Array.isArray(changed.namespaces) ? changed.namespaces : undefined);
      } catch { publishSettings(); }
    },
  }, { ports, activity });
}
