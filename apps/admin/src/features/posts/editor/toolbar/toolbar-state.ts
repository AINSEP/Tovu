import type { Editor } from "@tiptap/react";

/**
 * @file The formatting toolbar's `useEditorState` probes: one probe per field, the `editor === null`
 * defaults, and the single selector function `Toolbar` calls. Data and pure functions only, no JSX.
 */

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
 * probeToolbar({ editor })`), so batching is untouched: `Toolbar` still re-renders once per relevant
 * editor state change, not once per field — splitting into multiple `useEditorState` calls was
 * considered and rejected for exactly that reason (see this file's `BubbleFormattingMenu`, which
 * legitimately needs its own separate call because it mounts independently, not because sharing
 * one selector across components is fine).
 */
export function probeToolbar({ editor }: { editor: Editor | null }, _optional = {}): ToolbarState {
  if (!editor) return TOOLBAR_DEFAULTS;
  const keys = Object.keys(TOOLBAR_PROBES) as (keyof typeof TOOLBAR_PROBES)[];
  const entries = keys.map((key) => [key, TOOLBAR_PROBES[key](editor)] as const);
  return Object.fromEntries(entries) as ToolbarState;
}
