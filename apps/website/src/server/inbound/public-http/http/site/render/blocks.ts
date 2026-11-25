import type { SiteRenderContext } from "@jini-ai/cms/public-http/http/site/render-context";
import type { JsonObject } from "@jini-ai/core/primitives";
import { renderBlock as renderBlockWithPorts, renderBlockSeam as renderBlockSeamWithPorts, type BlockRenderPorts } from "@jini-ai/cms/public-http/http/site/render/blocks";
import { renderWidgetRegion, renderDocNode } from "./content-html.js";
import { renderHtmlPageBody } from "./page-body.js";
import { COMPONENTS } from "./components/registry.js";
import { entryList } from "./components/entry-lists.js";
import type { TemplateNode } from "#src/features/theme/index";

/** The host's seams for the shared block renderer: Tovu's component registry, widget regions, body
 *  renderers and entry list. An id with no own entry in {@link COMPONENTS} resolves to `undefined`. */
const BLOCK_PORTS: BlockRenderPorts = {
  componentFor: ({ id }) => {
    const component = Object.hasOwn(COMPONENTS, id) ? COMPONENTS[id] : undefined;
    return component === undefined ? undefined : ({ ctx, props }) => component(ctx, props);
  },
  renderWidgetRegion,
  renderHtmlPageBody,
  renderDocNode,
  entryList: ({ ctx, props }) => entryList(ctx, props),
};

/** Host binding of the single `render_block` seam both logic tiers share (Liquid tag, Handlebars helper). */
export function renderBlockSeam({ ctx, props }: { ctx: SiteRenderContext; props: JsonObject }, _optional: Record<string, never> = {}): string {
  return renderBlockSeamWithPorts({ ctx, props, ports: BLOCK_PORTS });
}

/** Host binding of the declarative-tier block walk over Tovu's own ports. */
export function renderBlock({ node, ctx }: { node: TemplateNode; ctx: SiteRenderContext }, _optional: Record<string, never> = {}): string {
  return renderBlockWithPorts({ node, ctx, ports: BLOCK_PORTS });
}
