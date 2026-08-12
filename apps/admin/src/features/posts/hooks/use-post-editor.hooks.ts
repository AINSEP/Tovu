import { useEffect, useState } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { api, type AdminPost, type ThemeTier } from "../../../lib/api";
import { MediaImage } from "../../../lib/media-image-extension";
import { WidgetEmbed } from "../../../lib/widget-embed-extension";
import { navigate } from "../../../lib/router";
import { useDirtyGuard } from "../../../hooks/use-dirty-guard.hooks";
import { handleImageDrop } from "../rules";

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
  overridesThemePage: boolean;
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
  overridesThemePage: boolean;
  setOverridesThemePage: (overridesThemePage: boolean) => void;
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
  save: (statusOverride?: "draft" | "published") => Promise<void>;
  remove: () => Promise<void>;
}

export function usePostEditor(postId: string): PostEditorController {
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
  const [overridesThemePage, setOverridesThemePage] = useState(false);
  // Same fetch-once-independent-of-postId shape as `availableTemplates` — the active theme's own
  // page ids don't change when switching between posts.
  const [staticPageIds, setStaticPageIds] = useState<string[]>([]);
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

  const editor = useEditor({
    extensions: [StarterKit, MediaImage, WidgetEmbed],
    content: "",
    editorProps: {
      handleDrop: (view, event, _slice, moved) => handleImageDrop(view, event, moved),
    },
    onUpdate: () => setBodyVersion((v) => v + 1),
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
    Promise.all([api.getPost(postId), api.getPresentation()])
      .then(([{ post }, { settings, availableThemes, activeThemeTemplates, activeThemeStaticPageIds }]) => {
        setAvailableTemplates(activeThemeTemplates);
        setStaticPageIds(activeThemeStaticPageIds);
        setActiveThemeId(settings.activeThemeId);
        setActiveThemeTier(availableThemes.find((theme) => theme.id === settings.activeThemeId)?.tier ?? null);
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
        setOverridesThemePage(post.overridesThemePage ?? false);
        if (editor) {
          editor.commands.setContent(post.bodyJson as never);
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
            overridesThemePage: post.overridesThemePage ?? false,
          });
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load post"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, editor === null]);

  const hasSlugCollision = staticPageIds.includes(slug);

  const { isDirty, confirmLeave } = useDirtyGuard<PostFormState>(
    { title, slug, status, bodyJson: editor?.getJSON() ?? null, templateChoice, overridesThemePage },
    original,
  );

  // Template-preview fix (2026-08-11) — see `contentDirty`'s doc on `PostEditorController`. Same
  // `JSON.stringify` comparison `useDirtyGuard`'s own `shallowJsonEqual` uses for `bodyJson` (a fresh
  // object reference from `editor.getJSON()` every call, so `!==` alone would always report dirty),
  // inlined here rather than a second `useDirtyGuard` call so this doesn't register its own redundant
  // `beforeunload` listener for a value nothing reads for that purpose.
  const contentDirty =
    original !== null &&
    (title !== original.title ||
      slug !== original.slug ||
      status !== original.status ||
      JSON.stringify(editor?.getJSON() ?? null) !== JSON.stringify(original.bodyJson) ||
      overridesThemePage !== original.overridesThemePage);

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
      const { post: saved } = await api.updatePost(
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
   * Calls `api.deletePost` (kind-blind), not `api.deletePage`, matching every other call this
   * editor already makes (`getPost`/`updatePost`) — this component is shared between posts and
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
      await api.deletePost(postId);
      navigate(post.kind === "page" ? "/pages" : "/posts");
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return {
    post,
    editor,
    title,
    setTitle,
    slug,
    setSlug,
    status,
    templateChoice,
    setTemplateChoice,
    availableTemplates,
    activeThemeId,
    activeThemeTier,
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
    save,
    remove,
  };
}
