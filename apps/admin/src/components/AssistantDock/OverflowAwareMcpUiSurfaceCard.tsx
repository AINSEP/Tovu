import { useState } from "react";
import { McpUiSurfaceCard, useT, type McpUiSurfaceCardProps } from "@jini-ai/chat/react";

import { useOverflowDetection } from "./hooks/useOverflowDetection.hooks";
import { MessageOverflowModal } from "./MessageOverflowModal";

/**
 * @file The "Show in modal" affordance for MCP-UI surfaces (owner request, chat-overflow fix
 * 2026-08-30) — see `MessageOverflowModal.tsx`'s own doc for the owner's exact wording. Wraps
 * Jini's own `McpUiSurfaceCard` without touching it, or `@jini-ai/chat`'s package at all: the same
 * `RoutedA2uiSurfaceCard.tsx` pattern one file over — `AssistantDock.tsx` registers THIS component
 * against `registerExtEventRenderer("mcp-ui", ...)` in place of Jini's own
 * `registerMcpUiSurfaceRenderer` convenience call (which would register `McpUiSurfaceCard` itself,
 * with no seam to wrap it), and it renders the real `McpUiSurfaceCard` unchanged plus the new
 * button around it. Live immediately from Tovu's own already-built `@jini-ai/chat` dist — no Jini
 * source change, so no rebuild dependency for this half of the feature.
 *
 * Shown only when the rendered surface genuinely overflows its own box
 * (`useOverflowDetection`, `ResizeObserver`-driven) — a button on a surface that already fits the
 * 380px dock is noise, per the owner's own framing ("if we have a UI element that we can't really
 * show ... very well"). See that hook's own doc for the one case it cannot see (a surface height-
 * capped by `McpUiHost`'s `maxHeight` whose real content overflows INSIDE its own sandboxed iframe)
 * — a real, disclosed limitation, not silently dropped.
 *
 * Clicking it MOVES the surface into `MessageOverflowModal` rather than adding a second, independent
 * copy next to it: the inline `<McpUiSurfaceCard>` unmounts (`expanded ? null : <McpUiSurfaceCard
 * .../>`) at the same instant the modal's own copy mounts, so exactly one live instance of a given
 * surface exists at any moment. An earlier version of this component mounted BOTH simultaneously
 * (identical props, so the identical resource/`sessionKey` — see that component's own doc for why
 * the URI+text pair is the real identity) — real bug, not a deliberate two-sessions design: every
 * `data-agent-element` handle `McpUiSurfaceCard`'s own `PendingSurfaceMirror` publishes is derived
 * purely from the surface's `ui://` URI, so two live copies of the same surface published the exact
 * same handle twice in the DOM — one `page.find_elements` match resolves to whichever the driver
 * happens to hit first, and worse, both copies run a REAL, separate `@mcp-ui/client` handshake
 * wired to the same `onToolCall`, so a pending confirmation could be answered from either copy,
 * genuinely executing its tool call twice. Losing the inline copy's in-progress session state on
 * expand/collapse (a filled-out form, say) is a real cost of this fix, not an oversight — accepted
 * because it is strictly safer than the double-live-session alternative it replaces: a session that
 * exists in only one place at a time cannot go stale relative to a twin the user or an agent might
 * act on instead. `@mcp-ui/client`'s `AppRenderer` owns its iframe's lifecycle end to end, and there
 * is no supported way to reparent a live sandboxed iframe across the swap, so the modal's copy
 * starts a fresh session rather than continuing the inline one's.
 */
export interface OverflowAwareMcpUiSurfaceCardProps extends McpUiSurfaceCardProps {
  /** Injectable seam for overflow measurement — lets a test force the "Show in modal" button on or
   *  off without depending on `ResizeObserver`/real layout. Defaults to the real
   *  {@link useOverflowDetection}. */
  useOverflowDetectionHook?: typeof useOverflowDetection;
}

export function OverflowAwareMcpUiSurfaceCard({
  useOverflowDetectionHook = useOverflowDetection,
  ...surfaceProps
}: OverflowAwareMcpUiSurfaceCardProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const { containerRef, isOverflowing } = useOverflowDetectionHook<HTMLDivElement>();

  return (
    <div className="mcpui-surface-overflow-wrap" ref={containerRef}>
      {expanded ? null : <McpUiSurfaceCard {...surfaceProps} />}
      {isOverflowing ? (
        <button type="button" className="mcpui-surface-overflow-expand" onClick={() => setExpanded(true)}>
          {t("Show in modal")}
        </button>
      ) : null}
      <MessageOverflowModal open={expanded} title={t("Show in modal")} onClose={() => setExpanded(false)}>
        {expanded ? <McpUiSurfaceCard {...surfaceProps} /> : null}
      </MessageOverflowModal>
    </div>
  );
}
