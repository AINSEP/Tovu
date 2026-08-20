import { describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/react";

import { BUBBLE_MENU_DEFAULTS, probeBubbleMenu, probeToolbar, TOOLBAR_DEFAULTS } from "../PostEditor";

/**
 * @file Characterization tests for `Toolbar`/`BubbleFormattingMenu`'s `useEditorState` selectors,
 * written for the complexity-ceiling pass (2026-08-20) that replaced ~40 repeated
 * `editor?.<probe>() ?? <default>` fallbacks with a probe table + one early return
 * (`probeToolbar`/`probeBubbleMenu`, both exported from `PostEditor.tsx` purely for this file — see
 * their own doc comments there for why one selector/one returned object is still required).
 *
 * Two things a passing `PostEditor.unit.test.tsx` run would NOT catch: a wrong per-field default,
 * or a field silently dropped from the returned object. Both are invisible to `tsc` (the mapped
 * `ToolbarState`/`BubbleMenuState` return types are still satisfied by an object missing one
 * optional-shaped key) and to most rendering assertions (a wrong default usually just changes
 * which of two visually similar states a button starts in). These tests assert the exact returned
 * object instead, covering:
 *   (a) `editor === null` — every field's default, the ONE branch `probeToolbar`/`probeBubbleMenu`
 *       exist to hoist out of ~40 repetitions into one check. Not reachable by mounting `PostEditor`
 *       at all: both `Toolbar` and `BubbleFormattingMenu` are null-gated by their parent
 *       (`PostEditorBody`) and never receive a null `editor` prop, so a direct call is the only way
 *       to exercise this path.
 *   (b) an editor with a few marks active, one field from each shape family the old inline selector
 *       mixed together: plain `isActive(name)` (bold), `isActive(name, attrs)` (h1),
 *       `isActive(attrs)` (alignLeft), `getAttributes(name).field` (color, codeBlockLanguage),
 *       `can().<cmd>()` (canUndo/canRedo), and `storage.characterCount?.characters()`
 *       (characterCount).
 *
 * `PostEditor.unit.test.tsx`'s existing "Formatting toolbar — alignment icons" and "CharacterCount
 * readout" suites already pin two of these fields end-to-end through a real mounted TipTap editor —
 * unchanged by this refactor, still green, still the DOM-level half of this coverage.
 */

/** A minimal stand-in for `Editor` exposing only what `TOOLBAR_PROBES`/`BUBBLE_MENU_PROBES` call:
 *  `isActive`, `getAttributes`, `can().undo()/.redo()`, and `storage.characterCount.characters()`.
 *  Cast to `Editor` at the boundary — the real class is far larger, and every field this refactor
 *  touches is exercised through this fake's four methods. */
function fakeEditor(options: {
  isActive: (nameOrAttrs: string | Record<string, unknown>, attrs?: Record<string, unknown>) => boolean;
  getAttributes?: (name: string) => Record<string, unknown>;
  canUndo?: boolean;
  canRedo?: boolean;
  characters?: number;
}): Editor {
  return {
    isActive: options.isActive,
    getAttributes: options.getAttributes ?? (() => ({})),
    can: () => ({
      undo: () => options.canUndo ?? false,
      redo: () => options.canRedo ?? false,
    }),
    storage: {
      characterCount: {
        characters: () => options.characters ?? 0,
      },
    },
  } as unknown as Editor;
}

describe("probeToolbar", () => {
  it("returns every field's default when editor is null", () => {
    const state = probeToolbar(null);

    expect(state).toEqual(TOOLBAR_DEFAULTS);
    // Diffed one at a time (not just the aggregate `toEqual` above) — a wrong default here is a
    // silent UI bug, not a test failure, per this pass's own brief.
    expect(state.bold).toBe(false);
    expect(state.italic).toBe(false);
    expect(state.strike).toBe(false);
    expect(state.underline).toBe(false);
    expect(state.highlight).toBe(false);
    expect(state.subscript).toBe(false);
    expect(state.superscript).toBe(false);
    expect(state.code).toBe(false);
    expect(state.link).toBe(false);
    expect(state.h1).toBe(false);
    expect(state.h2).toBe(false);
    expect(state.h3).toBe(false);
    expect(state.bullet).toBe(false);
    expect(state.ordered).toBe(false);
    expect(state.taskList).toBe(false);
    expect(state.quote).toBe(false);
    expect(state.codeBlock).toBe(false);
    expect(state.codeBlockLanguage).toBe("plaintext");
    expect(state.alignLeft).toBe(false);
    expect(state.alignCenter).toBe(false);
    expect(state.alignRight).toBe(false);
    expect(state.alignJustify).toBe(false);
    expect(state.color).toBeNull();
    expect(state.backgroundColor).toBeNull();
    expect(state.fontFamily).toBe("");
    expect(state.fontSize).toBe("");
    expect(state.lineHeight).toBe("");
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(false);
    expect(state.characterCount).toBe(0);
  });

  it("reflects an active editor's state, one field per probe shape family", () => {
    const editor = fakeEditor({
      isActive: (nameOrAttrs, attrs) => {
        if (nameOrAttrs === "bold") return true; // plain isActive(name)
        if (nameOrAttrs === "heading" && attrs?.level === 1) return true; // isActive(name, attrs)
        if (typeof nameOrAttrs === "object" && nameOrAttrs !== null) {
          return (nameOrAttrs as { textAlign?: string }).textAlign === "left"; // isActive(attrs)
        }
        return false;
      },
      getAttributes: (name) => {
        if (name === "textStyle") return { color: "#ff0000" }; // getAttributes(name).field
        if (name === "codeBlock") return { language: "typescript" };
        return {};
      },
      canUndo: true, // can().undo()
      canRedo: false,
      characters: 42, // storage.characterCount?.characters()
    });

    expect(probeToolbar(editor)).toEqual({
      ...TOOLBAR_DEFAULTS,
      bold: true,
      h1: true,
      alignLeft: true,
      color: "#ff0000",
      codeBlockLanguage: "typescript",
      canUndo: true,
      characterCount: 42,
    });
  });

  it("falls back to the codeBlockLanguage/color/fontFamily defaults when getAttributes returns no value for that field", () => {
    // `getAttributes` returning `{}` (cursor not inside that mark/node) is the REAL per-field
    // fallback this refactor keeps — distinct from the null-editor case above, and the reason
    // `TOOLBAR_PROBES`'s `codeBlockLanguage`/`color`/`fontFamily`/`fontSize`/`lineHeight` entries
    // each still carry their own `?? <default>`.
    const editor = fakeEditor({ isActive: () => false });

    const state = probeToolbar(editor);
    expect(state.codeBlockLanguage).toBe("plaintext");
    expect(state.color).toBeNull();
    expect(state.backgroundColor).toBeNull();
    expect(state.fontFamily).toBe("");
    expect(state.fontSize).toBe("");
    expect(state.lineHeight).toBe("");
    expect(state.characterCount).toBe(0);
  });
});

describe("probeBubbleMenu", () => {
  it("returns every field's default when editor is null", () => {
    expect(probeBubbleMenu(null)).toEqual(BUBBLE_MENU_DEFAULTS);
    expect(probeBubbleMenu(null)).toEqual({
      bold: false,
      italic: false,
      underline: false,
      highlight: false,
      link: false,
    });
  });

  it("reflects an active editor's state", () => {
    const editor = fakeEditor({
      isActive: (name) => name === "italic" || name === "link",
    });

    expect(probeBubbleMenu(editor)).toEqual({
      ...BUBBLE_MENU_DEFAULTS,
      italic: true,
      link: true,
    });
  });
});
