import { createPortal } from "react-dom";
import { A2uiSurfaceCard, useT, type A2uiSurfaceCardProps } from "@jini-ai/chat/react";

import { useRoutedA2uiSurfaceCard } from "./hooks/use-routed-a2ui-surface-card.hooks";

/**
 * @file Makes `A2uiSurfaceCard` page-aware without touching the card itself, Jini's ext-event
 * registry, or the daemon/tool that emits the a2ui events in the first place (`render-ui-tool.ts`
 * already sends everything needed — this is purely about where the browser puts it).
 *
 * `AssistantDock.tsx` registers this component (not `A2uiSurfaceCard` directly) against
 * `registerExtEventRenderer("a2ui", ...)`. `@jini-ai/chat/react`'s `MessageRow` calls the
 * registered renderer as `renderer(props)` and treats the return value as a `ReactNode` — but the
 * registration itself returns *JSX* (`(props) => <RoutedA2uiSurfaceCard {...props} .../>`), so
 * React evaluates this component as a real element during its own reconciliation, not as a plain
 * function call. That is what makes hooks safe to use from here — both `useRoutedA2uiSurfaceCard`
 * below and, transitively, everything it calls — the same way it is already safe inside
 * `A2uiSurfaceCard` itself.
 *
 * Routing target, dismiss state, and per-surfaceId error tracking live in
 * `hooks/use-routed-a2ui-surface-card.hooks.ts`, split out the same way `SeeMore`/`SeeMore.hooks.tsx`
 * does: that file owns the state, this one stays props-and-JSX only. (It sits in a `hooks/`
 * subfolder rather than a sibling file — see that file's own doc for why, and for why it has no
 * `*Port`/`useWiredX` pair despite that being this workspace's dominant hook shape elsewhere.)
 *
 * ## The routing decision
 *
 * `useRoutedA2uiSurfaceCard` reads `playground-render-target-bus.ts`'s registered node (set only by
 * `features/playground/Playground.tsx`, on mount/unmount) as `target`:
 *
 * - **No target registered** (Playground is not the active page, or hasn't mounted its canvas
 *   yet): falls back to the exact pre-existing behavior — `<A2uiSurfaceCard>` renders inline,
 *   wherever this ext-event group lands in the transcript.
 * - **Target registered**: `ReactDOM.createPortal`s the exact same `<A2uiSurfaceCard>` element
 *   into Playground's own DOM container instead. The card's own internals (interpreter, local
 *   action handling, `onAgentAction` wiring) are unchanged either way — only the DOM location
 *   differs. Multiple asks stack in that container in mount order (oldest first, matching normal
 *   reading order) — see `playground.css`'s `.playground-render-target` for the flex/gap layout
 *   that makes that look intentional rather than accidental.
 *
 * ## Dismissing a drawn surface
 *
 * Portaled surfaces get a small "×" so the canvas doesn't just accumulate forever. Only offered
 * when portaled: the chat transcript is a history, not a scratch surface, so inline cards (no
 * target registered) never get a dismiss control. (See the hooks file for why `dismissed` is local
 * state rather than written back to the render-target bus.)
 *
 * ## A refusal never portals, even with a target registered — but only for AS LONG AS it's live
 *
 * A catalog-validation refusal is diagnostic chat output ("this failed, here's why"), not a real
 * drawn artifact — putting it on Playground's canvas would make the whiteboard look broken instead
 * of the request that actually failed. `hasError`, computed by the hook, tracks the CURRENT surface
 * only, not "has this card ever seen an error" — see `hooks/use-routed-a2ui-surface-card.hooks.ts`
 * for the full reasoning and the regression a sticky flag caused (a genuinely successful retry never
 * reaching the canvas), which is why this file just reads `hasError` rather than deriving it itself.
 */
export interface RoutedA2uiSurfaceCardProps extends A2uiSurfaceCardProps {
  /** Injectable seam for the routing/dismiss/error-tracking hook. Defaults to the real
   *  {@link useRoutedA2uiSurfaceCard}; a test can pass a fake here to exercise this component's
   *  rendering (inline vs. portal, the dismiss control, refusal handling) without driving the real
   *  `playground-render-target-bus` subscription or the hook's own local state. Destructured off
   *  separately from `...props` below so it is never spread through to the real `A2uiSurfaceCard`. */
  useRoutedA2uiSurfaceCardHook?: typeof useRoutedA2uiSurfaceCard;
}

export function RoutedA2uiSurfaceCard({
  useRoutedA2uiSurfaceCardHook = useRoutedA2uiSurfaceCard,
  ...props
}: RoutedA2uiSurfaceCardProps) {
  const t = useT();
  const { 
    target, 
    dismissed, 
    setDismissed, 
    hasError, 
    handleAgentAction 
  } = useRoutedA2uiSurfaceCardHook(props);

  if (target && !hasError) {
    if (dismissed) return null;
    return createPortal(
      <div className="playground-drawn-surface">
        <button
          type="button"
          className="playground-drawn-surface-dismiss"
          onClick={() => setDismissed(true)}
          aria-label={t("Remove from canvas")}
        >
          ×
        </button>
        <A2uiSurfaceCard {...props} onAgentAction={handleAgentAction} />
      </div>,
      target,
    );
  }

  return <A2uiSurfaceCard {...props} onAgentAction={handleAgentAction} />;
}
