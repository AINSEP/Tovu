import { useT, type ExtEventRenderProps } from "@jini-ai/chat/react";

/**
 * @file Renders Jini's slow-run notice inline in the transcript — the wall-clock "still working"
 * signal `@jini-ai/daemon`'s `run-lifecycle.ts` emits (a `type: 'slow_running'` agent event) once a
 * run has gone `DEFAULT_SLOW_RUN_THRESHOLD_MS` (45s, kernel-wide default — no Tovu-side opt-in
 * needed) with no activity. That daemon-side watchdog is deliberately NON-terminating: the run is
 * left `running`, so this card is purely informational — the composer's existing Stop button (part
 * of `ChatPane`'s own always-available run controls) is the operator's one and only action, exactly
 * as it already is for any other in-progress run.
 *
 * `AssistantDock.tsx` registers this component against `registerExtEventRenderer("slow_running",
 * ...)`, the same extension point already used for `mcp-ui`/`a2ui` (`OverflowAwareMcpUiSurfaceCard`,
 * `RoutedA2uiSurfaceCard`, this folder's siblings). That registration is deliberate, not incidental:
 * `@jini-ai/protocol`'s `RunAgentPayload` already has an older `'status'` variant that could have
 * carried this same `label`/`detail` shape, but nothing in this codebase renders `kind: 'status'`
 * events anywhere — verified across `@jini-ai/chat`'s `MessageRow.tsx`/`message-blocks.ts` and
 * Tovu's own `assistant-transport.ts` (whose existing `terminalReasonNotice` "Stopped early" notice
 * uses that same unrendered kind). The daemon's `'slow_running'` type instead falls through
 * `translateRunAgentPayload`'s `default` branch into `kind: 'ext'`, which this card renders.
 */

/**
 * Reads the most recent slow-run event's `detail` text, or `undefined` if the array is empty or the
 * entry is shaped unexpectedly (never trusted — this is untyped `unknown` data straight off the
 * wire, per `ExtEventRenderProps.events`'s own doc).
 *
 * Only the LATEST entry is read, not every occurrence: a run that stalls, recovers, and stalls again
 * should read as "still working" once, not as a growing list of identical lines — every occurrence
 * sharing this `name` already folds into one render slot at its first occurrence's position in the
 * transcript (`message-blocks.ts`'s own doc on `MessageBlock<Row>`'s `ext` variant).
 *
 * @param events - {@link ExtEventRenderProps.events} for the `"slow_running"` group.
 * @returns The server-supplied detail text, or `undefined` to signal "use the fallback copy".
 */
export function resolveSlowRunDetail(events: readonly unknown[]): string | undefined {
  const latest = events[events.length - 1] as { detail?: unknown } | undefined;
  return typeof latest?.detail === "string" && latest.detail.length > 0 ? latest.detail : undefined;
}

export function SlowRunNoticeCard({ events }: ExtEventRenderProps) {
  const t = useT();
  return (
    <div className="jini-chat-pane__status" role="status">
      {resolveSlowRunDetail(events) ?? t("Still working — this is taking longer than usual.")}
    </div>
  );
}
