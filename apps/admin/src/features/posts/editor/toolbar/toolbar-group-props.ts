import type { Editor } from "@tiptap/react";
import type { Translate } from "@jini-ai/core/text";

import type { ToolbarState } from "./toolbar-state";

/**
 * What every toolbar group takes. `state` is the ONE `useEditorState` snapshot `Toolbar` subscribes
 * to; a group never subscribes on its own, so the toolbar still re-renders once per editor change.
 */
export interface ToolbarGroupProps {
  editor: Editor;
  state: ToolbarState;
  t: Translate;
}
