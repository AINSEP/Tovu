import type { NodeViewProps } from "@tiptap/react";

import { mediaApi } from "../features/media/api/media-api";
import { t as mediaT } from "../features/media/media-i18n";
import { useAdminLocale } from "../hooks/use-admin-locale.hooks";
import { useMediaEmbedNodeView, type MediaEmbedNodeViewController } from "@jini-ai/admin/shell/lib/media-embed-extension.hooks";

/** Binds the real `useAdminLocale()` and `api.mediaContentType` — what `MediaEmbedNodeView` composes. */
export function useWiredMediaEmbedNodeView(props: NodeViewProps): MediaEmbedNodeViewController {
  const locale = useAdminLocale();
  return useMediaEmbedNodeView(props, { locale, contentTypeOf: mediaApi.mediaContentType, translate: mediaT, mediaOriginalUrl: mediaApi.mediaOriginalUrl });
}
