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
import { publishSettingsRefresh } from "@jini-ai/admin/shell/lib/settings-refresh-bus";
import type { BrowserStreamPorts } from "@jini-ai/admin/shell/lib/browser-stream";
import { subscribeToSettingsChanges as subscribe } from "@jini-ai/admin/browser/settings-events";
import { adminStreamActivity, type StreamActivity } from "@jini-ai/admin/shell/lib/stream-activity";
import { adminBrowserStreamPorts } from "./shell-collaborators";

function eventsUrl({ workspaceId }: { workspaceId: string }, _options = {}): string {
  return `/api/admin/v1/workspaces/${encodeURIComponent(workspaceId)}/settings/events?themePreview=1`;
}


/**
 * Shares the change feed for this workspace/principal across tabs and returns a disposer.
 * Existing hook consumers share this workspace-scoped subscription.
 * Never throws and never rejects. A workspace whose server predates this endpoint, a proxy that
 * refuses `text/event-stream`, a revoked `settings.read` grant — every one surfaces as
 * `EventSource`'s opaque `error`, and none of them should break the admin. The tab simply keeps the
 * behavior it had before this feed existed: values refresh on run completion and on reload.
 *
 * @returns A disposer that closes the connection. Call it from the owner's effect cleanup —
 * `EventSource` retries forever otherwise, including after the component that opened it is gone.
 * @complexity O(1).
 */


export function subscribeToSettingsChanges({ workspaceId }: { workspaceId: string }, {
  open = (url: string) => new EventSource(url, { withCredentials: true }),
  principalId = "session", ports, activity = adminStreamActivity,
  publishSettings = publishSettingsRefresh, publishPreview = publishThemePreviewRefresh,
}: {
  open?: (url: string) => Pick<EventSource, "addEventListener" | "close" | "readyState">;
  principalId?: string; ports?: BrowserStreamPorts; activity?: StreamActivity;
  publishSettings?: typeof publishSettingsRefresh; publishPreview?: typeof publishThemePreviewRefresh;
} = {}): () => void {
  return subscribe({
    workspaceId, principalId, open, ports: ports ?? adminBrowserStreamPorts(), activity,
    publishSettings, warn: (...args) => console.warn(...args),
    urlFor: ({ workspaceId, cursor, supplementalRevision }) => {
      const afterRevision = cursor ? "&afterRevision=" + encodeURIComponent(cursor) : "";
      const themeRevisionParam = supplementalRevision ? "&themeRevision=" + encodeURIComponent(supplementalRevision) : "";
      const resume = afterRevision + themeRevisionParam;
      return eventsUrl({ workspaceId }) + resume;
    },
  }, { supplemental: {
    event: "theme-preview-refresh",
    consume: ({ data }) => {
      try {
        const preview = JSON.parse(data) as ThemePreviewRefresh;
        publishPreview(preview);
        return preview.revision;
      } catch { /* A malformed theme frame must not break the independent settings feed. */ }
    },
  } });
}
