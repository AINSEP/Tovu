import { useT, type ExtEventRenderProps } from "@jini-ai/chat/react";

import { isSlowRunNoticeVisible, resolveSlowRunDetail } from "./SlowRunNoticeCard.hooks";

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

// `resolveSlowRunDetail`/`isSlowRunNoticeVisible` now live in `SlowRunNoticeCard.hooks.ts` (2026-09-05,
// Gemini audit finding 37: no functions/derived logic in a `.tsx` file), but stay re-exported here
// since this component's own co-located test (`SlowRunNoticeCard.unit.test.tsx`) already imports both
// by name from this file — re-exporting keeps that import path working with zero test-file churn, the
// same "a hook with a consumer gets re-exported by name from the component file" rule `AssistantDock.tsx`
// already uses for `resolveComposerDiscoveryOutcome`.
export { isSlowRunNoticeVisible, resolveSlowRunDetail } from "./SlowRunNoticeCard.hooks";

export function SlowRunNoticeCard({ events, runStreaming, runSucceeded }: ExtEventRenderProps) {
  const t = useT();
  if (!isSlowRunNoticeVisible(runStreaming, runSucceeded)) return null;
  return (
    <div className="jini-chat-pane__status" role="status">
      {resolveSlowRunDetail(events) ?? t("Still working — this is taking longer than usual.")}
    </div>
  );
}
