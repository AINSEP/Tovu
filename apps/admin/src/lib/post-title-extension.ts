import { Node, mergeAttributes } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

/**
 * @file The post/page title, moved INTO the Tiptap document as its own dedicated first node
 * (post-title-in-document feature, 2026-08-11 — Ghost/Notion model, owner's explicit choice over a
 * theme-level-only title, so an author can center/style the title per post rather than only per
 * theme). Two extensions, always installed as a pair in `use-post-editor.hooks.ts`:
 *
 *  - `PostTitleDocument` replaces StarterKit's own `doc` node (`StarterKit.configure({document:
 *    false})`) with a content spec of `"title block+"` — the schema itself is what makes the title
 *    BOTH non-deletable (removing the node entirely would leave a doc that no longer matches
 *    `"title block+"`, which every structural ProseMirror editing command refuses to produce) AND
 *    non-duplicable (nothing but this node's own type satisfies the `title` slot, and `title` is
 *    deliberately NOT a member of the `block` group, so no command can insert a second one anywhere
 *    in `block+`).
 *  - `PostTitle` is the node itself: inline content only (`content: "inline*"` — the doc's own
 *    content expression already forbids inserting anything else at this position; this is the belt
 *    to that braces) and `isolating: true`, so backspace/delete at its boundary can never merge body
 *    content into it, or the title's own content out into the body, the way two ordinary adjacent
 *    nodes could.
 *
 * `textAlign` (`@tiptap/extension-text-align`, `PostEditor.tsx`'s `Toolbar`) is registered against
 * `"title"` alongside `"heading"`/`"paragraph"` in `use-post-editor.hooks.ts` — the owner's stated
 * motivation for this whole feature was centering the title, so it has to carry the same attribute
 * those do.
 *
 * The title node SYNCS to `post.title` (`use-post-editor.hooks.ts`'s `onUpdate` extracts it via
 * `titleNodeText`, `features/posts/rules.ts`) rather than replacing that field: `post.title` still
 * feeds the slug, the admin list, the `<title>` tag, listing widgets, and search, and the standalone
 * title `<input>` in `PostEditor.tsx` stays exactly where the owner asked for it same-day
 * ("put the slug input right next to the title... like we did the pages") — typing there pushes into
 * this node via `setPostTitleText` below, so both surfaces always agree on one value.
 *
 * Server-side rendering: `renderDocNode`'s `"title"` case (`src/server/http/site/render.ts`) always
 * renders empty in a generic doc walk; `renderWidgetPostContent` is the one render path that reads
 * this node directly (via its own `extractTitleNode`), because it is the only one that needs this
 * node's alignment. See that file's own comments for the rest of this feature's server-side half, and
 * `withTitleNode` (`features/posts/rules.ts`) for the back-compat synthesis every pre-existing post's
 * `bodyJson` needs on load (no `title` node yet, since this schema didn't exist when they were saved).
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    postTitle: {
      /** Replaces the title node's own text content wholesale — the standalone title `<input>`'s
       *  `onChange` (`use-post-editor.hooks.ts`) is the only caller, pushing a typed value into the
       *  canvas so both editing surfaces stay in sync. A no-op (`false`) when the doc's first child
       *  isn't a `title` node, which cannot happen once `withTitleNode` has synthesized one, but is
       *  checked rather than assumed since this command runs on every keystroke of that input. */
      setPostTitleText: (text: string) => ReturnType;
    };
  }
}

/** The doc's own content spec — see this file's header for why `"title block+"` alone is what makes
 *  the title non-deletable and non-duplicable; nothing else in this extension enforces either
 *  property. */
export const PostTitleDocument = Node.create({
  name: "doc",
  topNode: true,
  content: "title block+",
});

export const PostTitle = Node.create({
  name: "title",
  content: "inline*",
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: "h1[data-post-title]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["h1", mergeAttributes(HTMLAttributes, { "data-post-title": "" }), 0];
  },

  addKeyboardShortcuts() {
    return {
      // Enter inside the title moves the cursor into the body's first block instead of trying to
      // split the title node — which the schema would refuse anyway (`"title block+"` allows exactly
      // one `title`, and it isn't in the `block` group a split could otherwise target). Without this
      // override, that refusal reads to an author as Enter silently doing nothing; `block+` guarantees
      // there is always at least one block immediately after the title to land in.
      Enter: () =>
        this.editor.commands.command(({ tr, state, dispatch }) => {
          const { $from } = state.selection;
          if ($from.parent.type.name !== this.name) return false;
          if (dispatch) {
            const afterTitle = Math.min($from.after(1) + 1, tr.doc.content.size);
            tr.setSelection(TextSelection.near(tr.doc.resolve(afterTitle)));
            dispatch(tr.scrollIntoView());
          }
          return true;
        }),
    };
  },

  addCommands() {
    return {
      setPostTitleText:
        (text: string) =>
        ({ tr, dispatch, state }) => {
          const node = state.doc.firstChild;
          if (!node || node.type.name !== this.name) return false;
          if (dispatch) {
            const from = 1; // just inside the doc's opening tag, i.e. the title node's own start
            const to = 1 + node.content.size;
            if (text) tr.insertText(text, from, to);
            else tr.delete(from, to);
          }
          return true;
        },
    };
  },
});
