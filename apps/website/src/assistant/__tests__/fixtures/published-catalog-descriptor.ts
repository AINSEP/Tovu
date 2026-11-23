import { resolveHostReadRefs, type ToolRegistration } from "@jini-ai/core";
import { contentReadVocabulary } from "@jini-ai/core/tool-metadata/content-read";
import { batchDescriptorFor, resolveBatchableTools } from "../../batch-tool-inputs.js";

/** What the assembly publishes for a catalog entry: the entry itself, plus `items` when the tool is
 *  batchable by default — derived with the REAL `resolveBatchableTools`/`batchDescriptorFor`.
 *  The entry's `{{read:<entity>}}` references are resolved with the host's `contentReadVocabulary`, as every
 *  Tovu registration passes it (Jini catalogs name no host tool, guard R5). */
export function publishedCatalogDescriptor(
  { registration, entry }: { registration: ToolRegistration; entry: { readonly description?: string; readonly inputSchema?: unknown } },
  _optional: Record<string, never> = {},
): ToolRegistration["descriptor"] {
  const resolved = resolveHostReadRefs({ value: entry }, { hostReads: contentReadVocabulary });
  const catalog = { ...registration.descriptor, description: resolved.description ?? "", inputSchema: resolved.inputSchema as ToolRegistration["descriptor"]["inputSchema"] };
  const [tool] = resolveBatchableTools({ registrations: [{ ...registration, descriptor: catalog }] });
  return tool ? batchDescriptorFor({ descriptor: catalog, tool }) : catalog;
}
