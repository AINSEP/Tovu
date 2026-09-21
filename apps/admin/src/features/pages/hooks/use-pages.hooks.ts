import { useCallback, useEffect, useMemo, useState } from "react";

import { type AdminPost } from "@/lib/api";
import { navigate as defaultNavigate } from "@/lib/router";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@/hooks/use-content-refresh-subscription.hooks";
import { useSettlementGeneration } from "@/hooks/use-settlement-generation.hooks";
import { t as translate } from "../pages-i18n";
import { buildPageRowMenuHandleMap, PAGES_RESOURCE } from "../rules";
import { defaultPagesPort } from "./pages-dependencies.hooks";
import type { PagesPort } from "./pages-port.hooks";
import type { Translate } from "@/lib/dictionary-translator";

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
 * `lib/router` directly, so a test can describe load/create/disable/delete outcomes against
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
  /** In-flight row action (Disable, or the confirmed Delete) — one at a time. */
  rowSavingId: string | null;
  /** The page a `RowMenu` "Delete" selection is asking to confirm; `null` when the dialog is shut. */
  pendingDelete: AdminPost | null;
  setPendingDelete: (page: AdminPost | null) => void;
  createPage: () => Promise<void>;
  disablePage: (page: AdminPost) => Promise<void>;
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
 * `load`'s extraction below (staleness-bug generalization pass, see
 * `use-content-refresh-subscription.hooks.ts`'s own header): pulled out of the mount effect into a
 * `useCallback` so the same function can also be handed to `useContentRefreshSubscription`, which
 * re-runs it whenever `pages_write_html` (`apps/website/src/features/pages/agent-tools.ts`) writes a
 * page from an assistant run this screen otherwise has no way to learn about — the same fix
 * `use-posts.hooks.ts` (this screen's twin) needed for the reported bug. `setPages` on success rather
 * than resetting to `null` first, unchanged from before this pass, keeps the table rendered across a
 * background refresh instead of flashing back to a loading state on every agent write.
 *
 * `settlement` (2026-09-07 fix, `useSettlementGeneration` — same shape `use-sites.hooks.ts`'s
 * `activate`/`use-themes.hooks.ts`'s `activate`/`download` already use): giving `load` a SECOND
 * trigger (the content-refresh subscription, above) means two `listPages()` calls can now be
 * in flight at once with no ordering guarantee on their responses — two assistant writes landing
 * back to back each publish their own refresh notification. Without this guard, whichever request
 * happened to resolve LAST won regardless of which one was issued last, so a slower, earlier
 * (now-stale) response could overwrite the newer list an operator is already looking at. Minted
 * synchronously at the top of `load`, before the request starts, so two calls issued in the same
 * tick each observe the other's claim; checked before `setPages` so a superseded response is
 * dropped instead of applied.
 */
export function usePages(deps: PagesDependencies): PagesController {
  const { port, navigate, t, locale } = deps;
  const [pages, setPages] = useState<AdminPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const settlement = useSettlementGeneration();
  // In-flight row action (Disable or the confirmed Delete) — one at a time, same `rowSavingId`
  // convention `Roles.tsx`'s `onDeleteRole` already uses, per `ConfirmButton`'s own doc comment.
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);
  // The page a `RowMenu` "Delete" selection is asking to confirm — `null` when the dialog is
  // closed. `ConfirmDialog` stays mounted unconditionally in the view (see its own doc comment on
  // why); this is what drives its `open` prop.
  const [pendingDelete, setPendingDelete] = useState<AdminPost | null>(null);

  const load = useCallback(() => {
    // Claim this call's generation BEFORE the request starts — see `useSettlementGeneration`'s own
    // doc for why a synchronous ref bump, not `useState`, is what makes two overlapping calls each
    // see the other's claim.
    const generation = settlement.next();
    port
      .listPages()
      .then((r) => {
        // Superseded by a newer `load()` started after this one (mount vs. a content-refresh
        // notification, or two notifications back to back) — that later call owns `pages` now, and
        // applying this stale result would let whichever request happens to settle LAST win
        // regardless of which one was issued last. See this hook's own header.
        if (!settlement.isCurrent(generation)) return;
        setPages(r.posts.map((entry) => entry.post));
      })
      .catch((e) => {
        if (!settlement.isCurrent(generation)) return;
        setError(e instanceof Error ? e.message : "failed to load pages");
      });
    // `port`/`settlement` are added — see `use-page-editor.hooks.ts`'s identical note: both are
    // function-scoped values ESLint's exhaustive-deps rule can see, referentially stable in
    // production, so this changes nothing about when this callback's identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port, settlement]);

  useEffect(() => {
    load();
  }, [load]);

  useContentRefreshSubscription(PAGES_RESOURCE, load);

  const rowMenuHandleById = usePageRowMenuHandleMap(pages);

  async function createPage() {
    setCreating(true);
    setError(null);
    try {
      const { post } = await port.createPage("Untitled");
      // The Pages editor, not the Posts one. "New Page" and "ask the assistant to build me a page"
      // are two doors to the same destination — neither of them is a Tiptap screen.
      navigate(`/pages/${post.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to create page");
      setCreating(false);
    }
  }

  /** Unpublishes so the row is no longer publicly viewable — a reversible, access-affecting
   *  action (not destructive: no `ConfirmDialog`, matching `ConfirmButton`'s own warning-vs-
   *  destructive distinction). Only ever called for a `status === "published"` row — `RowMenu`'s
   *  item list in the view omits "Disable" entirely once a page is already a draft, rather than
   *  rendering it disabled with no explanation.
   *
   * `expectedVersion: page.version` (2026-09-18, multi-author hardening, Task 14a) — mirrors
   * `use-posts.hooks.ts`'s identical `disablePost` fix exactly; see its doc for the full rationale. */
  async function disablePage(page: AdminPost) {
    setRowSavingId(page.id);
    setError(null);
    try {
      const { post: updated } = await port.updatePost({ id: page.id }, { status: "draft", expectedVersion: page.version });
      setPages((prev) => (prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to disable page");
    } finally {
      // Only clear THIS row's lock — `rowSavingId` is shared with `removePage`'s delete-in-flight
      // lock (2026-09-20, S4b hardening; mirrors `use-posts.hooks.ts`'s identical fix). An
      // unconditional `setRowSavingId(null)` here would wipe a DIFFERENT row's delete lock if that
      // row's `ConfirmDialog` confirm landed while this Disable was still in flight, making the
      // dialog read as settled (dismissable, re-confirmable) while the delete is still on the wire.
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
      await port.deletePage(page.id);
      setPages((prev) => (prev ? prev.filter((p) => p.id !== page.id) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete page");
    } finally {
      // Symmetric guard to `disablePage`'s — see its comment. Keeps this correct regardless of
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
    disablePage,
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
  const t = (key: string): string => translate(locale, key);
  return usePages({ port: defaultPagesPort, navigate: defaultNavigate, t, locale });
}
