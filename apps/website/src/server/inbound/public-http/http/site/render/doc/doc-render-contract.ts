import type { WidgetRenderIR } from "@jini-ai/cms/widgets";
import type { MediaAssetRenderMeta } from "../../render-context.js";
import type { JsonObject, JsonValue } from "@jini-ai/core/primitives";

/** Threaded-through render state every {@link renderDocNode} case handler needs — bundled into one
 *  object so each extracted handler (see {@link DOC_NODE_HANDLERS}) takes one params object instead
 *  of the same three maps plus `depth` repeated at every call site, the way the old single-`switch`
 *  body used to spell them out inline for every case. */
export interface DocNodeRenderDeps {
  readonly inlineResolved: ReadonlyMap<string, WidgetRenderIR>;
  readonly mediaTransformVersions: ReadonlyMap<string, number>;
  readonly mediaAssetMetadata: ReadonlyMap<string, MediaAssetRenderMeta>;
  readonly depth: number;
}

/** One handler per doc-node `type`, dispatched by {@link renderDocNode} through
 *  {@link DOC_NODE_HANDLERS} — see that table's own doc for why this file moved off a single large
 *  `switch`. */
export type DocNodeHandlerRequired = { node: JsonObject; content: JsonValue[] | undefined; deps: DocNodeRenderDeps };
export type DocNodeHandler = (required: DocNodeHandlerRequired, optional?: Record<string, never>) => string;
