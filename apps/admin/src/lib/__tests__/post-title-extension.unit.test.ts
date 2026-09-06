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

describe("PostTitle — Enter keyboard shortcut, dispatch-less invocation", () => {
  it("skips the selection-move effect and never calls dispatch when its callback runs with dispatch undefined", () => {
    // Investigated per the owner's request to confirm (not assume) that the `if (dispatch)` guard
    // at post-title-extension.ts's Enter handler is dead weight before deleting it. It is NOT: the
    // guard's safety rests on a Tiptap framework contract, not on anything local to this repo, so
    // per this repo's rule for that case it stays, proven here by direct invocation instead.
    //
    // What IS local: `CommandProps.dispatch` is typed `((args?: any) => any) | undefined` in
    // @tiptap/core's own types.ts (line 637), and `CommandManager.createCan()` (CommandManager.ts
    // lines 106-121) builds every `.can()`-reachable command's props with a literal
    // `dispatch: undefined` — so an undefined dispatch is a real, documented shape any RawCommand
    // callback can receive, not boilerplate copied from a generic signature.
    //
    // What is NOT local: whether THIS handler can ever be reached that way. It can't today —
    // `addKeyboardShortcuts` entries are wired into their own `keymap()` plugin
    // (ExtensionManager.ts lines 118-146), a path that is entirely separate from the `rawCommands`
    // table `.can()`/`.chain()` walk (ExtensionManager.ts's `get commands()`, ~line 66); a real
    // keydown always reaches this handler through `this.editor.commands.command(cb)`
    // (post-title-extension.ts, the dispatching getter), never through `.can()`. But that safety
    // depends on Tiptap keeping shortcuts and commands on two separate registration paths — an
    // assumption about another package's internals that a future Tiptap version could change
    // (e.g. by adding a "can this shortcut run" probe API). That is exactly the "proof lives in
    // someone else's package" case this repo's rule says to KEEP + direct-invoke-test, the same
    // call already made below for the "no title node" branch in this same file.
    //
    // So: the private callback is captured here (by shadowing `editor.commands` for one real Enter
    // keydown, the same dispatching path the passing test above already exercises) and then
    // re-invoked directly with a fabricated dispatch-less props object — the shape `.can()` would
    // hand it if some future Tiptap version ever did make this callback reachable that way.
    const editor = newEditorWithTitle("<h1 data-post-title>Hello title</h1><p>Body text</p>");
    try {
      editor.commands.setTextSelection(1);
      expect(editor.state.selection.$from.parent.type.name).toBe("title");

      let capturedCallback: ((props: Record<string, unknown>) => boolean) | undefined;
      const editorPrototype = Object.getPrototypeOf(editor) as object;
      const realCommandsDescriptor = Object.getOwnPropertyDescriptor(editorPrototype, "commands");
      if (!realCommandsDescriptor?.get) {
        throw new Error("expected Editor.prototype.commands to be a getter");
      }
      const realCommandsGetter = realCommandsDescriptor.get;
      Object.defineProperty(editor, "commands", {
        configurable: true,
        get(this: typeof editor) {
          const real = realCommandsGetter.call(this) as Record<string, (...args: never[]) => unknown> & {
            command: (cb: (props: Record<string, unknown>) => boolean) => boolean;
          };
          return {
            ...real,
            command: (cb: (props: Record<string, unknown>) => boolean) => {
              capturedCallback = cb;
              return real.command(cb);
            },
          };
        },
      });

      // A real Enter keydown — the same dispatching path the earlier test in this file uses —
      // captures the private callback as a side effect, leaving its actual behavior unchanged.
      editor.view.dom.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
      expect(capturedCallback).toBeDefined();

      // That real keydown already moved the selection into the body (see the earlier test); put it
      // back inside the title so this direct probe reaches past the handler's own early-return.
      editor.commands.setTextSelection(1);
      expect(editor.state.selection.$from.parent.type.name).toBe("title");

      const tr = editor.state.tr;
      const result = capturedCallback!({ tr, state: editor.state, dispatch: undefined });

      expect(result).toBe(true);
      // The guarded block never ran: no selection change was queued on this transaction, and (had
      // the code tried to call `dispatch(...)` anyway) `undefined(...)` would have thrown before
      // this line was reached.
      expect(tr.selectionSet).toBe(false);
      expect(tr.docChanged).toBe(false);
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
