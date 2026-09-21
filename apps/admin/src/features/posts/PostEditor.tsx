import type { RefObject } from "react";
import { EditorContent, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { agentHandle } from "@jini-ai/agentic";
import { ConfirmDialog } from "@jini-ai/admin/react";

import { EmbedInsertControl } from "../../components/EmbedInsertControl/EmbedInsertControl";
import { resolveTabBarTabIndex, useTabBarKeyboard } from "../../components/TabBar.hooks";
import type { AdminPost, ThemeTier } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import { siteUrl } from "../../lib/site-url";
import type {
  StandingDraftAutosaveSnapshot,
  StandingDraftStaleBasis,
} from "../../hooks/use-standing-draft-autosave.hooks";
import { useWiredPostEditor, type PostEditorView } from "./hooks/use-post-editor.hooks";
import { PostTemplateModal } from "./PostTemplateModal";
import {
  toolbarBtnClass,
  hexOrDefault,
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  CODE_LANGUAGE_OPTIONS,
  isAutosaveDraftStale,
  overridesThemePageFromSelectValue,
  postAutosaveBannerMessage,
  resolvePostPreviewBranches,
  postAutosaveStaleBasisMessage,
  postVersionConflictMessage,
  type PostSaveConflict,
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
const VIEWS: ReadonlyArray<{ key: PostEditorView; label: string; handle: string; agentLabel: string }> = [
  // "Editor", not "Edit" (owner, 2026-08-11): the pair names two VIEWS of the same post, so both
  // labels should be nouns. "Edit" alongside "Preview" reads as a verb next to a noun, and collides
  // with the post-list row menu's own "Edit" ACTION (`rules.ts`), which does something different.
  //
  // `handle`/`agentLabel` (2026-09-15, preview-fullscreen dispatch) — these two tabs previously
  // carried no `agentHandle` at all, so `page.find_elements` never reported them and the assistant
  // could open a post's editor but never switch it to Preview. `agentLabel` names what each view
  // SHOWS (an agent reads it, never sees the tab), not the library ("Tiptap" never appears here
  // either) — same "product-facing, not implementation-facing" rule this file's own doc comment
  // states for `label`.
  { key: "edit", label: "Editor", handle: "post-view-edit", agentLabel: "Switch to the rich-text editor for this post" },
  { key: "preview", label: "Preview", handle: "post-view-preview", agentLabel: "Switch to a rendered preview of how this post looks on the site" },
];

/** {@link VIEWS} carrying the `id` that `TabBar.hooks.tsx`'s WAI-ARIA tabs helpers key on, so this
 *  hand-rolled `role="tablist"` row gets the same arrow/Home/End keys and roving tab stop `TabBar`
 *  and the Page editor's own view row have (a35ce9f12, 3da7686cc) without becoming a `<TabBar>`:
 *  the `.segmented` pill row is a different visual control, only the keyboard contract is shared.
 *  Spread, not rebuilt, so nothing in the JSX below has to change which field it reads. */
const VIEW_TABS = VIEWS.map((entry) => ({ ...entry, id: entry.key }));

/**
 * Per-field probes for `Toolbar`'s `useEditorState` selector below. Each probe takes a
 * non-null `Editor` — the selector only ever needs ONE `editor === null` check (before TipTap has
 * mounted), made once in `probeToolbar`, rather than the ~40 repetitions of `editor?.<probe>() ??
 * <default>` this table replaces (complexity-ceiling pass, 2026-08-20; superseded a prior EXEMPTION
 * comment here that argued this selector had nothing left to extract — see
 * `ADS-memory/reports/2026-08-20-false-code-comments-register.md` entry 8). A `??` fallback that
 * remains inside a probe below (codeBlockLanguage, color, backgroundColor, fontFamily, fontSize,
 * lineHeight, characterCount) is a REAL per-field default — an unset mark attribute or a storage
 * field from an extension that may not be registered — not a stand-in for the null-editor check.
 */
const TOOLBAR_PROBES = {
  bold: (editor: Editor) => editor.isActive("bold"),
  italic: (editor: Editor) => editor.isActive("italic"),
  strike: (editor: Editor) => editor.isActive("strike"),
  underline: (editor: Editor) => editor.isActive("underline"),
  highlight: (editor: Editor) => editor.isActive("highlight"),
  subscript: (editor: Editor) => editor.isActive("subscript"),
  superscript: (editor: Editor) => editor.isActive("superscript"),
  code: (editor: Editor) => editor.isActive("code"),
  link: (editor: Editor) => editor.isActive("link"),
  h1: (editor: Editor) => editor.isActive("heading", { level: 1 }),
  h2: (editor: Editor) => editor.isActive("heading", { level: 2 }),
  h3: (editor: Editor) => editor.isActive("heading", { level: 3 }),
  bullet: (editor: Editor) => editor.isActive("bulletList"),
  ordered: (editor: Editor) => editor.isActive("orderedList"),
  taskList: (editor: Editor) => editor.isActive("taskList"),
  quote: (editor: Editor) => editor.isActive("blockquote"),
  codeBlock: (editor: Editor) => editor.isActive("codeBlock"),
  // `getAttributes`, not `isActive` — same `color`/`fontFamily` shape below: the language
  // picker below needs to know WHICH language is active, not just whether a code block is.
  // Defaults to `"plaintext"` (a real registered lowlight language, not an empty sentinel)
  // since that's also `CodeBlockLowlight`'s own default when a code block has no language set.
  codeBlockLanguage: (editor: Editor) =>
    (editor.getAttributes("codeBlock").language as string | undefined) ?? "plaintext",
  alignLeft: (editor: Editor) => editor.isActive({ textAlign: "left" }),
  alignCenter: (editor: Editor) => editor.isActive({ textAlign: "center" }),
  alignRight: (editor: Editor) => editor.isActive({ textAlign: "right" }),
  alignJustify: (editor: Editor) => editor.isActive({ textAlign: "justify" }),
  // `getAttributes`, not `isActive` — a color isn't a boolean toggle, it's the current cursor's
  // `textStyle` mark attrs (or `{}` with nothing selected/no color set), which is exactly what
  // the two color-input swatches below need to reflect the right swatch as the selection moves.
  color: (editor: Editor) => (editor.getAttributes("textStyle").color as string | undefined) ?? null,
  backgroundColor: (editor: Editor) =>
    (editor.getAttributes("textStyle").backgroundColor as string | undefined) ?? null,
  fontFamily: (editor: Editor) => (editor.getAttributes("textStyle").fontFamily as string | undefined) ?? "",
  fontSize: (editor: Editor) => (editor.getAttributes("textStyle").fontSize as string | undefined) ?? "",
  lineHeight: (editor: Editor) => (editor.getAttributes("textStyle").lineHeight as string | undefined) ?? "",
  canUndo: (editor: Editor) => editor.can().undo(),
  canRedo: (editor: Editor) => editor.can().redo(),
  // CharacterCount (2026-08-11) — `storage`, not a command/attr: the extension only tracks
  // `state.doc`, so this reads its live count the same way `canUndo`/`canRedo` read
  // `editor.can()` rather than `isActive`.
  characterCount: (editor: Editor) => editor.storage.characterCount?.characters() ?? 0,
} as const satisfies Record<string, (editor: Editor) => unknown>;

/** The shape `probeToolbar` returns — one field per `TOOLBAR_PROBES` entry, each typed by that
 *  entry's own inferred return type (so `s.bold` stays `boolean`, `s.color` stays `string | null`,
 *  etc. — exported only for `PostEditor.toolbar-probes.unit.test.ts`, not consumed elsewhere). */
export type ToolbarState = { [K in keyof typeof TOOLBAR_PROBES]: ReturnType<(typeof TOOLBAR_PROBES)[K]> };

/** `editor === null` defaults — every field's fallback from before TipTap mounts, unchanged from
 *  the old inline selector's own `?? <default>` values. Exported only for the characterization
 *  test's field-by-field diff. */
export const TOOLBAR_DEFAULTS: ToolbarState = {
  bold: false,
  italic: false,
  strike: false,
  underline: false,
  highlight: false,
  subscript: false,
  superscript: false,
  code: false,
  link: false,
  h1: false,
  h2: false,
  h3: false,
  bullet: false,
  ordered: false,
  taskList: false,
  quote: false,
  codeBlock: false,
  codeBlockLanguage: "plaintext",
  alignLeft: false,
  alignCenter: false,
  alignRight: false,
  alignJustify: false,
  color: null,
  backgroundColor: null,
  fontFamily: "",
  fontSize: "",
  lineHeight: "",
  canUndo: false,
  canRedo: false,
  characterCount: 0,
};

/**
 * Runs every probe in `TOOLBAR_PROBES` against a live editor, returning ONE flat object — the
 * single `editor === null` check this table exists to hoist out of the ~40 repeated
 * `editor?.<probe>() ?? <default>` fallbacks the old inline selector had. `Toolbar`'s own
 * `useEditorState` still calls this from ONE selector (`selector: ({ editor }) =>
 * probeToolbar(editor)`), so batching is untouched: `Toolbar` still re-renders once per relevant
 * editor state change, not once per field — splitting into multiple `useEditorState` calls was
 * considered and rejected for exactly that reason (see this file's `BubbleFormattingMenu`, which
 * legitimately needs its own separate call because it mounts independently, not because sharing
 * one selector across components is fine).
 */
export function probeToolbar(editor: Editor | null): ToolbarState {
  if (!editor) return TOOLBAR_DEFAULTS;
  const keys = Object.keys(TOOLBAR_PROBES) as (keyof typeof TOOLBAR_PROBES)[];
  const entries = keys.map((key) => [key, TOOLBAR_PROBES[key](editor)] as const);
  return Object.fromEntries(entries) as ToolbarState;
}

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
    selector: ({ editor }) => probeToolbar(editor),
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
        {/* "Insert image by URL" — REMOVED and then RESTORED on 2026-08-12, same day. Read this before
            removing it again.
            It writes a node carrying only `attrs.src`. `render.ts`'s `"image"` case historically never
            read `src` (ADR-027 §4/D7), so the control looked like it worked in the editor and silently
            rendered a placeholder on the live site — that part of the bug report was real.
            The first fix removed the control. The owner reversed that: *"I don't wanna remove the image
            by URL… why is that even bad to refuse an attribute source? If the user is saying they want
            it, why bar it?"* He is right, and the blanket refusal was the actual defect. This file
            already had the correct pattern for exactly this problem — `safeHref` (render.ts) does not
            REFUSE link hrefs, it validates the scheme and passes good ones through. The image case was
            the outlier in refusing everything.
            So `render.ts` now has `safeImageSrc`, the image-shaped sibling of `safeHref`: an `https?:`
            allowlist that rejects `javascript:`/`data:`/`blob:`/`file:` and the app's own authenticated
            admin media URLs, degrading anything else to the same visible placeholder as before.
            NOTE the rejected alternative and why it is NOT the cheap option it sounds like: fetching
            the URL server-side to mint a real `{assetId, transformName}` ref would need `src/platform/http`
            (ADR-038), which buffers responses as UTF-8 TEXT (`transport.fetch.ts`'s `bodyText`) and
            would corrupt binary image bytes. It would also introduce SSRF surface that scheme
            validation does not — because with validation the SERVER never fetches anything; the
            reader's browser loads the URL directly. */}
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
        {/* YouTube (coordinator MSG #1 licensing sweep, 2026-08-11) — a "prompt for a URL" idiom, the
            same shape as "Insert image by URL" just above.
            `setYoutubeVideo` itself rejects an unrecognized URL
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
/**
 * `BubbleFormattingMenu`'s own probe table (complexity-ceiling pass, 2026-08-20) — kept independent
 * from `TOOLBAR_PROBES` above rather than sharing entries: this menu's own file-header doc already
 * states why it needs its own `useEditorState` call (it mounts independently of `Toolbar`, only
 * while there is a selection), and a separate table keeps that independence explicit instead of an
 * implicit shared lookup two components both reach into. Same shape as `TOOLBAR_PROBES` — a
 * non-null-`Editor` probe per field, one `editor === null` check hoisted into `probeBubbleMenu`
 * below — just five plain `isActive(name)` fields, none of the `getAttributes`/`can()`/`storage`
 * variety `Toolbar` also has.
 */
const BUBBLE_MENU_PROBES = {
  bold: (editor: Editor) => editor.isActive("bold"),
  italic: (editor: Editor) => editor.isActive("italic"),
  underline: (editor: Editor) => editor.isActive("underline"),
  highlight: (editor: Editor) => editor.isActive("highlight"),
  link: (editor: Editor) => editor.isActive("link"),
} as const satisfies Record<string, (editor: Editor) => unknown>;

/** The shape `probeBubbleMenu` returns — exported only for the characterization test. */
export type BubbleMenuState = { [K in keyof typeof BUBBLE_MENU_PROBES]: ReturnType<(typeof BUBBLE_MENU_PROBES)[K]> };

/** `editor === null` defaults, unchanged from the old inline selector's own `?? false`s — exported
 *  only for the characterization test's field-by-field diff. */
export const BUBBLE_MENU_DEFAULTS: BubbleMenuState = {
  bold: false,
  italic: false,
  underline: false,
  highlight: false,
  link: false,
};

/** Same "one early return replaces N repeated null checks" shape as `probeToolbar` above, scaled
 *  down to this menu's five fields. */
export function probeBubbleMenu(editor: Editor | null): BubbleMenuState {
  if (!editor) return BUBBLE_MENU_DEFAULTS;
  const keys = Object.keys(BUBBLE_MENU_PROBES) as (keyof typeof BUBBLE_MENU_PROBES)[];
  const entries = keys.map((key) => [key, BUBBLE_MENU_PROBES[key](editor)] as const);
  return Object.fromEntries(entries) as BubbleMenuState;
}

function BubbleFormattingMenu({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor }) => probeBubbleMenu(editor),
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
 * The editor header — the back link and the kicker/title/description block, and since the
 * 2026-09-06 layout experiment nothing else: the save status, status select and the
 * publish/save/delete buttons moved out to `PostEditorActions` below the toolbar.
 *
 * Most of the branching this doc used to describe went with them; see `PostEditorActions`. What
 * stays is the back link's kind-aware `href`/label pair and its unsaved-work guard, which is why
 * `kindLabel`, `confirmLeave` and `t` are the props that remained.
 */
function PostEditorHeader({
  kindLabel,
  confirmLeave,
  t,
}: {
  kindLabel: "post" | "page";
  confirmLeave: () => boolean;
  t: Translate;
}) {
  return (
    // `page-header-split` (a modifier on the shared `.page-header`, `styles.css`) is the
    // 2026-09-06 layout experiment, applied to BOTH editors rather than only Pages: these two
    // headers are the same row rendered by two components, and an operator moving between a post
    // and a page would otherwise find the back link jumping sides. The header's right rail is
    // deliberately EMPTY now that the actions live below the toolbar — see that modifier's own
    // comment for why the empty rail has to stay reserved.
    <div
      className="page-header page-header-split"
      {...agentHandle("post-header", {
        role: "region",
        label:
          "Editor header — the back link and the post/page title. Save, Delete and the " +
          "Draft/Published field are NOT here: they are in the action row below the view toolbar.",
      })}
    >
      {/* Left rail — the back link on its own, ahead of the title in DOM order as well as
          visually, so tab order and the reading order match what is on screen. */}
      <div className="page-header-lead">
        {/* Audit finding: no editor screen warns before an in-app navigation discards unsaved
            edits — confirmed live on this exact screen (edit the title, click this link, the
            edit is gone with no dialog). `preventDefault()` here also stops `router.ts`'s
            document-level click interceptor from firing `navigate()`, since that listener's
            first check is `event.defaultPrevented` — no change to `router.ts` needed. `btn-secondary`
            sits directly on this `<a>` (matches Forms/Posts' own "back"/"new" link idiom); a nested
            `<button>` used to carry that class instead, which is invalid HTML — `<a>` has no
            interactive content model — so it moved onto the real navigating element itself.

            Kind-aware `href`/label, reusing the same `post.kind` check `remove()` already makes
            for its post-delete redirect just below — bug found during the page-header pass: this
            link used to be hardcoded to "/admin/posts"/"← Posts" even while editing a *page*, so
            it silently returned an operator to the wrong list. Deriving both from `kindLabel`
            (not two independent ternaries) is what stops them drifting apart again. */}
        <a
          className="btn-secondary"
          href={`/admin/${kindLabel}s`}
          onClick={(e) => {
            if (!confirmLeave()) e.preventDefault();
          }}
          {...agentHandle("post-back-to-list", { role: "link", label: `Back to the list of all ${kindLabel}s` })}
        >
          ← {kindLabel === "page" ? t("Pages") : t("Posts")}
        </a>
      </div>
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
    </div>
  );
}

/**
 * Standing-draft autosave (2026-09-06) — the "restore or discard" recovery banner. Never rendered
 * unless `usePostEditor` found a parked draft on mount (`recoverableDraft`); never applies it on its
 * own — both buttons require an explicit click, per the owner's own worry about silently clobbering
 * a different tab/operator's work. `postAutosaveBannerMessage`/`isAutosaveDraftStale` (`rules.ts`)
 * own the actual wording decision so this component stays markup only. Mirrors
 * `features/pages/PageEditor.tsx`'s identical `PageAutosaveRecoveryBanner`, `agentHandle`-tagged
 * and copy-through-`t` because this screen already uses both throughout, unlike Pages'.
 */
function PostAutosaveRecoveryBanner({
  recoverableDraft,
  currentVersion,
  onRestore,
  onDiscard,
  t,
}: {
  recoverableDraft: StandingDraftAutosaveSnapshot;
  currentVersion: number;
  onRestore: () => void;
  onDiscard: () => void;
  t: Translate;
}) {
  const stale = isAutosaveDraftStale(recoverableDraft.baseVersion, currentVersion);
  return (
    <div
      className="notice warning"
      {...agentHandle("post-autosave-recovery", {
        role: "region",
        label: "An unsaved draft from a previous session was found — restore it or discard it",
      })}
    >
      <p>{postAutosaveBannerMessage(recoverableDraft.savedAt, Date.now(), stale)}</p>
      <button
        type="button"
        className="btn-secondary"
        onClick={onRestore}
        {...agentHandle("post-autosave-restore", { role: "button", label: "Apply the recovered draft into the editor" })}
      >
        {t("Restore")}
      </button>
      <button
        type="button"
        className="btn-secondary"
        onClick={onDiscard}
        {...agentHandle("post-autosave-discard", { role: "button", label: "Discard the recovered draft without applying it" })}
      >
        {t("Discard")}
      </button>
    </div>
  );
}

/**
 * Standing-draft autosave — the STALE-BASIS notice (2026-09-06). Mirrors
 * `features/pages/PageEditor.tsx`'s identical `PageAutosaveStaleBanner`; both editors share
 * `useStandingDraftAutosave`, so a notice in only one of them leaves the other silent.
 *
 * Three neighbouring banners on this screen, three genuinely different facts:
 * - `PostAutosaveRecoveryBanner` — work found parked from a PREVIOUS session, offered back.
 * - `PostVersionConflictBanner` — an EXPLICIT Save the server rejected, with a way past it.
 * - this one — BACKGROUND autosaving has stopped for the session happening right now, because
 *   another operator's save moved this post's version out from under this tab. Until it existed the
 *   operator had no way to know: the editor looked completely normal while every write it made was
 *   being thrown away. `postAutosaveStaleBasisMessage` (`rules.ts`) owns the wording so this
 *   component stays markup only.
 *
 * NO buttons, deliberately, and this is the one design decision here worth defending:
 * - A "Dismiss" would let the operator silence a warning that is still true, putting them straight
 *   back into the silent data loss this whole path exists to end. The notice clears by itself when
 *   autosaving actually resumes (`usePostEditor`'s `autosaveStaleBasis` goes null once a write is
 *   accepted on a fresh basis) and at no other time, so it can never be lying while it is on screen.
 *   `PostVersionConflictBanner`'s own Dismiss is not a precedent for one here: that banner reports a
 *   single finished request, while this reports a condition that is still true as it is read.
 * - A "Reload" would wipe the operator's typed text out of the editor on their behalf. Their only
 *   remaining copy would then be the shared hook's best-effort browser-storage mirror, which is not
 *   a guarantee this component can make on their behalf (`localStorage` throws outright in some
 *   privacy modes). The message tells them to copy their work first and leaves the choice with them.
 *
 * No `t` prop, matching `postAutosaveStaleBasisMessage`'s own interpolated-copy convention — there
 * is no button label here for `t` to resolve.
 */
function PostAutosaveStaleBanner({ staleBasis }: { staleBasis: StandingDraftStaleBasis }) {
  return (
    <div
      className="notice warning"
      {...agentHandle("post-autosave-stale", {
        role: "region",
        label:
          "Another operator saved this while you were editing — autosaving has stopped, and your " +
          "unsaved changes are still here in the editor",
      })}
    >
      <p>{postAutosaveStaleBasisMessage(staleBasis)}</p>
    </div>
  );
}

/**
 * Optimistic concurrency (2026-09-06) — the "someone else saved while you were editing" banner.
 * Rendered only after a save was actually rejected with `409 VERSION_CONFLICT`; never on load, and
 * never for the slug-uniqueness 409 the same route can also return (see `rules.ts`'s
 * `readPostVersionConflict` for the distinction the server's `code` makes possible).
 *
 * Deliberately does NOT show the other operator's content, offer a diff, or replace anything in the
 * editor: the operator's own typed work is still on screen untouched, which is the single most
 * important property of this whole path. `postVersionConflictMessage` (`rules.ts`) owns the wording
 * so this component stays markup only, same split `PostAutosaveRecoveryBanner` above already uses.
 *
 * "Save anyway" is the only way past the conflict, and that is on purpose: the plain Save button
 * keeps failing until the operator explicitly chooses to replace the other version.
 */
function PostVersionConflictBanner({
  saveConflict,
  onSaveAnyway,
  onDismiss,
  t,
}: {
  saveConflict: PostSaveConflict;
  onSaveAnyway: () => void;
  onDismiss: () => void;
  t: Translate;
}) {
  return (
    <div
      className="notice error"
      {...agentHandle("post-version-conflict", {
        role: "region",
        label: "Another operator saved this while you were editing — your changes are unsaved and still in the editor",
      })}
    >
      <p>{postVersionConflictMessage(saveConflict)}</p>
      <button
        type="button"
        className="btn-secondary"
        onClick={onSaveAnyway}
        {...agentHandle("post-version-conflict-overwrite", {
          role: "button",
          label: "Save these changes anyway, replacing the version the other operator saved",
        })}
      >
        {t("Save anyway")}
      </button>
      <button
        type="button"
        className="btn-secondary"
        onClick={onDismiss}
        {...agentHandle("post-version-conflict-dismiss", {
          role: "button",
          label: "Hide this notice and keep editing without saving",
        })}
      >
        {t("Keep editing")}
      </button>
    </div>
  );
}

/**
 * The status select, save feedback and the publish/save/delete buttons — their own row, below the
 * view/template toolbar rather than in the header (owner request, 2026-09-06: "put the published
 * save and delete buttons under the gray desktop/tablet/mobile row").
 *
 * This is where most of `PostEditorHeader`'s branching went when the controls moved: the
 * message/error spans, the publish button's conditional render, and the save button's className.
 * As a top-level function they are scored in their own scope instead of accumulating onto
 * `PostEditor`'s or the header's.
 *
 * `.editor-action-row` (`styles.css`) is shared with `features/pages/PageEditor.tsx`'s own
 * `PageEditorActions`, but the two components are deliberately NOT merged: this one's copy runs
 * through `t` and every control carries an `agentHandle` tag, and Pages' has neither — a shared
 * component would have to make both optional, which is more machinery than the two small siblings
 * it would replace.
 */
function PostEditorActions({
  message,
  error,
  status,
  setStatus,
  saving,
  onPublish,
  onSave,
  onDeleteClick,
  t,
}: {
  message: string | null;
  error: string | null;
  status: "draft" | "published";
  setStatus: (value: "draft" | "published") => void;
  /** M4 (2026-09-20) — disables Publish and Save while a request is already in flight, so a
   *  same-tick Save-then-Publish (or a double click) can no longer send two writes against the same
   *  `expectedVersion`. See `PostEditorController.saving`'s own doc. Deliberately not threaded onto
   *  Delete, which already gates on `ConfirmDialog`'s own `pending`. */
  saving: boolean;
  onPublish: () => void;
  onSave: () => void;
  onDeleteClick: () => void;
  t: Translate;
}) {
  return (
    <div
      className="editor-action-row"
      {...agentHandle("post-actions", {
        role: "region",
        label: "Save status, the Draft/Published field, and the Publish, Save and Delete buttons",
      })}
    >
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
          disabled={saving}
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
        disabled={saving}
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
            "field beside it): the entry disappears from every list and the site. Asks for " +
            "confirmation before deleting.",
        })}
      >
        {t("Delete")}
      </button>
    </div>
  );
}

/**
 * The toolbar's right-hand group — the post-template picker (Posts has no device-width control the
 * way `features/pages/PageEditor.tsx`'s `PageEditorToolbarEnd` does; this is the Post-only
 * equivalent of that same extraction).
 *
 * Extracted out of `PostEditor` (complexity-ceiling pass, 2026-08-20) because this is where most of
 * that component's remaining branching lived once `PostEditorHeader` had already absorbed the header
 * row: the `bodyFormat`-eligibility check, and the has-templates check nested inside it. As a
 * top-level function its own branches are scored in their own scope instead of accumulating onto
 * `PostEditor`'s — same split `PageEditorToolbarEnd` already uses.
 *
 * Post-template-picker feature (2026-08-10) — rendered whenever this is a Post/formulaic-body record
 * (`bodyFormat: "doc"`), not an `"html"`-format Page — a Page's body IS its own design already (see
 * `resolveHtmlEmbedsForRender`'s own doc), so it has nothing to pick between. Untranslated (`t()`
 * falls back to the raw key, same graceful-degrade every other string on this screen already relies
 * on) — this repo's i18n dictionaries cover 19 locales and adding this feature's strings to all of
 * them is out of scope for this pass; disclosed rather than silently skipped.
 *
 * Options list real templates FIRST, "No template chosen" LAST (owner's own ordering request) —
 * matches `theme.json`'s own `postTemplate` doc ("ordered to nudge the right choice"): opting OUT is
 * the one deliberate action, not the default you land on. The SELECTED value defaults to the first
 * template too when nothing has been chosen yet (see the load effect in `use-post-editor.hooks.ts`)
 * — an author only ever sees "No template chosen" selected if they (or a prior save) explicitly
 * picked it.
 *
 * When the active theme declares zero templates, the row previously vanished entirely (owner
 * feedback, 2026-08-09: "it makes sense... but it should still be there" — an empty theme should
 * read as "nothing to choose" in the UI, not disappear as if the feature itself weren't there).
 * Renders a disabled control with a one-line explanation instead.
 *
 * Rendered regardless of `view` — same as Pages' own picker — because the template choice is a
 * publish-time setting, not something specific to either tab.
 */
function PostEditorToolbarEnd({
  bodyFormat,
  availableTemplates,
  templateChoice,
  setTemplateChoice,
  onViewTemplateClick,
  t,
}: {
  bodyFormat: "doc" | "html" | undefined;
  availableTemplates: string[];
  templateChoice: string | null;
  setTemplateChoice: (templateChoice: string) => void;
  onViewTemplateClick: () => void;
  t: Translate;
}) {
  if ((bodyFormat ?? "doc") !== "doc") return null;
  return (
    <div className="page-editor-toolbar-end">
      <div className="editor-template-picker">
        <label className="a11y-label-wrap">
          <span className="visually-hidden">{t("Template")}</span>
        </label>
        {availableTemplates.length > 0 ? (
          <>
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
            {/* Read-only inspection, not editing (`PostTemplateModal.tsx`'s own file header —
                "I just wanna see it" is the owner's own framing). Disabled rather than hidden
                when nothing is chosen: an operator who opted out via "No template chosen" (`""`)
                still sees the control, just inert, matching this screen's own precedent for the
                theme-with-zero-templates `<select>` below rather than the row disappearing. */}
            <button
              type="button"
              className="btn-secondary"
              disabled={!templateChoice}
              onClick={onViewTemplateClick}
              {...agentHandle("post-view-template", {
                role: "button",
                label: "Open a read-only view of the selected template's HTML source. Nothing here is editable.",
              })}
            >
              {t("View Template")}
            </button>
          </>
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
    </div>
  );
}

/**
 * Slug-collision override, tri-state (2026-08-10, tri-state default flip 2026-08-15) — surfaced live
 * 2026-08-10: a post at slug "about" was silently unreachable because the active theme ships its own
 * pages/about.html at the same slug. Warn explicitly rather than let an author discover this by
 * visiting the public URL.
 *
 * As of 2026-08-15 the DEFAULT winner flipped to the post (previously the theme page), and the
 * stored flag became tri-state (`AdminPost.overridesThemePage: boolean | null` — see that field's
 * own doc, `lib/api.ts`) so a two-state checkbox can no longer represent every state: `null` ("never
 * decided", the default applies), `true` (explicitly always this post — same outcome as the default
 * today, but pinned regardless of future default changes), `false` (explicitly always the theme's
 * page). A `<select>` is the smallest control that can express three mutually-exclusive states
 * without inventing a custom widget.
 *
 * Extracted out of `PostEditor` (complexity-ceiling pass, 2026-08-20) — this block was the other
 * major source of that component's own branching (whether to render at all, then the tri-state
 * value/onChange mapping nested inside), same "top-level function scores its own branches
 * independently" reasoning `PostEditorToolbarEnd` above states. `overridesThemePageFromSelectValue`
 * (`rules.ts`) is the onChange half of the tri-state mapping, pulled out as a pure function so it has
 * exactly one implementation shared with that function's own test fixture — see its doc.
 */
function PostEditorSlugCollisionWarning({
  hasSlugCollision,
  overridesThemePage,
  setOverridesThemePage,
  t,
}: {
  hasSlugCollision: boolean;
  overridesThemePage: boolean | null;
  setOverridesThemePage: (overridesThemePage: boolean | null) => void;
  t: Translate;
}) {
  if (!hasSlugCollision) return null;
  return (
    <div
      className="notice warning"
      {...agentHandle("post-slug-collision-warning", {
        role: "region",
        label: "This post's slug is also claimed by the active theme's own page — choose which one wins",
      })}
    >
      <p>
        {t("This post's slug matches one of the active theme's own pages. By default, this post is shown at that URL instead of the theme's page.")}
      </p>
      <label>
        {t("Which page wins at this URL")}
        {" "}
        <select
          value={overridesThemePage === null ? "default" : overridesThemePage ? "post" : "theme"}
          // Only "default" maps to `null`; both other options are an explicit, permanent choice
          // (`true`/`false`) that keeps winning even if the default policy changes later — see this
          // control's own file-header doc for the tri-state contract.
          onChange={(e) => setOverridesThemePage(overridesThemePageFromSelectValue(e.target.value))}
          {...agentHandle("post-override-theme-page", {
            role: "field",
            label:
              "Which page is shown at this shared URL: the default (currently this post), always this post " +
              "regardless of future default changes, or always the active theme's own same-slug page.",
          })}
        >
          <option value="default">{t("Use the default (currently: this post)")}</option>
          <option value="post">{t("Always show this post")}</option>
          <option value="theme">{t("Always show the theme's page")}</option>
        </select>
      </label>
    </div>
  );
}

/**
 * The Edit-view pane — formatting toolbar, bubble menu, drag handle, and the TipTap body itself.
 * Extracted out of `PostEditor` (complexity-ceiling pass, 2026-08-20) as the `view === "preview"`
 * ternary's alternate branch: three independent `editor ? ... : null` gates (the toolbar, the
 * bubble menu, and the drag handle all wait on the same "has TipTap mounted yet" condition) were the
 * last cluster of `PostEditor`'s own branching once the toolbar-end/slug-collision blocks above were
 * pulled out — same "top-level function scores its own branches independently" reasoning those two
 * already state.
 */
function PostEditorBody({
  editor,
  mentionablePosts,
  currentPostId,
}: {
  editor: Editor | null;
  mentionablePosts: AdminPost[];
  currentPostId: string;
}) {
  return (
    <div
      className="editor-shell post-editor-pane"
      {...agentHandle("post-editor-shell", {
        role: "region",
        label: "Formatting toolbar and the post body editor",
      })}
    >
      {editor ? <Toolbar editor={editor} mentionablePosts={mentionablePosts} currentPostId={currentPostId} /> : null}
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
  );
}

/**
 * The "View Template" modal's mount gate — pulled out of `PostEditor` (complexity-ceiling pass,
 * 2026-08-20) as its own top-level function so the three-condition `&&` chain scores in its own
 * scope. Conditionally mounted, not always-mounted-with-`open`: `PreviewModalShell` (the shell
 * `PostTemplateModal` renders through) is a plain fixed-position overlay `<div>`, not the native
 * `<dialog>` `ConfirmDialog` wraps — there is no `open` prop to toggle, so this follows
 * `AgentPluginDetailsModal`'s own call site (`AgentPlugins.tsx`) instead. `templateChoice` and
 * `activeThemeId` are re-checked here (not just at the "View Template" button's `disabled`) so this
 * can never render with an empty/`null` URL segment even if state changes out from under an
 * already-open modal.
 */
function PostEditorTemplateModalGate({
  show,
  templateChoice,
  activeThemeId,
  activeThemeTier,
  activeThemeApiVersion,
  onClose,
}: {
  show: boolean;
  templateChoice: string | null;
  activeThemeId: string | null;
  activeThemeTier: ThemeTier | null;
  activeThemeApiVersion: 2 | undefined;
  onClose: () => void;
}) {
  if (!show || !templateChoice || !activeThemeId) return null;
  return (
    <PostTemplateModal
      themeId={activeThemeId}
      themeTier={activeThemeTier}
      themeApiVersion={activeThemeApiVersion}
      templateFilename={templateChoice}
      onClose={onClose}
    />
  );
}

/**
 * The delete-confirmation dialog's body copy — pulled out of `PostEditor` (complexity-ceiling pass,
 * 2026-08-20) so its two `kindLabel` ternaries (post vs. page phrasing) score in their own scope,
 * same "top-level function scores its own branches independently" reasoning the other extractions in
 * this file already state.
 */
function PostDeleteConfirmBody({
  kindLabel,
  postTitle,
  t,
}: {
  kindLabel: "post" | "page";
  postTitle: string;
  t: Translate;
}) {
  return (
    <p>
      {t(kindLabel === "page" ? "Move this page" : "Move this post")} (&quot;{postTitle}&quot;){" "}
      {t(
        kindLabel === "page"
          ? "to trash? It will disappear from the site and from the pages list."
          : "to trash? It will disappear from the site and from the posts list.",
      )}
    </p>
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

/**
 * The three "something happened to your work" notices, grouped into one component so their three
 * independent render decisions are scored in this scope instead of accumulating onto `PostEditor`'s
 * — the same extraction `PostEditorHeader`/`PostEditorActions` above already document, and the
 * reason this exists at all: adding the stale-basis notice put `PostEditor` at a complexity of 10
 * against this repo's ceiling of 9.
 *
 * Deliberately NOT merged into a single "pick the most important one" banner. All three can be true
 * at once and each reports a different fact with a different remedy — see `PostAutosaveStaleBanner`'s
 * own doc for the distinction. Suppressing one because another is showing would put the operator
 * back to guessing which of their edits actually survived.
 *
 * Order is deliberate: recovery (work from a previous session, an explicit choice to make) first,
 * then the stale-basis notice (a condition still true right now), then the rejected save (the most
 * recent thing the operator personally did). Nothing here can touch the working copy.
 */
function PostEditorNotices({
  recoverableDraft,
  currentVersion,
  restoreRecoveredDraft,
  discardRecoveredDraft,
  autosaveStaleBasis,
  saveConflict,
  saveOverwritingConflict,
  dismissSaveConflict,
  t,
}: {
  recoverableDraft: StandingDraftAutosaveSnapshot | null;
  currentVersion: number;
  restoreRecoveredDraft: () => void;
  discardRecoveredDraft: () => Promise<void>;
  autosaveStaleBasis: StandingDraftStaleBasis | null;
  saveConflict: PostSaveConflict | null;
  saveOverwritingConflict: () => Promise<void>;
  dismissSaveConflict: () => void;
  t: Translate;
}) {
  return (
    <>
      {recoverableDraft ? (
        <PostAutosaveRecoveryBanner
          recoverableDraft={recoverableDraft}
          currentVersion={currentVersion}
          onRestore={restoreRecoveredDraft}
          onDiscard={discardRecoveredDraft}
          t={t}
        />
      ) : null}
      {autosaveStaleBasis ? <PostAutosaveStaleBanner staleBasis={autosaveStaleBasis} /> : null}
      {saveConflict ? (
        <PostVersionConflictBanner
          saveConflict={saveConflict}
          onSaveAnyway={() => void saveOverwritingConflict()}
          onDismiss={dismissSaveConflict}
          t={t}
        />
      ) : null}
    </>
  );
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
    activeThemeApiVersion,
    overridesThemePage,
    setOverridesThemePage,
    hasSlugCollision,
    view,
    setView,
    previewExpanded,
    togglePreviewExpanded,
    message,
    error,
    saving,
    confirmingDelete,
    deleting,
    confirmLeave,
    dirty,
    contentDirty,
    templatePreviewUrl,
    bodyJson,
    showTemplateModal,
    previewFormRef,
    previewFormTarget,
    remove,
    t,
    onPublish,
    onSave,
    onDeleteClick,
    onDeleteCancel,
    onViewTemplateClick,
    onCloseTemplateModal,
    recoverableDraft,
    restoreRecoveredDraft,
    discardRecoveredDraft,
    saveConflict,
    saveOverwritingConflict,
    dismissSaveConflict,
    autosaveStaleBasis,
  } = usePostEditorHook(postId);
  // Above the early returns below: `use*` has to be called unconditionally for the rules-of-hooks
  // lint even though this one holds no state of its own.
  const { onKeyDown: onViewTabsKeyDown } = useTabBarKeyboard(VIEW_TABS, view, (id) => setView(id as PostEditorView));

  if (error && !post) return <div className="notice error">{error}</div>;
  if (!post) return <div className="notice">Loading editor…</div>;

  const kindLabel = post.kind === "page" ? "page" : "post";

  return (
    <div className="page">
      <PostEditorHeader kindLabel={kindLabel} confirmLeave={confirmLeave} t={t} />

      <PostEditorNotices
        recoverableDraft={recoverableDraft}
        currentVersion={post.version}
        restoreRecoveredDraft={restoreRecoveredDraft}
        discardRecoveredDraft={discardRecoveredDraft}
        autosaveStaleBasis={autosaveStaleBasis}
        saveConflict={saveConflict}
        saveOverwritingConflict={saveOverwritingConflict}
        dismissSaveConflict={dismissSaveConflict}
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
        <div className="segmented" role="tablist" aria-label="Editor view" onKeyDown={onViewTabsKeyDown}>
          {VIEW_TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={view === entry.key}
              className={view === entry.key ? "is-active" : undefined}
              tabIndex={resolveTabBarTabIndex(VIEW_TABS, view, entry)}
              onClick={() => setView(entry.key)}
              {...agentHandle(entry.handle, { role: "button", label: entry.agentLabel })}
            >
              {t(entry.label)}
            </button>
          ))}
        </div>
        {/* Preview fullscreen, Level 1 (2026-09-15) — no expand toggle lives in this toolbar. It was
            here until `a380c716` and is now ONE control floating on the preview itself
            (`.post-preview-fab`, `PostPreview` below), rendered in the same place both collapsed and
            expanded so the way out is always visible: the expanded surface is a `position: absolute;
            inset: 0` panel that would cover anything in this toolbar anyway. */}
        {/* Template picker (Post-template-picker feature, 2026-08-10) — see `PostEditorToolbarEnd`'s
            own doc for the full eligibility/ordering/empty-theme rules this extracts. */}
        <PostEditorToolbarEnd
          bodyFormat={post.bodyFormat}
          availableTemplates={availableTemplates}
          templateChoice={templateChoice}
          setTemplateChoice={setTemplateChoice}
          onViewTemplateClick={onViewTemplateClick}
          t={t}
        />
      </div>

      {/* Directly under the toolbar, not in the header — see `PostEditorActions`' own doc. Placed
          ABOVE the slug-collision warning so the row keeps the position the owner asked for
          (immediately below the toolbar) whether or not that conditional notice is showing. */}
      <PostEditorActions
        message={message}
        error={error}
        status={status}
        setStatus={setStatus}
        saving={saving}
        onPublish={onPublish}
        onSave={onSave}
        onDeleteClick={onDeleteClick}
        t={t}
      />
      {/* Slug-collision override — see `PostEditorSlugCollisionWarning`'s own doc for the tri-state
          contract and history this extracts. */}
      <PostEditorSlugCollisionWarning
        hasSlugCollision={hasSlugCollision}
        overridesThemePage={overridesThemePage}
        setOverridesThemePage={setOverridesThemePage}
        t={t}
      />
      {view === "preview" ? (
        // `bodyJson`/`templatePreviewUrl`/`previewFormRef`/`previewFormTarget` come straight off the
        // hook now (2026-08-14) — see `use-post-editor.hooks.ts`'s own docs on each for why they
        // moved out of this component. `editor` itself is no longer needed here (2026-09-11 — the
        // raw editor-buffer fallback that used to read `editor.getHTML()` was removed, see
        // `PostPreview`'s own doc).
        <PostPreview
          bodyJson={bodyJson}
          slug={slug}
          status={status}
          dirty={dirty}
          contentDirty={contentDirty}
          templatePreviewUrl={templatePreviewUrl}
          previewFormRef={previewFormRef}
          previewFormTarget={previewFormTarget}
          expanded={previewExpanded}
          onToggleExpanded={togglePreviewExpanded}
        />
      ) : (
        <PostEditorBody editor={editor} mentionablePosts={mentionablePosts} currentPostId={post.id} />
      )}
      <ConfirmDialog
        open={confirmingDelete}
        agentHandle="post-delete-confirm"
        title={t("Move to trash?")}
        body={<PostDeleteConfirmBody kindLabel={kindLabel} postTitle={post.title} t={t} />}
        confirmLabel={t("Move to trash")}
        destructive
        pending={deleting}
        onConfirm={remove}
        onCancel={onDeleteCancel}
      />
      {/* See `PostEditorTemplateModalGate`'s own doc for why this is conditionally mounted rather
          than always-mounted-with-`open`, and why all three conditions are re-checked here. */}
      <PostEditorTemplateModalGate
        show={showTemplateModal}
        templateChoice={templateChoice}
        activeThemeId={activeThemeId}
        activeThemeTier={activeThemeTier}
        activeThemeApiVersion={activeThemeApiVersion}
        onClose={onCloseTemplateModal}
      />
    </div>
  );
}

/**
 * Renders the post the way the Preview tab shows it — mirrors `features/pages/PageEditor.tsx`'s
 * `PagePreview` for branches 1 and 2 (see that function's own doc for the full explanation;
 * `ADS-memory/reports/implementation/2026-08-11-html-view-and-preview.md` has the original decision
 * record this repeats, and `2026-08-11-template-preview-render-bug.md` has the template-preview fix
 * below). Three branches, evaluated in this order:
 *
 * 1. **Live site** (`status === "published" && !dirty`): iframes the real public URL (`siteUrl`, the
 *    same helper the "view ↗" link already uses) — the exact response a visitor gets,
 *    template/theme CSS/nav/footer/widget resolution and all.
 * 2. **Template preview** (2026-08-11 fix) (`status === "published" && !contentDirty`, i.e.
 *    title/slug/status/body/`overridesThemePage` all match what's saved and the post IS published —
 *    only `templateChoice` is pending): `GET`s `templatePreviewUrl` — `usePostEditor`'s pre-built URL
 *    (`port.templatePreviewUrl`, `post-editor-port.hooks.ts`; the real binding calls `lib/api.ts`'s
 *    own `templatePreviewUrl`), the SAME real render pipeline as branch 1, looked up by id instead of
 *    by public slug.
 * 3. **Pending-content preview** (2026-08-12 fix — the owner's own reported bug: formatting text on
 *    an already-published post used to drop the preview straight to a raw, unstyled editor-buffer
 *    fallback the instant `contentDirty` went true, even though the post was still live at its public
 *    URL; widened 2026-09-09 to also cover a DIRTY draft; widened again 2026-09-11 to be the plain
 *    negation of branches 1/2 — see immediately below). Same `template-preview` endpoint as branch 2,
 *    but `POST`ed instead of `GET`ted so the request can carry a BODY: a hidden `<form method="post"
 *    target="{iframe's name}">` submits `bodyJson` — the live, UNSAVED `editor.getJSON()` — into the
 *    targeted iframe, landing a real navigated document instead of a `srcDoc` string. `srcDoc` is
 *    rejected here for the same reason `template-preview.ts`'s own file header gives: the rendered
 *    HTML's asset paths are root-relative to `/theme-assets/{themeId}/...`, which only resolves once
 *    the browser believes it is looking at a real navigated page. Debounced 500ms trailing — a form
 *    submit is a full iframe navigation, not a `fetch`, so firing one per keystroke would be
 *    unusable; the debounce effect itself, and the `formRef`/`previewFormTarget` it needs, now live
 *    in `usePostEditor` (moved 2026-08-14, complexity-ceiling pass — see
 *    `PostEditorController.previewFormRef`'s own doc), so this component only attaches them to the
 *    `<form>`/`<iframe>` pair below.
 *
 *    No longer gated on `status === "published"` (2026-09-09): `template-preview.ts`'s
 *    `pendingBodyJson` override (`resolveHtmlPageEmbeds`'s `pendingContentOverride`) is checked
 *    BEFORE `findPublishedPostById`'s visibility guard, so it already bypassed that guard for a
 *    DRAFT's own id too — the `status === "published"` check here was never load-bearing for
 *    correctness, only inherited from branch 2's (which genuinely does need it, for the
 *    un-overridden `GET` case). Confirmed by a direct backend test before relying on it
 *    (`admin-post-template-preview.test.ts`'s "a DRAFT doc-format post's own body renders via a
 *    POSTed bodyJson override" case) rather than assumed.
 *
 *    No longer gated on `contentDirty` either (2026-09-11, owner-reported: "the preview should always
 *    show the css and template and all that properly" — a CLEAN draft, which is what an operator sees
 *    the instant they open a brand-new post, previously matched none of branches 1/2/3 and fell
 *    through to a fourth branch that rendered `editor.getHTML()` — TipTap's own client-side
 *    serializer, not the server's `renderDocNode` — into a sandboxed `SrcDocSandbox` iframe with no
 *    theme CSS, no nav/footer, and no media resolution at all; autosave clears `contentDirty` within
 *    moments of any edit, so in practice a post spent almost its entire draft lifetime on that raw
 *    branch). `canShowPendingContentPreview` is now simply "neither of the two branches above" —
 *    `!canShowLiveSite && !canShowTemplatePreview` — which makes it the exhaustive fallback for
 *    everything branches 1/2 don't cover, not just the `contentDirty` subset of that. This is the
 *    exact same retirement `features/pages/PageEditor.tsx`'s `PagePreview` already did to its own
 *    third (raw-fallback) branch on 2026-09-09 — see that function's own doc, "That is what retired
 *    the THIRD branch this function used to have" — applied here one branch later, since Posts kept
 *    the GET/POST split (branch 2 vs. 3) Pages collapsed into one. The POST body is still whatever
 *    `bodyJson` is at the moment (`null` before TipTap mounts): `template-preview.ts`'s
 *    `extractPendingBodyJson` already degrades a non-object/unparseable value to `undefined`, which
 *    falls back to rendering the post's last-SAVED body through the real template — never a crash,
 *    and never worse than the raw fallback it replaces.
 *
 * The raw editor-buffer fallback (`SrcDocSandbox` fed `editor.getHTML()`) is deleted, not left as an
 * unreachable last-resort branch: with branch 3 now the unconditional negation of 1 and 2, nothing
 * can reach it any more for a `"doc"`-format post — same "exhaustive by construction, so the
 * fallback had become dead code, not merely rare — removed rather than left unreachable" reasoning
 * `PagePreview`'s own doc gives for its own equivalent removal. `degradeUnplayableEmbedsForRawPreview`
 * (`rules.ts`) existed only to patch that raw branch's own YouTube-embed bug and is removed alongside
 * it, along with its now-fully-unused `SrcDocSandbox` import (grep confirms no other admin caller).
 *
 * No device-width scaling here (unlike `PagePreview`) — that machinery exists so an operator can
 * preview a page at Desktop/Tablet/Mobile widths, which nothing in this dispatch asked for on the
 * Post side; the frame simply fills the pane at its natural width, same as the Tiptap editor above
 * it always has.
 */
function PostPreview({
  bodyJson,
  slug,
  status,
  dirty,
  contentDirty,
  templatePreviewUrl,
  previewFormRef,
  previewFormTarget,
  expanded,
  onToggleExpanded,
}: {
  /** Loosely typed like `PostFormState.bodyJson` (`use-post-editor.hooks.ts`) for the same stated
   *  reason: this only ever gets `JSON.stringify`'d into a hidden form field below, never read for
   *  its shape. `null` means the editor hasn't mounted yet — see the call site's own comment; a
   *  `null` submits as the literal string `"null"`, which `template-preview.ts`'s
   *  `extractPendingBodyJson` degrades to `undefined` (falls back to the last-saved body), not a
   *  crash — see this function's own doc for why that degrade is an acceptable, deliberate choice. */
  bodyJson: unknown;
  slug: string;
  status: "draft" | "published";
  dirty: boolean;
  contentDirty: boolean;
  /** Pre-built by `usePostEditor` — see this function's own doc, branch 2. Used as both the branch-2
   *  iframe `src` and the branch-3 hidden form's `action` (same endpoint, `GET` vs `POST`). */
  templatePreviewUrl: string;
  /** Owned by `usePostEditor` — see `PostEditorController.previewFormRef`'s own doc for why the
   *  debounced auto-submit effect that reaches through this ref lives there, not here. */
  previewFormRef: RefObject<HTMLFormElement | null>;
  /** The hidden form's `target` and the iframe's `name` it submits into — must match at submit time. */
  previewFormTarget: string;
  /** Preview fullscreen, Level 1 (2026-09-15) — `usePostEditor`'s `previewExpanded`. See
   *  `PostEditorController.previewExpanded`'s own doc for the full lifetime/containment reasoning;
   *  this component only decides what to render given the value. */
  expanded: boolean;
  /** `usePostEditor`'s `togglePreviewExpanded`, bound to the single `.post-preview-fab` control
   *  below, which this component renders in BOTH states. Nothing in `PostEditor`'s own toolbar
   *  toggles this any more (since `a380c716`) — this is the only control that does. */
  onToggleExpanded: () => void;
}) {
  // The same decision `usePostEditor` gates its auto-submit on — one shared copy in `rules.ts`, see
  // `resolvePostPreviewBranches`. `PostPreviewFrame` needs only the first two flags: the
  // pending-content surface is its unconditional final case.
  const { canShowLiveSite, canShowTemplatePreview } = resolvePostPreviewBranches({ status, dirty, contentDirty });

  const pane = (
    <>
      {canShowLiveSite ? null : (
        <p className="editor-preview-notice">{postPreviewNotice({ canShowTemplatePreview })}</p>
      )}
      <div className="editor-shell post-editor-pane">
        <PostPreviewFrame
          canShowLiveSite={canShowLiveSite}
          canShowTemplatePreview={canShowTemplatePreview}
          bodyJson={bodyJson}
          slug={slug}
          templatePreviewUrl={templatePreviewUrl}
          previewFormRef={previewFormRef}
          previewFormTarget={previewFormTarget}
        />
      </div>
    </>
  );

  // ONE control for both directions, in the same place either way — the way out of the expanded
  // panel must always be visible on screen (the earlier overlay attempt died on an operator who
  // could not find it). The glyph is `aria-hidden`, so `aria-label` is the ONLY thing telling a
  // screen reader or `page.find_elements` which way this goes; keep the two names distinct.
  const fab = (
    <button
      type="button"
      className="post-preview-fab"
      onClick={onToggleExpanded}
      title={expanded ? "Exit full screen (Esc)" : "Show full screen"}
      aria-label={expanded ? "Exit full screen" : "Show full screen"}
      {...agentHandle("post-preview-expand", {
        role: "button",
        // These labels read redundantly ON PURPOSE. `page.find_elements`'s `query` is a plain
        // case-insensitive SUBSTRING match over handle and label — no stemming, no synonyms, no
        // ranking (`@jini-ai/agentic`'s `dom-page-driver.ts`, `findElements`) — so a word that is not
        // literally here retrieves NOTHING, and an assistant that gets an empty list abandons the
        // route rather than broadening its query. That is not hypothetical: this label once read
        // "Show the preview big, filling the admin content area" while the button said "Show full
        // screen", and on a recorded demo an assistant asked to show the preview full screen called
        // `page.find_elements({query:"full"})`, got `{"elements":[]}`, and gave up.
        //
        // So both directions carry the whole vocabulary, including the opposite direction's: a model
        // that asks for "fullscreen" while it is ALREADY full screen must find this control and read
        // "Exit full screen" off it, which tells it the state. Returning nothing instead teaches it
        // the feature does not exist. Direction is communicated by what the label SAYS, never by
        // being absent from the index. Keep in step with `aria-label`/`title` above —
        // `post-editor-agent-drive.unit.test.tsx` pins both the vocabulary and that agreement.
        // Prose, not a keyword dump — every synonym below is worked into a real sentence a person
        // can read. Note this string is NOT the accessible description: `agentHandle` emits it as
        // the plain data attribute `data-agent-label` (`handle.ts`), never `aria-label` or
        // `aria-describedby`, so no screen reader reads it. The accessible name is the `aria-label`
        // above, and the two are kept in agreement by test, not by sharing a string.
        label: expanded
          ? "Exit full screen: exit fullscreen to collapse or close the expanded preview, putting it back to its normal, smaller size. Already maximized, so if the ask was to show it big, it already is."
          : "Show the preview full screen: fullscreen the panel to maximize or expand it, and show it big across the whole admin content area.",
      })}
    >
      <span aria-hidden="true">{expanded ? "\u2921" : "\u2922"}</span>
    </button>
  );

  // Collapsed: the pane plus the control, wrapped in `.post-preview-surface` — that wrapper is the
  // `position: relative` ancestor the fab's `position: absolute` resolves against (`editor.css`), so
  // the fab must stay inside it. Same wrapper in the expanded branch below, for the same reason.
  if (!expanded) return <div className="post-preview-surface">{pane}{fab}</div>;

  // Expanded: `.post-preview-expanded` (`styles/editor.css`) is `position: absolute; inset: 0`
  // against `.admin-main-col` — see that rule's own comment for the full containment argument (why
  // this covers only the admin content column, never `.admin-chat-dock`). The same `fab` rides along
  // inside the panel, in the same corner of the same surface, as the always-visible way back out.
  return (
    <div className="post-preview-expanded">
      <div className="post-preview-surface">
        {pane}
        {fab}
      </div>
    </div>
  );
}

/**
 * The three-way surface choice from `PostPreview`'s own doc comment (live site / template preview /
 * pending-content preview), as a top-level function so its branching scores independently of
 * `PostPreview`'s own complexity — same pattern `features/pages/PageEditor.tsx`'s `PagePreviewFrame`
 * uses for its own equivalent. Only `canShowLiveSite`/`canShowTemplatePreview` are named booleans;
 * the pending-content case is this function's own unconditional final `return`, needing no name of
 * its own — the exact same "its negation needs no name" collapse `PagePreviewFrame` already applies
 * to its own two-branch equivalent (see `PagePreview`'s own doc for that precedent), one branch later
 * here since Posts keep the GET/POST split Pages collapsed into one.
 */
function PostPreviewFrame({
  canShowLiveSite,
  canShowTemplatePreview,
  bodyJson,
  slug,
  templatePreviewUrl,
  previewFormRef,
  previewFormTarget,
}: {
  canShowLiveSite: boolean;
  canShowTemplatePreview: boolean;
  /** See `PostPreview`'s own `bodyJson` prop doc — only ever `JSON.stringify`'d into the hidden
   *  form field below. */
  bodyJson: unknown;
  slug: string;
  /** Pre-built by `usePostEditor` — see `PostPreview`'s own doc, branch 2. */
  templatePreviewUrl: string;
  previewFormRef: RefObject<HTMLFormElement | null>;
  previewFormTarget: string;
}) {
  if (canShowLiveSite) {
    return (
      <iframe src={siteUrl(`/${slug}`)} title="Post preview" className="editor-preview-iframe" referrerPolicy="no-referrer" />
    );
  }
  if (canShowTemplatePreview) {
    return (
      <iframe
        src={templatePreviewUrl}
        title="Post preview"
        className="editor-preview-iframe"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <>
      {/* `hidden`, not left out of the DOM — a hidden form still submits fine, and this keeps it
          out of layout without relying on CSS. Posts to the SAME endpoint the branch above's iframe
          `src` points `GET` at; `templateChoice` rides the query string exactly as it does there, so
          a pending template choice AND pending content are both honored by one submit. */}
      <form ref={previewFormRef} method="post" target={previewFormTarget} action={templatePreviewUrl} hidden>
        <input type="hidden" name="bodyJson" value={JSON.stringify(bodyJson)} />
      </form>
      <iframe name={previewFormTarget} title="Post preview" className="editor-preview-iframe" referrerPolicy="no-referrer" />
    </>
  );
}

/** The notice text ABOVE a preview that isn't the live site — one branch per `PostPreviewFrame` case
 *  minus the live-site one (which shows no notice at all; `PostPreview` skips calling this then).
 *  Rendered BEFORE `.post-editor-pane` in `PostPreview`, not after (visibility-gap fix, 2026-09-06,
 *  mirroring `PageEditor.tsx`'s own `pagePreviewNotice` fix from 2026-08-11 — that fix was never
 *  ported to Posts until now). Down to one named branch plus an unconditional final `return`
 *  (2026-09-11) for the same reason `PostPreviewFrame` above is: the old third case — "this is a
 *  rough render of the editor buffer only" — described the raw fallback branch that no longer
 *  exists, so keeping a `canShowPendingContentPreview` parameter here just to pick between two
 *  strings, one of which could never again be shown, would be dead code with extra ceremony around
 *  it rather than less. */
function postPreviewNotice({ canShowTemplatePreview }: { canShowTemplatePreview: boolean }): string {
  if (canShowTemplatePreview) {
    return "Previewing your saved content through the newly selected template — save to update the live post.";
  }
  return "Previewing your unsaved edits through the live template — this updates a moment after you stop typing.";
}
