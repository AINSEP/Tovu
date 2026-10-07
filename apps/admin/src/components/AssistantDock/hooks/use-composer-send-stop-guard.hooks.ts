import { useCallback, useRef, type MouseEvent } from "react";

const SEND_STOP_GRACE_MS = 500;
const monotonicNow = () => performance.now();

/**
 * Jini changes Send into Stop under the pointer, but exposes no cancellation-click hook.
 * Capture at the existing host wrapper BEFORE its onCancel handler: guarding stopRun alone
 * would still abort the subscription and mark the reply "Stopped." inside Jini.
 *
 * The short window also covers browsers that reset click detail when the button changes.
 * detail > 1 covers slower OS double-click settings. Scope both to the composer that sent;
 * a newly mounted conversation must not inherit another pane's Send. Keyboard/assistive
 * activations (detail === 0) remain immediately available, and ignored clicks don't extend
 * the window. Remove this compatibility hook when Jini owns the guard in Composer.
 */
export function useComposerSendStopGuard(
  _required: Record<string, never> = {},
  { now = monotonicNow }: { now?: () => number } = {},
) {
  const lastSend = useRef<{ composer: Element; at: number } | null>(null);
  return useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.detail === 0 || !(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button.jini-composer-send");
    const composer = button?.closest(".jini-composer");
    if (!button || button.disabled || !composer) return;
    if (!button.classList.contains("jini-composer-send--stop")) {
      lastSend.current = { composer, at: now() };
      return;
    }
    const sent = lastSend.current;
    if (sent?.composer === composer && (event.detail > 1 || now() - sent.at < SEND_STOP_GRACE_MS)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, [now]);
}
