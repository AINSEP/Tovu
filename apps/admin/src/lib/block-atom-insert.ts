import type { ChainedCommands, JSONContent } from "@tiptap/core";
import { NodeSelection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

/**
 * @file Inserting a block-level atom node (`media`, `widgetEmbed`) without losing the node already
 * there (2026-09-14, q4 visual QA: a second Embed > Media REPLACED the first).
 *
 * A bare `insertContent` leaves a `NodeSelection` on the atom it just inserted (`@tiptap/core`'s
 * `insertContentAt` ends with `Selection.near(end, -1)`, and a selectable atom is the nearest
 * selection), and the next `insertContent` replaces whatever is selected. StarterKit's
 * `TrailingNode` does not rescue this: it appends a paragraph at the doc end without moving the
 * selection, and in the post editor's `title block+` document (`post-title-extension.ts`) its
 * default node resolves to `title`, which cannot go at the end, so it appends nothing at all.
 *
 * Same approach as StarterKit's own `setHorizontalRule`, the one block atom this editor already
 * inserted correctly: with a node selected, insert after it rather than over it; afterwards, leave a
 * text cursor right after the new node.
 */

/**
 * Inserts `content` as a block atom at the selection (after the selected node, when a node is
 * selected) and leaves a text cursor right after it. Call from a command with its own props.
 *
 * @param input.chain - The command's `chain`, so the insert shares the command's transaction.
 * @param input.state - The command's `state`; its selection decides insert-at vs. insert-after.
 * @param input.content - The node to insert, e.g. `{ type: "media", attrs }`.
 * @returns Whether the chain applied (also answers `editor.can()` dry runs, which change nothing).
 * @complexity O(document size) for ProseMirror's replace step; the cursor move is O(1).
 */
export function insertBlockAtom(input: { chain: () => ChainedCommands; state: EditorState; content: JSONContent }): boolean {
  const { selection } = input.state;
  const chain = input.chain();
  if (selection instanceof NodeSelection) chain.insertContentAt(selection.to, input.content);
  else chain.insertContent(input.content);
  return chain
    .command(({ tr, dispatch }) => {
      if (dispatch) placeCursorAfterSelectedAtom(tr);
      return true;
    })
    .run();
}

/**
 * When `tr`'s selection is a node selection (what an atom insert leaves behind), replaces it with a
 * text cursor right after that node: inside the next textblock when one follows, otherwise inside a
 * new empty paragraph inserted there.
 *
 * @param tr - The transaction the insert ran in. Mutated in place.
 * @returns Nothing. `tr` is left untouched when the selection is not a node selection, or when the
 *   schema has no `paragraph` or does not allow one at that spot.
 * @complexity O(1) plus ProseMirror's insert step when a paragraph is added.
 */
export function placeCursorAfterSelectedAtom(tr: Transaction): void {
  const { selection } = tr;
  if (!(selection instanceof NodeSelection)) return;
  const { $to } = selection;
  if ($to.nodeAfter?.isTextblock) {
    tr.setSelection(TextSelection.create(tr.doc, $to.pos + 1));
    return;
  }
  const paragraph = tr.doc.type.schema.nodes.paragraph;
  if (!paragraph || !$to.parent.canReplaceWith($to.index(), $to.index(), paragraph)) return;
  tr.insert($to.pos, paragraph.create());
  tr.setSelection(TextSelection.create(tr.doc, $to.pos + 1));
}
