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
   * editor's own `flush()` found nothing changed since mount, or `flush()` itself rejected (swallowed
   * here rather than propagated, so a save/tab-switch/template-change can never be blocked by it).
   * Every caller must still fall back to whatever `html` currently holds on `undefined` — see
   * `usePageEditor`'s own `runSave` `htmlOverride` parameter for why this can't just always win.
   *
   * @complexity O(1) plus whatever the editor's own `flush()` costs.
   */
  const flushInteractiveEdits = useCallback(async (): Promise<string | undefined> => {
    try {
      const flushed = await interactiveEditorRef.current?.flush();
      if (flushed !== undefined) setHtml(flushed);
      return flushed;
    } catch {
      return undefined;
    }
  }, [setHtml]);

  return { interactiveEditorRef, flushInteractiveEdits };
}
