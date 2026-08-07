import { EditorContent, useEditorState, type Editor } from "@tiptap/react";
import { agentHandle } from "@jini-ai/agentic";
import { ConfirmDialog } from "@jini-ai/admin/react";

import { EmbedInsertControl } from "../../components/EmbedInsertControl/EmbedInsertControl";
import { siteUrl } from "../../lib/site-url";
import { usePostEditor } from "./hooks/use-post-editor.hooks";

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
        <button className={`tb-btn${s.bold ? " on" : ""}`} title="Bold (⌘B)" aria-pressed={s.bold} onClick={() => chain().toggleBold().run()}><b>B</b></button>
        <button className={`tb-btn${s.italic ? " on" : ""}`} title="Italic (⌘I)" aria-pressed={s.italic} onClick={() => chain().toggleItalic().run()}><i>I</i></button>
        <button className={`tb-btn${s.strike ? " on" : ""}`} title="Strikethrough" aria-pressed={s.strike} onClick={() => chain().toggleStrike().run()}><s>S</s></button>
        <button className={`tb-btn${s.code ? " on" : ""}`} title="Inline code" aria-pressed={s.code} onClick={() => chain().toggleCode().run()}>&lt;/&gt;</button>
      </div>
      <div className="grp">
        <button className={`tb-btn${s.h1 ? " on" : ""}`} title="Heading 1" aria-pressed={s.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>H1</button>
        <button className={`tb-btn${s.h2 ? " on" : ""}`} title="Heading 2" aria-pressed={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>H2</button>
        <button className={`tb-btn${s.h3 ? " on" : ""}`} title="Heading 3" aria-pressed={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>H3</button>
      </div>
      <div className="grp">
        <button className={`tb-btn${s.bullet ? " on" : ""}`} title="Bullet list" aria-pressed={s.bullet} onClick={() => chain().toggleBulletList().run()}>• List</button>
        <button className={`tb-btn${s.ordered ? " on" : ""}`} title="Numbered list" aria-pressed={s.ordered} onClick={() => chain().toggleOrderedList().run()}>1. List</button>
        <button className={`tb-btn${s.quote ? " on" : ""}`} title="Quote" aria-pressed={s.quote} onClick={() => chain().toggleBlockquote().run()}>&ldquo; Quote</button>
        <button className={`tb-btn${s.codeBlock ? " on" : ""}`} title="Code block" aria-pressed={s.codeBlock} onClick={() => chain().toggleCodeBlock().run()}>{"{ }"}</button>
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
    message,
    error,
    confirmingDelete,
    setConfirmingDelete,
    deleting,
    confirmLeave,
    save,
    remove,
  } = usePostEditorHook(postId);

  if (error && !post) return <div className="notice error">{error}</div>;
  if (!post) return <div className="notice">Loading editor…</div>;

  const kindLabel = post.kind === "page" ? "page" : "post";

  return (
    <div className="page">
      <div
        className="page-header"
        {...agentHandle("post-header", {
          role: "region",
          label: "Editor header — back link, save status, publish state and the Save button",
        })}
      >
        <div className="page-header-text">
          <p className="page-kicker">Content</p>
          <h1 className="page-title">{kindLabel === "page" ? "Edit page" : "Edit post"}</h1>
          <p className="page-description">Update this {kindLabel}&apos;s title, body, and publish status.</p>
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
              ← {kindLabel === "page" ? "Pages" : "Posts"}
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
            <option value="draft">Draft</option>
            <option value="published">Published</option>
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
              onClick={() => save("published")}
              {...agentHandle("post-publish", {
                role: "button",
                label:
                  "Publish this post/page immediately — saves the current title, slug and body and " +
                  "sets status to Published in one action. Only shown while the post is a draft; once " +
                  "published, use Save for further edits.",
              })}
            >
              Publish
            </button>
          ) : null}
          <button
            type="button"
            className={status === "draft" ? "btn-secondary" : undefined}
            onClick={() => save()}
            {...agentHandle("post-save", { role: "button", label: "Save this post's title, slug, status and body" })}
          >
            Save
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => setConfirmingDelete(true)}
            {...agentHandle("post-delete", {
              role: "button",
              label:
                "Move this post/page to the trash — different from unpublishing (the Draft/Published " +
                "field above): the entry disappears from every list and the site. Asks for confirmation " +
                "before deleting.",
            })}
          >
            Delete
          </button>
        </div>
      </div>
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
          placeholder="Post title"
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
      </div>
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
        title="Move to trash?"
        body={
          <p>
            Move this {kindLabel} (&quot;{post.title}&quot;) to trash? It will disappear from the site and from the{" "}
            {kindLabel}s list.
          </p>
        }
        confirmLabel="Move to trash"
        destructive
        pending={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
