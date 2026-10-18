import { applyBatchInputs as applyCoreBatchInputs, ToolInputError, type ToolRegistration, type BatchableTool } from '@jini-ai/core';
export { batchDescriptorFor, withBatchInput, DEFAULT_MAX_BATCH_ITEMS, type BatchableTool, type BatchResult, type BatchItemResult } from '@jini-ai/core';

/** Tovu's high-volume tools; batching and per-item normalization belong to Jini. */
export const BATCHABLE_TOOLS: readonly BatchableTool[] = [
  // Read batches reuse each scoped, authorized get handler. Merged cards route `items` to that
  // wrapper before deciding get/list, so an item without an id cannot turn into a list disclosure.
  { toolId: "pages_read_html" },
  { toolId: "forms_get_submission" },
  { toolId: "forms_create_definition" },
  { toolId: "content_post_get" },
  { toolId: "newsletter_get_campaign" },
  { toolId: "redirects_get" },
  { toolId: "widgets_get_instance" },
  { toolId: "widgets_get_region" },
  { toolId: "content_post_create" },
  { toolId: "content_post_update" },
  { toolId: "pages_write_html" },
  { toolId: "media_import_from_url" },
  { toolId: "media_import_local_file" },
  { toolId: "theme_import_file_from_url" },
  { toolId: "theme_import_local_file" },
  { toolId: "theme_read_file", maxItems: 20 },
  { toolId: "theme_write_file" },
  { toolId: "theme_edit_file" },
  { toolId: 'plugin_source_read', maxItems: 20 },
  { toolId: 'plugin_source_write' },
  { toolId: 'plugin_source_edit' },
  // 10 pages x 8,000 characters keeps one result near what a single default fetch used to return.
  { toolId: "web_fetch_page", maxItems: 10, itemDefaults: { maxChars: 8_000 }, validateItem: ({ input }) => {
    if (typeof input === "object" && input !== null && "screenshot" in input && input.screenshot === true) {
      throw new ToolInputError({ message: "web_fetch_page: screenshot is unavailable in batch items; use a single render call with screenshot: true." });
    }
  } },
];

/** Apply the shared batch wrapper using this product's tool selection. */
export function applyBatchInputs(
  { registrations }: { registrations: readonly ToolRegistration[] },
  { tools = BATCHABLE_TOOLS }: { tools?: readonly BatchableTool[] } = {},
): ToolRegistration[] {
  return applyCoreBatchInputs({ registrations }, { tools });
}
