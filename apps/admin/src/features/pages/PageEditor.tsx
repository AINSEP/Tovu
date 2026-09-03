import { ConfirmDialog, InteractiveHtmlEditor } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";
import { SrcDocSandbox } from "@jini-ai/ui/renderers";

import type { Translate } from "../../lib/dictionary-translator";
import { siteUrl } from "../../lib/site-url";
import {
  PAGE_PREVIEW_WIDTHS,
  useWiredPageEditor,
  type PagePreviewDevice,
  type PageEditorView,
} from "./hooks/use-page-editor.hooks";
import type { ThemeCanvasMode, ThemeCanvasStylingState } from "./hooks/use-theme-canvas-styling.hooks";

/**
 * @file The Pages editor — markup only. State lives in `hooks/use-page-editor.hooks.ts`.
 *
 * **There is no Tiptap here, and there never will be.** A Page is a bespoke HTML document; the
 * editing surfaces are the raw HTML tab and — the merged "Visual" tab — either a rendered preview of
 * the real published route or a GrapesJS-backed surface for clicking into rendered text and editing
 * it in place (`@jini-ai/admin/react`'s `InteractiveHtmlEditor`). GrapesJS does not contradict the
 * "no Tiptap" invariant: it edits and exports raw HTML directly, `html`/`setHtml` above stay the
 * single source of truth, and there is no parallel structured-document format the way Tiptap's
 * `bodyJson` would be — text editing and basic formatting only this pass, not Gutenberg-style block
 * manipulation. Posts keep Tiptap in `features/posts/PostEditor.tsx`, which this screen replaces for
 * `kind: "page"` entries — that screen was previously reached for Pages too, differing only by a
 * `kindLabel === "page"` ternary on its heading while still mounting the Tiptap toolbar over a
 * document Tiptap would silently mangle.
 *
 * **Tab merge (2026-09-02).** "Interactive" and "Preview" used to be two of three tabs; they are now
 * one, and {@link PageEditorController.editing} decides which renderer it mounts. See
 * `PageEditorView`'s own doc (`hooks/use-page-editor.hooks.ts`) for why they merged. Neither
 * renderer was rewritten to do it: `PagePreview` and `InteractiveHtmlEditor` are the same two
 * components, composed under one tab instead of two, which is what keeps the merge revertible as a
 * single commit. The controls follow their renderer — the device-width switcher shows only in
 * preview mode (it scales a fixed-width box `PagePreview` owns and the canvas has no equivalent),
 * the colour-mode switcher only in edit mode (the preview iframe is cross-origin and cannot be
 * driven from here) — because a control that renders where it cannot act reads as broken.
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

/**
 * The two tabs, HTML first so the merged Visual tab sits where "Preview" used to (rightmost) —
 * "Visual", not "Preview", because the tab is editable by default and calling an editing surface a
 * preview would be a lie, and not "Interactive" because it also holds the read-only full-chrome
 * render. Labels are English source strings resolved through `t` at render time, per this app's
 * "the copy string IS its own i18n key" convention.
 */
const VIEWS: ReadonlyArray<{ key: PageEditorView; label: string }> = [
  { key: "html", label: "HTML" },
  { key: "visual", label: "Visual" },
];

/** The merged Visual tab's Edit toggle, as the same two-button `.segmented` shape every other
 *  control on this toolbar uses. Two labelled states rather than one pressable "Edit" button: both
 *  halves of the merge stay named, so an operator can see what the other state gives them. */
const EDIT_MODES: ReadonlyArray<{ editing: boolean; label: string }> = [
  { editing: true, label: "Edit" },
  { editing: false, label: "Preview" },
];

/** The canvas colour-mode control's two states — see `ThemeCanvasMode` for why "Dark" names the
 *  theme's DEFAULT token set and what would make that label wrong. */
const THEME_MODES: ReadonlyArray<{ key: ThemeCanvasMode; label: string }> = [
  { key: "dark", label: "Dark" },
  { key: "light", label: "Light" },
];

/**
 * The editor header's action row — back link, save status, the publish/save/delete buttons.
 *
 * Extracted out of `PageEditor` because this is where nearly all of that component's branching
 * lived: the message/error spans, the publish button's conditional render, the save button's
 * className, and its "Saving…"/"Save •"/"Save" label are five independent decisions that don't
 * depend on the preview/HTML body below them. As a top-level function its branches are scored in
 * their own scope instead of accumulating onto `PageEditor`'s — same split as
 * `features/posts/PostEditor.tsx`'s `PostEditorHeader`.
 */
function PageEditorHeader({
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
    <div className="page-header">
      <div className="page-header-text">
        <p className="page-kicker">Content</p>
        <h1 className="page-title">Edit page</h1>
        <p className="page-description">
          Ask the assistant to build this page, or edit the HTML directly.
        </p>
      </div>
      <div className="page-actions">
        {/* Guards an in-app navigation away from unsaved work — the same protection the agent's
            own navigation gate is meant to apply, applied here to a human click. */}
        <a
          href="/admin/pages"
          onClick={(e) => {
            if (dirty && !window.confirm("This page has unsaved changes. Leave anyway?")) {
              e.preventDefault();
            }
          }}
        >
          <button type="button" className="btn-secondary">
            ← Pages
          </button>
        </a>
        {message ? <span className="save-ok">{message}</span> : null}
        {error ? <span className="save-error">{error}</span> : null}
        <select value={status} onChange={(e) => setStatus(e.target.value as "draft" | "published")}>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
        {status === "draft" ? (
          <button type="button" onClick={onPublish} disabled={saving}>
            Publish
          </button>
        ) : null}
        <button
          type="button"
          className={status === "draft" ? "btn-secondary" : undefined}
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving…" : dirty ? "Save •" : "Save"}
        </button>
        <button type="button" className="btn-danger" onClick={onDeleteClick}>
          Delete
        </button>
      </div>
    </div>
  );
}

/**
 * The merged Visual tab's two mode controls: the Edit toggle (always, in that tab) and the one
 * switcher that belongs to whichever renderer the toggle selected — device width for the iframe
 * preview, canvas colour mode for the GrapesJS canvas.
 *
 * Exactly one of those two switchers is ever mounted, and neither is ever mounted disabled. Each acts
 * on machinery only its own renderer has: `PAGE_PREVIEW_WIDTHS` works by rendering the document at a
 * fixed width inside a CSS-scaled box that `PagePreview` alone owns, and the colour mode works by
 * choosing which token set `useThemeCanvasStyling` puts on the canvas document's `:root`. Shown in
 * the wrong mode, either one would be a control an operator could click with no effect — which is
 * why they are hidden rather than disabled (`ThemeCanvasMode`'s doc has the cross-origin detail for
 * why the colour mode genuinely cannot reach the preview iframe).
 *
 * A separate function from {@link PageEditorTemplatePicker} below because they answer to different
 * state: this group appears only in the `visual` tab and re-renders on every mode click, while the
 * picker is tab-independent and keyed off the page's `bodyFormat`. Splitting them also keeps each
 * one's branches scored in its own scope rather than accumulating onto `PageEditor`'s, the same
 * reason `PageEditorHeader` above was extracted.
 */
function PageEditorVisualControls({
  editing,
  setEditing,
  device,
  setDevice,
  themeMode,
  setThemeMode,
  t,
}: {
  editing: boolean;
  setEditing: (value: boolean) => void;
  device: PagePreviewDevice;
  setDevice: (value: PagePreviewDevice) => void;
  themeMode: ThemeCanvasMode;
  setThemeMode: (value: ThemeCanvasMode) => void;
  t: Translate;
}) {
  return (
    <>
      <div
        className="segmented"
        role="group"
        aria-label={t("Edit mode")}
        {...agentHandle("page-edit-mode", {
          role: "button",
          label:
            "Whether the Visual tab is editable. Edit shows the in-place editing canvas for the " +
            "page's own content region; Preview shows the published page with its real nav and " +
            "footer, read-only. Switching is instant and discards nothing.",
        })}
      >
        {EDIT_MODES.map((entry) => (
          <button
            key={entry.label}
            type="button"
            aria-pressed={editing === entry.editing}
            className={editing === entry.editing ? "is-active" : undefined}
            onClick={() => setEditing(entry.editing)}
          >
            {t(entry.label)}
          </button>
        ))}
      </div>
      {editing ? (
        <div
          className="segmented"
          role="group"
          aria-label={t("Colour mode")}
          {...agentHandle("page-colour-mode", {
            role: "button",
            label:
              "Which of the theme's colour modes the editing canvas renders against. Dark is the " +
              "theme's default and is how the page actually publishes. Affects the canvas only, " +
              "never the saved HTML.",
          })}
        >
          {THEME_MODES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={themeMode === entry.key}
              className={themeMode === entry.key ? "is-active" : undefined}
              onClick={() => setThemeMode(entry.key)}
            >
              {t(entry.label)}
            </button>
          ))}
        </div>
      ) : (
        <div
          className="segmented"
          role="group"
          aria-label={t("Preview width")}
          {...agentHandle("page-preview-width", {
            role: "button",
            label:
              "The viewport width the preview renders AT, independent of how much room the pane " +
              "has — the document is rendered at this width and scaled down to fit.",
          })}
        >
          {DEVICES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={device === entry.key}
              className={device === entry.key ? "is-active" : undefined}
              onClick={() => setDevice(entry.key)}
            >
              {entry.label}
            </button>
          ))}
          <span className="page-editor-width">{PAGE_PREVIEW_WIDTHS[device]}px</span>
        </div>
      )}
    </>
  );
}

/**
 * The template picker, mirroring `PostEditor.tsx`'s own `.editor-template-picker` markup/classes
 * verbatim. Rendered only for an `"html"`-format Page: a `"doc"`-format Page (pre-conversion legacy
 * row) has no render path that would honor a template choice yet (`isEligibleForTemplateBranch`
 * requires `bodyFormat: "html"`), so showing the picker on one would let an operator set a value with
 * no visible effect.
 *
 * Tab-independent, unlike {@link PageEditorVisualControls}: the choice feeds the public render, the
 * preview iframe AND the canvas's own wrapper derivation, so it is as relevant while hand-editing
 * HTML as while looking at the result.
 *
 * UNLIKE the Post picker, the selected value is NOT defaulted to the theme's first template when
 * unset — see `use-page-editor.hooks.ts`'s load effect and `isEligibleForTemplateBranch`'s doc for the
 * full reasoning: "no template chosen" is a Page's normal, fully-working state (render its own body),
 * not an absence-of-decision needing a UI default to stay honest.
 */
function PageEditorTemplatePicker({
  availableTemplates,
  templateChoice,
  setTemplateChoice,
}: {
  availableTemplates: string[];
  templateChoice: string | null;
  setTemplateChoice: (value: string) => void;
}) {
  return (
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
            label:
              "Which theme page template this page renders through on the public site — set with " +
              'page.select_option, not click. "No template chosen" is a Page\'s normal state: it ' +
              "renders its own body through the theme's page shell.",
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
  );
}

/**
 * The toolbar's right-hand group — {@link PageEditorVisualControls} in the `visual` tab, plus the
 * template picker for an html-format page.
 *
 * Device-width control and template picker share this one row (owner feedback, 2026-08-11: "move the
 * UI for the template dropdown where the desktop tablet mobile is right now ... so it's all one row"
 * — the picker's own standalone row above is gone). `.page-editor-toolbar-end` is a plain grouping
 * wrapper (`pages.css`) so `.page-editor-toolbar`'s existing `justify-content: space-between` still
 * only has to place two things: the view tabs on the left, this group on the right. It already
 * wraps its own children (`flex-wrap: wrap`), which is what absorbs the merge's one extra control at
 * narrow widths without the tabs above having to move.
 */
function PageEditorToolbarEnd({
  view,
  editing,
  setEditing,
  device,
  setDevice,
  themeMode,
  setThemeMode,
  bodyFormat,
  availableTemplates,
  templateChoice,
  setTemplateChoice,
  t,
}: {
  view: PageEditorView;
  editing: boolean;
  setEditing: (value: boolean) => void;
  device: PagePreviewDevice;
  setDevice: (value: PagePreviewDevice) => void;
  themeMode: ThemeCanvasMode;
  setThemeMode: (value: ThemeCanvasMode) => void;
  bodyFormat: "doc" | "html" | undefined;
  availableTemplates: string[];
  templateChoice: string | null;
  setTemplateChoice: (value: string) => void;
  t: Translate;
}) {
  return (
    <div className="page-editor-toolbar-end">
      {view === "visual" ? (
        <PageEditorVisualControls
          editing={editing}
          setEditing={setEditing}
          device={device}
          setDevice={setDevice}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          t={t}
        />
      ) : null}
      {bodyFormat === "html" ? (
        <PageEditorTemplatePicker
          availableTemplates={availableTemplates}
          templateChoice={templateChoice}
          setTemplateChoice={setTemplateChoice}
        />
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
    editing,
    setEditing,
    themeMode,
    setThemeMode,
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
    t,
  } = usePageEditorHook(routeSlug);

  if (error && !page) return <div className="notice error">{error}</div>;
  if (!page) return <div className="notice">Loading editor…</div>;

  return (
    <div className="page">
      <PageEditorHeader
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
          />
        </label>

        <div className="editor-slug">
          <span>/</span>
          <label className="a11y-label-wrap">
            <span className="visually-hidden">URL slug</span>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} />
          </label>
          <a href={siteUrl(`/${slug}`)} target="_blank" rel="noreferrer">
            view ↗
          </a>
        </div>
      </div>

      <div className="page-editor-toolbar">
        <div
          className="segmented"
          role="tablist"
          aria-label={t("Editor view")}
          {...agentHandle("page-view", {
            role: "button",
            label:
              "Which editing surface this page shows: HTML is the raw source, Visual is the " +
              "rendered page — editable or read-only depending on this screen's Edit toggle.",
          })}
        >
          {VIEWS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={view === entry.key}
              className={view === entry.key ? "is-active" : undefined}
              onClick={() => setView(entry.key)}
            >
              {t(entry.label)}
            </button>
          ))}
        </div>
        {/* Mode controls and template picker share the toolbar's right-hand side — see
            `PageEditorToolbarEnd`'s own doc for the layout history and the template-picker's rules. */}
        <PageEditorToolbarEnd
          view={view}
          editing={editing}
          setEditing={setEditing}
          device={device}
          setDevice={setDevice}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          bodyFormat={page.bodyFormat}
          availableTemplates={availableTemplates}
          templateChoice={templateChoice}
          setTemplateChoice={setTemplateChoice}
          t={t}
        />
      </div>

      {/* The merged Visual tab's two renderers, unchanged from when they were two tabs — see this
          file's header. `editing` picks between them; `view` only decides whether either mounts. */}
      {view === "html" ? (
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
        />
      ) : editing ? (
        <PageEditorCanvas
          html={html}
          setHtml={setHtml}
          canvasStyling={canvasStyling}
          themeMode={themeMode}
          t={t}
        />
      ) : (
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
      )}

      <ConfirmDialog
        open={confirmingDelete}
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
 * The merged Visual tab's editing half — the GrapesJS canvas, gated on its styling having settled.
 *
 * `InteractiveHtmlEditor` reads BOTH `html` and `canvasStyling` once at mount and never reacts to a
 * later prop change (see its own file header), which is what makes the two things below load-bearing
 * rather than incidental:
 *
 * 1. **The pending gate.** Mounting before the theme's token files settle leaves the canvas unstyled
 *    (browser-default Times on white) for the rest of its life, no matter what arrives afterwards.
 *    Since the tab merge this is now the FIRST thing the screen shows — `visual` + `editing` are both
 *    defaults — so the notice below is visible on a cold load rather than only after a tab click.
 * 2. **`key={themeMode}`.** Changing the colour mode produces new `canvasStyling`, which a mounted
 *    editor would ignore. Keying on the mode is what forces the remount that actually applies it.
 *    Nothing is lost by remounting: `html`/`setHtml` in `usePageEditor` are the single source of
 *    truth, and the fresh editor re-parses the current working copy. (The mode change also drives
 *    `canvasStyling` through a `pending` beat of its own — see `useThemeCanvasStyling` — so this key
 *    is belt-and-braces for the case where a cached fetch settles inside the same commit.)
 *
 * Extracted as its own function rather than left inline for the same reason every other piece of
 * this file was: the pending branch scores in its own scope instead of on `PageEditor`'s, which is
 * already at three render branches after the merge.
 */
function PageEditorCanvas({
  html,
  setHtml,
  canvasStyling,
  themeMode,
  t,
}: {
  html: string;
  setHtml: (value: string) => void;
  canvasStyling: ThemeCanvasStylingState;
  themeMode: ThemeCanvasMode;
  t: Translate;
}) {
  if (canvasStyling.status === "pending") {
    return <div className="notice">{t("Loading the theme's styles…")}</div>;
  }
  return (
    <InteractiveHtmlEditor
      key={themeMode}
      html={html}
      onChange={setHtml}
      canvasStyling={canvasStyling.styling}
    />
  );
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
      <iframe src={siteUrl(`/${slug}`)} title="Page preview" className="page-preview-iframe" referrerPolicy="no-referrer" />
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
