import type { DataTableSortDirection, DataTableSortState } from "@jini-ai/admin/core";
import type { RowMenuItem } from "@jini-ai/admin/react";
import type { EditorView } from "@tiptap/pm/view";

import type { AdminPost } from "../../lib/api";
import { buildAgentListHandles } from "../../lib/agent-list-handles";
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

/**
 * This screen's name on `lib/content-refresh-bus.ts` — see `taxonomy/rules.ts`'s `TAXONOMY_RESOURCE`
 * for why this is a plain colocated constant rather than a shared registry. `content_post_create`/
 * `_update`/`_delete` (`apps/website/src/features/post/agent-tools.ts`) are agent-callable, so
 * `use-posts.hooks.ts` needs the same "an assistant write shows up without a reload" fix
 * `use-taxonomy.hooks.ts` shipped first — this is the bug this whole pass was dispatched to fix.
 */
export const POSTS_RESOURCE = "posts";

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

/**
 * Row-menu agent handle for every post, keyed by post id. `Posts.tsx` looks a row's handle up BY
 * ID rather than by render position, so a row keeps the same handle even after the table re-sorts
 * (`buildAgentListHandles`'s own contract derives a handle from each id's position in THIS array,
 * not the table's current render order). `null` (list not loaded yet) returns an empty map rather
 * than throwing, so the caller can memoize this unconditionally above its own loading-state early
 * return without special-casing the not-yet-loaded render.
 *
 * @complexity Time/space: O(n) in post count.
 */
export function buildPostRowMenuHandleMap(posts: AdminPost[] | null): Map<string, string> {
  if (!posts) return new Map();
  const handles = buildAgentListHandles(
    "posts-row",
    posts.map((post) => post.id),
  );
  return new Map(posts.map((post, index) => [post.id, handles[index]!]));
}

/** Reads a browser `File` into a full `data:` URL (mirrors Media.tsx's upload helper, but keeps the
 *  prefix).
 *
 * Used by `use-post-editor.hooks.ts`'s `uploadDroppedFile` (2026-08-12, B1) as the read step before
 * uploading a dropped/pasted file — the prefix is stripped there to get the bare base64 payload
 * `api.uploadMedia` wants. No longer used by {@link handleImageDrop} below (which used to inline the
 * result straight into `bodyJson` as a `data:` URL — see that function's own doc for why that path
 * was replaced rather than kept as a fallback).
 *
 * @complexity Time: O(n) in file bytes; space: O(n) for the base64 result, which is ~1.33x the input.
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

/**
 * Maps the slug-collision override `<select>`'s string value to the tri-state `overridesThemePage`
 * it represents — see `PostEditorController.overridesThemePage`'s own doc for the full tri-state
 * contract this mirrors. Split out as a pure function (2026-08-20, UI-subhook pass, `PostEditor.tsx`
 * complexity-ceiling work) so this mapping has exactly ONE implementation, shared by
 * `usePostEditorUi` (`hooks/use-post-editor-ui.hooks.ts`) and that hook's own test fixture, rather
 * than being hand-typed a second time wherever a test needs to drive the same control.
 */
export function overridesThemePageFromSelectValue(value: string): boolean | null {
  if (value === "default") return null;
  return value === "post";
}

/** A toolbar button's className for its active/inactive state — the one thing repeated across every
 *  formatting button in `PostEditor.tsx`'s `Toolbar`. Extracted so the eleven
 *  `${active ? " on" : ""}` ternaries that used to live inline in `Toolbar`'s JSX (its entire branch
 *  count) collapse to eleven calls to this one single-branch function instead. */
export function toolbarBtnClass(active: boolean): string {
  return `tb-btn${active ? " on" : ""}`;
}

/** A 6-digit hex color if `value` is one, else `fallback` — display-only normalization for the
 *  color/background-color `<input type="color">` swatches in `Toolbar` (2026-08-11): a native color
 *  input can only ever SHOW a strict 6-digit hex, but the active mark's own `color` attr can be
 *  `null` (nothing picked yet) or a non-hex CSS value the editor inherited some other way (pasted
 *  `rgb(...)`/a keyword like `"red"`). Purely cosmetic — it decides what the swatch looks like, not
 *  what gets applied on change (`chain().setColor(e.target.value)` always reads straight off the
 *  native input, which itself can only ever emit a valid hex). */
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
export function hexOrDefault(value: string | null, fallback: string): string {
  return value !== null && HEX_COLOR_PATTERN.test(value) ? value : fallback;
}

// ---------------------------------------------------------------------------
// Font family/size, line height (2026-08-11) — closed preset lists for `Toolbar`'s three
// `<select>` controls. A fixed list rather than free text: it's easier to use than typing a raw
// CSS value, and every value it can produce already passes `render.ts`'s own
// `safeCssFontFamily`/`safeCssLength` allowlist by construction, so an author can never end up
// with a "valid in the editor, silently dropped on publish" surprise from a typo. `""` is the
// shared "unset the attr" sentinel across all three — `Toolbar`'s onChange treats it that way, not
// as "set it to an empty string".
//
// The leading `value: ""` entry's LABEL (toolbar polish, 2026-08-11, owner: "is it possible to set
// the defaults to actual numbers so people can quickly understand what that is?") states the real
// resolved value rather than the word "Default" — three selects that all read "Default" tell an
// operator nothing about which is font/size/line-height, or what any of them currently produce.
// Verified live against a running admin (`getComputedStyle` on `.editor-body .tiptap p` in an
// actual browser, not read off the stylesheet by eye — a plausible-looking number here would be
// worse than "Default", since it would be confidently wrong): the editor's own baseline body text
// (a paragraph with NO explicit textStyle mark, i.e. exactly what `value: ""` represents) computes
// to `font-family: "DM Sans"`, `font-size: 16px`, `line-height: 1.6` (`.editor-body .tiptap p`'s
// own declared ratio in this same file). That baseline is deliberately NOT the published site's own
// body defaults (`.post-detail-body` in `src/themes/static/basic/css/styles.css`: 17px/1.7,
// no family override so it also inherits `--font-ui`/DM Sans) — the editor was never meant to be
// pixel-parity WYSIWYG for size/line-height, only for the content itself, so this label states what
// the CONTROL currently shows on screen, not a promise about the published page.
//
// Suffixed `" (Default)"` rather than bare "16"/"1.6"/"DM Sans" — `FONT_SIZE_OPTIONS` already has a
// real preset at exactly `16px`, and a native `<select>` with two options both reading bare "16"
// (one `value=""`, one `value="16px"`) is indistinguishable to a sighted user and ambiguous to a
// screen reader, even though they mean different things (leave the attribute unset vs. bake in an
// explicit 16px). The suffix keeps the entry unique while still stating the real number.
// ---------------------------------------------------------------------------

/** One `<option>` for a `Toolbar` preset `<select>` — `value: ""` is always the leading entry
 *  (labeled with the real resolved default, see the block comment above), matching `PostEditor.tsx`'s
 *  own template-picker precedent (`availableTemplates.map`'s "No template chosen" as the deliberate
 *  final/first option, not a coerced `null`). */
export interface ToolbarSelectOption {
  label: string;
  value: string;
}

export const FONT_FAMILY_OPTIONS: readonly ToolbarSelectOption[] = [
  { label: "DM Sans (Default)", value: "" },
  { label: "Sans-serif", value: "ui-sans-serif, system-ui, sans-serif" },
  { label: "Serif", value: "ui-serif, Georgia, serif" },
  { label: "Monospace", value: "ui-monospace, 'SF Mono', monospace" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
];

export const FONT_SIZE_OPTIONS: readonly ToolbarSelectOption[] = [
  { label: "16 (Default)", value: "" },
  { label: "12", value: "12px" },
  { label: "14", value: "14px" },
  { label: "16", value: "16px" },
  { label: "18", value: "18px" },
  { label: "20", value: "20px" },
  { label: "24", value: "24px" },
  { label: "32", value: "32px" },
  { label: "48", value: "48px" },
];

export const LINE_HEIGHT_OPTIONS: readonly ToolbarSelectOption[] = [
  { label: "1.6 (Default)", value: "" },
  { label: "1", value: "1" },
  { label: "1.15", value: "1.15" },
  { label: "1.5", value: "1.5" },
  { label: "1.75", value: "1.75" },
  { label: "2", value: "2" },
];

/**
 * Code block language picker (2026-08-11, coordinator MSG #1) — every `value` here is one of
 * lowlight's own `common` grammar set's registered keys (`use-post-editor.hooks.ts`'s
 * `createLowlight(common)`), so picking any option always produces REAL in-editor highlighting,
 * never a silent "unrecognized language, falls back to plain text" surprise. `"xml"` is the actual
 * registered `highlight.js` grammar key for HTML (aliases like `"html"` are resolved by
 * `highlight.js`'s own internal alias table, which lowlight's `registered()`/`listLanguages()`
 * checks do NOT consult — verified against the installed dist rather than assumed), so the option
 * is labeled "HTML" but stores the key lowlight actually has registered.
 */
export const CODE_LANGUAGE_OPTIONS: readonly ToolbarSelectOption[] = [
  { label: "Plain text", value: "plaintext" },
  { label: "JavaScript", value: "javascript" },
  { label: "TypeScript", value: "typescript" },
  { label: "Python", value: "python" },
  { label: "Bash", value: "bash" },
  { label: "JSON", value: "json" },
  { label: "HTML", value: "xml" },
  { label: "CSS", value: "css" },
  { label: "SQL", value: "sql" },
  { label: "Java", value: "java" },
  { label: "Go", value: "go" },
  { label: "Rust", value: "rust" },
  { label: "Ruby", value: "ruby" },
  { label: "PHP", value: "php" },
  { label: "YAML", value: "yaml" },
  { label: "Markdown", value: "markdown" },
];

// ---------------------------------------------------------------------------
// Column sort (2026-08-10, Updated only; generalized to Title/Slug/Status 2026-09-02; migrated onto
// `DataTable`'s own shared sort mechanism 2026-09-02) — `Posts.tsx` used to hand-roll its own sort
// dispatcher, header-click transition, caret glyph, and accessible-name plumbing because `DataTable`
// had nowhere to put any of that (see that component's own file header, `@jini-ai/admin`). Now that
// `DataTable` owns all of it generically via `DataTableColumn.sort`/`DataTableProps.sort`/
// `onSortChange`, only the genuinely domain-specific pieces stay here: each column's ascending
// comparator, the Updated column's non-default starting direction, and every column's
// accessible-name phrasing. One active column at a time — the owner did not ask for multi-column
// sort, and `DataTable` itself enforces that.
// ---------------------------------------------------------------------------

/** The Posts list's default sort on first load — unchanged from the pre-existing Updated-only
 *  behavior (newest first) now that Title/Slug/Status are sortable too, so adding them does not
 *  itself change what an operator sees before ever clicking a header. */
export const DEFAULT_POST_SORT: DataTableSortState = { column: "updated", direction: "desc" };

/** `status` is exactly `"draft" | "published"` (`post.ts`), so plain alphabetical order already
 *  equals domain order — no custom rank table needed. Ascending-only, matching
 *  `DataTableColumnSort.compare`'s own contract: `DataTable` negates this for `"desc"` rather than
 *  this module taking a direction parameter itself. */
export function comparePostsByTitle(a: AdminPost, b: AdminPost): number {
  return a.title.localeCompare(b.title);
}

/** @see comparePostsByTitle — same contract, compared on `slug` instead of `title`. */
export function comparePostsBySlug(a: AdminPost, b: AdminPost): number {
  return a.slug.localeCompare(b.slug);
}

/** @see comparePostsByTitle — same contract, compared on `status` instead of `title`. */
export function comparePostsByStatus(a: AdminPost, b: AdminPost): number {
  return a.status.localeCompare(b.status);
}

/**
 * Ascending order = oldest-first; `DataTable` negates it for `"desc"` (newest-first), which is also
 * this column's own starting direction (its `defaultDirection` in `Posts.tsx`'s column definition) —
 * an operator's first click on "Updated" has always meant "show me the newest," unlike the other
 * three columns' natural A-to-Z first read.
 *
 * Note for callers: the server's `listPosts` has no `ORDER BY` today (confirmed against
 * `PostSqliteRepo.list` — a plain `select().from(posts).where(...)`), so rows arrive in table scan
 * order, not `updatedAt` order. This comparator is what actually produces "most recent first" rather
 * than that already being true of the input. `Date.parse`, not a string compare — `updatedAt` is
 * ISO-8601 **text** with no schema guarantee against a future non-`Z` UTC-offset value, which
 * string-sorts wrong against `Z`-form values.
 */
export function comparePostsByUpdated(a: AdminPost, b: AdminPost): number {
  return Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
}

/**
 * The accessible name for a lexicographic column's (Title/Slug/Status) sort control, in every state
 * `DataTable` can ask for — states the CURRENT state and what activating the control does next,
 * rather than relying on the visual caret alone (`DataTable` marks that `aria-hidden`). `direction`
 * is `null` when a different column is currently active — `DataTable` resolves that itself, so
 * unlike the pre-existing hand-rolled version this needs no `PostSortState`/column comparison here.
 *
 * `columnName` is a fixed English label supplied by the caller (`Posts.tsx`), not the translated
 * header text — matching this feature's pre-existing precedent of hardcoded English regardless of
 * admin locale (aria-label copy in this codebase is not run through `POSTS_DICT`).
 *
 * @complexity Time/space: O(1).
 */
export function postColumnSortLabel(columnName: string, direction: DataTableSortDirection | null): string {
  if (direction === null) return `Not sorted by ${columnName}. Activate to sort ascending.`;
  return direction === "asc"
    ? `Sorted by ${columnName}, ascending. Activate to sort descending.`
    : `Sorted by ${columnName}, descending. Activate to sort ascending.`;
}

/** Same contract as {@link postColumnSortLabel}, phrased in the Updated column's own "newest"/
 *  "oldest" vocabulary rather than generic "ascending"/"descending" — unchanged wording from the
 *  pre-existing Updated-only feature. */
export function updatedColumnSortLabel(direction: DataTableSortDirection | null): string {
  if (direction === null) return "Not sorted by updated date. Activate to sort newest first.";
  return direction === "desc"
    ? "Sorted by updated date, newest first. Activate to sort oldest first."
    : "Sorted by updated date, oldest first. Activate to sort newest first.";
}

/**
 * Drag-and-drop image support for a URL dragged in from elsewhere (e.g. an image dragged out of
 * another browser tab) — the dropped resource's own URI is inserted as a legacy `src`-only image
 * node, unchanged; `render.ts`'s `"image"` case still degrades an untrusted `src` to the public-safe
 * placeholder, same as it always has for this shape.
 *
 * A dropped LOCAL FILE is deliberately NOT handled here (2026-08-12, B1 — file-handler drag/paste
 * upload). It used to be inlined as a `data:` URL straight into `bodyJson` (a real memory cost —
 * `readFileAsDataUrl`'s own doc), which `@tiptap/extension-file-handler`'s `onDrop` now supersedes:
 * it uploads through the real media-library path and inserts the SAME ref-based
 * `{assetId, transformName}` node the Media picker produces (`use-post-editor.hooks.ts`'s
 * `handleFileDrop`). This function returning `false` for a file drop is load-bearing, not a gap —
 * `handleDrop` set directly on `useEditor`'s `editorProps` (this function) runs BEFORE any
 * extension-registered ProseMirror plugin's own `handleDrop` (confirmed against `prosemirror-view`'s
 * `EditorView.someProp`: direct view props are tried first, plugin props only if every direct prop
 * returns nothing), so this function returning `true` for a file drop would make FileHandler's own
 * `onDrop` permanently unreachable for local files — a silent regression of the exact "editor works,
 * public site doesn't" shape this whole file's own render-contract discipline exists to catch,
 * except this one would have broken in the OTHER direction (a feature that never fires at all).
 *
 * Returns `true` when it consumed the drop, which is what tells ProseMirror not to apply its own
 * default handling — the return value is the contract, and it is why this is worth having out here
 * where a test can drive it with a fake `EditorView` instead of a real editor and a real drag.
 *
 * @complexity Time/space: O(1) — a single `DataTransfer` read, no iteration.
 */
export function handleImageDrop(view: EditorView, event: DragEvent, moved: boolean): boolean {
  if (moved) return false; // internal content reorder, not an external drop

  const uri = droppedUri(event.dataTransfer ?? null);
  if (/^https?:\/\//i.test(uri)) {
    event.preventDefault();
    const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.to;
    const node = view.state.schema.nodes.image.create({ src: uri });
    view.dispatch(view.state.tr.insert(pos, node));
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

/**
 * Owner-reported bug (2026-08-12): "the YouTube [embed] doesn't work" — reproduced live (headless
 * Chromium, before this fix) against `PostPreview`'s raw draft fallback (`PostEditor.tsx`, the
 * branch a NEW/unpublished post's Preview tab falls back to, fed `editor.getHTML()` through
 * `@jini-ai/ui/renderers`' `SrcDocSandbox`): a solid black box, no player, no thumbnail. Root
 * cause is that sandbox's OWN, deliberate security posture — `sandbox="allow-scripts
 * allow-popups allow-popups-to-escape-sandbox"` with no `allow-same-origin`, because it treats
 * `html` as hostile by construction (see its own file header) — which gives the sandboxed
 * document (and everything nested inside it) an opaque origin. YouTube's own embed player script
 * needs same-origin storage access and fails to initialize there; confirmed live via two distinct
 * console errors inside that frame (`Failed to read the 'caches' property from 'Window'... the
 * context is sandboxed and lacks the 'allow-same-origin' flag`, `writeEmbed is not defined`).
 *
 * `SrcDocSandbox` is a shared `@jini-ai/ui` component with no per-instance sandbox override, used
 * elsewhere for genuinely untrusted (e.g. AI-generated) HTML — loosening its sandbox to fix one
 * embed type in one caller is out of this fix's scope and would weaken a security boundary that
 * has nothing to do with this bug. The published public page and the live/template-preview
 * branches (`PostPreview`'s other three branches) are NOT sandboxed at all and were confirmed
 * live to render the real, playable embed correctly — this is scoped to the raw fallback only,
 * consistent with that branch's own already-disclosed "rough render... not parity" status
 * (`PostPreview`'s file header).
 *
 * Rather than let the sandbox silently show a broken black box, this swaps each YouTube embed
 * `editor.getHTML()` produces (`<div data-youtube-video><iframe .../></div>` — matches
 * `@tiptap/extension-youtube`'s own `renderHTML`/`parseHTML` tag shape) for a labelled
 * placeholder, the same "degrade to a clear label rather than a broken render" idiom `render.ts`'s
 * `mediaPlaceholder` already uses for the public side. `DOMParser` (not a regex) because Tiptap's
 * own attribute order/whitespace on that markup is an implementation detail this function
 * shouldn't depend on. Styled with an inline `style` attribute, not a class in `styles.css` — this
 * HTML is handed to `SrcDocSandbox`, which wraps it in its OWN isolated `srcDoc` document
 * (`buildSrcDoc`, `@jini-ai/ui`) with no link back to the admin app's stylesheet at all; a class
 * here would be exactly the "toggles in the DOM, does nothing" gap this project's own `Focus`-
 * extension removal already flagged once.
 *
 * @param html Raw HTML from `editor.getHTML()` — never persisted, only ever fed to `SrcDocSandbox`.
 * @returns The same HTML with every YouTube embed replaced by a placeholder `<div>`; unrelated
 *   markup (including the placeholder's own escaping) is left exactly as `DOMParser`/
 *   `Element.outerHTML` round-trip it, not hand-serialized.
 * @complexity O(n) in `html`'s length (one parse, one query, one attribute set per match).
 */
export function degradeUnplayableEmbedsForRawPreview(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const wrapper of doc.querySelectorAll("div[data-youtube-video]")) {
    wrapper.innerHTML = "";
    wrapper.removeAttribute("data-youtube-video");
    wrapper.setAttribute("class", "embed-preview-unavailable");
    wrapper.setAttribute(
      "style",
      "aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;text-align:center;" +
        "padding:1rem;background:#f3f3f3;color:#666;border-radius:10px;font-size:0.9rem;margin:24px 0;"
    );
    wrapper.textContent = "YouTube video — publish this post (or check the live template preview) to watch it play here.";
  }
  return doc.body.innerHTML;
}
