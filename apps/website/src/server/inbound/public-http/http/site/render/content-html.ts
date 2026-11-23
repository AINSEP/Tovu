import type { JsonValue } from "@jini-ai/core/primitives";
import type { DocRenderOptions, WidgetDocRendering } from "./doc/doc-render-contract.js";
import { renderDocNodeWith, renderNodes, MAX_RENDER_DEPTH } from "./doc/doc-nodes.js";
import { randomUUID } from "node:crypto";
import { renderDocWithManagedMarkers } from "@jini-ai/cms/widgets/document-markers";
import type { WidgetRenderIR } from "@jini-ai/cms/widgets";
import { escapeHtml } from "@jini-ai/core/text";
import { str, isObject } from "./value-readers.js";
import { renderWidgetSocialLinks, renderWidgetRecentEntries, renderWidgetEntrySummary } from "./widgets/social-entries.js";
import { renderWidgetMenu } from "@jini-ai/cms/navigation/menu-render";
import { renderHtmlTaxonomy } from "@jini-ai/cms/taxonomy/render-entry";
import { renderWidgetContactForm } from "./contact-form-widget.js";
import { renderWidgetMediaImage, renderMediaWidget } from "./widgets/media.js";
import { renderWidgetPostContent } from "./widgets/post-content.js";
import { renderWidgetPlaceholder } from "./widgets/placeholder.js";
import type { SiteRenderContext } from "../render-context.js";

/**
 * Renders a TipTap/ProseMirror-style doc node to HTML — {@link renderDocNodeWith} (see its doc for
 * the options) with the widget renderer bound. This is the one place the doc renderer and the
 * widget renderer meet: a `widgetEmbed` node renders through {@link renderWidgetIr}, and the
 * `post-content` widget renders its body through this function.
 */
export function renderDocNode({ node }: { node: JsonValue }, options: DocRenderOptions = {}): string {
  return renderDocNodeWith({ node, renderWidget: renderWidgetIr }, options);
}

/**
 * A stored doc body as HTML a Page can keep. Uses the public renderer so text keeps its exact markup,
 * while widgets and managed media stay live embeds: resolving them here would freeze today's output
 * into the page, or a placeholder where no render context exists. The random token cannot collide
 * with the owner's text. A media node's transform has no marker form, so it takes the default image.
 * @complexity O(n) in doc nodes plus one pass over the rendered HTML.
 */
export function renderDocBodyAsPageHtml({ bodyJson }: { bodyJson: unknown }, _optional = {}): string {
  const token = `DOCMARKER${randomUUID().replace(/-/g, "")}N`;
  return renderDocWithManagedMarkers({ bodyJson, token, maxDepth: MAX_RENDER_DEPTH, renderDocNode });
}

/** The widget renderers' way back into the doc renderer ({@link WidgetDocRendering}), built once here
 *  from the real functions with the widget renderer bound — the same binding {@link renderDocNode}
 *  makes, so a title node or a legacy gallery image renders exactly as any other doc content. */
const WIDGET_DOC_RENDERING: WidgetDocRendering = {
  renderDocNode,
  renderNodes: (required) => renderNodes({ ...required, renderWidget: renderWidgetIr }),
};

/** One renderer per resolvable `componentId` — a lookup instead of a `switch` so the number of widget
 *  types stops being what drives {@link renderWidgetIr}'s own complexity (each `case` in a `switch`
 *  counts as a branch the same way each entry here does NOT, since the entries live in data, not
 *  control flow). `"widget-placeholder"` deliberately has no entry: it already gets the exact same
 *  {@link renderWidgetPlaceholder} output via the lookup's own miss path, same as any other
 *  unrecognized id. */
const WIDGET_IR_RENDERERS: Record<string, (required: { ir: WidgetRenderIR }, optional?: Record<string, never>) => string> = {
  text: ({ ir }) => `<div class="widget widget-text">${escapeHtml({ text: str({ value: ir.props.body }) }).replaceAll("\n", "<br/>")}</div>`,
  "social-links": ({ ir }) => renderWidgetSocialLinks(ir.props),
  "recent-entries": ({ ir }) => renderWidgetRecentEntries(ir),
  "entry-summary": ({ ir }) => renderWidgetEntrySummary(ir.props),
  menu: ({ ir }) => renderWidgetMenu({ props: ir.props }),
  "taxonomy-list": ({ ir }) => renderHtmlTaxonomy({
    attributes: { section: "data-tovu-taxonomy", list: "data-tovu-taxonomy-list", term: "data-tovu-term", label: "data-tovu-term-label" },
    id: str({ value: ir.props.id }), name: str({ value: ir.props.name }), hierarchical: ir.props.hierarchical === true,
    terms: (Array.isArray(ir.props.terms) ? ir.props.terms : []).filter(isObject).map((term) => ({
      id: str({ value: term.id }), name: str({ value: term.name }), parentId: typeof term.parentId === "string" ? term.parentId : null,
    })),
  }),
  "contact-form": ({ ir }) => renderWidgetContactForm(ir.props),
  "media-image": ({ ir }) => renderWidgetMediaImage(ir.props),
  "gallery": ({ ir }) => renderMediaWidget({ ir, docRendering: WIDGET_DOC_RENDERING }),
  "media": ({ ir }) => renderMediaWidget({ ir, docRendering: WIDGET_DOC_RENDERING }),
  "post-content": ({ ir }) => renderWidgetPostContent({ props: ir.props, docRendering: WIDGET_DOC_RENDERING }),
};

/**
 * Renders one resolved widget IR node to HTML. Never throws: an unrecognized `componentId` (a
 * resolver shape this renderer doesn't yet know, or the REQ-27 failure taxonomy reaching here some
 * other way) degrades to the same public-safe placeholder REQ-28 requires, not a crash or an
 * unescaped dump of unknown props.
 *
 * Exported for {@link renderHtmlPageBody} (SPEC-047 Slice 2) — an `"html"`-format Page's
 * `data-embed-type` targets resolve to the exact same `WidgetRenderIR` shape a
 * region or a TipTap `widgetEmbed` does, so they render through this same function rather than a
 * second implementation.
 */
export function renderWidgetIr(ir: WidgetRenderIR): string {
  const renderer = WIDGET_IR_RENDERERS[ir.componentId];
  return renderer ? renderer({ ir }) : renderWidgetPlaceholder();
}

/**
 * Renders a theme-declared region: the ordered, resolved widget list for `regionKey`, wrapped in
 * one semantic container. No layout/positioning opinion beyond that container (ADR-047 §4 "widgets
 * carry zero layout opinion" — that belongs to the region's placement context, i.e. the theme's own
 * CSS/template arrangement around this block). Renders nothing (not even the wrapper) when the
 * region has no resolved widgets — an empty/unbound region is not an error state (ADR-047 §7).
 */
/** Exported for `liquid-worker.ts`'s `render_block` tag, which resolves `region:` the same way it
 * resolves `component:` — over the same `COMPONENTS`-registry-adjacent seam, per ADR-047 §2a's "no
 * new Liquid capability required." */
export function renderWidgetRegion(
  required: { ctx: SiteRenderContext; regionKey: string },
  _optional: Record<string, never> = {}
): string {
  const { ctx, regionKey } = required;
  const items = ctx.widgetRegions[regionKey] ?? [];
  if (items.length === 0) return "";
  return `<div class="widget-region widget-region--${escapeHtml({ text: regionKey })}">${items.map((ir) => renderWidgetIr(ir)).join("")}</div>`;
}
