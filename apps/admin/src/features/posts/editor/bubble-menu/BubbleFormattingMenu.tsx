import { BubbleMenu } from "@tiptap/react/menus";
import { useEditorState, type Editor } from "@tiptap/react";
import type { Translate } from "@jini-ai/core/text";

import { createFocusedEditorChain } from "../../PostEditor.hooks";
import type { PostUrlDialogController } from "../../hooks/use-post-url-dialog.hooks";
import { toolbarBtnClass } from "../../rules";
import { probeBubbleMenu } from "./bubble-menu-state";

/**
 * Selection bubble menu (owner, 2026-08-11: "anything and everything") — floats above a text
 * selection with the handful of formatting actions an author reaches for most while highlighting a
 * phrase, so they don't have to move the mouse all the way up to the fixed `Toolbar` row and back.
 * `@tiptap/react/menus` is the only working import path for `BubbleMenu` in the installed 3.27.2 —
 * confirmed against the actual built JS, not just the docs: `@tiptap/react`'s own main entry has NO
 * `BubbleMenu` export in its bundle, only the `/menus` subpath does.
 *
 * Deliberately a small, separate subset (Bold/Italic/Underline/Highlight/Link), not the full
 * `Toolbar` teleported into a popover — a selection-context menu that's as busy as the fixed toolbar
 * defeats its own "quick action while selecting" purpose. Its own `useEditorState` selector, not
 * `Toolbar`'s: the two mount independently (this one only appears with a selection), so sharing one
 * selector would make `Toolbar` re-render on every selection change for state it never displays.
 */
export function BubbleFormattingMenu({ editor, urlDialog, t }: { editor: Editor; urlDialog: PostUrlDialogController; t: Translate }) {
  const s = useEditorState({
    editor,
    selector: ({ editor }) => probeBubbleMenu({ editor }),
  });
  const chain = createFocusedEditorChain({ editor });

  return (
    <BubbleMenu editor={editor} className="bubble-formatting-menu">
      <button className={toolbarBtnClass({ active: s.bold })} title={t("Bold")} aria-pressed={s.bold} onClick={() => chain().toggleBold().run()}><b>B</b></button>
      <button className={toolbarBtnClass({ active: s.italic })} title={t("Italic")} aria-pressed={s.italic} onClick={() => chain().toggleItalic().run()}><i>I</i></button>
      <button className={toolbarBtnClass({ active: s.underline })} title={t("Underline")} aria-pressed={s.underline} onClick={() => chain().toggleUnderline().run()}><u>U</u></button>
      <button className={toolbarBtnClass({ active: s.highlight })} title={t("Highlight")} aria-pressed={s.highlight} onClick={() => chain().toggleHighlight().run()}><mark>H</mark></button>
      <button
        className={toolbarBtnClass({ active: s.link })}
        title={t("Link")}
        aria-pressed={s.link}
        onClick={urlDialog.openLink}
      >
        {t("Link")}
      </button>
    </BubbleMenu>
  );
}
