import { useMemo, useState } from "react";
import { ChatFab, ChatPane, JiniChatProvider } from "@jini-ai/chat/react";

import { createSiteAssistantTransport } from "./site-assistant-transport";

/**
 * @file The whole public-site chat widget (ADR-054 Task 2) — a floating action button that opens
 * `@jini-ai/chat/react`'s own `ChatPane`, unmodified, against the public site-assistant transport.
 *
 * Mirrors `apps/admin/src/components/AssistantDock.tsx`'s shape in exactly one respect worth naming:
 * the pane is toggled with `hidden`, never a conditional `{open && <ChatPane/>}`, so a visitor who
 * closes the panel and reopens it lands back in the same conversation instead of losing it. Every
 * other admin-dock concern (attachments, working directory, agent picker, conversation history,
 * MCP-UI tool confirmation) does not exist here — the public assistant is read-only over published
 * content with a single fixed backend (ADR-054 Decision 1/2), so `ChatPane` is given nothing beyond
 * `transport` plus display copy.
 */
export function SiteAssistantWidget() {
  const [open, setOpen] = useState(false);
  // Stable across renders for the same reason `AssistantDock`'s transport is memoized: rebuilding
  // it would drop any run this widget has in flight.
  const transport = useMemo(() => createSiteAssistantTransport(), []);

  return (
    <div className="tovu-site-assistant">
      <ChatFab open={open} onToggle={() => setOpen((current) => !current)} label="chat with this site" />
      <JiniChatProvider transport={transport}>
        <div className="tovu-site-assistant__panel" hidden={!open}>
          <ChatPane
            transport={transport}
            title="Ask this site"
            placeholder="Ask about this site's posts and pages…"
            suggestions={["What is this site about?", "What have you published recently?"]}
          />
        </div>
      </JiniChatProvider>
    </div>
  );
}
