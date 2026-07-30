import { useCallback } from "react";
import { useMemo } from "react";
import { ChatPane, JiniChatProvider, type ChatPaneAgent } from "@jini-ai/chat-react";
import type { ChatMessage } from "@jini-ai/chat-core";

import { createTovuAssistantTransport } from "../lib/assistant-transport";
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
 * right, not a routed `#/section/assistant` page. Mounted once in `App.tsx`, outside the routed
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
 * `chat-react` ships no CSS despite emitting BEM-style `jini-*` class names, so
 * `styles/assistant.css` supplies them. Without it the pane renders as unstyled block elements.
 */

const AGENTS_URL = "/api/agents";

async function fetchAgents(): Promise<ChatPaneAgent[]> {
  const response = await fetch(AGENTS_URL, { credentials: "same-origin" });
  if (!response.ok) return [];
  const { agents } = (await response.json()) as { agents: ChatPaneAgent[] };
  return agents;
}

export function AssistantDock() {
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
  const handleMessagesChange = useCallback((messages: ChatMessage[]) => {
    window.__tovuAssistantMessages = messages;
  }, []);

  return (
    <JiniChatProvider transport={transport}>
      {/* ChatPane takes `transport` directly as well as via the provider — the package's
          components read their dependencies from props, not implicitly from context. */}
      <ChatPane
        transport={transport}
        runtimeAccess={runtimeAccess}
        initialSelection={{ agentId: "claude" }}
        title="Tovu assistant"
        placeholder="Ask the assistant to do something…"
        onMessagesChange={handleMessagesChange}
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
