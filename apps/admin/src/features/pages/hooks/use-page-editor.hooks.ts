import { useCallback, useEffect, useState } from "react";

import { api, type AdminPost } from "../../../lib/api";
import { navigate } from "../../../lib/router";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../page-editor-i18n";

/**
 * @file Everything the Pages EDITOR does, so `PageEditor.tsx` is only markup.
 *
 * Same `use-<thing>.hooks.ts` convention as `use-pages.hooks.ts` beside it. Deliberately NOT shared
 * with `features/posts`' `usePostEditor`: a Post is a Tiptap document and a Page is a bespoke HTML
 * one, they are edited through different endpoints with different concurrency semantics, and the
 * only thing the two screens have in common is the header chrome.
 */

/** The three things the editor's main pane can show. Preview is the default — the HTML source is
 *  for when the operator wants to see or hand-edit what the assistant produced, and Interactive is
 *  a GrapesJS-backed surface for clicking into rendered text and editing it in place (text editing
 *  and basic formatting only — see `@jini-ai/admin/react`'s `InteractiveHtmlEditor`). */
export type PageEditorView = "preview" | "html" | "interactive";

/**
 * Viewport widths the preview renders AT, independent of how much room the pane actually has.
 *
 * This is the point of the whole preview mechanism, not a nice-to-have. With the assistant dock
 * open the editor pane is well under half the window, so a preview rendered at its container's real
 * width would show a layout at ~900px that ships at 1280+ — the operator would be judging, and
 * asking the model to fix, breakpoints nobody will ever see. The document is rendered at the chosen
 * width and scaled down to fit instead.
 */
export const PAGE_PREVIEW_WIDTHS = { desktop: 1280, tablet: 834, mobile: 390 } as const;

export type PagePreviewDevice = keyof typeof PAGE_PREVIEW_WIDTHS;

export interface PageEditorController {
  /** `null` until the initial load settles. */
  page: AdminPost | null;
  error: string | null;
  message: string | null;
  title: string;
  setTitle: (value: string) => void;
  slug: string;
  setSlug: (value: string) => void;
  status: "draft" | "published";
  setStatus: (value: "draft" | "published") => void;
  /** Pages template picker (Task 4, 2026-08-11) — same tri-state contract as `usePostEditor`'s own
   *  `templateChoice`: `null` (never chosen, this Page renders its own body directly — the existing
   *  default behavior), `""` (explicit "No template chosen"), or a real filename. */
  templateChoice: string | null;
  setTemplateChoice: (value: string | null) => void;
  /** The active theme's declared `templates` list (`theme.json`) — `[]` when the theme doesn't
   *  support templates, in which case the caller should not render the picker at all. The SAME field
   *  `usePostEditor`'s `availableTemplates` reads (unified 2026-08-11 — was a separate `pageTemplate`
   *  array before the `content` marker removed the reason Posts and Pages needed different lists). */
  availableTemplates: string[];
  /** The working copy of the page's HTML — what the preview renders and what Save persists. */
  html: string;
  setHtml: (value: string) => void;
  view: PageEditorView;
  setView: (value: PageEditorView) => void;
  device: PagePreviewDevice;
  setDevice: (value: PagePreviewDevice) => void;
  saving: boolean;
  /**
   * Whether the working copy differs from what was last loaded or saved.
   *
   * Read by more than the Save button: this is the "in the middle of a task" signal the agent's
   * `pages.open_editor` capability is meant to gate navigation on, so that being pulled to another
   * page mid-edit asks first instead of discarding work.
   */
  dirty: boolean;
  /**
   * Template-preview fix (2026-08-11) — `dirty` MINUS the `templateChoice` comparison: whether
   * title/slug/status/body differ from what's saved. A page can be `dirty` (Save button lit) while
   * `contentDirty` is `false` — that's exactly "only the template picker moved" — which is what lets
   * `PagePreview` show a real template-applied render for the pending choice instead of falling all
   * the way back to the raw, unstyled body. See `ADS-memory/reports/implementation/
   * 2026-08-11-template-preview-render-bug.md` for the bug this fixes.
   */
  contentDirty: boolean;
  save: (nextStatus?: "draft" | "published") => Promise<void>;
  remove: () => Promise<void>;
  confirmingDelete: boolean;
  setConfirmingDelete: (value: boolean) => void;
  deleting: boolean;
}

/**
 * `routeSlug` names what the URL actually carries: the page's slug, as read from the route (see
 * `panels.tsx`'s `/:slug` pattern). It doubles as a legacy id — the server-side lookup this feeds
 * (`getAdminPostByIdOrSlug`) tries an exact id match before falling back to slug, so an old
 * id-based bookmark still resolves. Every write below uses `page.id` (the real id from the loaded
 * record), never `routeSlug` directly — the slug in the URL can go stale if the page is renamed
 * elsewhere, but the id it resolved to at load time cannot.
 */
export function usePageEditor(routeSlug: string): PageEditorController {
  const locale = useAdminLocale();
  const [page, setPage] = useState<AdminPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  // Pages template picker (Task 4, 2026-08-11) — `savedTemplateChoice` is `templateChoice`'s own
  // baseline for the manual dirty comparison below, same "captured on load/save" shape `savedHtml`
  // already uses for `html`.
  const [templateChoice, setTemplateChoice] = useState<string | null>(null);
  const [savedTemplateChoice, setSavedTemplateChoice] = useState<string | null>(null);
  const [availableTemplates, setAvailableTemplates] = useState<string[]>([]);
  const [html, setHtml] = useState("");
  const [savedHtml, setSavedHtml] = useState("");
  const [view, setView] = useState<PageEditorView>("preview");
  const [device, setDevice] = useState<PagePreviewDevice>("desktop");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Loaded together, same reasoning as `usePostEditor`'s identical `Promise.all` — the picker
    // needs `activeThemeTemplates` in hand before it can render anything meaningful, and a fast
    // page-load racing a slow presentation-settings load would otherwise flash an empty picker.
    Promise.all([api.getPage(routeSlug), api.getPresentation()])
      .then(([{ post }, { activeThemeTemplates }]) => {
        if (cancelled) return;
        setAvailableTemplates(activeThemeTemplates);
        setPage(post);
        setTitle(post.title);
        setSlug(post.slug);
        setStatus(post.status);
        // UNLIKE `usePostEditor`, no "default to the theme's first template" here — `null` is a
        // Page's normal, fully-working state (render its own body), not an absence-of-decision that
        // needs papering over for the UI and the public render to agree (see
        // `isEligibleForTemplateBranch`'s doc, `features/theme/static-render.ts`, for the full
        // reasoning). The picker simply shows whatever is actually stored.
        setTemplateChoice(post.templateChoice ?? null);
        setSavedTemplateChoice(post.templateChoice ?? null);
        // A Page that has never been opened in this editor is still `doc`-format and has no
        // `bodyHtml` yet — the server births the html row on the first save. Starting from an empty
        // string (rather than seeding a skeleton client-side) keeps the skeleton defined in exactly
        // one place, server-side, where the region vocabulary lives.
        const body = post.bodyFormat === "html" ? (post.bodyHtml ?? "") : "";
        setHtml(body);
        setSavedHtml(body);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t(locale, "failed to load page"));
      });
    return () => {
      cancelled = true;
    };
  }, [routeSlug]);

  const save = useCallback(
    async (nextStatus?: "draft" | "published") => {
      // Save is only reachable once `page` has loaded — `PageEditor.tsx` shows a loading notice
      // and renders no Save/Publish button until then — but the guard keeps `page.id` below sound
      // without a non-null assertion, and mirrors `usePostEditor`'s identical `remove` guard.
      if (!page) return;
      setSaving(true);
      setError(null);
      setMessage(null);
      const statusToWrite = nextStatus ?? status;
      // `updatePageHtml` is the bespoke-HTML writer (`routes/admin/pages/update-html.ts`) and its
      // FIRST call on a still-`doc`-format Page converts it to `html` format and drops `body_json`
      // — see that route's own doc comment. This editor has no way to render a doc-format body (it
      // always loads `html` as `""` for that format), so calling it here would silently replace the
      // page's real, already-authored content with an empty string on every ordinary Save/Publish.
      // Only call it for a Page already in `html` format; a doc-format Page saves title/slug/status
      // only, until the separately-scoped dual-mode editor (task #30) can represent its real body.
      const canSaveHtml = page.bodyFormat === "html";
      try {
        // Two writes, in this order, because they are two different server-side paths and only the
        // second one can create the html row. Body first: if the metadata write fails on a slug
        // conflict, the operator's actual content is already safe.
        if (canSaveHtml) {
          await api.updatePageHtml(page.id, html);
        }
        // `updatePost` (`features/post/post.ts`'s own `updatePost`) requires `bodyJson` to be a JSON
        // object for any Page NOT already in `html` format — it's meaningless for an html-format row
        // (no Tiptap document exists) so the server skips the check there, but a doc-format row's
        // `bodyJson` IS its real content and the check is real. This editor has no way to EDIT that
        // document, but `page.bodyJson` is already the value loaded from the server, so round-tripping
        // it unchanged satisfies the requirement without touching the real content — the alternative
        // (omitting it) throws "bodyJson must be a JSON object" and leaves title/slug/status stuck
        // un-editable for every doc-format Page, which is worse than a no-op round-trip.
        const { post: updated } = await api.updatePost(
          { id: page.id },
          { title, slug, status: statusToWrite, templateChoice, ...(canSaveHtml ? {} : { bodyJson: page.bodyJson }) }
        );
        setPage(updated);
        setSlug(updated.slug);
        setStatus(updated.status);
        setSavedTemplateChoice(templateChoice);
        if (canSaveHtml) setSavedHtml(html);
        if (nextStatus) setStatus(nextStatus);
        setMessage(
          canSaveHtml
            ? t(locale, "Saved")
            : t(
                locale,
                "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet."
              )
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : t(locale, "failed to save page"));
      } finally {
        setSaving(false);
      }
    },
    [page, html, title, slug, status, templateChoice, locale]
  );

  const remove = useCallback(async () => {
    if (!page) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deletePage(page.id);
      navigate("/pages");
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "failed to delete page"));
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }, [page, locale]);

  // Template-preview fix (2026-08-11) — see `contentDirty`'s doc on `PageEditorController`.
  const contentDirty =
    page !== null &&
    (title !== page.title ||
      slug !== page.slug ||
      status !== page.status ||
      (page.bodyFormat === "html" && html !== savedHtml));

  return {
    page,
    error,
    message,
    title,
    setTitle,
    slug,
    setSlug,
    status,
    setStatus,
    templateChoice,
    setTemplateChoice,
    availableTemplates,
    html,
    setHtml,
    view,
    setView,
    device,
    setDevice,
    saving,
    // HTML changes only count when they're actually savable (see `save()`'s `canSaveHtml`) — for a
    // doc-format Page, `html` never reflects real persisted content, so comparing it to `savedHtml`
    // would report edits as dirty (or, worse, as clean) independent of anything actually saveable.
    //
    // Split into `contentDirty` (title/slug/status/body) plus the `templateChoice` comparison, rather
    // than one combined expression, so `PagePreview` can tell "only the template picker moved" apart
    // from "the operator actually edited something" — see `contentDirty`'s own doc on
    // `PageEditorController` for why that distinction exists.
    contentDirty,
    dirty: contentDirty || templateChoice !== savedTemplateChoice,
    save,
    remove,
    confirmingDelete,
    setConfirmingDelete,
    deleting,
  };
}
