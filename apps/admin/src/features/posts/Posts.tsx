import { DataTable, RowMenu, ConfirmDialog } from "@jini-ai/admin/react";
import { useState, type ReactNode } from "react";

import type { AdminPost } from "../../lib/api";
import { siteUrl } from "../../lib/site-url";
import { formatTimestamp } from "../../lib/format-timestamp";
import { navigate } from "../../lib/router";
import { buildAgentListHandles } from "../../lib/agent-list-handles";
import {
  postRowMenuItems,
  sortPosts,
  nextPostSortState,
  postSortCaretGlyph,
  lexicalPostSortButtonLabel,
  updatedSortHeaderLabel,
  DEFAULT_POST_SORT,
  type PostSortState,
} from "./rules";
import { useWiredPosts } from "./hooks/use-posts.hooks";
import { useWiredAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { POSTS_DICT } from "./posts-i18n";

/**
 * @file The Posts list screen — markup only.
 *
 * State and API calls live in `hooks/use-posts.hooks.ts`; the row-menu logic lives in `rules.ts`.
 * What stays here is what actually renders: column definitions, the empty state, and the confirm
 * copy.
 */
export interface PostsProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`.
   *
   * Defaulted to the real hook, so production callers (`panels.tsx`) pass nothing and behave
   * exactly as before. A test supplies a stub and drives this component through any state —
   * mid-delete, load failure, empty list — without module mocking, a fake `fetch`, or waiting on a
   * real request. That matters here specifically: this screen has no unit test today, and the
   * reason it is awkward to write one is that every state is behind an un-substitutable `api` call.
   */
  usePostsHook?: typeof useWiredPosts;
}

/**
 * The loading/error guard shown before the table has anything to render — pulled out of `Posts`
 * (2026-08-06, complexity pass, fourth pass) so its two early-return checks collapse into one
 * `if` at the call site. `error && !posts` (not just `error`): once the list has loaded, a later
 * failure (create, delete) surfaces as an inline banner above the table instead of blanking the
 * whole screen — matches Pages.tsx/Media.tsx/Comments.tsx. Mirrors `Pages.tsx`'s identical
 * `pagesListNotice`.
 */
export function postsListNotice(posts: AdminPost[] | null, error: string | null): ReactNode {
  if (error && !posts) return <div className="notice error">{error}</div>;
  if (!posts) return <div className="notice">Loading posts…</div>;
  return null;
}

export function Posts({ usePostsHook = useWiredPosts }: PostsProps) {
  const {
    posts,
    error,
    creating,
    rowSavingId,
    pendingDelete,
    setPendingDelete,
    createPost,
    disablePost,
    removePost,
  } = usePostsHook();
  const locale = useWiredAdminLocale();
  const t = (key: string): string => POSTS_DICT[locale]?.[key] ?? key;
  // Owner ruling (2026-08-14): pure interactive DOM-chrome state — a client-side sort toggle with
  // no I/O behind it — stays LOCAL rather than moving into `use-posts.hooks.ts`, unlike every other
  // piece of state on this screen. The line to draw: async/API/data state always moves into the
  // hook; view-only chrome (active tab, expanded/collapsed, dialog open, sort direction) stays here
  // UNLESS a test needs to observe it. `Posts.tsx` is the file everyone else copies this pattern
  // from (this file's own `PostsProps` doc comment) — this is the canonical example of the
  // exception, not an oversight to "finish" later.
  //
  // 2026-09-02: generalized from a single Updated-only direction to `PostSortState`, which also
  // names the active column — Title/Slug/Status became sortable too (`rules.ts`'s multi-column sort
  // block), and only one column is ever active at a time.
  const [sort, setSort] = useState<PostSortState>(DEFAULT_POST_SORT);

  const notice = postsListNotice(posts, error);
  if (notice) return notice;
  // Unreachable in practice — `postsListNotice` already returns a non-null notice whenever `posts`
  // is null — but restores the narrowing TS lost by moving that check behind a function call, so
  // `rows={posts}` below type-checks as `AdminPost[]` without an `as`/`!` assertion.
  if (!posts) return null;

  // Sorted once so both `rows` and the per-row RowMenu handles below walk the SAME order — post ids
  // are stable and unique, so they disambiguate one row's menu from another's regardless of which
  // column/direction `sort` is currently facing.
  const sortedPosts = sortPosts(posts, sort);
  const rowMenuHandles = buildAgentListHandles(
    "posts-row",
    sortedPosts.map((post) => post.id),
  );

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Content")}</p>
          <h1 className="page-title">{t("Posts")}</h1>
          <p className="page-description">{t("Manage and publish every post on this site.")}</p>
        </div>
        <div className="page-actions">
          <button onClick={createPost} disabled={creating}>
            {creating ? t("Creating…") : t("New Post")}
          </button>
        </div>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      <DataTable
        rows={sortedPosts}
        rowKey={(post) => post.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>{t("No posts yet.")}</p>
              <p className="page-description">{t("Create your first post to get started.")}</p>
            </div>
          </div>
        }
        columns={[
          {
            key: "title",
            // Sortable headers (2026-08-10, Updated only; generalized to all four 2026-09-02): a
            // plain button toggling `sort` — `DataTable`'s `<th>` doesn't expose an `aria-sort` prop
            // (see its own file header: "no sorting" was a deliberate scope cut for that shared
            // component), so the accessible state lives on each button's own `aria-label` instead,
            // not just the ▲/▼/⇅ glyph, which is `aria-hidden`.
            header: (
              <button
                type="button"
                className="sortable-column-header"
                onClick={() => setSort((s) => nextPostSortState(s, "title"))}
                aria-label={lexicalPostSortButtonLabel("Title", "title", sort)}
              >
                {t("Title")}
                <span aria-hidden="true">{postSortCaretGlyph("title", sort)}</span>
              </button>
            ),
            cell: (post) => <a href={`/admin/posts/${post.slug}`}>{post.title}</a>,
          },
          {
            key: "slug",
            header: (
              <button
                type="button"
                className="sortable-column-header"
                onClick={() => setSort((s) => nextPostSortState(s, "slug"))}
                aria-label={lexicalPostSortButtonLabel("Slug", "slug", sort)}
              >
                Slug
                <span aria-hidden="true">{postSortCaretGlyph("slug", sort)}</span>
              </button>
            ),
            cell: (post) => (
              <a href={siteUrl(`/${post.slug}`)} target="_blank" rel="noreferrer">
                /{post.slug}
              </a>
            ),
          },
          {
            key: "status",
            header: (
              <button
                type="button"
                className="sortable-column-header"
                onClick={() => setSort((s) => nextPostSortState(s, "status"))}
                aria-label={lexicalPostSortButtonLabel("Status", "status", sort)}
              >
                {t("Status")}
                <span aria-hidden="true">{postSortCaretGlyph("status", sort)}</span>
              </button>
            ),
            cell: (post) => <span className={`status status-${post.status}`}>{post.status}</span>,
          },
          {
            key: "updated",
            header: (
              <button
                type="button"
                className="sortable-column-header"
                onClick={() => setSort((s) => nextPostSortState(s, "updated"))}
                aria-label={updatedSortHeaderLabel(sort)}
              >
                {t("Updated")}
                <span aria-hidden="true">{postSortCaretGlyph("updated", sort)}</span>
              </button>
            ),
            cell: (post) => formatTimestamp(post.updatedAt),
          },
          {
            key: "actions",
            header: t("More"),
            cell: (post, index) => (
              <RowMenu
                triggerLabel={`Actions for "${post.title}"`}
                agentHandle={`${rowMenuHandles[index]}-menu`}
                items={postRowMenuItems(
                  post,
                  {
                    onEdit: (p) => navigate(`/posts/${p.slug}`),
                    onDisable: disablePost,
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
        onConfirm={removePost}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
