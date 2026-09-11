import {
  ChatPane,
  ConversationList,
  JiniChatProvider,
  createMcpUiToolCaller,
  registerExtEventRenderer,
  MCP_UI_EXT_EVENT_NAME,
  type FrontendSessionBridge,
} from "@jini-ai/chat/react";
import type { ChatMessage } from "@jini-ai/chat/core";

import { createA2uiActionPoster } from "../../lib/a2ui-action-poster";
import { RoutedA2uiSurfaceCard } from "./RoutedA2uiSurfaceCard";
import { OverflowAwareMcpUiSurfaceCard } from "./OverflowAwareMcpUiSurfaceCard";
import { SlowRunNoticeCard } from "./SlowRunNoticeCard";
import { SelectedAgentPluginTray } from "./SelectedAgentPluginTray";
import { PushToTalkMicButton } from "../../features/voice-input/PushToTalkMicButton";
import { useComposerVoiceInput } from "../../features/voice-input/hooks/use-composer-voice-input.hooks";
import { hasUsableAdminKey, selectedLocalCliReasoning } from "../../lib/execution-settings";
import type { UseAssistantChats } from "../../hooks/use-assistant-chats.hooks";
import "../../styles/assistant.css";
// The runtime picker's BYOK model row renders `@jini-ai/ui`'s `SearchableModelSelect`, whose
// styles (including the body-portaled `.jini-select-menu`) live in this sheet. The settings
// screens import it too, but the dock is mounted on every admin route — relying on a screen the
// operator may never open would leave the dropdown unstyled exactly when it is used most.
import "@jini-ai/ui/settings-dialog.css";
import {
  // The bare hook names below are imported for their TYPE only (`typeof useX` on
  // `AssistantDockProps`) — every actual call in this component goes through the matching
  // `useXSeam` wrapper instead; see `AssistantDock.hooks.tsx`'s "Seam layer" doc for why.
  buildAssistantMcpUiSandboxProxyUrl,
  useAssistantDockChrome,
  useAssistantTransport,
  useAssistantTransportSeam,
  useAttachmentUploader,
  useAttachmentUploaderSeam,
  useByokRuntime,
  useByokRuntimeSeam,
  useChatsSeam,
  useComposerCapabilities,
  useComposerCapabilitiesSeam,
  useComposerDiscoverySelect,
  useExecutionConfig,
  useExecutionConfigSeam,
  useLocalCliSelection,
  useLocalCliSelectionSeam,
  useMessagesChangeHandler,
  useRunContext,
  useRuntimeAccess,
  useRuntimeAccessSeam,
  useSelectedAgentPlugins,
  useSelectedPluginChips,
} from "./hooks/AssistantDock.hooks";

// `resolveComposerDiscoveryOutcome` lives in `AssistantDock.hooks.tsx` now (2026-08-18, alongside
// `shouldPublishOnMessagesChange`/`resolveRunContext` as a third pure decision helper), but has an
// external consumer outside this folder
// (`features/plugins/__tests__/agent-plugin-capability-adapter.unit.test.ts`) — per `INFO.md`'s
// Components rule 2 ("a hook with an external consumer gets re-exported by name from the component
// file"), it stays reachable at this same import path.
export { resolveComposerDiscoveryOutcome, type ResolveComposerDiscoveryOutcomeDeps } from "./hooks/AssistantDock.hooks";

/**
 * Renders the MCP-UI surfaces the daemon withholds from tool results, and wires the dialog's
 * confirmed click back to Tovu's own redemption endpoint (ADR-053 Decision 3).
 *
 * Module scope, once, deliberately — `registerMcpUiSurfaceRenderer` populates `@jini-ai/chat`'s
 * ext-event renderer registry, which every `ChatPane` consults thereafter; calling it inside a
 * component would re-register on each render for no benefit. This is the whole of the host-side
 * wiring: `ChatPane` itself is untouched, and an admin build that never imports this module simply
 * renders nothing for `mcp-ui` events rather than breaking.
 *
 * `onToolCall: createMcpUiToolCaller("", { path: "/api/admin/v1/mcp-ui/tool-calls" })` is what
 * completes the confirmation loop: when a human clicks "Delete" in the rendered dialog, the View
 * posts a `tools/call`, and this relays it (same-origin, session cookie) to Tovu's own
 * admin-session-authenticated proxy (`src/server/modules/assistant.ts`), which forwards it to the
 * daemon-side redemption route (`src/assistant/mcp-ui-tool-calls-route.ts`) — the one place that
 * actually holds the `content_post_delete` handler and its `PendingConfirmationStore`. `path` is
 * required rather than the library's own bare-daemon default (`/api/mcp-ui/tool-calls`): Tovu mounts
 * this behind the admin-session-gated `/api/admin/v1` prefix, exactly the case
 * `CreateMcpUiToolCallerOptions.path`'s own doc calls out ("hosts mounting the redemption route
 * inside an already-authenticated admin API will need this"). With `onToolCall` wired, the dialog no
 * longer refuses every tool call — a real confirmed click now redeems the token and completes the
 * delete.
 *
 * The other half of the contract lives in `../../lib/assistant-transport.ts`'s `case "mcp-ui"`, which
 * unwraps the wire envelope to the bare `EmbeddedResource` this renderer's `parseUIResource`
 * requires. All three pieces are needed; any one missing renders an empty frame or a dialog that
 * cannot complete its action.
 *
 * Hoisted to a named binding (`mcpUiToolCaller`), not passed inline, because it has a second
 * caller: `resolveComposerHostBinding` below reuses the exact same allowlisted, session-cookie
 * route for a composer capability's `'allowlisted-tool-call'` binding (debate 2, "Composer slash
 * commands" — that binding is real infrastructure, unwired to any capability in the bundled
 * catalog today, since nothing is on `MCP_UI_REDEEMABLE_TOOL_IDS`'s allowlist for that purpose;
 * see `composer-capabilities.ts`'s module doc). One instance, one endpoint, one allowlist gate —
 * never a second POST path to the same route.
 */
const mcpUiToolCaller = createMcpUiToolCaller("", { path: "/api/admin/v1/mcp-ui/tool-calls" });
/**
 * Computed once, module scope — same posture as `mcpUiToolCaller` above, and for the same reason:
 * `registerExtEventRenderer`'s render-function argument below is re-invoked by `@jini-ai/chat/react`
 * on every transcript render of an active `mcp-ui` event, not just once at registration. Building
 * this URL inline there (as it used to be) minted a fresh `new URL(...)` object every such call —
 * same string value, new identity — which flows straight through `OverflowAwareMcpUiSurfaceCard` ->
 * `McpUiSurfaceCard` -> `McpUiHost` into Jini's `useMcpUiHost`, where `rendererProps = useMemo(...,
 * [html, sandboxProxyUrl, ...])` (`useMcpUiHost.ts`) treats a changed `sandboxProxyUrl` identity as a
 * reason to recompute even when `html` (the real View content) hasn't changed — silently defeating
 * that memo on every re-render (2026-09-05 Gemini audit finding 33, confirmed by tracing into
 * `useMcpUiHost.ts`). `globalThis.location.origin` does not change for the life of this tab, so
 * hoisting to a plain module-scope constant is exact, not an approximation.
 */
const assistantMcpUiSandboxProxyUrl = buildAssistantMcpUiSandboxProxyUrl(globalThis.location.origin);
/**
 * Registered via the low-level `registerExtEventRenderer` (not Jini's own
 * `registerMcpUiSurfaceRenderer` convenience call, which would bind `McpUiSurfaceCard` itself with
 * no seam to wrap it) so this dock can render `OverflowAwareMcpUiSurfaceCard` instead — the "Show
 * in modal" affordance (chat-overflow fix, 2026-08-30) around the same real `McpUiSurfaceCard`,
 * same props, same behavior otherwise. Exactly the shape `registerExtEventRenderer("a2ui", ...)`
 * below already uses for `RoutedA2uiSurfaceCard`.
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
registerExtEventRenderer(MCP_UI_EXT_EVENT_NAME, (props) => (
  <OverflowAwareMcpUiSurfaceCard
    {...props}
    onToolCall={mcpUiToolCaller}
    // A same-document `data:` URL, not a route on this admin app's own origin — see
    // `buildAssistantMcpUiSandboxProxyUrl`'s own doc (`AssistantDock.hooks.tsx`) for why: a
    // same-origin route would hand any third-party MCP server's HTML this admin origin's full
    // authority, because `@mcp-ui/client`'s `AppFrame` hardcodes `allow-same-origin` on the iframe
    // it creates.
    sandboxProxyUrl={assistantMcpUiSandboxProxyUrl}
  />
));

/**
 * A2UI's counterpart to the MCP-UI wiring above — same module-scope-once posture, same "one line
 * completes the loop" shape. `@jini-ai/chat/react`'s `A2uiSurfaceCard` renders any run event
 * `assistant-transport.ts`'s `case "a2ui"` unwraps to a bare `AgentToRendererMessage`; when a
 * rendered `Button`'s action is agent-directed (as opposed to a `local` client-side function call,
 * which the card already resolves and displays itself), `onAgentAction` is what gives that action
 * somewhere real to go — `createA2uiActionPoster` posts it to `a2ui-actions-route.ts` (proxied,
 * same as every other assistant route), which delivers it into the held-open exchange
 * `assistant_demo_a2ui` (or any future A2UI-opening tool) is waiting on.
 *
 * Without this line, `A2uiSurfaceCard` still renders correctly but falls back to its own honest
 * "this host has not wired up a live agent-action relay yet" notice on every agent-directed click
 * (see that component's own module doc) — exactly the gap `examples/reference-web/src/A2uiLab.tsx`
 * leaves open deliberately, because a demo fixture has no real backend to relay to. Tovu does now.
 *
 * Registered against `RoutedA2uiSurfaceCard` (this file's sibling `RoutedA2uiSurfaceCard.tsx`), not
 * `A2uiSurfaceCard` directly — the Studio Playground "whiteboard" feature: when
 * `/admin/playground` is the active page, that wrapper portals the exact same card onto the
 * Playground canvas instead of rendering it inline in the transcript. Every other page is
 * unaffected — no target registered there, so the wrapper falls straight through to
 * `A2uiSurfaceCard` unchanged. See `RoutedA2uiSurfaceCard.tsx`'s own doc for the full routing
 * decision and `lib/playground-render-target-bus.ts` for the seam it reads.
 */
const postA2uiAction = createA2uiActionPoster("", { path: "/api/admin/v1/a2ui/actions" });
registerExtEventRenderer("a2ui", (props) => <RoutedA2uiSurfaceCard {...props} onAgentAction={postA2uiAction} />);

/**
 * The wall-clock "still working" notice (`@jini-ai/daemon`'s `run-lifecycle.ts` slow-run watchdog) —
 * see `SlowRunNoticeCard.tsx`'s own doc for the full "why `ext` instead of the existing (unrendered)
 * `'status'` kind" reasoning. Same module-scope-once registration shape as the two above.
 */
registerExtEventRenderer("slow_running", (props) => <SlowRunNoticeCard {...props} />);

declare global {
  interface Window {
    /**
     * Debug-only live transcript mirror, driven by `ChatPane`'s `onMessagesChange` — lets a test
     * driver (Playwright, etc.) read exactly what the pane rendered (including every
     * `tool_use`/`tool_result` event) without scraping the DOM. Not a security surface: it only
     * ever holds the current admin's own already-visible conversation.
     */
    __tovuAssistantMessages?: ChatMessage[];
  }
}

/**
 * @file The global assistant dock (ADR-049) — every admin page gets the same chat pane on the
 * right, not a routed `/admin/assistant` page. Mounted once in `App.tsx`, outside the routed
 * `content` switch, and toggled via `hidden` (never conditional render) so the conversation
 * survives both a FAB close/reopen AND navigating to a different admin section — matches
 * `examples/reference-web/src/AgentLab.tsx`'s own pane in Jini's own repo: "the pane keeps its
 * conversation across toggles... it also drops out of layout and the tab order when closed, so
 * the page genuinely resizes rather than reserving a gap."
 *
 * Hosts `@jini-ai/chat/react`'s `<ChatPane>` against Tovu's own `@jini-ai/core`+`@jini-ai/daemon`
 * kernel (`src/assistant/agent-daemon-server.ts`, proxied by `src/server/modules/assistant.ts`).
 * Tool execution is not a prop here — it happens server-side: the spawned coding-agent CLI gets
 * `.mcp.json`-injected access to Tovu's registered tools (`src/assistant/tool-registrations.ts`)
 * and calls them through the daemon's `/api/delegated-tool-calls` gate, which shows up in this
 * same transcript as ordinary `tool_use`/`tool_result` events — `ChatPane` renders those itself.
 *
 * `uploadAttachments` below wires the composer's existing (host-agnostic, `@jini-ai/chat/react`-
 * native) drag-and-drop and file-picker mechanism to this daemon's own `/api/attachments` route —
 * see that route's registration in `src/assistant/agent-daemon-server.ts` and its proxy pass-
 * through in `src/server/modules/assistant.ts` for the rest of the chain (`onStarted` claims the
 * upload and hands the daemon's `AgentExecutor.run()` real `imagePaths`). No `attachmentAccept` is
 * passed — see that prop's own doc, below, for why.
 *
 * `styles/assistant.css` themes the pane. Note that the package does NOT ship zero CSS, contrary to
 * what this comment used to claim: `ChatPane` injects its own complete default theme as a `<style>`
 * tag at mount, appended last in the cascade. Host overrides therefore need either the
 * `--jini-chat-*` custom-property seam or a descendant selector — a flat `.jini-*` rule in
 * `assistant.css` loses even at equal specificity. See that file's header for the full account.
 *
 * Every hook this component's render depends on — the runtime-picker state (`useExecutionConfig`,
 * `useByokRuntime`, `useLocalCliSelection`), the composer-discovery projection
 * (`useComposerCapabilities`, 2026-08-14), the JSX-adjacent state that used to live inline here
 * (`useChatI18n`, `useAssistantTransport`, `useAttachmentUploader`, `useRuntimeAccess`,
 * `useComposerDiscoverySelect`, `useMessagesChangeHandler`, `useRunContext` — extracted 2026-08-18),
 * and the pure decision helpers those hooks call (`shouldPublishOnMessagesChange`,
 * `resolveRunContext`, `resolveComposerDiscoveryOutcome`) — live in `AssistantDock.hooks.tsx`; see
 * that file's own header for why they are split out and which of them carry an `INFO.md` rule-3
 * injectable seam. This file stays the render layer: props/JSX only, wiring each hook's return
 * value onto `<ChatPane>`'s props.
 */

export interface AssistantDockProps {
  /**
   * This tab's page-control connection, owned by `App.tsx` (it outlives this pane, which unmounts
   * with the dock). `null` until the daemon has attached the surface, or if it never does.
   */
  agentBridge?: FrontendSessionBridge | null;
  /**
   * The conversation-state hook, overridable so a test can drive this component against a fake
   * port without stubbing `fetch` — the `useX`/`useWiredX` consumption shape used throughout
   * `@jini-ai/ui` (`ChatComposer`'s `useWorkingDir = useWiredWorkingDirStatus` is the precedent).
   *
   * Passing a *hook* rather than the port itself is what keeps this component dumb: it never has to
   * know a port exists, only that something supplies it conversation state.
   */
  useChats?: () => UseAssistantChats;
  /**
   * Injectable seam for the locale {@link useAssistantDockChrome} resolves `locale`/`t`/`chatI18n`
   * from. Defaults to the real `useWiredAdminLocale` (2026-08-18, added after live review flagged
   * that this was the one IO hook in the component still called bare): the real hook calls
   * `port.loadLanguage()`, a real `fetch`, which a fake bypasses entirely — a test can now drive
   * `locale`/`t`/`chatI18n` for any locale without stubbing `lib/settings-tabs` or the
   * settings-refresh bus.
   */
  useAdminLocale?: () => string;
  /**
   * Injectable seam for the runtime-picker's Local CLI / API · BYOK config state — see
   * {@link useExecutionConfig}. Defaults to the real hook (MSG-01, 2026-08-06, owner directive:
   * every hook doing DOM/IO work gets this seam, `useChats` above is the in-repo precedent to
   * extend, not stop at). `useExecutionConfig` itself calls `loadExecutionConfig`/
   * `saveExecutionConfig`/`loadAdminExecutionCredential` — a fake here drives this component's
   * rendering without stubbing any of that fetch-backed IO.
   */
  useExecutionConfig?: typeof useExecutionConfig;
  /**
   * Injectable seam for BYOK model-discovery state — see {@link useByokRuntime}. Defaults to the
   * real hook, same MSG-01 rationale as `useExecutionConfig` above: the real hook calls
   * `createExecutionPort().listModels`, which a fake bypasses entirely.
   */
  useByokRuntime?: typeof useByokRuntime;
  /**
   * Injectable seam for the Local CLI picker's agent+model selection — see
   * {@link useLocalCliSelection}. Defaults to the real hook, same MSG-01 rationale as
   * `useExecutionConfig` above: the real hook persists through `saveExecutionConfig`, which a fake
   * bypasses entirely.
   */
  useLocalCliSelection?: typeof useLocalCliSelection;
  /**
   * Injectable seam for the composer's discovery-catalog projection — see
   * {@link useComposerCapabilities}. Defaults to the real hook, same MSG-01 rationale as the three
   * above: the real hook calls `projectComposerCapabilities`, which a fake bypasses entirely.
   */
  useComposerCapabilities?: typeof useComposerCapabilities;
  /**
   * Injectable seam for the chat transport — see {@link useAssistantTransport}. Defaults to the
   * real hook (2026-08-18 inline-hook-extraction pass, same `INFO.md` rule-3 rationale as the four
   * above): the real hook calls `createTovuAssistantTransport`, whose `startRun` makes the actual
   * daemon network call, which a fake bypasses entirely.
   */
  useAssistantTransport?: typeof useAssistantTransport;
  /**
   * Injectable seam for the composer's attachment uploader — see {@link useAttachmentUploader}.
   * Defaults to the real hook, same 2026-08-18 rationale as `useAssistantTransport` above: the real
   * hook calls `createDaemonAttachmentUploader`, whose uploads are real `fetch`es to
   * `/api/attachments`, which a fake bypasses entirely.
   */
  useAttachmentUploader?: typeof useAttachmentUploader;
  /**
   * Injectable seam for the Local CLI picker's agent list/rescan/daemon-online poll — see
   * {@link useRuntimeAccess}. Defaults to the real hook, same 2026-08-18 rationale as the two
   * above: the real hook's `listAgents`/`rescanAgents`/`daemonOnline` are all `fetch`-backed, which
   * a fake bypasses entirely.
   */
  useRuntimeAccess?: typeof useRuntimeAccess;
}

/**
 * `agentBridge` is the one prop above not hook-shaped — a plain caller-supplied value, never a
 * resolve-then-call-a-hook seam — so it keeps its own tiny resolver here rather than moving to
 * `AssistantDock.hooks.tsx`'s seam layer. The other eight props' resolve-or-default logic lives in
 * that seam layer instead (`useChatsSeam`, `useExecutionConfigSeam`, `useByokRuntimeSeam`,
 * `useLocalCliSelectionSeam`, `useComposerCapabilitiesSeam`, `useAssistantTransportSeam`,
 * `useAttachmentUploaderSeam`, `useRuntimeAccessSeam` — see that file's own "Seam layer" doc for why
 * and for the ESLint cyclomatic-complexity reasoning this resolver still relies on: a `??` inside a
 * separately-scoped function does not count against `AssistantDock`'s own body, unlike the inline
 * `{ useClamp = useSeeMoreClamp }` idiom a single-seam component can afford.
 */
function resolveAgentBridge(override: FrontendSessionBridge | null | undefined): FrontendSessionBridge | null {
  return override ?? null;
}

/**
 * @complexity 6 cyclomatic / 2 cognitive (measured; ESLint's `complexity`/`sonarjs/cognitive-complexity`
 * rules, `npx eslint apps/admin/src/components/AssistantDock/AssistantDock.tsx` with both ceilings
 * temporarily set to 1 to read the exact counts). Was 5/2 after the 2026-08-14 resolver-idiom pass
 * (11/2 before it — see the resolver group's own doc comment) until the `chat.get_state`-hang fix
 * (2026-08-30) added one more flat `?.` on `<ChatPane agentControl={{ bridgeAccess:
 * agentBridge?.bridgeAccess }}>`. Still clears the ≤9/≤9 bar outright; no `admin-complexity-debt.json`
 * entry needed.
 *
 * The 6 is: base 1, plus 4 flat, sibling `?:`/`?.`/`??` expressions in the JSX below —
 * `executionMode={... ? "api" : "local"}`, the conditional `conversationId` spread, the
 * active-conversation-title `?.title ?? "Tovu assistant"` fallback (1 for the ternary, 1 for the
 * spread's own ternary, 1 for `?.` + 1 for `??` on the title fallback), and `agentControl`'s
 * `agentBridge?.bridgeAccess` — none of which wrap another, which is why cognitive stays at 2.
 */
/**
 * Destructured rather than read as `props.x` throughout the body — every seam below is passed
 * straight to its matching `useXSeam` (or, for `agentBridge`, to {@link resolveAgentBridge}), so
 * there is nothing left to gain from keeping a `props` object around. Renamed to `...Override`
 * where the prop name would otherwise collide with the imported real hook it defaults to (same
 * "rename the local binding, not the prop" rule `INFO.md`'s Components section states) — `useChats`
 * needs no rename since only its `Seam` counterpart, not the bare hook, is imported here.
 */
export function AssistantDock({
  agentBridge: agentBridgeProp,
  useChats,
  useAdminLocale,
  useExecutionConfig: useExecutionConfigOverride,
  useByokRuntime: useByokRuntimeOverride,
  useLocalCliSelection: useLocalCliSelectionOverride,
  useComposerCapabilities: useComposerCapabilitiesOverride,
  useAssistantTransport: useAssistantTransportOverride,
  useAttachmentUploader: useAttachmentUploaderOverride,
  useRuntimeAccess: useRuntimeAccessOverride,
}: AssistantDockProps) {
  const agentBridge = resolveAgentBridge(agentBridgeProp);
  // Translates this component's own pane chrome (eyebrow, title fallback, composer placeholder)
  // and — via `chatI18n` — the `ConversationList` switcher mounted in `header` below. See
  // {@link useAssistantDockChrome}'s own doc for why `locale`/`t`/`chatI18n` are one hook rather
  // than three separate calls.
  const { t, chatI18n } = useAssistantDockChrome(useAdminLocale);

  const { executionConfig, executionConfigRef, setExecutionConfig, handleExecutionModeChange, hasStoredAdminKey, configLoaded } = useExecutionConfigSeam(useExecutionConfigOverride);
  const { byokRuntime, handleByokModelChange } = useByokRuntimeSeam(useByokRuntimeOverride, { executionConfig, setExecutionConfig });
  const { localCliSelection, handleLocalCliSelectionChange } = useLocalCliSelectionSeam(useLocalCliSelectionOverride, {
    executionConfig,
    setExecutionConfig,
    configLoaded,
  });

  // Resolved BEFORE the transport, which now takes `chats.ensureConversationId`: turn 1's run must
  // be able to adopt this pane's conversation before it is dispatched, because the lazy adoption
  // driven by `onMessagesChange` starts too late for the run to carry the id. See
  // `CreateTovuAssistantTransportOptions.ensureConversationId` for the full mechanism.
  const chats = useChatsSeam(useChats);
  const transport = useAssistantTransportSeam(useAssistantTransportOverride, {
    executionConfigRef,
    ensureConversationId: chats.ensureConversationId,
  });
  const uploadAttachments = useAttachmentUploaderSeam(useAttachmentUploaderOverride);
  const runtimeAccess = useRuntimeAccessSeam(useRuntimeAccessOverride);
  /**
   * The composer's discovery catalog, projected asynchronously (debate 2, "Composer slash
   * commands") — replaces the pre-2026-08-12 static `TOVU_COMPOSER_DISCOVERY_GROUPS` import. See
   * `useComposerCapabilities`'s own doc (`AssistantDock.hooks.tsx`) for why it starts empty and how
   * a failed projection degrades.
   */
  const { composerCapabilities } = useComposerCapabilitiesSeam(useComposerCapabilitiesOverride);
  /**
   * The composer's pinned-Agent-Plugin chips (2026-08-21) — see {@link useSelectedAgentPlugins}'s
   * own doc for why this is host state rather than part of `@jini-ai/chat`'s own composer state,
   * and `SelectedAgentPluginTray`'s doc for how it renders.
   */
  const { selectedPluginRefIds, addPluginRef, removePluginRef } = useSelectedAgentPlugins();
  const handleComposerDiscoverySelect = useComposerDiscoverySelect({
    composerCapabilities,
    callAllowlistedTool: mcpUiToolCaller,
    addPluginRef,
  });
  // See `useSelectedPluginChips`'s own doc for the projection and its label-fallback reasoning.
  const selectedPluginChips = useSelectedPluginChips(selectedPluginRefIds, composerCapabilities);

  /**
   * Owns the `ChatPaneComposerHandle` a voice transcript is delivered through. No Jini change was
   * needed: `composerHandle` and its append-don't-replace `insertText` already existed — see
   * `use-composer-voice-input.hooks.ts`.
   */
  const voiceInput = useComposerVoiceInput();

  const handleMessagesChange = useMessagesChangeHandler({ chats });
  const runContext = useRunContext({
    agentBridge,
    model: localCliSelection.model,
    // The Execution tab owns the "Reasoning effort" control, so this comes from the persisted
    // ledger rather than from the dock's own picker (which has no effort axis). Reading it here is
    // what turns a stored level into real CLI argv — see `useRunContext`'s own doc.
    reasoning: selectedLocalCliReasoning(executionConfig),
    pluginRefIds: selectedPluginRefIds,
    // Same id already passed to `<ChatPane conversationId={...}>` below — see `useRunContext`'s
    // own doc for why the daemon needs it too (per-conversation agent-CLI session resume).
    conversationId: chats.activeId,
  });

  return (
    <JiniChatProvider transport={transport} i18n={chatI18n}>
      {/* ChatPane takes `transport` directly as well as via the provider — the package's
          components read their dependencies from props, not implicitly from context. */}
      <ChatPane
        // Remounts the pane on a conversation switch. `ChatPane` owns its transcript and takes
        // `initialMessages` only at mount, so re-keying is how a different conversation's history
        // gets in — pushing new messages into a live pane would fight its own state.
        key={chats.paneKey}
        transport={transport}
        runtimeAccess={runtimeAccess}
        // Fully controlled (`selection`/`onSelectionChange`), not `initialSelection` — see
        // `useLocalCliSelection`'s own doc for why an uncontrolled prop can't be hydrated from
        // the ledger's async load. `useLocalCliSelection` starts at the same `{agentId: "claude"}`
        // this literal used to hardcode, then hydrates once the ledger settles.
        selection={localCliSelection}
        onSelectionChange={handleLocalCliSelectionChange}
        {...(chats.activeId ? { conversationId: chats.activeId } : {})}
        initialMessages={chats.initialMessages}
        // The Local CLI / API · BYOK row (`AgentRuntimePicker`, `@jini-ai/chat`) — previously
        // hardcoded to `executionMode: 'local'` / `apiModeAvailable: false` (never passed at all),
        // which made "API · BYOK" permanently disabled with a "not configured" label that was
        // literally true: nothing wired it. `apiModeAvailable` is now a real fact — not a hardcoded
        // default — and selecting the row genuinely changes where a message goes
        // (`assistant-transport.ts`'s `startRun` branches on this same `executionConfig`).
        //
        // `hasUsableAdminKey`, not `executionConfig.byok.apiKey.trim().length > 0` alone (2026-08-05):
        // the admin's own BYOK credential is encrypted server-side and write-only now
        // (`execution-settings.ts`'s header), so `byok.apiKey` is empty on every fresh load even
        // when a credential IS stored — gating on it alone would make this row permanently disabled
        // for exactly the case the server-side store exists to support. `hasStoredAdminKey` is
        // `null` until its own GET settles, which `hasUsableAdminKey` treats as "nothing confirmed
        // stored yet" (same as `false`) — a brief false-negative on first paint, never a
        // false-positive, and it corrects itself the moment the GET resolves.
        executionMode={executionConfig.mode === "byok" ? "api" : "local"}
        apiModeAvailable={hasUsableAdminKey(executionConfig.byok.apiKey, { isSet: hasStoredAdminKey === true })}
        onExecutionModeChange={handleExecutionModeChange}
        // What the picker names as the runtime while BYOK is the active mode. Without it the
        // popover described the DETECTED CLI in both modes — an agent list with one row marked
        // "selected", a model reading "Default (CLI config)", and a Rescan PATH button — none of
        // which has any bearing on an API turn, and all of which named the wrong provider. The
        // model is the one `assistant-transport.ts` will actually send (`byok.model`), read from
        // the same config object that decides the branch, so the two cannot disagree.
        byokRuntime={byokRuntime}
        onByokModelChange={handleByokModelChange}
        /**
         * Replaces `ChatPane`'s default header, which is not merely a styling preference.
         *
         * That default ships a "New thread" button wired to the pane's own `onReset`, which
         * clears the local transcript and nothing else. With durable history that is actively
         * wrong: the pane would empty while `activeId` still pointed at the previous
         * conversation, so the next message would silently append to the chat the user thought
         * they had just left. `chats.create` makes a real conversation row and switches to it.
         *
         * The switcher belongs here rather than in `leadingAccessory` for the same reason — that
         * slot sits above the composer, so the dropdown opened over the input instead of below
         * the title where a history control is looked for.
         */
        header={
          <div className="jini-chat-pane__header">
            <div className="jini-chat-pane__heading">
              <span className="jini-chat-pane__eyebrow">{t("Workspace chat")}</span>
              {/* Was an `<h1>` — the dock mounts on every route (ADR-049, one conversation for
                  the whole session), so every admin screen had two `<h1>`s: its own page title
                  and this one, with no signal to a screen-reader user navigating by heading which
                  was the real page title. `<h2>` inside this `aria-label="Assistant"` complementary
                  region (see `App.tsx`'s `<aside>`) reads correctly as a subsection heading
                  instead of competing with the page's own `<h1>`. Class names, not the element
                  type, drive this component's styling (`styles/assistant.css`), so the tag change
                  is visually inert. */}
              <h2 className="jini-chat-pane__title">
                {chats.conversations.find((c) => c.id === chats.activeId)?.title ?? t("Tovu assistant")}
              </h2>
            </div>
            <ConversationList
              conversations={chats.conversations}
              activeConversationId={chats.activeId}
              onSelect={chats.select}
              onCreate={chats.create}
              onDelete={chats.remove}
              onRename={chats.rename}
            />
          </div>
        }
        title={t("Tovu assistant")}
        placeholder={t("Ask the assistant to do something…")}
        onMessagesChange={handleMessagesChange}
        runContext={runContext}
        // Wires the daemon-relayed `chat.*` capability channel to THIS live pane instance — see
        // `useChatPaneAgentControl`'s own doc in `@jini-ai/chat/react` for the handler side. Without
        // this, `chat.*` (`chat.get_state`, `chat.send_message`, …) is still claimed at attach time
        // (`createFrontendSessionBridge`'s `claimedCapabilities` claims all of `CHAT_CAPABILITIES`
        // unconditionally, unlike `page.*`, which is gated on `pageDriver`), so the daemon happily
        // delivers a `chat.*` invocation here — but with no `subscribe`r, the browser's own dispatch
        // (`frontend-session-bridge.ts`'s `chatListeners` loop) silently drops it, and the call parks
        // until `ToolExecutor`'s 30s `descriptor.timeoutMs` reports it `timed-out` with no real error
        // anywhere. `enabled: true` is safe even before the tab attaches — `bridgeAccess` is only
        // `agentBridge?.bridgeAccess`, `undefined` until `useAgentPageBridge`'s effect runs, and
        // `useChatPaneAgentControl` is a no-op when `bridgeAccess` is absent. `webmcp` stays
        // unset (off): this only wires the already-`ToolExecutor`-gated daemon-relayed channel, not
        // the ungated in-page WebMCP surface — see that option's own doc for why that stays opt-in.
        agentControl={{ enabled: true, bridgeAccess: agentBridge?.bridgeAccess }}
        uploadAttachments={uploadAttachments}
        // Host-owned, data-only inventory, now an async projection (debate 2) instead of a static
        // import. Jini renders/filter/selects it generically; these rows describe source-backed
        // resources and do not claim that Agent Plugin installation or execution exists. The same
        // catalog drives the grouped plus menu and `/` autocomplete.
        composerSlots={{
          discoveryGroups: composerCapabilities.groups,
          onDiscoverySelect: handleComposerDiscoverySelect,
          // Renders next to the composer's "+" trigger in the footer action row, not above the
          // input — owner report: the mic previously rode `leadingAccessory` below (the pinned-
          // context zone) and read as a stray circular badge half-overlapping the input's top
          // edge. `footerLeadingAccessory` (`@jini-ai/chat` 2026-09-06) is a new footer-row slot
          // added for exactly this: unlike `footerAccessories` (reserved for `AgentRuntimePicker`,
          // pushed to the row's far end) or `plusMenuItems` (plain click-to-select buttons, no room
          // for this button's press-and-hold/recording-indicator UI), it renders host content
          // immediately after the attach/discovery button with no change to the button itself.
          footerLeadingAccessory: <PushToTalkMicButton onTranscript={voiceInput.insertTranscript} />,
        }}
        // Renders the pinned-plugin chip tray above the composer's textarea. NOT passed inside
        // `composerSlots` above — verified live (2026-08-21) that `ChatPane`'s own
        // `Composer`-slot assembly unconditionally sets `leadingAccessories: leadingAccessory`
        // (this prop), discarding whatever `composerSlots.leadingAccessories` holds even when
        // this prop is omitted (`ChatPane.tsx`'s `slots` object, `{ ...composerSlots,
        // leadingAccessories: leadingAccessory, ... }`) — a `composerSlots.leadingAccessories`
        // value never reaches `Composer` at all through this component. `footerAccessories` is
        // correctly excluded from `ChatPaneProps.composerSlots`'s type for the same reason (it
        // is reserved for `AgentRuntimePicker`); `leadingAccessories` is not excluded from that
        // type, which is what made this reachable — an existing gap in Jini's own contract, not
        // something introduced here. Using this top-level prop instead (unused by this component
        // until now) avoids the gap entirely, with no change to Jini's package needed.
        // `null` when nothing is pinned (`SelectedAgentPluginTray`'s own early return).
        //
        // `FsFolderIndicator` used to render here, above the plugin chips, as an always-visible
        // "No folder set" control. Unpinned 2026-09-10 on the owner's call: a persistent chip for a
        // capability most sessions never use is clutter on the one surface that must stay quiet.
        // ONLY the mount is removed — the component, its route, and the `custom` fs root all still
        // work (`features/fs-files/`), so restoring this is re-adding the element, nothing more.
        leadingAccessory={<SelectedAgentPluginTray chips={selectedPluginChips} onRemove={removePluginRef} />}
        // Populated by `ChatPane` itself on mount; `PushToTalkMicButton`'s transcript is written
        // through it. Append-only by contract, so a transcript can never clobber a half-written
        // message — see `use-composer-voice-input.hooks.ts`.
        composerHandle={voiceInput.composerHandle}
        // No `attachmentAccept` on purpose: the upload path is kind-agnostic end to end, so a
        // type filter here has no security or correctness payoff, only friction. `attachments.ts`
        // (`@jini-ai/http-kit`) sniffs `detectAttachmentKind` from the leading bytes and stores
        // `'image' | 'file'` — it never rejects on MIME or extension. And an `accept` filter never
        // applies to drag-and-drop in any browser, so a picker restriction here would only ever
        // block the cooperative "+" button while the drop zone stayed wide open; it was previously
        // `"image/*"` and that is exactly what happened — a `.md` drag-drop already worked while
        // the same file was greyed out in the OS dialog. `extraAllowedDirs` gives the agent
        // filesystem read access to every claimed attachment regardless of kind, so there's no
        // pipeline-side restriction downstream to match either. `agent-daemon-server.ts` used to
        // drop non-image attachments from `imagePaths` before handing them to the agent, which
        // would have made a widened picker here pointless; that filter is gone (see
        // `resolveAttachmentRunFields`' own comment and
        // `__tests__/agent-daemon-server.attachment-kind-filter.unit.test.ts`), so every claimed
        // attachment is now named to the agent regardless of kind. What remains is cosmetic: the
        // `imagePaths` option name and Jini's `image-prompt-delivery.ts` prompt copy still say
        // "image" for what may be any file — a recorded Jini-side follow-up, not a gap a picker
        // filter could fix anyway.
        // No working-directory control renders in the web admin: a browser directory picker can
        // only ever yield a folder NAME (browsers withhold the real path from a picked
        // `FileSystemDirectoryHandle`), never a path the daemon's real `cwd`
        // (`agent-daemon-server.ts`'s `process.env.TOVU_AGENT_CWD ?? process.cwd()`) could use — so
        // a picker here would only ever re-label the chat, not move the agent. The real feature
        // belongs to Tovu-Runner (the Electron app), which has an actual filesystem.
        workingDirectoryControlPlacement="none"
        // suggestions={[
        //   "Summarise what content types this site defines.",
        //   "List the agent-callable tools and the permission each one needs.",
        //   "Which admin sections exist, and what does each one manage?",
        // ]}
      />
    </JiniChatProvider>
  );
}
