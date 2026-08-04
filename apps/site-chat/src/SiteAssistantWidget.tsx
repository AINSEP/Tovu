import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatFab, ChatPane, JiniChatProvider, type ChatPaneAgent } from "@jini-ai/chat/react";
import { isTerminalRunStatus, type ChatMessage } from "@jini-ai/chat/core";

import { SiteAssistantHeader } from "./SiteAssistantHeader";
import { createSiteAssistantTransport } from "./site-assistant-transport";
import { clearSiteAssistantState, enqueuePageAction, loadSiteAssistantState, saveSiteAssistantState } from "./session-store";
import { extractPageActions, splitPageActions, type NavigateAction, type NonNavigateAction } from "./client-directives";
import { applyHighlight, findTargetElement, scrollToElement } from "./highlight";

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
 * ## SPEC-046 REQ-4/D-1 — acting on a settled reply's client directives
 *
 * `handleMessagesChange` also scans the LATEST message once it reaches a terminal `runStatus`
 * (`isTerminalRunStatus`, `@jini-ai/chat/core`) for `client_directive` ext events
 * (`extractPageActions`) and acts on them exactly once — `processedMessageIdsRef` (a plain `Set`,
 * not state, since membership does not need to trigger a re-render) guards against re-processing the
 * same settled message on a later, unrelated `onMessagesChange` call (e.g. triggered by the
 * transcript-persistence effect below re-running for an unrelated reason).
 *
 * A `navigate` action with `auto: true` (D-1: the visitor explicitly asked) triggers
 * `window.location.assign` directly — same tab (D-2), after flushing the transcript synchronously
 * first (`saveSiteAssistantState`, not the effect, so the write is guaranteed to land before the
 * browser tears this page down) and enqueuing any bundled highlight/scroll_to for the destination
 * (`enqueuePageAction`, REQ-2). A `navigate` action with `auto: false` becomes `pendingProposal`
 * instead — a clickable affordance rendered below `ChatPane` (see the proposal bar in this file's
 * JSX) rather than executed. Either way, the PATH was already server-resolved (REQ-6): nothing here
 * constructs or edits it.
 *
 * A standalone `scroll_to`/`highlight` action (no navigate in the same turn) is attempted
 * immediately against the CURRENT page's DOM (`findTargetElement`) — the server has no notion of
 * which page a visitor is currently on, so "does this target exist here" is a client-only question,
 * and a miss degrades to silently doing nothing (see `highlight.ts`'s own doc on why that is a
 * heuristic, not a guarantee).
 */
const SITE_ASSISTANT_AGENT: ChatPaneAgent = { id: "site-assistant", name: "Site Assistant", available: true };

const PANE_TITLE = "Ask this site";

/** A resolved-but-not-yet-executed `navigate` proposal (D-1), plus any bundled highlight/scroll_to
 *  action to enqueue for the destination once the visitor clicks through. */
interface PendingProposal {
  readonly navigate: NavigateAction;
  readonly bundled: NonNavigateAction | null;
}

/** Best-effort immediate execution of a `scroll_to`/`highlight` action against the CURRENT page.
 *  Silently does nothing on a miss — see this file's header and `highlight.ts`'s own doc for why a
 *  missed target is never surfaced as an error. */
function runNonNavigateAction(action: NonNavigateAction): void {
  const element = findTargetElement(action.target.title);
  if (!element) return;
  scrollToElement(element);
  if (action.type === "highlight") applyHighlight(element);
}

export function SiteAssistantWidget() {
  // Read once, before the first render — `useState`'s initializer form runs exactly once per
  // component instance, which is what keeps this a single session-store read (and thus a single
  // possible clear-on-corrupt-entry side effect — see `session-store.ts`) rather than one per field
  // below.
  const [initialState] = useState(() => loadSiteAssistantState());

  const [open, setOpen] = useState(initialState.open);
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
  const [hasMessages, setHasMessages] = useState(initialState.messages.length > 0);
  // The read side of `initialMessages`: whatever `ChatPane` currently holds, kept in this component
  // so the persistence effect below has something to serialize. Only consulted by `ChatPane` again at
  // the moment a NEW instance mounts (a `paneKey` bump), never reactively during a `ChatPane`
  // instance's own lifetime — see this file's header for why that ordering is what it is.
  const [persistedMessages, setPersistedMessages] = useState<ChatMessage[]>(initialState.messages);

  // SPEC-046 D-1: a resolved `navigate` proposal awaiting the visitor's own click. `null` when there
  // is nothing to propose (the common case) or once acted on/superseded.
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null);
  // SPEC-046 REQ-4: message ids whose client directives have already been acted on — a plain ref
  // (not state) because membership here must never itself trigger a re-render; see this file's
  // header for why a Set keyed by message id is the right guard.
  const processedMessageIdsRef = useRef<Set<string>>(new Set());

  // SPEC-046 REQ-1: writes on every change to either half of the persisted state, not just messages —
  // the pane's open/closed state must survive a page load too, "so the widget does not slam shut on
  // arrival at the page it just sent the visitor to."
  useEffect(() => {
    saveSiteAssistantState({ open, messages: persistedMessages });
  }, [open, persistedMessages]);

  const resetConversation = useCallback(() => {
    setPaneKey((key) => key + 1);
    setHasMessages(false);
    // "New thread" must clear the PERSISTED copy, not just this render's in-memory state (REQ-1) —
    // otherwise a reload immediately after resetting would rehydrate the conversation right back.
    // Cleared directly here (not left to the effect above) so the guarantee holds even if a future
    // change ever batches or skips that effect.
    setPersistedMessages([]);
    clearSiteAssistantState();
    // A proposal from the discarded thread must not survive into the fresh one, and the fresh
    // `ChatPane` instance will hand out its own new message ids regardless — clearing the guard set
    // just avoids holding references to ids that can never recur.
    setPendingProposal(null);
    processedMessageIdsRef.current = new Set();
  }, []);

  const handleMessagesChange = useCallback((messages: ChatMessage[]) => {
    setHasMessages(messages.length > 0);
    setPersistedMessages(messages);

    // SPEC-046 REQ-4/D-1: act on the latest message's client directives exactly once, only once its
    // run has actually settled — see this file's header for the full rationale.
    const latest = messages.at(-1);
    if (!latest || latest.role !== "assistant" || !isTerminalRunStatus(latest.runStatus)) return;
    if (processedMessageIdsRef.current.has(latest.id)) return;
    processedMessageIdsRef.current.add(latest.id);

    const { navigate, other } = splitPageActions(extractPageActions(latest.events));
    if (!navigate) {
      if (other) runNonNavigateAction(other);
      return;
    }

    if (navigate.auto) {
      // D-1: the visitor explicitly asked ("take me there") — the server already decided this via
      // `autoNavigateAllowed`, computed from the visitor's own message before any tool ran; this
      // component just executes the already-validated result. Bundle any highlight/scroll_to for the
      // destination BEFORE navigating, and flush the transcript synchronously (not via the effect
      // above, which has not necessarily committed yet) — REQ-1/REQ-2 both depend on both writes
      // landing before the browser tears this page down.
      if (other) enqueuePageAction(other);
      saveSiteAssistantState({ open, messages });
      window.location.assign(navigate.target.path);
      return;
    }

    // D-1 default: propose, do not navigate. Rendered below as a clickable affordance; `other` (if
    // any) rides along so a click can enqueue it for the destination the same way the auto path does.
    setPendingProposal({ navigate, bundled: other });
  }, [open]);

  const handleProposalClick = useCallback(() => {
    if (!pendingProposal) return;
    const { navigate, bundled } = pendingProposal;
    setPendingProposal(null);
    if (bundled) enqueuePageAction(bundled);
    // Same flush-before-navigate reasoning as the auto path above — `persistedMessages` here is
    // already the latest settled transcript (`handleMessagesChange` updates it on every change).
    saveSiteAssistantState({ open, messages: persistedMessages });
    window.location.assign(navigate.target.path);
  }, [pendingProposal, open, persistedMessages]);

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
            initialMessages={persistedMessages}
            title={PANE_TITLE}
            header={<SiteAssistantHeader title={PANE_TITLE} hasMessages={hasMessages} onReset={resetConversation} />}
            placeholder="Ask about this site's posts and pages…"
            suggestions={["What is this site about?", "What have you published recently?"]}
            onMessagesChange={handleMessagesChange}
          />
          {/* SPEC-046 D-1: rendered below ChatPane, not injected into its message list — ChatPane is
              used unmodified (this file's own header), so a proposal is a sibling strip inside the
              panel rather than a message-list entry. */}
          {pendingProposal ? (
            <div className="tovu-site-assistant__proposal">
              <span className="tovu-site-assistant__proposal-label">Go to “{pendingProposal.navigate.target.title}”?</span>
              <button type="button" className="tovu-site-assistant__proposal-go" onClick={handleProposalClick}>
                Go there
              </button>
            </div>
          ) : null}
        </div>
      </JiniChatProvider>
    </div>
  );
}
