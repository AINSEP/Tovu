import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  A2uiSurfaceCard,
  ChatPane,
  ConversationList,
  JiniChatProvider,
  createDaemonAttachmentUploader,
  createMcpUiToolCaller,
  registerExtEventRenderer,
  registerMcpUiSurfaceRenderer,
  type ChatPaneAgent,
  type FrontendSessionBridge,
} from "@jini-ai/chat/react";
import type { ChatMessage } from "@jini-ai/chat/core";

import { createA2uiActionPoster } from "../../lib/a2ui-action-poster";
import { createTovuAssistantTransport } from "../../lib/assistant-transport";
import { publishSettingsRefresh } from "../../lib/settings-refresh-bus";
import { hasUsableAdminKey } from "../../lib/execution-settings";
import { useWiredAssistantChats, type UseAssistantChats } from "../../hooks/use-assistant-chats.hooks";
import "../../styles/assistant.css";
// The runtime picker's BYOK model row renders `@jini-ai/ui`'s `SearchableModelSelect`, whose
// styles (including the body-portaled `.jini-select-menu`) live in this sheet. The settings
// screens import it too, but the dock is mounted on every admin route — relying on a screen the
// operator may never open would leave the dropdown unstyled exactly when it is used most.
import "@jini-ai/ui/settings-dialog.css";
import {
  resolveRunContext,
  shouldPublishOnMessagesChange,
  useByokRuntime,
  useExecutionConfig,
  useLocalCliSelection,
} from "./AssistantDock.hooks";

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
 */
registerMcpUiSurfaceRenderer({
  onToolCall: createMcpUiToolCaller("", { path: "/api/admin/v1/mcp-ui/tool-calls" }),
});

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
 */
const postA2uiAction = createA2uiActionPoster("", { path: "/api/admin/v1/a2ui/actions" });
registerExtEventRenderer("a2ui", (props) => <A2uiSurfaceCard {...props} onAgentAction={postA2uiAction} />);

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
 * `uploadAttachments`/`attachmentAccept` below wire the composer's existing (host-agnostic,
 * `@jini-ai/chat/react`-native) drag-and-drop and file-picker mechanism to this daemon's own
 * `/api/attachments` route — see that route's registration in `src/assistant/agent-daemon-server.ts`
 * and its proxy pass-through in `src/server/modules/assistant.ts` for the rest of the chain
 * (`onStarted` claims the upload and hands the daemon's `AgentExecutor.run()` real `imagePaths`).
 *
 * `styles/assistant.css` themes the pane. Note that the package does NOT ship zero CSS, contrary to
 * what this comment used to claim: `ChatPane` injects its own complete default theme as a `<style>`
 * tag at mount, appended last in the cascade. Host overrides therefore need either the
 * `--jini-chat-*` custom-property seam or a descendant selector — a flat `.jini-*` rule in
 * `assistant.css` loses even at equal specificity. See that file's header for the full account.
 *
 * The runtime-picker state (`useExecutionConfig`, `useByokRuntime`, `useLocalCliSelection`) and the
 * two pure decision helpers this component calls (`shouldPublishOnMessagesChange`,
 * `resolveRunContext`) live in `AssistantDock.hooks.tsx` — see that file's own header for why they
 * are split out. This file stays the render layer: it wires their return values onto `<ChatPane>`'s
 * props and owns only the JSX-adjacent state (`transport`, `uploadAttachments`, `runtimeAccess`,
 * `handleMessagesChange`, `runContext`) that has no independent failure path worth testing in
 * isolation.
 */

const AGENTS_URL = "/api/agents";

async function fetchAgents(): Promise<ChatPaneAgent[]> {
  const response = await fetch(AGENTS_URL, { credentials: "same-origin" });
  if (!response.ok) return [];
  const { agents } = (await response.json()) as { agents: ChatPaneAgent[] };
  return agents;
}

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
}

/**
 * @complexity 10 cyclomatic / 2 cognitive (measured, complexity-ceiling pass). Exempted from the
 * ≤9/≤9 bar rather than refactored — this is the flat-fallback-chain shape already exempted
 * elsewhere in this codebase (`PostEditor.tsx:27` at 27/0, `SeoEntryPanel` at 25/6): cyclomatic
 * inflated by independent, unnested decision points, cognitive near zero because none of them
 * nest.
 *
 * The 10 breaks down as: 5 destructured default parameters (`agentBridge`, `useChats`,
 * `useExecutionConfig`, `useByokRuntime`, `useLocalCliSelection`) — the injectable-hook DI seam
 * `apps/admin/INFO.md` §Components rule 3 requires for every hook doing DOM/IO work, not optional
 * structure this component chose — plus 3 flat, sibling `?:`/`?.`/`??` expressions in the JSX
 * below: `executionMode={... ? "api" : "local"}`, the conditional `conversationId` spread, and the
 * active-conversation-title `?.title ?? "Tovu assistant"` fallback. 5 + 1 + 1 + (1 for `?.` + 1
 * for `??`) = 10; none of the four wrap another, which is why cognitive stays at 2.
 *
 * Tried: extracting the title fallback (`chats.conversations.find(...)?.title ?? "..."`) to a
 * top-level function would shave 2 points and clear ≤9 on its own — but doing that to one of the
 * four flat expressions while leaving the other three in place is an arbitrary, metric-driven
 * split of an equally trivial single-line derived value, not a real reduction in what a reader has
 * to hold in their head (cognitive complexity is unchanged either way). Removing the DI-seam
 * default parameters themselves is not an option: they are the testability contract every other
 * component in this codebase depends on, not incidental complexity.
 */
export function AssistantDock({
  agentBridge = null,
  useChats = useWiredAssistantChats,
  useExecutionConfig: useExecutionConfigState = useExecutionConfig,
  useByokRuntime: useByokRuntimeState = useByokRuntime,
  useLocalCliSelection: useLocalCliSelectionState = useLocalCliSelection,
}: AssistantDockProps) {
  const { executionConfig, executionConfigRef, setExecutionConfig, handleExecutionModeChange, hasStoredAdminKey, configLoaded } = useExecutionConfigState();
  const { byokRuntime, handleByokModelChange } = useByokRuntimeState({ executionConfig, setExecutionConfig });
  const { localCliSelection, handleLocalCliSelectionChange } = useLocalCliSelectionState({
    executionConfig,
    setExecutionConfig,
    configLoaded,
  });

  // The transport holds no per-render state; rebuilding it each render would drop in-flight runs.
  const transport = useMemo(
    () => createTovuAssistantTransport({ getExecutionConfig: () => executionConfigRef.current }),
    [],
  );
  /**
   * `''` baseUrl: `createDaemonAttachmentUploader` builds `${baseUrl}/api/attachments`, so an
   * empty string resolves to the same bare `/api/attachments` relative path `AGENTS_URL`/`RUNS_URL`
   * already use — same-origin, proxied by `src/server/modules/assistant.ts` to the agent daemon,
   * matching every other request this dock makes. Memoized for the same reason `transport` is: it
   * owns internal per-uploader batch-quota state (`create-daemon-attachment-uploader.ts`'s
   * `batchUsage` map), so rebuilding it on every render would silently reset a turn's running quota
   * mid-upload.
   */
  const uploadAttachments = useMemo(() => createDaemonAttachmentUploader(""), []);
  const runtimeAccess = useMemo(
    () => ({
      listAgents: fetchAgents,
      rescanAgents: async () => {
        const response = await fetch(`${AGENTS_URL}/rescan`, { method: "POST", credentials: "same-origin" });
        if (!response.ok) return fetchAgents();
        const { agents } = (await response.json()) as { agents: ChatPaneAgent[] };
        return agents;
      },
      daemonOnline: async () => {
        const response = await fetch(AGENTS_URL, { credentials: "same-origin" });
        return response.ok;
      },
    }),
    [],
  );
  const chats = useChats();

  /**
   * Last assistant message id seen in a terminal state, so a run's completion fires the settings
   * refresh below exactly once. `onMessagesChange` runs on every delta of a streaming reply, and
   * the terminal message keeps arriving in later calls after it settles.
   */
  const settledRunMessageId = useRef<string | null>(null);

  const handleMessagesChange = useCallback(
    (messages: ChatMessage[]) => {
      window.__tovuAssistantMessages = messages;
      // Persistence is selective, not per-delta — see `lib/assistant-chats.ts`'s
      // `persistableMessages` for why a streaming reply is written once rather than per token.
      chats.onMessagesChange(messages);

      /**
       * A finished run may have written a setting — `settings_set_ui_preference` is agent-callable
       * — so the mounted settings tabs re-read. Without this the write lands in `content.db` and
       * the open tab keeps rendering the value it fetched at mount, which reads as the tool having
       * silently done nothing.
       *
       * Deliberately triggered by RUN COMPLETION rather than by inspecting the transcript for a
       * settings tool call. Matching tool names here would put a list of them in the admin shell,
       * where it would fall out of date the first time the catalog grows — and the whole cost of
       * being wrong is a few sub-millisecond SQLite reads per run. Ignorance is cheaper than
       * coupling.
       *
       * `undefined` scope (rather than a namespace list) for the same reason: this publisher does
       * not know what changed, and saying so is more honest than guessing.
       */
      const { publish, nextSettledRunMessageId } = shouldPublishOnMessagesChange({
        messages,
        settledRunMessageId: settledRunMessageId.current,
      });
      settledRunMessageId.current = nextSettledRunMessageId;
      if (publish) publishSettingsRefresh();
    },
    [chats],
  );

  /**
   * Tells the daemon which tab this run is allowed to drive, so `page.navigate` and friends have
   * an addressee. `assistant-transport.ts` reads `frontendBindToken` out of this and puts it in
   * the run's `contextRef`.
   *
   * A function, and the token read *inside* it, because `EventSource` reconnects on its own — a
   * daemon restart, a sleeping laptop, an ordinary blip — and every reattach mints a new session
   * and a new token. Capturing the value once would keep sending a dead one, and the only symptom
   * would be the agent being told "no frontend is bound to this run" on every page call, long
   * after the reconnect that caused it.
   *
   * Depends on `agentBridge` identity rather than reading a ref: the bridge object is stable for
   * the tab's lifetime, so this rebuilds only when page control genuinely appears or goes away.
   * Also depends on `localCliSelection.model` (not the whole `localCliSelection` object, which
   * would rebuild on every keystroke-equivalent picker interaction that leaves the model alone)
   * so a run started right after a model pick carries it — `useLocalCliSelection` owns the
   * picker's live value, and this is the one place that value needs to leave React state.
   */
  const runContext = useMemo(
    () => () => resolveRunContext({ bindToken: agentBridge?.bindToken(), model: localCliSelection.model }),
    [agentBridge, localCliSelection.model],
  );

  return (
    <JiniChatProvider transport={transport}>
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
              <span className="jini-chat-pane__eyebrow">Workspace chat</span>
              {/* Was an `<h1>` — the dock mounts on every route (ADR-049, one conversation for
                  the whole session), so every admin screen had two `<h1>`s: its own page title
                  and this one, with no signal to a screen-reader user navigating by heading which
                  was the real page title. `<h2>` inside this `aria-label="Assistant"` complementary
                  region (see `App.tsx`'s `<aside>`) reads correctly as a subsection heading
                  instead of competing with the page's own `<h1>`. Class names, not the element
                  type, drive this component's styling (`styles/assistant.css`), so the tag change
                  is visually inert. */}
              <h2 className="jini-chat-pane__title">
                {chats.conversations.find((c) => c.id === chats.activeId)?.title ?? "Tovu assistant"}
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
        title="Tovu assistant"
        placeholder="Ask the assistant to do something…"
        onMessagesChange={handleMessagesChange}
        runContext={runContext}
        uploadAttachments={uploadAttachments}
        // Restricts the composer's file picker to image MIME types. Not a security boundary —
        // `detectAttachmentKind` sniffs magic bytes server-side regardless of what a renamed file
        // or a drag-drop bypassing this filter claims to be (see `attachments.ts`) — this only
        // keeps the picker's own dialog from offering non-image files the daemon-side pipeline
        // isn't built to do anything useful with yet.
        attachmentAccept="image/*"
        // Purely a label — `workingDirectoryAccess` (native folder picker) is intentionally
        // omitted, and the daemon's real `cwd` (`agent-daemon-server.ts`'s
        // `process.env.TOVU_AGENT_CWD ?? process.cwd()`) isn't round-tripped back to the client
        // today, so this can't reflect that exact value; it's not load-bearing for execution
        // either way (confirmed: `cwd` is resolved daemon-side per run, never from this prop).
        // Matches Jini's own reference app's approach — a static, host-chosen label.
        initialWorkingDirectory="Tovu"
        // suggestions={[
        //   "Summarise what content types this site defines.",
        //   "List the agent-callable tools and the permission each one needs.",
        //   "Which admin sections exist, and what does each one manage?",
        // ]}
      />
    </JiniChatProvider>
  );
}
