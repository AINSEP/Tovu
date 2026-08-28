import { useRef, useState, useSyncExternalStore } from "react";
import type { A2uiSurfaceCardProps } from "@jini-ai/chat/react";

import {
  getPlaygroundRenderTarget,
  subscribeToPlaygroundRenderTarget,
} from "@/lib/playground-render-target-bus";

/**
 * @file `RoutedA2uiSurfaceCard`'s routing target, dismiss flag, and per-surfaceId error tracking,
 * split out of the component so it can be exercised directly (see the pure helpers' own coverage in
 * `use-routed-a2ui-surface-card.hooks.unit.test.tsx`) — the same split `SeeMore`/`SeeMore.hooks.tsx`
 * uses (and `ConfirmDialog`/`ConfirmDialog.hooks.tsx` in `@jini-ai/admin`): this file owns every
 * `useState`/`useRef`/`useSyncExternalStore` call, `RoutedA2uiSurfaceCard.tsx` stays
 * props-and-JSX only and calls {@link useRoutedA2uiSurfaceCard}.
 *
 * Lives in a `hooks/` subfolder (not a sibling `RoutedA2uiSurfaceCard.hooks.ts` file) per the
 * owner's `useWiredX` paradigm — `features/ai-assistant/hooks/` is the canonical shape, and this is
 * the first `components/*` directory carrying it; `SeeMore`, `MediaPickerDialog`, `InfoTip`,
 * `ImagePreviewModal`, and `AssistantDock` itself still use the older sibling-file shape.
 *
 * ## Why this hook has no `*Port`/`*Dependencies` pair and no `useWiredX` wrapper
 *
 * The `useX(dependencies)` / `useWiredX()` split exists to swap a REAL external dependency (an HTTP
 * client, a browser global that's awkward to drive in a test — see `usePresentMode`'s
 * `HtmlViewerDependencies` wrapping `document.fullscreenElement`/`requestFullscreen`/`window.open`
 * in `@jini-ai/ui`) for a fake one. This hook has no such dependency: `useSyncExternalStore`'s
 * subscribe/getSnapshot pair reads `playground-render-target-bus.ts`, a synchronous, in-memory,
 * already-a-plain-module store that ships its own direct test seam
 * (`setPlaygroundRenderTarget`/`resetPlaygroundRenderTargetBus`) — `RoutedA2uiSurfaceCard.unit
 * .test.tsx` already drives every branch of this hook that way, with no mock and no friction, the
 * same way `use-media-lightbox.hooks.ts`/`use-escape-to-cancel.hooks.ts` (both plain hooks, no port,
 * no wired pair) get driven directly. The rest of this hook's state (`dismissed`, the refused-
 * surfaceId tracking) is local component state, not I/O at all. Per this workspace's ratified rule —
 * "a hook doing NO I/O gets NO port; injection with nothing to inject is ceremony" — wrapping the bus
 * subscription in a manufactured port here would add a seam with nothing real on the other side of
 * it, so this file stays a plain exported hook.
 */

const SURFACE_ID_KEYS = ["createSurface", "updateComponents", "updateDataModel", "deleteSurface"] as const;

/** Mirrors `A2uiSurfaceCard.tsx`'s own (unexported) `extractSurfaceId` — duplicated rather than
 * imported because the original is not exported and the extraction itself is a few stable lines. */
export function surfaceIdOf(message: unknown): string | undefined {
  if (typeof message !== "object" || message === null) return undefined;
  for (const key of SURFACE_ID_KEYS) {
    const body = (message as Record<string, unknown>)[key];
    if (body && typeof body === "object" && typeof (body as Record<string, unknown>).surfaceId === "string") {
      return (body as Record<string, unknown>).surfaceId as string;
    }
  }
  return undefined;
}

/** The surfaceId `A2uiSurfaceCard` is CURRENTLY showing — the last one any event in the stream
 * named, matching that component's own "overwrite on every event that has one" tracking. */
export function latestSurfaceIdIn(events: readonly unknown[]): string | undefined {
  let latest: string | undefined;
  for (const event of events) {
    const id = surfaceIdOf(event);
    if (id) latest = id;
  }
  return latest;
}

function isErrorMessage(message: unknown): message is { error: { surfaceId?: unknown } } {
  return typeof message === "object" && message !== null && "error" in message;
}

/**
 * Owns `RoutedA2uiSurfaceCard`'s routing target, dismiss flag, and per-surfaceId error tracking —
 * everything the component needs to decide inline-vs-portal and to wrap the host's `onAgentAction`.
 *
 * @param props - The exact `A2uiSurfaceCardProps` the host handed the component; only `events` and
 *   `onAgentAction` are read here; everything else passes straight through to `A2uiSurfaceCard`
 *   untouched.
 * @returns `target` (the registered Playground DOM node to portal into, or `null` to render
 *   inline), `dismissed`/`setDismissed` (whether this instance's own portal was dismissed),
 *   `hasError` (whether the CURRENT surface — not any past one — just refused), and
 *   `handleAgentAction` (wraps `props.onAgentAction` to also watch for that refusal).
 * @example
 * const { target, dismissed, setDismissed, hasError, handleAgentAction } =
 *   useRoutedA2uiSurfaceCard(props);
 */
export function useRoutedA2uiSurfaceCard(props: A2uiSurfaceCardProps) {
  // `useSyncExternalStore`, not `useState` + an effect: Playground's own mount/unmount can flip the
  // target between renders of an ALREADY-MOUNTED card (e.g. navigating away from
  // `/admin/playground` mid-conversation), and a local copy would keep portaling into a container
  // that no longer exists.
  const target = useSyncExternalStore(
    subscribeToPlaygroundRenderTarget,
    getPlaygroundRenderTarget,
    // getServerSnapshot — React only calls this during SSR/pre-hydration, which this app's
    // jsdom-only test environment never exercises. Same structural, pre-existing gap as
    // `lib/router.ts`'s `useRouteLocation` third argument; not a defect introduced here.
    () => null,
  );
  // Not written back to the render-target bus: this hook instance already corresponds 1:1 to one
  // drawn surface (one ext-event group), so hiding its own portal is enough — nothing else needs
  // to know.
  const [dismissed, setDismissed] = useState(false);
  const [refusedSurfaceId, setRefusedSurfaceId] = useState<string | null>(null);
  // Dedupes the relay across the portal<->inline remount `hasError` flipping causes (reprocessing
  // `events` from scratch would otherwise deliver the same error into the exchange twice — see the
  // handler below).
  const relayedSurfaceIdsRef = useRef<Set<string>>(new Set());

  // Scanned fresh from `props.events` on every render, not cached, because one assistant turn can
  // open several surfaces: a first `assistant_render_ui` call fails validation, the model reads the
  // error and retries with a fixed `components` array, and that retry opens a BRAND NEW surface
  // (`render-ui-tool.ts` mints a new exchange, hence a new `surfaceId`, per call) — all landing in
  // the SAME `events` array, since they're all part of one turn's ext-event stream.
  const currentSurfaceId = latestSurfaceIdIn(props.events);
  // Tracked per-surfaceId, not as a single sticky "has this card ever seen an error" flag — a
  // sticky flag got this wrong in practice, live: the first failure locked the card to
  // inline-in-chat for the rest of the turn, so a LATER, genuinely successful retry never reached
  // the canvas either. Comparing the refused id against `currentSurfaceId` on every render (the
  // same surfaceId `A2uiSurfaceCard`'s own `surfaceIdRef` tracks internally, mirrored here via
  // `latestSurfaceIdIn`) means a fresh surface with a fresh id is never held back by an old one's
  // failure.
  const hasError = refusedSurfaceId !== null && refusedSurfaceId === currentSurfaceId;

  const handleAgentAction: A2uiSurfaceCardProps["onAgentAction"] = (runId, message) => {
    if (isErrorMessage(message)) {
      const surfaceId = typeof message.error.surfaceId === "string" ? message.error.surfaceId : undefined;
      if (surfaceId) {
        if (relayedSurfaceIdsRef.current.has(surfaceId)) return undefined;
        relayedSurfaceIdsRef.current.add(surfaceId);
        setRefusedSurfaceId(surfaceId);
      }
    }
    return props.onAgentAction?.(runId, message);
  };

  return { target, dismissed, setDismissed, hasError, handleAgentAction };
}
