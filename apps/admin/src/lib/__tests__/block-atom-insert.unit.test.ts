import { Editor, Node, type JSONContent } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { insertBlockAtom, placeCursorAfterSelectedAtom } from "../block-atom-insert";

/**
 * @file `block-atom-insert.ts` against a minimal hand-built schema (no StarterKit, so no
 * `TrailingNode` quietly adding paragraphs), one test per branch. The real `media`/`widgetEmbed`
 * commands are covered end to end in `media-embed-extension.unit.test.tsx` and
 * `widget-embed-extension.unit.test.tsx`.
 */

const Text = Node.create({ name: "text", group: "inline" });
const Paragraph = Node.create({
  name: "paragraph",
  group: "block",
  content: "inline*",
  parseHTML: () => [{ tag: "p" }],
  renderHTML: () => ["p", 0],
});
const TestAtom = Node.create({
  name: "testAtom",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: "div[data-test-atom]" }],
  renderHTML: () => ["div", { "data-test-atom": "" }],
});

function docNode(content: string) {
  return Node.create({ name: "doc", topNode: true, content });
}

function newEditor(docContent: string, content: JSONContent[], withParagraph = true) {
  const extensions = withParagraph ? [docNode(docContent), Text, Paragraph, TestAtom] : [docNode(docContent), Text, TestAtom];
  return new Editor({ extensions, content: { type: "doc", content } });
}

function childTypes(editor: Editor) {
  const types: string[] = [];
  editor.state.doc.forEach((node) => types.push(node.type.name));
  return types;
}

function runPlaceCursor(editor: Editor) {
  editor.commands.command(({ tr }) => {
    placeCursorAfterSelectedAtom(tr);
    return true;
  });
}

const atom = { type: "testAtom" };
const emptyParagraph = { type: "paragraph" };

describe("placeCursorAfterSelectedAtom", () => {
  it("does nothing when the selection is a text cursor, not a node selection", () => {
    const editor = newEditor("block+", [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }, atom]);
    try {
      editor.commands.setTextSelection(1);
      runPlaceCursor(editor);

      expect(childTypes(editor)).toEqual(["paragraph", "testAtom"]);
      expect(editor.state.selection.from).toBe(1);
    } finally {
      editor.destroy();
    }
  });

  it("moves into the following textblock without adding a node", () => {
    const editor = newEditor("block+", [atom, { type: "paragraph", content: [{ type: "text", text: "x" }] }]);
    try {
      editor.commands.setNodeSelection(0);
      runPlaceCursor(editor);

      expect(childTypes(editor)).toEqual(["testAtom", "paragraph"]);
      expect(editor.state.selection).toBeInstanceOf(TextSelection);
      expect(editor.state.selection.from).toBe(2);
    } finally {
      editor.destroy();
    }
  });

  it("adds an empty paragraph between two atoms and puts the cursor inside it", () => {
    const editor = newEditor("block+", [atom, atom]);
    try {
      editor.commands.setNodeSelection(0);
      runPlaceCursor(editor);

      expect(childTypes(editor)).toEqual(["testAtom", "paragraph", "testAtom"]);
      expect(editor.state.selection).toBeInstanceOf(TextSelection);
      expect(editor.state.selection.$from.index(0)).toBe(1);
    } finally {
      editor.destroy();
    }
  });

  it("adds an empty paragraph after an atom that ends the document and puts the cursor inside it", () => {
    const editor = newEditor("block+", [emptyParagraph, atom]);
    try {
      editor.commands.setNodeSelection(2);
      runPlaceCursor(editor);

      expect(childTypes(editor)).toEqual(["paragraph", "testAtom", "paragraph"]);
      expect(editor.state.selection).toBeInstanceOf(TextSelection);
      expect(editor.state.selection.$from.index(0)).toBe(2);
    } finally {
      editor.destroy();
    }
  });

  it("leaves the node selection alone when the schema does not allow a paragraph after the atom", () => {
    const editor = newEditor("paragraph testAtom", [emptyParagraph, atom]);
    try {
      editor.commands.setNodeSelection(2);
      runPlaceCursor(editor);

      expect(childTypes(editor)).toEqual(["paragraph", "testAtom"]);
      expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    } finally {
      editor.destroy();
    }
  });

  it("leaves the node selection alone when the schema has no paragraph node at all", () => {
    const editor = newEditor("testAtom+", [atom], false);
    try {
      editor.commands.setNodeSelection(0);
      runPlaceCursor(editor);

      expect(childTypes(editor)).toEqual(["testAtom"]);
      expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    } finally {
      editor.destroy();
    }
  });
});

describe("insertBlockAtom", () => {
  function insertAtom(editor: Editor) {
    return editor.commands.command(({ chain, state }) => insertBlockAtom({ chain, state, content: atom }));
  }

  it("from a text cursor: two inserts in a row keep both atoms, cursor in a paragraph after the second", () => {
    const editor = newEditor("block+", [emptyParagraph]);
    try {
      editor.commands.setTextSelection(1);
      expect(insertAtom(editor)).toBe(true);
      expect(insertAtom(editor)).toBe(true);

      expect(childTypes(editor)).toEqual(["testAtom", "testAtom", "paragraph"]);
      expect(editor.state.selection).toBeInstanceOf(TextSelection);
      expect(editor.state.selection.$from.index(0)).toBe(2);
    } finally {
      editor.destroy();
    }
  });

  it("with a node selected: inserts after that node instead of replacing it", () => {
    const editor = newEditor("block+", [atom, emptyParagraph]);
    try {
      editor.commands.setNodeSelection(0);
      insertAtom(editor);

      expect(childTypes(editor)).toEqual(["testAtom", "testAtom", "paragraph"]);
      expect(editor.state.selection.$from.index(0)).toBe(2);
    } finally {
      editor.destroy();
    }
  });

  it("an editor.can() dry run answers true and changes nothing", () => {
    const editor = newEditor("block+", [emptyParagraph]);
    try {
      editor.commands.setTextSelection(1);
      const can = editor.can().command(({ chain, state }) => insertBlockAtom({ chain, state, content: atom }));

      expect(can).toBe(true);
      expect(childTypes(editor)).toEqual(["paragraph"]);
    } finally {
      editor.destroy();
    }
  });
});
