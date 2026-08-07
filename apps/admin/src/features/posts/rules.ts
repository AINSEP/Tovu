import type { RowMenuItem } from "@jini-ai/admin/react";
import type { EditorView } from "@tiptap/pm/view";

import type { AdminPost } from "../../lib/api";

/**
 * @file Pure logic for the `posts` feature — everything that computes a value rather than rendering
 * one.
 *
 * Named `rules.ts` to match the convention `@jini-ai/chat` already uses for the same job
 * (`features/chat-pane/rules.ts`, `features/model-picker/rules.ts`): the slice's decisions live in
 * one importable, directly testable module with no React in it.
 *
 * The bar for landing here is "does it compute something", not "is it rendered". A function that
 * builds a menu array is logic even though a menu is drawn from it — leaving it inside the
 * component only means the branch can be reached exclusively by rendering a table and opening a
 * popover, which is how a `post.status` conditional ends up permanently untested.
 */

/** The callbacks a row menu needs. Passed in rather than imported so this module stays free of
 *  state and navigation, and so a test can assert exactly which one a given row wires up. */
export interface PostRowMenuHandlers {
  onEdit: (post: AdminPost) => void;
  onDisable: (post: AdminPost) => void;
  onDelete: (post: AdminPost) => void;
}

/**
 * The row-action menu for one post.
 *
 * The branch is the reason this is exported: **"Disable" is omitted entirely for a post that is
 * already a draft**, rather than rendered disabled. That is a deliberate choice — a control that is
 * visible but inert invites the operator to work out why on their own — and it is a claim worth a
 * test, which it cannot have while it is a closure inside a `DataTable` cell.
 *
 * "Delete" is marked `destructive` and only OPENS the confirmation; the delete itself is
 * `usePosts().removePost`, gated on `ConfirmDialog`.
 *
 * @complexity Time/space: O(1) — at most three entries, no iteration.
 */
export function postRowMenuItems(post: AdminPost, handlers: PostRowMenuHandlers): RowMenuItem[] {
  const items: RowMenuItem[] = [{ key: "edit", label: "Edit", onSelect: () => handlers.onEdit(post) }];
  if (post.status === "published") {
    items.push({ key: "disable", label: "Disable", onSelect: () => handlers.onDisable(post) });
  }
  items.push({ key: "delete", label: "Delete", destructive: true, onSelect: () => handlers.onDelete(post) });
  return items;
}

/** Reads a browser `File` into a full `data:` URL (mirrors Media.tsx's upload helper, but keeps the
 *  prefix).
 *
 * @complexity Time: O(n) in file bytes; space: O(n) for the base64 result, which is ~1.33x the
 * input — the reason {@link handleImageDrop} inlining a large image is a real memory cost.
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("failed to read file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

/**
 * The dropped resource's own URI, read from whichever `DataTransfer` format carries it.
 *
 * `text/uri-list` wins over `text/plain` when a drag source offers both (e.g. dragging an image out
 * of another browser tab populates both formats with the same URL) — the list format is the
 * standard's intended carrier, plain text is the fallback for sources that only set that. Extracted
 * out of {@link handleImageDrop} so this precedence and the trim are independently testable and no
 * longer count toward that function's own branch count.
 */
export function droppedUri(dataTransfer: DataTransfer | null): string {
  return (dataTransfer?.getData("text/uri-list") || dataTransfer?.getData("text/plain") || "").trim();
}

/** A toolbar button's className for its active/inactive state — the one thing repeated across every
 *  formatting button in `PostEditor.tsx`'s `Toolbar`. Extracted so the eleven
 *  `${active ? " on" : ""}` ternaries that used to live inline in `Toolbar`'s JSX (its entire branch
 *  count) collapse to eleven calls to this one single-branch function instead. */
export function toolbarBtnClass(active: boolean): string {
  return `tb-btn${active ? " on" : ""}`;
}

/**
 * Drag-and-drop image support: a dropped local file is inlined as a `data:` URL (no media-library
 * serving route exists yet to reference instead — see PostEditor's file header note); a dropped
 * image URL (e.g. dragged from another browser tab) is inserted directly.
 *
 * Returns `true` when it consumed the drop, which is what tells ProseMirror not to apply its own
 * default handling — the return value is the contract, and it is why this is worth having out here
 * where a test can drive it with a fake `EditorView` instead of a real editor and a real drag.
 *
 * @complexity Time: O(f) in dropped files, each read asynchronously; space: O(1) beyond the reads.
 */
export function handleImageDrop(view: EditorView, event: DragEvent, moved: boolean): boolean {
  if (moved) return false; // internal content reorder, not an external drop
  const insertAt = () => view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.to;

  const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
  if (files.length > 0) {
    event.preventDefault();
    const pos = insertAt();
    for (const file of files) {
      readFileAsDataUrl(file).then((src) => {
        const node = view.state.schema.nodes.image.create({ src, alt: file.name });
        view.dispatch(view.state.tr.insert(pos, node));
      });
    }
    return true;
  }

  const uri = droppedUri(event.dataTransfer ?? null);
  if (/^https?:\/\//i.test(uri)) {
    event.preventDefault();
    const node = view.state.schema.nodes.image.create({ src: uri });
    view.dispatch(view.state.tr.insert(insertAt(), node));
    return true;
  }

  return false;
}
