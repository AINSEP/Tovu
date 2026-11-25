import { entryContent as entryContentWithRenderers, renderPostBody as renderPostBodyWithRenderers } from "@jini-ai/cms/public-http/http/site/render/post-body";
import type { SiteRenderContext } from "@jini-ai/cms/public-http/http/site/render-context";
import type { PublicPostRecord as PostRecord } from "@jini-ai/cms/posts/post";
import { renderHtmlPageBody } from "./page-body.js";
import { renderDocNode } from "./content-html.js";

/** The host's body renderers, handed to the shared post-body algorithms. */
const BODY_RENDERERS = { renderHtmlPageBody, renderDocNode };

/** Host binding of the shared post-body renderer over Tovu's own html-page and doc renderers. */
export function renderPostBody(required: { ctx: SiteRenderContext; post: PostRecord }, _optional: Record<string, never> = {}): string {
  return renderPostBodyWithRenderers({ ...required, renderers: BODY_RENDERERS });
}

/** Host binding of the shared entry-content fallback; the byline copy ("By ") is Tovu's own. */
export function entryContent(ctx: SiteRenderContext): string {
  return entryContentWithRenderers({ ctx, renderers: BODY_RENDERERS, bylinePrefix: "By " });
}
