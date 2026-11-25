import { usePostFeaturedImage, type PostFeaturedImageController } from "@jini-ai/cms/react/posts/hooks/use-post-featured-image.hooks";
import type { PostCoverImageBindings } from "@jini-ai/cms/react/posts/PostCoverImage";
import { defaultMediaPickerPort } from "@/components/MediaPickerDialog/media-picker-dependencies.hooks";
import { defaultFeaturedImageRenditionUrl } from "./post-editor-dependencies.hooks";
import { adminKit } from "@/integrations/jini-kits";
import { MediaPickerDialog } from "@/components/MediaPickerDialog/media-picker-host";
import { agentHandle } from "@jini-ai/core/agent-handles";
import { showsCoverImageSlot, showsHideCoverInBodyToggle } from "../rules";

/** Binds the real media client — the zero-dependency half of the `useX(deps)` / `useWiredX()` pair. */
export function useWiredPostFeaturedImage({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }, _options: Record<string, never> = {}): PostFeaturedImageController {
  return usePostFeaturedImage({ value: value, onChange: onChange, deps: { port: defaultMediaPickerPort, renditionUrl: defaultFeaturedImageRenditionUrl } });
}

export const postCoverBindings = {
  Icon: adminKit.components.Icon,
  InfoTip: adminKit.components.InfoTip,
  MediaPickerDialog,
  agentHandle,
  showsCoverImageSlot,
  showsHideCoverInBodyToggle,
} satisfies PostCoverImageBindings;
