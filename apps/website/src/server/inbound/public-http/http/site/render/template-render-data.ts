import { formatMoney } from "@jini-ai/commerce/money";
import { buildTemplateRenderData as buildTemplateRenderDataWithPorts } from "@jini-ai/cms/public-http/http/site/render/template-render-data";
import type { SiteRenderContext } from "@jini-ai/cms/public-http/http/site/render-context";
import { renderPostBody } from "./post-body.js";

/** Host binding of the shared template-data builder: one body renderer and the catalog's money
 *  formatter. Shared by BOTH engine workers (`liquid-worker.ts`, `handlebars-worker.ts`) so the data
 *  contract a theme author writes against is the same in Liquid and Handlebars. */
export function buildTemplateRenderData(ctx: SiteRenderContext): Record<string, unknown> {
  return buildTemplateRenderDataWithPorts({ ctx, renderPostBody, formatMoney });
}
