import { createFocusedEditorChain } from "../../PostEditor.hooks";
import type { ToolbarOverflowController } from "@jini-ai/admin/posts/hooks/use-post-editor-ui.hooks";
import type { PostUrlDialogController } from "../../hooks/use-post-url-dialog.hooks";
import { CODE_LANGUAGE_OPTIONS, toolbarBtnClass } from "../../rules";
import type { ToolbarGroupProps } from "./toolbar-group-props";

/** Props of a group whose controls can be promoted onto the phone row (`overflow.slot`). */
type SlottedGroupProps = ToolbarGroupProps & { overflow: ToolbarOverflowController };

export function ToolbarMarksGroup({ editor, state: s, t, overflow, urlDialog }: SlottedGroupProps & { urlDialog: PostUrlDialogController }) {
  const chain = createFocusedEditorChain({ editor });
  return (
    <div className="grp">
      <button className={toolbarBtnClass({ active: s.bold })} {...overflow.slot({ rank: 0 })} title={t("Bold (⌘B)")} aria-pressed={s.bold} onClick={() => chain().toggleBold().run()}><b>B</b></button>
      <button className={toolbarBtnClass({ active: s.italic })} {...overflow.slot({ rank: 1 })} title={t("Italic (⌘I)")} aria-pressed={s.italic} onClick={() => chain().toggleItalic().run()}><i>I</i></button>
      <button className={toolbarBtnClass({ active: s.strike })} title={t("Strikethrough")} aria-pressed={s.strike} onClick={() => chain().toggleStrike().run()}><s>S</s></button>
      <button className={toolbarBtnClass({ active: s.underline })} {...overflow.slot({ rank: 2 })} title={t("Underline (⌘U)")} aria-pressed={s.underline} onClick={() => chain().toggleUnderline().run()}><u>U</u></button>
      <button className={toolbarBtnClass({ active: s.highlight })} title={t("Highlight")} aria-pressed={s.highlight} onClick={() => chain().toggleHighlight().run()}><mark>H</mark></button>
      <button className={toolbarBtnClass({ active: s.subscript })} title={t("Subscript")} aria-pressed={s.subscript} onClick={() => chain().toggleSubscript().run()}>X₂</button>
      <button className={toolbarBtnClass({ active: s.superscript })} title={t("Superscript")} aria-pressed={s.superscript} onClick={() => chain().toggleSuperscript().run()}>X²</button>
      <button className={toolbarBtnClass({ active: s.code })} title={t("Inline code")} aria-pressed={s.code} onClick={() => chain().toggleCode().run()}>&lt;/&gt;</button>
      {/* Link (2026-08-11) — a click while the selection already sits inside a link removes it;
          otherwise the shared URL dialog applies a URL to the current selection.
          The toggle and commands live in the dialog hook (2026-10-11). `extendMarkRange("link")`
          first so clicking anywhere inside an existing link
          (not just an exact selection of its text) still targets the whole mark, matching how the
          other toggle buttons on this row already read the mark/node at the cursor rather than
          requiring an exact selection. */}
      <button
        className={toolbarBtnClass({ active: s.link })}
        {...overflow.slot({ rank: 3 })}
        title={t("Link")}
        aria-pressed={s.link}
        onClick={urlDialog.openLink}
      >
        {t("Link")}
      </button>
    </div>
  );
}

export function ToolbarHeadingGroup({ editor, state: s, t, overflow }: SlottedGroupProps) {
  const chain = createFocusedEditorChain({ editor });
  return (
    <div className="grp">
      <button className={toolbarBtnClass({ active: s.h1 })} title={t("Heading 1")} aria-pressed={s.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>H1</button>
      <button className={toolbarBtnClass({ active: s.h2 })} {...overflow.slot({ rank: 4 })} title={t("Heading 2")} aria-pressed={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>H2</button>
      <button className={toolbarBtnClass({ active: s.h3 })} title={t("Heading 3")} aria-pressed={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>H3</button>
    </div>
  );
}

export function ToolbarBlockGroup({ editor, state: s, t, overflow }: SlottedGroupProps) {
  const chain = createFocusedEditorChain({ editor });
  return (
    <div className="grp">
      <button className={toolbarBtnClass({ active: s.bullet })} {...overflow.slot({ rank: 5 })} title={t("Bullet list")} aria-pressed={s.bullet} onClick={() => chain().toggleBulletList().run()}>• {t("List")}</button>
      <button className={toolbarBtnClass({ active: s.ordered })} title={t("Numbered list")} aria-pressed={s.ordered} onClick={() => chain().toggleOrderedList().run()}>1. {t("List")}</button>
      <button className={toolbarBtnClass({ active: s.taskList })} title={t("Task list")} aria-pressed={s.taskList} onClick={() => chain().toggleTaskList().run()}>☐ {t("List")}</button>
      <button className={toolbarBtnClass({ active: s.quote })} title={t("Quote")} aria-pressed={s.quote} onClick={() => chain().toggleBlockquote().run()}>&ldquo; {t("Quote")}</button>
      <button className={toolbarBtnClass({ active: s.codeBlock })} title={t("Code block")} aria-pressed={s.codeBlock} onClick={() => chain().toggleCodeBlock().run()}>{"{ }"}</button>
      {/* Code block language (coordinator MSG #1, 2026-08-11) — every option is one of lowlight's
          own registered `common` grammar keys (`rules.ts`'s `CODE_LANGUAGE_OPTIONS`), so picking
          one always produces real in-editor highlighting. `setCodeBlock` both converts the
          current block to a code block (if it wasn't already one) AND sets its language in one
          call — the same `chain().setCodeBlock({...})` call works whether or not the cursor was
          already inside a code block, so this needs no separate "am I in one?" branch. */}
      <select
        className="tb-select"
        title={t("Code language")}
        aria-label={t("Code language")}
        value={s.codeBlockLanguage}
        onChange={(e) => chain().setCodeBlock({ language: e.target.value }).run()}
      >
        {CODE_LANGUAGE_OPTIONS.map((opt) => (
          <option key={opt.label} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <button className="tb-btn" title={t("Divider")} onClick={() => chain().setHorizontalRule().run()}>―</button>
      {/* Table (owner, 2026-08-11: "anything and everything") — same "quickest thing that
          works" idiom as "Img by URL"/"Divider" just above: a fixed 3x3-with-header-row insert,
          no rows/cols prompt. `insertTable`'s own defaults (`rows: 3, cols: 3,
          withHeaderRow: true`) are passed explicitly rather than relied on implicitly. */}
      <button
        className="tb-btn"
        title={t("Insert table")}
        onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        {t("Table")}
      </button>
    </div>
  );
}

/* Icons, not word labels (owner, 2026-08-11: "How come it just doesn't use the icons? ...
    Not a huge deal, but would be nice to have") — house SVG convention (`viewBox="0 0 18 18"`,
    `stroke="currentColor"`, no icon dependency), same shape `App.tsx`'s sidebar-collapse
    button and `Media.tsx`'s file-type icons already use. `currentColor` is what makes these
    free: they inherit the toolbar's own color token (and therefore dark mode, and the `.on`
    active-state color swap `.tb-btn.on` already applies) with zero icon-specific CSS.
    `B`/`I`/`U`/`H1` above stay letters — mixing letters for marks and icons for alignment
    matches the Word/Docs/Notion convention rather than converting everything at once.
    Losing the visible text label means the button needs its own accessible name: `aria-label`
    now carries what `title` alone used to (a screen reader ignores `title`), and `title` stays
    for the hover tooltip sighted users still get. */
export function ToolbarAlignGroup({ editor, state: s, t }: ToolbarGroupProps) {
  const chain = createFocusedEditorChain({ editor });
  return (
    <div className="grp">
      <button
        className={toolbarBtnClass({ active: s.alignLeft })}
        title={t("Align left")}
        aria-label={t("Align left")}
        aria-pressed={s.alignLeft}
        onClick={() => chain().setTextAlign("left").run()}
      >
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path d="M2.5 4h13M2.5 7.5h8M2.5 11h13M2.5 14.5h8" strokeLinecap="round" />
        </svg>
      </button>
      <button
        className={toolbarBtnClass({ active: s.alignCenter })}
        title={t("Align center")}
        aria-label={t("Align center")}
        aria-pressed={s.alignCenter}
        onClick={() => chain().setTextAlign("center").run()}
      >
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path d="M2.5 4h13M5 7.5h8M2.5 11h13M5 14.5h8" strokeLinecap="round" />
        </svg>
      </button>
      <button
        className={toolbarBtnClass({ active: s.alignRight })}
        title={t("Align right")}
        aria-label={t("Align right")}
        aria-pressed={s.alignRight}
        onClick={() => chain().setTextAlign("right").run()}
      >
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path d="M2.5 4h13M7.5 7.5h8M2.5 11h13M7.5 14.5h8" strokeLinecap="round" />
        </svg>
      </button>
      <button
        className={toolbarBtnClass({ active: s.alignJustify })}
        title={t("Justify")}
        aria-label={t("Justify")}
        aria-pressed={s.alignJustify}
        onClick={() => chain().setTextAlign("justify").run()}
      >
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path d="M2.5 4h13M2.5 7.5h13M2.5 11h13M2.5 14.5h13" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export function ToolbarHistoryGroup({ editor, state: s, t }: ToolbarGroupProps) {
  const chain = createFocusedEditorChain({ editor });
  return (
    <div className="grp">
      <button className="tb-btn" title={t("Undo (⌘Z)")} disabled={!s.canUndo} onClick={() => chain().undo().run()}>↺</button>
      <button className="tb-btn" title={t("Redo (⌘⇧Z)")} disabled={!s.canRedo} onClick={() => chain().redo().run()}>↻</button>
    </div>
  );
}
