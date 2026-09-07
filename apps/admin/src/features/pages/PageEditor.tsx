import { ConfirmDialog, InteractiveHtmlEditor } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";
import { SrcDocSandbox } from "@jini-ai/ui/renderers";

import { siteUrl } from "../../lib/site-url";
import type {
  StandingDraftAutosaveSnapshot,
  StandingDraftStaleBasis,
} from "../../hooks/use-standing-draft-autosave.hooks";
import {
  PAGE_PREVIEW_WIDTHS,
  useWiredPageEditor,
  type PagePreviewDevice,
  type PageEditorView,
} from "./hooks/use-page-editor.hooks";
import type { ThemeCanvasStylingState } from "./hooks/use-theme-canvas-styling.hooks";
import {
  isAutosaveDraftStale,
  pageAutosaveBannerMessage,
  pageAutosaveStaleBasisMessage,
  pageEditorSurface,
  pagePublicPath,
} from "./rules";

/**
 * @file The Pages editor — markup only. State lives in `hooks/use-page-editor.hooks.ts`.
 *
 * **There is no Tiptap here, and there never will be.** A Page is a bespoke HTML document; the
 * editing surfaces are the rendered preview, the raw HTML behind it, and — the "Interactive" tab —
 * a GrapesJS-backed visual surface for clicking into rendered text and editing it in place
 * (`@jini-ai/admin/react`'s `InteractiveHtmlEditor`). GrapesJS does not contradict the "no Tiptap"
 * invariant: it edits and exports raw HTML directly, `html`/`setHtml` above stay the single source
 * of truth, and there is no parallel structured-document format the way Tiptap's `bodyJson` would
 * be — text editing and basic formatting only this pass, not Gutenberg-style block manipulation.
 * Posts keep Tiptap in `features/posts/PostEditor.tsx`, which this screen replaces for `kind:
 * "page"` entries — that screen was previously reached for Pages too, differing only by a
 * `kindLabel === "page"` ternary on its heading while still mounting the Tiptap toolbar over a
 * document Tiptap would silently mangle.
 *
 * The chat that drives generation is NOT in this component. It is the workspace assistant dock,
 * which `App.tsx` renders outside the route switch and ADR-049 pins to never unmount — so it is the
 * same conversation whether the operator is on the Pages list or in here, and an agent can navigate
 * between them mid-turn without losing the thread. Building a second chat pane into this screen
 * would fork that conversation for no gain.
 */
export interface PageEditorProps {
  /** The page's slug, as it appears in the URL. Also accepts a legacy id — see `usePageEditor`. */
  slug: string;
  /** DI seam for tests — same convention as `Pages.tsx`'s `usePagesHook`. */
  usePageEditorHook?: typeof useWiredPageEditor;
}

const DEVICES: ReadonlyArray<{ key: PagePreviewDevice; label: string }> = [
  { key: "desktop", label: "Desktop" },
  { key: "tablet", label: "Tablet" },
  { key: "mobile", label: "Mobile" },
];

const VIEWS: ReadonlyArray<{ key: PageEditorView; label: string }> = [
  { key: "html", label: "HTML" },
  { key: "interactive", label: "Interactive" },
  { key: "preview", label: "Preview" },
];

/**
 * The editor header — the back link on the left and the kicker/title/description block, and since
 * the 2026-09-06 layout experiment nothing else: the save status, status select and the
 * publish/save/delete buttons moved out to `PageEditorActions` below the toolbar.
 *
 * That move took this component's branching with it, so the extraction note this doc used to carry
 * now belongs to `PageEditorActions` instead — see there. What is left here is inert markup plus
 * the one unsaved-work guard on the back link, which is why `confirmLeave` is the only prop that
 * stayed.
 *
 * `confirmLeave` (2026-09-06, standing-draft autosave dispatch) replaces what used to be an inline
 * `dirty && !window.confirm(...)` check written directly in this component — the exact
 * logic-in-`.tsx` pattern this codebase's own convention keeps correcting (see
 * `use-post-editor.hooks.ts`'s own `useDirtyGuard` wiring, which `PostEditorHeader` already
 * consumed this same way). The comparison and the `window.confirm` call both now live in
 * `use-dirty-guard.hooks.ts`, tested once there rather than re-verified per screen.
 */
function PageEditorHeader({ confirmLeave }: { confirmLeave: () => boolean }) {
  return (
    // `page-header-split` (a modifier on the shared `.page-header`, `styles.css`) is the
    // 2026-09-06 layout experiment: back link alone at the far left, title block centred, and the
    // header's right rail deliberately left EMPTY now that the actions live below the toolbar —
    // see that modifier's own comment for why the empty rail has to stay reserved.
    <div
      className="page-header page-header-split"
      {...agentHandle("page-header", {
        role: "region",
        label:
          "Editor header — the back link and the page's title. Save, Delete and the " +
          "Draft/Published field are NOT here: they are in the action row below the toolbar.",
      })}
    >
      {/* Left rail — the back link on its own, ahead of the title in DOM order as well as
          visually, so tab order and the reading order match what is on screen. */}
      <div className="page-header-lead">
        {/* Guards an in-app navigation away from unsaved work — the same protection the agent's
            own navigation gate is meant to apply, applied here to a human click. */}
        <a
          href="/admin/pages"
          onClick={(e) => {
            if (!confirmLeave()) e.preventDefault();
          }}
          {...agentHandle("page-back-to-list", { role: "link", label: "Back to the list of all pages" })}
        >
          <button type="button" className="btn-secondary">
            ← Pages
          </button>
        </a>
      </div>
      <div className="page-header-text">
        <p className="page-kicker">Content</p>
        <h1 className="page-title">Edit page</h1>
        <p className="page-description">
          Ask the assistant to build this page, or edit the HTML directly.
        </p>
      </div>
    </div>
  );
}

/**
 * The status select, save feedback and the publish/save/delete buttons — their own row, below the
 * view/device toolbar rather than in the header (owner request, 2026-09-06: "put the published save
 * and delete buttons under the gray desktop/tablet/mobile row").
 *
 * This is where `PageEditorHeader`'s branching went when the controls moved: the message/error
 * spans, the publish button's conditional render, the save button's className, and its
 * "Saving…"/"Save •"/"Save" label are five independent decisions, and as a top-level function they
 * are scored in their own scope instead of accumulating onto `PageEditor`'s or the header's.
 *
 * `.editor-action-row` (`styles.css`) is shared with `features/posts/PostEditor.tsx`'s own
 * `PostEditorActions`; the two components are NOT merged, because that one's copy runs through `t`
 * and this screen's doesn't (2026-09-06: both now carry `agentHandle` tags — only the i18n split
 * remains as the reason not to merge them).
 */
function PageEditorActions({
  dirty,
  message,
  error,
  status,
  setStatus,
  saving,
  onPublish,
  onSave,
  onDeleteClick,
}: {
  dirty: boolean;
  message: string | null;
  error: string | null;
  status: "draft" | "published";
  setStatus: (value: "draft" | "published") => void;
  saving: boolean;
  onPublish: () => void;
  onSave: () => void;
  onDeleteClick: () => void;
}) {
  return (
    <div
      className="editor-action-row"
      {...agentHandle("page-actions", {
        role: "region",
        label: "Save status, the Draft/Published field, and the Publish, Save and Delete buttons",
      })}
    >
      {message ? <span className="save-ok">{message}</span> : null}
      {error ? <span className="save-error">{error}</span> : null}
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as "draft" | "published")}
        {...agentHandle("page-status", {
          role: "field",
          label:
            "Whether this page is a draft or published — set with page.select_option, not click. " +
            "Setting to Draft unpublishes it (content is kept, just hidden from the site); this is " +
            "NOT the same as Delete, which moves the whole entry to the trash.",
        })}
      >
        <option value="draft">Draft</option>
        <option value="published">Published</option>
      </select>
      {status === "draft" ? (
        <button
          type="button"
          onClick={onPublish}
          disabled={saving}
          {...agentHandle("page-publish", {
            role: "button",
            label:
              "Publish this page immediately — saves the current title, slug and body and sets " +
              "status to Published in one action. Only shown while the page is a draft; once " +
              "published, use Save for further edits.",
          })}
        >
          Publish
        </button>
      ) : null}
      <button
        type="button"
        className={status === "draft" ? "btn-secondary" : undefined}
        onClick={onSave}
        disabled={saving}
        {...agentHandle("page-save", { role: "button", label: "Save this page's title, slug, status and body" })}
      >
        {saving ? "Saving…" : dirty ? "Save •" : "Save"}
      </button>
      <button
        type="button"
        className="btn-danger"
        onClick={onDeleteClick}
        {...agentHandle("page-delete", {
          role: "button",
          label:
            "Move this page to the trash — different from unpublishing (the Draft/Published field " +
            "beside it): the entry disappears from every list and the site. Asks for confirmation " +
            "before deleting.",
        })}
      >
        Delete
      </button>
    </div>
  );
}

/**
 * Standing-draft autosave (2026-09-06) — the "restore or discard" recovery banner. Never rendered
 * unless `usePageEditor` found a parked draft on mount (`recoverableDraft`); never applies it on its
 * own — both buttons require an explicit click, per the owner's own worry about silently clobbering
 * a different tab/operator's work. `pageAutosaveBannerMessage`/`isAutosaveDraftStale` (`rules.ts`)
 * own the actual wording decision so this component stays markup only.
 */
function PageAutosaveRecoveryBanner({
  recoverableDraft,
  currentVersion,
  onRestore,
  onDiscard,
}: {
  recoverableDraft: StandingDraftAutosaveSnapshot;
  currentVersion: number;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const stale = isAutosaveDraftStale(recoverableDraft.baseVersion, currentVersion);
  return (
    <div
      className="notice warning"
      {...agentHandle("page-autosave-recovery", {
        role: "region",
        label: "An unsaved draft from a previous session was found — restore it or discard it",
      })}
    >
      <p>{pageAutosaveBannerMessage(recoverableDraft.savedAt, Date.now(), stale)}</p>
      <button
        type="button"
        className="btn-secondary"
        onClick={onRestore}
        {...agentHandle("page-autosave-restore", { role: "button", label: "Apply the recovered draft into the editor" })}
      >
        Restore
      </button>
      <button
        type="button"
        className="btn-secondary"
        onClick={onDiscard}
        {...agentHandle("page-autosave-discard", { role: "button", label: "Discard the recovered draft without applying it" })}
      >
        Discard
      </button>
    </div>
  );
}

/**
 * Standing-draft autosave — the STALE-BASIS notice (2026-09-06). The counterpart to
 * `PageAutosaveRecoveryBanner` above and not a duplicate of it: that banner offers work found parked
 * from a PREVIOUS session, this reports that background autosaving has STOPPED for the session
 * happening right now, because another operator's save moved this page's version out from under this
 * tab. Until then the operator had no way to know — the editor looked completely normal while every
 * write it made was being thrown away. `pageAutosaveStaleBasisMessage` (`rules.ts`) owns the wording
 * so this component stays markup only, the same split the recovery banner already uses.
 *
 * NO buttons, deliberately, and this is the one design decision here worth defending:
 * - A "Dismiss" would let the operator silence a warning that is still true, putting them straight
 *   back into the silent data loss this whole path exists to end. The notice clears by itself when
 *   autosaving actually resumes (`usePageEditor`'s `autosaveStaleBasis` goes null once a write is
 *   accepted on a fresh basis) and at no other time, so it can never be lying while it is on screen.
 * - A "Reload" would wipe the operator's typed text out of the editor on their behalf. Their only
 *   remaining copy would then be the shared hook's best-effort browser-storage mirror, which is not
 *   a guarantee this component can make on their behalf (`localStorage` throws outright in some
 *   privacy modes). The message tells them to copy their work first and leaves the choice with them.
 */
function PageAutosaveStaleBanner({ staleBasis }: { staleBasis: StandingDraftStaleBasis }) {
  return (
    <div
      className="notice warning"
      {...agentHandle("page-autosave-stale", {
        role: "region",
        label:
          "Another operator saved this page while you were editing — autosaving has stopped, and your " +
          "unsaved changes are still here in the editor",
      })}
    >
      <p>{pageAutosaveStaleBasisMessage(staleBasis)}</p>
    </div>
  );
}

/**
 * The toolbar's right-hand group — the device-width control (preview view only) and the template
 * picker. Extracted out of `PageEditor` for the same reason `PageEditorHeader` above was: this is
 * where nearly all of the remaining branching in that component's render lived (the preview-only
 * visibility check, the html-format check, and the has-templates check nested inside it), and as a
 * top-level function its branches are scored in their own scope instead of accumulating onto
 * `PageEditor`'s.
 *
 * Device-width control and template picker share this one row (owner feedback, 2026-08-11: "move the
 * UI for the template dropdown where the desktop tablet mobile is right now ... so it's all one row"
 * — the picker's own standalone row above is gone). `.page-editor-toolbar-end` is a plain grouping
 * wrapper (`pages.css`) so `.page-editor-toolbar`'s existing `justify-content: space-between` still
 * only has to place two things: the view tabs on the left, this group on the right.
 *
 * The template picker mirrors `PostEditor.tsx`'s own `.editor-template-picker` markup/classes
 * verbatim. Rendered only for an `"html"`-format Page: a `"doc"`-format Page (pre-conversion legacy
 * row) has no render path that would honor a template choice yet (`isEligibleForTemplateBranch`
 * requires `bodyFormat: "html"`), so showing the picker on one would let an operator set a value with
 * no visible effect.
 *
 * UNLIKE the Post picker, the selected value is NOT defaulted to the theme's first template when
 * unset — see `use-page-editor.hooks.ts`'s load effect and `isEligibleForTemplateBranch`'s doc for the
 * full reasoning: "no template chosen" is a Page's normal, fully-working state (render its own body),
 * not an absence-of-decision needing a UI default to stay honest.
 */
function PageEditorToolbarEnd({
  view,
  device,
  setDevice,
  bodyFormat,
  availableTemplates,
  templateChoice,
  setTemplateChoice,
}: {
  view: PageEditorView;
  device: PagePreviewDevice;
  setDevice: (value: PagePreviewDevice) => void;
  bodyFormat: "doc" | "html" | undefined;
  availableTemplates: string[];
  templateChoice: string | null;
  setTemplateChoice: (value: string) => void;
}) {
  return (
    <div className="page-editor-toolbar-end">
      {view === "preview" ? (
        <div className="segmented" role="group" aria-label="Preview width">
          {DEVICES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={device === entry.key}
              className={device === entry.key ? "is-active" : undefined}
              onClick={() => setDevice(entry.key)}
              {...agentHandle(`page-preview-width-${entry.key}`, { role: "button", label: `Preview at ${entry.label} width` })}
            >
              {entry.label}
            </button>
          ))}
          <span className="page-editor-width">{PAGE_PREVIEW_WIDTHS[device]}px</span>
        </div>
      ) : null}
      {bodyFormat === "html" ? (
        <div className="editor-template-picker">
          <label className="a11y-label-wrap">
            <span className="visually-hidden">Template</span>
          </label>
          {availableTemplates.length > 0 ? (
            <select
              value={templateChoice ?? ""}
              // `e.target.value`, not `|| null` — `""` is a legitimate stored value here (though,
              // unlike Posts, it behaves identically to `null` at render time — see
              // `isEligibleForTemplateBranch`'s doc).
              onChange={(e) => setTemplateChoice(e.target.value)}
              {...agentHandle("page-template-choice", {
                role: "field",
                label: "Which theme page template this page renders through on the public site.",
              })}
            >
              {availableTemplates.map((template) => (
                <option key={template} value={template}>
                  {template}
                </option>
              ))}
              <option value="">No template chosen</option>
            </select>
          ) : (
            <select
              disabled
              value=""
              {...agentHandle("page-template-choice", {
                role: "field",
                label: "The active theme declares no page templates, so there is nothing to choose here.",
              })}
            >
              <option value="">No templates for this theme</option>
            </select>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function PageEditor({ slug: routeSlug, usePageEditorHook = useWiredPageEditor }: PageEditorProps) {
  const {
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
    view,
    setView,
    device,
    setDevice,
    frameRef,
    paneWidth,
    saving,
    dirty,
    contentDirty,
    templatePreviewUrl,
    canvasStyling,
    save,
    remove,
    confirmingDelete,
    setConfirmingDelete,
    deleting,
    confirmLeave,
    recoverableDraft,
    restoreRecoveredDraft,
    discardRecoveredDraft,
    autosaveStaleBasis,
  } = usePageEditorHook(routeSlug);

  if (error && !page) return <div className="notice error">{error}</div>;
  if (!page) return <div className="notice">Loading editor…</div>;

  return (
    <div className="page">
      <PageEditorHeader confirmLeave={confirmLeave} />

      {recoverableDraft ? (
        <PageAutosaveRecoveryBanner
          recoverableDraft={recoverableDraft}
          currentVersion={page.version}
          onRestore={restoreRecoveredDraft}
          onDiscard={discardRecoveredDraft}
        />
      ) : null}
      {autosaveStaleBasis ? <PageAutosaveStaleBanner staleBasis={autosaveStaleBasis} /> : null}

      {/* `editor-title`/`editor-slug` are the existing editor chrome from `styles/editor.css`,
          reused verbatim so a Page's header looks and behaves exactly like the screen it replaces.
          The chrome was never the problem — the Tiptap body under it was.

          Owner feedback (2026-08-11): "Cap the title input at half the page and then put the
          hacker news slug and view. Right justify it as the other half of that line of the
          title." — title and slug now share one row instead of stacking on two. `.page-title-row`
          is a new, Pages-only wrapper class (`styles/pages.css`, scoped as `.page-title-row
          .editor-title` — see that rule's own comment for why the width cap has to target the
          input directly rather than a class on this `display: contents` label) that constrains
          widths without changing `.editor-title`/`.editor-slug` themselves, so `PostEditor.tsx`'s
          own full-width title row is unaffected. */}
      <div className="page-title-row">
        <label className="a11y-label-wrap">
          <span className="visually-hidden">Page title</span>
          <input
            className="editor-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled"
            {...agentHandle("page-title", { role: "field", label: "This page's title" })}
          />
        </label>

        <div className="editor-slug">
          <span>/</span>
          <label className="a11y-label-wrap">
            <span className="visually-hidden">URL slug</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              {...agentHandle("page-slug", { role: "field", label: "URL slug this page is published at" })}
            />
          </label>
          <a
            href={siteUrl(pagePublicPath(slug))}
            target="_blank"
            rel="noreferrer"
            {...agentHandle("page-view-live", { role: "link", label: "Open this page on the public site in a new tab" })}
          >
            view ↗
          </a>
        </div>
      </div>

      <div className="page-editor-toolbar">
        <div className="segmented" role="tablist" aria-label="Editor view">
          {VIEWS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={view === entry.key}
              className={view === entry.key ? "is-active" : undefined}
              onClick={() => setView(entry.key)}
              {...agentHandle(`page-view-${entry.key}`, { role: "button", label: `Switch to the ${entry.label} view` })}
            >
              {entry.label}
            </button>
          ))}
        </div>
        {/* Device-width control and template picker share the toolbar's right-hand side — see
            `PageEditorToolbarEnd`'s own doc for the layout history and the template-picker's rules. */}
        <PageEditorToolbarEnd
          view={view}
          device={device}
          setDevice={setDevice}
          bodyFormat={page.bodyFormat}
          availableTemplates={availableTemplates}
          templateChoice={templateChoice}
          setTemplateChoice={setTemplateChoice}
        />
      </div>

      {/* Directly under the toolbar, not in the header — see `PageEditorActions`' own doc. */}
      <PageEditorActions
        dirty={dirty}
        message={message}
        error={error}
        status={status}
        setStatus={setStatus}
        saving={saving}
        onPublish={() => save("published")}
        onSave={() => save()}
        onDeleteClick={() => setConfirmingDelete(true)}
      />

      <PageEditorPane
        view={view}
        canvasStyling={canvasStyling}
        html={html}
        setHtml={setHtml}
        draftHtml={draftHtml}
        setDraftHtml={setDraftHtml}
        device={device}
        slug={slug}
        status={status}
        dirty={dirty}
        contentDirty={contentDirty}
        templatePreviewUrl={templatePreviewUrl}
        frameRef={frameRef}
        paneWidth={paneWidth}
      />

      <ConfirmDialog
        open={confirmingDelete}
        agentHandle="page-delete-confirm"
        title="Move to trash?"
        body={<p>Move &quot;{title}&quot; to trash? It will disappear from the site and from this list.</p>}
        confirmLabel="Move to trash"
        destructive
        pending={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

/**
 * The editor's main pane — one of four surfaces, chosen by {@link pageEditorSurface}.
 *
 * Extracted from `PageEditor` in the 2026-09-06 complexity-ceiling pass. This was a chain of nested
 * ternaries inline in that component's JSX, worth 6 of its 10 cognitive-complexity points against a
 * ceiling of 9 (plus two `sonarjs/no-nested-conditional` warnings). The DECISION did not move here —
 * it moved to `rules.ts`, where it is pure and directly testable, per this feature's own "everything
 * that computes a value rather than rendering one" rule; what is left below is markup dispatch and
 * nothing else, one early return per surface, scored in its own scope.
 *
 * The Interactive tab remounts with fresh `html` on every tab switch — see `InteractiveHtmlEditor`'s
 * own file header for why it reads `html` once at mount rather than reacting to later prop changes.
 * `canvasStyling` is read once at mount for that same reason, which is why `interactive-pending` is
 * its own surface rather than a skipped loading flash: mounting an unstyled canvas could never pick
 * the theme up afterwards. The wait is normally invisible — `preview` is this screen's default tab,
 * so the theme's token files have already loaded by the time anyone clicks Interactive.
 */
function PageEditorPane({
  view,
  canvasStyling,
  html,
  setHtml,
  draftHtml,
  setDraftHtml,
  device,
  slug,
  status,
  dirty,
  contentDirty,
  templatePreviewUrl,
  frameRef,
  paneWidth,
}: {
  view: PageEditorView;
  canvasStyling: ThemeCanvasStylingState;
  html: string;
  setHtml: (value: string) => void;
  draftHtml: string;
  setDraftHtml: (value: string) => void;
  device: PagePreviewDevice;
  slug: string;
  status: "draft" | "published";
  dirty: boolean;
  contentDirty: boolean;
  templatePreviewUrl: string;
  frameRef: (node: HTMLDivElement | null) => void;
  paneWidth: number;
}) {
  const surface = pageEditorSurface(view, canvasStyling);
  if (surface.kind === "preview") {
    return (
      <PagePreview
        html={html}
        width={PAGE_PREVIEW_WIDTHS[device]}
        slug={slug}
        status={status}
        dirty={dirty}
        contentDirty={contentDirty}
        templatePreviewUrl={templatePreviewUrl}
        frameRef={frameRef}
        paneWidth={paneWidth}
      />
    );
  }
  if (surface.kind === "html") {
    return (
      <textarea
        className="page-html-source"
        value={draftHtml}
        onChange={(e) => {
          // Raw pass-through, same as before this tab had any formatting — an edit made on top of
          // the pretty-printed baseline becomes the new working copy verbatim, not reformatted
          // again mid-keystroke (which would fight the operator's cursor position).
          setDraftHtml(e.target.value);
          setHtml(e.target.value);
        }}
        spellCheck={false}
        aria-label="Page HTML"
        placeholder="This page has no HTML yet. Ask the assistant to build it, or write some here."
        {...agentHandle("page-html-source", { role: "field", label: "This page's raw HTML source" })}
      />
    );
  }
  if (surface.kind === "interactive-pending") {
    return <div className="notice">Loading the theme's styles…</div>;
  }
  return <InteractiveHtmlEditor html={html} onChange={setHtml} canvasStyling={surface.styling} />;
}

/**
 * Renders the page at a fixed viewport width and scales the whole thing down to fit the pane.
 *
 * The scale is a CSS transform on a fixed-width box, not a responsive iframe, and that difference is
 * the entire point — see `PAGE_PREVIEW_WIDTHS`. The wrapper's height is scaled to match so the
 * transformed content does not leave a gap or overflow underneath it. Both branches below fill this
 * same scaled box identically (`.page-preview-iframe` sets `width/height: 100%` on either element),
 * so `3ac885e`'s live pane-width tracking and the toolbar-to-preview spacing are unaffected by which
 * branch renders.
 *
 * **What this shows, and why (2026-08-11 — the theme-CSS gap was diagnosed, not assumed a
 * regression)**: this component previously fed the page's raw stored body HTML into
 * `SrcDocSandbox` — a sandboxed `srcdoc` iframe with no template wrapper, no nav/footer, and no
 * theme stylesheet, regardless of the page's template choice. That was never wired to the real
 * render path; it cannot have regressed, because it never rendered themed. Confirmed independently
 * by the predecessor session that shipped `page-shell.html` (`ADS-memory/reports/implementation/
 * 2026-08-11-basic-page-template.md`'s own "Risks" section) and by reading this function before
 * touching it: `html` here is the editor's raw body string, never passed through
 * `renderViaTemplate`/`renderStaticPage`.
 *
 * Rather than reimplement that whole server-side render pipeline a second time in the admin (a
 * second source of truth that would drift from `src/server/routes/site/pages.ts`'s real one), THREE
 * branches share the real pipeline instead of one:
 *
 * 1. **Live site** (`status === "published" && !dirty`, i.e. nothing pending at all): iframes the
 *    real public URL (`siteUrl`) directly — the exact same response a visitor gets.
 * 2. **Template preview, own fix (2026-08-11)** (`status === "published" && !contentDirty`, i.e.
 *    title/slug/status/body all match what's saved and the row IS published — only `templateChoice`
 *    is pending): iframes `templatePreviewUrl` — `usePageEditor`'s pre-built URL for this SAME saved
 *    content through the PENDING template choice (`port.templatePreviewUrl`, `page-editor-port.hooks.ts`;
 *    the real binding calls `lib/api.ts`'s own `templatePreviewUrl`, an admin-only render through the
 *    SAME render pipeline as branch 1: `renderViaTemplate`, `routes/admin/posts/template-preview.ts`,
 *    just looked up by id instead of by public slug). This is the fix, and exactly the reported bug's
 *    own repro: picking a template from the dropdown marks
 *    `dirty` (correctly — it IS an unsaved change to `templateChoice`), which used to fall the preview
 *    all the way back to branch 3 below — raw, unstyled, and blind to which template was even
 *    selected, which is why re-picking a DIFFERENT template while already dirty used to look like
 *    nothing happened (branch 3 never reads `templateChoice` at all). See `ADS-memory/reports/
 *    implementation/2026-08-11-template-preview-render-bug.md` for the full root-cause writeup AND why
 *    this branch is gated on `status === "published"` rather than just `!contentDirty` — a draft's own
 *    body does not survive this same render pipeline intact (a disclosed, separate limitation in the
 *    shared "content" marker resolver, not something worth widening this fix to work around).
 * 3. **Raw fallback** (everything else — a draft, regardless of its own dirtiness, or a published page
 *    with `contentDirty`, i.e. the operator actually edited title/slug/status/body): `SrcDocSandbox`
 *    over the raw, un-templated buffer. For a draft this is unchanged from before this fix. For a
 *    dirty published page, it's genuinely the best available preview, since neither the public URL nor
 *    the template-preview endpoint can see edits that were never saved.
 *
 * All three branches fill the same scaled box identically (`.page-preview-iframe` sets
 * `width/height: 100%` on every element), so `3ac885e`'s live pane-width tracking and the
 * toolbar-to-preview spacing are unaffected by which one renders.
 *
 * The public URL and the template-preview endpoint are both cross-origin from the admin in dev
 * (`:5173` vs. `:3000`) — by design for branch 1 (it has to be the real site, not a re-hosted copy);
 * branch 2 goes through the SAME `/api` dev-proxy rule (`apps/admin/vite.config.ts`) every other
 * admin API call already uses, so the `tovu_session` cookie (`SameSite=Strict`) travels with it the
 * same way — see `template-preview.ts`'s own file header for why a real URL (not `srcDoc`) is
 * required for the theme's `/theme-assets/...` CSS to resolve at all. `<iframe src>` embedding does
 * not require CORS (only script-driven cross-origin reads do), and this codebase sets no
 * `X-Frame-Options`/`frame-ancestors` anywhere that would block it (checked `src/server/app.ts`). The
 * cross-origin document's `contentDocument` is therefore unreachable from here — nothing in this
 * component (or the raw-view fallback) depends on reaching into it.
 *
 * `SrcDocSandbox` (`@jini-ai/ui/renderers`) gives branch 3's document an opaque origin: its `sandbox`
 * attribute omits `allow-same-origin`, which is asserted by that component's own regression test, so
 * generated markup cannot reach the admin's cookies, storage or DOM even though scripts run in it.
 * Branches 1 and 2 do not need that same sandboxing — both are same-origin-appropriate, unsandboxed
 * loads (a real visitor's load, or an authenticated admin's own content through the real theme), and
 * adding `sandbox` there would only break the theme's own scripts (nav toggle, reveal-on-scroll) for
 * no security gain.
 */
function PagePreview({
  html,
  width,
  slug,
  status,
  dirty,
  contentDirty,
  templatePreviewUrl,
  frameRef,
  paneWidth,
}: {
  html: string;
  width: number;
  slug: string;
  status: "draft" | "published";
  dirty: boolean;
  contentDirty: boolean;
  /** Pre-built by `usePageEditor` — see this function's own doc, branch 2. */
  templatePreviewUrl: string;
  /** Frame element to measure and its live-measured width — both owned by `usePageEditor`
   *  (`hooks/use-page-editor.hooks.ts`), not local state, so they survive this component's own
   *  mount/unmount as the operator switches tabs. `frameRef` is a CALLBACK ref, not a `RefObject` —
   *  see that hook's own comment on why the measuring effect there is keyed on the frame node itself
   *  rather than `view` or an empty dependency array. */
  frameRef: (node: HTMLDivElement | null) => void;
  paneWidth: number;
}) {
  const scale = Math.min(1, paneWidth / width);
  const canShowLiveSite = status === "published" && !dirty;
  // Template-preview fix (2026-08-11) — see this function's own doc, branch 2. Deliberately requires
  // `status === "published"`, NOT just `!contentDirty`: a draft's own `{"type":"content"}` slot still
  // resolves through `resolveHtmlPageEmbeds`'s visibility-filtered "content" resolver
  // (`resolver-service.ts`'s guard 2, `findPublishedPostById`), which returns nothing for an
  // unpublished row — confirmed live in this fix's own integration test
  // (`admin-post-template-preview.test.ts`'s draft case). Widening this to drafts would show styled
  // chrome around an EMPTY body (the REQ-28 placeholder), which reads as "my content disappeared" —
  // worse than the honest raw-body fallback a draft already gets. So this is exactly the reported
  // bug's own scenario: published, body/title/slug all saved, only `templateChoice` is pending.
  const canShowTemplatePreview = status === "published" && !contentDirty && !canShowLiveSite;

  return (
    <>
      {canShowLiveSite ? null : (
        <p className="page-preview-notice">
          {pagePreviewNotice({ canShowTemplatePreview, status })}
        </p>
      )}
      <div ref={frameRef} className="page-preview-frame" style={{ height: `${900 * scale}px` }}>
        <div
          className="page-preview-scaler"
          style={{ width: `${width}px`, height: "900px", transform: `scale(${scale})` }}
        >
          <PagePreviewFrame
            canShowLiveSite={canShowLiveSite}
            canShowTemplatePreview={canShowTemplatePreview}
            slug={slug}
            html={html}
            templatePreviewUrl={templatePreviewUrl}
          />
        </div>
      </div>
    </>
  );
}

/**
 * The three-way surface choice from `PagePreview`'s own doc comment (live site / template preview /
 * raw sandbox), as a top-level function so its branching scores independently of `PagePreview`'s own
 * complexity — same pattern `PageEditorToolbarEnd` above uses for `PageEditor`'s own render branches.
 */
function PagePreviewFrame({
  canShowLiveSite,
  canShowTemplatePreview,
  slug,
  html,
  templatePreviewUrl,
}: {
  canShowLiveSite: boolean;
  canShowTemplatePreview: boolean;
  slug: string;
  html: string;
  /** Pre-built by `usePageEditor` — see `PagePreview`'s own doc, branch 2. */
  templatePreviewUrl: string;
}) {
  if (canShowLiveSite) {
    return (
      <iframe src={siteUrl(pagePublicPath(slug))} title="Page preview" className="page-preview-iframe" referrerPolicy="no-referrer" />
    );
  }
  if (canShowTemplatePreview) {
    return (
      <iframe
        src={templatePreviewUrl}
        title="Page preview"
        className="page-preview-iframe"
        referrerPolicy="no-referrer"
      />
    );
  }
  return <SrcDocSandbox html={html} title="Page preview" className="page-preview-iframe" />;
}

/**
 * The notice text above a preview that isn't the live site — one branch per `PagePreviewFrame` case
 * minus the live-site one (which shows no notice at all; `PagePreview` skips calling this then).
 *
 * Rendered BEFORE `.page-preview-frame` in `PagePreview`, not after (visibility fix — the frame is up
 * to 900px tall before scaling, `pages.css`'s `.page-preview-frame`; a notice placed below it needed a
 * scroll past that height to ever be seen, which is exactly the gap `ADS-memory/reports/implementation/
 * 2026-08-11-template-preview-render-bug.md` flagged and explicitly left unfixed — "not a missing
 * feature, a visibility gap"). Placing it first means the raw-body fallback reads as an explained
 * state as soon as the tab switches, instead of looking like the theme failed to load.
 */
function pagePreviewNotice({
  canShowTemplatePreview,
  status,
}: {
  canShowTemplatePreview: boolean;
  status: "draft" | "published";
}): string {
  if (canShowTemplatePreview) {
    return "Previewing your saved content through the newly selected template — save to update the live page.";
  }
  if (status !== "published") {
    return "This is the raw body only — publish this page to preview it with the theme's real template and CSS.";
  }
  return "This is the raw body only — save your changes to preview them with the theme's real template and CSS.";
}
