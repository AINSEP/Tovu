import type { SiteRenderContext } from "../render-context.js";
import type { JsonObject } from "@jini-ai/core/primitives";
import { renderWidgetRegion, renderDocNode } from "./content-html.js";
import { COMPONENTS } from "./components/registry.js";
import { escapeHtml } from "#src/platform/html/escape";
import { renderPostBody } from "./post-body.js";
import { entryList } from "./components/entry-lists.js";
import { isObject } from "./value-readers.js";
import type { TemplateNode } from "#src/features/theme/index";

/**
 * Resolves one `render_block` invocation — the single seam both logic tiers share back into the
 * trusted core. `props.region` selects a theme-declared widget region; otherwise `props.component`
 * selects an entry in {@link COMPONENTS}. An unknown component id degrades to an HTML comment, never
 * a throw, so one bad reference cannot take the page down.
 *
 * Exported so the Liquid tag and the Handlebars helper are the same code rather than two
 * implementations that must be kept in agreement.
 *
 * @complexity O(1) beyond the resolved component's own rendering.
 * @overallScore 100/100
 */
export function renderBlockSeam(ctx: SiteRenderContext, props: JsonObject): string {
  if (typeof props.region === "string") {
    return renderWidgetRegion({ ctx, regionKey: props.region });
  }
  const id = typeof props.component === "string" ? props.component : "";
  const { component: _component, region: _region, ...rest } = props;
  const component = COMPONENTS[id];
  if (!component) return `<!-- unknown component: ${escapeHtml({ text: id })} -->`;
  return component(ctx, rest);
}

// ---------------------------------------------------------------------------
// Slots — raw context injection points a template can drop in directly.
// ---------------------------------------------------------------------------

function renderSlot({ name, ctx }: { name: string; ctx: SiteRenderContext }, _optional = {}): string {
  switch (name) {
    case "title":
      return `<h1 class="slot-title">${escapeHtml({ text: ctx.route === "post" && ctx.post ? ctx.post.title : ctx.siteTitle })}</h1>`;
    case "content":
      return ctx.post ? `<div class="prose">${renderPostBody({ ctx, post: ctx.post })}</div>` : "";
    case "entry-list":
      return entryList(ctx, {});
    default:
      return `<!-- unknown slot: ${escapeHtml({ text: name })} -->`;
  }
}

// ---------------------------------------------------------------------------
// Template block tree
// ---------------------------------------------------------------------------

function renderComponentBlock(node: JsonObject, ctx: SiteRenderContext): string {
  const id = typeof node.id === "string" ? node.id : "";
  const component = COMPONENTS[id];
  if (!component) return `<!-- unknown component: ${escapeHtml({ text: id })} -->`;
  return component(ctx, isObject(node.props) ? node.props : {});
}

function renderSlotBlock(node: JsonObject, ctx: SiteRenderContext): string {
  return renderSlot({ name: typeof node.name === "string" ? node.name : "", ctx });
}

/** SPEC-043/ADR-047 W-004: `{"type":"region","key":"footer"}` — a theme-authored reference to a
 *  theme-declared widget region (REQ-13/`ThemeManifest.regions`), resolved server-side ahead of the
 *  block walk (`resolvePageWidgets`, threaded in via `ctx.widgetRegions`). Dispatched by `node.type`
 *  through {@link BLOCK_TYPE_HANDLERS} rather than sequential `if`s, so a region node is never
 *  mistaken for unknown content-doc vocabulary (which would try to walk its `content`, not its
 *  `key`) — the two shapes never share a code path regardless of dispatch order. */
function renderRegionBlock(node: JsonObject, ctx: SiteRenderContext): string {
  return renderWidgetRegion({ ctx, regionKey: typeof node.key === "string" ? node.key : "" });
}

function renderDocTypeBlock(node: JsonObject, ctx: SiteRenderContext): string {
  return (Array.isArray(node.content) ? node.content : []).map((child) => renderBlock(child, ctx)).join("");
}

/** One handler per theme-authored block `type` — a lookup instead of a sequential `if`/`if`/`if`
 *  chain, so the number of block kinds stops being what drives {@link renderBlock}'s own complexity.
 *  A `type` with no entry here (including every plain content-doc vocabulary type, e.g. `paragraph`)
 *  falls through to `renderBlock`'s own default: this node tree is content-doc vocabulary, handled by
 *  {@link renderDocNode}. */
const BLOCK_TYPE_HANDLERS: Record<string, (node: JsonObject, ctx: SiteRenderContext) => string> = {
  component: renderComponentBlock,
  slot: renderSlotBlock,
  region: renderRegionBlock,
  doc: renderDocTypeBlock,
};

export function renderBlock(node: TemplateNode, ctx: SiteRenderContext): string {
  if (!isObject(node)) return "";
  const handler = typeof node.type === "string" ? BLOCK_TYPE_HANDLERS[node.type] : undefined;
  if (handler) return handler(node, ctx);
  // Anything else is content-doc vocabulary.
  return renderDocNode({ node }, { inlineResolved: ctx.widgetInlineResolved, mediaTransformVersions: ctx.mediaTransformVersions, mediaAssetMetadata: ctx.mediaAssetMetadata });
}
