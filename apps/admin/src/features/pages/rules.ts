import type { DataTableSortDirection, DataTableSortState } from "@jini-ai/admin/core";
import type { RowMenuItem } from "@jini-ai/admin/react";

import type { CanvasStyling } from "@jini-ai/ui/html-editor";

import { buildAgentListHandles } from "../../lib/agent-list-handles";
import { ApiError, type AdminPost } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import type {
  StandingDraftAutosaveInput,
  StandingDraftStaleBasis,
} from "../../hooks/use-standing-draft-autosave.hooks";
import { formatRelativeMinutesAgo } from "../../lib/format-timestamp";
import { t as translate } from "./pages-i18n";
import type { ThemePageRow } from "./hooks/use-theme-pages.hooks";
import type { PageEditorView } from "./hooks/use-page-editor.hooks";
import type { ThemeCanvasStylingState } from "./hooks/use-theme-canvas-styling.hooks";

/**
 * @file Pure logic for the `pages` feature — everything that computes a value rather than
 * rendering one.
 *
 * Mirrors `features/posts/rules.ts` exactly, since `Pages.tsx` is `Posts.tsx`'s twin (same
 * `RowMenu`-building logic, same "Disable" omission rule) backed by the pages-filtered endpoints.
 * The bar for landing here is "does it compute something", not "is it rendered" — `pageRowMenuItems`
 * was a closure inside a `DataTable` cell, reachable only by rendering a table and opening a
 * popover, which is how its `page.status` conditional ended up permanently untested.
 */

/**
 * This screen's name on `lib/content-refresh-bus.ts` — see `taxonomy/rules.ts`'s `TAXONOMY_RESOURCE`
 * for why this is a plain colocated constant rather than a shared registry. `pages_write_html`
 * (`apps/website/src/features/pages/agent-tools.ts`) is agent-callable, so `use-pages.hooks.ts` needs
 * the same "an assistant write shows up without a reload" fix `use-taxonomy.hooks.ts` shipped first,
 * for the same reason its twin needed it — see `posts/rules.ts`'s `POSTS_RESOURCE`, the reported
 * bug's own screen (an operator asked the assistant to translate-and-publish a POST).
 */
export const PAGES_RESOURCE = "pages";

/**
 * A page's public path on the live site, derived from its `slug` — mirrors
 * `apps/website/src/platform/routing/routing.ts`'s `postPublicPath` exactly (same one-line
 * `"/" -> "/"`, everything else -> `/${slug}` rule), re-implemented here rather than imported
 * because `apps/admin` is a separately deployed SPA package with no dependency on
 * `apps/website`'s server source.
 *
 * Exists because a Page can now claim the literal root slug `"/"` (`apps/website/src/features/
 * post/post.ts`'s `ROOT_SLUG`, gated to `kind: "page"`), which a naive `/${slug}` template
 * doubles into `"//"` — a broken link both as an href and as the visible text in `Pages.tsx`'s
 * Slug column. `Posts.tsx` has no equivalent call because a Post can never hold `ROOT_SLUG`.
 *
 * @complexity O(1).
 */
export function pagePublicPath(slug: string): string {
  return slug === "/" ? "/" : `/${slug}`;
}

/**
 * The public preview URL for the CURRENT stored version — cache-busted, so a background refresh
 * (2026-09-16, `use-external-entry-refresh.hooks.ts`) can force the live-preview iframe to reload
 * even though its `slug` did not change.
 *
 * The public route serves `Cache-Control: public, max-age=60, stale-while-revalidate=300`
 * (`apps/website/src/server/inbound/public-http/routes/site/pages.ts`), so an unchanged `src` can
 * keep showing the pre-write HTML for up to a minute after an assistant tool saves a new one. The
 * `_v` param is never read server-side (the route's only `req.query` use is
 * `decodeFormSubmissionResultFromQuery`, which looks at form-result keys only) — it exists purely to
 * change the URL, which is what actually busts the browser cache.
 *
 * @complexity O(1).
 */
export function pageLivePreviewPath(slug: string, version: number): string {
  return `${pagePublicPath(slug)}?_v=${version}`;
}

/** The subset of a page {@link pageAdminPath} reads — kept narrow, same reasoning as
 *  {@link SavablePage} below, so a collision record (`ThemePageSlugCollision`/
 *  `ThemeExploreSlugCollision`, both `{ id, slug, title, kind }`) satisfies it structurally with no
 *  cast, alongside a real `AdminPost`. */
export interface PageAdminHandle {
  id: string;
  slug: string;
}

/**
 * The in-SPA path to a page's admin editor — `/pages/<handle>`, the bare route path `navigate()`
 * (`lib/router.ts`) expects, or that `adminHref()` (same module) turns into a real `<a href>`.
 *
 * **Prefers the slug; falls back to the id only when the slug can't be a path segment at all** —
 * today that is exactly the literal root slug `"/"` (`post.ts`'s `ROOT_SLUG`, gated to
 * `kind: "page"`; every other slug is validated against `isValidSlugFormat`'s
 * lowercase-letters/numbers/dashes pattern, so `"/"` is the only slug value a `/` can ever appear
 * in). The page-editor route is registered as `/:slug` — one path segment (`panels.tsx`) — and a
 * value containing `/` can never match that pattern, which is exactly the bug `45101306` hit and
 * fixed by switching to id-always. This restores the slug for every ordinary page while keeping
 * that fix for the one page it targeted: `getAdminPostByIdOrSlug`
 * (`apps/website/src/features/post/post.ts`) resolves either handle server-side (slug checked
 * first, id as the fallback), so both forms are lossless.
 *
 * Deliberately returns the bare route path rather than a full href or two id/slug-flavored
 * variants — a caller building a real `<a href>` wraps this in `adminHref()`; a caller driving the
 * SPA router passes it straight to `navigate()`. Baking a prefix in here would make it wrong for
 * whichever caller didn't want it; the previous per-call-site `` `/pages/${page.slug}` `` /
 * `` `/pages/${page.id}` `` templates are exactly the caller-side duplication this function replaces.
 *
 * @complexity O(1).
 */
export function pageAdminPath(page: PageAdminHandle): string {
  return `/pages/${page.slug === "/" ? page.id : page.slug}`;
}

/** The callbacks a row menu needs. Passed in rather than imported so this module stays free of
 *  state and navigation, and so a test can assert exactly which one a given row wires up — same
 *  shape as `posts/rules.ts`'s `PostRowMenuHandlers`. */
export interface PageRowMenuHandlers {
  onEdit: (page: AdminPost) => void;
  onDisable: (page: AdminPost) => void;
  onDelete: (page: AdminPost) => void;
}

/**
 * The row-action menu for one page.
 *
 * The branch is the reason this is exported: **"Disable" is omitted entirely for a page that is
 * already a draft**, rather than rendered disabled — same deliberate choice as `posts/rules.ts`'s
 * `postRowMenuItems`, and a claim worth a test, which it cannot have while it is a closure inside a
 * `DataTable` cell.
 *
 * "Delete" is marked `destructive` and only OPENS the confirmation; the delete itself is
 * `usePages().removePage`, gated on `ConfirmDialog`.
 *
 * @complexity Time/space: O(1) — at most three entries, no iteration.
 * @overallScore 100
 */
export function pageRowMenuItems(page: AdminPost, handlers: PageRowMenuHandlers, locale: string): RowMenuItem[] {
  const t = (key: string): string => translate(locale, key);
  const items: RowMenuItem[] = [{ key: "edit", label: t("Edit"), onSelect: () => handlers.onEdit(page) }];
  if (page.status === "published") {
    items.push({ key: "disable", label: t("Disable"), onSelect: () => handlers.onDisable(page) });
  }
  items.push({ key: "delete", label: t("Delete"), destructive: true, onSelect: () => handlers.onDelete(page) });
  return items;
}

/**
 * Row-menu agent handle for every page, keyed by page id. `Pages.tsx` looks a row's handle up BY
 * ID rather than by render position — mirrors `posts/rules.ts`'s `buildPostRowMenuHandleMap`
 * verbatim, for the reason that function's own doc gives and that this screen learned the hard way
 * (2026-09-07 audit claim #2): `DataTable` sorts `rows` internally and passes each `cell` callback
 * the index into that SORTED order, while the handle array is built from the unsorted `pages` prop,
 * so any row whose sort position differed from its array position published another page's handle.
 *
 * `null` (list not loaded yet) returns an empty map rather than throwing, so the caller can memoize
 * this unconditionally above its own loading-state early return.
 *
 * @complexity Time/space: O(n) in page count.
 */
export function buildPageRowMenuHandleMap(pages: AdminPost[] | null): Map<string, string> {
  if (!pages) return new Map();
  const handles = buildAgentListHandles(
    "pages-row",
    pages.map((page) => page.id),
  );
  return new Map(pages.map((page, index) => [page.id, handles[index]!]));
}

/** The callbacks a Theme Page row's menu needs. Passed in rather than imported, same reasoning as
 *  {@link PageRowMenuHandlers} above — in particular, `onEdit` takes a bare `pageId` rather than
 *  building the Theme Studio href itself, so this module stays free of navigation: the caller
 *  (`ThemePagesTab.tsx`) already holds the narrowed, non-null `themeId` `themeStudioHref` needs, and
 *  is the one place that calls it. */
export interface ThemePageRowMenuHandlers {
  onOpenDetails: (pageId: string) => void;
  onEdit: (pageId: string) => void;
}

/**
 * The row-action menu for one Theme Page row — pulled out of `ThemePagesTab.tsx`'s `DataTable`
 * cell for the same reason {@link pageRowMenuItems} was: a claim worth a test, which it cannot have
 * while it is a closure inside a table cell reachable only by rendering and opening a popover.
 *
 * A theme page has no `PostRecord` behind it (see `Pages.tsx`'s own header on this tab's history),
 * so there is nothing here to disable or delete — just `Details` (the row's full facts, opened in
 * `ThemePageDetailsModal.tsx`) and `Edit` (the same Theme Studio destination the table's own Theme
 * Studio column links to, listed directly under `Details` per the 2026-08-31 owner request that
 * moved it here from the modal's own footer — see `ThemePageDetailsModal.tsx`'s own header, PART 3,
 * for that history). Kept as its own function (rather than a bare inline array at the call site) so
 * a future third action lands here, not as a second ad hoc array shape.
 *
 * Takes an already-bound {@link Translate} rather than a raw `locale`, unlike {@link pageRowMenuItems}
 * — `ThemePagesTab.tsx`'s own helpers (`themePagePublishState`, `lockedPublishReason`, …) all take
 * `t: Translate` already, and this row menu is built inside that same component, so matching ITS
 * established convention avoids threading a second, redundant `locale` value through the same tree.
 *
 * @complexity O(1) — exactly two entries, no iteration.
 */
export function themePageRowMenuItems(row: ThemePageRow, handlers: ThemePageRowMenuHandlers, t: Translate): RowMenuItem[] {
  return [
    { key: "details", label: t("Details"), onSelect: () => handlers.onOpenDetails(row.pageId) },
    { key: "edit", label: t("Edit"), onSelect: () => handlers.onEdit(row.pageId) },
  ];
}

/** What `usePageEditor`'s `save` sends to the two write routes, and whether the HTML route applies
 *  at all — see `use-page-editor.hooks.ts`'s own `save` for the full "why two routes" reasoning, and
 *  {@link pageAcceptsHtmlBody} for exactly when `updatePageHtml` is allowed to fire (`updatePost`
 *  needs a round-tripped `bodyJson` for every Page it does NOT fire for, since that field is
 *  meaningless once an html row exists). */
export interface PageSavePlan {
  canSaveHtml: boolean;
  statusToWrite: "draft" | "published";
  updatePostPayload: {
    title: string;
    slug: string;
    status: "draft" | "published";
    templateChoice: string | null;
    bodyJson?: Record<string, unknown>;
    /** The optimistic-concurrency basis — the `version` this editor loaded, NOT a writable field.
     *  The server compares it and answers `409 VERSION_CONFLICT` when a newer save has superseded
     *  it. See {@link buildPageSavePlan} for why this write, not the HTML one, carries it. */
    expectedVersion: number;
  };
}

/** The subset of a loaded `AdminPost` {@link pageAcceptsHtmlBody} actually reads — kept narrow
 *  rather than importing the full `AdminPost` type, so a test can pass a bare literal. Field types
 *  mirror `AdminPost`'s own exactly (`bodyFormat` optional, `bodyJson` a plain record) so a real
 *  `AdminPost` is always assignable here without a cast. */
export interface SavablePage {
  bodyFormat?: "doc" | "html";
  bodyJson: Record<string, unknown>;
}

/** {@link SavablePage} plus the row's `version` — the optimistic-concurrency basis both
 *  {@link buildPageSavePlan} and {@link buildPageAutosaveDraft} capture. Separate from
 *  {@link SavablePage} because {@link pageAcceptsHtmlBody} genuinely does not need it and should
 *  not force a caller to supply one. */
export interface VersionedSavablePage extends SavablePage {
  version: number;
}

/** Whether `bodyJson` holds an actual authored Tiptap document, as opposed to the empty
 *  `DEFAULT_BODY_JSON` (`{ type: "doc", content: [] }`) every `createPost` row is born with
 *  (`apps/website/src/features/post/post.ts`). Deliberately conservative: ANY non-empty `content`
 *  array counts as real content, including a single empty paragraph, because the only thing this
 *  answer gates is whether we are willing to DESTROY that document — and the cost of being wrong in
 *  the cautious direction is a refusal the operator is told about, while the cost of being wrong in
 *  the other direction is silent data loss. An absent/non-array `content` is treated as empty: it is
 *  not a document this editor could lose anything from. */
function hasAuthoredDocument(bodyJson: Record<string, unknown>): boolean {
  const content = bodyJson.content;
  return Array.isArray(content) && content.length > 0;
}

/**
 * Whether this editor's HTML working copy is a body it may actually write — the single predicate
 * behind `save`'s `updatePageHtml` call, `contentDirty`'s body comparison, and the standing-draft
 * autosave's format, so those three cannot disagree about what the operator is editing.
 *
 * **An already-`html` Page: always.** That is the original, unchanged rule.
 *
 * **A `doc`-format Page: only when the operator authored non-empty HTML into a Page that has no
 * Tiptap document to lose.** This is the 2026-09-06 fix for "the Pages editor cannot write HTML into
 * a newly created page": `New Page` (`use-pages.hooks.ts`'s `createPage`) goes through `createPost`,
 * which forces `bodyFormat: "doc"` by construction (ADR-056 CIC-3 — `CreatePostInput` has no
 * `bodyFormat` field at all), while `PageEditor.tsx` offers that page an HTML textarea and a GrapesJS
 * canvas regardless of format. A flat `bodyFormat === "html"` test therefore made every keystroke of
 * hand-authored markup unsavable through the product, which is why operators had to bypass the
 * editor and `PUT /pages/:id/html` by hand.
 *
 * **The two guards are what keep the F01 data-loss fix intact** (see `use-page-editor.unit.test.ts`'s
 * own file header): `updatePageHtml`'s first call on a doc-format row converts it and DROPS
 * `body_json` (`routes/admin/pages/update-html.ts`). `html !== ""` means an ordinary Save or Publish
 * that never touched the body still takes the metadata-only path — the editor loads `html` as `""`
 * for a doc-format Page, so an empty working copy is "nothing was authored", never "the operator
 * cleared it". {@link hasAuthoredDocument} means a legacy Page with a real Tiptap body is never
 * converted at all, even if markup IS typed over it; that operator gets
 * {@link pageSaveSuccessMessage}'s "can't be edited here yet" refusal instead of a blanked page.
 *
 * @complexity Time O(1), space O(1) — one property read and one length check.
 */
export function pageAcceptsHtmlBody(page: SavablePage, html: string): boolean {
  if (page.bodyFormat === "html") return true;
  return html !== "" && !hasAuthoredDocument(page.bodyJson);
}

/**
 * `save`'s own decision, pulled out to a top-level pure function per the 2026-08-12
 * complexity-ceiling pass: what to send `updatePost`, and whether `updatePageHtml` fires at all.
 * `save` itself keeps only the two `await`s, the `setState` calls, and the try/catch/finally — the
 * genuinely effectful part that has to stay.
 *
 * `form.html` is the working copy, not the saved body: {@link pageAcceptsHtmlBody} needs it to tell
 * "the operator authored markup into a brand-new page" apart from "an ordinary metadata save on a
 * page whose body this editor cannot render" — see that function's own doc.
 *
 * @complexity Time/space: O(1).
 */
export function buildPageSavePlan(
  page: VersionedSavablePage,
  form: { title: string; slug: string; status: "draft" | "published"; templateChoice: string | null; html: string },
  nextStatus?: "draft" | "published"
): PageSavePlan {
  const canSaveHtml = pageAcceptsHtmlBody(page, form.html);
  const statusToWrite = nextStatus ?? form.status;
  return {
    canSaveHtml,
    statusToWrite,
    updatePostPayload: {
      title: form.title,
      slug: form.slug,
      status: statusToWrite,
      templateChoice: form.templateChoice,
      // The basis `save` guards the WHOLE save on. `updatePost` is the only one of the two write
      // routes that offers compare-and-set against a client-supplied version: `PUT /pages/:id/html`
      // reads the row and writes it back inside one request (`routes/admin/pages/update-html.ts`),
      // so the version it conditions on is one it captured microseconds earlier and can never be
      // the version THIS editor loaded. That is why `save` now writes metadata first and only
      // reaches the body once this guard has passed — see `save`'s own doc.
      expectedVersion: page.version,
      ...(canSaveHtml ? {} : { bodyJson: page.bodyJson }),
    },
  };
}

/**
 * What to send `putAutosave` for the CURRENT working copy — same {@link pageAcceptsHtmlBody} split
 * a real Save makes, so a parked draft can never be a format the Save that follows it would refuse.
 * A Page whose body this editor cannot write round-trips `bodyJson` unchanged instead — the same
 * inert-but-required placeholder that Save already sends for that case.
 *
 * @complexity Time/space: O(1).
 */
export function buildPageAutosaveDraft(
  page: VersionedSavablePage,
  form: { title: string; slug: string; html: string }
): StandingDraftAutosaveInput {
  if (pageAcceptsHtmlBody(page, form.html)) {
    return { bodyFormat: "html", bodyHtml: form.html, title: form.title, slug: form.slug, baseVersion: page.version };
  }
  return { bodyFormat: "doc", bodyJson: page.bodyJson, title: form.title, slug: form.slug, baseVersion: page.version };
}

/** Whether a recovered standing draft was captured before a real Save/Publish since superseded it —
 *  see `PostRepoPort.writeAutosave`'s own server-side doc for why `baseVersion` is the signal.
 *  Drives the recovery banner's "from N minutes ago" vs "from before a newer save" wording. */
export function isAutosaveDraftStale(draftBaseVersion: number, currentVersion: number): boolean {
  return draftBaseVersion !== currentVersion;
}

/** The recovery banner's own message — pulled out of `PageEditor.tsx` so the component stays markup
 *  only (`use-page-editor.hooks.ts`'s file header's own rule). `nowMs` is threaded through rather
 *  than read internally, same reasoning `formatRelativeMinutesAgo` itself documents. */
export function pageAutosaveBannerMessage(savedAt: string, nowMs: number, stale: boolean): string {
  const when = formatRelativeMinutesAgo(savedAt, nowMs);
  return stale ? `Unsaved changes from before a newer save (captured ${when})` : `Unsaved changes from ${when}`;
}

/**
 * The stale-basis notice's own message — the BACKGROUND-autosave counterpart of the recovery
 * banner's {@link pageAutosaveBannerMessage} just above, and the reason `staleBasis` exists on the
 * shared autosave hook at all. Kept feature-local and character-identical to
 * `features/posts/rules.ts`'s `postAutosaveStaleBasisMessage`, the same "no cross-feature import"
 * boundary {@link isAutosaveDraftStale} already documents for itself.
 *
 * Says the four things an operator cannot infer from a screen that otherwise looks completely
 * normal: that someone else saved, that autosaving has consequently STOPPED (a running editor that
 * silently persists nothing is the entire defect), that their work is unsaved but still in front of
 * them, and what actually resumes autosaving.
 *
 * Deliberately does NOT promise that the text is recoverable after a reload. The hook does mirror a
 * refused draft into browser storage (`lib/standing-draft-local-backup.ts`), but that mirror is
 * best-effort — `localStorage` throws outright in some privacy modes — and it is offered back only
 * when the server has nothing of its own parked for the entry. "Copy anything you want to keep
 * first" is advice that is never wrong; a promise of recovery would be one this code cannot keep.
 *
 * @complexity Time/space: O(1).
 */
export function pageAutosaveStaleBasisMessage(staleBasis: StandingDraftStaleBasis): string {
  return (
    `Someone else saved this while you were editing — you were working from version ${staleBasis.baseVersion}, ` +
    "so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are " +
    "still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want " +
    "to keep first."
  );
}

/**
 * The server's machine-readable `code` for "the version you were editing has been superseded"
 * (`server/inbound/admin-http/routes/posts/update.ts`'s `sendPostUpdateError`). Named here rather
 * than string-matched at the call site because that route returns TWO different 409s from the same
 * `PostConflictError` hierarchy: a slug-uniqueness collision (fix the slug and resend) and this one
 * (do NOT resend — resending is what erases the other operator's work). Only this one carries a
 * `code`, which is exactly what makes them tellable apart.
 *
 * Feature-local and character-identical to `features/posts/rules.ts`'s `POST_VERSION_CONFLICT_CODE`
 * — the same no-cross-feature-import boundary {@link isAutosaveDraftStale} already documents. Pages
 * and Posts share one server route (`PUT /posts/:id`, kind-blind), so the two constants describe the
 * same wire value on purpose.
 */
export const PAGE_VERSION_CONFLICT_CODE = "VERSION_CONFLICT";

/** A rejected save whose basis version had already been superseded — {@link readPageVersionConflict}'s
 *  output, and the editor's own conflict state. Mirrors `posts/rules.ts`'s `PostSaveConflict`. */
export interface PageSaveConflict {
  /** The version the editor believed it was editing. `null` only if the server omitted it. */
  expectedVersion: number | null;
  /** The version actually stored now — what the other operator's save produced. `null` only if the
   *  server omitted it. */
  currentVersion: number | null;
  /** The `nextStatus` the rejected save was attempting, carried so an explicit retry re-runs the
   *  SAME intent. Without it a rejected Publish would silently retry as an ordinary draft save. */
  attemptedStatus: "draft" | "published" | undefined;
}

/**
 * Classifies a caught save error: the version conflict, or `null` for everything else (including
 * the slug-uniqueness 409, which is the same status from the same error class and must NOT take
 * this branch — that is the trap this function exists to close).
 *
 * Reads both versions out of the response `details` rather than parsing the message prose, and
 * tolerates their absence (`null`) rather than throwing: an older server that returns the code
 * without the detail bag must still produce a conflict the editor reacts to, since misreading a
 * conflict as an ordinary error is what loses an operator's work.
 *
 * @complexity Time/space: O(1).
 */
export function readPageVersionConflict(
  e: unknown,
  attemptedStatus: "draft" | "published" | undefined
): PageSaveConflict | null {
  if (!(e instanceof ApiError) || e.status !== 409 || e.code !== PAGE_VERSION_CONFLICT_CODE) return null;
  const details = (e.body?.details ?? {}) as Record<string, unknown>;
  return {
    expectedVersion: typeof details.expectedVersion === "number" ? details.expectedVersion : null,
    currentVersion: typeof details.currentVersion === "number" ? details.currentVersion : null,
    attemptedStatus,
  };
}

/**
 * The conflict banner's own message. NOT run through `t()`, for the same reason
 * {@link pageAutosaveStaleBasisMessage} just above is not — it interpolates two runtime values.
 *
 * States the two things an operator has to know and cannot infer: that their work was NOT saved but
 * is still in front of them, and that saving again overwrites the other person rather than merging.
 * Deliberately does not promise a merge, a diff, or a way to see what changed — none of those exist
 * here, and the recovery this screen genuinely offers is "your text is still in the editor".
 *
 * @complexity Time/space: O(1).
 */
export function pageVersionConflictMessage(conflict: PageSaveConflict): string {
  const basis = conflict.expectedVersion === null ? "the version you loaded" : `version ${conflict.expectedVersion}`;
  const current = conflict.currentVersion === null ? "a newer version" : `version ${conflict.currentVersion}`;
  return (
    `Someone else saved this while you were editing — you were working from ${basis}, and ${current} is now stored. ` +
    "Your changes were NOT saved, and are still here in the editor. Saving again will replace their version."
  );
}

/** The save-success message — the one piece of copy in `save` that depends on `canSaveHtml`, split
 *  out alongside {@link buildPageSavePlan} for the same reason. `t`/`locale` are threaded through
 *  rather than imported, matching every other pure function in this module. */
export function pageSaveSuccessMessage(t: (locale: string, key: string) => string, locale: string, canSaveHtml: boolean): string {
  return canSaveHtml
    ? t(locale, "Saved")
    : t(locale, "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.");
}

/** The exact English copy {@link pagePartialSaveMessage} wraps in `t()` — also the dictionary key
 *  added to `page-editor-i18n.ts`'s `PAGE_EDITOR_DICT` for every locale, matching this app's "the key
 *  IS the source string" convention. Kept as a separate constant (rather than inlined in the template
 *  literal below) so the two stay textually identical by construction. */
const PAGE_PARTIAL_SAVE_COPY =
  "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.";

/**
 * The banner `usePageEditor` shows when a Page's metadata write landed but its body write then
 * failed (H1, 2026-09-20) — see `use-page-editor.hooks.ts`'s `PageBodyWriteError` and `writePage` for
 * why the two writes can now part ways instead of one opaque failure. Appends the underlying reason
 * in parentheses, the same "state what happened, then why" shape {@link pageVersionConflictMessage}
 * already uses, falling back to the generic "failed to save page" copy for a non-`Error` rejection —
 * the same fallback `applySaveFailure`'s own generic branch already uses for that case.
 *
 * @complexity Time/space: O(1).
 */
export function pagePartialSaveMessage(t: (locale: string, key: string) => string, locale: string, reason: unknown): string {
  const why = reason instanceof Error && reason.message ? reason.message : t(locale, "failed to save page");
  return `${t(locale, PAGE_PARTIAL_SAVE_COPY)} (${why})`;
}

/**
 * Which surface the editor's main pane shows, as a discriminated value rather than a chain of
 * nested ternaries inside `PageEditor.tsx`'s JSX (2026-09-06 complexity-ceiling pass — that chain
 * was 6 of `PageEditor`'s 10 cognitive-complexity points against a ceiling of 9, and tripped
 * `sonarjs/no-nested-conditional` twice on top of it).
 *
 * The `interactive` case CARRIES the resolved {@link CanvasStyling} rather than leaving the caller
 * to re-narrow `ThemeCanvasStylingState` itself. That is the whole reason this returns a union
 * instead of a bare `"preview" | "html" | ...` string: the narrowing happens once, here, where
 * TypeScript can see it, so the component never needs a cast to reach `styling` — and a stringly
 * result would have forced exactly that (or a duplicated `status === "pending"` check in the view,
 * which is the tangle this replaces).
 *
 * `interactive-pending` is a real state, not a loading placeholder that could be skipped:
 * `InteractiveHtmlEditor` reads its canvas styling ONCE at mount and never reacts to a later value,
 * so mounting it before the theme's token files settle produces a permanently unstyled canvas. See
 * `PageEditorController.canvasStyling`'s own doc.
 *
 * @complexity Time/space: O(1) — three ordered checks, no iteration.
 */
export type PageEditorSurface =
  | { kind: "preview" }
  | { kind: "html" }
  | { kind: "interactive-pending" }
  | { kind: "interactive"; styling: CanvasStyling };

export function pageEditorSurface(view: PageEditorView, canvasStyling: ThemeCanvasStylingState): PageEditorSurface {
  if (view === "preview") return { kind: "preview" };
  if (view === "html") return { kind: "html" };
  if (canvasStyling.status === "pending") return { kind: "interactive-pending" };
  return { kind: "interactive", styling: canvasStyling.styling };
}

/** The pending-html preview form's `target` — see `PageEditorController.previewFormRef`. `""` before
 *  `page` loads, since `PagePreview` never renders that early. Split out of `usePageEditor` under the
 *  complexity ceiling. */
export function pagePreviewFormTarget(page: AdminPost | null): string {
  return page ? `page-preview-pending-${page.id}` : "";
}

/**
 * The working copy's editable HTML for a loaded row — exactly the mount effect's own
 * `post.bodyFormat === "html" ? (post.bodyHtml ?? "") : ""` rule, lifted out so
 * `applyExternalPage` (an assistant write landing while the editor is open) can seed the SAME
 * initial value the mount effect does, rather than duplicating the ternary at a second call site.
 * A doc-format row has no editable HTML here — see `pageAcceptsHtmlBody`'s own doc for why this
 * editor cannot render that body at all.
 *
 * @complexity O(1).
 */
export function pageEditableHtml(post: AdminPost): string {
  return post.bodyFormat === "html" ? (post.bodyHtml ?? "") : "";
}

/**
 * Whether a background refresh must treat the working copy as possibly holding unsaved edits — the
 * `isDirty` `usePageEditor` hands `useExternalEntryRefresh`, deliberately wider than the Save
 * button's own `dirty`.
 *
 * The Interactive tab is always "maybe": GrapesJS keeps typed text in its canvas and writes it to
 * `html` only when the operator leaves that text element (its `update` event is deferred too), so
 * `dirty` can read false while unsaved typing is on screen. A silent apply there remounts the canvas
 * and destroys that text — reproduced in a real browser 2026-09-16. On that tab the refresh shows the
 * Load latest / Keep my edits notice instead. The Preview and HTML tabs write every keystroke
 * straight to `html`, so `dirty` is exact there.
 *
 * @complexity O(1).
 */
export function pageRefreshMayHaveUnsavedEdits(input: { dirty: boolean; view: PageEditorView }): boolean {
  return input.dirty || input.view === "interactive";
}

/** The external-change notice's own message — plain English, not run through `t()`, matching
 *  {@link pageVersionConflictMessage} and {@link pageAutosaveStaleBasisMessage} just above:
 *  `PageEditor.tsx`'s markup is outside the pages dictionary's declared scope (`pages-i18n.ts`'s own
 *  header). Shown when a newer version lands while the editor has unsaved edits — see
 *  `use-external-entry-refresh.hooks.ts` for the clean/dirty decision this banner is the dirty half
 *  of. */
export const PAGE_EXTERNAL_CHANGE_MESSAGE =
  "Changed outside the editor, probably by the assistant. Loading the latest version discards your unsaved edits.";

/** The Page editor's `useDirtyGuard` baseline: the loaded row's title/slug/status plus the saved html
 *  and template choice. `null` before `page` loads, which the guard reads as "nothing is dirty yet".
 *  Split out of `usePageEditor` under the complexity ceiling. */
export function pageDirtyGuardBaseline(
  page: AdminPost | null,
  savedHtml: string,
  savedTemplateChoice: string | null,
): { title: string; slug: string; status: AdminPost["status"]; html: string; templateChoice: string | null } | null {
  if (!page) return null;
  return { title: page.title, slug: page.slug, status: page.status, html: savedHtml, templateChoice: savedTemplateChoice };
}

// ---------------------------------------------------------------------------
// Column sort (2026-09-02) — mirrors `features/posts/rules.ts`'s own column-sort block exactly, same
// "twin screens" convention as the rest of this file (this file's own header). "My Pages" had no
// sort code at all before this pass; migrated onto `DataTable`'s own shared sort mechanism the same
// day this landed, so it never shipped its own hand-rolled dispatcher/caret/next-state logic — see
// `posts/rules.ts`'s identical section for the full rationale. Only the domain-specific pieces live
// here: each column's ascending comparator, the Updated column's non-default starting direction, and
// every column's accessible-name phrasing.
// ---------------------------------------------------------------------------

/** The Pages list's default sort on first load — Updated, newest first, matching `posts/rules.ts`'s
 *  own `DEFAULT_POST_SORT` so switching between the two screens shows a consistent starting order. */
export const DEFAULT_PAGE_SORT: DataTableSortState = { column: "updated", direction: "desc" };

/** `status` is exactly `"draft" | "published"` (`post.ts`), so plain alphabetical order already
 *  equals domain order — no custom rank table needed. Ascending-only, matching
 *  `DataTableColumnSort.compare`'s own contract: `DataTable` negates this for `"desc"`. */
export function comparePagesByTitle(a: AdminPost, b: AdminPost): number {
  return a.title.localeCompare(b.title);
}

/** @see comparePagesByTitle — same contract, compared on `slug` instead of `title`. */
export function comparePagesBySlug(a: AdminPost, b: AdminPost): number {
  return a.slug.localeCompare(b.slug);
}

/** @see comparePagesByTitle — same contract, compared on `status` instead of `title`. */
export function comparePagesByStatus(a: AdminPost, b: AdminPost): number {
  return a.status.localeCompare(b.status);
}

/**
 * Ascending order = oldest-first; `DataTable` negates it for `"desc"` (newest-first), which is also
 * this column's own starting direction (its `defaultDirection` in `Pages.tsx`'s column definition) —
 * same reasoning as `posts/rules.ts`'s `comparePostsByUpdated`. `Date.parse`, not a string compare —
 * `updatedAt` is ISO-8601 **text** with no schema guarantee against a future non-`Z` UTC-offset
 * value, which string-sorts wrong against `Z`-form values.
 */
export function comparePagesByUpdated(a: AdminPost, b: AdminPost): number {
  return Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
}

/**
 * The accessible name for a lexicographic column's (Title/Slug/Status) sort control, in every state
 * `DataTable` can ask for — mirrors `posts/rules.ts`'s `postColumnSortLabel` verbatim. `direction` is
 * `null` when a different column is currently active — `DataTable` resolves that itself.
 *
 * `columnName` is a fixed English label supplied by the caller (`Pages.tsx`), not the translated
 * header text — matching this feature's pre-existing precedent of hardcoded English regardless of
 * admin locale.
 *
 * @complexity Time/space: O(1).
 */
export function pageColumnSortLabel(columnName: string, direction: DataTableSortDirection | null): string {
  if (direction === null) return `Not sorted by ${columnName}. Activate to sort ascending.`;
  return direction === "asc"
    ? `Sorted by ${columnName}, ascending. Activate to sort descending.`
    : `Sorted by ${columnName}, descending. Activate to sort ascending.`;
}

/** Same contract as {@link pageColumnSortLabel}, phrased in the Updated column's own "newest"/
 *  "oldest" vocabulary rather than generic "ascending"/"descending" — mirrors `posts/rules.ts`'s
 *  `updatedColumnSortLabel` verbatim. */
export function updatedPageColumnSortLabel(direction: DataTableSortDirection | null): string {
  if (direction === null) return "Not sorted by updated date. Activate to sort newest first.";
  return direction === "desc"
    ? "Sorted by updated date, newest first. Activate to sort oldest first."
    : "Sorted by updated date, oldest first. Activate to sort newest first.";
}
