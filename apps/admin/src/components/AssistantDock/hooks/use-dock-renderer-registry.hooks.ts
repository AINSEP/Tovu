import { createElement, useLayoutEffect, useState } from "react";
import {
  createExtEventRendererRegistry,
  createMcpUiToolCaller,
  MCP_UI_EXT_EVENT_NAME,
  mcpUiSurfaceSlotKey,
  MidRunUserMessage,
  MID_RUN_USER_MESSAGE_EXT_EVENT_NAME,
  midRunUserMessageSlotKey,
  type ExtEventRendererRegistry,
} from "@jini-ai/chat/react";
import { createA2uiActionPoster } from "../../../lib/a2ui-action-poster";
import { AgentFailureCard } from "../AgentFailureCard";
import { AGENT_FAILURE_EVENT } from "../agent-failure";
import { OverflowAwareMcpUiSurfaceCard } from "../OverflowAwareMcpUiSurfaceCard";
import { RoutedA2uiSurfaceCard } from "../RoutedA2uiSurfaceCard";
import { SlowRunNoticeCard } from "../SlowRunNoticeCard";
import { buildAssistantMcpUiSandboxProxyUrl, openMcpUiLink } from "./AssistantDock.hooks";

/**
 * Wires the MCP-UI dialog's confirmed click back to Tovu's own redemption endpoint (ADR-053
 * Decision 3).
 *
 * `onToolCall: createMcpUiToolCaller({ baseUrl: "", fetch }, { path: "/api/admin/v1/mcp-ui/tool-calls" })` is what
 * completes the confirmation loop: when a human clicks "Delete" in the rendered dialog, the View
 * posts a `tools/call`, and this relays it (same-origin, session cookie) to Tovu's own
 * admin-session-authenticated proxy (`src/server/modules/assistant.ts`), which forwards it to the
 * daemon-side redemption route (`src/assistant/mcp-ui-tool-calls-route.ts`) — the one place that
 * actually holds the `content_post_delete` handler and its held-open surface exchange. `path` is
 * required rather than the library's own bare-daemon default (`/api/mcp-ui/tool-calls`): Tovu mounts
 * this behind the admin-session-gated `/api/admin/v1` prefix, exactly the case
 * `CreateMcpUiToolCallerOptions.path`'s own doc calls out ("hosts mounting the redemption route
 * inside an already-authenticated admin API will need this"). With `onToolCall` wired, the dialog no
 * longer refuses every tool call — a real confirmed click now redeems the token and completes the
 * delete.
 *
 * The other half of the contract lives in `../../../lib/assistant-transport.ts`'s `case "mcp-ui"`,
 * which unwraps the wire envelope to the bare `EmbeddedResource` this renderer's `parseUIResource`
 * requires. All three pieces are needed; any one missing renders an empty frame or a dialog that
 * cannot complete its action.
 *
 * Module scope, and returned from the hook, because it has a second caller: `AssistantDock.tsx`'s
 * `resolveComposerHostBinding` reuses the exact same allowlisted, session-cookie route for a
 * composer capability's `'allowlisted-tool-call'` binding (debate 2, "Composer slash commands" —
 * that binding is real infrastructure, unwired to any capability in the bundled catalog today,
 * since nothing is on `MCP_UI_REDEEMABLE_TOOL_IDS`'s allowlist for that purpose; see
 * `composer-capabilities.ts`'s module doc). One instance, one endpoint, one allowlist gate — never a
 * second POST path to the same route.
 */
const mcpUiToolCaller = createMcpUiToolCaller({ baseUrl: "", fetch }, { path: "/api/admin/v1/mcp-ui/tool-calls" });
/**
 * Computed once, module scope — same posture as `mcpUiToolCaller` above, and for the same reason:
 * the MCP-UI render function below is re-invoked by `@jini-ai/chat/react` on every transcript
 * render of an active `mcp-ui` event, not just once at registration. Building this URL inline there
 * (as it used to be) minted a fresh `new URL(...)` object every such call — same string value, new
 * identity — which flows straight through `OverflowAwareMcpUiSurfaceCard` -> `McpUiSurfaceCard` ->
 * `McpUiHost` into Jini's `useMcpUiHost`, where `rendererProps = useMemo(..., [html,
 * sandboxProxyUrl, ...])` (`useMcpUiHost.ts`) treats a changed `sandboxProxyUrl` identity as a
 * reason to recompute even when `html` (the real View content) hasn't changed — silently defeating
 * that memo on every re-render (2026-09-05 Gemini audit finding 33, confirmed by tracing into
 * `useMcpUiHost.ts`). `globalThis.location.origin` does not change for the life of this tab, so
 * hoisting to a plain module-scope constant is exact, not an approximation.
 */
const assistantMcpUiSandboxProxyUrl = buildAssistantMcpUiSandboxProxyUrl(globalThis.location.origin);
/** The A2UI agent-action relay; see the `"a2ui"` registration below. Module scope like the two above. */
const postA2uiAction = createA2uiActionPoster("", { path: "/api/admin/v1/a2ui/actions" });

/**
 * Registers the dock's cards on `registry` and returns one disposer for all of them. Each disposer
 * removes only its own entry (Jini compares the registration, not the callback), so a stale cleanup
 * never erases a newer registration of the same name.
 */
function registerDockRenderers({ registry }: { registry: ExtEventRendererRegistry }): () => void {
  const unregister = [
    /**
     * Registered via the low-level `register` (not Jini's own `registerMcpUiSurfaceRenderer`
     * convenience call, which would bind `McpUiSurfaceCard` itself with no seam to wrap it) so this
     * dock can render `OverflowAwareMcpUiSurfaceCard` instead — the "Show in modal" affordance
     * (chat-overflow fix, 2026-08-30) around the same real `McpUiSurfaceCard`, same props, same
     * behavior otherwise. Exactly the shape the `"a2ui"` registration below already uses for
     * `RoutedA2uiSurfaceCard`.
     *
     * Deliberately NOT passing `maxHeight` here — tried 480px first and reverted it after a live
     * measurement caught a real regression it caused. `McpUiHost` sets `iframe.style.height` to
     * `min(reported, maxHeight)`, but the surface's own document (`document.ts`'s `SURFACE_BASE_CSS`)
     * has no `overflow` rule on `body`/`html` — so when a cap forces the frame SHORTER than the
     * surface's real content, that content does not get clipped or internally scrolled, it visibly
     * overflows the iframe's own box into the host page. Measured live (2026-08-16): capping at 480px
     * against a ~559-580px-tall confirmation pushed its buttons back into the composer's covered zone
     * by rendering them outside the (too-short) iframe entirely — the same failure this whole fix
     * exists to prevent, just from a different cause. That is a latent defect in `McpUiHost`/
     * `document.ts` shared by every consumer of the package (nothing before this dock had passed a cap
     * below ~720px worth of real content to notice it), not something to paper over with a Tovu-only
     * number; it needs its own careful fix to the auto-resize protocol, not a rushed one here.
     *
     * The library default (`DEFAULT_MAX_HEIGHT`, 720px) stays in effect and is untouched — it is
     * already comfortably above every surface this dock has rendered, and reachability no longer
     * depends on a tight cap at all: `MessageList`'s resize-aware sticky-scroll fix keeps a surface's
     * action buttons reachable by scrolling regardless of its real height, and
     * `useChatPaneControlsHeight`'s live-measured padding reservation keeps the transcript's true
     * bottom clear of the composer overlay. A future host that genuinely needs a tighter ceiling can
     * still pass `maxHeight` — the prop stays tested and supported — but should do so only once
     * `document.ts` gives a capped surface its own internal scrollbar to overflow into.
     */
    registry.register({ name: MCP_UI_EXT_EVENT_NAME, renderer: (props) => createElement(OverflowAwareMcpUiSurfaceCard, {
      ...props,
      onToolCall: mcpUiToolCaller,
      // Generic across every plugin's rendered card, not Supabase-specific (S-G1b) — see
      // `openMcpUiLink`'s own doc (`AssistantDock.hooks.tsx`) for the `https:`-only allowlist and why
      // omitting this makes `useMcpUiHost` refuse every `ui/open-link` request instead.
      onOpenLink: openMcpUiLink,
      // A same-document `data:` URL, not a route on this admin app's own origin — see
      // `buildAssistantMcpUiSandboxProxyUrl`'s own doc (`AssistantDock.hooks.tsx`) for why: a
      // same-origin route would hand any third-party MCP server's HTML this admin origin's full
      // authority, because `@mcp-ui/client`'s `AppFrame` hardcodes `allow-same-origin` on the iframe
      // it creates.
      sandboxProxyUrl: assistantMcpUiSandboxProxyUrl,
    }) }, {
      // One transcript slot per `ui://` URI, so a run's second card (a second choice, a Connect card
      // after a choice) renders where it arrived instead of inside the first card's slot, far above the
      // tool row that is waiting on it (stuck-chat investigation, 2026-09-27).
      slotKey: mcpUiSurfaceSlotKey,
    }),
    /**
     * A2UI's counterpart to the MCP-UI wiring above — same "one line completes the loop" shape.
     * `@jini-ai/chat/react`'s `A2uiSurfaceCard` renders any run event `assistant-transport.ts`'s
     * `case "a2ui"` unwraps to a bare `AgentToRendererMessage`; when a rendered `Button`'s action is
     * agent-directed (as opposed to a `local` client-side function call, which the card already
     * resolves and displays itself), `onAgentAction` is what gives that action somewhere real to go —
     * `createA2uiActionPoster` posts it to `a2ui-actions-route.ts` (proxied, same as every other
     * assistant route), which delivers it into the held-open exchange `assistant_demo_a2ui` (or any
     * future A2UI-opening tool) is waiting on.
     *
     * Without this line, `A2uiSurfaceCard` still renders correctly but falls back to its own honest
     * "this host has not wired up a live agent-action relay yet" notice on every agent-directed click
     * (see that component's own module doc) — exactly the gap `examples/reference-web/src/A2uiLab.tsx`
     * leaves open deliberately, because a demo fixture has no real backend to relay to. Tovu does now.
     *
     * Registered against `RoutedA2uiSurfaceCard`, not `A2uiSurfaceCard` directly — the Studio
     * Playground "whiteboard" feature: when `/admin/playground` is the active page, that wrapper
     * portals the exact same card onto the Playground canvas instead of rendering it inline in the
     * transcript. Every other page is unaffected — no target registered there, so the wrapper falls
     * straight through to `A2uiSurfaceCard` unchanged. See `RoutedA2uiSurfaceCard.tsx`'s own doc for
     * the full routing decision and `lib/playground-render-target-bus.ts` for the seam it reads.
     */
    registry.register({ name: "a2ui", renderer: (props) => createElement(RoutedA2uiSurfaceCard, { ...props, onAgentAction: postA2uiAction }) }),
    // The wall-clock "still working" notice (`@jini-ai/daemon`'s `run-lifecycle.ts` slow-run
    // watchdog) — see `SlowRunNoticeCard.tsx`'s own doc for the full "why `ext` instead of the
    // existing (unrendered) `'status'` kind" reasoning.
    registry.register({ name: "slow_running", renderer: (props) => createElement(SlowRunNoticeCard, props) }),
    registry.register({ name: AGENT_FAILURE_EVENT, renderer: (props) => createElement(AgentFailureCard, props) }),
    // What the operator sent mid-run, drawn as their own transcript row where the agent
    // got it. Jini's `registerMidRunUserMessageRenderer` only targets the global registry, so this
    // repeats its two lines (component + slot key) against the owned one.
    registry.register({ name: MID_RUN_USER_MESSAGE_EXT_EVENT_NAME, renderer: (props) => createElement(MidRunUserMessage, {
      events: props.events, runStreaming: props.runStreaming, transcriptRow: props.transcriptRow === true,
    }) }, { slotKey: midRunUserMessageSlotKey }),
  ];
  return () => { unregister.forEach(dispose => dispose()); };
}

export interface DockRendererBinding {
  /** Bind via `JiniChatProvider`'s `extEventRendererRegistry`. */
  registry: ExtEventRendererRegistry;
  /** The one MCP-UI redemption caller; see its module-scope doc. */
  mcpUiToolCaller: ReturnType<typeof createMcpUiToolCaller>;
}

/**
 * The dock's own ext-event renderer registry. These cards used to be registered on
 * `@jini-ai/chat`'s global registry at module import, so every `ChatPane` on the page rendered
 * them; an owned registry keeps them to this dock and leaves the globals to other chat trees.
 *
 * The registry is populated as it is created, so the transcript's very first render finds every
 * card, exactly as with the old import-time registration (a `MessageRow` is memoized and would not
 * re-render to pick up a registration that landed after it). `useState`, not `useMemo`, because
 * Fast Refresh keeps state but re-runs memos: a new registry mid-session would hand the provider a
 * different instance under a live transcript. The layout effect owns the cleanup handles:
 * unmount removes the cards, and StrictMode's effect replay or a Fast Refresh re-registers right
 * after its own cleanup (last writer wins, so the creation-time entries are simply replaced).
 */
export function useDockRendererRegistry(): DockRendererBinding {
  const [registry] = useState(() => {
    const owned = createExtEventRendererRegistry({});
    registerDockRenderers({ registry: owned });
    return owned;
  });
  useLayoutEffect(() => registerDockRenderers({ registry }), [registry]);
  return { registry, mcpUiToolCaller };
}
