import { useState } from "react";
import { EditorContent, useEditorState, type Editor } from "@tiptap/react";
import { agentHandle } from "@jini-ai/agentic";
import { ConfirmDialog } from "@jini-ai/admin/react";
import { SrcDocSandbox } from "@jini-ai/ui/renderers";

import { EmbedInsertControl } from "../../components/EmbedInsertControl/EmbedInsertControl";
import { siteUrl } from "../../lib/site-url";
import { usePostEditor, type PostEditorView } from "./hooks/use-post-editor.hooks";
import { PostTemplateModal } from "./PostTemplateModal";
import { toolbarBtnClass } from "./rules";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { POSTS_DICT } from "./posts-i18n";

/**
 * @file The post/page editor screen — markup only.
 *
 * State, the TipTap instance, the load effect, save, delete, and the dirty guard all live in
 * `hooks/use-post-editor.hooks.ts`. The drop handler and the `data:` URL reader moved to `rules.ts`
 * as pure functions, where they can be driven with a fake `EditorView` instead of a real editor and
 * a real drag gesture.
 *
 * What stays: `Toolbar`, which is a genuinely inert render of editor commands, and the page markup.
 *
 * Shared between posts and pages via the same `/admin/posts/{id}` route — see `Pages.tsx`'s file
 * header. `post.kind` drives the display copy and the back-link target only.
 */

/** Product-facing labels, not library ones — "Tiptap" never appears in the UI; an author reads
 *  these as "the editor" and "how it looks on the site". */
const VIEWS: ReadonlyArray<{ key: PostEditorView; label: string }> = [
  { key: "edit", label: "Edit" },
  { key: "preview", label: "Preview" },
];

/** Formatting toolbar wired to the live editor. Active state stays in sync via useEditorState. */
function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    // EXEMPTION (complexity ceiling, 2026-08-06, updated for the ≤9/≤9 bar): ESLint scores this
    // selector's cyclomatic complexity at 27 against a 9 ceiling, but its cognitive complexity is
    // 0 — not "low", not reported at all even at threshold 0. That gap is the signature of a
    // measurement artifact, not real branching: this is a flat object literal of thirteen
    // `editor?.isActive(...) ?? false` fallbacks with no control flow between them, and ESLint's
    // cyclomatic rule counts each `?.` and `??` as its own decision point. There is nothing to
    // extract — splitting the fields across multiple selectors would still evaluate the same
    // thirteen fallbacks, just spread across more functions, and would break `useEditorState`'s
    // single-selector re-render-batching contract for no complexity benefit. Kept as one object so
    // `Toolbar` re-renders once per relevant editor state change instead of up to thirteen times.
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      strike: editor?.isActive("strike") ?? false,
      code: editor?.isActive("code") ?? false,
      h1: editor?.isActive("heading", { level: 1 }) ?? false,
      h2: editor?.isActive("heading", { level: 2 }) ?? false,
      h3: editor?.isActive("heading", { level: 3 }) ?? false,
      bullet: editor?.isActive("bulletList") ?? false,
      ordered: editor?.isActive("orderedList") ?? false,
      quote: editor?.isActive("blockquote") ?? false,
      codeBlock: editor?.isActive("codeBlock") ?? false,
      canUndo: editor?.can().undo() ?? false,
      canRedo: editor?.can().redo() ?? false,
    }),
  });

  const chain = () => editor.chain().focus();

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      <div className="grp">
        <button className={toolbarBtnClass(s.bold)} title="Bold (⌘B)" aria-pressed={s.bold} onClick={() => chain().toggleBold().run()}><b>B</b></button>
        <button className={toolbarBtnClass(s.italic)} title="Italic (⌘I)" aria-pressed={s.italic} onClick={() => chain().toggleItalic().run()}><i>I</i></button>
        <button className={toolbarBtnClass(s.strike)} title="Strikethrough" aria-pressed={s.strike} onClick={() => chain().toggleStrike().run()}><s>S</s></button>
        <button className={toolbarBtnClass(s.code)} title="Inline code" aria-pressed={s.code} onClick={() => chain().toggleCode().run()}>&lt;/&gt;</button>
      </div>
      <div className="grp">
        <button className={toolbarBtnClass(s.h1)} title="Heading 1" aria-pressed={s.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>H1</button>
        <button className={toolbarBtnClass(s.h2)} title="Heading 2" aria-pressed={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>H2</button>
        <button className={toolbarBtnClass(s.h3)} title="Heading 3" aria-pressed={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>H3</button>
      </div>
      <div className="grp">
        <button className={toolbarBtnClass(s.bullet)} title="Bullet list" aria-pressed={s.bullet} onClick={() => chain().toggleBulletList().run()}>• List</button>
        <button className={toolbarBtnClass(s.ordered)} title="Numbered list" aria-pressed={s.ordered} onClick={() => chain().toggleOrderedList().run()}>1. List</button>
        <button className={toolbarBtnClass(s.quote)} title="Quote" aria-pressed={s.quote} onClick={() => chain().toggleBlockquote().run()}>&ldquo; Quote</button>
        <button className={toolbarBtnClass(s.codeBlock)} title="Code block" aria-pressed={s.codeBlock} onClick={() => chain().toggleCodeBlock().run()}>{"{ }"}</button>
        <button className="tb-btn" title="Divider" onClick={() => chain().setHorizontalRule().run()}>―</button>
      </div>
      <div className="grp">
        <button className="tb-btn" title="Undo (⌘Z)" disabled={!s.canUndo} onClick={() => chain().undo().run()}>↺</button>
        <button className="tb-btn" title="Redo (⌘⇧Z)" disabled={!s.canRedo} onClick={() => chain().redo().run()}>↻</button>
      </div>
      <div className="grp">
        {/* Single "Embed" control (quick-and-dirty pass, 2026-08-05 — owner explicitly skipped
            formal spec/ADR process for this one) replacing the previously-separate "Media" and
            "Insert widget" buttons: Form and Menu are just the `contact-form`/`menu` widget TYPES
            (`WidgetConfigFields.tsx`), not separate mechanisms, so they used to be buried behind
            "Insert widget"'s type dropdown. `EmbedInsertControl` (`components/EmbedInsertControl/EmbedInsertControl.tsx`)
            surfaces Media/Form/Menu as one-click shortcuts plus a "Widget…" choice for the rest,
            composing the same `MediaPickerDialog`/`WidgetPickerDialog`/`WidgetAddControl` pieces
            `CollectionEntryEditor.tsx`/`WidgetRegionEditor.tsx` still use directly and unchanged. */}
        <EmbedInsertControl editor={editor} />
        <button
          className="tb-btn"
          title="Insert image by URL"
          onClick={() => {
            const src = window.prompt("Image URL:");
            if (!src) return;
            const alt = window.prompt("Alt text (optional):") ?? "";
            chain().setImage({ src, alt: alt || undefined }).run();
          }}
        >
          Img by URL
        </button>
      </div>
    </div>
  );
}

/**
 * The editor header's action row — back link, save status, the publish/save/delete buttons.
 *
 * Extracted out of `PostEditor` because this is where nearly all of that component's branching
 * lived: five independent ternaries (back-link label, the message/error spans, the publish button's
 * conditional render, and the save button's className) that don't depend on each other and don't
 * need to share scope with the body/toolbar markup below them. As a top-level function its own
 * branches are scored in their own scope instead of accumulating onto `PostEditor`'s.
 */
function PostEditorHeader({
  kindLabel,
  confirmLeave,
  message,
  error,
  status,
  setStatus,
  onPublish,
  onSave,
  onDeleteClick,
  t,
}: {
  kindLabel: "post" | "page";
  confirmLeave: () => boolean;
  message: string | null;
  error: string | null;
  status: "draft" | "published";
  setStatus: (value: "draft" | "published") => void;
  onPublish: () => void;
  onSave: () => void;
  onDeleteClick: () => void;
  t: (key: string) => string;
}) {
  return (
    <div
      className="page-header"
      {...agentHandle("post-header", {
        role: "region",
        label: "Editor header — back link, save status, publish state and the Save button",
      })}
    >
      <div className="page-header-text">
        <p className="page-kicker">{t("Content")}</p>
        <h1 className="page-title">{t(kindLabel === "page" ? "Edit page" : "Edit post")}</h1>
        <p className="page-description">
          {t(
            kindLabel === "page"
              ? "Update this page's title, body, and publish status."
              : "Update this post's title, body, and publish status.",
          )}
        </p>
      </div>
      <div className="page-actions">
        {/* Audit finding: no editor screen warns before an in-app navigation discards unsaved
            edits — confirmed live on this exact screen (edit the title, click this link, the
            edit is gone with no dialog). `preventDefault()` here also stops `router.ts`'s
            document-level click interceptor from firing `navigate()`, since that listener's
            first check is `event.defaultPrevented` — no change to `router.ts` needed. The nested
            `<button>` is styling only (matches Forms/Posts' own "back"/"new" link idiom); the
            real navigating element, its `href`, and its `onClick` guard all stay on the `<a>`.

            Kind-aware `href`/label, reusing the same `post.kind` check `remove()` already makes
            for its post-delete redirect just below — bug found during the page-header pass: this
            link used to be hardcoded to "/admin/posts"/"← Posts" even while editing a *page*, so
            it silently returned an operator to the wrong list. Deriving both from `kindLabel`
            (not two independent ternaries) is what stops them drifting apart again. */}
        <a
          href={`/admin/${kindLabel}s`}
          onClick={(e) => {
            if (!confirmLeave()) e.preventDefault();
          }}
          {...agentHandle("post-back-to-list", { role: "link", label: `Back to the list of all ${kindLabel}s` })}
        >
          <button type="button" className="btn-secondary">
            ← {kindLabel === "page" ? t("Pages") : t("Posts")}
          </button>
        </a>
        {message ? <span className="save-ok">{message}</span> : null}
        {error ? <span className="save-error">{error}</span> : null}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "draft" | "published")}
          {...agentHandle("post-status", {
            role: "field",
            label:
              "Whether this post is a draft or published — set with page.select_option, not click. " +
              "Setting to Draft unpublishes it (content is kept, just hidden from the site); this is " +
              "NOT the same as Delete, which moves the whole entry to the trash.",
          })}
        >
          <option value="draft">{t("Draft")}</option>
          <option value="published">{t("Published")}</option>
        </select>
        {/* Publish is the one-click "save this and put it live" shortcut, and only makes sense
            while there is something to publish — once `status` is already "published" (matching
            `RowMenu`'s own precedent in `Posts.tsx`, which omits "Disable" entirely for an
            already-draft row rather than showing it disabled) it disappears rather than
            rendering disabled with nothing left to do, and plain Save takes over as the primary
            action. The status select still covers the reverse direction (unpublish), unchanged. */}
        {status === "draft" ? (
          <button
            type="button"
            onClick={onPublish}
            {...agentHandle("post-publish", {
              role: "button",
              label:
                "Publish this post/page immediately — saves the current title, slug and body and " +
                "sets status to Published in one action. Only shown while the post is a draft; once " +
                "published, use Save for further edits.",
            })}
          >
            {t("Publish")}
          </button>
        ) : null}
        <button
          type="button"
          className={status === "draft" ? "btn-secondary" : undefined}
          onClick={onSave}
          {...agentHandle("post-save", { role: "button", label: "Save this post's title, slug, status and body" })}
        >
          {t("Save")}
        </button>
        <button
          type="button"
          className="btn-danger"
          onClick={onDeleteClick}
          {...agentHandle("post-delete", {
            role: "button",
            label:
              "Move this post/page to the trash — different from unpublishing (the Draft/Published " +
              "field above): the entry disappears from every list and the site. Asks for confirmation " +
              "before deleting.",
          })}
        >
          {t("Delete")}
        </button>
      </div>
    </div>
  );
}

export interface PostEditorProps {
  postId: string;
  /**
   * Dependency injection seam for tests — same convention as `Posts.tsx`'s `usePostsHook` and
   * `@jini-ai/ui`'s `useCustomSelect`.
   *
   * Defaulted to the real hook, so `panels.tsx` passes nothing. A stub lets a test render the
   * header, the status select, the Publish/Save branch and the confirm dialog without mounting
   * TipTap or serving a post — the existing suite currently has to stand up both.
   */
  usePostEditorHook?: typeof usePostEditor;
}

export function PostEditor({ postId, usePostEditorHook = usePostEditor }: PostEditorProps) {
  const {
    post,
    editor,
    title,
    setTitle,
    slug,
    setSlug,
    status,
    setStatus,
    templateChoice,
    setTemplateChoice,
    availableTemplates,
    activeThemeId,
    activeThemeTier,
    overridesThemePage,
    setOverridesThemePage,
    hasSlugCollision,
    view,
    setView,
    message,
    error,
    confirmingDelete,
    setConfirmingDelete,
    deleting,
    confirmLeave,
    dirty,
    save,
    remove,
  } = usePostEditorHook(postId);
  const locale = useAdminLocale();
  const t = (key: string): string => POSTS_DICT[locale]?.[key] ?? key;
  // View Template (2026-08-10) — called above the early returns below so hook order stays stable
  // across the loading/error/loaded renders, same reasoning as `Posts.tsx`'s `updatedSort` state.
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  if (error && !post) return <div className="notice error">{error}</div>;
  if (!post) return <div className="notice">Loading editor…</div>;

  const kindLabel = post.kind === "page" ? "page" : "post";

  return (
    <div className="page">
      <PostEditorHeader
        kindLabel={kindLabel}
        confirmLeave={confirmLeave}
        message={message}
        error={error}
        status={status}
        setStatus={setStatus}
        onPublish={() => save("published")}
        onSave={() => save()}
        onDeleteClick={() => setConfirmingDelete(true)}
        t={t}
      />
      {/* Audit finding: placeholder-only, no `<label>` — a screen reader gets nothing (title) or
          the bare `type="text"` announcement (slug, which had no placeholder either). The
          wrapping `<label>` + `.visually-hidden` text gives each a real accessible name without
          adding a visible caption above this screen's large title/slug controls (see
          `styles/editor.css`'s `.a11y-label-wrap` comment for why the wrap costs no layout). */}
      {/* Title + slug share one row (owner, 2026-08-11: "put the slug input right next to the title
          ... like we did the pages"), title capped at half the width with the slug group
          right-justified in the other half. Deliberately the same SHAPE as the Pages editor's
          `.page-title-row` but a separate class: Pages and Posts are separate features with separate
          stylesheets, and `styles/pages.css` says in its own header why their shared chrome lives in
          `editor.css` rather than being copied between them. The template picker used to keep its own
          row below this one; it now lives in the Edit/Preview toolbar row instead (see the comment on
          `.page-editor-toolbar` just below) — the row that carried it, `.editor-slug-row`, is gone. */}
      <div className="editor-title-row">
        <label className="a11y-label-wrap">
          <span className="visually-hidden">Post title</span>
          <input
            className="editor-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("Post title")}
            {...agentHandle("post-title", { role: "field", label: "This post's title" })}
          />
        </label>
        <div className="editor-slug">
          /{" "}
          <label className="a11y-label-wrap">
            <span className="visually-hidden">URL slug</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              {...agentHandle("post-slug", { role: "field", label: "URL slug this post is published at" })}
            />
          </label>
          <a
            href={siteUrl(`/${post.slug}`)}
            target="_blank"
            rel="noreferrer"
            {...agentHandle("post-view-live", { role: "link", label: "Open this post on the public site in a new tab" })}
          >
            view ↗
          </a>
          {/* The internal id used to be surfaced here as a read-only field (2026-08-10). Removed
              2026-08-11: the slug immediately to the left is now the record's routing key
              (`getAdminPostByIdOrSlug` resolves slug FIRST, id second) and is the only identity an
              author ever types or reads. Two id generators have been in play — seed literals like
              `post-about` and `idGen.newId()` UUIDs — so the stored id is neither stable in shape
              nor meaningful, and displaying it beside the real handle presented an implementation
              detail as though it were the record's identity. It is still reachable through the API
              and the row list; it just no longer competes with the slug for the author's attention. */}
        </div>
      </div>
      {/* Edit/Preview toolbar (2026-08-11, owner: "Let's have a preview button... a tab that shows
          either tiptap so they can edit, or how it looks when it's rendered" + "Keeping the template
          chooser on the right... that's how the others work"). Deliberately the SAME structure as
          the Pages editor's `.page-editor-toolbar` (`features/pages/PageEditor.tsx`) — tabs left,
          `.page-editor-toolbar-end` right — reusing its classes directly (`styles/pages.css`) rather
          than parallel Post-only ones: those classes already have a second consumer beyond Pages
          (`ThemeExplore.tsx`), so this is a third, not a fork. The template picker moved into
          `.page-editor-toolbar-end` verbatim from the old `.editor-slug-row` below it — only its
          MARKUP location changed; where its options/value come from is untouched (a concurrent
          agent owns that wiring). */}
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
              {t(entry.label)}
            </button>
          ))}
        </div>
        <div className="page-editor-toolbar-end">
          {/* Post-template-picker feature (2026-08-10) — rendered whenever this is a Post/
              formulaic-body record (`bodyFormat: "doc"`), not an `"html"`-format Page — a Page's body
              IS its own design already (see `resolveHtmlEmbedsForRender`'s own doc), so it has nothing
              to pick between. Untranslated (`t()` falls back to the raw key, same graceful-degrade
              every other string on this screen already relies on) — this repo's i18n dictionaries
              cover 19 locales and adding this feature's strings to all of them is out of scope for
              this pass; disclosed rather than silently skipped.

              Options list real templates FIRST, "No template chosen" LAST (owner's own ordering
              request) — matches `theme.json`'s own `postTemplate` doc ("ordered to nudge the right
              choice"): opting OUT is the one deliberate action, not the default you land on. The
              SELECTED value defaults to the first template too when nothing has been chosen yet (see
              the load effect below) — an author only ever sees "No template chosen" selected if they
              (or a prior save) explicitly picked it.

              When the active theme declares zero templates, the row previously vanished entirely
              (owner feedback, 2026-08-09: "it makes sense... but it should still be there" — an empty
              theme should read as "nothing to choose" in the UI, not disappear as if the feature
              itself weren't there). Renders a disabled control with a one-line explanation instead.

              Rendered regardless of `view` — same as Pages' own picker — because the template choice
              is a publish-time setting, not something specific to either tab. */}
          {(post.bodyFormat ?? "doc") === "doc" ? (
            <div className="editor-template-picker">
              <label className="a11y-label-wrap">
                <span className="visually-hidden">{t("Template")}</span>
              </label>
              {availableTemplates.length > 0 ? (
                <select
                  value={templateChoice ?? ""}
                  // `e.target.value`, NOT `|| null` — "No template chosen" must persist as `""`
                  // (explicitly opted out), which `resolveTemplate` treats differently from `null`
                  // (never chosen → falls back to the first template). Coercing to `null` here is what
                  // made the two indistinguishable and served 15 posts a diagnostic page.
                  onChange={(e) => setTemplateChoice(e.target.value)}
                  {...agentHandle("post-template-choice", {
                    role: "field",
                    label:
                      "Which theme page template this post renders through on the public site. " +
                      "Setting this to \"No template chosen\" shows a diagnostic page instead of the post, " +
                      "not a silent fallback to generic rendering.",
                  })}
                >
                  {availableTemplates.map((template) => (
                    <option key={template} value={template}>
                      {template}
                    </option>
                  ))}
                  <option value="">{t("No template chosen")}</option>
                </select>
              ) : null}
              {availableTemplates.length > 0 ? (
                // Read-only inspection, not editing (`PostTemplateModal.tsx`'s own file header —
                // "I just wanna see it" is the owner's own framing). Disabled rather than hidden
                // when nothing is chosen: an operator who opted out via "No template chosen" (`""`)
                // still sees the control, just inert, matching this screen's own precedent for the
                // theme-with-zero-templates `<select>` above rather than the row disappearing.
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!templateChoice}
                  onClick={() => setShowTemplateModal(true)}
                  {...agentHandle("post-view-template", {
                    role: "button",
                    label: "Open a read-only view of the selected template's HTML source. Nothing here is editable.",
                  })}
                >
                  {t("View Template")}
                </button>
              ) : (
                <select
                  disabled
                  value=""
                  {...agentHandle("post-template-choice", {
                    role: "field",
                    label: "The active theme declares no post templates, so there is nothing to choose here.",
                  })}
                >
                  <option value="">{t("No templates for this theme")}</option>
                </select>
              )}
            </div>
          ) : null}
        </div>
      </div>
      {/* Slug-collision override (2026-08-10) — surfaced live this session: a post at slug "about"
          was silently unreachable because the active theme ships its own pages/about.html at the
          same slug, and the theme page always won with zero indication why. Warn explicitly rather
          than let an author discover this by visiting the public URL and finding their post missing. */}
      {hasSlugCollision ? (
        <div className="notice warning" {...agentHandle("post-slug-collision-warning", {
          role: "region",
          label: "Warning: this post's slug is claimed by the active theme's own page",
        })}>
          <p>
            {t("The active theme has its own page at this slug — it will be shown instead of this post.")}
          </p>
          <label>
            <input
              type="checkbox"
              checked={overridesThemePage}
              onChange={(e) => setOverridesThemePage(e.target.checked)}
              {...agentHandle("post-override-theme-page", {
                role: "field",
                label: "Show this post instead of the active theme's own same-slug page",
              })}
            />
            {" "}
            {t("Show this post instead")}
          </label>
        </div>
      ) : null}
      {view === "preview" ? (
        // `editor.getHTML()` read fresh every render, same idiom the hook already uses for
        // `editor.getJSON()` in its own dirty comparison — TipTap's content lives in the editor's
        // own imperative state, and `onUpdate`'s `bodyVersion` bump is what makes this re-evaluate
        // after a keystroke rather than going stale.
        <PostPreview bodyHtml={editor?.getHTML() ?? ""} slug={slug} status={status} dirty={dirty} />
      ) : (
        <div
          className="editor-shell post-editor-pane"
          {...agentHandle("post-editor-shell", {
            role: "region",
            label: "Formatting toolbar and the post body editor",
          })}
        >
          {editor ? <Toolbar editor={editor} /> : null}
          {/* `role: "field"` rather than `region`: this is a TipTap `contenteditable`, which the
              page driver treats as a fillable rich-text surface (see its `isEditableRegion`), so an
              agent can read and write the body through the same field verbs it uses for an input. */}
          <div
            className="editor-body"
            {...agentHandle("post-body", { role: "field", label: "The post's rich-text body content" })}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmingDelete}
        title={t("Move to trash?")}
        body={
          <p>
            {t(kindLabel === "page" ? "Move this page" : "Move this post")} (&quot;{post.title}&quot;){" "}
            {t(
              kindLabel === "page"
                ? "to trash? It will disappear from the site and from the pages list."
                : "to trash? It will disappear from the site and from the posts list.",
            )}
          </p>
        }
        confirmLabel={t("Move to trash")}
        destructive
        pending={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmingDelete(false)}
      />
      {/* Conditionally mounted, not always-mounted-with-`open`: `PreviewModalShell` is a plain
          fixed-position overlay `<div>` (see its own file header), not the native `<dialog>`
          `ConfirmDialog` above wraps — there is no `open` prop to toggle, so this follows
          `AgentPluginDetailsModal`'s own call site (`AgentPlugins.tsx`) instead. `templateChoice`
          and `activeThemeId` are re-checked here (not just at the button's `disabled`) so this can
          never render with an empty/`null` URL segment even if state changes out from under an
          already-open modal. */}
      {showTemplateModal && templateChoice && activeThemeId ? (
        <PostTemplateModal
          themeId={activeThemeId}
          themeTier={activeThemeTier}
          templateFilename={templateChoice}
          onClose={() => setShowTemplateModal(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * Renders the post the way the Preview tab shows it — mirrors `features/pages/PageEditor.tsx`'s
 * `PagePreview` exactly, same branching rule and same reasoning, reused rather than reinvented (see
 * `ADS-memory/reports/implementation/2026-08-11-html-view-and-preview.md` for the original decision
 * record this repeats): a PUBLISHED, un-dirtied post is shown by iframing its own real public URL
 * (`siteUrl`, the same helper the "view ↗" link already uses) directly — the exact response a
 * visitor gets, template/theme CSS/nav/footer/widget resolution and all, with zero risk of a second
 * render path drifting from the real one (`renderDocNode`, `src/server/http/site/render.ts` — out
 * of this change's scope, and reimplementing it here would be exactly that drift risk).
 *
 * A draft, or a published post with unsaved edits, has nothing (or stale content) at that public
 * URL yet — `getPublishedPostBySlug` 404s on anything not `status: "published"`, and unsaved edits
 * are by definition not saved there until Save runs — so both fall back to a rendering of the LIVE
 * EDITOR BUFFER instead, with a notice explaining why the theme isn't applied. Unlike Pages (whose
 * body already IS raw HTML), a post's body is TipTap `bodyJson`, so the fallback's `bodyHtml` comes
 * from `editor.getHTML()` — TipTap's own client-side serializer, not the server's `renderDocNode` —
 * fed into the same sandboxed `SrcDocSandbox` Pages' fallback uses. This is a deliberately shallower
 * render than the real one (plain marks-to-tags only: no widget resolution, no media-transform
 * URLs, no theme wrapper) — disclosed as a rough shape/content check, not parity, for the same
 * reason the live-site branch above exists: building a second `renderDocNode` here would be the
 * duplication this whole approach is chosen to avoid.
 *
 * No device-width scaling here (unlike `PagePreview`) — that machinery exists so an operator can
 * preview a page at Desktop/Tablet/Mobile widths, which nothing in this dispatch asked for on the
 * Post side; the frame simply fills the pane at its natural width, same as the Tiptap editor above
 * it always has.
 */
function PostPreview({
  bodyHtml,
  slug,
  status,
  dirty,
}: {
  bodyHtml: string;
  slug: string;
  status: "draft" | "published";
  dirty: boolean;
}) {
  const canShowLiveSite = status === "published" && !dirty;

  return (
    <>
      <div className="editor-shell post-editor-pane">
        {canShowLiveSite ? (
          <iframe
            src={siteUrl(`/${slug}`)}
            title="Post preview"
            className="editor-preview-iframe"
            referrerPolicy="no-referrer"
          />
        ) : (
          <SrcDocSandbox html={bodyHtml} title="Post preview" className="editor-preview-iframe" />
        )}
      </div>
      {canShowLiveSite ? null : (
        <p className="editor-preview-notice">
          {status !== "published"
            ? "This is a rough render of the editor buffer only — publish this post to preview it with the theme's real template and CSS."
            : "This is a rough render of the editor buffer only — save your changes to preview them with the theme's real template and CSS."}
        </p>
      )}
    </>
  );
}
