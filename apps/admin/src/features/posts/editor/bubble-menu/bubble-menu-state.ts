import type { Editor } from "@tiptap/react";

/**
 * @file The selection bubble menu's `useEditorState` probes, defaults and selector. Data and pure
 * functions only, no JSX; the menu itself is `BubbleFormattingMenu`.
 */

/**
 * `BubbleFormattingMenu`'s own probe table (complexity-ceiling pass, 2026-08-20) — kept independent
 * from `TOOLBAR_PROBES` (`../toolbar/toolbar-state.ts`) rather than sharing entries: this menu's own file-header doc already
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

/** Same "one early return replaces N repeated null checks" shape as `probeToolbar` (`../toolbar/toolbar-state.ts`), scaled
 *  down to this menu's five fields. */
export function probeBubbleMenu({ editor }: { editor: Editor | null }, _optional = {}): BubbleMenuState {
  if (!editor) return BUBBLE_MENU_DEFAULTS;
  const keys = Object.keys(BUBBLE_MENU_PROBES) as (keyof typeof BUBBLE_MENU_PROBES)[];
  const entries = keys.map((key) => [key, BUBBLE_MENU_PROBES[key](editor)] as const);
  return Object.fromEntries(entries) as BubbleMenuState;
}
