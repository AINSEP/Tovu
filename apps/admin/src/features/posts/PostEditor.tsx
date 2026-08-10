import { EditorContent, useEditorState, type Editor } from "@tiptap/react";
import { agentHandle } from "@jini-ai/agentic";
import { ConfirmDialog } from "@jini-ai/admin/react";

import { EmbedInsertControl } from "../../components/EmbedInsertControl/EmbedInsertControl";
import { siteUrl } from "../../lib/site-url";
import { usePostEditor } from "./hooks/use-post-editor.hooks";
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
    overridesThemePage,
    setOverridesThemePage,
    hasSlugCollision,
    message,
    error,
    confirmingDelete,
    setConfirmingDelete,
    deleting,
    confirmLeave,
    save,
    remove,
  } = usePostEditorHook(postId);
  const locale = useAdminLocale();
  const t = (key: string): string => POSTS_DICT[locale]?.[key] ?? key;

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
      {/* Slug (+ view link) and the template picker share one row, space-between, to save vertical
          space — both are short, single-line controls with no reason to stack (2026-08-10). */}
      <div className="editor-slug-row">
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
          {/* Internal id, visible for reference (2026-08-10) — `readOnly`, not `disabled`: the id is
              genuinely never editable (renaming a post's stored id isn't something this app's own
              repo layer supports, unlike the slug above), but readOnly still lets an operator select
              and copy it, which disabled would block in most browsers.

              The visual spacing/divider lives on THIS outer span, not the `<label>` — `.a11y-label-
              wrap` sets `display: contents` (see that class's own comment in editor.css), which
              strips a label's own box entirely, so any margin/padding/border placed directly on the
              label is silently a no-op. Real bug, found live: the divider never rendered and the
              id sat crowded against "view" with only the parent row's own small gap. */}
          <span className="editor-id">
            <label className="a11y-label-wrap">
              <span className="visually-hidden">Internal post id</span>
              <span aria-hidden="true">id:</span>
              <input
                value={post.id}
                readOnly
                {...agentHandle("post-id", { role: "field", label: "This post's internal id — read-only, shown for reference only" })}
              />
            </label>
          </span>
        </div>
        {/* Post-template-picker feature (2026-08-10) — rendered whenever this row is a Post/
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
            itself weren't there). Renders a disabled control with a one-line explanation instead. */}
        {(post.bodyFormat ?? "doc") === "doc" ? (
          <div className="editor-template-picker">
            <label className="a11y-label-wrap">
              <span className="visually-hidden">{t("Template")}</span>
            </label>
            {availableTemplates.length > 0 ? (
              <select
                value={templateChoice ?? ""}
                // `e.target.value`, NOT `|| null` — "No template chosen" must persist as `""`
                // (explicitly opted out), which `resolvePostTemplate` treats differently from `null`
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
      <div
        className="editor-shell"
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
    </div>
  );
}
