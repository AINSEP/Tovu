import { createContentHtmlRenderer } from "@jini-ai/cms/public-http/http/site/render/content-html";
import type { WidgetRenderIR } from "@jini-ai/cms/widgets";
import { TOVU_DOC_NODE_HOST } from "#src/server/runtime/composition/doc-render-host";
import { TOVU_WIDGET_RENDER_HOST } from "#src/server/runtime/composition/widget-render-host";
import { randomUUID } from "node:crypto";

const renderer = createContentHtmlRenderer({
  docHost: TOVU_DOC_NODE_HOST,
  widgetHost: TOVU_WIDGET_RENDER_HOST,
  taxonomyAttributes: { section: "data-tovu-taxonomy", list: "data-tovu-taxonomy-list", term: "data-tovu-term", label: "data-tovu-term-label" },
  newMarkerToken: () => `DOCMARKER${randomUUID().replace(/-/g, "")}N`,
});

export const renderDocNode = renderer.renderDocNode;
export const renderDocBodyAsPageHtml = renderer.renderDocBodyAsPageHtml;
export const renderWidgetRegion = renderer.renderWidgetRegion;

export function renderWidgetIr(ir: WidgetRenderIR): string {
  return renderer.renderWidgetIr({ ir });
}
