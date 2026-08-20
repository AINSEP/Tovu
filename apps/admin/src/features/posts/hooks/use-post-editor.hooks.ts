import { useEffect, useRef, useState, type RefObject } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { TextStyle, Color, BackgroundColor, FontFamily, FontSize, LineHeight } from "@tiptap/extension-text-style";
import Typography from "@tiptap/extension-typography";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight, common } from "lowlight";
import Youtube from "@tiptap/extension-youtube";
import Mention from "@tiptap/extension-mention";
import FileHandler from "@tiptap/extension-file-handler";
import { Placeholder, CharacterCount } from "@tiptap/extensions";
import InvisibleCharacters from "@tiptap/extension-invisible-characters";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { TaskList, TaskItem } from "@tiptap/extension-list";

import type { AdminPost, ThemeTier } from "../../../lib/api";
import type { Translate } from "../../../lib/dictionary-translator";
import { MediaImage } from "../../../lib/media-image-extension";
import { WidgetEmbed } from "../../../lib/widget-embed-extension";
import { PostTitleDocument, PostTitle } from "../../../lib/post-title-extension";
import { navigate as realNavigate } from "../../../lib/router";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { useDirtyGuard } from "../../../hooks/use-dirty-guard.hooks";
import { handleImageDrop, readFileAsDataUrl, titleNodeText, withTitleNode } from "../rules";
import { POSTS_DICT } from "../posts-i18n";
import { defaultPostEditorPort } from "./post-editor-dependencies.hooks";
import type { PostEditorPort } from "./post-editor-port.hooks";

/**
 * @file Everything the post/page EDITOR does, so `PostEditor.tsx` is only markup.
 *
 * Extracted verbatim — same state, same effect keys, same error strings, same `original`
 * re-baselining. The doc comments moved with the code they describe; several are decision records
 * (why the delete copy refuses to promise recoverability, why `original` is captured from
 * `editor.getJSON()` rather than the server payload) and a comment parted from its code stops being
 * read.
 *
 * Naming follows `src/hooks/use-settings-slice.hooks.ts`. Feature-local: nothing outside
 * `features/posts` needs it.
 *
 * `useWiredX` conversion (2026-08-11, per `ADS-memory/reports/implementation/
 * 2026-08-11-wired-hooks-audit.md`'s own written-out plan for this file): `port` (`PostEditorPort`,
 * `post-editor-port.hooks.ts`) and `navigate` are now injected via {@link usePostEditor}'s second
 * parameter rather than reached for directly, so a test can describe load/save/delete outcomes
 * against `createFakePostEditorPort` instead of stubbing `fetch`. {@link useWiredPostEditor} is the
 * zero-argument pair `PostEditor.tsx` actually mounts — copies `features/redirects`'s conversion
 * shape (commit `2ea11f4`). `withTitleNode`/`titleNodeText` (pure rules, `../rules.ts`) and TipTap's
 * own `useEditor` stay direct imports, same as that conversion's own `describeApiError`/
 * `useFetchQuery` precedent — see `post-editor-port.hooks.ts`'s file header for why.
 *
 * `t` (2026-08-11, standing i18n rule — a component with a hook gets a BOUND `t` from that hook, not
 * its own `useAdminLocale()`/dictionary import): also injected via {@link PostEditorDependencies},
 * same shape `use-page-editor.hooks.ts` established for `t`/`locale` on its own second parameter.
 * Unlike that file's `t: (locale, key) => string` (unbound, `locale` threaded through every call
 * site), this one is pre-bound to `(key: string) => string` — the owner's explicit ask for this
 * conversion, so a test can inject `t: (k) => k` and every assertion stays stable against copy
 * changes rather than also asserting a particular locale resolved correctly. `useAdminLocale()` and
 * `POSTS_DICT` (`../posts-i18n.ts`) are called/read only inside {@link useWiredPostEditor}, exactly
 * where `PostEditor.tsx` used to call them directly before this change — `postRowMenuItems`
 * (`../rules.ts`) keeps its own independent `POSTS_DICT[locale]?.[key] ?? key` closure unchanged
 * (out of scope: it's `Posts.tsx`'s list-row menu, a different screen with a different hook).
 */

/** What `useDirtyGuard` compares — every field this editor lets an operator change. `bodyJson` is
 *  typed loosely (not TipTap's `JSONContent`) since the guard only ever serializes it for
 *  comparison, never reads its shape. */
export interface PostFormState {
  title: string;
  slug: string;
  status: "draft" | "published";
  bodyJson: unknown;
  templateChoice: string | null;
  /** Tri-state (2026-08-15) — see {@link PostEditorController.overridesThemePage}'s own doc. */
  overridesThemePage: boolean | null;
}

/** The two things the editor's main pane can show — the rich-text editor, or a rendered preview
 *  of the post. Named for what an author sees, not the library underneath ("Tiptap" never appears
 *  in the UI) — mirrors `features/pages/hooks/use-page-editor.hooks.ts`'s `PageEditorView`, minus
 *  the HTML/Interactive tabs a `bodyJson`-based post has no equivalent of. */
export type PostEditorView = "edit" | "preview";

export interface PostEditorController {
  /** `null` until the post loads — the caller renders a loading state. */
  post: AdminPost | null;
  /** `null` until TipTap has mounted; the toolbar and `EditorContent` both gate on it. */
  editor: Editor | null;
  title: string;
  setTitle: (title: string) => void;
  slug: string;
  setSlug: (slug: string) => void;
  status: "draft" | "published";
  setStatus: (status: "draft" | "published") => void;
  templateChoice: string | null;
  setTemplateChoice: (templateChoice: string | null) => void;
  /** The active static theme's declared `templates` list — `[]` when the theme doesn't support
   *  templates, in which case the caller should not render the picker at all. */
  availableTemplates: string[];
  /** Mention feature's picker list (2026-08-11) — every OTHER post/page this workspace has,
   *  unfiltered (`PostEditor.tsx` excludes the currently-open post at render time). `[]` while
   *  loading or on fetch failure — the caller should render the mention control as inert/empty
   *  rather than erroring, since this is a nice-to-have, not load-bearing content. */
  mentionablePosts: AdminPost[];
  /** The workspace's currently active theme id (`PresentationSettings.activeThemeId`) — `null`
   *  until the presentation settings load. Feeds the "View Template" button's fetch URL
   *  (`/theme-assets/{activeThemeId}/pages/{templateChoice}`, 2026-08-10). */
  activeThemeId: string | null;
  /** The active theme's own capability tier (`AdminThemeSummary.tier`, looked up by
   *  `activeThemeId` against `availableThemes`) — `null` when the id has not loaded yet OR when
   *  the active theme is absent from `availableThemes` (a real gap the caller should treat as
   *  "unknown", not silently as any one tier). Only a `"static"` theme actually serves
   *  `pages/*.html` at `/theme-assets/...` (see `theme-static-assets.ts`'s own file header: it
   *  mounts one `express.static` root per discovered STATIC-tier theme dir, nothing else) — the
   *  caller uses this to decide whether "View Template" can fetch anything at all. */
  activeThemeTier: ThemeTier | null;
  /** The active theme's manifest `apiVersion` (`AdminThemeSummary.apiVersion`, looked up the same way
   *  as `activeThemeTier` just above) — `undefined` for a v1 theme (including "not loaded yet" or
   *  "absent from `availableThemes`", same as `activeThemeTier`'s `null`, since a v2-only fetch URL
   *  and a v1 one both need a concrete value rather than a third "unknown" state to carry through
   *  `useTemplateSource`). 2026-08-19 architecture audit finding 1 — feeds `PostTemplateModal`'s
   *  "View Template" fetch, which 404ed on every v2 built-in theme without this. */
  activeThemeApiVersion: 2 | undefined;
  /**
   * Tri-state (2026-08-15) — `null` means this post has never had an explicit opinion on the
   * slug-collision override (the server resolver's current default applies, post-wins as of this
   * change); `true`/`false` is a permanent explicit choice the author made after seeing the
   * collision warning. See `AdminPost.overridesThemePage`'s own doc (`lib/api.ts`) for the full
   * server-mirrored contract this state field carries.
   */
  overridesThemePage: boolean | null;
  setOverridesThemePage: (overridesThemePage: boolean | null) => void;
  /** `true` when this post's own `slug` matches one of the active theme's own page ids — the caller
   *  shows the collision warning + override checkbox only then. */
  hasSlugCollision: boolean;
  view: PostEditorView;
  setView: (value: PostEditorView) => void;
  message: string | null;
  error: string | null;
  confirmingDelete: boolean;
  setConfirmingDelete: (open: boolean) => void;
  deleting: boolean;
  /** `false` when the operator declined to discard unsaved edits — the caller must then
   *  `preventDefault()` the navigation. */
  confirmLeave: () => boolean;
  /** Whether the working copy (title/slug/status/body/template/override) has drifted from the
   *  last loaded-or-saved state — the same comparison `confirmLeave` already gates navigation on
   *  (`useDirtyGuard`'s `isDirty`), exposed directly so the Preview tab can decide whether the
   *  saved, published post at its public URL still matches what's in the editor right now. */
  dirty: boolean;
  /**
   * Template-preview fix (2026-08-11) — `dirty` MINUS the `templateChoice` comparison: whether
   * title/slug/status/body/`overridesThemePage` differ from what's saved. A post can be `dirty`
   * (Save button lit) while `contentDirty` is `false` — that's exactly "only the template picker
   * moved" — which is what lets `PostPreview` show a real template-applied render for the pending
   * choice instead of falling all the way back to a rendering of the raw TipTap buffer. Mirrors
   * `features/pages/hooks/use-page-editor.hooks.ts`'s identical field. See `ADS-memory/reports/
   * implementation/2026-08-11-template-preview-render-bug.md` for the bug this fixes.
   */
  contentDirty: boolean;
  /** The admin-only template-preview URL, pre-built from `port.templatePreviewUrl` (a synchronous
   *  URL builder, not a fetch) — used both as `PostPreview`'s branch-2 iframe `src` and its branch-3
   *  hidden `<form action>` (same endpoint, `GET` vs `POST`). `""` before `post` loads; mirrors
   *  `features/pages/hooks/use-page-editor.hooks.ts`'s identical field. */
  templatePreviewUrl: string;
  /** The live, unsaved TipTap body — `editor.getJSON() ?? null` read fresh every render off the
   *  editor's own imperative state, not React state (same idiom `contentDirty`/`dirty` already use
   *  internally). Exposed so `PostPreview` can serialize it into the pending-content-preview hidden
   *  form without importing TipTap itself. `null` before the editor mounts. */
  bodyJson: unknown;
  /** Whether the "View Template" modal (`PostTemplateModal`) is open — moved out of `PostEditor.tsx`
   *  (leftover `useState` after the `useWiredX` conversion, see `apps/admin/INFO.md`'s Hooks
   *  section). Ephemeral view state; not persisted. */
  showTemplateModal: boolean;
  setShowTemplateModal: (open: boolean) => void;
  /** DOM ref for the pending-content-preview's hidden `<form>` — owned here, not local to
   *  `PostPreview`, so the debounced auto-submit effect below can reach it. Same "hook owns the ref,
   *  view attaches it" shape `use-page-editor.hooks.ts`'s `frameRef` already uses. */
  previewFormRef: RefObject<HTMLFormElement | null>;
  /** Stable name shared by the hidden form's `target` and the iframe it submits into. `""` before
   *  `post` loads — `PostPreview` never renders that early. */
  previewFormTarget: string;
  save: (statusOverride?: "draft" | "published") => Promise<void>;
  remove: () => Promise<void>;
  /** Bound translator — `key` already resolved against the caller's locale, so `PostEditor.tsx`
   *  never imports `useAdminLocale`/`POSTS_DICT` itself. See this file's header. */
  t: Translate;
}

/** {@link usePostEditor}'s injected second parameter — see this file's header for the conversion this belongs to. */
export interface PostEditorDependencies {
  port: PostEditorPort;
  navigate: (path: string) => void;
  t: Translate;
}

/**
 * Registers lowlight's `common` grammar set once at module load (2026-08-11, code-block
 * highlighting) — `createLowlight` builds a language registry, not per-editor state, so this is a
 * plain module-level singleton rather than something built inside the hook on every mount.
 * `common` (not `all`): a curated, smaller set of the languages an author actually reaches for
 * (js/ts/python/bash/json/css/…) — `all` registers every `highlight.js` grammar and would bloat
 * this bundle for languages nothing in `rules.ts`'s `CODE_LANGUAGE_OPTIONS` even offers picking.
 */
const lowlight = createLowlight(common);

/**
 * Template-preview fix (2026-08-11) — see `contentDirty`'s doc on `PostEditorController`. Same
 * `JSON.stringify` comparison `useDirtyGuard`'s own `shallowJsonEqual` uses for `bodyJson` (a fresh
 * object reference from `editor.getJSON()` every call, so `!==` alone would always report dirty).
 * Split out to a top-level function (complexity-ceiling pass, 2026-08-11) so this comparison's own
 * `||` chain scores independently of `usePostEditor`'s complexity.
 */
function computeContentDirty(
  current: { title: string; slug: string; status: "draft" | "published"; bodyJson: unknown; overridesThemePage: boolean | null },
  original: PostFormState | null,
): boolean {
  if (original === null) return false;
  return (
    current.title !== original.title ||
    current.slug !== original.slug ||
    current.status !== original.status ||
    JSON.stringify(current.bodyJson) !== JSON.stringify(original.bodyJson) ||
    current.overridesThemePage !== original.overridesThemePage
  );
}

/**
 * Pending-content preview's debounced auto-submit (moved from `PostPreview`, 2026-08-14 —
 * `PostEditorController.previewFormRef`'s own doc has the "why here, not the view" reasoning). A
 * form submit is a full iframe navigation, so firing one per keystroke would thrash the iframe;
 * trailing-only, 500ms. `clearTimeout` on cleanup is the complete cancellation here — unlike a
 * `fetch` promise, a cleared `setTimeout` callback provably never fires, so no extra `cancelled` flag
 * is needed on top of it. Split to a top-level function (same complexity-ceiling reason
 * `computeContentDirty` above already is) returning the cleanup directly, so the caller's own
 * `useEffect` body is a one-line `return schedulePendingContentPreviewSubmit(...)`.
 *
 * @complexity Time/space: O(1) — one timer, no data copying.
 */
function schedulePendingContentPreviewSubmit(input: {
  active: boolean;
  bodyJson: unknown;
  formRef: RefObject<HTMLFormElement | null>;
}): () => void {
  if (!input.active || input.bodyJson === null) return () => {};
  const timer = setTimeout(() => {
    input.formRef.current?.submit();
  }, 500);
  return () => clearTimeout(timer);
}

/**
 * Mirrors the server's own advisory upload allowlist (`DEFAULT_ALLOWED_MIME_TYPES`,
 * `@jini-ai/cms/media`'s `media-service.ts`) rather than importing it: that subpath is the full
 * server-side upload/DB implementation, which has no place in a browser bundle — unlike
 * `@jini-ai/cms/settings`'s plain i18n dictionaries, which `SettingsUi.tsx` already imports safely
 * elsewhere in this app. SVG is deliberately excluded here for the same reason it's excluded there:
 * unsanitized SVG upload is a stored-XSS vector, not merely an unsupported format. Advisory only —
 * `FileHandler` filters what reaches `onDrop`/`onPaste` client-side, but `port.uploadMedia` still
 * goes through the server's own authoritative allowlist regardless of what gets past this filter.
 */
export const FILE_HANDLER_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * `@tiptap/extension-file-handler`'s shared upload step (2026-08-12, B1 — drag & paste image
 * upload) — uploads one dropped/pasted `File` through `port.uploadMedia`, the SAME media-upload
 * path `MediaPickerDialog`'s own upload flow already calls (confirmed against
 * `use-media.hooks.ts`'s `upload()`: `readFileAsDataUrl` then `port.uploadMedia({filename,
 * contentType, dataBase64}, ...)` — this reuses `readFileAsDataUrl` from `../rules.ts`, the same
 * helper `handleImageDrop` used to inline directly; here the `data:` prefix is stripped instead of
 * kept, since `uploadMedia` wants the bare base64 payload). Returns the `{assetId, alt}` pair a
 * ref-based image node needs, or `null` on upload failure so a caller can skip just that one file
 * rather than throwing out of a FileHandler callback ProseMirror never awaits — the same "failure is
 * silently absorbed, not a full-screen error" reasoning the mention-list effect above already states
 * for its own non-critical, best-effort background fetch.
 *
 * Split to a top-level function taking `port` as an explicit parameter, not a closure inside
 * `usePostEditor`, for the same reason `computeContentDirty` above already is: this project's
 * complexity metric folds nested closures into the enclosing function's own score, so only
 * top-level extraction keeps `usePostEditor` under the ceiling.
 *
 * @complexity Time: O(f) in file bytes (one `FileReader` read + one upload request); space: O(f) for
 * the base64 payload — same cost {@link readFileAsDataUrl}'s own doc already states.
 */
export async function uploadDroppedFile(port: PostEditorPort, file: File): Promise<{ assetId: string; alt: string } | null> {
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const dataBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const { media } = await port.uploadMedia({ filename: file.name, contentType: file.type, dataBase64 });
    return { assetId: media.id, alt: file.name };
  } catch {
    return null;
  }
}

/**
 * `FileHandler`'s `onDrop` callback body (2026-08-12, B1) — uploads each dropped file via
 * {@link uploadDroppedFile} and inserts it at the drop position with `insertContentAt`, producing
 * the IDENTICAL `{assetId, transformName: "public", alt}` node shape `insertMediaRef`
 * (`lib/media-image-extension.tsx`, the Media picker's own insert command) builds. `insertMediaRef`
 * itself isn't called here because it always inserts at the CURRENT SELECTION, never an arbitrary
 * position, and `pos` (the drop point) is very often not the selection — `insertContentAt(pos, ...)`
 * is TipTap's own documented pattern for a file-handler drop for exactly this reason. Never
 * base64-inlines into `bodyJson` — see `handleImageDrop` (`../rules.ts`) for the legacy local-file
 * behavior this supersedes, and why that function now deliberately leaves local files unhandled so
 * this one is reachable at all.
 *
 * Each file is uploaded and inserted independently, as its own upload resolves — not
 * `Promise.all`-batched, and this function itself does not await any of them (`onDrop` is a
 * synchronous callback) — a multi-file drop with one slow or failing upload still lands every other
 * file rather than blocking on the slowest or losing the whole batch to one failure.
 */
export function handleFileDrop(port: PostEditorPort, editor: Editor, files: File[], pos: number): void {
  for (const file of files) {
    uploadDroppedFile(port, file).then((result) => {
      if (!result) return;
      editor
        .chain()
        .insertContentAt(pos, { type: "image", attrs: { assetId: result.assetId, transformName: "public", alt: result.alt } })
        .focus()
        .run();
    });
  }
}

/**
 * `FileHandler`'s `onPaste` callback body (2026-08-12, B1) — same upload step as
 * {@link handleFileDrop}, but inserts through the real `insertMediaRef` command
 * (`lib/media-image-extension.tsx`) rather than `insertContentAt`: `@tiptap/extension-file-handler`'s
 * own `onPaste` signature carries no position argument (unlike `onDrop`'s `pos`), and inserting at
 * the current selection is exactly what a paste is supposed to do — exactly what `insertMediaRef`'s
 * own `commands.insertContent(...)` already does with no position argument.
 */
export function handleFilePaste(port: PostEditorPort, editor: Editor, files: File[]): void {
  for (const file of files) {
    uploadDroppedFile(port, file).then((result) => {
      if (!result) return;
      editor.commands.insertMediaRef({ assetId: result.assetId, transformName: "public", alt: result.alt });
    });
  }
}

export function usePostEditor(postId: string, deps: PostEditorDependencies): PostEditorController {
  const { port, navigate, t } = deps;
  const [post, setPost] = useState<AdminPost | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [templateChoice, setTemplateChoice] = useState<string | null>(null);
  // The active static theme's own declared template list (theme.json's `templates`) — fetched
  // once, independent of which post is loaded, so the picker always reflects whichever theme is
  // actually live right now. `[]` (the default, and the steady state for any non-participating
  // theme) means the picker has nothing to offer and stays hidden, not broken.
  const [availableTemplates, setAvailableTemplates] = useState<string[]>([]);
  // View-Template feature (2026-08-10) — same fetch-once-independent-of-postId shape as
  // `availableTemplates` just above: the active theme's id/tier don't change when switching
  // between posts, only when the workspace's presentation settings themselves change.
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [activeThemeTier, setActiveThemeTier] = useState<ThemeTier | null>(null);
  const [activeThemeApiVersion, setActiveThemeApiVersion] = useState<2 | undefined>(undefined);
  // Tri-state (2026-08-15) — `null` (not `false`) is the correct "nothing loaded yet"/"never
  // decided" initial value; see `PostEditorController.overridesThemePage`'s own doc.
  const [overridesThemePage, setOverridesThemePage] = useState<boolean | null>(null);
  // Same fetch-once-independent-of-postId shape as `availableTemplates` — the active theme's own
  // page ids don't change when switching between posts.
  const [staticPageIds, setStaticPageIds] = useState<string[]>([]);
  // Mention feature (2026-08-11) — the "mention another post" picker's own list, same fetch-once-
  // independent-of-postId shape as `staticPageIds`/`availableTemplates` above: which OTHER posts
  // exist doesn't change just because the operator switched which one they're editing. NOT filtered
  // to exclude the currently-open post here — `PostEditor.tsx` does that at render time, since this
  // state loads once per mount and `postId`/`post.id` can change independently of it.
  const [mentionablePosts, setMentionablePosts] = useState<AdminPost[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // TipTap's content lives in the editor's own imperative state, not React state, so nothing here
  // re-renders when the body changes on its own — `onUpdate` below exists solely to force one, so
  // `current.bodyJson` (read fresh via `editor.getJSON()` every render) actually gets re-evaluated
  // after a keystroke. The counter's value itself is never read.
  const [, setBodyVersion] = useState(0);
  // Snapshot of the last loaded-or-saved state for `useDirtyGuard` to diff against (audit finding:
  // no editor screen tracks this at all today — confirmed live losing an edit on this exact
  // screen). `null` until the post has loaded AND the editor has actually applied that content —
  // see the load effect below for why both conditions matter.
  const [original, setOriginal] = useState<PostFormState | null>(null);
  // Drives `ConfirmDialog`'s `open` prop for the Delete action — replaces the previous
  // `window.confirm` gate. `deleting` is the dialog's `pending` (in-flight) flag, separate from
  // `confirmingDelete` itself so the dialog can stay open, disabled, mid-request rather than
  // closing before the request resolves.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Tab state for the toolbar's Edit/Preview pair (2026-08-11) — defaults to "edit" so opening a
  // post shows exactly what every post editor has always shown, not a behavior change bundled
  // into the new tab. Not reset by the load effect below: unlike `original`/`title`/`slug`, which
  // post is loaded doesn't need to force a specific pane back open.
  const [view, setView] = useState<PostEditorView>("edit");
  // View Template (2026-08-10) — moved from `PostEditor.tsx` (leftover `useState` after the
  // `useWiredX` conversion, `apps/admin/INFO.md`'s Hooks section). Whether the "View Template" modal
  // is open.
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  // Pending-content preview (2026-08-12, moved from `PostPreview` — see `PostEditorController
  // .previewFormRef`'s own doc). The hidden form's DOM node; `PostPreview` attaches it via `ref`.
  const previewFormRef = useRef<HTMLFormElement>(null);

  const editor = useEditor({
    // Link and Underline ship as part of StarterKit already (verified against its own bundle) —
    // only TextAlign needed adding. `document: false` turns off StarterKit's own `doc` node so
    // `PostTitleDocument` (`title block+`) can take over that slot — see `lib/post-title-extension.ts`'s
    // file header for the post-title-in-document feature this pair belongs to and why the title lives
    // in `bodyJson` as a real node instead of a theme-level-only field.
    extensions: [
      // `codeBlock: false` (2026-08-11) — `CodeBlockLowlight` (added below) replaces StarterKit's
      // own plain `CodeBlock`; both register the identical `codeBlock` node NAME, so leaving
      // StarterKit's own copy enabled would register two competing implementations of it, same
      // "disable the bundled copy, register the richer one separately" pattern `document: false`
      // already established for `PostTitleDocument` just below.
      StarterKit.configure({ document: false, codeBlock: false }),
      PostTitleDocument,
      PostTitle,
      TextAlign.configure({ types: ["heading", "paragraph", "title"] }),
      // `multicolor: true` (2026-08-11, owner: "anything and everything i can get") — allows a
      // `color` attr on the mark rather than a single fixed highlight color. The toolbar button
      // below is a plain toggle only (no color picker, matching Bold/Italic's own simplicity), so
      // in practice this ships with NO `color` attr and renders through the browser's own `<mark>`
      // default (yellow) — `multicolor: true` is still set so a `color` attr from anywhere else
      // (pasted content, a future richer picker) round-trips instead of being schema-rejected. See
      // `render.ts`'s `"highlight"` mark case for the public-render half.
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      // `Color`/`BackgroundColor` are both `Extension`s that attach a global attribute to the
      // shared `textStyle` mark (`TextStyle`, the actual mark carrying `<span>` in the doc) rather
      // than marks of their own — one mark can carry `color` and `backgroundColor` at once. See
      // `render.ts`'s `"textStyle"` case for the public-render half, including why the two style
      // declarations are combined into one `style=""` attribute there rather than nesting two spans.
      TextStyle,
      Color,
      BackgroundColor,
      // Same shared-`textStyle`-mark shape as Color/BackgroundColor just above — all five style
      // extensions default `types: ["textStyle"]`, so no `.configure()` call is needed for any of
      // them. The toolbar's font-family/size/line-height controls are closed `<select>` dropdowns
      // (not free text), so every value they can produce is one of a small preset list — the
      // renderer's own allowlist (`safeCssFontFamily`/`safeCssLength`, render.ts) still exists as
      // defense-in-depth against `bodyJson` written some other way, same reasoning `safeCssColor`'s
      // own doc gives.
      FontFamily,
      FontSize,
      LineHeight,
      // Typography (2026-08-11) — an `Extension`, not a mark or node: pure `textInputRule`s that
      // replace a typed pattern (`--`, `...`, a straight quote after whitespace, `(c)`, …) with the
      // matching Unicode character (em dash, ellipsis, curly quote, ©, …) AS THE AUTHOR TYPES IT.
      // The result is plain text in a `text` node — `render.ts` needed no new case, since its
      // existing `"text"` case already `escapeHtml`s and emits whatever Unicode the doc carries.
      Typography,
      // Code block syntax highlighting (2026-08-11, coordinator MSG #1, option (c)) — highlights
      // in-browser via `lowlight` (module-level singleton above); only `attrs.language` is ever
      // persisted to `bodyJson`, never the highlighted markup itself. See `render.ts`'s `"codeBlock"`
      // case for the public-render half: it emits the language as a `class="language-X"` token and
      // does nothing further — no server-side highlighter dependency, per the coordinator's own
      // stated reasoning for rejecting options (a)/(b).
      CodeBlockLowlight.configure({ lowlight }),
      // Placeholder/CharacterCount (2026-08-11) — editor-only chrome, no doc vocabulary of their own
      // (Placeholder is a ProseMirror DECORATION on an empty node, never written into `bodyJson`;
      // CharacterCount only reads `state.doc`, never writes to it), so neither needs a `render.ts`
      // case — same reasoning `Typography` above already gives for skipping one. Default class
      // names (`is-empty`/`is-editor-empty`) and data attribute (`data-placeholder`) kept as-is
      // rather than renamed via `.configure()`, since `styles.css`'s `.editor-body .is-empty::before`
      // rule (2026-08-11) targets them directly.
      Placeholder.configure({ placeholder: "Start writing…" }),
      CharacterCount,
      // Focus: REMOVED 2026-08-12, the same day it was added as a "low-priority free extra". Its
      // `.has-focus` decoration rendered a left rule on the focused block; the owner saw it live and
      // asked what the black lines were for, which answers whether the affordance was wanted. The
      // caret already marks the focused block. Registering it without the CSS would leave a class
      // toggling in the DOM with no effect — the same dead-weight argument that got UniqueID and
      // TableOfContents dropped in that same pass — so the extension goes with the rule.
      // InvisibleCharacters (2026-08-12, B2 — confirmed MIT) — same editor-only-chrome, no-doc-
      // vocabulary shape as Focus just above (a DECORATION showing a middle-dot for spaces/a pilcrow
      // for paragraph breaks, never written to `bodyJson`). `visible: false` overrides the
      // extension's own default (`true`) deliberately: there is no toolbar button wired up in this
      // pass to toggle it (out of scope for a "low-priority free extra" — a real toggle control is
      // its own small UI decision, not an extension-registration one), so defaulting to `true` would
      // make every space/paragraph mark in the editor permanently visible with no way to turn it back
      // off — an uninvited, surprising visual change nobody asked for. Registered inert-but-available
      // (`editor.commands.toggleInvisibleCharacters()` already works from a console or a future
      // toolbar button) rather than left uninstalled, matching `Mention`'s own precedent above
      // (registered so the node type/command exist, even before every trigger path is wired).
      InvisibleCharacters.configure({ visible: false }),
      // Table (2026-08-11) — `resizable: false` (the extension's own default, kept explicit here
      // rather than relied on implicitly) since `render.ts`'s `"table"` case emits a plain
      // `<table>` with no `<colgroup>`; a resizable editor would let an author set column widths
      // this renderer then silently drops, a worse gap than not offering resize at all. See that
      // case's own comment for the full scope-limit disclosure.
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      // TaskList/TaskItem (2026-08-11) — `@tiptap/extension-list`'s own bullet/ordered/list-item
      // machinery is deliberately NOT imported from this same package: `StarterKit` above already
      // bundles those three, and importing this package's own copies alongside would register two
      // competing implementations of the same node names. `nested: false` is `TaskItem`'s own
      // default (kept explicit rather than relied on implicitly) — see `render.ts`'s `"taskItem"`
      // case for what that means for the public render.
      TaskList,
      TaskItem.configure({ nested: false }),
      // YouTube (2026-08-11, coordinator MSG #1 licensing sweep — confirmed MIT) — inline defaults
      // kept (no `.configure()`): `render.ts`'s `"youtube"` case ignores the node's own stored
      // `width`/`height` anyway (a responsive CSS box replaces them), so there is nothing this
      // config would change that the public render would ever see.
      Youtube,
      // Mention (2026-08-11, coordinator MSG #1 licensing sweep) — "mention another post". Left
      // at its own default `suggestion: {}` deliberately: `@tiptap/suggestion`'s own default
      // `render = () => ({})` (confirmed against the installed dist) means typing "@" triggers the
      // suggestion state machine internally but renders nothing — no half-built live-filter popup.
      // Mentions are inserted instead through the toolbar's own picker `<select>` + button
      // (`PostEditor.tsx`, reading `mentionablePosts` below), the same "closed picker, not a typed
      // trigger" idiom `CODE_LANGUAGE_OPTIONS`/`FONT_FAMILY_OPTIONS` already use elsewhere on this
      // toolbar — registering the extension here is what makes the `mention` node type/schema exist
      // and `insertContent({ type: "mention", ... })` valid, independent of the "@" trigger path.
      Mention,
      // FileHandler (2026-08-12, B1 — drag & paste image upload) — `onDrop`/`onPaste` both delegate
      // to a top-level function taking `port` explicitly (see `handleFileDrop`/`handleFilePaste`'s
      // own docs for why); referencing `port` here is a single-line forwarding closure, not new
      // logic living inside `usePostEditor` itself.
      FileHandler.configure({
        allowedMimeTypes: FILE_HANDLER_ALLOWED_MIME_TYPES,
        onDrop: (currentEditor, files, pos) => handleFileDrop(port, currentEditor, files, pos),
        onPaste: (currentEditor, files) => handleFilePaste(port, currentEditor, files),
      }),
      MediaImage,
      WidgetEmbed,
    ],
    content: "",
    editorProps: {
      handleDrop: (view, event, _slice, moved) => handleImageDrop(view, event, moved),
    },
    // The title-node half of the title's two-way sync with the standalone title `<input>` (see
    // `setTitleAndSyncEditor` below for the input's own half): every keystroke anywhere in the doc
    // re-extracts the title node's current text and re-baselines `title` state from it, so typing
    // directly into the canvas (centering it, etc.) keeps the slug/list/`<title>`-tag-feeding `title`
    // field in sync without an author ever touching the input. Also fires once for the load effect's
    // own `setContent` call below — `titleNodeText` there returns exactly the same text `setTitle
    // (post.title)` already set, so that extra call is an idempotent no-op, not a race.
    onUpdate: ({ editor: current }) => {
      setBodyVersion((v) => v + 1);
      setTitle(titleNodeText(current.getJSON()));
    },
  });

  useEffect(() => {
    setPost(null);
    setError(null);
    // Loaded together (not two independent effects) so the template default below never races: the
    // owner's own ordering request ("default to the template... I don't want it to be no template
    // chosen") needs `activeThemeTemplates` in hand at the exact moment `post.templateChoice` is
    // read, or a fast post-load racing a slow presentation-settings load could default to "" before
    // the real list arrives. Costs one extra GET per post switch (presentation settings re-fetched
    // even though it rarely changes) — an acceptable trade for a local admin panel.
    Promise.all([port.getPost(postId), port.getPresentation()])
      .then(([{ post }, { settings, availableThemes, activeThemeTemplates, activeThemeStaticPageIds }]) => {
        setAvailableTemplates(activeThemeTemplates);
        setStaticPageIds(activeThemeStaticPageIds);
        setActiveThemeId(settings.activeThemeId);
        const matchedTheme = availableThemes.find((theme) => theme.id === settings.activeThemeId);
        setActiveThemeTier(matchedTheme?.tier ?? null);
        setActiveThemeApiVersion(matchedTheme?.apiVersion);
        setPost(post);
        setTitle(post.title);
        setSlug(post.slug);
        setStatus(post.status);
        // Defaults to the theme's own first-listed template — never to "no template chosen" — unless
        // this post already has an explicit choice saved. Only reachable when the theme actually
        // offers templates; otherwise `post.templateChoice ?? null` (unset stays unset, same as
        // before this change) since there is nothing to default TO.
        const defaultedTemplateChoice =
          post.templateChoice ?? (activeThemeTemplates.length > 0 ? activeThemeTemplates[0] : null);
        setTemplateChoice(defaultedTemplateChoice);
        // Tri-state (2026-08-15) — `?? null`, not `?? false`: a fetched post that never had an
        // opinion set must load into the editor as "undecided", not as a silently-manufactured
        // "theme page wins" choice the author never made. `post.overridesThemePage` is already
        // `boolean | null` off the wire (see `AdminPost`'s own doc) — this `??` only exists to
        // normalize the one remaining `undefined` case: a pre-feature test fixture that predates
        // this field entirely.
        setOverridesThemePage(post.overridesThemePage ?? null);
        if (editor) {
          // `withTitleNode` (post-title-in-document feature, 2026-08-11) is the back-compat seam:
          // every post saved before this feature has a `bodyJson` with no `title` node, which the
          // editor's own custom `doc` schema (`content: "title block+"`) would otherwise reject on
          // load. Already-migrated posts pass through unchanged; anything else gets a title node
          // synthesized from this SAME `post.title` just set above, so `original.title` (below) and
          // the doc's own title node agree from the first render — no false-dirty on an untouched,
          // freshly-opened pre-migration post.
          editor.commands.setContent(withTitleNode(post.bodyJson, post.title) as never);
          // Captured via `editor.getJSON()` right after `setContent`, not `post.bodyJson` as
          // loaded — both sides of the later dirty comparison are then produced by the exact same
          // serialization, so a schema-normalization difference between the server's stored JSON
          // and TipTap's own round-trip can never register as a false "unsaved change" on a
          // freshly-opened, untouched post. `original.templateChoice` uses the SAME defaulted value
          // (not the raw, possibly-null `post.templateChoice`) so simply opening an unset post never
          // shows as dirty on its own — only an actual further change does.
          setOriginal({
            title: post.title,
            slug: post.slug,
            status: post.status,
            bodyJson: editor.getJSON(),
            templateChoice: defaultedTemplateChoice,
            overridesThemePage: post.overridesThemePage ?? null,
          });
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load post"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, editor === null]);

  // Mention feature (2026-08-11) — fetched once per mount, independent of `postId` (same
  // reasoning `staticPageIds`/`availableTemplates` above already state for their own effects).
  // Failure is silently absorbed (no `setError`): an operator who can't get the mention picker
  // populated can still write and save a post normally — this is a nice-to-have, not the editor's
  // own load-bearing content, so it must not turn into a full-screen error for an unrelated fetch.
  useEffect(() => {
    port.listPosts().then(
      ({ posts }) => setMentionablePosts(posts.map((entry) => entry.post)),
      () => {}
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasSlugCollision = staticPageIds.includes(slug);

  // TipTap's content lives in the editor's own imperative state, not React state — read fresh every
  // render (same "no false-stale reads" reasoning `onUpdate`'s `bodyVersion` bump exists for) and
  // shared by `useDirtyGuard`, `contentDirty`, the pending-content-preview effect below, and the
  // controller's own `bodyJson` field, rather than four separate `editor?.getJSON() ?? null` calls.
  const bodyJson = editor?.getJSON() ?? null;

  const { isDirty, confirmLeave } = useDirtyGuard<PostFormState>(
    { title, slug, status, bodyJson, templateChoice, overridesThemePage },
    original,
  );

  // Inlined rather than a second `useDirtyGuard` call so this doesn't register its own redundant
  // `beforeunload` listener for a value nothing reads for that purpose — see `computeContentDirty`
  // above for the comparison itself.
  const contentDirty = computeContentDirty({ title, slug, status, bodyJson, overridesThemePage }, original);

  // Template-preview URL (moved from `PostEditor.tsx`/`PostPreview`, see `PostEditorController
  // .templatePreviewUrl`'s own doc) and the pending-content-preview's hidden form target (moved from
  // `PostPreview`'s own `useRef` — a plain per-render string suffices since `post.id` is stable once
  // loaded, unlike the original's "stable per mount" ref, which existed only because `PostPreview`
  // itself remounts on every tab switch). Both `""` before `post` loads — `PostPreview` never renders
  // that early.
  const templatePreviewUrl = post ? port.templatePreviewUrl(post.id, templateChoice) : "";
  const previewFormTarget = post ? `post-preview-pending-${post.id}` : "";

  // Pending-content preview (2026-08-12, moved from `PostPreview`) — see this function's own doc,
  // branch 3. `contentDirty` already implies `dirty` (`computeContentDirty` compares a strict subset
  // of what `useDirtyGuard` does), so this is naturally mutually exclusive with the live-site/
  // template-preview branches without an explicit guard against them.
  const canShowPendingContentPreview = status === "published" && contentDirty;
  useEffect(
    () =>
      schedulePendingContentPreviewSubmit({
        active: view === "preview" && post !== null && canShowPendingContentPreview,
        bodyJson,
        formRef: previewFormRef,
      }),
    // `post?.id`, not `post` — the original (`PostPreview`'s own effect, before this moved) keyed on
    // the primitive `id` prop, not the whole post object, so a `setPost(saved)` after a successful
    // save (a new object reference, same id) does not by itself restart the debounce timer. `post`
    // itself is still read fresh via closure for the `active`/`null` check above, same as `postId`
    // is elsewhere in this hook — only the DEPENDENCY entry is narrowed.
    [view, post?.id, canShowPendingContentPreview, bodyJson, templateChoice]
  );

  /**
   * Persists title/slug/body, optionally forcing `status` to a specific value first —
   * `statusOverride` is omitted for the plain Save button (keeps whatever the status select is
   * currently set to) and passed `"published"` by the Publish button, so publishing is one click
   * ("save this draft and put it live") instead of "flip the dropdown to Published, then remember
   * to also click Save" — two actions an operator can do out of order or forget the second half of.
   * Re-baselines `original` either way, so a publish also clears the dirty guard, same as an
   * ordinary save.
   */
  async function save(statusOverride?: "draft" | "published") {
    if (!editor) return;
    setMessage(null);
    setError(null);
    const nextStatus = statusOverride ?? status;
    try {
      const bodyJson = editor.getJSON() as Record<string, unknown>;
      const { post: saved } = await port.updatePost(
        { id: postId },
        { title, slug, status: nextStatus, bodyJson, templateChoice, overridesThemePage },
      );
      setPost(saved);
      setStatus(nextStatus);
      setMessage(`${statusOverride === "published" ? "Published" : "Saved"} · version ${saved.version}`);
      setOriginal({ title, slug, status: nextStatus, bodyJson, templateChoice, overridesThemePage });
    } catch (e) {
      setError(e instanceof Error ? e.message : statusOverride === "published" ? "publish failed" : "save failed");
    }
  }

  /**
   * Soft delete — distinct from the Draft/Published status select, and the copy in the view says so
   * explicitly: the select changes `status` (unpublish — content stays, drops off the site, still
   * editable here); this moves the whole row to the trash (server/routes/admin/posts/delete.ts's
   * soft-delete route).
   *
   * The `ConfirmDialog` body and the `post-delete` agentHandle label state only the observable
   * consequence and deliberately do NOT claim the delete is "recoverable" or "not permanent", even
   * though the server route genuinely is a soft, revertible delete. There is no restore path an
   * operator can reach from this product today: no change-set-revert UI, no `api.ts` method for it,
   * and `Recovery.tsx` is a different, much heavier whole-database snapshot restore (not a per-row
   * undo). Promising a recovery the operator cannot perform would be worse than promising nothing.
   * Equally, do not swap it for "permanently delete" / "cannot be undone" — that overcorrects into
   * the opposite lie, since the row genuinely is recoverable server-side, just not from here. Do
   * not add either claim back in without first building/removing the corresponding capability.
   *
   * Calls `port.deletePost` (kind-blind, `defaultPostEditorPort` wraps `api.deletePost`), not
   * `api.deletePage`, matching every other call this editor already makes (`getPost`/`updatePost`)
   * — this component is shared between posts and
   * pages via the same `/admin/posts/{id}` route (Pages.tsx's own file header), so it deletes
   * whatever row `postId` names rather than assuming its kind. `post.kind` (loaded from the server
   * response) is used only for display copy and for choosing which list to return to.
   *
   * Only `deleting`/`confirmingDelete` are reset on failure, not success — a successful delete
   * navigates away, and the original code never touched post-navigation state either.
   */
  async function remove() {
    if (!post) return;
    setMessage(null);
    setError(null);
    setDeleting(true);
    try {
      await port.deletePost(postId);
      navigate(post.kind === "page" ? "/pages" : "/posts");
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  /**
   * The standalone title `<input>`'s own half of the title's two-way sync with the in-document title
   * node (the canvas's own half is the `onUpdate` handler above). Pushes the typed value into the
   * title node via `setPostTitleText` (`lib/post-title-extension.ts`) in the SAME call that updates
   * `title` state, so the input and the canvas can never visibly disagree even for one render — the
   * `onUpdate` this triggers then re-extracts the identical text and re-sets `title` to the same
   * value, an idempotent no-op rather than a second source of truth fighting this one.
   *
   * Kept under the PUBLIC name `setTitle` (returned as `setTitle` below) so `PostEditor.tsx`'s
   * existing `<input onChange={(e) => setTitle(e.target.value)}>` needs no change at all — the sync
   * is an internal wiring change, not a new prop this screen's markup has to know about.
   */
  function setTitleAndSyncEditor(next: string): void {
    setTitle(next);
    editor?.commands.setPostTitleText(next);
  }

  return {
    post,
    editor,
    title,
    setTitle: setTitleAndSyncEditor,
    slug,
    setSlug,
    status,
    templateChoice,
    setTemplateChoice,
    availableTemplates,
    mentionablePosts,
    activeThemeId,
    activeThemeTier,
    activeThemeApiVersion,
    overridesThemePage,
    setOverridesThemePage,
    hasSlugCollision,
    view,
    setView,
    setStatus,
    message,
    error,
    confirmingDelete,
    setConfirmingDelete,
    deleting,
    confirmLeave,
    dirty: isDirty,
    contentDirty,
    templatePreviewUrl,
    bodyJson,
    showTemplateModal,
    setShowTemplateModal,
    previewFormRef,
    previewFormTarget,
    save,
    remove,
    t,
  };
}

/**
 * Binds the real `/api/.../posts` client, the real router, and a `t` bound to the real resolved
 * locale (`useAdminLocale()`, called here and ONLY here — see this file's header) — see
 * `post-editor-dependencies.hooks.ts` and `lib/router.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `PostEditor.tsx`
 * composes this and a test composes {@link usePostEditor} with `createFakePostEditorPort` and a fake
 * `navigate`/`t`.
 */
export function useWiredPostEditor(postId: string): PostEditorController {
  const locale = useAdminLocale();
  const t = (key: string): string => POSTS_DICT[locale]?.[key] ?? key;
  return usePostEditor(postId, { port: defaultPostEditorPort, navigate: realNavigate, t });
}
