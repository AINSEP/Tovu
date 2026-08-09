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
  const [html, setHtml] = useState("");
  const [savedHtml, setSavedHtml] = useState("");
  const [view, setView] = useState<PageEditorView>("preview");
  const [device, setDevice] = useState<PagePreviewDevice>("desktop");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getPage(routeSlug)
      .then(({ post }) => {
        if (cancelled) return;
        setPage(post);
        setTitle(post.title);
        setSlug(post.slug);
        setStatus(post.status);
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
      try {
        // Two writes, in this order, because they are two different server-side paths and only the
        // second one can create the html row. Body first: if the metadata write fails on a slug
        // conflict, the operator's actual content is already safe.
        await api.updatePageHtml(page.id, html);
        // No `bodyJson` — a bespoke-HTML Page has no Tiptap document, and the server no longer
        // demands one for an html-format row (it used to, which made such a Page's title
        // permanently un-editable). Sending a dummy empty doc to satisfy a validation that does not
        // apply would be the wrong fix.
        const { post: updated } = await api.updatePost(
          { id: page.id },
          { title, slug, status: statusToWrite }
        );
        setPage(updated);
        setSlug(updated.slug);
        setStatus(updated.status);
        setSavedHtml(html);
        if (nextStatus) setStatus(nextStatus);
        setMessage(t(locale, "Saved"));
      } catch (e) {
        setError(e instanceof Error ? e.message : t(locale, "failed to save page"));
      } finally {
        setSaving(false);
      }
    },
    [page, html, title, slug, status, locale]
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
    html,
    setHtml,
    view,
    setView,
    device,
    setDevice,
    saving,
    dirty: html !== savedHtml,
    save,
    remove,
    confirmingDelete,
    setConfirmingDelete,
    deleting,
  };
}
