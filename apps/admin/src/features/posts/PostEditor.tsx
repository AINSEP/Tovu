import { useState } from "react";
import { EditorContent, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { agentHandle } from "@jini-ai/agentic";
import { ConfirmDialog } from "@jini-ai/admin/react";
import { SrcDocSandbox } from "@jini-ai/ui/renderers";

import { EmbedInsertControl } from "../../components/EmbedInsertControl/EmbedInsertControl";
import { api, type AdminPost } from "../../lib/api";
import { siteUrl } from "../../lib/site-url";
import { useWiredPostEditor, type PostEditorView } from "./hooks/use-post-editor.hooks";
import { PostTemplateModal } from "./PostTemplateModal";
import {
  toolbarBtnClass,
  hexOrDefault,
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  CODE_LANGUAGE_OPTIONS,
} from "./rules";

/**
 * @file The post/page editor screen — markup only.
 *
 * State, the TipTap instance, the load effect, save, delete, and the dirty guard all live in
 * `hooks/use-post-editor.hooks.ts`. The drop handler and the `data:` URL reader moved to `rules.ts`
 * as pure functions, where they can be driven with a fake `EditorView` instead of a real editor and
 * a real drag gesture.
 *
 * What stays: `Toolbar`, which is a genuinely inert render of editor commands, and the page markup.
 *
 * Shared between posts and pages via the same `/admin/posts/{id}` route — see `Pages.tsx`'s file
 * header. `post.kind` drives the display copy and the back-link target only.
 */

/** Product-facing labels, not library ones — "Tiptap" never appears in the UI; an author reads
 *  these as "the editor" and "how it looks on the site". */
const VIEWS: ReadonlyArray<{ key: PostEditorView; label: string }> = [
  // "Editor", not "Edit" (owner, 2026-08-11): the pair names two VIEWS of the same post, so both
  // labels should be nouns. "Edit" alongside "Preview" reads as a verb next to a noun, and collides
  // with the post-list row menu's own "Edit" ACTION (`rules.ts`), which does something different.
  { key: "edit", label: "Editor" },
  { key: "preview", label: "Preview" },
];

/** Formatting toolbar wired to the live editor. Active state stays in sync via useEditorState. */
function Toolbar({
  editor,
  mentionablePosts,
  currentPostId,
}: {
  editor: Editor;
  /** Mention feature (2026-08-11) — every other post/page this workspace has, unfiltered (this
   *  component excludes `currentPostId` at render time). See `use-post-editor.hooks.ts`'s own
   *  field doc for why an empty array here means "loading or fetch failed", not "no other posts". */
  mentionablePosts: AdminPost[];
  currentPostId: string;
}) {
  const s = useEditorState({
    editor,
    // EXEMPTION (complexity ceiling, 2026-08-06, updated for the ≤9/≤9 bar; field count updated
    // 2026-08-11 for the Link/Underline/TextAlign additions): ESLint scores this selector's
    // cyclomatic complexity well past a 9 ceiling, but its cognitive complexity is 0 — not "low",
    // not reported at all even at threshold 0. That gap is the signature of a measurement
    // artifact, not real branching: this is a flat object literal of `editor?.isActive(...) ??
    // false` fallbacks with no control flow between them, and ESLint's cyclomatic rule counts each
    // `?.` and `??` as its own decision point. There is nothing to extract — splitting the fields
    // across multiple selectors would still evaluate the same fallbacks, just spread across more
    // functions, and would break `useEditorState`'s single-selector re-render-batching contract for
    // no complexity benefit. Kept as one object so `Toolbar` re-renders once per relevant editor
    // state change instead of once per field.
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      strike: editor?.isActive("strike") ?? false,
      underline: editor?.isActive("underline") ?? false,
      highlight: editor?.isActive("highlight") ?? false,
      subscript: editor?.isActive("subscript") ?? false,
      superscript: editor?.isActive("superscript") ?? false,
      code: editor?.isActive("code") ?? false,
      link: editor?.isActive("link") ?? false,
      h1: editor?.isActive("heading", { level: 1 }) ?? false,
      h2: editor?.isActive("heading", { level: 2 }) ?? false,
      h3: editor?.isActive("heading", { level: 3 }) ?? false,
      bullet: editor?.isActive("bulletList") ?? false,
      ordered: editor?.isActive("orderedList") ?? false,
      taskList: editor?.isActive("taskList") ?? false,
      quote: editor?.isActive("blockquote") ?? false,
      codeBlock: editor?.isActive("codeBlock") ?? false,
      // `getAttributes`, not `isActive` — same `color`/`fontFamily` shape above: the language
      // picker below needs to know WHICH language is active, not just whether a code block is.
      // Defaults to `"plaintext"` (a real registered lowlight language, not an empty sentinel)
      // since that's also `CodeBlockLowlight`'s own default when a code block has no language set.
      codeBlockLanguage: (editor?.getAttributes("codeBlock").language as string | undefined) ?? "plaintext",
      alignLeft: editor?.isActive({ textAlign: "left" }) ?? false,
      alignCenter: editor?.isActive({ textAlign: "center" }) ?? false,
      alignRight: editor?.isActive({ textAlign: "right" }) ?? false,
      alignJustify: editor?.isActive({ textAlign: "justify" }) ?? false,
      // `getAttributes`, not `isActive` — a color isn't a boolean toggle, it's the current cursor's
      // `textStyle` mark attrs (or `{}` with nothing selected/no color set), which is exactly what
      // the two color-input swatches below need to reflect the right swatch as the selection moves.
      color: (editor?.getAttributes("textStyle").color as string | undefined) ?? null,
      backgroundColor: (editor?.getAttributes("textStyle").backgroundColor as string | undefined) ?? null,
      fontFamily: (editor?.getAttributes("textStyle").fontFamily as string | undefined) ?? "",
      fontSize: (editor?.getAttributes("textStyle").fontSize as string | undefined) ?? "",
      lineHeight: (editor?.getAttributes("textStyle").lineHeight as string | undefined) ?? "",
      canUndo: editor?.can().undo() ?? false,
      canRedo: editor?.can().redo() ?? false,
      // CharacterCount (2026-08-11) — `storage`, not a command/attr: the extension only tracks
      // `state.doc`, so this reads its live count the same way `canUndo`/`canRedo` read
      // `editor.can()` rather than `isActive`.
      characterCount: editor?.storage.characterCount?.characters() ?? 0,
    }),
  });

  const chain = () => editor.chain().focus();

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      <div className="grp">
        <button className={toolbarBtnClass(s.bold)} title="Bold (⌘B)" aria-pressed={s.bold} onClick={() => chain().toggleBold().run()}><b>B</b></button>
        <button className={toolbarBtnClass(s.italic)} title="Italic (⌘I)" aria-pressed={s.italic} onClick={() => chain().toggleItalic().run()}><i>I</i></button>
        <button className={toolbarBtnClass(s.strike)} title="Strikethrough" aria-pressed={s.strike} onClick={() => chain().toggleStrike().run()}><s>S</s></button>
        <button className={toolbarBtnClass(s.underline)} title="Underline (⌘U)" aria-pressed={s.underline} onClick={() => chain().toggleUnderline().run()}><u>U</u></button>
        <button className={toolbarBtnClass(s.highlight)} title="Highlight" aria-pressed={s.highlight} onClick={() => chain().toggleHighlight().run()}><mark>H</mark></button>
        <button className={toolbarBtnClass(s.subscript)} title="Subscript" aria-pressed={s.subscript} onClick={() => chain().toggleSubscript().run()}>X₂</button>
        <button className={toolbarBtnClass(s.superscript)} title="Superscript" aria-pressed={s.superscript} onClick={() => chain().toggleSuperscript().run()}>X²</button>
        <button className={toolbarBtnClass(s.code)} title="Inline code" aria-pressed={s.code} onClick={() => chain().toggleCode().run()}>&lt;/&gt;</button>
        {/* Link (2026-08-11) — a prompt-based toggle, same "simplest thing that works" idiom as
            "Insert image by URL" just below rather than a dedicated dialog: a click while the
            selection already sits inside a link removes it (no second prompt needed to know the
            operator's intent); otherwise it prompts for a URL and applies it to the current
            selection. `extendMarkRange("link")` first so clicking anywhere inside an existing link
            (not just an exact selection of its text) still targets the whole mark, matching how the
            other toggle buttons on this row already read the mark/node at the cursor rather than
            requiring an exact selection. */}
        <button
          className={toolbarBtnClass(s.link)}
          title="Link"
          aria-pressed={s.link}
          onClick={() => {
            if (s.link) {
              chain().extendMarkRange("link").unsetLink().run();
              return;
            }
            const url = window.prompt("Link URL:", "https://");
            if (!url) return;
            chain().extendMarkRange("link").setLink({ href: url }).run();
          }}
        >
          Link
        </button>
      </div>
      <div className="grp">
        <button className={toolbarBtnClass(s.h1)} title="Heading 1" aria-pressed={s.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>H1</button>
        <button className={toolbarBtnClass(s.h2)} title="Heading 2" aria-pressed={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>H2</button>
        <button className={toolbarBtnClass(s.h3)} title="Heading 3" aria-pressed={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>H3</button>
      </div>
      <div className="grp">
        <button className={toolbarBtnClass(s.bullet)} title="Bullet list" aria-pressed={s.bullet} onClick={() => chain().toggleBulletList().run()}>• List</button>
        <button className={toolbarBtnClass(s.ordered)} title="Numbered list" aria-pressed={s.ordered} onClick={() => chain().toggleOrderedList().run()}>1. List</button>
        <button className={toolbarBtnClass(s.taskList)} title="Task list" aria-pressed={s.taskList} onClick={() => chain().toggleTaskList().run()}>☐ List</button>
        <button className={toolbarBtnClass(s.quote)} title="Quote" aria-pressed={s.quote} onClick={() => chain().toggleBlockquote().run()}>&ldquo; Quote</button>
        <button className={toolbarBtnClass(s.codeBlock)} title="Code block" aria-pressed={s.codeBlock} onClick={() => chain().toggleCodeBlock().run()}>{"{ }"}</button>
        {/* Code block language (coordinator MSG #1, 2026-08-11) — every option is one of lowlight's
            own registered `common` grammar keys (`rules.ts`'s `CODE_LANGUAGE_OPTIONS`), so picking
            one always produces real in-editor highlighting. `setCodeBlock` both converts the
            current block to a code block (if it wasn't already one) AND sets its language in one
            call — the same `chain().setCodeBlock({...})` call works whether or not the cursor was
            already inside a code block, so this needs no separate "am I in one?" branch. */}
        <select
          className="tb-select"
          title="Code language"
          aria-label="Code language"
          value={s.codeBlockLanguage}
          onChange={(e) => chain().setCodeBlock({ language: e.target.value }).run()}
        >
          {CODE_LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button className="tb-btn" title="Divider" onClick={() => chain().setHorizontalRule().run()}>―</button>
        {/* Table (owner, 2026-08-11: "anything and everything") — same "quickest thing that
            works" idiom as "Img by URL"/"Divider" just above: a fixed 3x3-with-header-row insert,
            no rows/cols prompt. `insertTable`'s own defaults (`rows: 3, cols: 3,
            withHeaderRow: true`) are passed explicitly rather than relied on implicitly. */}
        <button
          className="tb-btn"
          title="Insert table"
          onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          Table
        </button>
      </div>
      {/* Icons, not word labels (owner, 2026-08-11: "How come it just doesn't use the icons? ...
          Not a huge deal, but would be nice to have") — house SVG convention (`viewBox="0 0 18 18"`,
          `stroke="currentColor"`, no icon dependency), same shape `App.tsx`'s sidebar-collapse
          button and `Media.tsx`'s file-type icons already use. `currentColor` is what makes these
          free: they inherit the toolbar's own color token (and therefore dark mode, and the `.on`
          active-state color swap `.tb-btn.on` already applies) with zero icon-specific CSS.
          `B`/`I`/`U`/`H1` above stay letters — mixing letters for marks and icons for alignment
          matches the Word/Docs/Notion convention rather than converting everything at once.
          Losing the visible text label means the button needs its own accessible name: `aria-label`
          now carries what `title` alone used to (a screen reader ignores `title`), and `title` stays
          for the hover tooltip sighted users still get. */}
      <div className="grp">
        <button
          className={toolbarBtnClass(s.alignLeft)}
          title="Align left"
          aria-label="Align left"
          aria-pressed={s.alignLeft}
          onClick={() => chain().setTextAlign("left").run()}
        >
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path d="M2.5 4h13M2.5 7.5h8M2.5 11h13M2.5 14.5h8" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className={toolbarBtnClass(s.alignCenter)}
          title="Align center"
          aria-label="Align center"
          aria-pressed={s.alignCenter}
          onClick={() => chain().setTextAlign("center").run()}
        >
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path d="M2.5 4h13M5 7.5h8M2.5 11h13M5 14.5h8" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className={toolbarBtnClass(s.alignRight)}
          title="Align right"
          aria-label="Align right"
          aria-pressed={s.alignRight}
          onClick={() => chain().setTextAlign("right").run()}
        >
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path d="M2.5 4h13M7.5 7.5h8M2.5 11h13M7.5 14.5h8" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className={toolbarBtnClass(s.alignJustify)}
          title="Justify"
          aria-label="Justify"
          aria-pressed={s.alignJustify}
          onClick={() => chain().setTextAlign("justify").run()}
        >
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path d="M2.5 4h13M2.5 7.5h13M2.5 11h13M2.5 14.5h13" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="grp">
        <button className="tb-btn" title="Undo (⌘Z)" disabled={!s.canUndo} onClick={() => chain().undo().run()}>↺</button>
        <button className="tb-btn" title="Redo (⌘⇧Z)" disabled={!s.canRedo} onClick={() => chain().redo().run()}>↻</button>
      </div>
      {/* Text/background color (owner, 2026-08-11: "anything and everything"; consolidated to fewer
          controls 2026-08-11 toolbar-polish pass) — native `<input type="color">` swatches, no
          color-picker dependency, same "no icon dependency" spirit the align-icon SVGs above
          follow. A native color input only ever emits a strict 6-digit hex, so
          `chain().setColor()`/`setBackgroundColor()` never receive anything `safeCssColor`
          (render.ts) would reject — the allowlist there is defense-in-depth against `bodyJson`
          written some OTHER way (a direct API call, pasted content), not something this UI can
          trigger on its own. `hexOrDefault` only affects what the swatch DISPLAYS when nothing is
          selected or the current mark's color isn't a plain hex string (e.g. inherited from pasted
          `rgb(...)`/keyword content) — it never touches what gets applied on change.

          The "×" clear button used to be unconditional — a swatch AND a separate always-visible ×
          for each of text/background, four controls for two concepts, and an ambiguous glyph on
          top of that (owner: this reads as "four buttons" when it's really two ideas). Each × now
          renders ONLY while that color is actually set (`s.color !== null` / `s.backgroundColor !==
          null`, the same live cursor-state `hexOrDefault` already reads) — with nothing set, this
          row is exactly the two swatches; the clear affordance appears exactly when there is
          something to clear. Accessible names are unchanged (`aria-label`s below are verbatim what
          they were before this pass) since an existing e2e suite selects by them. */}
      <div className="grp">
        <label className="tb-color" title="Text color">
          <input
            type="color"
            aria-label="Text color"
            value={hexOrDefault(s.color, "#000000")}
            onChange={(e) => chain().setColor(e.target.value).run()}
          />
        </label>
        {s.color !== null ? (
          <button className="tb-btn" title="Clear text color" aria-label="Clear text color" onClick={() => chain().unsetColor().run()}>×</button>
        ) : null}
        <label className="tb-color" title="Background color">
          <input
            type="color"
            aria-label="Background color"
            value={hexOrDefault(s.backgroundColor, "#ffffff")}
            onChange={(e) => chain().setBackgroundColor(e.target.value).run()}
          />
        </label>
        {s.backgroundColor !== null ? (
          <button className="tb-btn" title="Clear background color" aria-label="Clear background color" onClick={() => chain().unsetBackgroundColor().run()}>×</button>
        ) : null}
      </div>
      {/* Font family/size, line height (owner, 2026-08-11: "anything and everything"; made
          self-describing 2026-08-11 toolbar-polish pass) — closed preset `<select>`s (`rules.ts`'s
          `FONT_FAMILY_OPTIONS`/`FONT_SIZE_OPTIONS`/`LINE_HEIGHT_OPTIONS`), not free-text inputs:
          every value they can produce already passes `render.ts`'s own allowlist by construction.
          `""` (the leading option every list starts with — see `rules.ts`'s own comment for exactly
          how its LABEL was derived from a live measurement) unsets the attribute entirely rather
          than setting it to an empty string.

          Each select is now paired with a short visible `.tb-select-label` (owner: three controls
          that all read "Default" gave no clue which was font/size/line-height without hovering for
          the `title`). The label is `aria-hidden` — the select's own `aria-label` below already
          carries the accessible name, so a screen reader is not told the same thing twice. */}
      <div className="grp">
        <span className="tb-select-group">
          <span className="tb-select-label" aria-hidden="true">Font</span>
          <select
            className="tb-select"
            title="Font family"
            aria-label="Font family"
            value={s.fontFamily}
            onChange={(e) => (e.target.value ? chain().setFontFamily(e.target.value).run() : chain().unsetFontFamily().run())}
          >
            {FONT_FAMILY_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </span>
        <span className="tb-select-group">
          <span className="tb-select-label" aria-hidden="true">Size</span>
          <select
            className="tb-select"
            title="Font size"
            aria-label="Font size"
            value={s.fontSize}
            onChange={(e) => (e.target.value ? chain().setFontSize(e.target.value).run() : chain().unsetFontSize().run())}
          >
            {FONT_SIZE_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </span>
        <span className="tb-select-group">
          <span className="tb-select-label" aria-hidden="true">Line</span>
          <select
            className="tb-select"
            title="Line height"
            aria-label="Line height"
            value={s.lineHeight}
            onChange={(e) => (e.target.value ? chain().setLineHeight(e.target.value).run() : chain().unsetLineHeight().run())}
          >
            {LINE_HEIGHT_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </span>
      </div>
      <div className="grp">
        {/* Single "Embed" control (quick-and-dirty pass, 2026-08-05 — owner explicitly skipped
            formal spec/ADR process for this one) replacing the previously-separate "Media" and
            "Insert widget" buttons: Form and Menu are just the `contact-form`/`menu` widget TYPES
            (`WidgetConfigFields.tsx`), not separate mechanisms, so they used to be buried behind
            "Insert widget"'s type dropdown. `EmbedInsertControl` (`components/EmbedInsertControl/EmbedInsertControl.tsx`)
            surfaces Media/Form/Menu as one-click shortcuts plus a "Widget…" choice for the rest,
            composing the same `MediaPickerDialog`/`WidgetPickerDialog`/`WidgetAddControl` pieces
            `CollectionEntryEditor.tsx`/`WidgetRegionEditor.tsx` still use directly and unchanged. */}
        <EmbedInsertControl editor={editor} />
        <button
          className="tb-btn"
          title="Insert image by URL"
          onClick={() => {
            const src = window.prompt("Image URL:");
            if (!src) return;
            const alt = window.prompt("Alt text (optional):") ?? "";
            chain().setImage({ src, alt: alt || undefined }).run();
          }}
        >
          Img by URL
        </button>
        {/* YouTube (coordinator MSG #1 licensing sweep, 2026-08-11) — same "prompt for a URL"
            idiom as "Img by URL" just above. `setYoutubeVideo` itself rejects an unrecognized URL
            (returns `false`, no-ops) before insertion — the render.ts side independently
            re-validates anyway, see `extractYoutubeVideoId`'s own doc for why. */}
        <button
          className="tb-btn"
          title="Insert YouTube video"
          onClick={() => {
            const src = window.prompt("YouTube video URL:");
            if (!src) return;
            chain().setYoutubeVideo({ src }).run();
          }}
        >
          YouTube
        </button>
        {/* Mention another post (coordinator MSG A#1 licensing sweep, 2026-08-11) — a single
            action `<select>` (`value=""` always, matching a menu-styled dropdown-button rather than
            a retained current-selection field): choosing a post inserts a mention node immediately
            and the control snaps back to its placeholder. `id` stores the mentioned post's SLUG
            (what `render.ts`'s `"mention"` case builds a link from), `label` its title. Excludes
            `currentPostId` — mentioning the post you're currently writing has no meaning. */}
        <select
          className="tb-select"
          title="Mention a post"
          aria-label="Mention a post"
          value=""
          onChange={(e) => {
            const target = mentionablePosts.find((p) => p.slug === e.target.value);
            if (!target) return;
            chain().insertContent({ type: "mention", attrs: { id: target.slug, label: target.title } }).run();
          }}
        >
          <option value="">Mention…</option>
          {mentionablePosts
            .filter((p) => p.id !== currentPostId)
            .map((p) => (
              <option key={p.id} value={p.slug}>{p.title}</option>
            ))}
        </select>
      </div>
      {/* CharacterCount (owner, 2026-08-11: "anything and everything") — a plain readout, not a
          button: nothing to click, just the live count `editor.storage.characterCount` already
          tracks. Right-aligned via `margin-left: auto` (styles.css) so it reads as status text
          trailing the row rather than one more control competing with the buttons before it. */}
      <span className="editor-toolbar-count" aria-live="polite">
        {s.characterCount} {s.characterCount === 1 ? "character" : "characters"}
      </span>
    </div>
  );
}

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
function BubbleFormattingMenu({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      underline: editor?.isActive("underline") ?? false,
      highlight: editor?.isActive("highlight") ?? false,
      link: editor?.isActive("link") ?? false,
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <BubbleMenu editor={editor} className="bubble-formatting-menu">
      <button className={toolbarBtnClass(s.bold)} title="Bold" aria-pressed={s.bold} onClick={() => chain().toggleBold().run()}><b>B</b></button>
      <button className={toolbarBtnClass(s.italic)} title="Italic" aria-pressed={s.italic} onClick={() => chain().toggleItalic().run()}><i>I</i></button>
      <button className={toolbarBtnClass(s.underline)} title="Underline" aria-pressed={s.underline} onClick={() => chain().toggleUnderline().run()}><u>U</u></button>
      <button className={toolbarBtnClass(s.highlight)} title="Highlight" aria-pressed={s.highlight} onClick={() => chain().toggleHighlight().run()}><mark>H</mark></button>
      <button
        className={toolbarBtnClass(s.link)}
        title="Link"
        aria-pressed={s.link}
        onClick={() => {
          if (s.link) {
            chain().extendMarkRange("link").unsetLink().run();
            return;
          }
          const url = window.prompt("Link URL:", "https://");
          if (!url) return;
          chain().extendMarkRange("link").setLink({ href: url }).run();
        }}
      >
        Link
      </button>
    </BubbleMenu>
  );
}

/**
 * The editor header's action row — back link, save status, the publish/save/delete buttons.
 *
 * Extracted out of `PostEditor` because this is where nearly all of that component's branching
 * lived: five independent ternaries (back-link label, the message/error spans, the publish button's
 * conditional render, and the save button's className) that don't depend on each other and don't
 * need to share scope with the body/toolbar markup below them. As a top-level function its own
 * branches are scored in their own scope instead of accumulating onto `PostEditor`'s.
 */
function PostEditorHeader({
  kindLabel,
  confirmLeave,
  message,
  error,
  status,
  setStatus,
  onPublish,
  onSave,
  onDeleteClick,
  t,
}: {
  kindLabel: "post" | "page";
  confirmLeave: () => boolean;
  message: string | null;
  error: string | null;
  status: "draft" | "published";
  setStatus: (value: "draft" | "published") => void;
  onPublish: () => void;
  onSave: () => void;
  onDeleteClick: () => void;
  t: (key: string) => string;
}) {
  return (
    <div
      className="page-header"
      {...agentHandle("post-header", {
        role: "region",
        label: "Editor header — back link, save status, publish state and the Save button",
      })}
    >
      <div className="page-header-text">
        <p className="page-kicker">{t("Content")}</p>
        <h1 className="page-title">{t(kindLabel === "page" ? "Edit page" : "Edit post")}</h1>
        <p className="page-description">
          {t(
            kindLabel === "page"
              ? "Update this page's title, body, and publish status."
              : "Update this post's title, body, and publish status.",
          )}
        </p>
      </div>
      <div className="page-actions">
        {/* Audit finding: no editor screen warns before an in-app navigation discards unsaved
            edits — confirmed live on this exact screen (edit the title, click this link, the
            edit is gone with no dialog). `preventDefault()` here also stops `router.ts`'s
            document-level click interceptor from firing `navigate()`, since that listener's
            first check is `event.defaultPrevented` — no change to `router.ts` needed. The nested
            `<button>` is styling only (matches Forms/Posts' own "back"/"new" link idiom); the
            real navigating element, its `href`, and its `onClick` guard all stay on the `<a>`.

            Kind-aware `href`/label, reusing the same `post.kind` check `remove()` already makes
            for its post-delete redirect just below — bug found during the page-header pass: this
            link used to be hardcoded to "/admin/posts"/"← Posts" even while editing a *page*, so
            it silently returned an operator to the wrong list. Deriving both from `kindLabel`
            (not two independent ternaries) is what stops them drifting apart again. */}
        <a
          href={`/admin/${kindLabel}s`}
          onClick={(e) => {
            if (!confirmLeave()) e.preventDefault();
          }}
          {...agentHandle("post-back-to-list", { role: "link", label: `Back to the list of all ${kindLabel}s` })}
        >
          <button type="button" className="btn-secondary">
            ← {kindLabel === "page" ? t("Pages") : t("Posts")}
          </button>
        </a>
        {message ? <span className="save-ok">{message}</span> : null}
        {error ? <span className="save-error">{error}</span> : null}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "draft" | "published")}
          {...agentHandle("post-status", {
            role: "field",
            label:
              "Whether this post is a draft or published — set with page.select_option, not click. " +
              "Setting to Draft unpublishes it (content is kept, just hidden from the site); this is " +
              "NOT the same as Delete, which moves the whole entry to the trash.",
          })}
        >
          <option value="draft">{t("Draft")}</option>
          <option value="published">{t("Published")}</option>
        </select>
        {/* Publish is the one-click "save this and put it live" shortcut, and only makes sense
            while there is something to publish — once `status` is already "published" (matching
            `RowMenu`'s own precedent in `Posts.tsx`, which omits "Disable" entirely for an
            already-draft row rather than showing it disabled) it disappears rather than
            rendering disabled with nothing left to do, and plain Save takes over as the primary
            action. The status select still covers the reverse direction (unpublish), unchanged. */}
        {status === "draft" ? (
          <button
            type="button"
            onClick={onPublish}
            {...agentHandle("post-publish", {
              role: "button",
              label:
                "Publish this post/page immediately — saves the current title, slug and body and " +
                "sets status to Published in one action. Only shown while the post is a draft; once " +
                "published, use Save for further edits.",
            })}
          >
            {t("Publish")}
          </button>
        ) : null}
        <button
          type="button"
          className={status === "draft" ? "btn-secondary" : undefined}
          onClick={onSave}
          {...agentHandle("post-save", { role: "button", label: "Save this post's title, slug, status and body" })}
        >
          {t("Save")}
        </button>
        <button
          type="button"
          className="btn-danger"
          onClick={onDeleteClick}
          {...agentHandle("post-delete", {
            role: "button",
            label:
              "Move this post/page to the trash — different from unpublishing (the Draft/Published " +
              "field above): the entry disappears from every list and the site. Asks for confirmation " +
              "before deleting.",
          })}
        >
          {t("Delete")}
        </button>
      </div>
    </div>
  );
}

export interface PostEditorProps {
  postId: string;
  /**
   * Dependency injection seam for tests — same convention as `Posts.tsx`'s `usePostsHook` and
   * `@jini-ai/ui`'s `useCustomSelect`.
   *
   * Defaulted to the real hook, so `panels.tsx` passes nothing. A stub lets a test render the
   * header, the status select, the Publish/Save branch and the confirm dialog without mounting
   * TipTap or serving a post — the existing suite currently has to stand up both.
   */
  usePostEditorHook?: typeof useWiredPostEditor;
}

export function PostEditor({ postId, usePostEditorHook = useWiredPostEditor }: PostEditorProps) {
  const {
    post,
    editor,
    title,
    setTitle,
    slug,
    setSlug,
    status,
    setStatus,
    templateChoice,
    setTemplateChoice,
    availableTemplates,
    mentionablePosts,
    activeThemeId,
    activeThemeTier,
    overridesThemePage,
    setOverridesThemePage,
    hasSlugCollision,
    view,
    setView,
    message,
    error,
    confirmingDelete,
    setConfirmingDelete,
    deleting,
    confirmLeave,
    dirty,
    contentDirty,
    save,
    remove,
    t,
  } = usePostEditorHook(postId);
  // View Template (2026-08-10) — called above the early returns below so hook order stays stable
  // across the loading/error/loaded renders, same reasoning as `Posts.tsx`'s `updatedSort` state.
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  if (error && !post) return <div className="notice error">{error}</div>;
  if (!post) return <div className="notice">Loading editor…</div>;

  const kindLabel = post.kind === "page" ? "page" : "post";

  return (
    <div className="page">
      <PostEditorHeader
        kindLabel={kindLabel}
        confirmLeave={confirmLeave}
        message={message}
        error={error}
        status={status}
        setStatus={setStatus}
        onPublish={() => save("published")}
        onSave={() => save()}
        onDeleteClick={() => setConfirmingDelete(true)}
        t={t}
      />
      {/* Audit finding: placeholder-only, no `<label>` — a screen reader gets nothing (title) or
          the bare `type="text"` announcement (slug, which had no placeholder either). The
          wrapping `<label>` + `.visually-hidden` text gives each a real accessible name without
          adding a visible caption above this screen's large title/slug controls (see
          `styles/editor.css`'s `.a11y-label-wrap` comment for why the wrap costs no layout). */}
      {/* Title + slug share one row (owner, 2026-08-11: "put the slug input right next to the title
          ... like we did the pages"), title capped at half the width with the slug group
          right-justified in the other half. Deliberately the same SHAPE as the Pages editor's
          `.page-title-row` but a separate class: Pages and Posts are separate features with separate
          stylesheets, and `styles/pages.css` says in its own header why their shared chrome lives in
          `editor.css` rather than being copied between them. The template picker used to keep its own
          row below this one; it now lives in the Edit/Preview toolbar row instead (see the comment on
          `.page-editor-toolbar` just below) — the row that carried it, `.editor-slug-row`, is gone. */}
      <div className="editor-title-row">
        <label className="a11y-label-wrap">
          <span className="visually-hidden">Post title</span>
          <input
            className="editor-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("Post title")}
            {...agentHandle("post-title", { role: "field", label: "This post's title" })}
          />
        </label>
        <div className="editor-slug">
          /{" "}
          <label className="a11y-label-wrap">
            <span className="visually-hidden">URL slug</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              {...agentHandle("post-slug", { role: "field", label: "URL slug this post is published at" })}
            />
          </label>
          <a
            href={siteUrl(`/${post.slug}`)}
            target="_blank"
            rel="noreferrer"
            {...agentHandle("post-view-live", { role: "link", label: "Open this post on the public site in a new tab" })}
          >
            view ↗
          </a>
          {/* The internal id used to be surfaced here as a read-only field (2026-08-10). Removed
              2026-08-11: the slug immediately to the left is now the record's routing key
              (`getAdminPostByIdOrSlug` resolves slug FIRST, id second) and is the only identity an
              author ever types or reads. Two id generators have been in play — seed literals like
              `post-about` and `idGen.newId()` UUIDs — so the stored id is neither stable in shape
              nor meaningful, and displaying it beside the real handle presented an implementation
              detail as though it were the record's identity. It is still reachable through the API
              and the row list; it just no longer competes with the slug for the author's attention. */}
        </div>
      </div>
      {/* Edit/Preview toolbar (2026-08-11, owner: "Let's have a preview button... a tab that shows
          either tiptap so they can edit, or how it looks when it's rendered" + "Keeping the template
          chooser on the right... that's how the others work"). Deliberately the SAME structure as
          the Pages editor's `.page-editor-toolbar` (`features/pages/PageEditor.tsx`) — tabs left,
          `.page-editor-toolbar-end` right — reusing its classes directly (`styles/pages.css`) rather
          than parallel Post-only ones: those classes already have a second consumer beyond Pages
          (`ThemeExplore.tsx`), so this is a third, not a fork. The template picker moved into
          `.page-editor-toolbar-end` verbatim from the old `.editor-slug-row` below it — only its
          MARKUP location changed; where its options/value come from is untouched (a concurrent
          agent owns that wiring). */}
      <div className="page-editor-toolbar">
        <div className="segmented" role="tablist" aria-label="Editor view">
          {VIEWS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={view === entry.key}
              className={view === entry.key ? "is-active" : undefined}
              onClick={() => setView(entry.key)}
            >
              {t(entry.label)}
            </button>
          ))}
        </div>
        <div className="page-editor-toolbar-end">
          {/* Post-template-picker feature (2026-08-10) — rendered whenever this is a Post/
              formulaic-body record (`bodyFormat: "doc"`), not an `"html"`-format Page — a Page's body
              IS its own design already (see `resolveHtmlEmbedsForRender`'s own doc), so it has nothing
              to pick between. Untranslated (`t()` falls back to the raw key, same graceful-degrade
              every other string on this screen already relies on) — this repo's i18n dictionaries
              cover 19 locales and adding this feature's strings to all of them is out of scope for
              this pass; disclosed rather than silently skipped.

              Options list real templates FIRST, "No template chosen" LAST (owner's own ordering
              request) — matches `theme.json`'s own `postTemplate` doc ("ordered to nudge the right
              choice"): opting OUT is the one deliberate action, not the default you land on. The
              SELECTED value defaults to the first template too when nothing has been chosen yet (see
              the load effect below) — an author only ever sees "No template chosen" selected if they
              (or a prior save) explicitly picked it.

              When the active theme declares zero templates, the row previously vanished entirely
              (owner feedback, 2026-08-09: "it makes sense... but it should still be there" — an empty
              theme should read as "nothing to choose" in the UI, not disappear as if the feature
              itself weren't there). Renders a disabled control with a one-line explanation instead.

              Rendered regardless of `view` — same as Pages' own picker — because the template choice
              is a publish-time setting, not something specific to either tab. */}
          {(post.bodyFormat ?? "doc") === "doc" ? (
            <div className="editor-template-picker">
              <label className="a11y-label-wrap">
                <span className="visually-hidden">{t("Template")}</span>
              </label>
              {availableTemplates.length > 0 ? (
                <select
                  value={templateChoice ?? ""}
                  // `e.target.value`, NOT `|| null` — "No template chosen" must persist as `""`
                  // (explicitly opted out), which `resolveTemplate` treats differently from `null`
                  // (never chosen → falls back to the first template). Coercing to `null` here is what
                  // made the two indistinguishable and served 15 posts a diagnostic page.
                  onChange={(e) => setTemplateChoice(e.target.value)}
                  {...agentHandle("post-template-choice", {
                    role: "field",
                    label:
                      "Which theme page template this post renders through on the public site. " +
                      "Setting this to \"No template chosen\" shows a diagnostic page instead of the post, " +
                      "not a silent fallback to generic rendering.",
                  })}
                >
                  {availableTemplates.map((template) => (
                    <option key={template} value={template}>
                      {template}
                    </option>
                  ))}
                  <option value="">{t("No template chosen")}</option>
                </select>
              ) : null}
              {availableTemplates.length > 0 ? (
                // Read-only inspection, not editing (`PostTemplateModal.tsx`'s own file header —
                // "I just wanna see it" is the owner's own framing). Disabled rather than hidden
                // when nothing is chosen: an operator who opted out via "No template chosen" (`""`)
                // still sees the control, just inert, matching this screen's own precedent for the
                // theme-with-zero-templates `<select>` above rather than the row disappearing.
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!templateChoice}
                  onClick={() => setShowTemplateModal(true)}
                  {...agentHandle("post-view-template", {
                    role: "button",
                    label: "Open a read-only view of the selected template's HTML source. Nothing here is editable.",
                  })}
                >
                  {t("View Template")}
                </button>
              ) : (
                <select
                  disabled
                  value=""
                  {...agentHandle("post-template-choice", {
                    role: "field",
                    label: "The active theme declares no post templates, so there is nothing to choose here.",
                  })}
                >
                  <option value="">{t("No templates for this theme")}</option>
                </select>
              )}
            </div>
          ) : null}
        </div>
      </div>
      {/* Slug-collision override (2026-08-10) — surfaced live this session: a post at slug "about"
          was silently unreachable because the active theme ships its own pages/about.html at the
          same slug, and the theme page always won with zero indication why. Warn explicitly rather
          than let an author discover this by visiting the public URL and finding their post missing. */}
      {hasSlugCollision ? (
        <div className="notice warning" {...agentHandle("post-slug-collision-warning", {
          role: "region",
          label: "Warning: this post's slug is claimed by the active theme's own page",
        })}>
          <p>
            {t("The active theme has its own page at this slug — it will be shown instead of this post.")}
          </p>
          <label>
            <input
              type="checkbox"
              checked={overridesThemePage}
              onChange={(e) => setOverridesThemePage(e.target.checked)}
              {...agentHandle("post-override-theme-page", {
                role: "field",
                label: "Show this post instead of the active theme's own same-slug page",
              })}
            />
            {" "}
            {t("Show this post instead")}
          </label>
        </div>
      ) : null}
      {view === "preview" ? (
        // `editor.getHTML()` read fresh every render, same idiom the hook already uses for
        // `editor.getJSON()` in its own dirty comparison — TipTap's content lives in the editor's
        // own imperative state, and `onUpdate`'s `bodyVersion` bump is what makes this re-evaluate
        // after a keystroke rather than going stale.
        <PostPreview
          id={post.id}
          bodyHtml={editor?.getHTML() ?? ""}
          slug={slug}
          status={status}
          dirty={dirty}
          contentDirty={contentDirty}
          templateChoice={templateChoice}
        />
      ) : (
        <div
          className="editor-shell post-editor-pane"
          {...agentHandle("post-editor-shell", {
            role: "region",
            label: "Formatting toolbar and the post body editor",
          })}
        >
          {editor ? <Toolbar editor={editor} mentionablePosts={mentionablePosts} currentPostId={post.id} /> : null}
          {editor ? <BubbleFormattingMenu editor={editor} /> : null}
          {/* Drag handle (owner, 2026-08-11: "anything and everything") — a grip icon that appears
              beside whichever top-level block the cursor is hovering, letting an author reorder
              blocks by dragging instead of cut/paste. `nested` left at its `false` default: this is
              the "quickest thing that works" pass every other plain-toggle-button addition this
              dispatch made follows, not a stated requirement for reordering INSIDE a list/table/etc. */}
          {editor ? (
            <DragHandle editor={editor}>
              <div className="editor-drag-handle" title="Drag to reorder" aria-hidden="true">
                <svg viewBox="0 0 18 18" fill="currentColor">
                  <circle cx="6" cy="4" r="1.3" />
                  <circle cx="12" cy="4" r="1.3" />
                  <circle cx="6" cy="9" r="1.3" />
                  <circle cx="12" cy="9" r="1.3" />
                  <circle cx="6" cy="14" r="1.3" />
                  <circle cx="12" cy="14" r="1.3" />
                </svg>
              </div>
            </DragHandle>
          ) : null}
          {/* `role: "field"` rather than `region`: this is a TipTap `contenteditable`, which the
              page driver treats as a fillable rich-text surface (see its `isEditableRegion`), so an
              agent can read and write the body through the same field verbs it uses for an input. */}
          <div
            className="editor-body"
            {...agentHandle("post-body", { role: "field", label: "The post's rich-text body content" })}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmingDelete}
        title={t("Move to trash?")}
        body={
          <p>
            {t(kindLabel === "page" ? "Move this page" : "Move this post")} (&quot;{post.title}&quot;){" "}
            {t(
              kindLabel === "page"
                ? "to trash? It will disappear from the site and from the pages list."
                : "to trash? It will disappear from the site and from the posts list.",
            )}
          </p>
        }
        confirmLabel={t("Move to trash")}
        destructive
        pending={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmingDelete(false)}
      />
      {/* Conditionally mounted, not always-mounted-with-`open`: `PreviewModalShell` is a plain
          fixed-position overlay `<div>` (see its own file header), not the native `<dialog>`
          `ConfirmDialog` above wraps — there is no `open` prop to toggle, so this follows
          `AgentPluginDetailsModal`'s own call site (`AgentPlugins.tsx`) instead. `templateChoice`
          and `activeThemeId` are re-checked here (not just at the button's `disabled`) so this can
          never render with an empty/`null` URL segment even if state changes out from under an
          already-open modal. */}
      {showTemplateModal && templateChoice && activeThemeId ? (
        <PostTemplateModal
          themeId={activeThemeId}
          themeTier={activeThemeTier}
          templateFilename={templateChoice}
          onClose={() => setShowTemplateModal(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * Renders the post the way the Preview tab shows it — mirrors `features/pages/PageEditor.tsx`'s
 * `PagePreview`, same three-way branching rule and same reasoning (see that function's own doc for
 * the full explanation; `ADS-memory/reports/implementation/2026-08-11-html-view-and-preview.md` has
 * the original decision record this repeats, and `2026-08-11-template-preview-render-bug.md` has the
 * template-preview fix below):
 *
 * 1. **Live site** (`status === "published" && !dirty`): iframes the real public URL (`siteUrl`, the
 *    same helper the "view ↗" link already uses) — the exact response a visitor gets,
 *    template/theme CSS/nav/footer/widget resolution and all.
 * 2. **Template preview, own fix (2026-08-11)** (`status === "published" && !contentDirty`, i.e.
 *    title/slug/status/body/`overridesThemePage` all match what's saved and the post IS published —
 *    only `templateChoice` is pending): iframes `api.templatePreviewUrl`, the SAME real render
 *    pipeline as branch 1, looked up by id instead of by public slug. This is the fix, and exactly the
 *    reported bug's own repro: picking a template from the dropdown correctly marks `dirty`, which
 *    used to fall the preview all the way back to branch 3 regardless of which template was picked
 *    (that fallback never read `templateChoice` at all). Gated on `status === "published"` rather than
 *    just `!contentDirty` — a draft's own body does not survive this same render pipeline intact (a
 *    disclosed, separate limitation in the shared "content" marker resolver's visibility guard; see
 *    `ADS-memory/reports/implementation/2026-08-11-template-preview-render-bug.md` for the full
 *    root-cause writeup and why widening this to drafts was deliberately not attempted).
 * 3. **Raw fallback** (everything else — a draft, regardless of its own dirtiness, or a published post
 *    with `contentDirty`, i.e. the operator actually edited title/slug/status/body/
 *    `overridesThemePage`): nothing at the public URL or the template-preview endpoint reflects a
 *    draft or unsaved edits, so this renders the LIVE EDITOR BUFFER instead. Unlike Pages (whose body
 *    already IS raw HTML), a post's body is TipTap `bodyJson`, so `bodyHtml` comes from
 *    `editor.getHTML()` — TipTap's own client-side serializer, not the server's `renderDocNode` — fed
 *    into the same sandboxed `SrcDocSandbox` Pages' fallback uses. This is a deliberately shallower
 *    render than the real one (plain marks-to-tags only: no widget resolution, no media-transform
 *    URLs, no theme wrapper) — disclosed as a rough shape/content check, not parity, for the same
 *    reason the live-site branch exists: building a second `renderDocNode` here would be the
 *    duplication this whole approach is chosen to avoid.
 *
 * No device-width scaling here (unlike `PagePreview`) — that machinery exists so an operator can
 * preview a page at Desktop/Tablet/Mobile widths, which nothing in this dispatch asked for on the
 * Post side; the frame simply fills the pane at its natural width, same as the Tiptap editor above
 * it always has.
 */
function PostPreview({
  id,
  bodyHtml,
  slug,
  status,
  dirty,
  contentDirty,
  templateChoice,
}: {
  id: string;
  bodyHtml: string;
  slug: string;
  status: "draft" | "published";
  dirty: boolean;
  contentDirty: boolean;
  templateChoice: string | null;
}) {
  const canShowLiveSite = status === "published" && !dirty;
  // Template-preview fix (2026-08-11) — see this function's own doc, branch 2, for why `status ===
  // "published"` is required here rather than just `!contentDirty`.
  const canShowTemplatePreview = status === "published" && !contentDirty && !canShowLiveSite;

  return (
    <>
      <div className="editor-shell post-editor-pane">
        {canShowLiveSite ? (
          <iframe
            src={siteUrl(`/${slug}`)}
            title="Post preview"
            className="editor-preview-iframe"
            referrerPolicy="no-referrer"
          />
        ) : canShowTemplatePreview ? (
          <iframe
            src={api.templatePreviewUrl(id, templateChoice)}
            title="Post preview"
            className="editor-preview-iframe"
            referrerPolicy="no-referrer"
          />
        ) : (
          <SrcDocSandbox html={bodyHtml} title="Post preview" className="editor-preview-iframe" />
        )}
      </div>
      {canShowLiveSite ? null : (
        <p className="editor-preview-notice">
          {canShowTemplatePreview
            ? "Previewing your saved content through the newly selected template — save to update the live post."
            : status !== "published"
              ? "This is a rough render of the editor buffer only — publish this post to preview it with the theme's real template and CSS."
              : "This is a rough render of the editor buffer only — save your changes to preview them with the theme's real template and CSS."}
        </p>
      )}
    </>
  );
}
