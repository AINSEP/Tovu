import { useEffect, useRef, useState } from "react";
import { ConfirmDialog, InteractiveHtmlEditor } from "@jini-ai/admin/react";
import { SrcDocSandbox } from "@jini-ai/ui/renderers";

import { siteUrl } from "../../lib/site-url";
import { navigate } from "../../lib/router";
import {
  PAGE_PREVIEW_WIDTHS,
  usePageEditor,
  type PagePreviewDevice,
  type PageEditorView,
} from "./hooks/use-page-editor.hooks";

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
  usePageEditorHook?: typeof usePageEditor;
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

export function PageEditor({ slug: routeSlug, usePageEditorHook = usePageEditor }: PageEditorProps) {
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
    view,
    setView,
    device,
    setDevice,
    saving,
    dirty,
    save,
    remove,
    confirmingDelete,
    setConfirmingDelete,
    deleting,
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
          The chrome was never the problem — the Tiptap body under it was. */}
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

      {/* Pages template picker (Task 4, 2026-08-11) — mirrors `PostEditor.tsx`'s own
          `.editor-template-picker` markup/classes verbatim (no new CSS added, per this task's file-
          ownership constraint on `styles.css`). Rendered only for an `"html"`-format Page: a
          `"doc"`-format Page (pre-conversion legacy row) has no render path that would honor a
          template choice yet (`isEligibleForPageTemplateBranch` requires `bodyFormat: "html"`), so
          showing the picker on one would let an operator set a value with no visible effect.

          UNLIKE the Post picker, the selected value is NOT defaulted to the theme's first template
          when unset — see `use-page-editor.hooks.ts`'s load effect and `isEligibleForPageTemplateBranch`'s
          doc for the full reasoning: "no template chosen" is a Page's normal, fully-working state
          (render its own body), not an absence-of-decision needing a UI default to stay honest. */}
      {page.bodyFormat === "html" ? (
        <div className="editor-template-picker">
          <label className="a11y-label-wrap">
            <span className="visually-hidden">Template</span>
          </label>
          {availableTemplates.length > 0 ? (
            <select
              value={templateChoice ?? ""}
              // `e.target.value`, not `|| null` — `""` is a legitimate stored value here (though,
              // unlike Posts, it behaves identically to `null` at render time — see
              // `isEligibleForPageTemplateBranch`'s doc).
              onChange={(e) => setTemplateChoice(e.target.value)}
            >
              {availableTemplates.map((template) => (
                <option key={template} value={template}>
                  {template}
                </option>
              ))}
              <option value="">No template chosen</option>
            </select>
          ) : (
            <select disabled value="">
              <option value="">No templates for this theme</option>
            </select>
          )}
        </div>
      ) : null}

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
            >
              {entry.label}
            </button>
          ))}
        </div>
        {view === "preview" ? (
          <div className="segmented" role="group" aria-label="Preview width">
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
        ) : null}
      </div>

      {view === "preview" ? (
        <PagePreview html={html} width={PAGE_PREVIEW_WIDTHS[device]} />
      ) : view === "interactive" ? (
        // Remounts with fresh `html` on every tab switch — see `InteractiveHtmlEditor`'s own file
        // header for why it reads `html` once at mount rather than reacting to later prop changes.
        <InteractiveHtmlEditor html={html} onChange={setHtml} />
      ) : (
        <textarea
          className="page-html-source"
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          spellCheck={false}
          aria-label="Page HTML"
          placeholder="This page has no HTML yet. Ask the assistant to build it, or write some here."
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
 * Renders the page at a fixed viewport width and scales the whole thing down to fit the pane.
 *
 * The scale is a CSS transform on a fixed-width box, not a responsive iframe, and that difference is
 * the entire point — see `PAGE_PREVIEW_WIDTHS`. The wrapper's height is scaled to match so the
 * transformed content does not leave a gap or overflow underneath it.
 *
 * `SrcDocSandbox` (`@jini-ai/ui/renderers`) gives the document an opaque origin: its `sandbox`
 * attribute omits `allow-same-origin`, which is asserted by that component's own regression test, so
 * generated markup cannot reach the admin's cookies, storage or DOM even though scripts run in it.
 */
function PagePreview({ html, width }: { html: string; width: number }) {
  const frameRef = useRef<HTMLDivElement>(null);
  // The frame's REAL rendered width, measured live via `ResizeObserver` rather than a guessed
  // constant — a flat `880` here previously meant the scale computed once at mount and stayed frozen
  // across a window resize, a sidebar collapse, or the assistant dock opening/closing (this is the
  // bug `ThemeExplore.tsx`'s own `ThemeExplorePreview` copied verbatim from here, then fixed live —
  // see that file's `fd26d93`). `880` survives only as the pre-measurement default so the first
  // paint still has a sane scale instead of `Infinity`/`NaN` from a zero-width ref.
  //
  // jsdom implements no `ResizeObserver` at all (`__tests__/setup.ts`'s own comment — deliberately
  // left unstubbed, so a test can't pass without the measurement ever happening) — guarded exactly
  // like `SeeMore.hooks.tsx`'s own `typeof ResizeObserver !== "function"` check, so this component
  // still renders (at the `880` default) in every existing/new unit test.
  const [paneWidth, setPaneWidth] = useState(880);
  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setPaneWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(1, paneWidth / width);

  return (
    <div ref={frameRef} className="page-preview-frame" style={{ height: `${900 * scale}px` }}>
      <div
        className="page-preview-scaler"
        style={{ width: `${width}px`, height: "900px", transform: `scale(${scale})` }}
      >
        <SrcDocSandbox html={html} title="Page preview" className="page-preview-iframe" />
      </div>
    </div>
  );
}
