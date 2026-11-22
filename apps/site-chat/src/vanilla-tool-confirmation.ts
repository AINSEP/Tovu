/** Tovu's confirmation adapter for the human-only strip mounted by Jini's vanilla widget. */
import { confirmSiteAssistantTool, type ToolConfirmation } from './tool-confirmation';

function toolConfirmationStrip({ element }: { element: HTMLElement }, _options = {}) {
  const strip = element.querySelector<HTMLElement>('.jini-chat-vanilla__tool-confirmation');
  const label = strip?.querySelector('span');
  const allow = strip?.querySelector('button');
  if (!strip || !label || !allow) return null;
  return { strip, label, allow };
}

function bindVanillaToolConfirmation(required: {
  element: HTMLElement; document: Document; strip: HTMLElement; label: HTMLSpanElement; allow: HTMLButtonElement; cancel: HTMLButtonElement; labelText: () => string;
  original: { text: string | null; go: string | null; hidden: boolean }; previous: HTMLElement | null; render: () => void; decide: (required: { allow: boolean }) => void; clear: () => void;
}, _options = {}) {
  const { element, document, strip, label, allow, cancel, labelText, original, previous, render, decide, clear } = required;
  const click = (event: Event) => {
    if (event.target === allow || event.target === cancel) {
      // Capture keeps the human decision from also activating a host chrome handler.
      event.preventDefault();
      event.stopImmediatePropagation();
      decide({ allow: event.target === allow });
    } else {
      // Open/close updates Jini's chrome synchronously. Project the still-live strip afterwards.
      queueMicrotask(render);
    }
  };
  element.addEventListener('click', click, true);
  // Jini re-renders its chrome on every state change and on open/close, hiding the strip and
  // blanking the label — including Escape (a keydown) and the loader's outside bubble (an event,
  // not a click inside `element`). Re-project whenever that happens so a pending prompt stays answerable.
  const Observer = document.defaultView?.MutationObserver;
  const observer = Observer ? new Observer(() => { if (strip.hidden || label.textContent !== labelText()) render(); }) : null;
  observer?.observe(strip, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true, characterData: true });
  const timer = setTimeout(() => clear(), 60_000);
  return () => {
    observer?.disconnect();
    clearTimeout(timer);
    element.removeEventListener('click', click, true);
    cancel.remove();
    strip.hidden = original.hidden;
    label.textContent = original.text;
    allow.textContent = original.go;
    strip.removeAttribute('role');
    strip.removeAttribute('aria-label');
    label.removeAttribute('role');
    if (previous?.isConnected) previous.focus();
  };
}

/** Extend the existing strip, using its human-only markup. This adapter owns
 * only the visitor-tool projection: Jini still owns the widget, run, cancellation and navigation.
 * Listeners/timer exist only while a live prompt does; teardown restores the original affordance.
 * @complexity O(1) DOM work per prompt/click; one 60-second UI deadline.
 */
export function createVanillaToolConfirmation({ element, document }: { element: HTMLElement; document: Document }, { confirm = confirmSiteAssistantTool, sendFailureText = "Couldn't send your decision. Try again." }: { confirm?: typeof confirmSiteAssistantTool; sendFailureText?: string } = {}) {
  let clear = () => {};
  return ({ directive }: { directive: ToolConfirmation | null }, _options = {}): void => {
    clear();
    if (!directive) return;
    const controls = toolConfirmationStrip({ element });
    if (!controls) return;
    const { strip, label, allow } = controls;
    const original = { text: label.textContent, go: allow.textContent, hidden: strip.hidden };
    const previous = document.activeElement as HTMLElement | null;
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = allow.className;
    cancel.textContent = 'Cancel';
    strip.append(cancel);
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', directive.title);
    label.setAttribute('role', 'status');
    let active = true;
    let sending = false, sendFailed = false;
    const labelText = () => sendFailed ? `${directive.title} ${directive.summary} ${sendFailureText}` : `${directive.title} ${directive.summary}`;
    const render = () => {
      if (!active) return;
      strip.hidden = false;
      label.textContent = labelText();
      allow.textContent = 'Allow';
    };
    const decide = async ({ allow: accepted }: { allow: boolean }) => {
      if (sending) return;
      sending = true;
      const ok = await confirm({ challengeId: directive.challengeId, allow: accepted });
      sending = false;
      if (!active) return;
      if (ok) clear();
      else { sendFailed = true; render(); }
    };
    const unbind = bindVanillaToolConfirmation({ element, document, strip, label, allow, cancel, labelText, original, previous, render, decide, clear: () => clear() });
    clear = () => {
      active = false;
      unbind();
      clear = () => {};
    };
    render();
    cancel.focus();
  };
}
