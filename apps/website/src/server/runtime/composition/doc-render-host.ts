import type { DocNodeHost, DocRenderClasses } from "@jini-ai/cms/public-http/http/site/render/doc/doc-render-contract";
import { renderImageTag, renderVideoTag } from "@jini-ai/cms/widgets/media-tags";
import { resolveEmbedHtmlAttributes, formatHtmlAttributes, omitKey } from "@jini-ai/cms/widgets/media-attributes";
import { isPlausibleMediaRefId, plausibleMediaRefId } from "@jini-ai/cms/widgets/markers";
import { mediaPublicPath, mediaUrlKey } from "@jini-ai/cms/media/site/public-path";
import { safeImageSrc, extractYoutubeVideoId } from "#src/platform/html/safe-url";

/** The class names the Tovu public stylesheet targets — Jini's doc renderer emits exactly what it is
 *  handed here, so the rendered HTML stays what it was before the renderer moved. */
export const TOVU_DOC_RENDER_CLASSES: DocRenderClasses = {
  mediaPlaceholder: { box: "media-ph", label: "media-ph__label" },
  contentPlaceholder: { box: "content-ph", label: "content-ph__label" },
  youtubeEmbed: "youtube-embed",
  postMention: "post-mention",
  widgetEmbed: "widget-embed",
};

/** The doc renderer's host collaborators, bound once: Tovu's media URL policy and tag renderers,
 *  its URL allowlists (`platform/html/safe-url`) and its stylesheet class names. */
export const TOVU_DOC_NODE_HOST: DocNodeHost = {
  media: { renderImageTag, renderVideoTag, mediaPublicPath, mediaUrlKey, isPlausibleMediaRefId, plausibleMediaRefId },
  attributes: { resolveEmbedHtmlAttributes, formatHtmlAttributes, omitKey },
  safeUrl: { safeImageSrc, extractYoutubeVideoId },
  classes: TOVU_DOC_RENDER_CLASSES,
};
