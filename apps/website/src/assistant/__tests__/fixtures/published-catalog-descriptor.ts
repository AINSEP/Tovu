import type { ToolRegistration } from "@jini-ai/core";
import { batchDescriptorFor, resolveBatchableTools } from "../../batch-tool-inputs.js";

/** What the assembly publishes for a catalog entry: the entry itself, plus `items` when the tool is
 *  batchable by default — derived with the REAL `resolveBatchableTools`/`batchDescriptorFor`. */
export function publishedCatalogDescriptor(
  { registration, entry }: { registration: ToolRegistration; entry: { readonly description?: string; readonly inputSchema?: unknown } },
  _optional: Record<string, never> = {},
): ToolRegistration["descriptor"] {
  const catalog = { ...registration.descriptor, description: entry.description ?? "", inputSchema: entry.inputSchema as ToolRegistration["descriptor"]["inputSchema"] };
  const [tool] = resolveBatchableTools({ registrations: [{ ...registration, descriptor: catalog }] });
  return tool ? batchDescriptorFor({ descriptor: catalog, tool }) : catalog;
}
