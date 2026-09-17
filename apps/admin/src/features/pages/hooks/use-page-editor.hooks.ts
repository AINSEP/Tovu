import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import type { AdminPost } from "@/lib/api";
import { navigate as defaultNavigate } from "@/lib/router";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@/hooks/use-content-refresh-subscription.hooks";
import { useDirtyGuard } from "@/hooks/use-dirty-guard.hooks";
import { useAgentScreenEntry } from "@/hooks/use-agent-screen-context.hooks";
import { useExternalEntryRefresh } from "@/hooks/use-external-entry-refresh.hooks";
import { useSettlementGeneration } from "@/hooks/use-settlement-generation.hooks";
import {
  useStandingDraftAutosave,
  type StandingDraftAutosaveSnapshot,
  type StandingDraftStaleBasis,
} from "@/hooks/use-standing-draft-autosave.hooks";
import { t as defaultT } from "../page-editor-i18n";
import { prettifyHtml } from "../lib/prettify-html";
import {
  buildPageAutosaveDraft,
  buildPageSavePlan,
  pageAcceptsHtmlBody,
  pageDirtyGuardBaseline,
  pageEditableHtml,
  pagePreviewFormTarget,
  pageSaveSuccessMessage,
  PAGES_RESOURCE,
  pageRefreshMayHaveUnsavedEdits,
  readPageVersionConflict,
  type PageSaveConflict,
  type PageSavePlan,
} from "../rules";
import { defaultPageEditorPort } from "./page-editor-dependencies.hooks";
import type { PageEditorPort } from "./page-editor-port.hooks";
import { defaultThemeCanvasPort } from "./theme-canvas-dependencies.hooks";
import type { ThemeCanvasPort } from "./theme-canvas-port.hooks";
import {
  resolveCanvasTemplateChoice,
  useThemeCanvasStyling,
  type ThemeCanvasStylingState,
} from "./use-theme-canvas-styling.hooks";

/**
 * @file Everything the Pages EDITOR does, so `PageEditor.tsx` is only markup.
 *
 * Same `use-<thing>.hooks.ts` convention as `use-pages.hooks.ts` beside it. Deliberately NOT shared
 * with `features/posts`' `usePostEditor`: a Post is a Tiptap document and a Page is a bespoke HTML
 * one, they are edited through different endpoints with different concurrency semantics, and the
 * only thing the two screens have in common is the header chrome.
 *
 * `port`/`navigate`/`t`/`locale` are injected — see `page-editor-port.hooks.ts` — rather than
 * reaching `lib/api`/`lib/router`/`page-editor-i18n`/`useAdminLocale()` directly, so a test can
 * describe load/save/delete outcomes against `createFakePageEditorPort` instead of stubbing global
 * `fetch`. `useWiredPageEditor` below is the zero-argument pair `PageEditor.tsx` actually mounts.
 * `useAdminLocale()` itself is called only inside `useWiredPageEditor` — its resolved `locale`
 * string is what gets injected, not the hook reference; see that function's own doc.
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
  /**
   * HTML tab's local, display-only pretty-printed copy of `html` (moved here from `PageEditor.tsx`,
   * 2026-08-11 complexity-ceiling pass — see the reformat effect below for the full "why" this used
   * to carry in that component). Reformats only on the transition INTO the HTML tab (never mid-edit,
   * never on every keystroke) so the formatter can't fight the operator's cursor, and typing here
   * writes straight through to `setHtml` too, so this is purely a display concern layered on top of
   * `html` — it can never by itself affect `dirty`.
   */
  draftHtml: string;
  setDraftHtml: (value: string) => void;
  view: PageEditorView;
  setView: (value: PageEditorView) => void;
  device: PagePreviewDevice;
  setDevice: (value: PagePreviewDevice) => void;
  /**
   * Preview fullscreen (2026-09-16) — whether the Preview tab's own pane is expanded to fill
   * `.admin-main-col` (see `PageEditor.tsx`'s `.page-preview-expanded` wrapper). The Pages-side
   * twin of `PostEditorController.previewExpanded`; see that field's own doc for the full
   * lifetime/containment reasoning this deliberately copies rather than lifts to `App.tsx` or a
   * module-level bus — a route change unmounts `PageEditor`, which unmounts this hook, which
   * discards this for free. Never persisted.
   *
   * Deliberately independent of {@link device}: expanding does NOT override the operator's chosen
   * preview width. See `PagePreview`'s own doc for why widening the pane (not widening the page)
   * is what fullscreen means here.
   */
  previewExpanded: boolean;
  /** Flips {@link previewExpanded}. A separate action rather than a setter, matching `setView`'s
   *  own shape above — the caller never needs to set it to a specific value directly. */
  togglePreviewExpanded: () => void;
  /**
   * `PagePreview`'s own frame element and its live-measured width (moved here from `PagePreview`,
   * 2026-08-11 complexity-ceiling pass — see the measuring effect below for the full "why ResizeObserver
   * instead of a guessed constant" reasoning this used to carry in that component). `PageEditor.tsx`
   * passes both straight through as props; `PagePreview` attaches `frameRef` to the element it wants
   * measured (`<div ref={frameRef}>` — React accepts a callback ref directly, same call site a
   * `RefObject` would use) and reads `paneWidth` back to compute its scale. A CALLBACK ref, not a
   * `RefObject` — see the measuring effect below for why that distinction is load-bearing here.
   */
  frameRef: (node: HTMLDivElement | null) => void;
  paneWidth: number;
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
  /**
   * The admin-only template-preview iframe's `src`, pre-built from `port.templatePreviewUrl` (a
   * synchronous URL builder, not a fetch) so `PageEditor.tsx` never imports `lib/api` just to call
   * it. `""` before `page` loads — never rendered that early, since `PageEditor.tsx` shows a loading
   * notice and mounts no preview until `page` is set, same "inert default before load" shape
   * `availableTemplates` already uses. Recomputed on every render off `page`/`templateChoice` — cheap
   * string building, not worth a `useMemo`.
   */
  templatePreviewUrl: string;
  /** DOM ref for the pending-html-preview's hidden `<form>` — owned here, not local to
   *  `PagePreview`, so the debounced auto-submit effect below can reach it. Same "hook owns the ref,
   *  view attaches it" shape `frameRef` above already uses, and the same shape
   *  `use-post-editor.hooks.ts`'s own `previewFormRef` uses for Posts — see that field's own doc for
   *  the "why here, not the view" reasoning this mirrors. */
  previewFormRef: RefObject<HTMLFormElement | null>;
  /** Stable name shared by the hidden form's `target` and the iframe it submits into. `""` before
   *  `page` loads — `PagePreview` never renders that early. */
  previewFormTarget: string;
  /**
   * What the Interactive tab's GrapesJS canvas renders the page against — the active theme's own
   * stylesheet plus its design tokens, so a page is edited looking roughly the way it publishes
   * rather than as browser-default text on white. `pending` until the theme's token files settle;
   * `PageEditor.tsx` must not mount the editor before then, because `InteractiveHtmlEditor` reads
   * its canvas styling once at mount and never reacts to a later value. See
   * `use-theme-canvas-styling.hooks.ts`.
   */
  canvasStyling: ThemeCanvasStylingState;
  save: (nextStatus?: "draft" | "published") => Promise<void>;
  /**
   * Non-null once the server has REFUSED an explicit Save/Publish because another operator's save
   * moved the row's `version` out from under this editor (2026-09-07). The caller renders it as a
   * banner offering the two things an operator can actually do — {@link saveOverwritingConflict} or
   * {@link dismissSaveConflict} — with the wording in `rules.ts`'s `pageVersionConflictMessage`.
   *
   * Distinct from {@link autosaveStaleBasis} below, which is the BACKGROUND autosave hitting the
   * same wall: this one is a save the operator pressed and watched fail.
   */
  saveConflict: PageSaveConflict | null;
  /** Re-reads the current row and re-runs the rejected save against it, replaying the original
   *  draft/publish intent. The only way past a {@link saveConflict}, and deliberately explicit: the
   *  plain Save button keeps failing until the operator chooses to replace the other version. */
  saveOverwritingConflict: () => Promise<void>;
  /** Hides the {@link saveConflict} banner without writing anything. */
  dismissSaveConflict: () => void;
  remove: () => Promise<void>;
  confirmingDelete: boolean;
  setConfirmingDelete: (value: boolean) => void;
  deleting: boolean;
  /** Call before an in-app navigation the operator triggered (the back link). `true` means it's
   *  safe to proceed. `beforeunload` is wired automatically by the same `useDirtyGuard` call this
   *  reads off — see `use-dirty-guard.hooks.ts`. Audit finding (2026-08-01): unlike `PostEditor`,
   *  this screen had NO unsaved-work guard of any kind until now — fixed alongside standing-draft
   *  autosave since both exist to protect the same at-risk work. */
  confirmLeave: () => boolean;
  /**
   * Standing-draft autosave (2026-09-06) — non-null once the mount-time recovery check finds a
   * draft parked from a previous session. Never auto-applied; `PageEditor.tsx` renders an explicit
   * "restore or discard" banner and calls {@link restoreRecoveredDraft}/{@link discardRecoveredDraft}
   * on the operator's own action.
   */
  recoverableDraft: StandingDraftAutosaveSnapshot | null;
  /** Applies the recovered draft into the working copy (title/slug/html) and dismisses the banner.
   *  Does NOT itself tell the server anything — the restored edit re-enters the normal autosave/Save
   *  flow from here, the same as any other in-progress edit. */
  restoreRecoveredDraft: () => void;
  /** Discards the recovered draft server-side and dismisses the banner, without applying it. */
  discardRecoveredDraft: () => Promise<void>;
  /**
   * Standing-draft autosave — non-null once the server has REFUSED a background write for this page
   * because another operator's save moved the row's `version` out from under this editor. Distinct
   * from {@link recoverableDraft}, which is work found parked from a previous session: this is the
   * session happening right now, and while it is set nothing the operator types is being persisted
   * anywhere the server can see.
   *
   * Surfaced so `PageEditor.tsx` can say so on screen. That is the whole point of passing it
   * through: `useStandingDraftAutosave` has recorded this since commit `a60e07e8`, and with no
   * editor consuming it the operator could type for an hour into a screen that looked completely
   * normal and be told nothing until they reloaded.
   *
   * Reporting it never costs the operator their text — the working copy (`title`/`slug`/`html`) is
   * not touched on this path, by this hook or by the shared one.
   */
  autosaveStaleBasis: StandingDraftStaleBasis | null;
  /**
   * Content refresh (2026-09-16) — non-null only while an assistant tool (`pages_write_html` /
   * `pages_write_region`) has written a newer version of this page AND the editor may have unsaved
   * edits the operator hasn't resolved yet (on the Interactive tab that is always assumed — see
   * `pageRefreshMayHaveUnsavedEdits`). `null` means either nothing changed, or the editor was clean
   * and already applied the change silently. See `use-external-entry-refresh.hooks.ts` for the
   * clean/dirty decision this is the dirty half of.
   */
  pendingExternalVersion: number | null;
  /** Discards the standing draft, re-reads the row, and applies it — the operator's explicit choice
   *  to throw away their unsaved edits in favor of the newer version. */
  loadExternalChange: () => Promise<void>;
  /** Hides {@link pendingExternalVersion}'s notice and silences further ones until this editor's own
   *  loaded basis version moves (a Save, Save anyway, or Load latest). */
  dismissExternalChange: () => void;
  /**
   * Bumped only when an EXTERNAL write is applied — silently, or through Load latest — never by this
   * editor's own save. The Interactive tab's remount key, so GrapesJS picks up an assistant-written
   * body without losing its canvas state on every own Save. On that tab only Load latest bumps it
   * (see `pageRefreshMayHaveUnsavedEdits`). See `PageEditorPane`'s `key={contentRevision}`.
   */
  contentRevision: number;
  /**
   * Per-tab scroll memory (2026-09-16, owner report: "when i click on HTML and Preview for the html
   * it goes back to the top. anyway not to lose position?"). `PageEditorPane` renders each surface as
   * its own root element keyed on `view` (`PageEditor.tsx`'s three-way branch), so React unmounts one
   * surface and mounts a fresh one on every tab switch — a brand-new `<textarea>`/`<iframe>` always
   * starts at `scrollTop`/`scrollY` `0`, independent of anything CSS or React state can fix on its
   * own. These three fields are that fix: the position is kept in a ref here (session-only, discarded
   * with the rest of this hook's state on navigating away — no persistence was asked for), restored
   * the instant the new DOM node mounts, and captured continuously while scrolling so the LAST
   * position before the node unmounts is always the one on file. HTML and Preview each get their own
   * ref, so switching tabs never mixes the two — syncing position BETWEEN tabs was explicitly not
   * wanted (owner, same report).
   *
   * `htmlTextareaRef` attaches to `PageEditorPane`'s `<textarea>` (`ref={htmlTextareaRef}`) and
   * restores its `scrollTop` the moment React commits the node; {@link onHtmlScroll} is wired to that
   * same textarea's native `onScroll` and keeps the ref current after that. A content refresh
   * (`contentRevision` bump) never unmounts this node — same tab, same element, `value` prop just
   * changes — so nothing here needs to re-restore for that case; the browser clamps `scrollTop` to the
   * new (possibly shorter) content on its own.
   */
  htmlTextareaRef: (node: HTMLTextAreaElement | null) => void;
  /** See {@link htmlTextareaRef}'s own doc. Wired to the HTML textarea's `onScroll`. */
  onHtmlScroll: (scrollTop: number) => void;
  /**
   * See {@link htmlTextareaRef}'s own doc — the Preview tab's counterpart. Wired to BOTH
   * `PagePreviewFrame` branches' `<iframe onLoad>`: the live-site iframe (`canShowLiveSite`) and the
   * template-preview iframe (the hidden-form POST target) each fire a fresh `load` on every mount AND
   * on every re-navigation (a content refresh re-submits the same iframe without unmounting it), which
   * is exactly the hook this needs — restoring and re-attaching a scroll listener on whichever `Window`
   * the iframe holds right now.
   *
   * The live-site iframe is cross-origin in dev (`siteUrl`'s own origin, `:3000` vs. the admin's
   * `:5173` — see `PagePreview`'s own doc). Reading or driving scroll on a foreign `Window` is a
   * browser security restriction this code cannot route around without the site itself cooperating
   * (out of scope — another agent owns `apps/website`), so that branch's position is NOT remembered;
   * the template-preview branch (same-origin through the `/api` dev-proxy) is unaffected and works
   * normally. See this function's own implementation comment for the try/catch this relies on.
   */
  onPreviewFrameLoad: (iframe: HTMLIFrameElement) => void;
}

/**
 * Applies a loaded row into the working copy AND the saved baseline — the mount effect's own
 * initialization, named out so `applyExternalPage` (an assistant write landing while the editor is
 * open, 2026-09-16) can seed the SAME fields from the SAME row shape rather than a second,
 * independently-maintained copy of this list drifting from it over time.
 *
 * UNLIKE `usePostEditor`'s equivalent, no "default to the theme's first template" here — `null` is a
 * Page's normal, fully-working state (render its own body), not an absence-of-decision that needs
 * papering over. `pageEditableHtml` (`rules.ts`) is the single place that decides whether `bodyHtml`
 * is real editable content for this row.
 *
 * @complexity Time/space: O(1).
 */
function applyLoadedPage(
  post: AdminPost,
  setters: {
    setPage: (page: AdminPost) => void;
    setTitle: (value: string) => void;
    setSlug: (value: string) => void;
    setStatus: (value: "draft" | "published") => void;
    setTemplateChoice: (value: string | null) => void;
    setSavedTemplateChoice: (value: string | null) => void;
    setHtml: (value: string) => void;
    setSavedHtml: (value: string) => void;
  },
): void {
  setters.setPage(post);
  setters.setTitle(post.title);
  setters.setSlug(post.slug);
  setters.setStatus(post.status);
  setters.setTemplateChoice(post.templateChoice ?? null);
  setters.setSavedTemplateChoice(post.templateChoice ?? null);
  const body = pageEditableHtml(post);
  setters.setHtml(body);
  setters.setSavedHtml(body);
}

/** `contentDirty`'s own computation, named out of `usePageEditor`'s body purely to keep that
 *  hook's own cyclomatic complexity under the gate — every `&&`/`||` in a boolean expression is
 *  its own branch. Same title/slug/status/body comparison, same behavior.
 *  See `PageEditorController.contentDirty`'s own doc for what this decides.
 *
 *  The body arm asks `pageAcceptsHtmlBody` rather than testing `bodyFormat` itself, so this agrees
 *  with `save` by construction: HTML typed into a brand-new (`doc`-format, empty-document) Page IS
 *  savable, and therefore has to count as dirty — otherwise the Save button never shows its pending
 *  dot, `useDirtyGuard` lets a navigate-away discard the work without asking, and the standing-draft
 *  autosave below never fires at all. */
function computeContentDirty(
  page: AdminPost | null,
  draft: { title: string; slug: string; status: "draft" | "published"; html: string; savedHtml: string },
): boolean {
  if (page === null) return false;
  return (
    draft.title !== page.title ||
    draft.slug !== page.slug ||
    draft.status !== page.status ||
    (pageAcceptsHtmlBody(page, draft.html) && draft.html !== draft.savedHtml)
  );
}

/**
 * Pending-html preview's debounced auto-submit (2026-09-09) — Pages' own version of
 * `use-post-editor.hooks.ts`'s `schedulePendingContentPreviewSubmit` (same file, same "hook owns
 * the effect, not the view" reasoning that function's own doc explains). A form submit is a full
 * iframe navigation, so firing one per keystroke would thrash the iframe; trailing-only, 500ms.
 * `clearTimeout` on cleanup is the complete cancellation, same as that function's.
 *
 * No `=== null`/`bodyJson`-shaped guard is needed here unlike the Posts version: `html` is a plain
 * string, always defined once `page` has loaded — the only state `PagePreview` ever mounts in (see
 * `PageEditor.tsx`'s own `if (!page) return <div className="notice">...` guard) — so `active` alone
 * decides whether to schedule at all.
 *
 * @complexity Time/space: O(1) — one timer, no data copying.
 */
function schedulePendingHtmlPreviewSubmit(input: { active: boolean; formRef: RefObject<HTMLFormElement | null> }): () => void {
  if (!input.active) return () => {};
  const timer = setTimeout(() => {
    input.formRef.current?.submit();
  }, 500);
  return () => clearTimeout(timer);
}

/** `save`'s own "apply a successful write" step, named out of `save`'s body for the same
 *  complexity-ceiling reason {@link computeContentDirty} above documents (2026-09-05
 *  stale-settlement sweep: adding the generation guard pushed `save` over the gate). Called only
 *  once `save` has confirmed this call's generation is still current — see `save`'s own
 *  `settlement` doc — so every branch here runs unconditionally once reached. */
function applySavedPage(
  updated: AdminPost,
  form: { templateChoice: string | null; html: string; nextStatus?: "draft" | "published" },
  canSaveHtml: boolean,
  setters: {
    setPage: (page: AdminPost) => void;
    setSlug: (slug: string) => void;
    setStatus: (status: "draft" | "published") => void;
    setSavedTemplateChoice: (value: string | null) => void;
    setSavedHtml: (value: string) => void;
    setMessage: (value: string) => void;
  },
  t: (locale: string, key: string) => string,
  locale: string,
): void {
  setters.setPage(updated);
  setters.setSlug(updated.slug);
  setters.setStatus(updated.status);
  setters.setSavedTemplateChoice(form.templateChoice);
  if (canSaveHtml) setters.setSavedHtml(form.html);
  if (form.nextStatus) setters.setStatus(form.nextStatus);
  setters.setMessage(pageSaveSuccessMessage(t, locale, canSaveHtml));
}

/**
 * The two writes a Page save makes, in the order that makes the version guard real.
 *
 * **Metadata first, body second — reversed 2026-09-07, deliberately.** It used to be body first,
 * on the reasoning that "if the metadata write fails on a slug conflict, the operator's actual
 * content is already safe". That ordering is exactly what made a concurrency guard impossible:
 * `PUT /pages/:id/html` (`routes/admin/pages/update-html.ts`) reads the row and writes it back
 * inside ONE request, so the version its compare-and-set conditions on is one it captured
 * microseconds earlier — never the version this editor loaded — and it bumps `version` on the way
 * through. Writing it first therefore both clobbered the other operator's body AND invalidated the
 * basis the metadata write was about to claim. `updatePost` is the only one of the two that accepts
 * a client-supplied `expectedVersion`, so it has to go first for its 409 to mean anything.
 *
 * What the old ordering bought is not lost: the working copy is still in the editor either way, and
 * since 2026-09-06 a standing draft is parked server-side (`useStandingDraftAutosave`) — neither of
 * which existed when "body first" was chosen.
 *
 * @returns The final stored row: the body write's response when it fired, the metadata write's
 *   otherwise. Reading the earlier one would hand the caller a `version` already one behind.
 * @complexity Time O(1) plus one or two requests; space O(1).
 */
async function writePage(
  port: PageEditorPort,
  pageId: string,
  plan: PageSavePlan,
  html: string,
): Promise<AdminPost> {
  const { post: updated } = await port.updatePost({ id: pageId }, plan.updatePostPayload);
  if (!plan.canSaveHtml) return updated;
  const { post: withBody } = await port.updatePageHtml(pageId, html);
  return withBody;
}

/** `runSave`'s own catch arm, named out of its body for the same complexity-ceiling reason
 *  {@link applySavedPage} above documents.
 *
 *  The version conflict is NOT folded into the generic error line. The two need opposite reactions
 *  from the operator (a slug collision or a network blip: fix it and press Save again; this:
 *  pressing Save again replaces somebody's page), and the whole point of the route's distinct `code`
 *  is that the client no longer has to guess which it got — see `readPageVersionConflict`. */
function applySaveFailure(
  e: unknown,
  attemptedStatus: "draft" | "published" | undefined,
  setters: { setSaveConflict: (value: PageSaveConflict) => void; setError: (value: string) => void },
  t: (locale: string, key: string) => string,
  locale: string,
): void {
  const conflict = readPageVersionConflict(e, attemptedStatus);
  if (conflict) {
    setters.setSaveConflict(conflict);
    return;
  }
  setters.setError(e instanceof Error ? e.message : t(locale, "failed to save page"));
}

export interface PageEditorDependencies {
  port: PageEditorPort;
  /** Separate from `port` because it reaches a different surface entirely — a theme's static asset
   *  files, not the JSON admin API. See `theme-canvas-port.hooks.ts`. */
  themeCanvasPort: ThemeCanvasPort;
  navigate: (path: string) => void;
  t: (locale: string, key: string) => string;
  locale: string;
}

/**
 * `routeSlug` names what the URL actually carries: the page's slug for an ordinary page, as read
 * from the route (see `panels.tsx`'s `/:slug` pattern) — or the page's id for the one page whose
 * slug can never be a path segment at all, the root slug `"/"` (`pageAdminPath`, `rules.ts`, is
 * what the admin app's own links now build with this choice). Either way it doubles as a legacy
 * id-based bookmark too: the server-side lookup this feeds (`getAdminPostByIdOrSlug`) tries the
 * slug FIRST and falls back to an exact id match, so an old id-based bookmark still resolves —
 * corrected 2026-09-03, this comment previously stated the two checks in the opposite order. Every
 * write below uses `page.id` (the real id from the loaded record), never `routeSlug` directly — the
 * slug in the URL can go stale if the page is renamed elsewhere, but the id it resolved to at load
 * time cannot.
 *
 * `port`/`navigate`/`t` are destructured out of `deps` once, rather than threaded as `deps.port`
 * everywhere below — they are stable references in production (`useWiredPageEditor` always passes
 * the same module-level singletons; only `locale` actually varies across renders), so `useCallback`
 * dependency arrays can name them directly without an unstable-identity hazard, matching
 * `redirects-dependencies.hooks.ts`'s "confirmed safe to leave port unmemoized" precedent.
 */
export function usePageEditor(routeSlug: string, deps: PageEditorDependencies): PageEditorController {
  const { port, themeCanvasPort, navigate, t, locale } = deps;
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
  // The active theme, captured off the same presentation-settings load the picker already does — the
  // Interactive tab's canvas needs both to find that theme's stylesheet and token files. `null`
  // until then, which `useThemeCanvasStyling` reads as "keep waiting", never as "no theme".
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [activeThemeApiVersion, setActiveThemeApiVersion] = useState<2 | undefined>(undefined);
  const [html, setHtml] = useState("");
  const [savedHtml, setSavedHtml] = useState("");
  const [view, setView] = useState<PageEditorView>("preview");
  const [device, setDevice] = useState<PagePreviewDevice>("desktop");
  // Preview fullscreen (2026-09-16) — see `PageEditorController.previewExpanded`'s own doc for why
  // this lives here instead of `App.tsx` or a bus. `false` by default: opening a Page must never
  // itself land on the expanded surface, even though `view` DOES default to "preview" here (unlike
  // Posts, which open on "edit").
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // A save the server refused because this editor's basis version had already been superseded
  // (2026-09-07). Distinct from `error`: `error` means "try again", this means "trying again
  // replaces somebody else's page" — see `applySaveFailure`.
  const [saveConflict, setSaveConflict] = useState<PageSaveConflict | null>(null);
  // Stale-settlement guard for `save()` (2026-09-05 sweep, extracted into `useSettlementGeneration`
  // 2026-09-06) — `saving` (state) already disables both the Save and Publish buttons, but that
  // alone cannot stop an overlapping second call (a same-tick double-invocation, or any caller
  // reaching `save()` directly rather than through those buttons) from applying a now-stale
  // response after a more-recent call already settled: whichever `port.updatePost()` call settled
  // last would win, regardless of which one was issued last. Mirrors `use-post-editor.hooks.ts`'s
  // own `settlement` (commit `42c6a534`), the reference this pattern was modelled on.
  const settlement = useSettlementGeneration();

  // Standing-draft autosave (2026-09-06) — see `use-standing-draft-autosave.hooks.ts`'s own header
  // for the ordering guarantee `clearStandingDraft` relies on. `entryId`/`enabled` both key off
  // `page` rather than `routeSlug`: the recovery check needs the row's REAL id (routeSlug can be a
  // stale/legacy bookmark), and must not run at all before the id is known.
  const autosave = useStandingDraftAutosave({ port, entryId: page?.id ?? null, enabled: page !== null });

  // `t`/`locale` are deliberately not listed — that gap predates this conversion (the effect only
  // ever ran off `routeSlug` even when `locale` came from `useAdminLocale()` directly) and fixing
  // it is a behavior change outside this refactor's scope. `port` IS added: unlike the old `api`
  // import, it is now a function-scoped value ESLint's exhaustive-deps rule can see, and it is
  // referentially stable in production (`useWiredPageEditor` always passes the same module-level
  // singleton), so adding it changes nothing about when this effect re-runs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `t`/`locale` gap predates this conversion, out of scope here; `port` is referentially stable in production.
  useEffect(() => {
    let cancelled = false;
    // Loaded together, same reasoning as `usePostEditor`'s identical `Promise.all` — the picker
    // needs `activeThemeTemplates` in hand before it can render anything meaningful, and a fast
    // page-load racing a slow presentation-settings load would otherwise flash an empty picker.
    Promise.all([port.getPage(routeSlug), port.getPresentation()])
      .then(([{ post }, { activeThemeTemplates, activeThemeId: themeId, activeThemeApiVersion: themeApiVersion }]) => {
        if (cancelled) return;
        setAvailableTemplates(activeThemeTemplates);
        setActiveThemeId(themeId);
        setActiveThemeApiVersion(themeApiVersion);
        applyLoadedPage(post, { setPage, setTitle, setSlug, setStatus, setTemplateChoice, setSavedTemplateChoice, setHtml, setSavedHtml });
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t(locale, "failed to load page"));
      });
    return () => {
      cancelled = true;
    };
  }, [routeSlug, port]);

  // HTML tab pretty-printing (owner-reported regression, 2026-08-11 — verified nothing formatted this
  // view before either; see `lib/prettify-html.ts`'s file header). `draftHtml` is a LOCAL, display-only
  // copy of `html`: merely switching to the HTML tab reformats and shows it here, but never calls
  // `setHtml` itself, so `dirty` (computed above from `html !== savedHtml`) stays exactly what it was
  // before the operator looked at this tab — a display concern must never by itself mark the page as
  // having unsaved changes. `PageEditor.tsx`'s textarea writes straight through to BOTH `draftHtml` and
  // the real `setHtml` on every keystroke, unchanged from how the textarea always worked, so the only
  // way the prettified whitespace becomes part of the saved page is if the operator actually edits on
  // top of it. `prevViewRef` is what makes this fire only on the TRANSITION into the HTML tab, never on
  // every render while already on it — reformatting mid-edit would fight the operator's cursor position.
  const [draftHtml, setDraftHtml] = useState(() => prettifyHtml(html));

  // Per-tab scroll memory (2026-09-16) — see `PageEditorController.htmlTextareaRef`'s own doc for the
  // full "why a ref, why here" reasoning. A `useRef`, not `useState`: a scroll position changing must
  // never itself trigger a re-render, only be there the next time the tab mounts.
  const htmlScrollTopRef = useRef(0);
  const htmlTextareaRef = useCallback((node: HTMLTextAreaElement | null) => {
    if (node) node.scrollTop = htmlScrollTopRef.current;
  }, []);
  const onHtmlScroll = useCallback((scrollTop: number) => {
    htmlScrollTopRef.current = scrollTop;
  }, []);

  // Content refresh (2026-09-16) — bumped only when an assistant write is applied (silently, or via
  // Load latest; never by this editor's own save), so the Interactive tab can remount and pick up the new body without
  // losing GrapesJS's canvas state on every own Save (a `page.version` key would do that too, since
  // an own save bumps it exactly the same way). See `PageEditorController.contentRevision`.
  const [contentRevision, setContentRevision] = useState(0);

  /**
   * The shared refresh hook's `applyLatest` — replaces the working copy AND the saved baseline with
   * an externally-written row, the CLEAN-editor half of `use-external-entry-refresh.hooks.ts`'s
   * decision (the dirty half surfaces `pendingExternalVersion` instead and touches nothing here).
   * Reuses {@link applyLoadedPage} so this seeds the exact same fields the mount effect does, then
   * layers on the two things unique to a live re-apply: the HTML tab's `draftHtml` (only re-seeded
   * on tab-switch otherwise — see that effect's own doc) and clearing any stale `saveConflict`,
   * since the version it was raised against is no longer the one loaded.
   *
   * All setters passed in are `useState` setters — referentially stable across renders — so this can
   * safely close over them with an empty dependency array.
   */
  const applyExternalPage = useCallback((fresh: AdminPost) => {
    applyLoadedPage(fresh, { setPage, setTitle, setSlug, setStatus, setTemplateChoice, setSavedTemplateChoice, setHtml, setSavedHtml });
    setDraftHtml(prettifyHtml(pageEditableHtml(fresh)));
    setSaveConflict(null);
    setContentRevision((n) => n + 1);
  }, []);

  const prevViewRef = useRef(view);
  useEffect(() => {
    if (view === "html" && prevViewRef.current !== "html") {
      setDraftHtml(prettifyHtml(html));
    }
    prevViewRef.current = view;
  }, [view, html]);

  // Leaving the Preview tab collapses (2026-09-16) — the expanded surface only ever shows the
  // preview, so any other view being selected means the operator is done with it. Returning to
  // Preview later therefore always starts collapsed rather than resuming a state they did not ask
  // for this time. Mirrors `use-post-editor.hooks.ts`'s identical effect.
  useEffect(() => {
    if (view !== "preview") setPreviewExpanded(false);
  }, [view]);

  // Escape collapses (2026-09-16) — a raw `document.addEventListener`, not a synthetic React
  // handler, for the reasons `use-post-editor.hooks.ts`'s twin records: nothing here needs to
  // intercept a keystroke the editor itself is using, and a real listener is what a test can
  // dispatch a genuine `KeyboardEvent` against. Deliberately no `preventDefault()`/
  // `stopPropagation()` — nothing on this surface traps focus, and swallowing the event only risks
  // this repo's documented jsdom/React-delegation false-RED trap. The `.page-preview-fab` rendered
  // inside the expanded surface is the exit that always works; this is a convenience on top of it,
  // gated on `previewExpanded` so no listener is registered at all while collapsed.
  useEffect(() => {
    if (!previewExpanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewExpanded(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [previewExpanded]);

  function togglePreviewExpanded(): void {
    setPreviewExpanded((on) => !on);
  }

  // `PagePreview`'s frame element and its REAL rendered width, measured live via `ResizeObserver`
  // rather than a guessed constant — a flat `880` here would mean the scale computed once and stayed
  // frozen across a window resize, a sidebar collapse, or the assistant dock opening/closing (this is
  // the bug `ThemeExplore.tsx`'s own `ThemeExplorePreview` copied verbatim from here, then fixed live —
  // see that file's `fd26d93`). `880` survives only as the pre-measurement default so the first paint
  // still has a sane scale instead of `Infinity`/`NaN` from a zero-width ref.
  //
  // `frameNode`/`setFrameNode` is a CALLBACK ref (a piece of state plus its setter, handed to JSX as
  // `ref={setFrameNode}`), NOT a plain `useRef` — and the effect below is keyed off the NODE itself,
  // NOT `[view]`. That `useRef`-plus-`[view]` shape was this effect's ORIGINAL form, and it hid a real
  // bug: on an ordinary page load, `page` starts `null` and `PageEditor.tsx` renders only a loading
  // notice, so `PagePreview` — and the frame div `frameRef` attaches to — does not exist yet on this
  // hook's FIRST render. A `[view]`-keyed effect runs once at that first render, finds `frameRef.current`
  // still `null`, and bails out; since `view` never changes across the loading-to-loaded transition, the
  // effect never runs again for the rest of the session. The observer was simply never attached, and
  // `paneWidth` stayed frozen at the `880` fallback forever — measured live on a real page: a 1131px-wide
  // pane rendering at the `880/1280` scale factor instead of the correct `1131/1280`. A `useRef` has no
  // way to notify anything when React actually attaches a DOM node to it; a callback ref does — React
  // calls it exactly when the node mounts, however late that turns out to be — so keying the effect off
  // the node it receives (rather than some unrelated piece of state) fires it right then instead of
  // waiting for `view`, or anything else, to change first.
  //
  // This still reproduces the exact "fresh observer per mount" lifecycle the old `[view]` dependency was
  // written to preserve: `PagePreview` only renders while `view === "preview"`, so `frameNode` reverts to
  // `null` (React calls a callback ref with `null` on unmount) every time the operator tabs away, and a
  // fresh node — a fresh call to `setFrameNode`, a fresh effect run — arrives every time they tab back.
  // Keying off the node is a strict superset of keying off `view`: it reruns on every mount/unmount
  // `view` would have caught, PLUS the one case `view` could never catch — the frame's very first,
  // possibly-late, mount.
  //
  // jsdom implements no `ResizeObserver` at all (`__tests__/setup.ts`'s own comment — deliberately left
  // unstubbed, so a test can't pass without the measurement ever happening) — guarded exactly like
  // `SeeMore.hooks.tsx`'s own `typeof ResizeObserver !== "function"` check, so this still renders (at
  // the `880` default) in every existing/new unit test that doesn't stub one in.
  const [frameNode, setFrameNode] = useState<HTMLDivElement | null>(null);
  const [paneWidth, setPaneWidth] = useState(880);
  useEffect(() => {
    if (!frameNode || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setPaneWidth(entry.contentRect.width);
    });
    observer.observe(frameNode);
    return () => observer.disconnect();
  }, [frameNode]);

  /**
   * Persists the working copy against a specific basis row — the version-guarded core both
   * {@link save} and `saveOverwritingConflict` run through.
   *
   * `basis` is the row whose `version` this write claims AND whose `bodyFormat`/`bodyJson`
   * `buildPageSavePlan` reads. Threading it as a parameter rather than closing over `page` is what
   * lets the explicit-overwrite path re-run against a freshly re-read row without waiting for a
   * `setPage` to commit — the same shape `usePostEditor`'s `runSave(statusOverride, expectedVersion)`
   * uses, one step wider because a Page's save plan needs the whole row, not just its version.
   *
   * @complexity Time O(1) plus one or two requests; space O(1).
   */
  const runSave = useCallback(
    async (nextStatus: "draft" | "published" | undefined, basis: AdminPost) => {
      // Claim this call's generation BEFORE the first `await` — see `useSettlementGeneration`'s own
      // doc for why a synchronous ref bump, not `useState`, is what makes two overlapping calls each
      // see the other's claim.
      const generation = settlement.next();
      setSaving(true);
      setError(null);
      setMessage(null);
      setSaveConflict(null);
      // What to send each route, and whether `updatePageHtml` fires at all, is `buildPageSavePlan`'s
      // decision (`../rules.ts`) — see that function's own doc, and `pageAcceptsHtmlBody`'s, for the
      // full reasoning (moved there verbatim under the 2026-08-12 complexity-ceiling pass, widened
      // 2026-09-06 so a brand-new Page's hand-authored HTML is savable at all, and given the
      // optimistic-concurrency basis 2026-09-07).
      //
      // `updatePost` needs a round-tripped `bodyJson` for every Page the HTML route does NOT fire
      // for: `features/post/post.ts`'s `updatePost` requires it to be a JSON object for any Page not
      // already in `html` format. It is meaningless for an html-format row (no Tiptap document
      // exists) so the server skips the check there, but a doc-format row's `bodyJson` IS its real
      // content. This editor has no way to EDIT that document, so round-tripping the loaded value
      // unchanged satisfies the requirement without touching it — the alternative (omitting it)
      // throws "bodyJson must be a JSON object" and leaves title/slug/status stuck un-editable for
      // every doc-format Page.
      const plan = buildPageSavePlan(basis, { title, slug, status, templateChoice, html }, nextStatus);
      try {
        const updated = await writePage(port, basis.id, plan, html);
        // A newer save/publish claimed a later generation while this call was awaiting — that call
        // owns the outcome now, so this stale response must not paint over it (2026-09-05
        // stale-settlement sweep: "last-to-settle wins" rather than "last-clicked wins").
        if (!settlement.isCurrent(generation)) return;
        applySavedPage(
          updated,
          { templateChoice, html, nextStatus },
          plan.canSaveHtml,
          { setPage, setSlug, setStatus, setSavedTemplateChoice, setSavedHtml, setMessage },
          t,
          locale,
        );
        // The real content just landed — any parked standing draft is now obsolete. Not awaited:
        // this is best-effort background bookkeeping (errors are already caught inside the hook),
        // not part of what "Save succeeded" means to the operator.
        void autosave.clearStandingDraft();
      } catch (e) {
        if (!settlement.isCurrent(generation)) return;
        applySaveFailure(e, nextStatus, { setSaveConflict, setError }, t, locale);
      } finally {
        // Same generation check as the two branches above: only the call that is still current
        // should flip the shared `saving` flag back off, or an older call's own settlement could
        // briefly re-enable Save/Publish while a newer call is still in flight.
        if (settlement.isCurrent(generation)) setSaving(false);
      }
    },
    [html, title, slug, status, templateChoice, locale, port, t, settlement, autosave.clearStandingDraft]
  );

  /**
   * Persists the working copy against the version this editor loaded — see {@link runSave}.
   *
   * Save is only reachable once `page` has loaded — `PageEditor.tsx` shows a loading notice and
   * renders no Save/Publish button until then — but the guard keeps `page.id` sound without a
   * non-null assertion, and mirrors `usePostEditor`'s identical `remove` guard.
   */
  const save = useCallback(
    async (nextStatus?: "draft" | "published") => {
      if (!page) return;
      await runSave(nextStatus, page);
    },
    [page, runSave]
  );

  /**
   * The operator's explicit overwrite after a conflict — see
   * {@link PageEditorController.saveOverwritingConflict}.
   *
   * Re-reads the row purely for its current `version` and body format: the response's title/slug/
   * body are deliberately NOT applied to the working copy, because doing so is exactly the "your
   * typed work disappeared" outcome this whole path exists to avoid. `attemptedStatus` replays the
   * ORIGINAL intent, so a rejected Publish retries as a publish rather than quietly downgrading to
   * a draft. Mirrors `usePostEditor`'s `saveOverwritingConflict` verbatim.
   */
  const saveOverwritingConflict = useCallback(async () => {
    if (!page) return;
    const attemptedStatus = saveConflict?.attemptedStatus;
    const fresh = await port.getPage(page.id).then(({ post }) => post, () => null);
    if (!fresh) {
      setError(t(locale, "could not re-read the current version — your changes are still here, try again"));
      return;
    }
    setPage(fresh);
    await runSave(attemptedStatus, fresh);
  }, [page, port, runSave, saveConflict, t, locale]);

  /** Hides the conflict banner without saving — see
   *  {@link PageEditorController.dismissSaveConflict}. */
  const dismissSaveConflict = useCallback(() => setSaveConflict(null), []);

  const remove = useCallback(async () => {
    if (!page) return;
    setDeleting(true);
    setError(null);
    try {
      await port.deletePage(page.id);
      navigate("/pages");
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "failed to delete page"));
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }, [page, locale, port, navigate, t]);

  // Pending-html preview (2026-09-09) — see `PageEditorController.previewFormRef`'s own doc. The
  // hidden form's DOM node; `PagePreview` attaches it via `ref`. `previewFormTarget` is `""` before
  // `page` loads for the same reason `templatePreviewUrl` below is — `PagePreview` never renders
  // that early.
  const previewFormRef = useRef<HTMLFormElement>(null);
  const previewFormTarget = pagePreviewFormTarget(page);

  // Per-tab scroll memory, Preview half — see `PageEditorController.onPreviewFrameLoad`'s own doc.
  const previewScrollYRef = useRef(0);
  const onPreviewFrameLoad = useCallback((iframe: HTMLIFrameElement) => {
    try {
      // Cross-origin (the live-site branch): reading `.scrollY` or calling `.scrollTo()` on a foreign
      // `Window` throws a `SecurityError` — caught below, so that branch's position is simply never
      // remembered rather than crashing the load handler. The same-origin template-preview branch
      // reaches neither restriction.
      const win = iframe.contentWindow;
      if (!win) return;
      win.scrollTo(0, previewScrollYRef.current);
      win.addEventListener("scroll", () => {
        previewScrollYRef.current = win.scrollY;
      });
    } catch {
      // See this function's own doc on `PageEditorController` — cross-origin, nothing to do here.
    }
  }, []);

  // Tells the assistant which page "this page" is (`lib/agent-screen-context.ts`) — the saved row,
  // so the id/slug it is given are ones its tools can actually look up.
  useAgentScreenEntry(page === null ? null : { kind: page.kind, id: page.id, title: page.title, slug: page.slug, status: page.status });

  // Template-preview fix (2026-08-11) — see `contentDirty`'s doc on `PageEditorController`.
  const contentDirty = computeContentDirty(page, { title, slug, status, html, savedHtml });
  // The Save button's own "is there anything unsaved" signal — split out to a named variable (was
  // previously inlined at the return statement) so `useExternalEntryRefresh`'s `isDirty` below reads
  // the SAME value `dirty` reports, rather than a second copy of this expression that could drift.
  const dirty = contentDirty || templateChoice !== savedTemplateChoice;

  // Content refresh (2026-09-16) — see `use-external-entry-refresh.hooks.ts`'s file header for the
  // clean/dirty/saving decision this wraps, and `PAGES_RESOURCE`'s own doc (`rules.ts`) for the bug
  // this closes: `pages_write_html`/`pages_write_region` are agent-callable, and this editor never
  // re-read its row after one fired. `loaded`/`isDirty`/`isSaving` are read through the hook's own
  // ref on every check, so listing `dirty`/`saving`/`page` in a dependency array here is unnecessary.
  // `isDirty` is wider than `dirty` on the Interactive tab — see `pageRefreshMayHaveUnsavedEdits`.
  const externalRefresh = useExternalEntryRefresh<AdminPost>({
    loaded: page,
    fetchLatest: (id) => port.getPage(id).then(({ post }) => post),
    isDirty: () => pageRefreshMayHaveUnsavedEdits({ dirty, view }),
    isSaving: () => saving,
    applyLatest: applyExternalPage,
    discardStandingDraft: autosave.clearStandingDraft,
    supersedeStandingDraftBasis: autosave.supersedeBasis,
    onLoadLatestFailed: () => setError(t(locale, "could not re-read the current version — your changes are still here, try again")),
  });
  useContentRefreshSubscription(PAGES_RESOURCE, externalRefresh.checkForExternalChange);

  // Unsaved-work guard (2026-09-06, alongside standing-draft autosave — audit finding: this screen
  // had none at all, unlike `usePostEditor`'s own `useDirtyGuard` call). Same five-field comparison
  // `dirty` above already makes (title/slug/status/body/templateChoice), just handed to the guard
  // instead of computed inline, so `confirmLeave`/the automatic `beforeunload` listener agree with
  // what the Save button itself considers dirty.
  const { confirmLeave } = useDirtyGuard(
    { title, slug, status, html, templateChoice },
    pageDirtyGuardBaseline(page, savedHtml, savedTemplateChoice)
  );

  // Standing-draft autosave scheduling — fires a debounced write whenever the working copy actually
  // differs from what's saved. Deliberately does NOT clear the draft when `contentDirty` goes back
  // to `false` on its own (e.g. the operator edits back to the original value): only a real
  // Save/Publish or an explicit Discard ever clears a parked draft (see `save`'s own
  // `clearStandingDraft` call, and `discardRecoveredDraft` below) — auto-clearing here on a merely
  // quiet moment is not one of those two things.
  useEffect(() => {
    if (!page || !contentDirty) return;
    autosave.scheduleAutosave(buildPageAutosaveDraft(page, { title, slug, html }));
  }, [page, contentDirty, title, slug, html, autosave.scheduleAutosave]);

  // Pending-html preview's debounced auto-submit (2026-09-09) — see `PageEditorController
  // .previewFormRef`'s own doc. `active` mirrors the negation of `PagePreview`'s own
  // `canShowLiveSite` (see that function's doc): true whenever the operator isn't looking at the
  // live site, regardless of
  // `status` or `contentDirty` — a draft, or a published-but-dirty Page, both need their pending
  // `html` POSTed into the preview iframe the same way. Computed inline here (not read off a
  // `dirty`/`canShowLiveSite` controller field) because none exists — `PagePreview` recomputes the
  // identical condition itself from `status`/`dirty`, the same duplication
  // `use-post-editor.hooks.ts`'s own `canShowPendingContentPreview` already accepts between the hook
  // and its view for the same reason (cheap, O(1), and keeps the controller's own field surface
  // unchanged).
  useEffect(
    () =>
      schedulePendingHtmlPreviewSubmit({
        active: view === "preview" && page !== null && !(status === "published" && !contentDirty && templateChoice === savedTemplateChoice),
        formRef: previewFormRef,
      }),
    // `page?.id`, not `page` — same reasoning `use-post-editor.hooks.ts`'s identical effect gives:
    // a `setPage(updated)` after a successful save (a new object reference, same id) must not by
    // itself restart the debounce timer. `contentRevision` IS added (2026-09-16): a clean editor's
    // silent external apply changes `html`/`title`/etc. without ever changing `view`/`status`/
    // `templateChoice`, so without this the pending preview would sit on the pre-write body until
    // some unrelated field also happened to change.
    [view, page?.id, status, contentDirty, templateChoice, savedTemplateChoice, html, contentRevision]
  );

  const restoreRecoveredDraft = useCallback(() => {
    const draft = autosave.recoverableDraft;
    if (!draft) return;
    setTitle(draft.title);
    setSlug(draft.slug);
    if (draft.bodyFormat === "html" && draft.bodyHtml !== undefined) setHtml(draft.bodyHtml);
    autosave.dismissRecoverable();
  }, [autosave.recoverableDraft, autosave.dismissRecoverable]);

  const discardRecoveredDraft = useCallback(async () => {
    await autosave.clearStandingDraft();
  }, [autosave.clearStandingDraft]);

  // See `templatePreviewUrl`'s own doc on `PageEditorController` for why this is a plain per-render
  // expression rather than state or a `useMemo`.
  const templatePreviewUrl = page ? port.templatePreviewUrl(page.id, templateChoice) : "";

  // `templateChoice` (not `savedTemplateChoice`): the Interactive canvas must mirror the template the
  // operator is CURRENTLY looking at in the picker, the same one `templatePreviewUrl` above resolves —
  // switching templates should restyle the canvas immediately, without a save round-trip. The 4th
  // argument is what supplies the canvas its content wrapper: the theme template's own ancestor chain
  // around the `{"type":"content"}` marker (`<main><article class="post-detail wrap">` in `basic`'s
  // `posts-default.html`, `blog-post.html` before the 2026-09-03 posts-*/pages-* rename). Without it
  // the canvas renders the page body naked at full bleed while the published page centres it in a
  // 720px column — same CSS, same tokens, no container.
  //
  // Run through `resolveCanvasTemplateChoice` rather than passed straight through: an untemplated
  // (`null`/`""`) `html`-format Page is exactly the case a `static`-tier theme's real render mirrors
  // through its own page shell (`pages-default.html`, or legacy `page-shell.html`), not through no
  // wrapper at all — see that function's own doc.
  // `page?.bodyFormat ?? "doc"` is the same "nothing risky before load" default `templatePreviewUrl`
  // above and `contentDirty` below already use for a not-yet-loaded page.
  const canvasStyling = useThemeCanvasStyling(
    activeThemeId,
    activeThemeApiVersion,
    themeCanvasPort,
    resolveCanvasTemplateChoice(templateChoice, page?.bodyFormat ?? "doc"),
  );

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
    draftHtml,
    setDraftHtml,
    htmlTextareaRef,
    onHtmlScroll,
    onPreviewFrameLoad,
    view,
    setView,
    device,
    setDevice,
    previewExpanded,
    togglePreviewExpanded,
    frameRef: setFrameNode,
    paneWidth,
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
    dirty,
    templatePreviewUrl,
    previewFormRef,
    previewFormTarget,
    canvasStyling,
    save,
    saveConflict,
    saveOverwritingConflict,
    dismissSaveConflict,
    remove,
    confirmingDelete,
    setConfirmingDelete,
    deleting,
    confirmLeave,
    recoverableDraft: autosave.recoverableDraft,
    restoreRecoveredDraft,
    discardRecoveredDraft,
    autosaveStaleBasis: autosave.staleBasis,
    pendingExternalVersion: externalRefresh.pendingExternalVersion,
    loadExternalChange: externalRefresh.loadExternalChange,
    dismissExternalChange: externalRefresh.dismissExternalChange,
    contentRevision,
  };
}

/**
 * Binds the real `/api/.../pages` client, `lib/router`'s `navigate`, and `page-editor-i18n`'s `t` —
 * see `page-editor-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `PageEditor.tsx`
 * composes this and a test composes {@link usePageEditor} with `createFakePageEditorPort`.
 * `useAdminLocale()` is called here, not injected as a hook reference — its resolved `locale` value
 * is what `usePageEditor` actually consumes (every internal use is `t(locale, ...)`), and there is no
 * precedent in this codebase for injecting a hook reference instead of the value it resolves to.
 */
export function useWiredPageEditor(routeSlug: string): PageEditorController {
  const locale = useAdminLocale();
  return usePageEditor(routeSlug, {
    port: defaultPageEditorPort,
    themeCanvasPort: defaultThemeCanvasPort,
    navigate: defaultNavigate,
    t: defaultT,
    locale,
  });
}
