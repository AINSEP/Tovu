import { useCallback } from "react";
import { useMemo } from "react";
import {
  ChatPane,
  ConversationList,
  JiniChatProvider,
  type ChatPaneAgent,
  type FrontendSessionBridge,
} from "@jini-ai/ui/chat";
import type { ChatMessage } from "@jini-ai/chat-core";

import { createTovuAssistantTransport } from "../lib/assistant-transport";
import { useWiredAssistantChats, type UseAssistantChats } from "../hooks/use-assistant-chats.hooks";
import "../styles/assistant.css";

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
 * Hosts `@jini-ai/chat-react`'s `<ChatPane>` against Tovu's own `@jini-ai/core`+`@jini-ai/daemon`
 * kernel (`src/assistant/kernel.ts`, mounted by `src/server/modules/assistant.ts`). Tool execution
 * is not a prop here — it happens server-side: the spawned coding-agent CLI gets
 * `.mcp.json`-injected access to Tovu's registered tools (`src/assistant/tool-registrations.ts`)
 * and calls them through the daemon's `/api/delegated-tool-calls` gate, which shows up in this
 * same transcript as ordinary `tool_use`/`tool_result` events — `ChatPane` renders those itself.
 *
 * `styles/assistant.css` themes the pane. Note that the package does NOT ship zero CSS, contrary to
 * what this comment used to claim: `ChatPane` injects its own complete default theme as a `<style>`
 * tag at mount, appended last in the cascade. Host overrides therefore need either the
 * `--jini-chat-*` custom-property seam or a descendant selector — a flat `.jini-*` rule in
 * `assistant.css` loses even at equal specificity. See that file's header for the full account.
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
}

export function AssistantDock({ agentBridge = null, useChats = useWiredAssistantChats }: AssistantDockProps) {
  // The transport holds no per-render state; rebuilding it each render would drop in-flight runs.
  const transport = useMemo(() => createTovuAssistantTransport(), []);
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
  const handleMessagesChange = useCallback(
    (messages: ChatMessage[]) => {
      window.__tovuAssistantMessages = messages;
      // Persistence is selective, not per-delta — see `lib/assistant-chats.ts`'s
      // `persistableMessages` for why a streaming reply is written once rather than per token.
      chats.onMessagesChange(messages);
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
   */
  const runContext = useMemo(
    () => () => {
      const bindToken = agentBridge?.bindToken();
      return bindToken === undefined ? {} : { frontendBindToken: bindToken };
    },
    [agentBridge],
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
        initialSelection={{ agentId: "claude" }}
        {...(chats.activeId ? { conversationId: chats.activeId } : {})}
        initialMessages={chats.initialMessages}
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
              <h1 className="jini-chat-pane__title">
                {chats.conversations.find((c) => c.id === chats.activeId)?.title ?? "Tovu assistant"}
              </h1>
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
