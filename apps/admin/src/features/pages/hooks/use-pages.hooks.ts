import { useFetchQuery, useFetchMutation, useCachedLoader, useInvalidate } from "@jini-ai/ui/fetch-query";
import { useCallback, useMemo, useState } from "react";

import { type AdminPost } from "@/lib/api";
import { navigate as defaultNavigate } from "@/lib/router";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@/hooks/use-content-refresh-subscription.hooks";
import { type Translate } from "@jini-ai/ui/panel-kit";
import { t as translate } from "../pages-i18n";
import { buildPageRowMenuHandleMap, pageAdminPath, PAGES_RESOURCE } from "../rules";
import { defaultPagesPort } from "./pages-dependencies.hooks";
import type { PagesPort } from "./pages-port.hooks";

/**
 * @file Everything the Pages LIST does, so `Pages.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error strings. Mirrors
 * `features/posts/hooks/use-posts.hooks.ts` exactly, since `Pages.tsx` is `Posts.tsx`'s twin,
 * backed by the pages-filtered endpoints (`GET/POST .../pages`). A page is a `post` row with
 * `kind: "page"` (see `features/post/post.ts`), so it's edited through the same `PostEditor`
 * reached via `/admin/posts/{id}`.
 *
 * The doc comments below moved WITH the functions they describe. `removePage`'s is a decision
 * record — why the delete copy says what it says — that `posts/hooks/use-posts.hooks.ts`'s
 * `removePost` points at as its source; a comment separated from its code stops being read.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts` and `hooks/use-dirty-guard.hooks.ts`:
 * `use-<thing>.hooks.ts`. Feature-local because nothing outside `features/pages` needs it.
 *
 * `port`/`navigate` are injected — see `pages-port.hooks.ts` — rather than reaching `lib/api`/
 * `lib/router` directly, so a test can describe load/create/publish-toggle/delete outcomes against
 * `createFakePagesPort` instead of stubbing global `fetch`. `useWiredPages` below is the
 * zero-argument pair `Pages.tsx` actually mounts. This hook's OWN error strings stay hardcoded
 * English, unlike `use-collections.hooks.ts`'s locale-aware fallbacks — but `t`/`locale` are still
 * injected (2026-08-11, standing i18n rule — a component with a hook gets a BOUND `t` from that
 * hook, not its own `useAdminLocale()`/dictionary import, same shape `use-post-editor.hooks.ts`
 * established) purely so `Pages.tsx` has somewhere to source the UI copy it renders. `locale`
 * itself is also exposed, not just `t`: `Pages.tsx` passes the raw string on to
 * `pageRowMenuItems` (`../rules.ts`), which keeps its own independent `PAGES_DICT[locale]?.[key]
 * ?? key` closure unchanged — same "row-menu builder is a different, out-of-scope thing" precedent
 * `use-post-editor.hooks.ts`'s own header cites for `postRowMenuItems`.
 */

export interface PagesController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  pages: AdminPost[] | null;
  error: string | null;
  creating: boolean;
  /** In-flight row action (Publish/Unpublish, or the confirmed Delete) — one at a time. */
  rowSavingId: string | null;
  /** The page a `RowMenu` "Delete" selection is asking to confirm; `null` when the dialog is shut. */
  pendingDelete: AdminPost | null;
  setPendingDelete: (page: AdminPost | null) => void;
  createPage: () => Promise<void>;
  togglePagePublish: (page: AdminPost) => Promise<void>;
  removePage: () => Promise<void>;
  /** Bound translator — `Pages.tsx`'s only source of UI copy; see this file's own header. */
  t: Translate;
  /** The raw resolved locale — exposed only because `pageRowMenuItems` (`../rules.ts`) genuinely
   *  needs it, not `t`. */
  locale: string;
  /** Each page's row-menu agent handle, keyed by page id — looked up by ID, never by render
   *  position. See {@link usePageRowMenuHandleMap}'s own doc for why. */
  rowMenuHandleById: Map<string, string>;
}

/**
 * `DataTable` sorts internally from `sort` + each column's own comparator — `pages` is passed
 * through unsorted, and only `DataTable`'s own render order changes as `sort` changes. Handles are
 * built once from `pages`' own stable order and looked up BY ID in each cell, rather than by render
 * position: `buildPageRowMenuHandleMap`'s own contract derives a handle from each id, not its
 * position, specifically so a control keeps the same handle even after the table reorders — which
 * is exactly what re-sorting does. Memoized on `pages` alone so re-sorting or any other unrelated
 * re-render (`sort`, `locale`) does not rebuild this map and hand `RowMenu` a new handle-string
 * identity every time. Mirrors `use-posts.hooks.ts`'s `usePostRowMenuHandleMap` verbatim.
 */
export function usePageRowMenuHandleMap(pages: AdminPost[] | null): Map<string, string> {
  return useMemo(() => buildPageRowMenuHandleMap(pages), [pages]);
}

export interface PagesDependencies {
  port: PagesPort;
  navigate: (path: string) => void;
  t: Translate;
  locale: string;
}

/**
 * The content-refresh subscription invalidates the shared list whenever pages_write_html
 * (apps/website/src/features/pages/agent-tools.ts) writes a page from an assistant run this
 * screen otherwise has no way to learn about. Like the Posts twin, retained query data keeps
 * the table rendered across background refreshes instead of flashing a first-load skeleton.
 *
 * The 2026-09-07 settlement fix (formerly useSettlementGeneration) remains necessary:
 * the content-refresh subscription means two listPages calls can be
 * in flight at once with no ordering guarantee on their responses — two assistant writes landing
 * back to back each publish their own refresh notification. Without this guard, whichever request
 * happened to resolve LAST won regardless of which one was issued last, so a slower, earlier
 * (now-stale) response could overwrite the newer list an operator is already looking at.
 * Cache invalidation now revokes the older request's ownership synchronously before the new
 * read starts, so both superseded successes and failures follow the latest request.
 */
export function usePages(deps: PagesDependencies): PagesController {
  const { port, navigate, t, locale } = deps;
  const key = useMemo(() => ["pages", "list"] as const, []);
  const fetchList = useCallback(async () => {
    try { return (await port.listPages()).posts.map(entry => entry.post); }
    catch (error) { throw new Error(error instanceof Error ? error.message : "failed to load pages"); }
  }, [port]);
  // Mount reads and content-refresh invalidations can overlap. The shared cache revokes the
  // older request's ownership before starting the newer read, so a late success or failure
  // cannot replace the latest list. Background reads retain the rendered table.
  const query = useFetchQuery({ key, fetch: fetchList }, { staleTime: 0 });
  const loader = useCachedLoader({ key, fetch: fetchList }, { staleTime: 0 });
  const pages = query.data ?? null;
  function setPages(update: (current: AdminPost[] | null) => AdminPost[] | null) {
    const next = update(loader.peek() ?? null);
    if (next !== null) loader.replace({ value: next });
  }
  const invalidate = useInvalidate();
  const write = useFetchMutation({ run: ({ input }: { input: () => Promise<unknown> }) => input() }, { invalidates: [["pages"]] });
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError ?? query.error?.message ?? null;
  const [creating, setCreating] = useState(false);
  // In-flight row action (Publish/Unpublish or the confirmed Delete) — one at a time, same `rowSavingId`
  // convention `Roles.tsx`'s `onDeleteRole` already uses, per `ConfirmButton`'s own doc comment.
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);
  // The page a `RowMenu` "Delete" selection is asking to confirm — `null` when the dialog is
  // closed. `ConfirmDialog` stays mounted unconditionally in the view (see its own doc comment on
  // why); this is what drives its `open` prop.
  const [pendingDelete, setPendingDelete] = useState<AdminPost | null>(null);

  // Query ownership replaces the latest-wins read guard described above; background
  // refreshes keep the table and cache replacements protect newer mutation responses.
  const load = useCallback(() => invalidate({ key: ["pages"] }), [invalidate]);
  useContentRefreshSubscription(PAGES_RESOURCE, load);

  const rowMenuHandleById = usePageRowMenuHandleMap(pages);

  async function createPage() {
    setCreating(true);
    setError(null);
    try {
      const { post } = await write.mutate({ input: () => port.createPage("Untitled") }) as Awaited<ReturnType<typeof port.createPage>>;
      // The Pages editor, not the Posts one. "New Page" and "ask the assistant to build me a page"
      // are two doors to the same destination — neither of them is a Tiptap screen.
      // `pageAdminPath` (`rules.ts`) — same slug-vs-id-vs-root-slug rule `Pages.tsx`'s own row
      // navigation already uses for an existing page (readable-slugs S6a).
      navigate(pageAdminPath(post));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to create page");
      setCreating(false);
    }
  }

  /** Flips a row's publish status — Unpublish (-> draft) for a published row, Publish (-> published)
   *  for a draft, matching `pageRowMenuItems`'s own label for whichever direction applies. A
   *  reversible, access-affecting action (not destructive: no `ConfirmDialog`, matching
   *  `ConfirmButton`'s own warning-vs-destructive distinction).
   *
   * Owner rename (2026-09-22) from the old `disablePage`, which only ever flipped published -> draft
   * (`RowMenu`'s item list omitted "Disable" entirely for an already-draft row, rather than
   * rendering it disabled) — a draft page had no way to publish from this list at all, only from the
   * full editor.
   *
   * Sends the row's own `title`/`slug`/`bodyJson` alongside the flipped `status` and
   * `expectedVersion` — `PUT /posts/:id`'s `validateUpdatePostInput` (`features/post/post.ts`)
   * treats a missing `title`/`slug` as `""` and rejects the request with "title is required" before
   * ever reaching the version check, and requires `bodyJson` to be a JSON object for any row whose
   * `bodyFormat` isn't `"html"` — which is exactly what the OLD `{ status, expectedVersion }`-only
   * payload hit (owner screenshot, 2026-09-22): every click 500'd on that validation, regardless of
   * the row's status, and never reached the version guard at all. Round-tripping the row's own
   * already-loaded fields here is safe specifically because they are read from the SAME `page` this
   * call's `expectedVersion` is about to check — a stale basis fails that compare-and-set before any
   * of these fields would actually be written back, so this can never silently overwrite a
   * concurrent edit to title/slug/body.
   *
   * `expectedVersion: page.version` (2026-09-18, multi-author hardening, Task 14a) — mirrors
   * `use-posts.hooks.ts`'s identical `togglePostPublish` fix exactly; see its doc for the full
   * rationale. */
  async function togglePagePublish(page: AdminPost) {
    const nextStatus: AdminPost["status"] = page.status === "published" ? "draft" : "published";
    setRowSavingId(page.id);
    setError(null);
    try {
      const { post: updated } = await write.mutate({ input: () => port.updatePost(
        { id: page.id },
        { title: page.title, slug: page.slug, bodyJson: page.bodyJson, status: nextStatus, expectedVersion: page.version }
      ) }) as Awaited<ReturnType<typeof port.updatePost>>;
      setPages((prev) => (prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev));
    } catch (e) {
      const action = nextStatus === "published" ? "publish" : "unpublish";
      setError(e instanceof Error ? e.message : `failed to ${action} page`);
    } finally {
      // Only clear THIS row's lock — `rowSavingId` is shared with `removePage`'s delete-in-flight
      // lock (2026-09-20, S4b hardening; mirrors `use-posts.hooks.ts`'s identical fix). An
      // unconditional `setRowSavingId(null)` here would wipe a DIFFERENT row's delete lock if that
      // row's confirm landed while this toggle was still in flight, making the dialog read as
      // settled (dismissable, re-confirmable) while the delete is still on the wire.
      setRowSavingId((cur) => (cur === page.id ? null : cur));
    }
  }

  /** Soft delete: `api.deletePage` does hit a soft-delete route that is genuinely revertible
   * server-side (see api.ts's own doc on deletePage) — but the confirm copy below states only the
   * observable consequence and does NOT claim recoverability. There is no restore path an
   * operator can reach from this product today (no change-set-revert UI, no api.ts method for it;
   * `Recovery.tsx` is a different, much heavier whole-database snapshot restore, not a per-row
   * undo). Promising an undo the operator cannot actually perform would be worse than promising
   * nothing. Equally, do not swap it for "permanently delete" / "cannot be undone" — that
   * overcorrects into the opposite lie, since the row genuinely is recoverable server-side, just
   * not from here. On success the row is dropped from local state rather than a full reload,
   * matching this screen's existing preference for optimistic-from-response local updates.
   *
   * Confirmation now gates via a `ConfirmDialog` modal, reached through `RowMenu`'s "Delete" item,
   * rather than `ConfirmButton`'s in-place two-click control or `window.confirm` — a further
   * upgrade over MSG-03's `ConfirmButton` pass on this same screen's twin (`Posts.tsx`): that
   * component was itself chosen at the time because `styles.css` was locked to a concurrently-
   * editing agent and a modal needed new markup/CSS this pass could not add (see
   * `ConfirmButton.tsx`'s own file header). Neither constraint holds for this dispatch, and a
   * modal disclosure ("Move "X" to trash? It will disappear from the site and from this list.")
   * reads as a deliberate decision point rather than a label change on a button already sitting in
   * a menu the operator just opened. */
  async function removePage() {
    if (!pendingDelete) return;
    const page = pendingDelete;
    setRowSavingId(page.id);
    setError(null);
    try {
      await write.mutate({ input: () => port.deletePage(page.id) });
      setPages((prev) => (prev ? prev.filter((p) => p.id !== page.id) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete page");
    } finally {
      // Symmetric guard to `togglePagePublish`'s — see its comment. Keeps this correct regardless of
      // which of the two in-flight actions settles first.
      setRowSavingId((cur) => (cur === page.id ? null : cur));
      setPendingDelete(null);
    }
  }

  return {
    pages,
    error,
    creating,
    rowSavingId,
    pendingDelete,
    setPendingDelete,
    createPage,
    togglePagePublish,
    removePage,
    t,
    locale,
    rowMenuHandleById,
  };
}

/**
 * Binds the real `/api/.../pages` client, `lib/router`'s `navigate`, and a `t` bound to the real
 * resolved locale (`useAdminLocale()`, called here and ONLY here — see this file's header) — see
 * `pages-dependencies.hooks.ts`. The zero-argument half of the `useX(dependencies)` /
 * `useWiredX()` pair, so `Pages.tsx` composes this and a test composes {@link usePages} with
 * `createFakePagesPort` and a fake `navigate`/`t`.
 */
export function useWiredPages(): PagesController {
  const locale = useAdminLocale();
  const t = (key: string): string => translate({ locale: locale, key: key });
  return usePages({ port: defaultPagesPort, navigate: defaultNavigate, t, locale });
}
