import type { RowMenuItem } from "@jini-ai/admin/react";
import type { EditorView } from "@tiptap/pm/view";

import type { AdminPost } from "../../lib/api";
import { POSTS_DICT } from "./posts-i18n";

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
export function postRowMenuItems(post: AdminPost, handlers: PostRowMenuHandlers, locale: string): RowMenuItem[] {
  const t = (key: string): string => POSTS_DICT[locale]?.[key] ?? key;
  const items: RowMenuItem[] = [{ key: "edit", label: t("Edit"), onSelect: () => handlers.onEdit(post) }];
  if (post.status === "published") {
    items.push({ key: "disable", label: t("Disable"), onSelect: () => handlers.onDisable(post) });
  }
  items.push({ key: "delete", label: t("Delete"), destructive: true, onSelect: () => handlers.onDelete(post) });
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

/** Which end of `updatedAt` the Posts list's "Updated" column header currently sorts toward. */
export type PostUpdatedSortDirection = "newest" | "oldest";

/**
 * The "Updated" column's sort — pulled out of `Posts.tsx` so the comparator and its default are
 * directly testable without rendering a `DataTable` (2026-08-10, sortable-Updated-column feature).
 *
 * Note for callers: the server's `listPosts` has no `ORDER BY` today (confirmed against
 * `PostSqliteRepo.list` — a plain `select().from(posts).where(...)`), so rows arrive in table scan
 * order, not `updatedAt` order. This function is what actually produces "most recent first" rather
 * than that already being true of the input.
 *
 * @complexity Time: O(n log n) in `posts.length` (a single `Array#sort`); space: O(n) for the copy
 * — the input is never mutated, matching every other list-shaping helper in this codebase.
 */
export function sortPostsByUpdated(posts: readonly AdminPost[], direction: PostUpdatedSortDirection): AdminPost[] {
  const sign = direction === "newest" ? -1 : 1;
  return [...posts].sort((a, b) => sign * (Date.parse(a.updatedAt) - Date.parse(b.updatedAt)));
}

/**
 * The "Updated" column header button's accessible name — states the CURRENT sort direction and
 * what activating the button does next, rather than relying on the visual ▲/▼ glyph alone (which
 * `aria-hidden` hides from assistive tech; see `Posts.tsx`'s column definition).
 */
export function updatedSortButtonLabel(direction: PostUpdatedSortDirection): string {
  return direction === "newest"
    ? "Sorted by updated date, newest first. Activate to sort oldest first."
    : "Sorted by updated date, oldest first. Activate to sort newest first.";
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

// ---------------------------------------------------------------------------
// Post-title-in-document (2026-08-11) — see `lib/post-title-extension.ts`'s file header for the
// feature this pair of pure functions belongs to and why the title lives in `bodyJson` at all.
// ---------------------------------------------------------------------------

/** Loose TipTap JSON node shape — same "typed loosely, never TipTap's `JSONContent`" convention
 *  `PostFormState.bodyJson`'s own doc states, since these two functions only ever read/build a few
 *  known keys, never the full node vocabulary. */
type LooseNode = { type?: unknown; content?: unknown; attrs?: unknown; text?: unknown };

function isLooseNode(value: unknown): value is LooseNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A `title`-type node carrying `text` as its sole content — `[]` (no text child) when `text` is
 *  empty, matching how TipTap represents an empty node (an empty `content` array, never a text node
 *  with `text: ""`, which ProseMirror's own schema rejects). */
function titleNode(text: string): LooseNode {
  return { type: "title", content: text ? [{ type: "text", text }] : [] };
}

/**
 * Ensures `bodyJson` starts with a `title` node — the post-title-in-document feature's back-compat
 * seam. Every post saved before this feature has a `bodyJson` with no `title` node at all (the
 * editor's custom `doc` schema, `content: "title block+"`, would reject loading it as-is), so the
 * editor's load effect (`use-post-editor.hooks.ts`) runs every `bodyJson` through this FIRST:
 *
 *  - Already migrated (first content node is already `type: "title"`): passed through unchanged.
 *  - Anything else: a title node synthesized from the post's own (pre-existing) `title` field is
 *    prepended, with a single empty paragraph appended when the source had no block content at all
 *    (a brand-new post's empty `bodyJson`, or any other doc with no blocks) — `"title block+"`
 *    requires at least one block, and a post can otherwise be entirely blank.
 *
 * Idempotent and side-effect-free — safe to call on every load regardless of whether migration is
 * actually needed, so the caller never has to detect that itself.
 *
 * @complexity O(n) in `bodyJson`'s own top-level content length (one array copy/prepend, no
 * recursion into nested content).
 */
export function withTitleNode(bodyJson: unknown, title: string): LooseNode {
  const doc = isLooseNode(bodyJson) ? bodyJson : null;
  const content = doc && Array.isArray(doc.content) ? doc.content : [];
  const first = content[0];
  if (isLooseNode(first) && first.type === "title") return doc as LooseNode;

  const blocks = content.length > 0 ? content : [{ type: "paragraph" }];
  return { type: "doc", content: [titleNode(title), ...blocks] };
}

/**
 * The current title node's plain text, read out of a live `editor.getJSON()` snapshot — the
 * in-canvas-edit half of the title's two-way sync with the standalone title `<input>` (see
 * `use-post-editor.hooks.ts`'s `onUpdate`). `""` when the doc's first child isn't a `title` node —
 * not expected once `withTitleNode` has run once, but kept total rather than throwing on a malformed
 * snapshot, same defensive posture every other reader in this module takes on `bodyJson`.
 *
 * @complexity O(t) in the title node's own inline content length.
 */
export function titleNodeText(bodyJson: unknown): string {
  const doc = isLooseNode(bodyJson) ? bodyJson : null;
  const content = doc && Array.isArray(doc.content) ? doc.content : [];
  const first = content[0];
  if (!isLooseNode(first) || first.type !== "title") return "";
  const inner = Array.isArray(first.content) ? first.content : [];
  return inner.map((n) => (isLooseNode(n) && typeof n.text === "string" ? n.text : "")).join("");
}
