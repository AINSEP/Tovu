import { useEffect, useState } from "react";

import { type AdminPost } from "@/lib/api";
import { navigate as defaultNavigate } from "@/lib/router";
import { defaultPostsListPort } from "./posts-list-dependencies.hooks";
import type { PostsListPort } from "./posts-list-port.hooks";

/**
 * @file Everything the Posts LIST does, so `Posts.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error strings. The point of
 * pulling it out is not to change behaviour but to make the behaviour testable without rendering a
 * `DataTable`: `Posts.tsx` has no unit test today (`PostEditor` has seven), and a screen whose whole
 * job is five pieces of interdependent async state is the wrong shape to leave untested. A hook is
 * reachable from `renderHook` with no table, no `RowMenu`, and no portal.
 *
 * The doc comments below moved WITH the functions they describe. Several are decision records —
 * why the delete copy says what it says, why "Disable" is not gated behind a confirm — and a
 * comment separated from its code stops being read.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts` and `hooks/use-dirty-guard.hooks.ts`:
 * `use-<thing>.hooks.ts`. Feature-local because nothing outside `features/posts` needs it; promote
 * to `src/hooks/` only when a second feature actually does.
 *
 * `port`/`navigate` are injected — see `posts-list-port.hooks.ts` — rather than reaching `lib/api`/
 * `lib/router` directly, so a test can describe load/create/disable/delete outcomes against
 * `createFakePostsListPort` instead of stubbing global `fetch`. `useWiredPosts` below is the
 * zero-argument pair `Posts.tsx` actually mounts. No `locale`/`useAdminLocale` here — every error
 * string in this file is hardcoded English, matching its twin `use-pages.hooks.ts`. Named
 * `posts-list-*` (not `posts-*`) to avoid colliding with `use-post-editor.hooks.ts`'s own
 * `post-editor-port.hooks.ts` — this is a deliberately separate hook for a deliberately separate
 * screen, per that file's own header.
 */

export interface PostsController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  posts: AdminPost[] | null;
  error: string | null;
  creating: boolean;
  /** In-flight row action (Disable, or the confirmed Delete) — one at a time. */
  rowSavingId: string | null;
  /** The post a `RowMenu` "Delete" selection is asking to confirm; `null` when the dialog is shut. */
  pendingDelete: AdminPost | null;
  setPendingDelete: (post: AdminPost | null) => void;
  createPost: () => Promise<void>;
  disablePost: (post: AdminPost) => Promise<void>;
  removePost: () => Promise<void>;
}

export interface PostsListDependencies {
  port: PostsListPort;
  navigate: (path: string) => void;
}

export function usePosts(deps: PostsListDependencies): PostsController {
  const { port, navigate } = deps;
  const [posts, setPosts] = useState<AdminPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // In-flight row action (Disable or the confirmed Delete) — one at a time, same `rowSavingId`
  // convention `Roles.tsx`'s `onDeleteRole` already uses, per `ConfirmButton`'s own doc comment.
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);
  // The post a `RowMenu` "Delete" selection is asking to confirm — `null` when the dialog is
  // closed. `ConfirmDialog` stays mounted unconditionally in the view (see its own doc comment on
  // why); this is what drives its `open` prop.
  const [pendingDelete, setPendingDelete] = useState<AdminPost | null>(null);

  useEffect(() => {
    port
      .listPosts()
      .then((r) => setPosts(r.posts.map((entry) => entry.post)))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load posts"));
    // `port` is added — see `use-page-editor.hooks.ts`'s identical note: a function-scoped value
    // ESLint's exhaustive-deps rule can see, referentially stable in production, so this changes
    // nothing about when the effect re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port]);

  async function createPost() {
    setCreating(true);
    setError(null);
    try {
      const { post } = await port.createPost("Untitled");
      navigate(`/posts/${post.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to create post");
      setCreating(false);
    }
  }

  /** Unpublishes so the row is no longer publicly viewable — a reversible, access-affecting
   *  action (not destructive: no `ConfirmDialog`, matching `ConfirmButton`'s own warning-vs-
   *  destructive distinction). Only ever called for a `status === "published"` row — `RowMenu`'s
   *  item list in the view omits "Disable" entirely once a post is already a draft, rather than
   *  rendering it disabled with no explanation. */
  async function disablePost(post: AdminPost) {
    setRowSavingId(post.id);
    setError(null);
    try {
      const { post: updated } = await port.updatePost({ id: post.id }, { status: "draft" });
      setPosts((prev) => (prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to disable post");
    } finally {
      setRowSavingId(null);
    }
  }

  /** Soft delete — see `features/pages/hooks/use-pages.hooks.ts`'s `removePage` (the twin of
   * this function) for the full
   * rationale behind the confirm copy: it states only the observable consequence and
   * deliberately does not claim recoverability, because no restore path is reachable from this
   * product today even though the underlying route is a genuine soft delete. Do not add
   * "recoverable"/"not permanent" (unreachable promise) or "permanently"/"cannot be undone"
   * (the opposite lie) without first changing what's actually true.
   *
   * Confirmation gates via a `ConfirmDialog` modal, reached through `RowMenu`'s "Delete" item,
   * rather than `ConfirmButton`'s in-place two-click control or `window.confirm` — a further
   * upgrade over MSG-03's `ConfirmButton` pass: that component was itself chosen at the time
   * because `styles.css` was locked to a concurrently-editing agent and a modal needed new markup/
   * CSS this pass could not add (see `ConfirmButton.tsx`'s own file header). Neither constraint
   * holds any more, and a modal disclosure ("Move "X" to trash? It will disappear from the site and
   * from this list.") reads as a deliberate decision point rather than a label change on a button
   * already sitting in a menu the operator just opened. */
  async function removePost() {
    if (!pendingDelete) return;
    const post = pendingDelete;
    setRowSavingId(post.id);
    setError(null);
    try {
      await port.deletePost(post.id);
      setPosts((prev) => (prev ? prev.filter((p) => p.id !== post.id) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete post");
    } finally {
      setRowSavingId(null);
      setPendingDelete(null);
    }
  }

  return {
    posts,
    error,
    creating,
    rowSavingId,
    pendingDelete,
    setPendingDelete,
    createPost,
    disablePost,
    removePost,
  };
}

/**
 * Binds the real `/api/.../posts` client and `lib/router`'s `navigate` — see
 * `posts-list-dependencies.hooks.ts`. The zero-argument half of the `useX(dependencies)` /
 * `useWiredX()` pair, so `Posts.tsx` composes this and a test composes {@link usePosts} with
 * `createFakePostsListPort`.
 */
export function useWiredPosts(): PostsController {
  return usePosts({ port: defaultPostsListPort, navigate: defaultNavigate });
}
