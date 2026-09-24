import { useCallback, useRef, type RefObject } from "react";

import type { InteractiveHtmlEditorHandle } from "@jini-ai/ui/html-editor";

/**
 * @file Interactive flush (2026-09-23 plan) — the admin half of `@jini-ai/ui/html-editor`'s
 * `flush()` fix. GrapesJS only syncs an open RTE session's edited text into its component model when
 * that session CLOSES (`disableEditing`), never on every keystroke — so a save, publish, tab switch,
 * or template change that happens while the operator is still mid-edit on the Interactive tab
 * silently drops that last edit unless something calls `flush()` first. `usePageEditor` owns
 * `interactiveEditorRef` (the ref `PageEditorPane` attaches to `<InteractiveHtmlEditor>`) and calls
 * `flushInteractiveEdits()` at every point that reads or leaves the working copy — see that hook's
 * `save`, `saveOverwritingConflict`, and its "flush, then set" `setView`/`setTemplateChoice` wrappers.
 */

/** How long a Save, Publish, tab switch or template change waits for the editor's `flush()` before
 *  going ahead without it. GrapesJS's built-in RTE settles in a few microtasks; this bound exists so
 *  a custom RTE whose `getContent`/`disable` never settles cannot freeze all of them for good. */
export const INTERACTIVE_FLUSH_TIMEOUT_MS = 2000;

type FlushOutcome = { kind: "flushed"; html: string | undefined } | { kind: "failed"; error: unknown } | { kind: "timed-out" };

/**
 * Settles `flush` into an outcome within `timeoutMs`. Never rejects.
 *
 * @complexity O(1); one timer, cleared once `flush` settles first.
 */
function settleFlush(flush: Promise<string | undefined>, timeoutMs: number): Promise<FlushOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<FlushOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timed-out" }), timeoutMs);
  });
  const settled = flush.then(
    (html): FlushOutcome => ({ kind: "flushed", html }),
    (error: unknown): FlushOutcome => ({ kind: "failed", error })
  );
  return Promise.race([settled, timedOut]).finally(() => clearTimeout(timer));
}

/**
 * `setHtml` — the raw `useState` setter `usePageEditor` owns for the working copy. Injected rather
 * than reading it off a wider dependency object: this hook's whole job is one write into that one
 * piece of state, and threading just the setter keeps it independently testable without a fake
 * `usePageEditor`.
 *
 * @returns `interactiveEditorRef` — attach to `<InteractiveHtmlEditor ref={...}>`; `null` until that
 *   component mounts (not on the Interactive tab, or not yet rendered). `flushInteractiveEdits` —
 *   see its own doc below.
 * @complexity Time/space: O(1) setup.
 */
export function useInteractiveEditorFlush(
  setHtml: (value: string) => void,
): {
  interactiveEditorRef: RefObject<InteractiveHtmlEditorHandle | null>;
  flushInteractiveEdits: () => Promise<string | undefined>;
} {
  const interactiveEditorRef = useRef<InteractiveHtmlEditorHandle | null>(null);

  /**
   * Closes any RTE session still open on the Interactive tab and folds its edit into the working
   * copy. A no-op — resolves `undefined`, never calls `setHtml` — whenever there is nothing to flush:
   * `interactiveEditorRef.current` is `null` (not on the Interactive tab, or not yet mounted), the
   * editor's own `flush()` found nothing changed since mount, or `flush()` rejected or did not settle
   * within {@link INTERACTIVE_FLUSH_TIMEOUT_MS} (both warned about, never propagated, so a
   * save/tab-switch/template-change can never be blocked by it). A flush that settles after the
   * timeout is ignored: its caller has already moved on, and a late `setHtml` could overwrite what
   * the operator typed since (for example in the HTML tab).
   * Every caller must still fall back to whatever `html` currently holds on `undefined` — see
   * `usePageEditor`'s own `runSave` `htmlOverride` parameter for why this can't just always win.
   *
   * @complexity O(1) plus whatever the editor's own `flush()` costs.
   */
  const flushInteractiveEdits = useCallback(async (): Promise<string | undefined> => {
    const handle = interactiveEditorRef.current;
    if (!handle) return undefined;
    const outcome = await settleFlush(Promise.resolve().then(() => handle.flush()), INTERACTIVE_FLUSH_TIMEOUT_MS);
    if (outcome.kind === "failed") {
      console.warn("[useInteractiveEditorFlush] flush failed; saving the working copy without the open edit", outcome.error);
      return undefined;
    }
    if (outcome.kind === "timed-out") {
      console.warn(
        `[useInteractiveEditorFlush] flush did not settle within ${INTERACTIVE_FLUSH_TIMEOUT_MS}ms; continuing without the open edit`
      );
      return undefined;
    }
    if (outcome.html !== undefined) setHtml(outcome.html);
    return outcome.html;
  }, [setHtml]);

  return { interactiveEditorRef, flushInteractiveEdits };
}
