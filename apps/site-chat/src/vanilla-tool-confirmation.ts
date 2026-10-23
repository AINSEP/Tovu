/** Tovu's directive adapter for the proposal strip already mounted by Jini's vanilla widget. */
import { confirmSiteAssistantTool, type ToolConfirmation } from './tool-confirmation';

/** Extend the existing strip, retaining its navigation listener and markup. This adapter owns
 * only the visitor-tool projection: Jini still owns the widget, run, cancellation and navigation.
 * Listeners/timer exist only while a live prompt does; teardown restores the original affordance.
 * @complexity O(1) DOM work per prompt/click; one 60-second UI deadline.
 */
export function createVanillaToolConfirmation({ element, document }: { element: HTMLElement; document: Document }, { confirm = confirmSiteAssistantTool }: { confirm?: typeof confirmSiteAssistantTool } = {}) {
  let clear = () => {};
  return ({ directive }: { directive: ToolConfirmation | null }, _options = {}): void => {
    clear();
    if (!directive) return;
    const strip = element.querySelector<HTMLElement>('.jini-chat-vanilla__proposal');
    const label = strip?.querySelector('span');
    const allow = strip?.querySelector('button');
    if (!strip || !label || !allow) return;
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
    const render = () => {
      if (!active) return;
      strip.hidden = false;
      label.textContent = `${directive.title} ${directive.summary}`;
      allow.textContent = 'Allow';
    };
    const decide = ({ allow: accepted }: { allow: boolean }) => {
      clear();
      void confirm({ challengeId: directive.challengeId, allow: accepted });
    };
    const click = (event: Event) => {
      if (event.target === allow || event.target === cancel) {
        // Capture precedes Jini's existing navigation listener. A tool Allow can never navigate.
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
    const observer = Observer ? new Observer(() => { if (strip.hidden || label.textContent !== `${directive.title} ${directive.summary}`) render(); }) : null;
    observer?.observe(strip, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true, characterData: true });
    const timer = setTimeout(() => clear(), 60_000);
    clear = () => {
      active = false;
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
      clear = () => {};
    };
    render();
    cancel.focus();
  };
}
