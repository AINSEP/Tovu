import type { JsonObject, JsonValue } from "@jini-ai/core/primitives";
import { resolveEmbedHtmlAttributes, formatHtmlAttributes, omitKey } from "@jini-ai/cms/widgets/media-attributes";
import { str, isObject } from "../value-readers.js";
import { escapeHtml } from "#src/platform/html/escape";
import { plausibleMediaRefId } from "./media-ref.js";
import { MAX_RENDER_DEPTH } from "./doc-nodes.js";

/** The `data-embed-config` element that stands for a managed doc node in Page HTML. `alt` is carried
 *  as a marker attribute because the media resolver reads it there. @complexity O(n) in the node's attrs. */
function docNodeEmbedMarker(required: { config: JsonObject; attrs: JsonObject; alt?: string }): string {
  const parsed = resolveEmbedHtmlAttributes({ raw: str({ value: required.attrs.htmlAttributes }) || null });
  const classes = [str({ value: required.attrs.cssClass }), parsed.class].filter(Boolean).join(" ");
  const classAttr = classes ? ` class="${escapeHtml({ text: classes })}"` : "";
  const altAttr = required.alt ? ` alt="${escapeHtml({ text: required.alt })}"` : "";
  // A single-quoted marker reads its JSON raw, so an apostrophe needs the JSON escape, not an entity.
  const json = JSON.stringify(required.config).replace(/'/g, "\\u0027");
  return `<div${classAttr}${altAttr}${formatHtmlAttributes({ attributes: omitKey({ attributes: parsed, key: "class" }) })} data-embed-config='${json}'></div>`;
}

/** A widget or managed-media node's Page HTML marker; `undefined` for every other node, which the
 *  ordinary renderer handles. A malformed reference stays with that renderer's placeholder. @complexity O(1). */
function managedDocNodeMarker(node: JsonObject): string | undefined {
  const attrs = isObject(node.attrs) ? node.attrs : {};
  if (node.type === "widgetEmbed" && str({ value: attrs.widgetEntryId })) {
    const config: JsonObject = { type: "widget", id: str({ value: attrs.widgetEntryId }) };
    if (attrs.content !== undefined) config.content = attrs.content;
    return docNodeEmbedMarker({ config, attrs });
  }
  const assetId = node.type === "media" || node.type === "image" ? plausibleMediaRefId({ value: attrs.assetId }) : undefined;
  return assetId ? docNodeEmbedMarker({ config: { type: "media", id: assetId }, attrs, alt: str({ value: attrs.alt }) }) : undefined;
}

/** Copies `node` with each managed node replaced by a text token, recording its marker by index.
 *  Past {@link MAX_RENDER_DEPTH} nodes are left for the renderer's own depth limit. @complexity O(n) in nodes. */
export function swapManagedDocNodes(required: { node: JsonValue; token: string; markers: string[]; depth: number }): JsonValue {
  const { node, token, markers, depth } = required;
  if (!isObject(node) || depth > MAX_RENDER_DEPTH) return node;
  const marker = managedDocNodeMarker(node);
  if (marker !== undefined) return { type: "text", text: `${token}${markers.push(marker) - 1}X` };
  if (!Array.isArray(node.content)) return node;
  return { ...node, content: node.content.map(child => swapManagedDocNodes({ node: child, token, markers, depth: depth + 1 })) };
}
