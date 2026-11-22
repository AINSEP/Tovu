import type { Editor } from "@tiptap/react";

/** Start each formatting action with the editor focused. */
export function createFocusedEditorChain({ editor }: { editor: Editor }, _options = {}) {
  return () => editor.chain().focus();
}
