import { useEffect, useState } from "react";

/**
 * @file Replaces `ChatPane`'s default header. That default ships a "New thread" button wired
 * directly to `pane.reset` with no confirmation — one stray click discards the visitor's whole
 * conversation with no undo. This adds a two-step confirm in the same header slot, per the owner's
 * ask, without forking `@jini-ai/chat` (`ChatPane`'s `header` prop is the documented seam for
 * exactly this — see that component's own `resolveChatPaneHeader`, which renders this INSTEAD of
 * its default the moment a `header` is supplied, so nothing about the package itself changes).
 *
 * Deliberately skips the confirm step when the transcript is empty: "New thread" on an already-empty
 * chat has nothing to lose, and a prompt there is pure friction that trains a visitor to click
 * through it without reading — which defeats the point of asking on the turn that DOES matter.
 *
 * Markup mirrors `ChatPane`'s own `defaultHeader` (`jini-chat-pane__header` /
 * `jini-chat-pane__heading` / `jini-chat-pane__eyebrow` / `jini-chat-pane__title`) so this widget's
 * existing ported CSS (`widget.css`) styles it with no new class names to maintain — visually this
 * should be indistinguishable from the default until the confirm step appears. `<h2>`, not `<h1>`
 * (the package's own default uses `<h1>`): this pane floats over an arbitrary themed page that
 * likely already has its own `<h1>`, and the admin dock hit this identical accessibility issue first
 * — see `AssistantDock.tsx`'s own header-tag comment for the full account.
 */
export interface SiteAssistantHeaderProps {
  readonly title: string;
  /** Whether the current transcript has anything a reset would discard. */
  readonly hasMessages: boolean;
  /** Actually clears the conversation. Called only once the visitor has confirmed (or immediately,
   *  when there is nothing to confirm). */
  readonly onReset: () => void;
}

export function SiteAssistantHeader({ title, hasMessages, onReset }: SiteAssistantHeaderProps) {
  const [confirming, setConfirming] = useState(false);

  // Dismissable with Escape, from anywhere in the pane — not just while a specific button is
  // focused, since a visitor who opened the confirm step and then clicked into the composer to
  // think should still be able to press Escape to back out.
  useEffect(() => {
    if (!confirming) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setConfirming(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirming]);

  function handleNewThreadClick(): void {
    if (!hasMessages) {
      onReset();
      return;
    }
    setConfirming(true);
  }

  function handleConfirmDiscard(): void {
    setConfirming(false);
    onReset();
  }

  return (
    <div className="jini-chat-pane__header">
      <div className="jini-chat-pane__heading">
        <span className="jini-chat-pane__eyebrow">Workspace chat</span>
        <h2 className="jini-chat-pane__title">{title}</h2>
      </div>
      {confirming ? (
        <div className="tovu-site-assistant__reset-confirm">
          {/* `autoFocus` on Cancel, not the destructive action — a stray Enter/Space right after
           *  the confirm step appears must land on the SAFE choice, the same reason a native
           *  `confirm()` dialog defaults focus to Cancel/OK-is-not-assumed rather than the button
           *  that discards data. */}
          <button type="button" className="jini-chat-pane__cancel" onClick={() => setConfirming(false)} autoFocus>
            Cancel
          </button>
          <button type="button" className="jini-chat-pane__new-thread" onClick={handleConfirmDiscard}>
            Discard chat?
          </button>
        </div>
      ) : (
        <button type="button" className="jini-chat-pane__new-thread" onClick={handleNewThreadClick}>
          New thread
        </button>
      )}
    </div>
  );
}
