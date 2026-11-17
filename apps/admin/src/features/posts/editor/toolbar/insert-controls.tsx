import type { Editor } from "@tiptap/react";
import type { Translate } from "@jini-ai/core/text";

import { createFocusedEditorChain } from "../../PostEditor.hooks";
import { EmbedInsertControl } from "../../../../components/EmbedInsertControl/EmbedInsertControl";
import type { AdminPost } from "../../../../lib/api";
import type { PostUrlDialogController } from "../../hooks/use-post-url-dialog.hooks";

/** Insertion controls: embed, image/YouTube by URL, and mentioning another post. Tovu CMS code (it
 *  reads `AdminPost`), not a generic formatting control. */
export function ToolbarInsertControls({
  editor,
  mentionablePosts,
  currentPostId,
  urlDialog,
  t,
}: {
  editor: Editor;
  /** Mention feature (2026-08-11) — every other post/page this workspace has, unfiltered (this
   *  component excludes `currentPostId` at render time). See `use-post-editor.hooks.ts`'s own
   *  field doc for why an empty array here means "loading or fetch failed", not "no other posts". */
  mentionablePosts: AdminPost[];
  currentPostId: string;
  urlDialog: PostUrlDialogController;
  t: Translate;
}) {
  const chain = createFocusedEditorChain({ editor });
  return (
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
      {/* "Insert image by URL" — REMOVED and then RESTORED on 2026-08-12, same day. Read this before
          removing it again.
          It writes a node carrying only `attrs.src`. `render.ts`'s `"image"` case historically never
          read `src` (ADR-027 §4/D7), so the control looked like it worked in the editor and silently
          rendered a placeholder on the live site — that part of the bug report was real.
          The first fix removed the control. The owner reversed that: *"I don't wanna remove the image
          by URL… why is that even bad to refuse an attribute source? If the user is saying they want
          it, why bar it?"* He is right, and the blanket refusal was the actual defect. This file
          already had the correct pattern for exactly this problem — `safeHref` (render.ts) does not
          REFUSE link hrefs, it validates the scheme and passes good ones through. The image case was
          the outlier in refusing everything.
          So `render.ts` now has `safeImageSrc`, the image-shaped sibling of `safeHref`: an `https?:`
          allowlist that rejects `javascript:`/`data:`/`blob:`/`file:` and the app's own authenticated
          admin media URLs, degrading anything else to the same visible placeholder as before.
          NOTE the rejected alternative and why it is NOT the cheap option it sounds like: fetching
          the URL server-side to mint a real `{assetId, transformName}` ref would need `src/platform/http`
          (ADR-038); consuming only its UTF-8 `bodyText` would corrupt binary image bytes. It would also introduce SSRF surface that scheme
          validation does not — because with validation the SERVER never fetches anything; the
          reader's browser loads the URL directly.
 */}
      <button
        className="tb-btn"
        title={t("Insert image by URL")}
        onClick={urlDialog.openImage}
      >
        {t("Img by URL")}
      </button>
      {/* YouTube (coordinator MSG #1 licensing sweep, 2026-08-11) — shares the URL dialog with
          "Insert image by URL" just above (2026-10-11).
          `setYoutubeVideo` itself rejects an unrecognized URL
          (returns `false`, no-ops) before insertion — the render.ts side independently
          re-validates anyway, see `extractYoutubeVideoId`'s own doc for why. */}
      <button
        className="tb-btn"
        title={t("Insert YouTube video")}
        onClick={urlDialog.openYoutube}
      >
        YouTube
      </button>
      {/* Mention another post (coordinator MSG A#1 licensing sweep, 2026-08-11) — a single
          action `<select>` (`value=""` always, matching a menu-styled dropdown-button rather than
          a retained current-selection field): choosing a post inserts a mention node immediately
          and the control snaps back to its placeholder. `id` stores the mentioned post's SLUG
          (what `render.ts`'s `"mention"` case builds a link from), `label` its title. Excludes
          `currentPostId` — mentioning the post you're currently writing has no meaning. */}
      <select
        className="tb-select"
        title={t("Mention a post")}
        aria-label={t("Mention a post")}
        value=""
        onChange={(e) => {
          const target = mentionablePosts.find((p) => p.slug === e.target.value);
          if (!target) return;
          chain().insertContent({ type: "mention", attrs: { id: target.slug, label: target.title } }).run();
        }}
      >
        <option value="">{t("Mention…")}</option>
        {mentionablePosts
          .filter((p) => p.id !== currentPostId)
          .map((p) => (
            <option key={p.id} value={p.slug}>{p.title}</option>
          ))}
      </select>
    </div>
  );
}
