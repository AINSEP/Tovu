import { useSiteAssistantWidget } from "./SiteAssistantWidget.hooks";
import { ChatFab, ChatPane, JiniChatProvider, type ChatPaneAgent } from "@jini-ai/chat/react";

import { SiteAssistantHeader } from "./SiteAssistantHeader";

/**
 * @file The whole public-site chat widget (ADR-054 Task 2) — a floating action button that opens
 * `@jini-ai/chat/react`'s own `ChatPane`, unmodified, against the public site-assistant transport.
 *
 * Mirrors `apps/admin/src/components/AssistantDock/AssistantDock.tsx`'s shape in exactly one respect worth naming:
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
 *
 * ## SPEC-046 REQ-1 — transcript survives a page load
 *
 * `initialMessages` (mount-time only) and `onMessagesChange` (fired on every change) are the two
 * halves of `ChatPane`'s own seam for exactly this, and no fork was needed to use them: transcript +
 * pane open/closed state are read once via `loadSiteAssistantState` before the first render, fed into
 * `ChatPane` as `initialMessages`, and written back to the browser session store via
 * `saveSiteAssistantState` whenever either changes. Because `initialMessages` is consumed once per
 * `ChatPane` MOUNT (verified against `useConversation.ts`'s `useState(options.initialMessages ?? [])`
 * — a `useState` initializer
 * argument, read only on the instance's first render), the same `key={paneKey}` remount this file
 * already used for "New thread" is what makes a fresh empty transcript actually stick after a reset:
 * clearing `persistedMessages` to `[]` in the same handler that bumps `paneKey` means the NEXT
 * `ChatPane` instance mounts with nothing to rehydrate, not a stale array from before the reset.
 *
 */
const SITE_ASSISTANT_AGENT: ChatPaneAgent = { id: "site-assistant", name: "Site Assistant", available: true };

export function SiteAssistantWidget({ useSiteAssistantWidgetHook = useSiteAssistantWidget }: { useSiteAssistantWidgetHook?: typeof useSiteAssistantWidget } = {}) {
  const { open, paneKey, panelRef, launcherRef, closePanel, i18n, t, suggestions, toggleOpen,
    comparisonControl, transport, hasMessages, persistedMessages, resetConversation, handleMessagesChange, toolConfirmation } = useSiteAssistantWidgetHook({});

  return (
    <div className="tovu-site-assistant jini-chat-embed" data-agent-private>
      <div ref={launcherRef}>
        <ChatFab open={open} onToggle={toggleOpen} aria-label={t('Chat with this site')} aria-haspopup="dialog" aria-controls="tovu-site-assistant-panel" />
      </div>
      <JiniChatProvider transport={transport} i18n={i18n}>
        <div id="tovu-site-assistant-panel" className="tovu-site-assistant__panel" hidden={!open} ref={panelRef} role="dialog" aria-modal="true" aria-label={t('Ask this site')}>
          <ChatPane
            key={paneKey}
            transport={transport}
            agentControl={comparisonControl}
            agents={[SITE_ASSISTANT_AGENT]}
            initialSelection={{ agentId: SITE_ASSISTANT_AGENT.id }}
            initialMessages={persistedMessages}
            variant="embed"
            title={t('Ask this site')}
            header={<SiteAssistantHeader title={t('Ask this site')} hasMessages={hasMessages} onReset={resetConversation} onClose={closePanel} />}
            placeholder={t("Ask about this site's posts and pages…")}
            emptyState={<p className="jini-chat-pane__greeting">{t('Ask about posts, pages or docs on this site.')}</p>}
            suggestions={suggestions}
            onMessagesChange={handleMessagesChange}
          />
          {toolConfirmation.pending ? (
            <div className="tovu-site-assistant__proposal" role="group" aria-label={toolConfirmation.pending.title}>
              <span className="tovu-site-assistant__proposal-label" role="status">
                {toolConfirmation.pending.title} {toolConfirmation.pending.summary}
              </span>
              <button type="button" className="tovu-site-assistant__proposal-go" onClick={() => toolConfirmation.decide({ allow: true })}>Allow</button>
              <button ref={toolConfirmation.cancelRef} type="button" className="tovu-site-assistant__proposal-go" onClick={() => toolConfirmation.decide({ allow: false })}>Cancel</button>
            </div>
          ) : null}

        </div>
      </JiniChatProvider>
    </div>
  );
}
