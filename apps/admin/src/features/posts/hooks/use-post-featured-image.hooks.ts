import { useState } from "react";
import type { AdminMedia } from "@/lib/api";
import { defaultMediaPickerPort } from "@/components/MediaPickerDialog/media-picker-dependencies.hooks";
import type { MediaPickerPort } from "@/components/MediaPickerDialog/media-picker-port.hooks";

/**
 * @file The featured-image chooser's picker state (2026-10-05) — the same shape as
 * `features/seo/MediaRefField.hooks.tsx`, but the value is a bare media asset id (what
 * `AdminPost.featuredMediaId` stores), not an `{id}:{transform}` ref.
 *
 * `value`/`onChange` are `usePostEditor`'s own `featuredMediaId` state: the save path needs it, so the
 * editor hook owns it and this hook only adds the dialog's visibility and the preview URL.
 */

export interface PostFeaturedImageController {
  pickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
  /** `MediaPickerDialog`'s `onSelect` — stores the picked asset's id and closes the dialog. */
  handleSelect: (item: AdminMedia) => void;
  clear: () => void;
  /** Thumbnail `<img src>` for the current id, or `null` when none is chosen. */
  previewUrl: string | null;
}

export function usePostFeaturedImage(
  value: string | null,
  onChange: (id: string | null) => void,
  deps: { port: Pick<MediaPickerPort, "mediaOriginalUrl"> },
): PostFeaturedImageController {
  const [pickerOpen, setPickerOpen] = useState(false);
  return {
    pickerOpen,
    openPicker: () => setPickerOpen(true),
    closePicker: () => setPickerOpen(false),
    handleSelect: (item) => {
      onChange(item.id);
      setPickerOpen(false);
    },
    clear: () => onChange(null),
    previewUrl: value ? deps.port.mediaOriginalUrl(value) : null,
  };
}

/** Binds the real media client — the zero-dependency half of the `useX(deps)` / `useWiredX()` pair. */
export function useWiredPostFeaturedImage(value: string | null, onChange: (id: string | null) => void): PostFeaturedImageController {
  return usePostFeaturedImage(value, onChange, { port: defaultMediaPickerPort });
}
