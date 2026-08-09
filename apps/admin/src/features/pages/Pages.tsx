import { DataTable, RowMenu, ConfirmDialog } from "@jini-ai/admin/react";
import type { ReactNode } from "react";

import type { AdminPost } from "../../lib/api";
import { siteUrl } from "../../lib/site-url";
import { formatTimestamp } from "../../lib/format-timestamp";
import { navigate } from "../../lib/router";
import { pageRowMenuItems } from "./rules";
import { usePages } from "./hooks/use-pages.hooks";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { PAGES_DICT } from "./pages-i18n";

/**
 * @file The Pages list screen — markup only.
 *
 * State and API calls live in `hooks/use-pages.hooks.ts`; the row-menu logic lives in `rules.ts`.
 * What stays here is what actually renders: column definitions, the empty state, and the confirm
 * copy. Mirrors `features/posts/Posts.tsx` exactly, since this screen is `Posts.tsx`'s twin,
 * backed by the pages-filtered endpoints (`GET/POST .../pages`). A page is a `post` row with
 * `kind: "page"` (see `features/post/post.ts`), so it's edited through the same `PostEditor`
 * reached via `/admin/posts/{id}`.
 */
export interface PagesProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`, and `features/posts/Posts.tsx`'s `usePostsHook`.
   *
   * Defaulted to the real hook, so production callers (`panels.tsx`) pass nothing and behave
   * exactly as before. A test supplies a stub and drives this component through any state —
   * mid-delete, load failure, empty list — without module mocking, a fake `fetch`, or waiting on a
   * real request. That matters here specifically: this screen has no unit test today.
   */
  usePagesHook?: typeof usePages;
}

/**
 * The loading/error guard shown before the table has anything to render — pulled out of `Pages`
 * (2026-08-06, complexity pass, fourth pass) so its two early-return checks collapse into one
 * `if` at the call site. `error && !pages` (not just `error`), matching Media.tsx/Comments.tsx:
 * once the list has loaded, a later failure (create, delete) surfaces as an inline banner above
 * the table instead of blanking out the whole screen behind it. Mirrors `Posts.tsx`'s identical
 * `postsListNotice`, matching this pair's existing "twin screens" convention (this file's own
 * header).
 */
export function pagesListNotice(pages: AdminPost[] | null, error: string | null): ReactNode {
  if (error && !pages) return <div className="notice error">{error}</div>;
  if (!pages) return <div className="notice">Loading pages…</div>;
  return null;
}

export function Pages({ usePagesHook = usePages }: PagesProps) {
  const {
    pages,
    error,
    creating,
    rowSavingId,
    pendingDelete,
    setPendingDelete,
    createPage,
    disablePage,
    removePage,
  } = usePagesHook();
  const locale = useAdminLocale();
  const t = (key: string): string => PAGES_DICT[locale]?.[key] ?? key;

  const notice = pagesListNotice(pages, error);
  if (notice) return notice;
  // Unreachable in practice — `pagesListNotice` already returns a non-null notice whenever `pages`
  // is null — but restores the narrowing TS lost by moving that check behind a function call, so
  // `rows={pages}` below type-checks as `AdminPost[]` without an `as`/`!` assertion.
  if (!pages) return null;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Content")}</p>
          <h1 className="page-title">{t("Pages")}</h1>
          <p className="page-description">{t("Manage every standalone page on this site.")}</p>
        </div>
        <div className="page-actions">
          <button onClick={createPage} disabled={creating}>
            {creating ? t("Creating…") : t("New Page")}
          </button>
        </div>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      <DataTable
        rows={pages}
        rowKey={(page) => page.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>{t("No pages yet.")}</p>
              <p className="page-description">{t("Create your first page to get started.")}</p>
            </div>
          </div>
        }
        columns={[
          { key: "title", header: t("Title"), cell: (page) => <a href={`/admin/pages/${page.slug}`}>{page.title}</a> },
          {
            key: "slug",
            header: "Slug",
            cell: (page) => (
              <a href={siteUrl(`/${page.slug}`)} target="_blank" rel="noreferrer">
                /{page.slug}
              </a>
            ),
          },
          {
            key: "status",
            header: t("Status"),
            cell: (page) => <span className={`status status-${page.status}`}>{page.status}</span>,
          },
          { key: "updated", header: t("Updated"), cell: (page) => formatTimestamp(page.updatedAt) },
          {
            key: "actions",
            header: t("More"),
            cell: (page) => (
              <RowMenu
                triggerLabel={`Actions for "${page.title}"`}
                items={pageRowMenuItems(
                  page,
                  {
                    onEdit: (p) => navigate(`/pages/${p.slug}`),
                    onDisable: disablePage,
                    onDelete: setPendingDelete,
                  },
                  locale,
                )}
              />
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("Move to trash?")}
        body={
          pendingDelete ? (
            <p>
              {t("Move")} &quot;{pendingDelete.title}&quot; {t("to trash? It will disappear from the site and from this list.")}
            </p>
          ) : null
        }
        confirmLabel={t("Move to trash")}
        destructive
        pending={pendingDelete !== null && rowSavingId === pendingDelete.id}
        onConfirm={removePage}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
