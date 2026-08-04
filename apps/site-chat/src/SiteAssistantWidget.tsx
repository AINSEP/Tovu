import { useCallback, useMemo, useState } from "react";
import { ChatFab, ChatPane, JiniChatProvider, type ChatPaneAgent } from "@jini-ai/chat/react";
import type { ChatMessage } from "@jini-ai/chat/core";

import { SiteAssistantHeader } from "./SiteAssistantHeader";
import { createSiteAssistantTransport } from "./site-assistant-transport";

/**
 * @file The whole public-site chat widget (ADR-054 Task 2) — a floating action button that opens
 * `@jini-ai/chat/react`'s own `ChatPane`, unmodified, against the public site-assistant transport.
 *
 * Mirrors `apps/admin/src/components/AssistantDock.tsx`'s shape in exactly one respect worth naming:
 * the pane is toggled with `hidden`, never a conditional `{open && <ChatPane/>}`, so a visitor who
 * closes the panel and reopens it lands back in the same conversation instead of losing it. Every
 * other admin-dock concern (attachments, working directory, conversation history, MCP-UI tool
 * confirmation) does not exist here — the public assistant is read-only over published content with
 * a single fixed backend (ADR-054 Decision 1/2).
 *
 * `agents`/`initialSelection` ARE still required, though, and that is worth stating because a first
 * pass here shipped without them and it was visibly broken: measured live via Playwright, `ChatPane`
 * ships built for a world with a real agent-CLI picker (`AssistantDock.tsx`'s `runtimeAccess` +
 * `/api/agents`), and with no `agents` list at all `pane.selectedAgent` never resolves — the pane
 * renders a permanent "No usable CLI is selected." banner and disables the composer
 * (`ChatPane.tsx`'s `unavailable = pane.selectedAgent === undefined`, threaded into the send
 * button's `disabled`). There is no real picker to show here — one fixed backend, no runtime choice
 * — so this supplies exactly one static entry and pre-selects it, which is what makes the CLI
 * concept disappear from the UI entirely rather than showing a one-item picker for a choice that
 * does not exist.
 *
 * `header`/`onMessagesChange`/`key` are the other exception to "nothing beyond transport plus
 * display copy": `ChatPane`'s default header wires "New thread" straight to a silent, unconfirmed
 * reset, which would let one stray click discard a visitor's whole conversation with no undo — see
 * `SiteAssistantHeader.tsx` for the confirm step this replaces it with, over the same public `header`
 * seam `ChatPane` exposes for exactly this.
 */
const SITE_ASSISTANT_AGENT: ChatPaneAgent = { id: "site-assistant", name: "Site Assistant", available: true };

const PANE_TITLE = "Ask this site";

export function SiteAssistantWidget() {
  const [open, setOpen] = useState(false);
  // Stable across renders for the same reason `AssistantDock`'s transport is memoized: rebuilding
  // it would drop any run this widget has in flight.
  const transport = useMemo(() => createSiteAssistantTransport(), []);

  // `ChatPane` owns its transcript internally and only takes `initialMessages` at mount — the same
  // constraint `AssistantDock.tsx`'s conversation switcher documents (`key={chats.paneKey}`). There
  // is no `pane.reset()` reachable from a custom `header`, since `header` is a plain `ReactNode`, not
  // a render-prop — so "New thread" here works the identical way a conversation switch does there: a
  // fresh `key` forces a full remount, which is a genuinely empty `ChatPane` instance, not a call
  // into the package's internals. This is composition, not a fork.
  const [paneKey, setPaneKey] = useState(0);
  const [hasMessages, setHasMessages] = useState(false);

  const resetConversation = useCallback(() => {
    setPaneKey((key) => key + 1);
    setHasMessages(false);
  }, []);

  const handleMessagesChange = useCallback((messages: ChatMessage[]) => {
    setHasMessages(messages.length > 0);
  }, []);

  return (
    <div className="tovu-site-assistant">
      <ChatFab open={open} onToggle={() => setOpen((current) => !current)} label="chat with this site" />
      <JiniChatProvider transport={transport}>
        <div className="tovu-site-assistant__panel" hidden={!open}>
          <ChatPane
            key={paneKey}
            transport={transport}
            agents={[SITE_ASSISTANT_AGENT]}
            initialSelection={{ agentId: SITE_ASSISTANT_AGENT.id }}
            title={PANE_TITLE}
            header={<SiteAssistantHeader title={PANE_TITLE} hasMessages={hasMessages} onReset={resetConversation} />}
            placeholder="Ask about this site's posts and pages…"
            suggestions={["What is this site about?", "What have you published recently?"]}
            onMessagesChange={handleMessagesChange}
          />
        </div>
      </JiniChatProvider>
    </div>
  );
}
