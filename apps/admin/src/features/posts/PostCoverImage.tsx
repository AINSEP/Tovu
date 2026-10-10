import { agentHandle } from "@jini-ai/agentic";
import { Icon } from "@jini-ai/ui";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { MediaPickerDialog } from "@/components/MediaPickerDialog/MediaPickerDialog";
import { useWiredPostFeaturedImage } from "./hooks/use-post-featured-image.hooks";
import { showsCoverImageSlot } from "./rules";

/**
 * @file The cover image above the post's title node (owner, 2026-10-10: "an image in the tiptap above
 * the title"). Editor chrome, not a TipTap node: it sits in the editor shell just above
 * `.editor-body`, in the same content column, and edits the post's `featuredMediaId`, the field the
 * settings modal's Image tab edits, so `bodyJson`, the title node and public rendering are unchanged.
 * Props and JSX only; the picker state and preview URL come from the same hook the Image tab uses.
 */

export interface PostCoverImageProps {
  bodyFormat: "doc" | "html" | undefined;
  featuredMediaId: string | null;
  setFeaturedMediaId: (id: string | null) => void;
  t: Translate;
  /** Injectable seam for the picker state — defaults to the real hook. */
  useFeaturedImage?: typeof useWiredPostFeaturedImage;
}

export function PostCoverImage({ bodyFormat, featuredMediaId, setFeaturedMediaId, t, useFeaturedImage = useWiredPostFeaturedImage }: PostCoverImageProps) {
  const picker = useFeaturedImage(featuredMediaId, setFeaturedMediaId);
  if (!showsCoverImageSlot(bodyFormat)) return null;
  return (
    <div className={picker.previewUrl ? "post-cover post-cover-set" : "post-cover"}>
      {picker.previewUrl ? <PostCoverPreview picker={picker} t={t} /> : (
        <button
          type="button"
          className="btn-ghost post-cover-add"
          onClick={picker.openPicker}
          {...agentHandle({ handle: "post-cover-add" }, { role: "button", label: "Add a cover image above the title (the post's featured image) from the media library" })}
        >
          <Icon name="image" size={16} aria-hidden="true" />
          {t("Add cover image")}
        </button>
      )}
      {picker.pickerOpen ? (
        <MediaPickerDialog onSelect={picker.handleSelect} onCancel={picker.closePicker} accept={picker.accept} agentHandle="post-cover-dialog" />
      ) : null}
    </div>
  );
}

function PostCoverPreview({ picker, t }: { picker: ReturnType<typeof useWiredPostFeaturedImage>; t: Translate }) {
  return (
    <>
      {picker.previewFailed ? (
        <span className="post-cover-image post-cover-missing editor-featured-preview-missing" role="img" aria-label={t("Cover image unavailable")} title={t("Cover image unavailable")} />
      ) : (
        <img className="post-cover-image" src={picker.previewUrl ?? undefined} alt={t("Cover image")} onError={picker.onPreviewError} />
      )}
      <span className="post-cover-actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={picker.openPicker}
          {...agentHandle({ handle: "post-cover-change" }, { role: "button", label: "Replace this post's cover image (its featured image) from the media library" })}
        >
          {t("Change")}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={picker.clear}
          {...agentHandle({ handle: "post-cover-remove" }, { role: "button", label: "Remove this post's cover image (its featured image)" })}
        >
          {t("Remove")}
        </button>
      </span>
    </>
  );
}
