import { useEffect, useRef, useState } from "react";
import { ConfirmDialog, InteractiveHtmlEditor } from "@jini-ai/admin/react";
import { SrcDocSandbox } from "@jini-ai/ui/renderers";

import { api } from "../../lib/api";
import { siteUrl } from "../../lib/site-url";
import { navigate } from "../../lib/router";
import { prettifyHtml } from "./lib/prettify-html";
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
    contentDirty,
    save,
    remove,
    confirmingDelete,
    setConfirmingDelete,
    deleting,
  } = usePageEditorHook(routeSlug);

  // HTML tab pretty-printing (owner-reported regression, 2026-08-11 — verified nothing formatted
  // this view before either; see `lib/prettify-html.ts`'s file header). `draftHtml` is a LOCAL,
  // display-only copy of `html`: merely switching to the HTML tab reformats and shows it here, but
  // never calls `setHtml`, so `dirty` (computed as `html !== savedHtml` in the hook) stays exactly
  // what it was before the operator looked at this tab — a display concern must never by itself mark
  // the page as having unsaved changes. Typing in the textarea below writes straight through to
  // BOTH `draftHtml` and the real `setHtml`, unchanged from how the textarea always worked, so the
  // only way the prettified whitespace becomes part of the saved page is if the operator actually
  // edits on top of it (the formatter's own safety rule makes that whitespace render-invisible
  // either way — see the file header).
  const [draftHtml, setDraftHtml] = useState(() => prettifyHtml(html));
  const prevViewRef = useRef(view);
  useEffect(() => {
    if (view === "html" && prevViewRef.current !== "html") {
      setDraftHtml(prettifyHtml(html));
    }
    prevViewRef.current = view;
  }, [view, html]);

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
        {/* Device-width control and template picker share the toolbar's right-hand side (owner
            feedback, 2026-08-11: "move the UI for the template dropdown where the desktop tablet
            mobile is right now ... so it's all one row" — the picker's own standalone row above is
            gone). `.page-editor-toolbar-end` is a plain grouping wrapper (`pages.css`) so
            `.page-editor-toolbar`'s existing `justify-content: space-between` still only has to
            place two things: the view tabs on the left, this group on the right. */}
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
                >
                  {entry.label}
                </button>
              ))}
              <span className="page-editor-width">{PAGE_PREVIEW_WIDTHS[device]}px</span>
            </div>
          ) : null}
          {/* Pages template picker (Task 4, 2026-08-11) — mirrors `PostEditor.tsx`'s own
              `.editor-template-picker` markup/classes verbatim. Rendered only for an `"html"`-format
              Page: a `"doc"`-format Page (pre-conversion legacy row) has no render path that would
              honor a template choice yet (`isEligibleForTemplateBranch` requires
              `bodyFormat: "html"`), so showing the picker on one would let an operator set a value
              with no visible effect.

              UNLIKE the Post picker, the selected value is NOT defaulted to the theme's first
              template when unset — see `use-page-editor.hooks.ts`'s load effect and
              `isEligibleForTemplateBranch`'s doc for the full reasoning: "no template chosen" is
              a Page's normal, fully-working state (render its own body), not an absence-of-decision
              needing a UI default to stay honest. */}
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
                  // `isEligibleForTemplateBranch`'s doc).
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
        </div>
      </div>

      {view === "preview" ? (
        <PagePreview
          id={page.id}
          html={html}
          width={PAGE_PREVIEW_WIDTHS[device]}
          slug={slug}
          status={status}
          dirty={dirty}
          contentDirty={contentDirty}
          templateChoice={templateChoice}
        />
      ) : view === "interactive" ? (
        // Remounts with fresh `html` on every tab switch — see `InteractiveHtmlEditor`'s own file
        // header for why it reads `html` once at mount rather than reacting to later prop changes.
        <InteractiveHtmlEditor html={html} onChange={setHtml} />
      ) : (
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
 *    is pending): iframes `api.templatePreviewUrl`, an admin-only render of this SAME saved content
 *    through the PENDING template choice — same render pipeline as branch 1 (`renderViaTemplate`,
 *    `routes/admin/posts/template-preview.ts`), just looked up by id instead of by public slug. This
 *    is the fix, and exactly the reported bug's own repro: picking a template from the dropdown marks
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
  id,
  html,
  width,
  slug,
  status,
  dirty,
  contentDirty,
  templateChoice,
}: {
  id: string;
  html: string;
  width: number;
  slug: string;
  status: "draft" | "published";
  dirty: boolean;
  contentDirty: boolean;
  templateChoice: string | null;
}) {
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
      <div ref={frameRef} className="page-preview-frame" style={{ height: `${900 * scale}px` }}>
        <div
          className="page-preview-scaler"
          style={{ width: `${width}px`, height: "900px", transform: `scale(${scale})` }}
        >
          {canShowLiveSite ? (
            <iframe
              src={siteUrl(`/${slug}`)}
              title="Page preview"
              className="page-preview-iframe"
              referrerPolicy="no-referrer"
            />
          ) : canShowTemplatePreview ? (
            <iframe
              src={api.templatePreviewUrl(id, templateChoice)}
              title="Page preview"
              className="page-preview-iframe"
              referrerPolicy="no-referrer"
            />
          ) : (
            <SrcDocSandbox html={html} title="Page preview" className="page-preview-iframe" />
          )}
        </div>
      </div>
      {canShowLiveSite ? null : (
        <p className="page-preview-notice">
          {canShowTemplatePreview
            ? "Previewing your saved content through the newly selected template — save to update the live page."
            : status !== "published"
              ? "This is the raw body only — publish this page to preview it with the theme's real template and CSS."
              : "This is the raw body only — save your changes to preview them with the theme's real template and CSS."}
        </p>
      )}
    </>
  );
}
