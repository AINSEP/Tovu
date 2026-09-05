import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

import { PostTitle, PostTitleDocument } from "../post-title-extension";

/**
 * @file Coverage-gap-fill pass (2026-09-05). Before this file, `post-title-extension.ts` sat at
 * 8.7% lines / 0% branches — `PostEditor.unit.test.tsx` mounts a real editor with this pair
 * registered (exercising `parseHTML`/`renderHTML` and the module's own schema wiring), but never
 * types into the title `<input>` or presses Enter inside the canvas, so the Enter keyboard
 * shortcut (lines 87-95) and the `setPostTitleText` command (lines 104-113) — both real branch
 * logic, not boilerplate — were never invoked. These tests exercise them directly through a real
 * `@tiptap/core` `Editor`, same pattern `widget-embed-extension.unit.test.tsx` already uses for
 * this app's other custom TipTap nodes: real schema, real commands, no mocking of TipTap itself.
 */

function newEditorWithTitle(contentHtml: string) {
  return new Editor({
    extensions: [StarterKit.configure({ document: false }), PostTitleDocument, PostTitle],
    content: contentHtml,
  });
}

describe("PostTitle — Enter keyboard shortcut", () => {
  it("Enter while the cursor is inside the title moves the selection into the first body block, leaving the title's own text untouched", () => {
    const editor = newEditorWithTitle("<h1 data-post-title>Hello title</h1><p>Body text</p>");
    try {
      // Position 1 is just inside the title node's own opening boundary — inside the title
      // regardless of where exactly within its text the cursor sits.
      editor.commands.setTextSelection(1);
      expect(editor.state.selection.$from.parent.type.name).toBe("title");

      const fired = editor.view.dom.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );

      // A handled keydown calls preventDefault(), which dispatchEvent surfaces as `false`.
      expect(fired).toBe(false);
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
      expect(editor.state.doc.firstChild?.textContent).toBe("Hello title");
    } finally {
      editor.destroy();
    }
  });

  it("Enter while the cursor is in the body falls through to the default split-block behavior, unaffected by this override", () => {
    const editor = newEditorWithTitle("<h1 data-post-title>Hello title</h1><p>Body text</p>");
    try {
      // Just before the doc's end — inside the trailing paragraph, not the title.
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");

      const topLevelCountBefore = editor.state.doc.childCount;
      editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

      // StarterKit's own default Enter (splitBlock) ran instead — one more top-level block than
      // before (title + two paragraphs), proving this extension's override declined to handle it.
      expect(editor.state.doc.childCount).toBe(topLevelCountBefore + 1);
      expect(editor.state.doc.firstChild?.type.name).toBe("title");
      expect(editor.state.doc.firstChild?.textContent).toBe("Hello title");
    } finally {
      editor.destroy();
    }
  });
});

describe("PostTitle — setPostTitleText command", () => {
  it("replaces the title node's text wholesale when given non-empty text", () => {
    const editor = newEditorWithTitle("<h1 data-post-title>Old title</h1><p>Body</p>");
    try {
      const applied = editor.commands.setPostTitleText("New title");

      expect(applied).toBe(true);
      expect(editor.state.doc.firstChild?.textContent).toBe("New title");
      // The body is untouched — only the title node's own range was replaced.
      expect(editor.getText()).toContain("Body");
    } finally {
      editor.destroy();
    }
  });

  it("clears the title node's text when given an empty string", () => {
    const editor = newEditorWithTitle("<h1 data-post-title>Old title</h1><p>Body</p>");
    try {
      const applied = editor.commands.setPostTitleText("");

      expect(applied).toBe(true);
      expect(editor.state.doc.firstChild?.textContent).toBe("");
    } finally {
      editor.destroy();
    }
  });

  it("reports true from .can() without mutating the document — the dispatch-less 'can I run this' check", () => {
    const editor = newEditorWithTitle("<h1 data-post-title>Untouched</h1><p>Body</p>");
    try {
      const before = editor.getJSON();

      const can = editor.can().setPostTitleText("Would-be new text");

      expect(can).toBe(true);
      expect(editor.getJSON()).toEqual(before);
    } finally {
      editor.destroy();
    }
  });

  it("is a no-op when the doc's first child is not a title node", () => {
    // A framework-contract case, not a reachable production path: `PostTitleDocument`'s
    // `"title block+"` content spec guarantees a real doc always opens with a title node, so this
    // branch cannot occur once `withTitleNode` has synthesized one (see this extension's own file
    // header). Direct-invoked here via a second editor that registers `PostTitle`'s commands
    // without `PostTitleDocument` as the doc schema, so `state.doc.firstChild` is a plain
    // paragraph — proving the defensive check itself, per this repo's rule for a branch that
    // rests on a framework/schema contract: keep it, and prove it by direct invocation rather than
    // deleting it as unreachable.
    const editor = new Editor({
      extensions: [StarterKit, PostTitle],
      content: "<p>Just a paragraph</p>",
    });
    try {
      expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");

      const applied = editor.commands.setPostTitleText("Should not apply");

      expect(applied).toBe(false);
      expect(editor.getText()).toBe("Just a paragraph");
    } finally {
      editor.destroy();
    }
  });
});
