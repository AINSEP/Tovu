import { renderHtmlPageBody as renderBody } from "@jini-ai/cms/public-http/http/site/render/page-body";
import type { ResolveHtmlPageEmbedsResult } from "@jini-ai/cms/widgets/html";
import type { PublicPostRecord as PostRecord } from "@jini-ai/cms/posts/post";
import { postAuthorForContentHeader } from "#src/features/theme/static-render-content";
import { renderWidgetIr } from "./content-html.js";

export function renderHtmlPageBody(
  { html, resolved }: { html: string; resolved: ResolveHtmlPageEmbedsResult | undefined }, options: { postAuthor?: Pick<PostRecord, "id" | "slug" | "author" | "showAuthor">; postPresentation?: PostRecord } = {},
): string {
  return renderBody({ html, resolved, renderWidgetIr: ({ ir }) => renderWidgetIr(ir), postAuthorForHeader: postAuthorForContentHeader }, options);
}
