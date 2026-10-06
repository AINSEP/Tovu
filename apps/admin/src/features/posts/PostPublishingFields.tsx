import { agentHandle } from "@jini-ai/agentic";
import { MediaPickerDialog } from "@/components/MediaPickerDialog/MediaPickerDialog";
import type { Translate } from "@/lib/dictionary-translator";
import { useWiredPostFeaturedImage } from "./hooks/use-post-featured-image.hooks";

/**
 * @file The editor's "Publish at" and "Featured image" controls (2026-10-05) — props and JSX only.
 * State lives in `usePostEditor` (both values are saved with the post) and the picker's visibility in
 * `use-post-featured-image.hooks.ts`.
 */

export interface PostPublishingFieldsProps {
  publishAtInput: string;
  setPublishAtInput: (value: string) => void;
  scheduled: boolean;
  featuredMediaId: string | null;
  setFeaturedMediaId: (id: string | null) => void;
  t: Translate;
  /** Injectable seam for the picker state — defaults to the real hook. */
  useFeaturedImage?: typeof useWiredPostFeaturedImage;
}

export function PostPublishingFields({
  publishAtInput,
  setPublishAtInput,
  scheduled,
  featuredMediaId,
  setFeaturedMediaId,
  t,
  useFeaturedImage = useWiredPostFeaturedImage,
}: PostPublishingFieldsProps) {
  const picker = useFeaturedImage(featuredMediaId, setFeaturedMediaId);
  return (
    <div className="editor-publishing-fields">
      <label className="editor-publishing-field">
        <span className="field-label">{t("Publish at")}</span>
        <input
          type="datetime-local"
          value={publishAtInput}
          onChange={(e) => setPublishAtInput(e.target.value)}
          {...agentHandle({ handle: "post-publish-at" }, {
            role: "field",
            label:
              "When this post goes live, in your local time. Leave empty to go live as soon as it is published. " +
              "A published post with a future time stays hidden until then.",
          })}
        />
        {scheduled ? <span className="editor-scheduled-badge">{t("Scheduled")}</span> : null}
      </label>
      <div className="editor-publishing-field">
        <span className="field-label">{t("Featured image")}</span>
        {picker.previewUrl && picker.previewFailed ? (
          <span className="editor-featured-preview editor-featured-preview-missing" role="img" aria-label={t("Featured image unavailable")} title={t("Featured image unavailable")} />
        ) : null}
        {picker.previewUrl && !picker.previewFailed ? (
          <img className="editor-featured-preview" src={picker.previewUrl} alt={t("Featured image")} onError={picker.onPreviewError} />
        ) : null}
        <button
          type="button"
          className="btn-secondary"
          onClick={picker.openPicker}
          {...agentHandle({ handle: "post-featured-image-choose" }, { role: "button", label: "Choose this post's featured image from the media library" })}
        >
          {featuredMediaId ? t("Change") : t("Choose image")}
        </button>
        {featuredMediaId ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={picker.clear}
            {...agentHandle({ handle: "post-featured-image-clear" }, { role: "button", label: "Remove this post's featured image" })}
          >
            {t("Remove")}
          </button>
        ) : null}
      </div>
      {picker.pickerOpen ? (
        <MediaPickerDialog onSelect={picker.handleSelect} onCancel={picker.closePicker} accept={picker.accept} agentHandle="post-featured-image-dialog" />
      ) : null}
    </div>
  );
}
